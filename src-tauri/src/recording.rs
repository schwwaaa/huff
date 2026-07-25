use crate::output_frame::OutputFrame;
use bytemuck::cast_slice;
use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering},
        mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender, TrySendError},
        Arc, Mutex, RwLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const AUDIO_QUEUE_CAPACITY: usize = 96;
const COMMAND_QUEUE_CAPACITY: usize = 16;
const AUDIO_SOURCE_NONE: u8 = 0;
const AUDIO_SOURCE_VIDEO: u8 = 1;
const AUDIO_SOURCE_MICROPHONE: u8 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordingAudioSource {
    Video,
    Microphone,
}

impl RecordingAudioSource {
    fn code(self) -> u8 {
        match self {
            Self::Video => AUDIO_SOURCE_VIDEO,
            Self::Microphone => AUDIO_SOURCE_MICROPHONE,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Video => "video",
            Self::Microphone => "microphone",
        }
    }
}

#[derive(Debug, Clone)]
pub struct RecordingStartConfig {
    pub path: PathBuf,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub audio_source: Option<RecordingAudioSource>,
    pub audio_sample_rate: u32,
    pub audio_channels: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingInfo {
    pub ffmpeg_available: bool,
    pub active: bool,
    pub finalizing: bool,
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub audio_source: String,
    pub audio_sample_rate: u32,
    pub audio_channels: u16,
    pub duration_seconds: f64,
    pub video_frames: u64,
    pub duplicated_frames: u64,
    pub skipped_frames: u64,
    pub rejected_frames: u64,
    pub video_submission_drops: u64,
    pub audio_samples: u64,
    pub audio_dropped_chunks: u64,
    pub audio_queue_depth: u32,
    pub estimated_bytes: u64,
    pub last_error: String,
}

impl Default for RecordingInfo {
    fn default() -> Self {
        Self {
            ffmpeg_available: ffmpeg_available(),
            active: false,
            finalizing: false,
            path: String::new(),
            width: 0,
            height: 0,
            fps: 0,
            audio_source: "none".into(),
            audio_sample_rate: 0,
            audio_channels: 0,
            duration_seconds: 0.0,
            video_frames: 0,
            duplicated_frames: 0,
            skipped_frames: 0,
            rejected_frames: 0,
            video_submission_drops: 0,
            audio_samples: 0,
            audio_dropped_chunks: 0,
            audio_queue_depth: 0,
            estimated_bytes: 0,
            last_error: String::new(),
        }
    }
}

struct AudioChunk {
    captured_at: Instant,
    source: RecordingAudioSource,
    source_sample_start: u64,
    sample_rate: u32,
    channels: u16,
    samples: Vec<f32>,
}

#[derive(Clone)]
pub struct RecordingAudioTap {
    tx: SyncSender<AudioChunk>,
    active: Arc<AtomicBool>,
    source: Arc<AtomicU8>,
    dropped: Arc<AtomicU64>,
    queued: Arc<AtomicU64>,
    video_sample_cursor: Arc<AtomicU64>,
    microphone_sample_cursor: Arc<AtomicU64>,
}

impl RecordingAudioTap {
    pub fn accepts(&self, source: RecordingAudioSource) -> bool {
        self.active.load(Ordering::Acquire)
            && self.source.load(Ordering::Acquire) == source.code()
    }

    pub fn submit(
        &self,
        source: RecordingAudioSource,
        sample_rate: u32,
        channels: u16,
        samples: &[f32],
    ) {
        if !self.accepts(source) || samples.is_empty() {
            return;
        }
        let cursor = match source {
            RecordingAudioSource::Video => &self.video_sample_cursor,
            RecordingAudioSource::Microphone => &self.microphone_sample_cursor,
        };
        let source_sample_start = cursor.fetch_add(samples.len() as u64, Ordering::Relaxed);
        let chunk = AudioChunk {
            captured_at: Instant::now(),
            source,
            source_sample_start,
            sample_rate,
            channels: channels.max(1),
            samples: samples.to_vec(),
        };
        self.queued.fetch_add(1, Ordering::Relaxed);
        match self.tx.try_send(chunk) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) | Err(TrySendError::Disconnected(_)) => {
                self.queued.fetch_sub(1, Ordering::Relaxed);
                self.dropped.fetch_add(1, Ordering::Relaxed);
            }
        }
    }
}

