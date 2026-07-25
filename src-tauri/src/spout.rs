use crate::output_frame::OutputFrame;
use serde::Serialize;

#[cfg(target_os = "windows")]
mod imp {
    use super::{OutputFrame, Serialize};
    use once_cell::sync::Lazy;
    use std::{
        collections::VecDeque,
        ffi::{CStr, CString},
        os::raw::{c_char, c_int},
        sync::{
            atomic::{AtomicBool, AtomicU64, Ordering},
            mpsc::{sync_channel, SyncSender},
            Condvar, Mutex, Once,
        },
        thread,
        time::{Duration, Instant},
    };

    extern "C" {
        fn spoutdx_get_adapter_count() -> c_int;
        fn spoutdx_get_adapter_name(index: c_int, buffer: *mut c_char, buffer_len: c_int) -> c_int;
        fn spoutdx_init_sender(
            name: *const c_char,
            width: c_int,
            height: c_int,
            adapter_index: c_int,
        ) -> c_int;
        fn spoutdx_send_image(
            pixels: *const u8,
            width: c_int,
            height: c_int,
            pitch: c_int,
        ) -> c_int;
        fn spoutdx_get_sender_name(buffer: *mut c_char, buffer_len: c_int) -> c_int;
        fn spoutdx_get_active_adapter() -> c_int;
        fn spoutdx_get_active_adapter_name(buffer: *mut c_char, buffer_len: c_int) -> c_int;
        fn spoutdx_get_sender_fps() -> f64;
        fn spoutdx_get_sender_frame() -> i64;
        fn spoutdx_is_initialized() -> c_int;
        fn spoutdx_get_last_error(buffer: *mut c_char, buffer_len: c_int) -> c_int;
        fn spoutdx_shutdown();
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SpoutAdapter {
        pub index: i32,
        pub name: String,
    }

    #[derive(Debug, Clone)]
    struct SpoutConfig {
        width: u32,
        height: u32,
        fps: u32,
        adapter_index: i32,
    }

    #[derive(Debug, Clone)]
    struct SpoutState {
        config: SpoutConfig,
        initialized: bool,
        sender_name: String,
        adapter_name: String,
        sender_fps: f64,
        sender_frame: i64,
    }

    enum WorkerCommand {
        Start {
            config: SpoutConfig,
            reply: SyncSender<Result<(), String>>,
        },
        Stop {
            reply: SyncSender<()>,
        },
        ListAdapters {
            reply: SyncSender<Result<Vec<SpoutAdapter>, String>>,
        },
    }

    #[derive(Default)]
    struct WorkerQueue {
        commands: VecDeque<WorkerCommand>,
        pending_frame: Option<OutputFrame>,
    }

    static STATE: Lazy<Mutex<Option<SpoutState>>> = Lazy::new(|| Mutex::new(None));
    static QUEUE: Lazy<(Mutex<WorkerQueue>, Condvar)> =
        Lazy::new(|| (Mutex::new(WorkerQueue::default()), Condvar::new()));
    static WORKER: Once = Once::new();
    static WORKER_ALIVE: AtomicBool = AtomicBool::new(false);
    static LAST_ERROR: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::new()));
    static RECEIVED: AtomicU64 = AtomicU64::new(0);
    static PUBLISHED: AtomicU64 = AtomicU64::new(0);
    static REPLACED: AtomicU64 = AtomicU64::new(0);
    static REJECTED: AtomicU64 = AtomicU64::new(0);
    static LAST_UPLOAD_US: AtomicU64 = AtomicU64::new(0);
    static LAST_FRAME_AGE_US: AtomicU64 = AtomicU64::new(0);

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SpoutInfo {
        pub available: bool,
        pub active: bool,
        pub initialized: bool,
        pub worker_alive: bool,
        pub sender_name: String,
        pub adapter_index: i32,
        pub adapter_name: String,
        pub width: u32,
        pub height: u32,
        pub fps: u32,
        pub sender_fps: f64,
        pub sender_frame: i64,
        pub received_frames: u64,
        pub published_frames: u64,
        pub replaced_frames: u64,
        pub rejected_frames: u64,
        pub last_upload_us: u64,
        pub last_frame_age_ms: f64,
        pub last_error: String,
    }

    fn set_error(error: impl Into<String>) {
        *LAST_ERROR.lock().expect("Spout error lock poisoned") = error.into();
    }

    fn ffi_buffer_to_string(buffer: &[c_char]) -> String {
        unsafe { CStr::from_ptr(buffer.as_ptr()) }
            .to_string_lossy()
            .trim()
            .to_string()
    }

    fn bridge_last_error() -> String {
        let mut buffer = [0 as c_char; 1024];
        unsafe {
            spoutdx_get_last_error(buffer.as_mut_ptr(), buffer.len() as c_int);
        }
        ffi_buffer_to_string(&buffer)
    }

    fn bridge_sender_name() -> String {
        let mut buffer = [0 as c_char; 512];
        unsafe {
            spoutdx_get_sender_name(buffer.as_mut_ptr(), buffer.len() as c_int);
        }
        let name = ffi_buffer_to_string(&buffer);
        if name.is_empty() { "huff".into() } else { name }
    }

    fn bridge_adapter_name() -> String {
        let mut buffer = [0 as c_char; 512];
        unsafe {
            spoutdx_get_active_adapter_name(buffer.as_mut_ptr(), buffer.len() as c_int);
        }
        ffi_buffer_to_string(&buffer)
    }

    fn bridge_adapters() -> Result<Vec<SpoutAdapter>, String> {
        let count = unsafe { spoutdx_get_adapter_count() }.clamp(0, 64);
        let mut adapters = Vec::with_capacity(count as usize);
        for index in 0..count {
            let mut buffer = [0 as c_char; 512];
            let ok = unsafe {
                spoutdx_get_adapter_name(index, buffer.as_mut_ptr(), buffer.len() as c_int)
            };
            if ok == 1 {
                let name = ffi_buffer_to_string(&buffer);
                adapters.push(SpoutAdapter {
                    index,
                    name: if name.is_empty() {
                        format!("DirectX adapter {index}")
                    } else {
                        name
                    },
                });
            }
        }
        if count > 0 && adapters.is_empty() {
            Err("Spout found graphics adapters but could not read their names".into())
        } else {
            Ok(adapters)
        }
    }

    fn bridge_start(config: &SpoutConfig) -> Result<SpoutState, String> {
        let name = CString::new("huff").map_err(|error| error.to_string())?;
        let ok = unsafe {
            spoutdx_init_sender(
                name.as_ptr(),
                config.width as c_int,
                config.height as c_int,
                config.adapter_index as c_int,
            )
        };
        if ok != 1 {
            let detail = bridge_last_error();
            return Err(if detail.is_empty() {
                "SpoutDX sender initialization failed".into()
            } else {
                detail
            });
        }
        Ok(SpoutState {
            config: config.clone(),
            initialized: unsafe { spoutdx_is_initialized() == 1 },
            sender_name: bridge_sender_name(),
            adapter_name: bridge_adapter_name(),
            sender_fps: unsafe { spoutdx_get_sender_fps() },
            sender_frame: unsafe { spoutdx_get_sender_frame() },
        })
    }

    fn refresh_bridge_metadata(state: &mut SpoutState) {
        state.initialized = unsafe { spoutdx_is_initialized() == 1 };
        state.sender_name = bridge_sender_name();
        state.config.adapter_index = unsafe { spoutdx_get_active_adapter() };
        state.adapter_name = bridge_adapter_name();
        state.sender_fps = unsafe { spoutdx_get_sender_fps() };
        state.sender_frame = unsafe { spoutdx_get_sender_frame() };
    }

    fn publish(frame: OutputFrame) {
        if !frame.is_valid() {
            REJECTED.fetch_add(1, Ordering::Relaxed);
            set_error("invalid RGBA frame received by Spout worker");
            return;
        }

        let config = {
            let guard = STATE.lock().expect("Spout state lock poisoned");
            match guard.as_ref() {
                Some(state) => state.config.clone(),
                None => return,
            }
        };
        if config.width != frame.width || config.height != frame.height {
            REJECTED.fetch_add(1, Ordering::Relaxed);
            set_error(format!(
                "readback {}×{} does not match active Spout {}×{}",
                frame.width, frame.height, config.width, config.height
            ));
            return;
        }

        let pitch = frame.width.saturating_mul(4);
        if pitch > c_int::MAX as u32 {
            REJECTED.fetch_add(1, Ordering::Relaxed);
            set_error("Spout row pitch exceeds the bridge limit");
            return;
        }

        let started = Instant::now();
        let ok = unsafe {
            spoutdx_send_image(
                frame.pixels.as_ptr(),
                frame.width as c_int,
                frame.height as c_int,
                pitch as c_int,
            )
        };
        LAST_UPLOAD_US.store(started.elapsed().as_micros() as u64, Ordering::Relaxed);
        LAST_FRAME_AGE_US.store(frame.captured_at.elapsed().as_micros() as u64, Ordering::Relaxed);

        if ok == 1 {
            let published = PUBLISHED.fetch_add(1, Ordering::Relaxed) + 1;
            if published == 1 || published % 30 == 0 {
                if let Some(state) = STATE.lock().expect("Spout state lock poisoned").as_mut() {
                    refresh_bridge_metadata(state);
                }
            }
            set_error("");
        } else {
            REJECTED.fetch_add(1, Ordering::Relaxed);
            let detail = bridge_last_error();
            set_error(if detail.is_empty() {
                "SpoutDX SendImage failed".into()
            } else {
                detail
            });
        }
    }

    fn worker_loop() {
        WORKER_ALIVE.store(true, Ordering::Release);
        loop {
            enum Work {
                Command(WorkerCommand),
                Frame(OutputFrame),
            }
            let work = {
                let mut queue = QUEUE.0.lock().expect("Spout queue lock poisoned");
                while queue.commands.is_empty() && queue.pending_frame.is_none() {
                    queue = QUEUE.1.wait(queue).expect("Spout queue wait poisoned");
                }
                if let Some(command) = queue.commands.pop_front() {
                    Work::Command(command)
                } else {
                    Work::Frame(queue.pending_frame.take().expect("Spout frame vanished"))
                }
            };

            match work {
                Work::Command(WorkerCommand::Start { config, reply }) => {
                    unsafe { spoutdx_shutdown() };
                    QUEUE
                        .0
                        .lock()
                        .expect("Spout queue lock poisoned")
                        .pending_frame
                        .take();
                    let result = bridge_start(&config);
                    match &result {
                        Ok(state) => {
                            *STATE.lock().expect("Spout state lock poisoned") = Some(state.clone());
                            RECEIVED.store(0, Ordering::Relaxed);
                            PUBLISHED.store(0, Ordering::Relaxed);
                            REPLACED.store(0, Ordering::Relaxed);
                            REJECTED.store(0, Ordering::Relaxed);
                            LAST_UPLOAD_US.store(0, Ordering::Relaxed);
                            LAST_FRAME_AGE_US.store(0, Ordering::Relaxed);
                            set_error("");
                            println!(
                                "[spout] sender armed — {}×{} @ {} fps · adapter {} ({})",
                                config.width,
                                config.height,
                                config.fps,
                                state.config.adapter_index,
                                if state.adapter_name.is_empty() { "default" } else { &state.adapter_name }
                            );
                        }
                        Err(error) => {
                            *STATE.lock().expect("Spout state lock poisoned") = None;
                            set_error(error.clone());
                        }
                    }
                    let _ = reply.send(result.map(|_| ()));
                }
                Work::Command(WorkerCommand::Stop { reply }) => {
                    unsafe { spoutdx_shutdown() };
                    *STATE.lock().expect("Spout state lock poisoned") = None;
                    QUEUE
                        .0
                        .lock()
                        .expect("Spout queue lock poisoned")
                        .pending_frame
                        .take();
                    set_error("");
                    println!("[spout] native output stopped");
                    let _ = reply.send(());
                }
                Work::Command(WorkerCommand::ListAdapters { reply }) => {
                    let _ = reply.send(bridge_adapters());
                }
                Work::Frame(frame) => publish(frame),
            }
        }
    }

    pub fn start_worker() {
        WORKER.call_once(|| {
            thread::Builder::new()
                .name("huff-native-spout".into())
                .spawn(worker_loop)
                .expect("could not start Spout worker");
        });
    }

    fn enqueue_command(command: WorkerCommand) {
        let mut queue = QUEUE.0.lock().expect("Spout queue lock poisoned");
        queue.commands.push_back(command);
        QUEUE.1.notify_one();
    }

    pub fn adapters() -> Result<Vec<SpoutAdapter>, String> {
        start_worker();
        let (reply_tx, reply_rx) = sync_channel(1);
        enqueue_command(WorkerCommand::ListAdapters { reply: reply_tx });
        reply_rx
            .recv_timeout(Duration::from_secs(3))
            .map_err(|_| "timed out enumerating Spout graphics adapters".to_string())?
    }

    pub fn start(width: u32, height: u32, fps: u32, adapter_index: i32) -> Result<(), String> {
        if width == 0 || height == 0 || width > 8192 || height > 8192 {
            return Err(format!("invalid Spout dimensions: {width}×{height}"));
        }
        start_worker();
        let (reply_tx, reply_rx) = sync_channel(1);
        enqueue_command(WorkerCommand::Start {
            config: SpoutConfig {
                width,
                height,
                fps: fps.clamp(1, 60),
                adapter_index,
            },
            reply: reply_tx,
        });
        reply_rx
            .recv_timeout(Duration::from_secs(6))
            .map_err(|_| "timed out starting the Spout worker".to_string())?
    }

    pub fn stop() {
        if !WORKER_ALIVE.load(Ordering::Acquire) {
            return;
        }
        let (reply_tx, reply_rx) = sync_channel(1);
        enqueue_command(WorkerCommand::Stop { reply: reply_tx });
        let _ = reply_rx.recv_timeout(Duration::from_secs(3));
    }

    pub fn submit(frame: OutputFrame) {
        if STATE.lock().expect("Spout state lock poisoned").is_none() {
            return;
        }
        RECEIVED.fetch_add(1, Ordering::Relaxed);
        let mut queue = QUEUE.0.lock().expect("Spout queue lock poisoned");
        if queue.pending_frame.replace(frame).is_some() {
            REPLACED.fetch_add(1, Ordering::Relaxed);
        }
        QUEUE.1.notify_one();
    }

    pub fn info() -> SpoutInfo {
        let guard = STATE.lock().expect("Spout state lock poisoned");
        let state = guard.as_ref();
        SpoutInfo {
            available: true,
            active: state.is_some(),
            initialized: state.map(|value| value.initialized).unwrap_or(false),
            worker_alive: WORKER_ALIVE.load(Ordering::Acquire),
            sender_name: state
                .map(|value| value.sender_name.clone())
                .unwrap_or_else(|| "huff".into()),
            adapter_index: state.map(|value| value.config.adapter_index).unwrap_or(-1),
            adapter_name: state
                .map(|value| value.adapter_name.clone())
                .unwrap_or_default(),
            width: state.map(|value| value.config.width).unwrap_or(0),
            height: state.map(|value| value.config.height).unwrap_or(0),
            fps: state.map(|value| value.config.fps).unwrap_or(0),
            sender_fps: state.map(|value| value.sender_fps).unwrap_or(0.0),
            sender_frame: state.map(|value| value.sender_frame).unwrap_or(0),
            received_frames: RECEIVED.load(Ordering::Relaxed),
            published_frames: PUBLISHED.load(Ordering::Relaxed),
            replaced_frames: REPLACED.load(Ordering::Relaxed),
            rejected_frames: REJECTED.load(Ordering::Relaxed),
            last_upload_us: LAST_UPLOAD_US.load(Ordering::Relaxed),
            last_frame_age_ms: LAST_FRAME_AGE_US.load(Ordering::Relaxed) as f64 / 1000.0,
            last_error: LAST_ERROR.lock().expect("Spout error lock poisoned").clone(),
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::{OutputFrame, Serialize};

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SpoutAdapter {
        pub index: i32,
        pub name: String,
    }

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SpoutInfo {
        pub available: bool,
        pub active: bool,
        pub initialized: bool,
        pub worker_alive: bool,
        pub sender_name: String,
        pub adapter_index: i32,
        pub adapter_name: String,
        pub width: u32,
        pub height: u32,
        pub fps: u32,
        pub sender_fps: f64,
        pub sender_frame: i64,
        pub received_frames: u64,
        pub published_frames: u64,
        pub replaced_frames: u64,
        pub rejected_frames: u64,
        pub last_upload_us: u64,
        pub last_frame_age_ms: f64,
        pub last_error: String,
    }

    pub fn start_worker() {}
    pub fn adapters() -> Result<Vec<SpoutAdapter>, String> {
        Err("Spout is available only on Windows".into())
    }
    pub fn start(_width: u32, _height: u32, _fps: u32, _adapter_index: i32) -> Result<(), String> {
        Err("Spout is available only on Windows".into())
    }
    pub fn stop() {}
    pub fn submit(_frame: OutputFrame) {}
    pub fn info() -> SpoutInfo {
        SpoutInfo {
            available: false,
            active: false,
            initialized: false,
            worker_alive: false,
            sender_name: "huff".into(),
            adapter_index: -1,
            adapter_name: String::new(),
            width: 0,
            height: 0,
            fps: 0,
            sender_fps: 0.0,
            sender_frame: 0,
            received_frames: 0,
            published_frames: 0,
            replaced_frames: 0,
            rejected_frames: 0,
            last_upload_us: 0,
            last_frame_age_ms: 0.0,
            last_error: "Spout is available only on Windows".into(),
        }
    }
}

pub use imp::{adapters, info, start, start_worker, stop, submit, SpoutAdapter, SpoutInfo};
