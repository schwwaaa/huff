use serde::Serialize;
use std::{
    ffi::{c_char, c_void, CStr},
    panic::{catch_unwind, AssertUnwindSafe},
    ptr,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender},
        Arc, Mutex, RwLock,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Debug)]
pub struct CameraFrame {
    pub sequence: u64,
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub captured_at: Instant,
}

pub type SharedCameraFrame = Arc<RwLock<Option<Arc<CameraFrame>>>>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraDevice {
    pub slot: usize,
    pub name: String,
    pub index: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraStatus {
    pub permission: String,
    pub backend: String,
    pub streaming: bool,
    pub selected_slot: Option<usize>,
    pub selected_name: String,
    pub profile: String,
    pub width: u32,
    pub height: u32,
    pub requested_fps: u32,
    pub source_format: String,
    pub capture_fps: f64,
    pub capture_wait_ms: f64,
    pub decode_ms: f64,
    pub decoded_frames: u64,
    pub decode_errors: u64,
    pub recycled_buffers: u64,
    pub format_candidates: u32,
    pub dropped_by_capture: u64,
    pub last_error: String,
}

impl Default for CameraStatus {
    fn default() -> Self {
        Self {
            permission: "pending".into(),
            backend: "AVFoundation (direct)".into(),
            streaming: false,
            selected_slot: None,
            selected_name: String::new(),
            profile: "lowLatency".into(),
            width: 0,
            height: 0,
            requested_fps: 0,
            source_format: "BGRA".into(),
            capture_fps: 0.0,
            capture_wait_ms: 0.0,
            decode_ms: 0.0,
            decoded_frames: 0,
            decode_errors: 0,
            recycled_buffers: 0,
            format_candidates: 0,
            dropped_by_capture: 0,
            last_error: String::new(),
        }
    }
}

#[derive(Debug)]
enum CameraCommand {
    Refresh,
    Start { slot: usize, profile: String },
    Stop,
    Shutdown,
}

#[derive(Clone)]
pub struct CameraHandle {
    tx: SyncSender<CameraCommand>,
    status: Arc<RwLock<CameraStatus>>,
    devices: Arc<RwLock<Vec<CameraDevice>>>,
    latest: SharedCameraFrame,
}

impl CameraHandle {
    pub fn status(&self) -> CameraStatus {
        self.status.read().expect("camera status poisoned").clone()
    }

    pub fn devices(&self) -> Vec<CameraDevice> {
        self.devices.read().expect("camera devices poisoned").clone()
    }

    pub fn refresh(&self) {
        let _ = self.tx.try_send(CameraCommand::Refresh);
    }

    pub fn start_camera(&self, slot: usize, profile: String) {
        let _ = self.tx.try_send(CameraCommand::Start { slot, profile });
    }

    pub fn stop_camera(&self) {
        let _ = self.tx.try_send(CameraCommand::Stop);
    }

    pub fn shutdown(&self) {
        let _ = self.tx.try_send(CameraCommand::Shutdown);
    }

    pub fn frame_source(&self) -> SharedCameraFrame {
        Arc::clone(&self.latest)
    }
}

#[derive(Default)]
struct CallbackState {
    sequence: u64,
    frames_in_window: u64,
    metrics_started: Option<Instant>,
    last_callback: Option<Instant>,
    scratch: Vec<u8>,
}

struct CallbackContext {
    latest: SharedCameraFrame,
    status: Arc<RwLock<CameraStatus>>,
    state: Mutex<CallbackState>,
    accepting_frames: AtomicBool,
}

type FrameCallback = unsafe extern "C" fn(
    bytes: *const u8,
    length: usize,
    width: u32,
    height: u32,
    bytes_per_row: usize,
    presentation_seconds: f64,
    context: *mut c_void,
);

unsafe extern "C" {
    fn jp_avf_request_access();
    fn jp_avf_authorization_status() -> i32;
    fn jp_avf_camera_count() -> usize;
    fn jp_avf_camera_name(index: usize, buffer: *mut c_char, capacity: usize) -> usize;
    fn jp_avf_camera_unique_id(index: usize, buffer: *mut c_char, capacity: usize) -> usize;
    fn jp_avf_start_camera(
        index: usize,
        profile: i32,
        callback: FrameCallback,
        context: *mut c_void,
        error_buffer: *mut c_char,
        error_capacity: usize,
    ) -> i32;
    fn jp_avf_stop_camera();
    fn jp_avf_selected_width() -> u32;
    fn jp_avf_selected_height() -> u32;
    fn jp_avf_selected_fps() -> f64;
    fn jp_avf_selected_format_count() -> u32;
    fn jp_avf_dropped_frames() -> u64;
}

pub fn start() -> Result<CameraHandle, String> {
    let (tx, rx) = sync_channel(64);
    let status = Arc::new(RwLock::new(CameraStatus::default()));
    let devices = Arc::new(RwLock::new(Vec::new()));
    let latest = Arc::new(RwLock::new(None));
    let context = Arc::new(CallbackContext {
        latest: Arc::clone(&latest),
        status: Arc::clone(&status),
        state: Mutex::new(CallbackState::default()),
        accepting_frames: AtomicBool::new(false),
    });

    let thread_status = Arc::clone(&status);
    let thread_devices = Arc::clone(&devices);
    let thread_latest = Arc::clone(&latest);
    let thread_context = Arc::clone(&context);

    thread::Builder::new()
        .name("huff-avfoundation-camera".into())
        .spawn(move || {
            camera_loop(
                rx,
                thread_status,
                thread_devices,
                thread_latest,
                thread_context,
            )
        })
        .map_err(|error| format!("could not start AVFoundation camera thread: {error}"))?;

    Ok(CameraHandle {
        tx,
        status,
        devices,
        latest,
    })
}

fn camera_loop(
    rx: Receiver<CameraCommand>,
    status: Arc<RwLock<CameraStatus>>,
    devices: Arc<RwLock<Vec<CameraDevice>>>,
    latest: SharedCameraFrame,
    context: Arc<CallbackContext>,
) {
    unsafe { jp_avf_request_access() };
    let mut permission_was_authorized = false;
    let mut allow_automatic_start = true;
    let context_ptr = Arc::as_ptr(&context) as *mut c_void;
    let mut running = true;

    while running {
        let authorization = unsafe { jp_avf_authorization_status() };
        let permission_text = match authorization {
            3 => "granted",
            2 => "denied",
            1 => "restricted",
            _ => "pending",
        };
        if let Ok(mut shared) = status.write() {
            shared.permission = permission_text.into();
            shared.dropped_by_capture = unsafe { jp_avf_dropped_frames() };
            if authorization == 2 {
                shared.last_error = "Camera permission was denied. Enable it in System Settings → Privacy & Security → Camera, then restart the app.".into();
            }
        }

        if authorization == 3 && !permission_was_authorized {
            permission_was_authorized = true;
            refresh_devices(&devices, &status);
            if allow_automatic_start
                && !devices.read().map(|items| items.is_empty()).unwrap_or(true)
            {
                if let Err(error) = open_camera(0, "lowLatency", &status, &context, context_ptr) {
                    set_error(&status, error);
                }
            }
        }

        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(CameraCommand::Refresh) => {
                allow_automatic_start = false;
                stop_camera(&latest, &status, &context);
                if authorization == 3 {
                    refresh_devices(&devices, &status);
                }
            }
            Ok(CameraCommand::Start { slot, profile }) => {
                allow_automatic_start = false;
                stop_camera(&latest, &status, &context);
                if authorization != 3 {
                    set_error(&status, "Camera permission is not granted yet.".into());
                    continue;
                }
                if let Err(error) = open_camera(slot, &profile, &status, &context, context_ptr) {
                    set_error(&status, error);
                }
            }
            Ok(CameraCommand::Stop) => {
                allow_automatic_start = false;
                stop_camera(&latest, &status, &context);
            }
            Ok(CameraCommand::Shutdown) => {
                stop_camera(&latest, &status, &context);
                running = false;
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                stop_camera(&latest, &status, &context);
                running = false;
            }
        }
    }
}