enum RecordingCommand {
    Start {
        config: RecordingStartConfig,
        reply: SyncSender<Result<(), String>>,
    },
    Stop {
        reply: SyncSender<Result<(), String>>,
    },
    Shutdown,
}

#[derive(Clone)]
pub struct RecordingHandle {
    command_tx: SyncSender<RecordingCommand>,
    latest_video: Arc<Mutex<Option<OutputFrame>>>,
    latest_sequence: Arc<AtomicU64>,
    video_submission_drops: Arc<AtomicU64>,
    info: Arc<RwLock<RecordingInfo>>,
    audio_tap: RecordingAudioTap,
}

impl RecordingHandle {
    pub fn start(&self, config: RecordingStartConfig) -> Result<(), String> {
        let (reply_tx, reply_rx) = sync_channel(1);
        self.command_tx
            .send(RecordingCommand::Start {
                config,
                reply: reply_tx,
            })
            .map_err(|_| "recording worker is unavailable".to_string())?;
        reply_rx
            .recv_timeout(Duration::from_secs(8))
            .map_err(|_| "timed out starting native recording".to_string())?
    }

    pub fn stop(&self) -> Result<(), String> {
        let (reply_tx, reply_rx) = sync_channel(1);
        self.command_tx
            .send(RecordingCommand::Stop { reply: reply_tx })
            .map_err(|_| "recording worker is unavailable".to_string())?;
        reply_rx
            .recv_timeout(Duration::from_secs(90))
            .map_err(|_| "timed out finalizing native recording".to_string())?
    }

    pub fn shutdown(&self) {
        let _ = self.command_tx.try_send(RecordingCommand::Shutdown);
    }

    pub fn submit_video(&self, frame: OutputFrame) {
        if !self.info.read().map(|state| state.active).unwrap_or(false) {
            return;
        }
        if let Ok(mut slot) = self.latest_video.try_lock() {
            if slot.is_some() {
                self.video_submission_drops
                    .fetch_add(1, Ordering::Relaxed);
            }
            *slot = Some(frame);
            self.latest_sequence.fetch_add(1, Ordering::Release);
        } else {
            self.video_submission_drops
                .fetch_add(1, Ordering::Relaxed);
        }
    }

    pub fn info(&self) -> RecordingInfo {
        self.info.read().expect("recording info poisoned").clone()
    }

    pub fn audio_tap(&self) -> RecordingAudioTap {
        self.audio_tap.clone()
    }
}

pub fn start() -> Result<RecordingHandle, String> {
    let (command_tx, command_rx) = sync_channel(COMMAND_QUEUE_CAPACITY);
    let (audio_tx, audio_rx) = sync_channel(AUDIO_QUEUE_CAPACITY);
    let latest_video = Arc::new(Mutex::new(None));
    let latest_sequence = Arc::new(AtomicU64::new(0));
    let consumed_sequence = Arc::new(AtomicU64::new(0));
    let video_submission_drops = Arc::new(AtomicU64::new(0));
    let info = Arc::new(RwLock::new(RecordingInfo::default()));
    let audio_active = Arc::new(AtomicBool::new(false));
    let audio_source = Arc::new(AtomicU8::new(AUDIO_SOURCE_NONE));
    let audio_dropped = Arc::new(AtomicU64::new(0));
    let audio_queued = Arc::new(AtomicU64::new(0));
    let video_sample_cursor = Arc::new(AtomicU64::new(0));
    let microphone_sample_cursor = Arc::new(AtomicU64::new(0));

    let handle = RecordingHandle {
        command_tx,
        latest_video: Arc::clone(&latest_video),
        latest_sequence: Arc::clone(&latest_sequence),
        video_submission_drops: Arc::clone(&video_submission_drops),
        info: Arc::clone(&info),
        audio_tap: RecordingAudioTap {
            tx: audio_tx,
            active: Arc::clone(&audio_active),
            source: Arc::clone(&audio_source),
            dropped: Arc::clone(&audio_dropped),
            queued: Arc::clone(&audio_queued),
            video_sample_cursor: Arc::clone(&video_sample_cursor),
            microphone_sample_cursor: Arc::clone(&microphone_sample_cursor),
        },
    };

    thread::Builder::new()
        .name("huff-native-recorder".into())
        .spawn(move || {
            recording_thread(
                command_rx,
                audio_rx,
                latest_video,
                latest_sequence,
                consumed_sequence,
                video_submission_drops,
                info,
                audio_active,
                audio_source,
                audio_dropped,
                audio_queued,
                video_sample_cursor,
                microphone_sample_cursor,
            )
        })
        .map_err(|error| format!("could not start recording worker: {error}"))?;

    Ok(handle)
}

