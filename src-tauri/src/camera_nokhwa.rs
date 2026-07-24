use nokhwa::{
    pixel_format::RgbAFormat,
    query,
    utils::{
        ApiBackend, CameraFormat, CameraInfo, FrameFormat, RequestedFormat,
        RequestedFormatType,
    },
    Camera,
};
use serde::Serialize;
use std::{
    cmp::Ordering as CmpOrdering,
    sync::{
        atomic::{AtomicBool, AtomicI8, Ordering},
        mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender, TryRecvError},
        Arc, RwLock,
    },
    thread,
    time::{Duration, Instant},
};

const DECODABLE_FORMATS: &[FrameFormat] = &[
    FrameFormat::MJPEG,
    FrameFormat::NV12,
    FrameFormat::YUYV,
    FrameFormat::RAWRGB,
    FrameFormat::RAWBGR,
];

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
    pub last_error: String,
}

impl Default for CameraStatus {
    fn default() -> Self {
        Self {
            permission: "pending".into(),
            backend: format!("{:?}", nokhwa::native_api_backend()),
            streaming: false,
            selected_slot: None,
            selected_name: String::new(),
            profile: "lowLatency".into(),
            width: 0,
            height: 0,
            requested_fps: 0,
            source_format: String::new(),
            capture_fps: 0.0,
            capture_wait_ms: 0.0,
            decode_ms: 0.0,
            decoded_frames: 0,
            decode_errors: 0,
            recycled_buffers: 0,
            format_candidates: 0,
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

pub fn start() -> Result<CameraHandle, String> {
    let (tx, rx) = sync_channel(64);
    let status = Arc::new(RwLock::new(CameraStatus::default()));
    let devices = Arc::new(RwLock::new(Vec::new()));
    let latest = Arc::new(RwLock::new(None));
    let permission = Arc::new(AtomicI8::new(-1));
    let alive = Arc::new(AtomicBool::new(true));

    let permission_callback = Arc::clone(&permission);
    nokhwa::nokhwa_initialize(move |granted| {
        permission_callback.store(if granted { 1 } else { 0 }, Ordering::Release);
    });

    let thread_status = Arc::clone(&status);
    let thread_devices = Arc::clone(&devices);
    let thread_latest = Arc::clone(&latest);
    let thread_permission = Arc::clone(&permission);
    let thread_alive = Arc::clone(&alive);

    thread::Builder::new()
        .name("huff-native-camera".into())
        .spawn(move || {
            camera_loop(
                rx,
                thread_status,
                thread_devices,
                thread_latest,
                thread_permission,
                thread_alive,
            )
        })
        .map_err(|error| format!("could not start camera thread: {error}"))?;

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
    public_devices: Arc<RwLock<Vec<CameraDevice>>>,
    latest: SharedCameraFrame,
    permission: Arc<AtomicI8>,
    alive: Arc<AtomicBool>,
) {
    let mut camera: Option<Camera> = None;
    let mut device_infos: Vec<CameraInfo> = Vec::new();
    let mut permission_handled = false;
    let mut allow_automatic_start = true;
    let mut sequence = 0u64;
    let mut metric_frames = 0u64;
    let mut metrics_started = Instant::now();
    let mut consecutive_errors = 0u32;
    let mut rgba_scratch = Vec::<u8>::new();
    let mut capture_wait_ema = 0.0f64;
    let mut decode_ema = 0.0f64;

    while alive.load(Ordering::Relaxed) {
        let permission_value = permission.load(Ordering::Acquire);
        if !permission_handled && permission_value >= 0 {
            permission_handled = true;
            if let Ok(mut shared) = status.write() {
                shared.permission = if permission_value == 1 {
                    "granted"
                } else {
                    "denied"
                }
                .into();
                if permission_value == 0 {
                    shared.last_error = "Camera permission was denied. Enable it in system privacy settings and restart the app.".into();
                }
            }
            if permission_value == 1 {
                refresh_devices(&mut device_infos, &public_devices, &status);
                if allow_automatic_start && !device_infos.is_empty() {
                    match open_camera(&device_infos[0], "lowLatency") {
                        Ok((opened, candidate_count)) => {
                            update_open_status(
                                &opened,
                                0,
                                "lowLatency",
                                candidate_count,
                                &status,
                            );
                            camera = Some(opened);
                        }
                        Err(error) => set_error(&status, error),
                    }
                }
            }
        }

        loop {
            match rx.try_recv() {
                Ok(CameraCommand::Refresh) => {
                    allow_automatic_start = false;
                    camera = None;
                    clear_latest(&latest);
                    set_streaming(&status, false);
                    if permission.load(Ordering::Acquire) == 1 {
                        refresh_devices(&mut device_infos, &public_devices, &status);
                    }
                }
                Ok(CameraCommand::Start { slot, profile }) => {
                    allow_automatic_start = false;
                    camera = None;
                    clear_latest(&latest);
                    set_streaming(&status, false);
                    if permission.load(Ordering::Acquire) != 1 {
                        set_error(&status, "Camera permission is not available yet.".into());
                        continue;
                    }
                    if let Some(info) = device_infos.get(slot) {
                        match open_camera(info, &profile) {
                            Ok((opened, candidate_count)) => {
                                update_open_status(
                                    &opened,
                                    slot,
                                    &profile,
                                    candidate_count,
                                    &status,
                                );
                                camera = Some(opened);
                                rgba_scratch.clear();
                                consecutive_errors = 0;
                                capture_wait_ema = 0.0;
                                decode_ema = 0.0;
                            }
                            Err(error) => set_error(&status, error),
                        }
                    } else {
                        set_error(
                            &status,
                            format!("Camera slot {slot} is unavailable. Refresh the device list."),
                        );
                    }
                }
                Ok(CameraCommand::Stop) => {
                    allow_automatic_start = false;
                    camera = None;
                    clear_latest(&latest);
                    set_streaming(&status, false);
                }
                Ok(CameraCommand::Shutdown) | Err(TryRecvError::Disconnected) => {
                    alive.store(false, Ordering::Relaxed);
                    camera = None;
                    break;
                }
                Err(TryRecvError::Empty) => break,
            }
        }
        if !alive.load(Ordering::Relaxed) {
            break;
        }

        let Some(active) = camera.as_mut() else {
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(command) => match command {
                    CameraCommand::Refresh => {
                        allow_automatic_start = false;
                        if permission.load(Ordering::Acquire) == 1 {
                            refresh_devices(&mut device_infos, &public_devices, &status);
                        }
                    }
                    CameraCommand::Start { slot, profile } => {
                        allow_automatic_start = false;
                        if let Some(info) = device_infos.get(slot) {
                            match open_camera(info, &profile) {
                                Ok((opened, candidate_count)) => {
                                    update_open_status(
                                        &opened,
                                        slot,
                                        &profile,
                                        candidate_count,
                                        &status,
                                    );
                                    camera = Some(opened);
                                }
                                Err(error) => set_error(&status, error),
                            }
                        }
                    }
                    CameraCommand::Stop => {
                        allow_automatic_start = false;
                    }
                    CameraCommand::Shutdown => alive.store(false, Ordering::Relaxed),
                },
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => {
                    alive.store(false, Ordering::Relaxed)
                }
            }
            continue;
        };

        let capture_started = Instant::now();
        match active.frame() {
            Ok(buffer) => {
                let capture_ms = capture_started.elapsed().as_secs_f64() * 1000.0;
                capture_wait_ema = ema(capture_wait_ema, capture_ms, 0.12);

                let resolution = buffer.resolution();
                let width = resolution.width();
                let height = resolution.height();
                let required = width as usize * height as usize * 4;
                if rgba_scratch.len() != required {
                    rgba_scratch.resize(required, 0);
                }

                let decode_started = Instant::now();
                match buffer.decode_image_to_buffer::<RgbAFormat>(&mut rgba_scratch) {
                    Ok(()) => {
                        let decode_ms = decode_started.elapsed().as_secs_f64() * 1000.0;
                        decode_ema = ema(decode_ema, decode_ms, 0.12);
                        sequence += 1;
                        metric_frames += 1;
                        consecutive_errors = 0;

                        let published = Arc::new(CameraFrame {
                            sequence,
                            width,
                            height,
                            rgba: rgba_scratch,
                            captured_at: Instant::now(),
                        });

                        let previous = if let Ok(mut shared) = latest.write() {
                            shared.replace(published)
                        } else {
                            None
                        };

                        rgba_scratch = previous
                            .and_then(|frame| Arc::try_unwrap(frame).ok())
                            .map(|frame| frame.rgba)
                            .unwrap_or_else(|| Vec::with_capacity(required));
                        if rgba_scratch.len() != required {
                            rgba_scratch.resize(required, 0);
                        }

                        if let Ok(mut shared) = status.write() {
                            shared.width = width;
                            shared.height = height;
                            shared.decoded_frames = sequence;
                            shared.capture_wait_ms = capture_wait_ema;
                            shared.decode_ms = decode_ema;
                            if rgba_scratch.capacity() >= required {
                                shared.recycled_buffers += 1;
                            }
                            shared.last_error.clear();
                        }
                    }
                    Err(error) => {
                        consecutive_errors += 1;
                        if let Ok(mut shared) = status.write() {
                            shared.decode_errors += 1;
                            shared.capture_wait_ms = capture_wait_ema;
                            shared.decode_ms = decode_ema;
                        }
                        set_error(&status, format!("Camera frame decode failed: {error}"));
                    }
                }
            }
            Err(error) => {
                consecutive_errors += 1;
                set_error(&status, format!("Camera frame capture failed: {error}"));
                thread::sleep(Duration::from_millis(8));
            }
        }

        let metric_elapsed = metrics_started.elapsed();
        if metric_elapsed >= Duration::from_millis(750) {
            if let Ok(mut shared) = status.write() {
                shared.capture_fps = metric_frames as f64 / metric_elapsed.as_secs_f64();
            }
            metric_frames = 0;
            metrics_started = Instant::now();
        }
        if consecutive_errors >= 60 {
            camera = None;
            clear_latest(&latest);
            set_streaming(&status, false);
            set_error(
                &status,
                "Camera stopped after repeated capture or decode failures. Try Low latency or another exact device format.".into(),
            );
        }
    }
    set_streaming(&status, false);
}

fn refresh_devices(
    internal: &mut Vec<CameraInfo>,
    public_devices: &Arc<RwLock<Vec<CameraDevice>>>,
    status: &Arc<RwLock<CameraStatus>>,
) {
    match query(ApiBackend::Auto) {
        Ok(found) => {
            *internal = found;
            let public = internal
                .iter()
                .enumerate()
                .map(|(slot, info)| CameraDevice {
                    slot,
                    name: info.human_name(),
                    index: info.index().as_string(),
                    description: info.description().to_string(),
                })
                .collect::<Vec<_>>();
            if let Ok(mut shared) = public_devices.write() {
                *shared = public;
            }
            if let Ok(mut shared) = status.write() {
                shared.last_error.clear();
            }
        }
        Err(error) => set_error(status, format!("Could not enumerate cameras: {error}")),
    }
}

fn open_camera(info: &CameraInfo, profile: &str) -> Result<(Camera, u32), String> {
    let probe_request = RequestedFormat::with_formats(RequestedFormatType::None, DECODABLE_FORMATS);
    let mut probe = Camera::new(info.index().clone(), probe_request)
        .map_err(|error| format!("Could not initialize {}: {error}", info.human_name()))?;

    let mut candidates = probe.compatible_camera_formats().unwrap_or_default();
    candidates.retain(|format| DECODABLE_FORMATS.contains(&format.format()));
    candidates.sort_by(|a, b| compare_formats(*a, *b, profile));
    candidates.dedup();
    let candidate_count = candidates.len() as u32;

    let mut failures = Vec::new();
    for format in candidates.iter().copied() {
        let request = RequestedFormat::with_formats(
            RequestedFormatType::Exact(format),
            DECODABLE_FORMATS,
        );
        match Camera::new(info.index().clone(), request) {
            Ok(mut camera) => match camera.open_stream() {
                Ok(()) => return Ok((camera, candidate_count)),
                Err(error) => failures.push(format!("{format}: {error}")),
            },
            Err(error) => failures.push(format!("{format}: {error}")),
        }
    }

    // Some camera backends cannot enumerate formats. In that case, keep the backend's
    // own default instead of forcing MJPEG or a guessed FourCC.
    if candidate_count == 0 {
        probe
            .open_stream()
            .map_err(|error| format!("Could not open {} with its native default format: {error}", info.human_name()))?;
        return Ok((probe, 0));
    }

    let summary = failures.into_iter().take(4).collect::<Vec<_>>().join(" | ");
    Err(format!(
        "Could not open {} using any supported exact format for profile {profile}. {summary}",
        info.human_name()
    ))
}

fn compare_formats(a: CameraFormat, b: CameraFormat, profile: &str) -> CmpOrdering {
    let score_a = format_score(a, profile);
    let score_b = format_score(b, profile);
    score_b
        .partial_cmp(&score_a)
        .unwrap_or(CmpOrdering::Equal)
        .then_with(|| b.frame_rate().cmp(&a.frame_rate()))
        .then_with(|| format_rank(a.format()).cmp(&format_rank(b.format())))
}

fn format_score(format: CameraFormat, profile: &str) -> f64 {
    let width = format.width() as f64;
    let height = format.height() as f64;
    let pixels = width * height;
    let fps = format.frame_rate() as f64;
    let format_bonus = (10 - format_rank(format.format())) as f64 * 0.01;

    match profile {
        "quality" => {
            let fps_floor = if fps >= 24.0 { 1.0 } else { 0.25 };
            pixels * fps_floor + fps * 10_000.0 + format_bonus
        }
        "speed" => {
            let resolution_penalty = if pixels > 1280.0 * 720.0 {
                (pixels - 1280.0 * 720.0) * 8.0
            } else {
                0.0
            };
            fps * 10_000_000.0 - pixels - resolution_penalty + format_bonus
        }
        "balanced" => {
            let target_pixels = 1280.0 * 720.0;
            let pixel_distance = (pixels - target_pixels).abs();
            let fps_distance = (fps - 30.0).abs();
            -pixel_distance - fps_distance * 200_000.0 + format_bonus
        }
        _ => {
            // Low latency favors 30+ fps and smaller decode/upload surfaces.
            let target_pixels = 640.0 * 480.0;
            let pixel_distance = (pixels - target_pixels).abs();
            let fps_reward = fps.min(60.0) * 2_000_000.0;
            let large_penalty = if pixels > 1280.0 * 720.0 {
                pixels * 12.0
            } else {
                0.0
            };
            fps_reward - pixel_distance - large_penalty + format_bonus
        }
    }
}

fn format_rank(format: FrameFormat) -> i32 {
    match format {
        FrameFormat::MJPEG => 0,
        FrameFormat::NV12 => 1,
        FrameFormat::YUYV => 2,
        FrameFormat::RAWRGB => 3,
        FrameFormat::RAWBGR => 4,
        FrameFormat::GRAY => 5,
    }
}

fn update_open_status(
    camera: &Camera,
    slot: usize,
    profile: &str,
    candidate_count: u32,
    status: &Arc<RwLock<CameraStatus>>,
) {
    let format = camera.camera_format();
    if let Ok(mut shared) = status.write() {
        shared.streaming = true;
        shared.selected_slot = Some(slot);
        shared.selected_name = camera.info().human_name();
        shared.profile = profile.into();
        shared.width = format.width();
        shared.height = format.height();
        shared.requested_fps = format.frame_rate();
        shared.source_format = format!("{:?}", format.format());
        shared.format_candidates = candidate_count;
        shared.capture_wait_ms = 0.0;
        shared.decode_ms = 0.0;
        shared.last_error.clear();
    }
}

fn clear_latest(latest: &SharedCameraFrame) {
    if let Ok(mut shared) = latest.write() {
        *shared = None;
    }
}

fn set_streaming(status: &Arc<RwLock<CameraStatus>>, streaming: bool) {
    if let Ok(mut shared) = status.write() {
        shared.streaming = streaming;
    }
}

fn set_error(status: &Arc<RwLock<CameraStatus>>, error: String) {
    if let Ok(mut shared) = status.write() {
        shared.last_error = error;
    }
}

fn ema(previous: f64, current: f64, alpha: f64) -> f64 {
    if previous <= 0.0 {
        current
    } else {
        previous + (current - previous) * alpha
    }
}
