use crate::automation::AutomationClip;
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

pub const PROFILE_H264: &str = "h264";
pub const PROFILE_PRORES_HQ: &str = "prores_hq";
pub const PROFILE_PRORES_4444: &str = "prores_4444";
pub const PROFILE_FFV1: &str = "ffv1";
pub const PROFILE_PNG_SEQUENCE: &str = "png_sequence";

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
    pub profile: String,
    pub preserve_alpha: bool,
    #[serde(default)]
    pub automation_clip: Option<AutomationClip>,
    #[serde(default)]
    pub automation_loop: bool,
    #[serde(default)]
    pub queue_job_id: String,
}

impl OfflineExportConfig {
    pub fn total_frames(&self) -> u64 {
        (self.duration_seconds.max(0.0) * self.fps.max(1) as f64)
            .round()
            .max(1.0) as u64
    }

    pub fn is_image_sequence(&self) -> bool {
        self.profile == PROFILE_PNG_SEQUENCE
    }

    pub fn profile_label(&self) -> &'static str {
        profile_label(&self.profile)
    }

    pub fn output_kind(&self) -> &'static str {
        if self.is_image_sequence() {
            "image_sequence"
        } else {
            "video"
        }
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
    #[serde(default)]
    pub graph_mode: String,
    #[serde(default)]
    pub live_reference_width: u32,
    #[serde(default)]
    pub live_reference_height: u32,
    #[serde(default)]
    pub graph_history_width: u32,
    #[serde(default)]
    pub graph_history_height: u32,
    #[serde(default)]
    pub graph_history_capacity: u32,
    #[serde(default)]
    pub graph_estimated_gpu_bytes: u64,
    pub sampling: String,
    pub fit_mode: String,
    pub include_audio: bool,
    pub loop_source: bool,
    pub parameter_revision: u64,
    pub parameter_values: Value,
    pub deterministic_seed: u64,
    pub export_profile: String,
    pub export_profile_label: String,
    pub output_kind: String,
    pub container: String,
    pub video_codec: String,
    pub pixel_format: String,
    pub preserve_alpha: bool,
    #[serde(default)]
    pub automation_enabled: bool,
    #[serde(default)]
    pub automation_name: String,
    #[serde(default)]
    pub automation_duration_seconds: f64,
    #[serde(default)]
    pub automation_event_count: usize,
    #[serde(default)]
    pub automation_loop: bool,
    #[serde(default)]
    pub automation_clip: Option<AutomationClip>,
    pub frame_pattern: String,
    pub audio_artifact: String,
}