#[allow(clippy::too_many_arguments)]
fn recording_thread(
    command_rx: Receiver<RecordingCommand>,
    audio_rx: Receiver<AudioChunk>,
    latest_video: Arc<Mutex<Option<OutputFrame>>>,
    latest_sequence: Arc<AtomicU64>,
    consumed_sequence: Arc<AtomicU64>,
    video_submission_drops: Arc<AtomicU64>,
    info: Arc<RwLock<RecordingInfo>>,
    audio_active: Arc<AtomicBool>,
    audio_source: Arc<AtomicU8>,
    audio_dropped: Arc<AtomicU64>,
    audio_queued: Arc<AtomicU64>,
    video_sample_cursor: Arc<AtomicU64>,
    microphone_sample_cursor: Arc<AtomicU64>,
) {
    let mut session: Option<RecordingSession> = None;
    let mut running = true;
    while running {
        match command_rx.recv_timeout(Duration::from_millis(4)) {
            Ok(RecordingCommand::Start { config, reply }) => {
                audio_active.store(false, Ordering::Release);
                audio_source.store(AUDIO_SOURCE_NONE, Ordering::Release);
                if let Some(mut current) = session.take() {
                    let _ = current.finish();
                }
                clear_video_slot(&latest_video, &latest_sequence, &consumed_sequence);
                video_submission_drops.store(0, Ordering::Relaxed);
                audio_dropped.store(0, Ordering::Relaxed);
                drain_audio(&audio_rx, &audio_queued);
                video_sample_cursor.store(0, Ordering::Relaxed);
                microphone_sample_cursor.store(0, Ordering::Relaxed);
                let result = RecordingSession::begin(config.clone());
                match result {
                    Ok(next) => {
                        audio_source.store(
                            config
                                .audio_source
                                .map(RecordingAudioSource::code)
                                .unwrap_or(AUDIO_SOURCE_NONE),
                            Ordering::Release,
                        );
                        audio_active.store(config.audio_source.is_some(), Ordering::Release);
                        update_started_info(&info, &config);
                        session = Some(next);
                        let _ = reply.send(Ok(()));
                    }
                    Err(error) => {
                        audio_active.store(false, Ordering::Release);
                        audio_source.store(AUDIO_SOURCE_NONE, Ordering::Release);
                        set_error(&info, error.clone());
                        let _ = reply.send(Err(error));
                    }
                }
            }
            Ok(RecordingCommand::Stop { reply }) => {
                audio_active.store(false, Ordering::Release);
                audio_source.store(AUDIO_SOURCE_NONE, Ordering::Release);
                set_finalizing(&info, true);
                let result = if let Some(mut current) = session.take() {
                    while let Ok(chunk) = audio_rx.try_recv() {
                        decrement_queue_depth(&audio_queued);
                        current.push_audio(chunk);
                    }
                    current.finish()
                } else {
                    Ok(())
                };
                finish_info(&info, result.as_ref().err().cloned());
                let _ = reply.send(result);
            }
            Ok(RecordingCommand::Shutdown) => {
                audio_active.store(false, Ordering::Release);
                audio_source.store(AUDIO_SOURCE_NONE, Ordering::Release);
                if let Some(mut current) = session.take() {
                    set_finalizing(&info, true);
                    while let Ok(chunk) = audio_rx.try_recv() {
                        decrement_queue_depth(&audio_queued);
                        current.push_audio(chunk);
                    }
                    let result = current.finish();
                    finish_info(&info, result.err());
                }
                running = false;
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                running = false;
            }
        }

        if let Some(current) = session.as_mut() {
            let sequence = latest_sequence.load(Ordering::Acquire);
            if sequence != consumed_sequence.load(Ordering::Acquire) {
                if let Ok(mut slot) = latest_video.lock() {
                    if let Some(frame) = slot.take() {
                        consumed_sequence.store(sequence, Ordering::Release);
                        current.push_video(frame);
                    }
                }
            }
            for _ in 0..24 {
                match audio_rx.try_recv() {
                    Ok(chunk) => {
                        decrement_queue_depth(&audio_queued);
                        current.push_audio(chunk);
                    }
                    Err(_) => break,
                }
            }
            current.update_info(
                &info,
                video_submission_drops.load(Ordering::Relaxed),
                audio_dropped.load(Ordering::Relaxed),
                audio_queued.load(Ordering::Relaxed) as u32,
            );
        } else {
            drain_audio(&audio_rx, &audio_queued);
        }
    }
}

