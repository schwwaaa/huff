use crate::output_frame::OutputFrame;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        mpsc::{sync_channel, Receiver, SyncSender, TrySendError},
        Arc, RwLock,
    },
    thread,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

const EXPORT_QUEUE_CAPACITY: usize = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StillExportConfig {
    pub path: PathBuf,
    pub width: u32,
    pub height: u32,
    pub source_width: u32,
    pub source_height: u32,
    pub sampling: String,
    pub fit_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StillExportMetadata {
    pub engine_build: String,
    pub captured_unix_ms: u128,
    pub active_source: String,
    pub source_file: String,
    pub source_position_seconds: f64,
    pub source_duration_seconds: f64,
    pub source_playback_rate: f64,
    pub render_width: u32,
    pub render_height: u32,
    pub export_width: u32,
    pub export_height: u32,
    pub sampling: String,
    pub fit_mode: String,
    pub parameter_revision: u64,
    pub parameter_values: Value,
}

impl StillExportMetadata {
    pub fn now_unix_ms() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportInfo {
    pub ffmpeg_available: bool,
    pub active: bool,
    pub phase: String,
    pub path: String,
    pub metadata_path: String,
    pub width: u32,
    pub height: u32,
    pub source_width: u32,
    pub source_height: u32,
    pub sampling: String,
    pub fit_mode: String,
    pub duration_seconds: f64,
    pub bytes_written: u64,
    pub completed_exports: u64,
    pub last_error: String,
}

impl Default for ExportInfo {
    fn default() -> Self {
        Self {
            ffmpeg_available: ffmpeg_available(),
            active: false,
            phase: "ready".into(),
            path: String::new(),
            metadata_path: String::new(),
            width: 0,
            height: 0,
            source_width: 0,
            source_height: 0,
            sampling: "smooth".into(),
            fit_mode: "fit".into(),
            duration_seconds: 0.0,
            bytes_written: 0,
            completed_exports: 0,
            last_error: String::new(),
        }
    }
}

enum ExportCommand {
    Encode {
        config: StillExportConfig,
        metadata: StillExportMetadata,
        frame: OutputFrame,
        started_at: Instant,
    },
    Shutdown,
}

#[derive(Clone)]
pub struct ExportHandle {
    tx: SyncSender<ExportCommand>,
    info: Arc<RwLock<ExportInfo>>,
}

impl ExportHandle {
    pub fn begin(&self, config: &StillExportConfig) -> Result<(), String> {
        let mut state = self
            .info
            .write()
            .map_err(|_| "export state is unavailable".to_string())?;
        if !state.ffmpeg_available {
            return Err("FFmpeg is unavailable; PNG export requires ffmpeg in PATH".into());
        }
        if state.active {
            return Err("another still export is already active".into());
        }
        state.active = true;
        state.phase = "capturing".into();
        state.path = config.path.display().to_string();
        state.metadata_path = metadata_path_for(&config.path).display().to_string();
        state.width = config.width;
        state.height = config.height;
        state.source_width = config.source_width;
        state.source_height = config.source_height;
        state.sampling = config.sampling.clone();
        state.fit_mode = config.fit_mode.clone();
        state.duration_seconds = 0.0;
        state.bytes_written = 0;
        state.last_error.clear();
        Ok(())
    }

    pub fn submit(
        &self,
        config: StillExportConfig,
        metadata: StillExportMetadata,
        frame: OutputFrame,
        started_at: Instant,
    ) -> Result<(), String> {
        if let Ok(mut state) = self.info.write() {
            state.phase = "encoding".into();
        }
        match self.tx.try_send(ExportCommand::Encode {
            config,
            metadata,
            frame,
            started_at,
        }) {
            Ok(()) => Ok(()),
            Err(TrySendError::Full(_)) => {
                let error = "still export encoder queue is full".to_string();
                self.fail(error.clone());
                Err(error)
            }
            Err(TrySendError::Disconnected(_)) => {
                let error = "still export worker is unavailable".to_string();
                self.fail(error.clone());
                Err(error)
            }
        }
    }

    pub fn fail(&self, error: String) {
        if let Ok(mut state) = self.info.write() {
            state.active = false;
            state.phase = "error".into();
            state.last_error = error;
        }
    }

    pub fn info(&self) -> ExportInfo {
        self.info.read().expect("export info poisoned").clone()
    }

    pub fn shutdown(&self) {
        let _ = self.tx.try_send(ExportCommand::Shutdown);
    }
}

pub fn start() -> Result<ExportHandle, String> {
    let (tx, rx) = sync_channel(EXPORT_QUEUE_CAPACITY);
    let info = Arc::new(RwLock::new(ExportInfo::default()));
    let thread_info = Arc::clone(&info);
    thread::Builder::new()
        .name("huff-native-still-export".into())
        .spawn(move || export_thread(rx, thread_info))
        .map_err(|error| format!("could not start still export worker: {error}"))?;
    Ok(ExportHandle { tx, info })
}

fn export_thread(rx: Receiver<ExportCommand>, info: Arc<RwLock<ExportInfo>>) {
    while let Ok(command) = rx.recv() {
        match command {
            ExportCommand::Encode {
                config,
                metadata,
                frame,
                started_at,
            } => {
                let result = encode_png(&config.path, &frame)
                    .and_then(|_| write_metadata(&config.path, &metadata));
                let elapsed = started_at.elapsed().as_secs_f64();
                let bytes = fs::metadata(&config.path)
                    .map(|metadata| metadata.len())
                    .unwrap_or(0);
                if let Ok(mut state) = info.write() {
                    state.active = false;
                    state.duration_seconds = elapsed;
                    state.bytes_written = bytes;
                    match result {
                        Ok(()) => {
                            state.phase = "complete".into();
                            state.completed_exports = state.completed_exports.wrapping_add(1);
                            state.last_error.clear();
                        }
                        Err(error) => {
                            state.phase = "error".into();
                            state.last_error = error;
                        }
                    }
                }
            }
            ExportCommand::Shutdown => break,
        }
    }
}

fn encode_png(path: &Path, frame: &OutputFrame) -> Result<(), String> {
    if !frame.is_valid() {
        return Err("captured still frame is invalid".into());
    }
    let size = format!("{}x{}", frame.width, frame.height);
    let mut child = Command::new("ffmpeg")
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pixel_format",
            "rgba",
            "-video_size",
            size.as_str(),
            "-i",
            "-",
            "-frames:v",
            "1",
            "-compression_level",
            "6",
        ])
        .arg(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("could not start FFmpeg PNG encoder: {error}"))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "FFmpeg PNG encoder stdin is unavailable".to_string())?;
    stdin
        .write_all(frame.pixels.as_ref())
        .map_err(|error| format!("could not write PNG pixels to FFmpeg: {error}"))?;
    drop(stdin);
    let output = child
        .wait_with_output()
        .map_err(|error| format!("could not wait for FFmpeg PNG encoder: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("FFmpeg PNG encoder exited with {}", output.status)
        } else {
            format!("FFmpeg PNG encoder failed: {stderr}")
        });
    }
    Ok(())
}

fn write_metadata(path: &Path, metadata: &StillExportMetadata) -> Result<(), String> {
    let metadata_path = metadata_path_for(path);
    let json = serde_json::to_vec_pretty(metadata)
        .map_err(|error| format!("could not serialize export metadata: {error}"))?;
    fs::write(&metadata_path, json)
        .map_err(|error| format!("could not write {}: {error}", metadata_path.display()))
}

fn metadata_path_for(path: &Path) -> PathBuf {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("huff-still");
    path.with_file_name(format!("{stem}.huff-export.json"))
}

fn ffmpeg_available() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}