impl OfflineExportMetadata {
    pub fn now_unix_ms() -> u128 {
        unix_ms()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportArtifact {
    kind: String,
    path: String,
    pattern: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportJobManifest {
    schema_version: u32,
    job_id: String,
    queue_job_id: String,
    status: String,
    started_unix_ms: u128,
    finished_unix_ms: Option<u128>,
    rendered_frames: u64,
    total_frames: u64,
    output_path: String,
    output_kind: String,
    frame_pattern: String,
    audio_artifact: String,
    artifacts: Vec<ExportArtifact>,
    error: String,
    metadata: OfflineExportMetadata,
}

impl ExportJobManifest {
    fn new(config: &OfflineExportConfig, metadata: OfflineExportMetadata) -> Self {
        let started = unix_ms();
        Self {
            schema_version: 1,
            job_id: format!("hnw15-{started}-{}", std::process::id()),
            queue_job_id: config.queue_job_id.clone(),
            status: "running".into(),
            started_unix_ms: started,
            finished_unix_ms: None,
            rendered_frames: 0,
            total_frames: config.total_frames(),
            output_path: config.path.display().to_string(),
            output_kind: config.output_kind().into(),
            frame_pattern: frame_pattern_for(config),
            audio_artifact: audio_artifact_for(config),
            artifacts: Vec::new(),
            error: String::new(),
            metadata,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineExportInfo {
    pub ffmpeg_available: bool,
    pub active: bool,
    pub cancelling: bool,
    pub phase: String,
    pub queue_job_id: String,
    pub path: String,
    pub metadata_path: String,
    pub manifest_path: String,
    pub source_path: String,
    pub profile: String,
    pub profile_label: String,
    pub output_kind: String,
    pub frame_pattern: String,
    pub audio_artifact_path: String,
    pub preserve_alpha: bool,
    pub graph_mode: String,
    pub graph_history_width: u32,
    pub graph_history_height: u32,
    pub graph_history_capacity: u32,
    pub graph_estimated_gpu_bytes: u64,
    pub automation_enabled: bool,
    pub automation_name: String,
    pub automation_duration_seconds: f64,
    pub automation_event_count: usize,
    pub automation_loop: bool,
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
            queue_job_id: String::new(),
            path: String::new(),
            metadata_path: String::new(),
            manifest_path: String::new(),
            source_path: String::new(),
            profile: PROFILE_H264.into(),
            profile_label: profile_label(PROFILE_H264).into(),
            output_kind: "video".into(),
            frame_pattern: String::new(),
            audio_artifact_path: String::new(),
            preserve_alpha: false,
            graph_mode: "full_resolution".into(),
            graph_history_width: 0,
            graph_history_height: 0,
            graph_history_capacity: 0,
            graph_estimated_gpu_bytes: 0,
            automation_enabled: false,
            automation_name: String::new(),
            automation_duration_seconds: 0.0,
            automation_event_count: 0,
            automation_loop: false,
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
            return Err("FFmpeg is unavailable; deterministic export cannot start".into());
        }
        let mut state = self.info.write().expect("offline export info poisoned");
        if state.active {
            return Err("another deterministic export is already active".into());
        }
        self.cancel.store(false, Ordering::Release);
        state.active = true;
        state.cancelling = false;
        state.phase = "starting".into();
        state.queue_job_id = config.queue_job_id.clone();
        state.path = config.path.display().to_string();
        state.metadata_path = metadata_path_for(config).display().to_string();
        state.manifest_path = manifest_path_for(config).display().to_string();
        state.source_path = config.source_path.display().to_string();
        state.profile = config.profile.clone();
        state.profile_label = config.profile_label().into();
        state.output_kind = config.output_kind().into();
        state.frame_pattern = frame_pattern_for(config);
        state.audio_artifact_path = audio_artifact_for(config);
        state.preserve_alpha = config.preserve_alpha;
        state.graph_mode = "full_resolution".into();
        state.graph_history_width = 0;
        state.graph_history_height = 0;
        state.graph_history_capacity = 0;
        state.graph_estimated_gpu_bytes = 0;
        state.automation_enabled = config.automation_clip.is_some();
        state.automation_name = config
            .automation_clip
            .as_ref()
            .map(|clip| clip.name.clone())
            .unwrap_or_default();
        state.automation_duration_seconds = config
            .automation_clip
            .as_ref()
            .map(|clip| clip.duration_seconds)
            .unwrap_or(0.0);
        state.automation_event_count = config
            .automation_clip
            .as_ref()
            .map(|clip| clip.events.len())
            .unwrap_or(0);
        state.automation_loop = config.automation_loop;
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

    pub fn set_graph_topology(
        &self,
        history_width: u32,
        history_height: u32,
        history_capacity: u32,
        estimated_gpu_bytes: u64,
    ) {
        if let Ok(mut state) = self.info.write() {
            if state.active {
                state.graph_mode = "full_resolution".into();
                state.graph_history_width = history_width;
                state.graph_history_height = history_height;
                state.graph_history_capacity = history_capacity;
                state.graph_estimated_gpu_bytes = estimated_gpu_bytes;
            }
        }
    }

    pub fn update_progress(&self, rendered_frames: u64, total_frames: u64, started: Instant) {
        if let Ok(mut state) = self.info.write() {
            if !state.active {
                return;
            }
            state.phase = "rendering_full_graph".into();
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
        let bytes = path_size(path);
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
    temp_output_path: PathBuf,
    temp_mux_path: Option<PathBuf>,
    manifest: ExportJobManifest,
}

impl OfflineExportSession {
    pub fn start(
        config: OfflineExportConfig,
        metadata: OfflineExportMetadata,
    ) -> Result<Self, String> {
        validate_config(&config)?;
        let total_frames = config.total_frames();
        let temp_output_path = temporary_output_path(&config);
        prepare_temporary_output(&config, &temp_output_path)?;
        let encoder_target = encoder_target_path(&config, &temp_output_path);
        let (mut decoder_child, decoder_rx) = match start_decoder(&config, total_frames) {
            Ok(value) => value,
            Err(error) => {
                cleanup_path(&temp_output_path);
                return Err(error);
            }
        };
        let (encoder_child, encoder_stdin) = match start_encoder(&config, &encoder_target) {
            Ok(value) => value,
            Err(error) => {
                let _ = decoder_child.kill();
                let _ = decoder_child.wait();
                cleanup_path(&temp_output_path);
                return Err(error);
            }
        };
        let manifest = ExportJobManifest::new(&config, metadata.clone());
        if let Err(error) = write_manifest(&config, &manifest) {
            let mut encoder_child = encoder_child;
            let _ = decoder_child.kill();
            let _ = decoder_child.wait();
            let _ = encoder_child.kill();
            let _ = encoder_child.wait();
            cleanup_path(&temp_output_path);
            return Err(error);
        }
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
            temp_output_path,
            temp_mux_path: None,
            manifest,
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
        self.manifest.rendered_frames = self.rendered_frames;
        Ok(())
    }

    pub fn finish(mut self) -> Result<PathBuf, String> {
        let result = self.finish_inner();
        if let Err(error) = &result {
            self.manifest.status = "failed".into();
            self.manifest.finished_unix_ms = Some(unix_ms());
            self.manifest.rendered_frames = self.rendered_frames;
            self.manifest.error = error.clone();
            let _ = write_manifest(&self.config, &self.manifest);
            self.cleanup_temporary_outputs();
        }
        result
    }

    fn finish_inner(&mut self) -> Result<PathBuf, String> {
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
            return Err(if stderr.is_empty() {
                format!("offline encoder exited with {}", encoder_output.status)
            } else {
                format!("offline encoder failed: {stderr}")
            });
        }

        if self.config.is_image_sequence() {
            if self.config.include_audio {
                render_sequence_audio(&self.config, &self.temp_output_path)?;
            }
            finalize_sequence_directory(&self.temp_output_path, &self.config.path)?;
        } else if self.config.include_audio {
            let mux_path = temporary_mux_path(&self.config);
            self.temp_mux_path = Some(mux_path.clone());
            mux_source_audio(&self.config, &self.temp_output_path, &mux_path)?;
            cleanup_path(&self.temp_output_path);
            replace_file(&mux_path, &self.config.path)?;
            self.temp_mux_path = None;
        } else {
            replace_file(&self.temp_output_path, &self.config.path)?;
        }

        write_metadata(&self.config, &self.metadata)?;
        self.manifest.status = "complete".into();
        self.manifest.finished_unix_ms = Some(unix_ms());
        self.manifest.rendered_frames = self.rendered_frames;
        self.manifest.error.clear();
        self.manifest.artifacts = completed_artifacts(&self.config);
        write_manifest(&self.config, &self.manifest)?;
        if self.config.is_image_sequence() {
            write_internal_sequence_manifest(&self.config, &self.manifest)?;
        }
        Ok(self.config.path.clone())
    }

    pub fn cancel(mut self) {
        self.stop_processes();
        self.cleanup_temporary_outputs();
        self.manifest.status = "cancelled".into();
        self.manifest.finished_unix_ms = Some(unix_ms());
        self.manifest.rendered_frames = self.rendered_frames;
        self.manifest.error.clear();
        let _ = write_manifest(&self.config, &self.manifest);
    }

    pub fn fail(mut self, error: &str) {
        self.stop_processes();
        self.cleanup_temporary_outputs();
        self.manifest.status = "failed".into();
        self.manifest.finished_unix_ms = Some(unix_ms());
        self.manifest.rendered_frames = self.rendered_frames;
        self.manifest.error = error.into();
        let _ = write_manifest(&self.config, &self.manifest);
    }

    fn stop_processes(&mut self) {
        self.stop_decoder();
        drop(self.encoder_stdin.take());
        if let Some(mut child) = self.encoder_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn stop_decoder(&mut self) {
        if let Some(mut child) = self.decoder_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn cleanup_temporary_outputs(&mut self) {
        cleanup_path(&self.temp_output_path);
        if let Some(path) = self.temp_mux_path.take() {
            cleanup_path(&path);
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

pub fn profile_label(profile: &str) -> &'static str {
    match profile {
        PROFILE_PRORES_HQ => "Apple ProRes 422 HQ",
        PROFILE_PRORES_4444 => "Apple ProRes 4444",
        PROFILE_FFV1 => "FFV1 Lossless",
        PROFILE_PNG_SEQUENCE => "PNG Image Sequence",
        _ => "H.264 MP4",
    }
}

pub fn profile_extension(profile: &str) -> Result<&'static str, String> {
    match profile {
        PROFILE_H264 => Ok("mp4"),
        PROFILE_PRORES_HQ | PROFILE_PRORES_4444 => Ok("mov"),
        PROFILE_FFV1 => Ok("mkv"),
        PROFILE_PNG_SEQUENCE => Ok(""),
        _ => Err(format!("unknown deterministic export profile: {profile}")),
    }
}

pub fn profile_supports_alpha(profile: &str) -> bool {
    matches!(
        profile,
        PROFILE_PRORES_4444 | PROFILE_FFV1 | PROFILE_PNG_SEQUENCE
    )
}

pub fn profile_requires_even_dimensions(profile: &str) -> bool {
    matches!(profile, PROFILE_H264 | PROFILE_PRORES_HQ)
}

pub fn profile_codec(profile: &str) -> Result<String, String> {
    match profile {
        PROFILE_H264 => Ok(if has_encoder("libx264") {
            "libx264".into()
        } else {
            "mpeg4".into()
        }),
        PROFILE_PRORES_HQ | PROFILE_PRORES_4444 => Ok("prores_ks".into()),
        PROFILE_FFV1 => Ok("ffv1".into()),
        PROFILE_PNG_SEQUENCE => Ok("png".into()),
        _ => Err(format!("unknown deterministic export profile: {profile}")),
    }
}

pub fn profile_container(profile: &str) -> Result<&'static str, String> {
    match profile {
        PROFILE_H264 => Ok("mp4"),
        PROFILE_PRORES_HQ | PROFILE_PRORES_4444 => Ok("mov"),
        PROFILE_FFV1 => Ok("matroska"),
        PROFILE_PNG_SEQUENCE => Ok("image2"),
        _ => Err(format!("unknown deterministic export profile: {profile}")),
    }
}

pub fn profile_pixel_format(profile: &str, preserve_alpha: bool) -> Result<&'static str, String> {
    match profile {
        PROFILE_H264 => Ok("yuv420p"),
        PROFILE_PRORES_HQ => Ok("yuv422p10le"),
        PROFILE_PRORES_4444 => Ok(if preserve_alpha {
            "yuva444p10le"
        } else {
            "yuv444p10le"
        }),
        PROFILE_FFV1 => Ok(if preserve_alpha { "bgra" } else { "bgr0" }),
        PROFILE_PNG_SEQUENCE => Ok(if preserve_alpha { "rgba" } else { "rgb24" }),
        _ => Err(format!("unknown deterministic export profile: {profile}")),
    }
}

pub fn validate_profile_support(profile: &str, preserve_alpha: bool) -> Result<(), String> {
    profile_extension(profile)?;
    if preserve_alpha && !profile_supports_alpha(profile) {
        return Err(format!(
            "{} does not support alpha output",
            profile_label(profile)
        ));
    }
    let required = match profile {
        PROFILE_PRORES_HQ | PROFILE_PRORES_4444 => Some("prores_ks"),
        PROFILE_FFV1 => Some("ffv1"),
        PROFILE_PNG_SEQUENCE => Some("png"),
        PROFILE_H264 => None,
        _ => None,
    };
    if let Some(encoder) = required {
        if !has_encoder(encoder) {
            return Err(format!(
                "FFmpeg encoder {encoder} is unavailable; {} cannot start",
                profile_label(profile)
            ));
        }
    }
    Ok(())
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
    if profile_requires_even_dimensions(&config.profile)
        && (config.output_width % 2 != 0 || config.output_height % 2 != 0)
    {
        return Err(format!(
            "{} dimensions must be even",
            profile_label(&config.profile)
        ));
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
    validate_profile_support(&config.profile, config.preserve_alpha)?;
    if config.automation_loop && config.automation_clip.is_none() {
        return Err("automation looping requires an automation clip".into());
    }
    if let Some(clip) = &config.automation_clip {
        crate::automation::normalize_clip(clip.clone())?;
    }
    if config.is_image_sequence() && config.path.exists() {
        return Err("PNG sequence destination already exists; choose a new folder name".into());
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
    target: &Path,
) -> Result<(Child, ChildStdin), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create export folder: {error}"))?;
    }
    let size = format!("{}x{}", config.output_width, config.output_height);
    let fps = config.fps.to_string();
    let pixel_format = profile_pixel_format(&config.profile, config.preserve_alpha)?;
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

    match config.profile.as_str() {
        PROFILE_H264 => {
            if has_encoder("libx264") {
                command.args([
                    "-c:v",
                    "libx264",
                    "-preset",
                    "medium",
                    "-crf",
                    "18",
                    "-pix_fmt",
                    pixel_format,
                    "-movflags",
                    "+faststart",
                ]);
            } else {
                command.args(["-c:v", "mpeg4", "-q:v", "2", "-pix_fmt", pixel_format]);
            }
        }
        PROFILE_PRORES_HQ => {
            command.args([
                "-c:v",
                "prores_ks",
                "-profile:v",
                "3",
                "-vendor",
                "apl0",
                "-pix_fmt",
                pixel_format,
            ]);
        }
        PROFILE_PRORES_4444 => {
            command.args([
                "-c:v",
                "prores_ks",
                "-profile:v",
                "4",
                "-vendor",
                "apl0",
                "-pix_fmt",
                pixel_format,
            ]);
        }
        PROFILE_FFV1 => {
            command.args([
                "-c:v",
                "ffv1",
                "-level",
                "3",
                "-coder",
                "1",
                "-context",
                "1",
                "-slicecrc",
                "1",
                "-g",
                "1",
                "-pix_fmt",
                pixel_format,
            ]);
        }
        PROFILE_PNG_SEQUENCE => {
            command.args([
                "-c:v",
                "png",
                "-compression_level",
                "6",
                "-pred",
                "mixed",
                "-pix_fmt",
                pixel_format,
                "-start_number",
                "0",
                "-fps_mode",
                "passthrough",
            ]);
        }
        _ => return Err(format!("unknown deterministic export profile: {}", config.profile)),
    }

    let mut child = command
        .arg(target)
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

fn mux_source_audio(
    config: &OfflineExportConfig,
    temp_video: &Path,
    mux_path: &Path,
) -> Result<(), String> {
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
        ]);
    match config.profile.as_str() {
        PROFILE_H264 => {
            command.args(["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]);
        }
        PROFILE_PRORES_HQ | PROFILE_PRORES_4444 => {
            command.args(["-c:a", "pcm_s24le"]);
        }
        PROFILE_FFV1 => {
            command.args(["-c:a", "flac"]);
        }
        _ => return Err("selected output profile cannot contain muxed audio".into()),
    }
    command
        .args(["-t", &format!("{:.9}", config.duration_seconds)])
        .arg(mux_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let output = command
        .output()
        .map_err(|error| format!("could not start offline audio mux: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        cleanup_path(mux_path);
        return Err(if stderr.is_empty() {
            format!("offline audio mux exited with {}", output.status)
        } else {
            format!("offline audio mux failed: {stderr}")
        });
    }
    Ok(())
}

fn render_sequence_audio(config: &OfflineExportConfig, temp_directory: &Path) -> Result<(), String> {
    let audio_path = temp_directory.join("audio.wav");
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
    if config.loop_source {
        command.args(["-stream_loop", "-1"]);
    }
    command
        .args(["-ss", &format!("{:.9}", config.start_seconds)])
        .arg("-i")
        .arg(&config.source_path)
        .args([
            "-vn",
            "-filter:a",
            &filter,
            "-c:a",
            "pcm_s24le",
            "-t",
            &format!("{:.9}", config.duration_seconds),
        ])
        .arg(&audio_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let output = command
        .output()
        .map_err(|error| format!("could not export PNG-sequence audio: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        cleanup_path(&audio_path);
        return Err(if stderr.is_empty() {
            format!("PNG-sequence audio export exited with {}", output.status)
        } else {
            format!("PNG-sequence audio export failed: {stderr}")
        });
    }
    Ok(())
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

fn prepare_temporary_output(config: &OfflineExportConfig, temp_path: &Path) -> Result<(), String> {
    cleanup_path(temp_path);
    if config.is_image_sequence() {
        fs::create_dir_all(temp_path)
            .map_err(|error| format!("could not create temporary PNG sequence folder: {error}"))
    } else if let Some(parent) = temp_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create export folder: {error}"))
    } else {
        Ok(())
    }
}

fn encoder_target_path(config: &OfflineExportConfig, temp_path: &Path) -> PathBuf {
    if config.is_image_sequence() {
        temp_path.join("frame_%06d.png")
    } else {
        temp_path.to_path_buf()
    }
}

fn finalize_sequence_directory(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        return Err(format!(
            "PNG sequence destination already exists: {}",
            to.display()
        ));
    }
    fs::rename(from, to)
        .map_err(|error| format!("could not finalize PNG sequence {}: {error}", to.display()))
}

fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        fs::remove_file(to)
            .map_err(|error| format!("could not replace {}: {error}", to.display()))?;
    }
    fs::rename(from, to)
        .or_else(|_| {
            fs::copy(from, to)
                .map(|_| ())
                .and_then(|_| fs::remove_file(from))
        })
        .map_err(|error| format!("could not finalize {}: {error}", to.display()))
}

fn write_metadata(config: &OfflineExportConfig, metadata: &OfflineExportMetadata) -> Result<(), String> {
    let metadata_path = metadata_path_for(config);
    if let Some(parent) = metadata_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create metadata folder: {error}"))?;
    }
    let json = serde_json::to_vec_pretty(metadata)
        .map_err(|error| format!("could not serialize offline export metadata: {error}"))?;
    fs::write(&metadata_path, json)
        .map_err(|error| format!("could not write {}: {error}", metadata_path.display()))
}

fn write_manifest(config: &OfflineExportConfig, manifest: &ExportJobManifest) -> Result<(), String> {
    let path = manifest_path_for(config);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create manifest folder: {error}"))?;
    }
    let json = serde_json::to_vec_pretty(manifest)
        .map_err(|error| format!("could not serialize export-job manifest: {error}"))?;
    fs::write(&path, json)
        .map_err(|error| format!("could not write {}: {error}", path.display()))
}

fn write_internal_sequence_manifest(
    config: &OfflineExportConfig,
    manifest: &ExportJobManifest,
) -> Result<(), String> {
    let path = config.path.join("huff-export-job.json");
    let json = serde_json::to_vec_pretty(manifest)
        .map_err(|error| format!("could not serialize sequence manifest: {error}"))?;
    fs::write(&path, json)
        .map_err(|error| format!("could not write {}: {error}", path.display()))
}

fn completed_artifacts(config: &OfflineExportConfig) -> Vec<ExportArtifact> {
    let mut artifacts = Vec::new();
    if config.is_image_sequence() {
        artifacts.push(ExportArtifact {
            kind: "png_frames".into(),
            path: config.path.display().to_string(),
            pattern: frame_pattern_for(config),
        });
        if config.include_audio {
            artifacts.push(ExportArtifact {
                kind: "audio".into(),
                path: config.path.join("audio.wav").display().to_string(),
                pattern: String::new(),
            });
        }
    } else {
        artifacts.push(ExportArtifact {
            kind: "video".into(),
            path: config.path.display().to_string(),
            pattern: String::new(),
        });
    }
    artifacts.push(ExportArtifact {
        kind: "reproducibility_metadata".into(),
        path: metadata_path_for(config).display().to_string(),
        pattern: String::new(),
    });
    artifacts
}

fn temporary_output_path(config: &OfflineExportConfig) -> PathBuf {
    let name = config
        .path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("huff-export");
    if config.is_image_sequence() {
        config
            .path
            .with_file_name(format!(".{name}.huff-sequence.tmp"))
    } else {
        let extension = config
            .path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("tmp");
        let stem = config
            .path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("huff-export");
        config
            .path
            .with_file_name(format!(".{stem}.huff-video.tmp.{extension}"))
    }
}

fn temporary_mux_path(config: &OfflineExportConfig) -> PathBuf {
    let extension = config
        .path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("tmp");
    let stem = config
        .path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("huff-export");
    config
        .path
        .with_file_name(format!(".{stem}.huff-final.tmp.{extension}"))
}

fn metadata_path_for(config: &OfflineExportConfig) -> PathBuf {
    if config.is_image_sequence() {
        config.path.join("huff-offline.json")
    } else {
        let name = config
            .path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("huff-export");
        config
            .path
            .with_file_name(format!("{name}.huff-offline.json"))
    }
}

fn manifest_path_for(config: &OfflineExportConfig) -> PathBuf {
    let name = config
        .path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("huff-export");
    config
        .path
        .with_file_name(format!("{name}.huff-export-job.json"))
}

fn frame_pattern_for(config: &OfflineExportConfig) -> String {
    if config.is_image_sequence() {
        config.path.join("frame_%06d.png").display().to_string()
    } else {
        String::new()
    }
}

fn audio_artifact_for(config: &OfflineExportConfig) -> String {
    if !config.include_audio {
        return String::new();
    }
    if config.is_image_sequence() {
        config.path.join("audio.wav").display().to_string()
    } else {
        config.path.display().to_string()
    }
}

fn cleanup_path(path: &Path) {
    if path.is_dir() {
        let _ = fs::remove_dir_all(path);
    } else {
        let _ = fs::remove_file(path);
    }
}

fn path_size(path: &Path) -> u64 {
    if path.is_file() {
        return fs::metadata(path).map(|value| value.len()).unwrap_or(0);
    }
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| path_size(&entry.path()))
        .sum()
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

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}
