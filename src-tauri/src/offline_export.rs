use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender},
        Arc, RwLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const DECODE_QUEUE_CAPACITY: usize = 3;
const DECODE_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineExportConfig {
    pub path: PathBuf,
    pub source_path: PathBuf,
    pub source_width: u32,
    pub source_height: u32,
    pub output_width: u32,
    pub output_height: u32,
    pub start_seconds: f64,
    pub duration_seconds: f64,
    pub fps: u32,
    pub playback_rate: f64,
    pub loop_source: bool,
    pub include_audio: bool,
    pub audio_volume: f32,
    pub sampling: String,
    pub fit_mode: String,
}

impl OfflineExportConfig {
    pub fn total_frames(&self) -> u64 {
        (self.duration_seconds.max(0.0) * self.fps.max(1) as f64)
            .round()
            .max(1.0) as u64
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineExportMetadata {
    pub engine_build: String,
    pub created_unix_ms: u128,
    pub source_file: String,
    pub source_codec: String,
    pub source_duration_seconds: f64,
    pub source_playback_rate: f64,
    pub export_start_seconds: f64,
    pub export_duration_seconds: f64,
    pub export_fps: u32,
    pub render_width: u32,
    pub render_height: u32,
    pub export_width: u32,
    pub export_height: u32,
    pub sampling: String,
    pub fit_mode: String,
    pub include_audio: bool,
    pub loop_source: bool,
    pub parameter_revision: u64,
    pub parameter_values: Value,
    pub deterministic_seed: u64,
}

impl OfflineExportMetadata {
    pub fn now_unix_ms() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineExportInfo {
    pub ffmpeg_available: bool,
    pub active: bool,
    pub cancelling: bool,
    pub phase: String,
    pub path: String,
    pub metadata_path: String,
    pub source_path: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub start_seconds: f64,
    pub duration_seconds: f64,
    pub playback_rate: f64,
    pub include_audio: bool,
    pub total_frames: u64,
    pub rendered_frames: u64,
    pub progress: f64,
    pub elapsed_seconds: f64,
    pub estimated_remaining_seconds: f64,
    pub encoded_bytes: u64,
    pub completed_exports: u64,
    pub cancelled_exports: u64,
    pub last_error: String,
}

impl Default for OfflineExportInfo {
    fn default() -> Self {
        Self {
            ffmpeg_available: ffmpeg_available(),
            active: false,
            cancelling: false,
            phase: "ready".into(),
            path: String::new(),
            metadata_path: String::new(),
            source_path: String::new(),
            width: 0,
            height: 0,
            fps: 0,
            start_seconds: 0.0,
            duration_seconds: 0.0,
            playback_rate: 1.0,
            include_audio: false,
            total_frames: 0,
            rendered_frames: 0,
            progress: 0.0,
            elapsed_seconds: 0.0,
            estimated_remaining_seconds: 0.0,
            encoded_bytes: 0,
            completed_exports: 0,
            cancelled_exports: 0,
            last_error: String::new(),
        }
    }
}

#[derive(Clone)]
pub struct OfflineExportHandle {
    info: Arc<RwLock<OfflineExportInfo>>,
    cancel: Arc<AtomicBool>,
}

impl OfflineExportHandle {
    pub fn new() -> Self {
        Self {
            info: Arc::new(RwLock::new(OfflineExportInfo::default())),
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn info(&self) -> OfflineExportInfo {
        self.info
            .read()
            .expect("offline export info poisoned")
            .clone()
    }

    pub fn begin(&self, config: &OfflineExportConfig) -> Result<(), String> {
        if !ffmpeg_available() {
            return Err("FFmpeg is unavailable; deterministic video export cannot start".into());
        }
        let mut state = self.info.write().expect("offline export info poisoned");
        if state.active {
            return Err("another deterministic export is already active".into());
        }
        self.cancel.store(false, Ordering::Release);
        state.active = true;
        state.cancelling = false;
        state.phase = "starting".into();
        state.path = config.path.display().to_string();
        state.metadata_path = metadata_path_for(&config.path).display().to_string();
        state.source_path = config.source_path.display().to_string();
        state.width = config.output_width;
        state.height = config.output_height;
        state.fps = config.fps;
        state.start_seconds = config.start_seconds;
        state.duration_seconds = config.duration_seconds;
        state.playback_rate = config.playback_rate;
        state.include_audio = config.include_audio;
        state.total_frames = config.total_frames();
        state.rendered_frames = 0;
        state.progress = 0.0;
        state.elapsed_seconds = 0.0;
        state.estimated_remaining_seconds = 0.0;
        state.encoded_bytes = 0;
        state.last_error.clear();
        Ok(())
    }

    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::Release);
        if let Ok(mut state) = self.info.write() {
            if state.active {
                state.cancelling = true;
                state.phase = "cancelling".into();
            }
        }
    }

    pub fn cancel_requested(&self) -> bool {
        self.cancel.load(Ordering::Acquire)
    }

    pub fn set_phase(&self, phase: &str) {
        if let Ok(mut state) = self.info.write() {
            if state.active {
                state.phase = phase.into();
            }
        }
    }

    pub fn update_progress(&self, rendered_frames: u64, total_frames: u64, started: Instant) {
        if let Ok(mut state) = self.info.write() {
            if !state.active {
                return;
            }
            state.phase = "rendering".into();
            state.rendered_frames = rendered_frames;
            state.total_frames = total_frames;
            state.progress = if total_frames == 0 {
                0.0
            } else {
                (rendered_frames as f64 / total_frames as f64).clamp(0.0, 1.0)
            };
            state.elapsed_seconds = started.elapsed().as_secs_f64();
            state.estimated_remaining_seconds = if rendered_frames == 0 {
                0.0
            } else {
                let seconds_per_frame = state.elapsed_seconds / rendered_frames as f64;
                seconds_per_frame * total_frames.saturating_sub(rendered_frames) as f64
            };
        }
    }

    pub fn complete(&self, path: &Path, started: Instant) {
        let bytes = fs::metadata(path).map(|value| value.len()).unwrap_or(0);
        if let Ok(mut state) = self.info.write() {
            state.active = false;
            state.cancelling = false;
            state.phase = "complete".into();
            state.progress = 1.0;
            state.rendered_frames = state.total_frames;
            state.elapsed_seconds = started.elapsed().as_secs_f64();
            state.estimated_remaining_seconds = 0.0;
            state.encoded_bytes = bytes;
            state.completed_exports = state.completed_exports.wrapping_add(1);
            state.last_error.clear();
        }
        self.cancel.store(false, Ordering::Release);
    }

    pub fn cancelled(&self, started: Instant) {
        if let Ok(mut state) = self.info.write() {
            state.active = false;
            state.cancelling = false;
            state.phase = "cancelled".into();
            state.elapsed_seconds = started.elapsed().as_secs_f64();
            state.estimated_remaining_seconds = 0.0;
            state.cancelled_exports = state.cancelled_exports.wrapping_add(1);
            state.last_error.clear();
        }
        self.cancel.store(false, Ordering::Release);
    }

    pub fn fail(&self, error: String) {
        if let Ok(mut state) = self.info.write() {
            state.active = false;
            state.cancelling = false;
            state.phase = "error".into();
            state.estimated_remaining_seconds = 0.0;
            state.last_error = error;
        }
        self.cancel.store(false, Ordering::Release);
    }
}

pub enum DecoderEvent {
    Frame(Vec<u8>),
    Eof,
    Error(String),
}

pub struct OfflineExportSession {
    pub config: OfflineExportConfig,
    pub metadata: OfflineExportMetadata,
    pub started: Instant,
    pub total_frames: u64,
    pub rendered_frames: u64,
    decoder_child: Option<Child>,
    decoder_rx: Receiver<DecoderEvent>,
    encoder_child: Option<Child>,
    encoder_stdin: Option<ChildStdin>,
    temp_video_path: PathBuf,
}

impl OfflineExportSession {
    pub fn start(
        config: OfflineExportConfig,
        metadata: OfflineExportMetadata,
    ) -> Result<Self, String> {
        validate_config(&config)?;
        let total_frames = config.total_frames();
        let (mut decoder_child, decoder_rx) = start_decoder(&config, total_frames)?;
        let temp_video_path = temporary_video_path(&config.path);
        let (encoder_child, encoder_stdin) = match start_encoder(&config, &temp_video_path) {
            Ok(value) => value,
            Err(error) => {
                let _ = decoder_child.kill();
                let _ = decoder_child.wait();
                return Err(error);
            }
        };
        Ok(Self {
            config,
            metadata,
            started: Instant::now(),
            total_frames,
            rendered_frames: 0,
            decoder_child: Some(decoder_child),
            decoder_rx,
            encoder_child: Some(encoder_child),
            encoder_stdin: Some(encoder_stdin),
            temp_video_path,
        })
    }

    pub fn next_frame(&mut self) -> Result<Option<Vec<u8>>, String> {
        if self.rendered_frames >= self.total_frames {
            return Ok(None);
        }
        match self.decoder_rx.recv_timeout(DECODE_TIMEOUT) {
            Ok(DecoderEvent::Frame(frame)) => Ok(Some(frame)),
            Ok(DecoderEvent::Eof) => Err(format!(
                "offline decoder ended after {} of {} requested frames",
                self.rendered_frames, self.total_frames
            )),
            Ok(DecoderEvent::Error(error)) => Err(error),
            Err(RecvTimeoutError::Timeout) => {
                Err("offline decoder produced no frame for 10 seconds".into())
            }
            Err(RecvTimeoutError::Disconnected) => {
                Err("offline decoder channel disconnected".into())
            }
        }
    }

    pub fn write_rgba_frame(&mut self, pixels: &[u8]) -> Result<(), String> {
        let expected = self.config.output_width as usize
            * self.config.output_height as usize
            * 4;
        if pixels.len() != expected {
            return Err(format!(
                "offline frame has {} bytes; expected {}",
                pixels.len(), expected
            ));
        }
        let stdin = self
            .encoder_stdin
            .as_mut()
            .ok_or_else(|| "offline encoder stdin is unavailable".to_string())?;
        stdin
            .write_all(pixels)
            .map_err(|error| format!("could not write frame to offline encoder: {error}"))?;
        self.rendered_frames = self.rendered_frames.wrapping_add(1);
        Ok(())
    }

    pub fn finish(mut self) -> Result<PathBuf, String> {
        self.stop_decoder();
        drop(self.encoder_stdin.take());
        let encoder = self
            .encoder_child
            .take()
            .ok_or_else(|| "offline encoder process is unavailable".to_string())?;
        let encoder_output = encoder
            .wait_with_output()
            .map_err(|error| format!("could not wait for offline encoder: {error}"))?;
        if !encoder_output.status.success() {
            let stderr = String::from_utf8_lossy(&encoder_output.stderr).trim().to_string();
            let _ = fs::remove_file(&self.temp_video_path);
            return Err(if stderr.is_empty() {
                format!("offline video encoder exited with {}", encoder_output.status)
            } else {
                format!("offline video encoder failed: {stderr}")
            });
        }

        if self.config.include_audio {
            if let Err(error) = mux_source_audio(&self.config, &self.temp_video_path) {
                let _ = fs::remove_file(&self.temp_video_path);
                let _ = fs::remove_file(temporary_mux_path(&self.config.path));
                return Err(error);
            }
            let _ = fs::remove_file(&self.temp_video_path);
        } else {
            replace_file(&self.temp_video_path, &self.config.path)?;
        }
        write_metadata(&self.config.path, &self.metadata)?;
        Ok(self.config.path.clone())
    }

    pub fn cancel(mut self) {
        self.stop_decoder();
        drop(self.encoder_stdin.take());
        if let Some(mut child) = self.encoder_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        let _ = fs::remove_file(&self.temp_video_path);
        let _ = fs::remove_file(temporary_mux_path(&self.config.path));
    }

    fn stop_decoder(&mut self) {
        if let Some(mut child) = self.decoder_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for OfflineExportSession {
    fn drop(&mut self) {
        if let Some(mut child) = self.decoder_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(mut child) = self.encoder_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn validate_config(config: &OfflineExportConfig) -> Result<(), String> {
    if !config.source_path.is_file() {
        return Err("offline export source file does not exist".into());
    }
    if config.source_width == 0 || config.source_height == 0 {
        return Err("offline export source dimensions are invalid".into());
    }
    if config.output_width == 0 || config.output_height == 0 {
        return Err("offline export dimensions must be greater than zero".into());
    }
    if config.output_width % 2 != 0 || config.output_height % 2 != 0 {
        return Err("offline MP4 dimensions must be even".into());
    }
    if !matches!(config.fps, 24 | 30 | 60) {
        return Err("offline export FPS must be 24, 30, or 60".into());
    }
    if !config.start_seconds.is_finite() || config.start_seconds < 0.0 {
        return Err("offline export start time is invalid".into());
    }
    if !config.duration_seconds.is_finite() || config.duration_seconds <= 0.0 {
        return Err("offline export duration must be greater than zero".into());
    }
    if !config.playback_rate.is_finite() || !(0.1..=4.0).contains(&config.playback_rate) {
        return Err("offline export playback rate must be between 0.1 and 4.0".into());
    }
    if !matches!(config.sampling.as_str(), "smooth" | "crisp") {
        return Err("offline export sampling must be smooth or crisp".into());
    }
    if !matches!(config.fit_mode.as_str(), "fit" | "crop" | "stretch") {
        return Err("offline export fit mode must be fit, crop, or stretch".into());
    }
    Ok(())
}

fn start_decoder(
    config: &OfflineExportConfig,
    total_frames: u64,
) -> Result<(Child, Receiver<DecoderEvent>), String> {
    let filter = format!(
        "setpts=(PTS-STARTPTS)/{:.9},fps=fps={}:round=near,format=bgra",
        config.playback_rate,
        config.fps
    );
    let mut command = Command::new("ffmpeg");
    command.args(["-hide_banner", "-loglevel", "error"]);
    if config.loop_source {
        command.args(["-stream_loop", "-1"]);
    }
    command
        .args(["-ss", &format!("{:.9}", config.start_seconds)])
        .arg("-i")
        .arg(&config.source_path)
        .args([
            "-an",
            "-vf",
            &filter,
            "-frames:v",
            &total_frames.to_string(),
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgra",
            "pipe:1",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("could not start offline FFmpeg decoder: {error}"))?;
    let Some(mut stdout) = child.stdout.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("offline decoder stdout is unavailable".into());
    };
    let Some(mut stderr) = child.stderr.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("offline decoder stderr is unavailable".into());
    };
    let (tx, rx) = sync_channel(DECODE_QUEUE_CAPACITY);
    let frame_bytes = config.source_width as usize
        * config.source_height as usize
        * 4;
    if let Err(error) = thread::Builder::new()
        .name("huff-offline-video-decoder".into())
        .spawn(move || decoder_reader_loop(&mut stdout, &mut stderr, frame_bytes, tx))
    {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!("could not start offline decoder reader: {error}"));
    }
    Ok((child, rx))
}

fn decoder_reader_loop(
    stdout: &mut impl Read,
    stderr: &mut impl Read,
    frame_bytes: usize,
    tx: SyncSender<DecoderEvent>,
) {
    loop {
        let mut frame = vec![0_u8; frame_bytes];
        match stdout.read_exact(&mut frame) {
            Ok(()) => {
                if tx.send(DecoderEvent::Frame(frame)).is_err() {
                    return;
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => {
                let mut message = String::new();
                let _ = stderr.read_to_string(&mut message);
                if message.trim().is_empty() {
                    let _ = tx.send(DecoderEvent::Eof);
                } else {
                    let _ = tx.send(DecoderEvent::Error(format!(
                        "offline decoder ended early: {}",
                        message.trim()
                    )));
                }
                return;
            }
            Err(error) => {
                let mut message = String::new();
                let _ = stderr.read_to_string(&mut message);
                let detail = if message.trim().is_empty() {
                    error.to_string()
                } else {
                    message.trim().to_string()
                };
                let _ = tx.send(DecoderEvent::Error(format!(
                    "offline decoder read failed: {detail}"
                )));
                return;
            }
        }
    }
}

fn start_encoder(
    config: &OfflineExportConfig,
    temp_path: &Path,
) -> Result<(Child, ChildStdin), String> {
    if let Some(parent) = temp_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create export folder: {error}"))?;
    }
    let size = format!("{}x{}", config.output_width, config.output_height);
    let fps = config.fps.to_string();
    let mut command = Command::new("ffmpeg");
    command.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pixel_format",
        "rgba",
        "-video_size",
        &size,
        "-framerate",
        &fps,
        "-i",
        "-",
        "-an",
    ]);
    if has_encoder("libx264") {
        command.args([
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
        ]);
    } else {
        command.args(["-c:v", "mpeg4", "-q:v", "2", "-pix_fmt", "yuv420p"]);
    }
    let mut child = command
        .arg(temp_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("could not start offline FFmpeg encoder: {error}"))?;
    let Some(stdin) = child.stdin.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("offline encoder stdin is unavailable".into());
    };
    Ok((child, stdin))
}

fn mux_source_audio(config: &OfflineExportConfig, temp_video: &Path) -> Result<(), String> {
    let mux_path = temporary_mux_path(&config.path);
    let source_consumed = config.duration_seconds * config.playback_rate;
    let tempo = atempo_filter(config.playback_rate);
    let filter = format!(
        "atrim=duration={:.9},asetpts=PTS-STARTPTS,{},volume={:.6},apad=pad_dur={:.9},atrim=duration={:.9}",
        source_consumed,
        tempo,
        config.audio_volume.clamp(0.0, 2.0),
        config.duration_seconds,
        config.duration_seconds
    );
    let mut command = Command::new("ffmpeg");
    command.args(["-hide_banner", "-loglevel", "error", "-y"]);
    command.arg("-i").arg(temp_video);
    if config.loop_source {
        command.args(["-stream_loop", "-1"]);
    }
    command
        .args(["-ss", &format!("{:.9}", config.start_seconds)])
        .arg("-i")
        .arg(&config.source_path)
        .args([
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-filter:a",
            &filter,
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-t",
            &format!("{:.9}", config.duration_seconds),
            "-movflags",
            "+faststart",
        ])
        .arg(&mux_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let output = command
        .output()
        .map_err(|error| format!("could not start offline audio mux: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let _ = fs::remove_file(&mux_path);
        return Err(if stderr.is_empty() {
            format!("offline audio mux exited with {}", output.status)
        } else {
            format!("offline audio mux failed: {stderr}")
        });
    }
    replace_file(&mux_path, &config.path)
}

fn atempo_filter(rate: f64) -> String {
    let mut remaining = rate.clamp(0.1, 4.0);
    let mut stages = Vec::new();
    while remaining > 2.0 + f64::EPSILON {
        stages.push("atempo=2.0".to_string());
        remaining /= 2.0;
    }
    while remaining < 0.5 - f64::EPSILON {
        stages.push("atempo=0.5".to_string());
        remaining /= 0.5;
    }
    stages.push(format!("atempo={remaining:.9}"));
    stages.join(",")
}

fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        fs::remove_file(to)
            .map_err(|error| format!("could not replace {}: {error}", to.display()))?;
    }
    fs::rename(from, to).or_else(|_| {
        fs::copy(from, to)
            .map(|_| ())
            .and_then(|_| fs::remove_file(from))
    })
    .map_err(|error| format!("could not finalize {}: {error}", to.display()))
}

fn write_metadata(path: &Path, metadata: &OfflineExportMetadata) -> Result<(), String> {
    let metadata_path = metadata_path_for(path);
    let json = serde_json::to_vec_pretty(metadata)
        .map_err(|error| format!("could not serialize offline export metadata: {error}"))?;
    fs::write(&metadata_path, json)
        .map_err(|error| format!("could not write {}: {error}", metadata_path.display()))
}

fn temporary_video_path(path: &Path) -> PathBuf {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("huff-export");
    path.with_file_name(format!(".{stem}.huff-video.tmp.mp4"))
}

fn temporary_mux_path(path: &Path) -> PathBuf {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("huff-export");
    path.with_file_name(format!(".{stem}.huff-final.tmp.mp4"))
}

fn metadata_path_for(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("huff-export.mp4");
    path.with_file_name(format!("{name}.huff-offline.json"))
}

fn has_encoder(name: &str) -> bool {
    Command::new("ffmpeg")
        .args(["-hide_banner", "-encoders"])
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).contains(name))
        .unwrap_or(false)
}

fn ffmpeg_available() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}