fn clear_video_slot(
    latest_video: &Arc<Mutex<Option<OutputFrame>>>,
    latest_sequence: &Arc<AtomicU64>,
    consumed_sequence: &Arc<AtomicU64>,
) {
    if let Ok(mut slot) = latest_video.lock() {
        *slot = None;
    }
    let sequence = latest_sequence.load(Ordering::Acquire);
    consumed_sequence.store(sequence, Ordering::Release);
}

fn drain_audio(audio_rx: &Receiver<AudioChunk>, queued: &AtomicU64) {
    while audio_rx.try_recv().is_ok() {}
    queued.store(0, Ordering::Relaxed);
}

fn decrement_queue_depth(queued: &AtomicU64) {
    let _ = queued.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |value| {
        Some(value.saturating_sub(1))
    });
}

struct RecordingSession {
    config: RecordingStartConfig,
    started_at: Instant,
    video_child: Child,
    video_stdin: Option<ChildStdin>,
    audio_child: Option<Child>,
    audio_stdin: Option<ChildStdin>,
    temp_video: PathBuf,
    temp_audio: Option<PathBuf>,
    last_frame: Option<Arc<[u8]>>,
    next_frame_index: u64,
    video_frames: u64,
    duplicated_frames: u64,
    skipped_frames: u64,
    rejected_frames: u64,
    audio_samples: u64,
    expected_audio_source: Option<RecordingAudioSource>,
    audio_origin_time: Option<Instant>,
    audio_origin_source_sample: u64,
    audio_origin_target_sample: u64,
}

