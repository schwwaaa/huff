use serde::Serialize;
use serde_json::Value;
use std::{
    io::Read,
    path::{Path, PathBuf},
    process::{Child, ChildStdout, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender},
        Arc, RwLock,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Debug)]
pub struct VideoFrame {
    pub sequence: u64,
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
    pub presented_at: Instant,
}

pub type SharedVideoFrame = Arc<RwLock<Option<Arc<VideoFrame>>>>;

const VIDEO_PIPE_STALL_TIMEOUT: Duration = Duration::from_secs(3);
const VIDEO_PIPE_QUEUE: usize = 3;

enum VideoPipeEvent {
    Frame(Vec<u8>),
    Eof,
    Error(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStatus {
    pub ffmpeg_available: bool,
    pub ffmpeg_version: String,
    pub loaded: bool,
    pub playing: bool,
    pub ended: bool,
    pub looping: bool,
    pub file_name: String,
    pub file_path: String,
    pub codec: String,
    pub pixel_format: String,
    pub width: u32,
    pub height: u32,
    pub source_fps: f64,
    pub duration_seconds: f64,
    pub position_seconds: f64,
    pub playback_rate: f64,
    pub decode_mode: String,
    pub decode_fps: f64,
    pub decode_ms: f64,
    pub delivered_frames: u64,
    pub decoder_restarts: u64,
    pub decoder_stalls: u64,
    pub watchdog_restarts: u64,
    pub last_error: String,
}

impl Default for VideoStatus {
    fn default() -> Self {
        Self {
            ffmpeg_available: false,
            ffmpeg_version: String::new(),
            loaded: false,
            playing: false,
            ended: false,
            looping: true,
            file_name: String::new(),
            file_path: String::new(),
            codec: String::new(),
            pixel_format: String::new(),
            width: 0,
            height: 0,
            source_fps: 0.0,
            duration_seconds: 0.0,
            position_seconds: 0.0,
            playback_rate: 1.0,
            decode_mode: "software".into(),
            decode_fps: 0.0,
            decode_ms: 0.0,
            delivered_frames: 0,
            decoder_restarts: 0,
            decoder_stalls: 0,
            watchdog_restarts: 0,
            last_error: String::new(),
        }
    }
}

#[derive(Debug, Clone)]
struct VideoMetadata {
    path: PathBuf,
    file_name: String,
    codec: String,
    pixel_format: String,
    width: u32,
    height: u32,
    fps: f64,
    duration: f64,
}

#[derive(Debug)]
enum VideoCommand {
    Open(PathBuf),
    Play,
    Pause,
    Stop,
    Seek(f64),
    SetRate(f64),
    SetLoop(bool),
    SetDecodeMode(String),
    Step(i32),
    Shutdown,
}

#[derive(Clone)]
pub struct VideoHandle {
    tx: SyncSender<VideoCommand>,
    status: Arc<RwLock<VideoStatus>>,
    latest: SharedVideoFrame,
}

impl VideoHandle {
    pub fn status(&self) -> VideoStatus {
        self.status.read().expect("video status poisoned").clone()
    }
    pub fn frame_source(&self) -> SharedVideoFrame { Arc::clone(&self.latest) }
    pub fn open(&self, path: PathBuf) { let _ = self.tx.try_send(VideoCommand::Open(path)); }
    pub fn play(&self) { let _ = self.tx.try_send(VideoCommand::Play); }
    pub fn pause(&self) { let _ = self.tx.try_send(VideoCommand::Pause); }
    pub fn stop(&self) { let _ = self.tx.try_send(VideoCommand::Stop); }
    pub fn seek(&self, seconds: f64) { let _ = self.tx.try_send(VideoCommand::Seek(seconds)); }
    pub fn set_rate(&self, rate: f64) { let _ = self.tx.try_send(VideoCommand::SetRate(rate)); }
    pub fn set_loop(&self, looping: bool) { let _ = self.tx.try_send(VideoCommand::SetLoop(looping)); }
    pub fn set_decode_mode(&self, mode: String) { let _ = self.tx.try_send(VideoCommand::SetDecodeMode(mode)); }
    pub fn step(&self, direction: i32) { let _ = self.tx.try_send(VideoCommand::Step(direction)); }
    pub fn shutdown(&self) { let _ = self.tx.try_send(VideoCommand::Shutdown); }
}

pub fn start() -> Result<VideoHandle, String> {
    let (tx, rx) = sync_channel(128);
    let status = Arc::new(RwLock::new(VideoStatus::default()));
    let latest = Arc::new(RwLock::new(None));
    let generation = Arc::new(AtomicU64::new(1));

    let thread_status = Arc::clone(&status);
    let thread_latest = Arc::clone(&latest);
    let thread_generation = Arc::clone(&generation);
    thread::Builder::new()
        .name("huff-video-controller".into())
        .spawn(move || controller_loop(rx, thread_status, thread_latest, thread_generation))
        .map_err(|error| format!("could not start video controller: {error}"))?;

    Ok(VideoHandle { tx, status, latest })
}

fn controller_loop(
    rx: Receiver<VideoCommand>,
    status: Arc<RwLock<VideoStatus>>,
    latest: SharedVideoFrame,
    generation: Arc<AtomicU64>,
) {
    initialize_ffmpeg_status(&status);
    let mut metadata: Option<VideoMetadata> = None;

    loop {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(VideoCommand::Open(path)) => {
                generation.fetch_add(1, Ordering::AcqRel);
                if let Ok(mut frame) = latest.write() {
                    *frame = None;
                }
                match probe_video(&path) {
                    Ok(info) => {
                        metadata = Some(info.clone());
                        if let Ok(mut shared) = status.write() {
                            shared.loaded = true;
                            shared.playing = true;
                            shared.ended = false;
                            shared.file_name = info.file_name.clone();
                            shared.file_path = info.path.display().to_string();
                            shared.codec = info.codec.clone();
                            shared.pixel_format = info.pixel_format.clone();
                            shared.width = info.width;
                            shared.height = info.height;
                            shared.source_fps = info.fps;
                            shared.duration_seconds = info.duration;
                            shared.position_seconds = 0.0;
                            shared.delivered_frames = 0;
                            shared.decode_fps = 0.0;
                            shared.last_error.clear();
                        }
                        launch_playback(&info, 0.0, &status, &latest, &generation);
                    }
                    Err(error) => set_error(&status, error),
                }
            }
            Ok(VideoCommand::Play) => {
                if let Some(info) = metadata.as_ref() {
                    let position = status.read().ok().map(|s| s.position_seconds).unwrap_or(0.0);
                    if let Ok(mut shared) = status.write() { shared.playing = true; shared.ended = false; }
                    generation.fetch_add(1, Ordering::AcqRel);
                    launch_playback(info, position, &status, &latest, &generation);
                }
            }
            Ok(VideoCommand::Pause) => {
                generation.fetch_add(1, Ordering::AcqRel);
                if let Ok(mut shared) = status.write() { shared.playing = false; }
            }
            Ok(VideoCommand::Stop) => {
                generation.fetch_add(1, Ordering::AcqRel);
                if let Ok(mut shared) = status.write() {
                    shared.playing = false;
                    shared.ended = false;
                    shared.position_seconds = 0.0;
                }
            }
            Ok(VideoCommand::Seek(seconds)) => {
                if let Some(info) = metadata.as_ref() {
                    let target = seconds.clamp(0.0, info.duration.max(0.0));
                    let was_playing = status.read().ok().map(|s| s.playing).unwrap_or(false);
                    generation.fetch_add(1, Ordering::AcqRel);
                    if let Ok(mut shared) = status.write() { shared.position_seconds = target; shared.ended = false; }
                    if was_playing {
                        launch_playback(info, target, &status, &latest, &generation);
                    } else {
                        launch_single_frame(info, target, &status, &latest, &generation);
                    }
                }
            }
            Ok(VideoCommand::SetRate(rate)) => {
                let clamped = rate.clamp(0.1, 4.0);
                let playing = status.read().ok().map(|s| s.playing).unwrap_or(false);
                let position = status.read().ok().map(|s| s.position_seconds).unwrap_or(0.0);
                if let Ok(mut shared) = status.write() { shared.playback_rate = clamped; }
                if playing {
                    if let Some(info) = metadata.as_ref() {
                        generation.fetch_add(1, Ordering::AcqRel);
                        launch_playback(info, position, &status, &latest, &generation);
                    }
                }
            }
            Ok(VideoCommand::SetLoop(looping)) => {
                if let Ok(mut shared) = status.write() { shared.looping = looping; }
            }
            Ok(VideoCommand::SetDecodeMode(mode)) => {
                if !matches!(mode.as_str(), "software" | "auto") { continue; }
                let playing = status.read().ok().map(|s| s.playing).unwrap_or(false);
                let position = status.read().ok().map(|s| s.position_seconds).unwrap_or(0.0);
                if let Ok(mut shared) = status.write() { shared.decode_mode = mode; }
                if playing {
                    if let Some(info) = metadata.as_ref() {
                        generation.fetch_add(1, Ordering::AcqRel);
                        launch_playback(info, position, &status, &latest, &generation);
                    }
                }
            }
            Ok(VideoCommand::Step(direction)) => {
                if let Some(info) = metadata.as_ref() {
                    generation.fetch_add(1, Ordering::AcqRel);
                    let frame_seconds = 1.0 / info.fps.max(1.0);
                    let current = status.read().ok().map(|s| s.position_seconds).unwrap_or(0.0);
                    let target = (current + frame_seconds * direction.signum() as f64)
                        .clamp(0.0, info.duration.max(0.0));
                    if let Ok(mut shared) = status.write() {
                        shared.playing = false;
                        shared.position_seconds = target;
                        shared.ended = false;
                    }
                    launch_single_frame(info, target, &status, &latest, &generation);
                }
            }
            Ok(VideoCommand::Shutdown) | Err(RecvTimeoutError::Disconnected) => {
                generation.fetch_add(1, Ordering::AcqRel);
                break;
            }
            Err(RecvTimeoutError::Timeout) => {}
        }
    }
}

fn launch_playback(
    metadata: &VideoMetadata,
    start_seconds: f64,
    status: &Arc<RwLock<VideoStatus>>,
    latest: &SharedVideoFrame,
    generation: &Arc<AtomicU64>,
) {
    let info = metadata.clone();
    let shared_status = Arc::clone(status);
    let shared_latest = Arc::clone(latest);
    let shared_generation = Arc::clone(generation);
    let generation_id = shared_generation.load(Ordering::Acquire);
    if let Ok(mut shared) = shared_status.write() { shared.decoder_restarts += 1; }
    thread::Builder::new()
        .name("huff-ffmpeg-playback".into())
        .spawn(move || playback_worker(info, start_seconds, shared_status, shared_latest, shared_generation, generation_id))
        .ok();
}

fn launch_single_frame(
    metadata: &VideoMetadata,
    seconds: f64,
    status: &Arc<RwLock<VideoStatus>>,
    latest: &SharedVideoFrame,
    generation: &Arc<AtomicU64>,
) {
    let info = metadata.clone();
    let shared_status = Arc::clone(status);
    let shared_latest = Arc::clone(latest);
    let shared_generation = Arc::clone(generation);
    let generation_id = shared_generation.load(Ordering::Acquire);
    thread::Builder::new()
        .name("huff-ffmpeg-frame-step".into())
        .spawn(move || {
            match spawn_ffmpeg(&info, seconds, true, "software") {
                Ok(mut child) => {
                    if let Some(mut stdout) = child.stdout.take() {
                        let mut bytes = vec![0u8; frame_byte_len(&info).unwrap_or(0)];
                        if !bytes.is_empty() && stdout.read_exact(&mut bytes).is_ok()
                            && shared_generation.load(Ordering::Acquire) == generation_id
                        {
                            let _ = publish_frame(&shared_latest, &shared_status, &info, bytes, seconds);
                        }
                    }
                    let _ = child.kill();
                    let _ = child.wait();
                }
                Err(error) => set_error(&shared_status, error),
            }
        })
        .ok();
}

fn playback_worker(
    metadata: VideoMetadata,
    mut start_seconds: f64,
    status: Arc<RwLock<VideoStatus>>,
    latest: SharedVideoFrame,
    generation: Arc<AtomicU64>,
    generation_id: u64,
) {
    let frame_len = match frame_byte_len(&metadata) {
        Ok(value) => value,
        Err(error) => { set_error(&status, error); return; }
    };

    loop {
        if generation.load(Ordering::Acquire) != generation_id { return; }
        let mode = status.read().ok().map(|s| s.decode_mode.clone()).unwrap_or_else(|| "software".into());
        let mut child = match spawn_ffmpeg(&metadata, start_seconds, false, &mode) {
            Ok(child) => child,
            Err(error) => { set_error(&status, error); return; }
        };
        let Some(stdout) = child.stdout.take() else {
            set_error(&status, "FFmpeg did not expose a video output pipe".into());
            let _ = child.kill();
            return;
        };

        let (pipe_rx, recycle_tx) = start_video_pipe_reader(stdout, frame_len);
        let mut local_frames = 0u64;
        let mut metric_frames = 0u64;
        let mut metric_started = Instant::now();
        let mut next_deadline = Instant::now();
        let mut decode_ema = 0.0f64;
        let mut restart_after_stall = false;
        let mut reached_eof = false;

        loop {
            if generation.load(Ordering::Acquire) != generation_id {
                let _ = child.kill();
                let _ = child.wait();
                return;
            }

            let decode_started = Instant::now();
            let event = match pipe_rx.recv_timeout(VIDEO_PIPE_STALL_TIMEOUT) {
                Ok(event) => event,
                Err(RecvTimeoutError::Timeout) => {
                    restart_after_stall = true;
                    if let Ok(mut shared) = status.write() {
                        shared.decoder_stalls = shared.decoder_stalls.wrapping_add(1);
                        shared.last_error = "video decoder pipe stalled; restarting at the current position".into();
                    }
                    break;
                }
                Err(RecvTimeoutError::Disconnected) => {
                    reached_eof = true;
                    break;
                }
            };

            let bytes = match event {
                VideoPipeEvent::Frame(bytes) => bytes,
                VideoPipeEvent::Eof => {
                    reached_eof = true;
                    break;
                }
                VideoPipeEvent::Error(error) => {
                    if let Ok(mut shared) = status.write() {
                        shared.last_error = error;
                    }
                    restart_after_stall = true;
                    break;
                }
            };

            let decode_ms = decode_started.elapsed().as_secs_f64() * 1000.0;
            decode_ema = if decode_ema == 0.0 { decode_ms } else { decode_ema * 0.9 + decode_ms * 0.1 };

            local_frames += 1;
            metric_frames += 1;
            let position = start_seconds + local_frames as f64 / metadata.fps.max(1.0);
            let recycled = publish_frame(&latest, &status, &metadata, bytes, position);
            let _ = recycle_tx.try_send(recycled);
            if let Ok(mut shared) = status.write() {
                shared.decode_ms = decode_ema;
                shared.last_error.clear();
            }

            let rate = status.read().ok().map(|s| s.playback_rate).unwrap_or(1.0).max(0.1);
            next_deadline = next_deadline + Duration::from_secs_f64((1.0 / metadata.fps.max(1.0)) / rate);
            let now = Instant::now();
            if next_deadline > now { thread::sleep(next_deadline - now); }
            else if now.duration_since(next_deadline) > Duration::from_millis(250) { next_deadline = now; }

            let elapsed = metric_started.elapsed();
            if elapsed >= Duration::from_millis(500) {
                if let Ok(mut shared) = status.write() {
                    shared.decode_fps = metric_frames as f64 / elapsed.as_secs_f64();
                }
                metric_frames = 0;
                metric_started = Instant::now();
            }
        }

        let _ = child.kill();
        let _ = child.wait();
        if generation.load(Ordering::Acquire) != generation_id { return; }

        if restart_after_stall {
            start_seconds = status
                .read()
                .ok()
                .map(|shared| shared.position_seconds)
                .unwrap_or(start_seconds)
                .clamp(0.0, metadata.duration.max(0.0));
            if let Ok(mut shared) = status.write() {
                shared.watchdog_restarts = shared.watchdog_restarts.wrapping_add(1);
                shared.playing = true;
                shared.ended = false;
            }
            thread::sleep(Duration::from_millis(40));
            continue;
        }

        let looping = status.read().ok().map(|s| s.looping).unwrap_or(false);
        let position = status.read().ok().map(|s| s.position_seconds).unwrap_or(0.0);
        let unexpectedly_early = metadata.duration > 0.0 && position + 0.5 < metadata.duration;
        if reached_eof && unexpectedly_early {
            start_seconds = position.clamp(0.0, metadata.duration);
            if let Ok(mut shared) = status.write() {
                shared.decoder_stalls = shared.decoder_stalls.wrapping_add(1);
                shared.watchdog_restarts = shared.watchdog_restarts.wrapping_add(1);
                shared.last_error = "video decoder ended before the media duration; restarting".into();
            }
            thread::sleep(Duration::from_millis(40));
            continue;
        }
        if reached_eof && looping {
            start_seconds = 0.0;
            if let Ok(mut shared) = status.write() { shared.position_seconds = 0.0; shared.ended = false; }
            continue;
        }
        if let Ok(mut shared) = status.write() {
            shared.playing = false;
            shared.ended = true;
            shared.position_seconds = metadata.duration;
        }
        return;
    }
}

fn start_video_pipe_reader(
    mut stdout: ChildStdout,
    frame_len: usize,
) -> (Receiver<VideoPipeEvent>, SyncSender<Vec<u8>>) {
    let (event_tx, event_rx) = sync_channel::<VideoPipeEvent>(VIDEO_PIPE_QUEUE);
    let (recycle_tx, recycle_rx) = sync_channel::<Vec<u8>>(VIDEO_PIPE_QUEUE + 1);
    thread::Builder::new()
        .name("huff-video-pipe-reader".into())
        .spawn(move || {
            let mut bytes = vec![0u8; frame_len];
            loop {
                match stdout.read_exact(&mut bytes) {
                    Ok(()) => {
                        if event_tx.send(VideoPipeEvent::Frame(bytes)).is_err() {
                            return;
                        }
                        bytes = recycle_rx
                            .recv_timeout(Duration::from_millis(250))
                            .ok()
                            .filter(|buffer| buffer.len() == frame_len)
                            .unwrap_or_else(|| vec![0u8; frame_len]);
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => {
                        let _ = event_tx.send(VideoPipeEvent::Eof);
                        return;
                    }
                    Err(error) => {
                        let _ = event_tx.send(VideoPipeEvent::Error(format!(
                            "video decoder pipe read failed: {error}"
                        )));
                        return;
                    }
                }
            }
        })
        .ok();
    (event_rx, recycle_tx)
}

fn spawn_ffmpeg(metadata: &VideoMetadata, seconds: f64, single_frame: bool, mode: &str) -> Result<Child, String> {
    let mut command = Command::new("ffmpeg");
    command.args(["-hide_banner", "-loglevel", "error", "-nostdin"]);
    if mode == "auto" { command.args(["-hwaccel", "auto"]); }
    if seconds > 0.0 { command.args(["-ss", &format!("{seconds:.6}")]); }
    command.arg("-i").arg(&metadata.path);
    command.args(["-map", "0:v:0", "-an", "-sn", "-dn", "-pix_fmt", "bgra", "-f", "rawvideo"]);
    if single_frame { command.args(["-frames:v", "1"]); }
    command.arg("pipe:1");
    command.stdout(Stdio::piped()).stderr(Stdio::null()).stdin(Stdio::null());
    command.spawn().map_err(|error| format!("could not start FFmpeg: {error}"))
}

fn publish_frame(
    latest: &SharedVideoFrame,
    status: &Arc<RwLock<VideoStatus>>,
    metadata: &VideoMetadata,
    bytes: Vec<u8>,
    position: f64,
) -> Vec<u8> {
    let sequence = {
        let mut shared = match status.write() { Ok(value) => value, Err(_) => return bytes };
        shared.delivered_frames += 1;
        shared.position_seconds = if metadata.duration > 0.0 { position.min(metadata.duration) } else { position };
        shared.delivered_frames
    };
    let frame = Arc::new(VideoFrame {
        sequence,
        width: metadata.width,
        height: metadata.height,
        bgra: bytes,
        presented_at: Instant::now(),
    });
    let old = latest.write().ok().and_then(|mut shared| shared.replace(frame));
    if let Some(old_frame) = old {
        if let Ok(frame) = Arc::try_unwrap(old_frame) {
            return frame.bgra;
        }
    }
    vec![0u8; frame_byte_len(metadata).unwrap_or(0)]
}

fn initialize_ffmpeg_status(status: &Arc<RwLock<VideoStatus>>) {
    let output = Command::new("ffmpeg").arg("-version").output();
    if let Ok(mut shared) = status.write() {
        match output {
            Ok(result) if result.status.success() => {
                shared.ffmpeg_available = true;
                shared.ffmpeg_version = String::from_utf8_lossy(&result.stdout)
                    .lines().next().unwrap_or("ffmpeg available").to_string();
            }
            Ok(_) => shared.last_error = "FFmpeg was found but could not start successfully.".into(),
            Err(_) => shared.last_error = "FFmpeg is required. Install it and ensure `ffmpeg` and `ffprobe` are on PATH.".into(),
        }
    }
}

fn probe_video(path: &Path) -> Result<VideoMetadata, String> {
    let output = Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "v:0", "-show_entries",
            "stream=width,height,r_frame_rate,avg_frame_rate,codec_name,pix_fmt,duration:format=duration",
            "-of", "json"])
        .arg(path)
        .output()
        .map_err(|error| format!("could not start ffprobe: {error}"))?;
    if !output.status.success() {
        return Err(format!("ffprobe could not inspect {}", path.display()));
    }
    let value: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("invalid ffprobe JSON: {error}"))?;
    let stream = value.get("streams").and_then(Value::as_array).and_then(|items| items.first())
        .ok_or_else(|| "the selected file has no video stream".to_string())?;
    let width = stream.get("width").and_then(Value::as_u64).unwrap_or(0) as u32;
    let height = stream.get("height").and_then(Value::as_u64).unwrap_or(0) as u32;
    if width == 0 || height == 0 { return Err("video stream reported an invalid resolution".into()); }
    let fps_text = stream.get("avg_frame_rate").and_then(Value::as_str)
        .filter(|value| *value != "0/0")
        .or_else(|| stream.get("r_frame_rate").and_then(Value::as_str))
        .unwrap_or("30/1");
    let fps = parse_rational(fps_text).filter(|value| *value > 0.0).unwrap_or(30.0);
    let stream_duration = stream.get("duration").and_then(Value::as_str).and_then(|v| v.parse::<f64>().ok());
    let format_duration = value.get("format").and_then(|v| v.get("duration")).and_then(Value::as_str).and_then(|v| v.parse::<f64>().ok());
    let duration = stream_duration.or(format_duration).unwrap_or(0.0).max(0.0);
    Ok(VideoMetadata {
        path: path.to_path_buf(),
        file_name: path.file_name().and_then(|v| v.to_str()).unwrap_or("video").to_string(),
        codec: stream.get("codec_name").and_then(Value::as_str).unwrap_or("unknown").to_string(),
        pixel_format: stream.get("pix_fmt").and_then(Value::as_str).unwrap_or("unknown").to_string(),
        width,
        height,
        fps,
        duration,
    })
}

fn frame_byte_len(metadata: &VideoMetadata) -> Result<usize, String> {
    (metadata.width as usize)
        .checked_mul(metadata.height as usize)
        .and_then(|value| value.checked_mul(4))
        .ok_or_else(|| "video frame is too large for this platform".to_string())
}

fn parse_rational(value: &str) -> Option<f64> {
    let (numerator, denominator) = value.split_once('/')?;
    let numerator = numerator.parse::<f64>().ok()?;
    let denominator = denominator.parse::<f64>().ok()?;
    if denominator == 0.0 { None } else { Some(numerator / denominator) }
}

fn set_error(status: &Arc<RwLock<VideoStatus>>, error: String) {
    if let Ok(mut shared) = status.write() {
        shared.playing = false;
        shared.last_error = error;
    }
}