fn refresh_devices(
    devices: &Arc<RwLock<Vec<CameraDevice>>>,
    status: &Arc<RwLock<CameraStatus>>,
) {
    let count = unsafe { jp_avf_camera_count() };
    let mut found = Vec::with_capacity(count);
    for slot in 0..count {
        let name = ffi_string(|buffer, capacity| unsafe {
            jp_avf_camera_name(slot, buffer, capacity)
        });
        let unique_id = ffi_string(|buffer, capacity| unsafe {
            jp_avf_camera_unique_id(slot, buffer, capacity)
        });
        found.push(CameraDevice {
            slot,
            name: if name.is_empty() {
                format!("Camera {slot}")
            } else {
                name.clone()
            },
            index: unique_id.clone(),
            description: if unique_id.is_empty() {
                "AVFoundation video device".into()
            } else {
                format!("AVFoundation · {unique_id}")
            },
        });
    }
    if let Ok(mut shared) = devices.write() {
        *shared = found;
    }
    if let Ok(mut shared) = status.write() {
        if count == 0 {
            shared.last_error = "AVFoundation reported no video capture devices.".into();
        } else {
            shared.last_error.clear();
        }
    }
}

fn open_camera(
    slot: usize,
    profile: &str,
    status: &Arc<RwLock<CameraStatus>>,
    context: &Arc<CallbackContext>,
    context_ptr: *mut c_void,
) -> Result<(), String> {
    context.accepting_frames.store(false, Ordering::Release);
    reset_callback_state(context);

    let profile_id = match profile {
        "lowLatency" => 0,
        "balanced" => 1,
        "speed" => 2,
        "quality" => 3,
        _ => return Err(format!("unknown camera profile: {profile}")),
    };

    let mut error_buffer = vec![0i8; 1024];
    let result = unsafe {
        jp_avf_start_camera(
            slot,
            profile_id,
            frame_callback,
            context_ptr,
            error_buffer.as_mut_ptr(),
            error_buffer.len(),
        )
    };
    if result != 0 {
        let message = unsafe { CStr::from_ptr(error_buffer.as_ptr()) }
            .to_string_lossy()
            .trim()
            .to_string();
        return Err(if message.is_empty() {
            format!("AVFoundation could not start camera slot {slot}.")
        } else {
            message
        });
    }

    let name = ffi_string(|buffer, capacity| unsafe {
        jp_avf_camera_name(slot, buffer, capacity)
    });
    let width = unsafe { jp_avf_selected_width() };
    let height = unsafe { jp_avf_selected_height() };
    let fps = unsafe { jp_avf_selected_fps() };
    let format_count = unsafe { jp_avf_selected_format_count() };

    context.accepting_frames.store(true, Ordering::Release);
    if let Ok(mut shared) = status.write() {
        shared.streaming = true;
        shared.selected_slot = Some(slot);
        shared.selected_name = name;
        shared.profile = profile.into();
        shared.width = width;
        shared.height = height;
        shared.requested_fps = fps.round().max(1.0) as u32;
        shared.source_format = "32BGRA CVPixelBuffer".into();
        shared.format_candidates = format_count;
        shared.dropped_by_capture = 0;
        shared.capture_fps = 0.0;
        shared.capture_wait_ms = 0.0;
        shared.decode_ms = 0.0;
        shared.decoded_frames = 0;
        shared.decode_errors = 0;
        shared.last_error.clear();
    }
    Ok(())
}