impl RecordingSession {
    fn begin(config: RecordingStartConfig) -> Result<Self, String> {
        if config.width == 0 || config.height == 0 {
            return Err("recording dimensions must be non-zero".into());
        }
        if !matches!(config.fps, 30 | 60) {
            return Err("recording FPS must be 30 or 60".into());
        }
        if !ffmpeg_available() {
            return Err("FFmpeg is not available on PATH".into());
        }
        if let Some(parent) = config.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("could not create recording folder: {error}"))?;
        }
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let stem = config
            .path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("huff-recording");
        let parent = config.path.parent().unwrap_or_else(|| Path::new("."));
        let temp_video = parent.join(format!(".{stem}.{stamp}.huff-video.mp4"));
        let temp_audio = config
            .audio_source
            .map(|_| parent.join(format!(".{stem}.{stamp}.huff-audio.wav")));

        let (video_child, video_stdin) = spawn_video_encoder(
            &temp_video,
            config.width,
            config.height,
            config.fps,
        )?;
        let (audio_child, audio_stdin) = if let Some(path) = temp_audio.as_ref() {
            let (child, stdin) = spawn_audio_encoder(
                path,
                config.audio_sample_rate.max(1),
                config.audio_channels.max(1),
            )?;
            (Some(child), Some(stdin))
        } else {
            (None, None)
        };

        Ok(Self {
            expected_audio_source: config.audio_source,
            config,
            started_at: Instant::now(),
            video_child,
            video_stdin: Some(video_stdin),
            audio_child,
            audio_stdin,
            temp_video,
            temp_audio,
            last_frame: None,
            next_frame_index: 0,
            video_frames: 0,
            duplicated_frames: 0,
            skipped_frames: 0,
            rejected_frames: 0,
            audio_samples: 0,
            audio_origin_time: None,
            audio_origin_source_sample: 0,
            audio_origin_target_sample: 0,
        })
    }

    fn push_video(&mut self, frame: OutputFrame) {
        if !frame.is_valid()
            || frame.width != self.config.width
            || frame.height != self.config.height
        {
            self.rejected_frames = self.rejected_frames.wrapping_add(1);
            return;
        }
        let target_index = (frame
            .captured_at
            .saturating_duration_since(self.started_at)
            .as_secs_f64()
            * self.config.fps as f64)
            .floor() as u64;

        if self.last_frame.is_none() {
            while self.next_frame_index <= target_index {
                if self.write_video_bytes(&frame.pixels).is_err() {
                    self.rejected_frames = self.rejected_frames.wrapping_add(1);
                    return;
                }
                if self.next_frame_index < target_index {
                    self.duplicated_frames = self.duplicated_frames.wrapping_add(1);
                }
                self.next_frame_index = self.next_frame_index.wrapping_add(1);
            }
        } else if target_index >= self.next_frame_index {
            while self.next_frame_index < target_index {
                let previous = self.last_frame.as_ref().cloned();
                let Some(previous) = previous else { break };
                if self.write_video_bytes(&previous).is_err() {
                    self.rejected_frames = self.rejected_frames.wrapping_add(1);
                    return;
                }
                self.duplicated_frames = self.duplicated_frames.wrapping_add(1);
                self.next_frame_index = self.next_frame_index.wrapping_add(1);
            }
            if self.write_video_bytes(&frame.pixels).is_err() {
                self.rejected_frames = self.rejected_frames.wrapping_add(1);
                return;
            }
            self.next_frame_index = self.next_frame_index.wrapping_add(1);
        } else {
            self.skipped_frames = self.skipped_frames.wrapping_add(1);
        }
        self.last_frame = Some(Arc::clone(&frame.pixels));
    }

    fn write_video_bytes(&mut self, pixels: &[u8]) -> Result<(), String> {
        let Some(stdin) = self.video_stdin.as_mut() else {
            return Err("video encoder stdin is closed".into());
        };
        stdin
            .write_all(pixels)
            .map_err(|error| format!("video encoder write failed: {error}"))?;
        self.video_frames = self.video_frames.wrapping_add(1);
        Ok(())
    }

    fn push_audio(&mut self, chunk: AudioChunk) {
        if self.expected_audio_source != Some(chunk.source)
            || chunk.sample_rate != self.config.audio_sample_rate
            || chunk.channels != self.config.audio_channels
        {
            return;
        }
        let target_start = if self.audio_origin_time.is_some() {
            self.audio_origin_target_sample.saturating_add(
                chunk
                    .source_sample_start
                    .saturating_sub(self.audio_origin_source_sample),
            )
        } else {
            let target = (chunk
                .captured_at
                .saturating_duration_since(self.started_at)
                .as_secs_f64()
                * self.config.audio_sample_rate.max(1) as f64
                * self.config.audio_channels.max(1) as f64)
                .floor() as u64;
            self.audio_origin_time = Some(chunk.captured_at);
            self.audio_origin_source_sample = chunk.source_sample_start;
            self.audio_origin_target_sample = target;
            target
        };
        if self.audio_samples < target_start {
            if self.write_audio_silence(target_start - self.audio_samples).is_err() {
                return;
            }
        }
        let overlap = self.audio_samples.saturating_sub(target_start) as usize;
        if overlap >= chunk.samples.len() {
            return;
        }
        let _ = self.write_audio_samples(&chunk.samples[overlap..]);
    }

    fn write_audio_samples(&mut self, samples: &[f32]) -> Result<(), String> {
        let Some(stdin) = self.audio_stdin.as_mut() else {
            return Ok(());
        };
        stdin
            .write_all(cast_slice(samples))
            .map_err(|error| format!("audio encoder write failed: {error}"))?;
        self.audio_samples = self.audio_samples.wrapping_add(samples.len() as u64);
        Ok(())
    }

    fn write_audio_silence(&mut self, mut count: u64) -> Result<(), String> {
        if self.audio_stdin.is_none() {
            return Ok(());
        }
        let zeros = vec![0.0f32; 4096];
        while count > 0 {
            let chunk = count.min(zeros.len() as u64) as usize;
            self.write_audio_samples(&zeros[..chunk])?;
            count -= chunk as u64;
        }
        Ok(())
    }

    fn update_info(
        &self,
        info: &Arc<RwLock<RecordingInfo>>,
        video_submission_drops: u64,
        audio_dropped_chunks: u64,
        audio_queue_depth: u32,
    ) {
        if let Ok(mut state) = info.write() {
            state.duration_seconds = self.started_at.elapsed().as_secs_f64();
            state.video_frames = self.video_frames;
            state.duplicated_frames = self.duplicated_frames;
            state.skipped_frames = self.skipped_frames;
            state.rejected_frames = self.rejected_frames;
            state.video_submission_drops = video_submission_drops;
            state.audio_samples = self.audio_samples;
            state.audio_dropped_chunks = audio_dropped_chunks;
            state.audio_queue_depth = audio_queue_depth;
            state.estimated_bytes = fs::metadata(&self.temp_video)
                .map(|metadata| metadata.len())
                .unwrap_or(0)
                + self
                    .temp_audio
                    .as_ref()
                    .and_then(|path| fs::metadata(path).ok())
                    .map(|metadata| metadata.len())
                    .unwrap_or(0);
        }
    }

    fn pad_audio_to_duration(&mut self, duration: Duration) -> Result<(), String> {
        if self.audio_stdin.is_none() {
            return Ok(());
        }
        let expected = (duration.as_secs_f64()
            * self.config.audio_sample_rate.max(1) as f64
            * self.config.audio_channels.max(1) as f64)
            .ceil() as u64;
        self.write_audio_silence(expected.saturating_sub(self.audio_samples))
    }

    fn finish(&mut self) -> Result<(), String> {
        let stop_duration = self.started_at.elapsed();
        let target_index = (stop_duration.as_secs_f64() * self.config.fps as f64)
            .ceil() as u64;
        if let Some(previous) = self.last_frame.as_ref().cloned() {
            while self.next_frame_index < target_index {
                self.write_video_bytes(&previous)?;
                self.duplicated_frames = self.duplicated_frames.wrapping_add(1);
                self.next_frame_index = self.next_frame_index.wrapping_add(1);
            }
        }
        self.video_stdin.take();
        let video_status = self
            .video_child
            .wait()
            .map_err(|error| format!("could not wait for video encoder: {error}"))?;
        if !video_status.success() {
            return Err(format!("video encoder exited with {video_status}"));
        }

        self.pad_audio_to_duration(stop_duration)?;
        self.audio_stdin.take();
        if let Some(child) = self.audio_child.as_mut() {
            let status = child
                .wait()
                .map_err(|error| format!("could not wait for audio encoder: {error}"))?;
            if !status.success() {
                return Err(format!("audio encoder exited with {status}"));
            }
        }

        if let Some(temp_audio) = self.temp_audio.as_ref() {
            mux_recording(&self.temp_video, temp_audio, &self.config.path)?;
            let _ = fs::remove_file(&self.temp_video);
            let _ = fs::remove_file(temp_audio);
        } else {
            move_file(&self.temp_video, &self.config.path)?;
        }
        Ok(())
    }
}

