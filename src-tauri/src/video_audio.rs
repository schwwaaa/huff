use crate::audio::{Analyzer, AudioSnapshot};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::VecDeque,
    io::Read,
    path::{Path, PathBuf},
    process::{Child, ChildStdout, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
        mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender, TrySendError},
        Arc, Mutex, RwLock,
    },
    thread,
    time::{Duration, Instant},
};

const ANALYSIS_CHUNK_FRAMES: usize = 1024;
const DECODE_CHUNK_FRAMES: usize = 1024;
const BUFFER_SECONDS: usize = 2;
const AUDIO_PIPE_STALL_TIMEOUT: Duration = Duration::from_secs(3);
const AUDIO_PIPE_QUEUE: usize = 4;

enum AudioPipeEvent {
    Chunk(Vec<u8>),
    Eof,
    Error(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoAudioInfo {
    pub ffmpeg_available: bool,
    pub loaded: bool,
    pub has_audio: bool,
    pub playing: bool,
    pub looping: bool,
    pub preview_enabled: bool,
    pub preview_running: bool,
    pub volume: f32,
    pub file_name: String,
    pub codec: String,
    pub source_sample_rate: u32,
    pub source_channels: u16,
    pub output_device: String,
    pub output_sample_rate: u32,
    pub output_channels: u16,
    pub decoded_samples: u64,
    pub played_samples: u64,
    pub decoder_stalls: u64,
    pub watchdog_restarts: u64,
    pub dropped_analysis_chunks: u64,
    pub output_underflows: u64,
    pub buffered_ms: f64,
    pub analysis_fps: f64,
    pub rms: f32,
    pub peak: f32,
    pub bass: f32,
    pub low_mid: f32,
    pub high_mid: f32,
    pub treble: f32,
    pub transient: f32,
    pub last_error: String,
}

impl Default for VideoAudioInfo {
    fn default() -> Self {
        Self {
            ffmpeg_available: false,
            loaded: false,
            has_audio: false,
            playing: false,
            looping: true,
            preview_enabled: true,
            preview_running: false,
            volume: 1.0,
            file_name: String::new(),
            codec: String::new(),
            source_sample_rate: 0,
            source_channels: 0,
            output_device: String::new(),
            output_sample_rate: 0,
            output_channels: 0,
            decoded_samples: 0,
            played_samples: 0,
            decoder_stalls: 0,
            watchdog_restarts: 0,
            dropped_analysis_chunks: 0,
            output_underflows: 0,
            buffered_ms: 0.0,
            analysis_fps: 0.0,
            rms: 0.0,
            peak: 0.0,
            bass: 0.0,
            low_mid: 0.0,
            high_mid: 0.0,
            treble: 0.0,
            transient: 0.0,
            last_error: String::new(),
        }
    }
}

#[derive(Debug, Clone)]
struct AudioMetadata {
    path: PathBuf,
    file_name: String,
    codec: String,
    source_sample_rate: u32,
    source_channels: u16,
}

#[derive(Debug)]
pub enum VideoAudioCommand {
    Open(PathBuf),
    Play(f64),
    Pause,
    Stop,
    Seek { seconds: f64, playing: bool },
    SetRate { rate: f64, position: f64, playing: bool },
    SetLoop(bool),
    SetPreview(bool),
    SetVolume(f32),
    Shutdown,
}

#[derive(Clone)]
pub struct VideoAudioHandle {
    tx: SyncSender<VideoAudioCommand>,
    info: Arc<RwLock<VideoAudioInfo>>,
    snapshot: Arc<RwLock<AudioSnapshot>>,
}

impl VideoAudioHandle {
    pub fn send(&self, command: VideoAudioCommand) {
        let _ = self.tx.try_send(command);
    }

    pub fn info(&self) -> VideoAudioInfo {
        self.info.read().expect("video audio info poisoned").clone()
    }

    pub fn snapshot(&self) -> Arc<RwLock<AudioSnapshot>> {
        Arc::clone(&self.snapshot)
    }
}

#[derive(Default)]
struct PlaybackCounters {
    decoded_samples: AtomicU64,
    played_samples: AtomicU64,
    dropped_analysis_chunks: AtomicU64,
    output_underflows: AtomicU64,
}

struct PlaybackShared {
    ring: Mutex<VecDeque<f32>>,
    preview_enabled: AtomicBool,
    volume_bits: AtomicU32,
    playing: AtomicBool,
    generation: AtomicU64,
    counters: PlaybackCounters,
}

impl PlaybackShared {
    fn clear(&self) {
        if let Ok(mut ring) = self.ring.lock() {
            ring.clear();
        }
    }
}

pub fn start() -> Result<VideoAudioHandle, String> {
    let (tx, rx) = sync_channel(128);
    let info = Arc::new(RwLock::new(VideoAudioInfo::default()));
    let snapshot = Arc::new(RwLock::new(AudioSnapshot::default()));
    let thread_info = Arc::clone(&info);
    let thread_snapshot = Arc::clone(&snapshot);

    thread::Builder::new()
        .name("huff-video-audio".into())
        .spawn(move || video_audio_thread(rx, thread_info, thread_snapshot))
        .map_err(|error| format!("could not start video audio thread: {error}"))?;

    Ok(VideoAudioHandle { tx, info, snapshot })
}

fn video_audio_thread(
    command_rx: Receiver<VideoAudioCommand>,
    info: Arc<RwLock<VideoAudioInfo>>,
    snapshot: Arc<RwLock<AudioSnapshot>>,
) {
    initialize_ffmpeg_status(&info);

    let host = cpal::default_host();
    let output_device = host.default_output_device();
    let Some(output_device) = output_device else {
        set_error(&info, "No default audio output device is available.".into());
        command_only_loop(command_rx, info);
        return;
    };

    let output_name = output_device.name().unwrap_or_else(|_| "default output".into());
    let supported = match output_device.default_output_config() {
        Ok(value) => value,
        Err(error) => {
            set_error(&info, format!("could not read default output format: {error}"));
            command_only_loop(command_rx, info);
            return;
        }
    };
    let sample_format = supported.sample_format();
    let stream_config: cpal::StreamConfig = supported.clone().into();
    let output_rate = stream_config.sample_rate.0.max(1);
    let output_channels = stream_config.channels.max(1) as usize;

    {
        let mut state = info.write().expect("video audio info poisoned");
        state.output_device = output_name;
        state.output_sample_rate = output_rate;
        state.output_channels = output_channels as u16;
    }

    let shared = Arc::new(PlaybackShared {
        ring: Mutex::new(VecDeque::with_capacity(
            output_rate as usize * output_channels * BUFFER_SECONDS,
        )),
        preview_enabled: AtomicBool::new(true),
        volume_bits: AtomicU32::new(1.0f32.to_bits()),
        playing: AtomicBool::new(false),
        generation: AtomicU64::new(1),
        counters: PlaybackCounters::default(),
    });

    let (analysis_tx, analysis_rx) = sync_channel::<Vec<f32>>(32);
    let output_stream = match build_output_stream(
        &output_device,
        &stream_config,
        sample_format,
        Arc::clone(&shared),
        analysis_tx,
        Arc::clone(&info),
    ) {
        Ok(stream) => stream,
        Err(error) => {
            set_error(&info, error);
            command_only_loop(command_rx, info);
            return;
        }
    };
    if let Err(error) = output_stream.play() {
        set_error(&info, format!("could not start output stream: {error}"));
        command_only_loop(command_rx, info);
        return;
    }
    info.write().expect("video audio info poisoned").preview_running = true;

    let mut analyzer = Analyzer::new(output_rate);
    let mut metadata: Option<AudioMetadata> = None;
    let mut rate = 1.0f64;
    let mut looping = true;
    let mut running = true;
    let mut last_metrics = Instant::now();

    while running {
        loop {
            match command_rx.try_recv() {
                Ok(VideoAudioCommand::Open(path)) => {
                    shared.generation.fetch_add(1, Ordering::AcqRel);
                    shared.clear();
                    shared.counters.decoded_samples.store(0, Ordering::Relaxed);
                    shared.counters.played_samples.store(0, Ordering::Relaxed);
                    shared.counters.dropped_analysis_chunks.store(0, Ordering::Relaxed);
                    shared.counters.output_underflows.store(0, Ordering::Relaxed);
                    *snapshot.write().expect("video audio snapshot poisoned") = AudioSnapshot::default();
                    match probe_audio(&path) {
                        Ok(next) => {
                            metadata = Some(next.clone());
                            rate = 1.0;
                            shared.playing.store(true, Ordering::Release);
                            if let Ok(mut state) = info.write() {
                                state.loaded = true;
                                state.has_audio = true;
                                state.playing = true;
                                state.file_name = next.file_name.clone();
                                state.codec = next.codec.clone();
                                state.source_sample_rate = next.source_sample_rate;
                                state.source_channels = next.source_channels;
                                state.last_error.clear();
                            }
                            launch_decoder(
                                next,
                                0.0,
                                rate,
                                looping,
                                output_rate,
                                output_channels,
                                Arc::clone(&shared),
                                Arc::clone(&info),
                            );
                        }
                        Err(error) => {
                            metadata = None;
                            shared.playing.store(false, Ordering::Release);
                            let mut state = info.write().expect("video audio info poisoned");
                            state.loaded = true;
                            state.has_audio = false;
                            state.playing = false;
                            state.file_name = path
                                .file_name()
                                .and_then(|value| value.to_str())
                                .unwrap_or("video")
                                .to_string();
                            state.codec.clear();
                            state.last_error = error;
                        }
                    }
                }
                Ok(VideoAudioCommand::Play(position)) => {
                    if let Some(current) = metadata.clone() {
                        shared.generation.fetch_add(1, Ordering::AcqRel);
                        shared.clear();
                        shared.counters.played_samples.store(0, Ordering::Relaxed);
                        shared.playing.store(true, Ordering::Release);
                        info.write().expect("video audio info poisoned").playing = true;
                        launch_decoder(
                            current,
                            position.max(0.0),
                            rate,
                            looping,
                            output_rate,
                            output_channels,
                            Arc::clone(&shared),
                            Arc::clone(&info),
                        );
                    }
                }
                Ok(VideoAudioCommand::Pause) => {
                    shared.generation.fetch_add(1, Ordering::AcqRel);
                    shared.playing.store(false, Ordering::Release);
                    shared.clear();
                    info.write().expect("video audio info poisoned").playing = false;
                }
                Ok(VideoAudioCommand::Stop) => {
                    shared.generation.fetch_add(1, Ordering::AcqRel);
                    shared.playing.store(false, Ordering::Release);
                    shared.clear();
                    info.write().expect("video audio info poisoned").playing = false;
                }
                Ok(VideoAudioCommand::Seek { seconds, playing }) => {
                    shared.generation.fetch_add(1, Ordering::AcqRel);
                    shared.clear();
                    shared.counters.played_samples.store(0, Ordering::Relaxed);
                    shared.playing.store(playing, Ordering::Release);
                    info.write().expect("video audio info poisoned").playing = playing;
                    if playing {
                        if let Some(current) = metadata.clone() {
                            launch_decoder(
                                current,
                                seconds.max(0.0),
                                rate,
                                looping,
                                output_rate,
                                output_channels,
                                Arc::clone(&shared),
                                Arc::clone(&info),
                            );
                        }
                    }
                }
                Ok(VideoAudioCommand::SetRate { rate: next_rate, position, playing }) => {
                    rate = next_rate.clamp(0.25, 4.0);
                    shared.generation.fetch_add(1, Ordering::AcqRel);
                    shared.clear();
                    shared.counters.played_samples.store(0, Ordering::Relaxed);
                    shared.playing.store(playing, Ordering::Release);
                    if playing {
                        if let Some(current) = metadata.clone() {
                            launch_decoder(
                                current,
                                position.max(0.0),
                                rate,
                                looping,
                                output_rate,
                                output_channels,
                                Arc::clone(&shared),
                                Arc::clone(&info),
                            );
                        }
                    }
                }
                Ok(VideoAudioCommand::SetLoop(value)) => {
                    looping = value;
                    info.write().expect("video audio info poisoned").looping = value;
                }
                Ok(VideoAudioCommand::SetPreview(value)) => {
                    shared.preview_enabled.store(value, Ordering::Release);
                    info.write().expect("video audio info poisoned").preview_enabled = value;
                }
                Ok(VideoAudioCommand::SetVolume(value)) => {
                    let clamped = value.clamp(0.0, 1.0);
                    shared.volume_bits.store(clamped.to_bits(), Ordering::Release);
                    info.write().expect("video audio info poisoned").volume = clamped;
                }
                Ok(VideoAudioCommand::Shutdown) => {
                    shared.generation.fetch_add(1, Ordering::AcqRel);
                    shared.playing.store(false, Ordering::Release);
                    running = false;
                    break;
                }
                Err(std::sync::mpsc::TryRecvError::Empty) => break,
                Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                    running = false;
                    break;
                }
            }
        }

        match analysis_rx.recv_timeout(Duration::from_millis(8)) {
            Ok(samples) => {
                analyzer.push_samples(&samples);
                if let Some(analysis_fps) = analyzer.analyze_available(&snapshot) {
                    let latest = snapshot.read().expect("video audio snapshot poisoned").clone();
                    let mut state = info.write().expect("video audio info poisoned");
                    state.analysis_fps = analysis_fps;
                    state.rms = latest.rms;
                    state.peak = latest.peak;
                    state.bass = latest.bass;
                    state.low_mid = latest.low_mid;
                    state.high_mid = latest.high_mid;
                    state.treble = latest.treble;
                    state.transient = latest.transient;
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => running = false,
        }

        if last_metrics.elapsed() >= Duration::from_millis(100) {
            let buffered_samples = shared.ring.lock().map(|ring| ring.len()).unwrap_or(0);
            let buffered_ms = buffered_samples as f64
                / output_channels as f64
                / output_rate as f64
                * 1000.0;
            let mut state = info.write().expect("video audio info poisoned");
            state.decoded_samples = shared.counters.decoded_samples.load(Ordering::Relaxed);
            state.played_samples = shared.counters.played_samples.load(Ordering::Relaxed);
            state.dropped_analysis_chunks = shared
                .counters
                .dropped_analysis_chunks
                .load(Ordering::Relaxed);
            state.output_underflows = shared.counters.output_underflows.load(Ordering::Relaxed);
            state.buffered_ms = buffered_ms;
            last_metrics = Instant::now();
        }
    }

    drop(output_stream);
    let mut state = info.write().expect("video audio info poisoned");
    state.playing = false;
    state.preview_running = false;
}

fn command_only_loop(command_rx: Receiver<VideoAudioCommand>, info: Arc<RwLock<VideoAudioInfo>>) {
    while let Ok(command) = command_rx.recv() {
        match command {
            VideoAudioCommand::SetPreview(value) => {
                info.write().expect("video audio info poisoned").preview_enabled = value;
            }
            VideoAudioCommand::SetVolume(value) => {
                info.write().expect("video audio info poisoned").volume = value.clamp(0.0, 1.0);
            }
            VideoAudioCommand::Shutdown => break,
            _ => {}
        }
    }
}

fn build_output_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sample_format: cpal::SampleFormat,
    shared: Arc<PlaybackShared>,
    analysis_tx: SyncSender<Vec<f32>>,
    info: Arc<RwLock<VideoAudioInfo>>,
) -> Result<cpal::Stream, String> {
    let channels = config.channels.max(1) as usize;
    let error_info = Arc::clone(&info);
    let error_callback = move |error: cpal::StreamError| {
        error_info.write().expect("video audio info poisoned").last_error =
            format!("video audio output stream error: {error}");
    };

    match sample_format {
        cpal::SampleFormat::F32 => {
            let shared = Arc::clone(&shared);
            let mut mono_chunk = Vec::with_capacity(ANALYSIS_CHUNK_FRAMES * 2);
            device
                .build_output_stream(
                    config,
                    move |data: &mut [f32], _| {
                        render_output_f32(data, channels, &shared, &analysis_tx, &mut mono_chunk)
                    },
                    error_callback,
                    None,
                )
                .map_err(|error| format!("could not build f32 output stream: {error}"))
        }
        cpal::SampleFormat::I16 => {
            let shared = Arc::clone(&shared);
            let mut mono_chunk = Vec::with_capacity(ANALYSIS_CHUNK_FRAMES * 2);
            device
                .build_output_stream(
                    config,
                    move |data: &mut [i16], _| {
                        render_output_i16(data, channels, &shared, &analysis_tx, &mut mono_chunk)
                    },
                    error_callback,
                    None,
                )
                .map_err(|error| format!("could not build i16 output stream: {error}"))
        }
        cpal::SampleFormat::U16 => {
            let shared = Arc::clone(&shared);
            let mut mono_chunk = Vec::with_capacity(ANALYSIS_CHUNK_FRAMES * 2);
            device
                .build_output_stream(
                    config,
                    move |data: &mut [u16], _| {
                        render_output_u16(data, channels, &shared, &analysis_tx, &mut mono_chunk)
                    },
                    error_callback,
                    None,
                )
                .map_err(|error| format!("could not build u16 output stream: {error}"))
        }
        other => Err(format!("unsupported output sample format: {other}")),
    }
}

fn render_frames<F>(
    output_len: usize,
    channels: usize,
    shared: &PlaybackShared,
    analysis_tx: &SyncSender<Vec<f32>>,
    mono_chunk: &mut Vec<f32>,
    mut write_sample: F,
) where
    F: FnMut(usize, f32),
{
    let playing = shared.playing.load(Ordering::Acquire);
    let audible = shared.preview_enabled.load(Ordering::Acquire);
    let volume = f32::from_bits(shared.volume_bits.load(Ordering::Acquire));
    if !playing {
        for index in 0..output_len {
            write_sample(index, 0.0);
        }
        return;
    }

    let mut underflow_frames = 0u64;
    if let Ok(mut ring) = shared.ring.lock() {
        let frame_count = output_len / channels;
        for frame_index in 0..frame_count {
            let output_offset = frame_index * channels;
            let mut mono = 0.0f32;
            let mut complete = true;
            for channel in 0..channels {
                let sample = if let Some(value) = ring.pop_front() {
                    value
                } else {
                    complete = false;
                    0.0
                };
                mono += sample;
                write_sample(output_offset + channel, if audible { sample * volume } else { 0.0 });
            }
            if !complete {
                underflow_frames += 1;
            }
            mono_chunk.push(if complete { mono / channels as f32 } else { 0.0 });
        }
        for index in frame_count * channels..output_len {
            write_sample(index, 0.0);
        }
    } else {
        for index in 0..output_len {
            write_sample(index, 0.0);
        }
        underflow_frames = (output_len / channels) as u64;
    }

    if underflow_frames > 0 {
        shared
            .counters
            .output_underflows
            .fetch_add(underflow_frames, Ordering::Relaxed);
    }
    let complete_frames = (output_len / channels).saturating_sub(underflow_frames as usize);
    shared
        .counters
        .played_samples
        .fetch_add((complete_frames * channels) as u64, Ordering::Relaxed);

    if mono_chunk.len() >= ANALYSIS_CHUNK_FRAMES {
        let mut next = Vec::with_capacity(ANALYSIS_CHUNK_FRAMES * 2);
        std::mem::swap(mono_chunk, &mut next);
        if let Err(TrySendError::Full(_)) = analysis_tx.try_send(next) {
            shared
                .counters
                .dropped_analysis_chunks
                .fetch_add(1, Ordering::Relaxed);
        }
    }
}

fn render_output_f32(
    data: &mut [f32],
    channels: usize,
    shared: &PlaybackShared,
    analysis_tx: &SyncSender<Vec<f32>>,
    mono_chunk: &mut Vec<f32>,
) {
    render_frames(
        data.len(),
        channels,
        shared,
        analysis_tx,
        mono_chunk,
        |index, sample| data[index] = sample,
    );
}

fn render_output_i16(
    data: &mut [i16],
    channels: usize,
    shared: &PlaybackShared,
    analysis_tx: &SyncSender<Vec<f32>>,
    mono_chunk: &mut Vec<f32>,
) {
    render_frames(
        data.len(),
        channels,
        shared,
        analysis_tx,
        mono_chunk,
        |index, sample| {
            data[index] = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        },
    );
}

fn render_output_u16(
    data: &mut [u16],
    channels: usize,
    shared: &PlaybackShared,
    analysis_tx: &SyncSender<Vec<f32>>,
    mono_chunk: &mut Vec<f32>,
) {
    render_frames(
        data.len(),
        channels,
        shared,
        analysis_tx,
        mono_chunk,
        |index, sample| {
            data[index] = ((sample.clamp(-1.0, 1.0) * 0.5 + 0.5) * u16::MAX as f32) as u16;
        },
    );
}

fn launch_decoder(
    metadata: AudioMetadata,
    start_seconds: f64,
    rate: f64,
    looping: bool,
    output_rate: u32,
    output_channels: usize,
    shared: Arc<PlaybackShared>,
    info: Arc<RwLock<VideoAudioInfo>>,
) {
    let generation_id = shared.generation.load(Ordering::Acquire);
    thread::Builder::new()
        .name("huff-video-audio-decode".into())
        .spawn(move || {
            decoder_worker(
                metadata,
                start_seconds,
                rate,
                looping,
                output_rate,
                output_channels,
                shared,
                info,
                generation_id,
            )
        })
        .ok();
}

#[allow(clippy::too_many_arguments)]
fn decoder_worker(
    metadata: AudioMetadata,
    mut start_seconds: f64,
    rate: f64,
    looping: bool,
    output_rate: u32,
    output_channels: usize,
    shared: Arc<PlaybackShared>,
    info: Arc<RwLock<VideoAudioInfo>>,
    generation_id: u64,
) {
    let bytes_per_chunk = DECODE_CHUNK_FRAMES
        .saturating_mul(output_channels)
        .saturating_mul(std::mem::size_of::<f32>());
    if bytes_per_chunk == 0 {
        set_error(&info, "invalid video audio output format".into());
        return;
    }

    loop {
        if shared.generation.load(Ordering::Acquire) != generation_id {
            return;
        }
        let mut child = match spawn_ffmpeg_audio(
            &metadata,
            start_seconds,
            rate,
            output_rate,
            output_channels,
        ) {
            Ok(child) => child,
            Err(error) => {
                set_error(&info, error);
                return;
            }
        };
        let Some(stdout) = child.stdout.take() else {
            set_error(&info, "FFmpeg did not expose an audio output pipe".into());
            let _ = child.kill();
            return;
        };

        let (pipe_rx, recycle_tx) = start_audio_pipe_reader(stdout, bytes_per_chunk);
        let mut restart_after_stall = false;
        let mut reached_eof = false;
        loop {
            if shared.generation.load(Ordering::Acquire) != generation_id {
                let _ = child.kill();
                let _ = child.wait();
                return;
            }

            let maximum_samples = output_rate as usize * output_channels * BUFFER_SECONDS;
            let buffered = shared.ring.lock().map(|ring| ring.len()).unwrap_or(0);
            if buffered >= maximum_samples.saturating_sub(bytes_per_chunk / 4) {
                thread::sleep(Duration::from_millis(5));
                continue;
            }

            let event = match pipe_rx.recv_timeout(AUDIO_PIPE_STALL_TIMEOUT) {
                Ok(event) => event,
                Err(RecvTimeoutError::Timeout) => {
                    restart_after_stall = true;
                    if let Ok(mut state) = info.write() {
                        state.decoder_stalls = state.decoder_stalls.wrapping_add(1);
                        state.last_error = "audio decoder pipe stalled; restarting at the current position".into();
                    }
                    break;
                }
                Err(RecvTimeoutError::Disconnected) => {
                    reached_eof = true;
                    break;
                }
            };

            let buffer = match event {
                AudioPipeEvent::Chunk(buffer) => buffer,
                AudioPipeEvent::Eof => {
                    reached_eof = true;
                    break;
                }
                AudioPipeEvent::Error(error) => {
                    restart_after_stall = true;
                    if let Ok(mut state) = info.write() {
                        state.last_error = error;
                    }
                    break;
                }
            };

            let mut decoded = Vec::with_capacity(buffer.len() / 4);
            for bytes in buffer.chunks_exact(4) {
                decoded.push(f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]));
            }
            let _ = recycle_tx.try_send(buffer);
            shared
                .counters
                .decoded_samples
                .fetch_add(decoded.len() as u64, Ordering::Relaxed);
            if let Ok(mut ring) = shared.ring.lock() {
                ring.extend(decoded);
            }
            if let Ok(mut state) = info.write() {
                state.last_error.clear();
            }
        }

        let _ = child.kill();
        let _ = child.wait();
        if shared.generation.load(Ordering::Acquire) != generation_id {
            return;
        }

        if restart_after_stall {
            let played_samples = shared.counters.played_samples.swap(0, Ordering::AcqRel);
            let played_seconds = played_samples as f64
                / output_channels.max(1) as f64
                / output_rate.max(1) as f64
                * rate;
            start_seconds = (start_seconds + played_seconds).max(0.0);
            shared.clear();
            if let Ok(mut state) = info.write() {
                state.watchdog_restarts = state.watchdog_restarts.wrapping_add(1);
                state.playing = true;
            }
            thread::sleep(Duration::from_millis(40));
            continue;
        }

        if reached_eof && looping {
            start_seconds = 0.0;
            shared.counters.played_samples.store(0, Ordering::Relaxed);
            shared.clear();
            continue;
        }
        shared.playing.store(false, Ordering::Release);
        info.write().expect("video audio info poisoned").playing = false;
        return;
    }
}