fn stop_camera(
    latest: &SharedCameraFrame,
    status: &Arc<RwLock<CameraStatus>>,
    context: &Arc<CallbackContext>,
) {
    context.accepting_frames.store(false, Ordering::Release);
    unsafe { jp_avf_stop_camera() };
    if let Ok(mut shared) = latest.write() {
        *shared = None;
    }
    reset_callback_state(context);
    if let Ok(mut shared) = status.write() {
        shared.streaming = false;
        shared.capture_fps = 0.0;
    }
}

fn reset_callback_state(context: &Arc<CallbackContext>) {
    if let Ok(mut state) = context.state.lock() {
        state.sequence = 0;
        state.frames_in_window = 0;
        state.metrics_started = Some(Instant::now());
        state.last_callback = None;
        state.scratch.clear();
    }
}

unsafe extern "C" fn frame_callback(
    bytes: *const u8,
    length: usize,
    width: u32,
    height: u32,
    bytes_per_row: usize,
    _presentation_seconds: f64,
    context: *mut c_void,
) {
    let _ = catch_unwind(AssertUnwindSafe(|| {
        if context.is_null() || bytes.is_null() || width == 0 || height == 0 {
            return;
        }
        let context = unsafe { &*(context as *const CallbackContext) };
        if !context.accepting_frames.load(Ordering::Acquire) {
            return;
        }

        let callback_started = Instant::now();
        let required_row = width as usize * 4;
        let required_length = required_row.saturating_mul(height as usize);
        if bytes_per_row < required_row
            || length < bytes_per_row.saturating_mul(height as usize)
        {
            if let Ok(mut shared) = context.status.write() {
                shared.decode_errors += 1;
                shared.last_error = format!(
                    "AVFoundation delivered an invalid BGRA buffer: {}×{}, row stride {}, length {}.",
                    width, height, bytes_per_row, length
                );
            }
            return;
        }

        let now = Instant::now();
        let mut state = match context.state.lock() {
            Ok(state) => state,
            Err(_) => return,
        };
        let interval_ms = state
            .last_callback
            .map(|previous| now.duration_since(previous).as_secs_f64() * 1000.0)
            .unwrap_or(0.0);
        state.last_callback = Some(now);
        if state.metrics_started.is_none() {
            state.metrics_started = Some(now);
        }
        if state.scratch.len() != required_length {
            state.scratch.resize(required_length, 0);
        }

        let copy_started = Instant::now();
        if bytes_per_row == required_row {
            let source = unsafe { std::slice::from_raw_parts(bytes, required_length) };
            state.scratch.copy_from_slice(source);
        } else {
            for row in 0..height as usize {
                let source = unsafe {
                    std::slice::from_raw_parts(bytes.add(row * bytes_per_row), required_row)
                };
                let destination =
                    &mut state.scratch[row * required_row..(row + 1) * required_row];
                destination.copy_from_slice(source);
            }
        }
        let copy_ms = copy_started.elapsed().as_secs_f64() * 1000.0;

        state.sequence += 1;
        state.frames_in_window += 1;
        let sequence = state.sequence;
        let rgba = std::mem::take(&mut state.scratch);
        let published = Arc::new(CameraFrame {
            sequence,
            width,
            height,
            rgba,
            captured_at: callback_started,
        });
        let previous = context
            .latest
            .write()
            .ok()
            .and_then(|mut shared| shared.replace(published));
        state.scratch = previous
            .and_then(|frame| Arc::try_unwrap(frame).ok())
            .map(|frame| frame.rgba)
            .unwrap_or_else(|| Vec::with_capacity(required_length));
        if state.scratch.len() != required_length {
            state.scratch.resize(required_length, 0);
        }

        let mut fps = None;
        if let Some(started) = state.metrics_started {
            let elapsed = started.elapsed();
            if elapsed >= Duration::from_millis(750) {
                fps = Some(state.frames_in_window as f64 / elapsed.as_secs_f64());
                state.frames_in_window = 0;
                state.metrics_started = Some(Instant::now());
            }
        }
        drop(state);

        if let Ok(mut shared) = context.status.write() {
            shared.width = width;
            shared.height = height;
            shared.decoded_frames = sequence;
            shared.capture_wait_ms = ema(shared.capture_wait_ms, interval_ms, 0.15);
            shared.decode_ms = ema(shared.decode_ms, copy_ms, 0.15);
            shared.recycled_buffers += 1;
            shared.dropped_by_capture = unsafe { jp_avf_dropped_frames() };
            if let Some(fps) = fps {
                shared.capture_fps = fps;
            }
            shared.last_error.clear();
        }
    }));
}

fn ffi_string(mut getter: impl FnMut(*mut c_char, usize) -> usize) -> String {
    let required = getter(ptr::null_mut(), 0);
    if required == 0 {
        return String::new();
    }
    let mut bytes = vec![0i8; required + 1];
    getter(bytes.as_mut_ptr(), bytes.len());
    unsafe { CStr::from_ptr(bytes.as_ptr()) }
        .to_string_lossy()
        .into_owned()
}

fn set_error(status: &Arc<RwLock<CameraStatus>>, error: String) {
    if let Ok(mut shared) = status.write() {
        shared.last_error = error;
        shared.streaming = false;
    }
}

fn ema(previous: f64, sample: f64, alpha: f64) -> f64 {
    if previous <= 0.0 {
        sample
    } else {
        previous + (sample - previous) * alpha
    }
}