fn update_started_info(info: &Arc<RwLock<RecordingInfo>>, config: &RecordingStartConfig) {
    let mut state = info.write().expect("recording info poisoned");
    *state = RecordingInfo {
        ffmpeg_available: true,
        active: true,
        finalizing: false,
        path: config.path.display().to_string(),
        width: config.width,
        height: config.height,
        fps: config.fps,
        audio_source: config
            .audio_source
            .map(RecordingAudioSource::label)
            .unwrap_or("none")
            .into(),
        audio_sample_rate: if config.audio_source.is_some() {
            config.audio_sample_rate
        } else {
            0
        },
        audio_channels: if config.audio_source.is_some() {
            config.audio_channels
        } else {
            0
        },
        ..RecordingInfo::default()
    };
    state.ffmpeg_available = true;
    state.active = true;
}

fn set_finalizing(info: &Arc<RwLock<RecordingInfo>>, finalizing: bool) {
    if let Ok(mut state) = info.write() {
        state.active = false;
        state.finalizing = finalizing;
    }
}

fn finish_info(info: &Arc<RwLock<RecordingInfo>>, error: Option<String>) {
    if let Ok(mut state) = info.write() {
        state.active = false;
        state.finalizing = false;
        if let Some(error) = error {
            state.last_error = error;
        } else {
            state.last_error.clear();
        }
    }
}