fn start_audio_pipe_reader(
    mut stdout: ChildStdout,
    chunk_len: usize,
) -> (Receiver<AudioPipeEvent>, SyncSender<Vec<u8>>) {
    let (event_tx, event_rx) = sync_channel::<AudioPipeEvent>(AUDIO_PIPE_QUEUE);
    let (recycle_tx, recycle_rx) = sync_channel::<Vec<u8>>(AUDIO_PIPE_QUEUE + 1);
    thread::Builder::new()
        .name("huff-audio-pipe-reader".into())
        .spawn(move || {
            let mut buffer = vec![0u8; chunk_len];
            loop {
                match stdout.read_exact(&mut buffer) {
                    Ok(()) => {
                        if event_tx.send(AudioPipeEvent::Chunk(buffer)).is_err() {
                            return;
                        }
                        buffer = recycle_rx
                            .recv_timeout(Duration::from_millis(250))
                            .ok()
                            .filter(|candidate| candidate.len() == chunk_len)
                            .unwrap_or_else(|| vec![0u8; chunk_len]);
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => {
                        let _ = event_tx.send(AudioPipeEvent::Eof);
                        return;
                    }
                    Err(error) => {
                        let _ = event_tx.send(AudioPipeEvent::Error(format!(
                            "audio decoder pipe read failed: {error}"
                        )));
                        return;
                    }
                }
            }
        })
        .ok();
    (event_rx, recycle_tx)
}

fn spawn_ffmpeg_audio(
    metadata: &AudioMetadata,
    seconds: f64,
    rate: f64,
    output_rate: u32,
    output_channels: usize,
) -> Result<Child, String> {
    let mut command = Command::new("ffmpeg");
    command.args(["-hide_banner", "-loglevel", "error", "-nostdin"]);
    if seconds > 0.0 {
        command.args(["-ss", &format!("{seconds:.6}")]);
    }
    command.arg("-i").arg(&metadata.path);
    command.args(["-map", "0:a:0", "-vn", "-sn", "-dn"]);
    let filter = atempo_filter(rate);
    if !filter.is_empty() {
        command.args(["-af", &filter]);
    }
    command.args([
        "-ac",
        &output_channels.to_string(),
        "-ar",
        &output_rate.to_string(),
        "-f",
        "f32le",
        "pipe:1",
    ]);
    command.stdout(Stdio::piped()).stderr(Stdio::null()).stdin(Stdio::null());
    command
        .spawn()
        .map_err(|error| format!("could not start FFmpeg video-audio decoder: {error}"))
}

fn atempo_filter(rate: f64) -> String {
    let mut remaining = rate.clamp(0.25, 4.0);
    let mut filters = Vec::new();
    while remaining > 2.0 {
        filters.push("atempo=2.0".to_string());
        remaining /= 2.0;
    }
    while remaining < 0.5 {
        filters.push("atempo=0.5".to_string());
        remaining /= 0.5;
    }
    filters.push(format!("atempo={remaining:.6}"));
    filters.join(",")
}

fn probe_audio(path: &Path) -> Result<AudioMetadata, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_name,sample_rate,channels",
            "-of",
            "json",
        ])
        .arg(path)
        .output()
        .map_err(|error| format!("could not start ffprobe for video audio: {error}"))?;
    if !output.status.success() {
        return Err("The selected video does not expose a readable audio stream.".into());
    }
    let value: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("invalid ffprobe audio JSON: {error}"))?;
    let stream = value
        .get("streams")
        .and_then(Value::as_array)
        .and_then(|streams| streams.first())
        .ok_or_else(|| "The selected video has no audio stream.".to_string())?;
    let source_sample_rate = stream
        .get("sample_rate")
        .and_then(Value::as_str)
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0);
    let source_channels = stream
        .get("channels")
        .and_then(Value::as_u64)
        .unwrap_or(0) as u16;
    Ok(AudioMetadata {
        path: path.to_path_buf(),
        file_name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("video")
            .to_string(),
        codec: stream
            .get("codec_name")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        source_sample_rate,
        source_channels,
    })
}

fn initialize_ffmpeg_status(info: &Arc<RwLock<VideoAudioInfo>>) {
    let available = Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);
    info.write().expect("video audio info poisoned").ffmpeg_available = available;
}

fn set_error(info: &Arc<RwLock<VideoAudioInfo>>, error: String) {
    let mut state = info.write().expect("video audio info poisoned");
    state.playing = false;
    state.last_error = error;
}
