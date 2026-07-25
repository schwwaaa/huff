use crate::output_frame::OutputFrame;
use serde::Serialize;

#[cfg(target_os = "windows")]
mod imp {
    use super::{OutputFrame, Serialize};
    use once_cell::sync::Lazy;
    use std::{
        ffi::CString,
        sync::{
            atomic::{AtomicU64, Ordering},
            Condvar, Mutex, Once,
        },
        thread,
        time::Instant,
    };

    #[link(name = "spout_bridge")]
    extern "C" {
        fn spoutdx_init_sender(name: *const i8, width: i32, height: i32) -> i32;
        fn spoutdx_send_image(pixels: *const u8, width: i32, height: i32) -> i32;
        fn spoutdx_shutdown();
    }

    struct SpoutState {
        width: u32,
        height: u32,
        fps: u32,
    }

    static STATE: Lazy<Mutex<Option<SpoutState>>> = Lazy::new(|| Mutex::new(None));
    static PENDING: Lazy<(Mutex<Option<OutputFrame>>, Condvar)> =
        Lazy::new(|| (Mutex::new(None), Condvar::new()));
    static WORKER: Once = Once::new();
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
        pub width: u32,
        pub height: u32,
        pub fps: u32,
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

    fn clear_pending() {
        PENDING.0.lock().expect("Spout pending lock poisoned").take();
    }

    fn publish(frame: OutputFrame) {
        if !frame.is_valid() {
            REJECTED.fetch_add(1, Ordering::Relaxed);
            return;
        }
        let guard = STATE.lock().expect("Spout state lock poisoned");
        let state = match guard.as_ref() {
            Some(state) if state.width == frame.width && state.height == frame.height => state,
            Some(state) => {
                REJECTED.fetch_add(1, Ordering::Relaxed);
                set_error(format!(
                    "readback {}×{} does not match active Spout {}×{}",
                    frame.width, frame.height, state.width, state.height
                ));
                return;
            }
            None => return,
        };
        let started = Instant::now();
        let ok = unsafe {
            spoutdx_send_image(frame.pixels.as_ptr(), frame.width as i32, frame.height as i32)
        };
        LAST_UPLOAD_US.store(started.elapsed().as_micros() as u64, Ordering::Relaxed);
        LAST_FRAME_AGE_US.store(frame.captured_at.elapsed().as_micros() as u64, Ordering::Relaxed);
        if ok == 1 {
            PUBLISHED.fetch_add(1, Ordering::Relaxed);
        } else {
            REJECTED.fetch_add(1, Ordering::Relaxed);
            set_error("SpoutDX send failed");
        }
    }

    pub fn start_worker() {
        WORKER.call_once(|| {
            thread::Builder::new()
                .name("huff-native-spout".into())
                .spawn(|| loop {
                    let frame = {
                        let mut pending = PENDING.0.lock().expect("Spout pending lock poisoned");
                        while pending.is_none() {
                            pending = PENDING.1.wait(pending).expect("Spout pending wait poisoned");
                        }
                        pending.take().expect("Spout frame vanished")
                    };
                    publish(frame);
                })
                .expect("could not start Spout worker");
        });
    }

    pub fn start(width: u32, height: u32, fps: u32) -> Result<(), String> {
        if width == 0 || height == 0 || width > 8192 || height > 8192 {
            return Err(format!("invalid Spout dimensions: {width}×{height}"));
        }
        let mut guard = STATE.lock().expect("Spout state lock poisoned");
        if guard.take().is_some() {
            unsafe { spoutdx_shutdown() };
        }
        clear_pending();
        let name = CString::new("huff").map_err(|error| error.to_string())?;
        let ok = unsafe { spoutdx_init_sender(name.as_ptr(), width as i32, height as i32) };
        if ok != 1 {
            set_error("SpoutDX sender initialization failed");
            return Err("SpoutDX sender initialization failed".into());
        }
        *guard = Some(SpoutState {
            width,
            height,
            fps: fps.clamp(1, 60),
        });
        RECEIVED.store(0, Ordering::Relaxed);
        PUBLISHED.store(0, Ordering::Relaxed);
        REPLACED.store(0, Ordering::Relaxed);
        REJECTED.store(0, Ordering::Relaxed);
        LAST_UPLOAD_US.store(0, Ordering::Relaxed);
        LAST_FRAME_AGE_US.store(0, Ordering::Relaxed);
        set_error("");
        println!("[spout] native output started — {width}×{height} @ {} fps", fps.clamp(1, 60));
        Ok(())
    }

    pub fn stop() {
        clear_pending();
        if STATE.lock().expect("Spout state lock poisoned").take().is_some() {
            unsafe { spoutdx_shutdown() };
            println!("[spout] native output stopped");
        }
    }

    pub fn submit(frame: OutputFrame) {
        RECEIVED.fetch_add(1, Ordering::Relaxed);
        let mut pending = PENDING.0.lock().expect("Spout pending lock poisoned");
        if pending.replace(frame).is_some() {
            REPLACED.fetch_add(1, Ordering::Relaxed);
        }
        PENDING.1.notify_one();
    }

    pub fn info() -> SpoutInfo {
        let guard = STATE.lock().expect("Spout state lock poisoned");
        let (active, width, height, fps) = guard
            .as_ref()
            .map(|state| (true, state.width, state.height, state.fps))
            .unwrap_or((false, 0, 0, 0));
        SpoutInfo {
            available: true,
            active,
            width,
            height,
            fps,
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
    pub struct SpoutInfo {
        pub available: bool,
        pub active: bool,
        pub width: u32,
        pub height: u32,
        pub fps: u32,
        pub received_frames: u64,
        pub published_frames: u64,
        pub replaced_frames: u64,
        pub rejected_frames: u64,
        pub last_upload_us: u64,
        pub last_frame_age_ms: f64,
        pub last_error: String,
    }

    pub fn start_worker() {}
    pub fn start(_width: u32, _height: u32, _fps: u32) -> Result<(), String> {
        Err("Spout is available only on Windows".into())
    }
    pub fn stop() {}
    pub fn submit(_frame: OutputFrame) {}
    pub fn info() -> SpoutInfo {
        SpoutInfo {
            available: false,
            active: false,
            width: 0,
            height: 0,
            fps: 0,
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

pub use imp::{info, start, start_worker, stop, submit, SpoutInfo};