fn set_error(info: &Arc<RwLock<RecordingInfo>>, error: String) {
    if let Ok(mut state) = info.write() {
        state.active = false;
        state.finalizing = false;
        state.last_error = error;
    }
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

fn ffmpeg_has_encoder(name: &str) -> bool {
    Command::new("ffmpeg")
        .args(["-hide_banner", "-encoders"])
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).contains(name))
        .unwrap_or(false)
}

fn spawn_video_encoder(
    path: &Path,
    width: u32,
    height: u32,
    fps: u32,
) -> Result<(Child, ChildStdin), String> {
    let encoder = if ffmpeg_has_encoder("libx264") {
        "libx264"
    } else {
        "mpeg4"
    };
    let video_size = format!("{width}x{height}");
    let fps_text = fps.to_string();
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
        video_size.as_str(),
        "-framerate",
        fps_text.as_str(),
        "-i",
        "-",
        "-an",
        "-c:v",
        encoder,
    ]);
    if encoder == "libx264" {
        command.args(["-preset", "veryfast", "-crf", "18"]);
    } else {
        command.args(["-q:v", "2"]);
    }
    command.args(["-pix_fmt", "yuv420p"]);
    command.arg(path);
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("could not start FFmpeg video encoder: {error}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "FFmpeg video encoder stdin is unavailable".to_string())?;
    Ok((child, stdin))
}

fn spawn_audio_encoder(
    path: &Path,
    sample_rate: u32,
    channels: u16,
) -> Result<(Child, ChildStdin), String> {
    let sample_rate_text = sample_rate.to_string();
    let channels_text = channels.to_string();
    let mut child = Command::new("ffmpeg")
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "f32le",
            "-ar",
            sample_rate_text.as_str(),
            "-ac",
            channels_text.as_str(),
            "-i",
            "-",
            "-c:a",
            "pcm_s16le",
        ])
        .arg(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("could not start FFmpeg audio encoder: {error}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "FFmpeg audio encoder stdin is unavailable".to_string())?;
    Ok((child, stdin))
}

fn mux_recording(video: &Path, audio: &Path, output: &Path) -> Result<(), String> {
    let status = Command::new("ffmpeg")
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
        ])
        .arg(video)
        .arg("-i")
        .arg(audio)
        .args([
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-movflags",
            "+faststart",
        ])
        .arg(output)
        .status()
        .map_err(|error| format!("could not start FFmpeg muxer: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("FFmpeg muxer exited with {status}"))
    }
}

fn move_file(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        fs::remove_file(to)
            .map_err(|error| format!("could not replace recording output: {error}"))?;
    }
    match fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(from, to)
                .map_err(|error| format!("could not copy recording output: {error}"))?;
            fs::remove_file(from)
                .map_err(|error| format!("could not remove temporary recording: {error}"))?;
            Ok(())
        }
    }
}
