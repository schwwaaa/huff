use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rustfft::{num_complex::Complex32, FftPlanner};
use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{sync_channel, Receiver, SyncSender, TryRecvError, TrySendError},
        Arc, RwLock,
    },
    thread,
    time::{Duration, Instant},
};

pub const SPECTRUM_BINS: usize = 256;
pub const WAVEFORM_SAMPLES: usize = 512;
const DEFAULT_FFT_SIZE: usize = 2048;
const DEFAULT_SMOOTHING: f32 = 0.82;
const DEFAULT_INPUT_GAIN: f32 = 1.0;
const DEFAULT_GATE: f32 = 0.015;
const DEFAULT_TRANSIENT_SENSITIVITY: f32 = 0.02;

#[derive(Debug, Clone)]
pub enum AudioCommand {
    RefreshDevices,
    SelectDevice(String),
    Start,
    Stop,
    SetFftSize(usize),
    SetAnalysisParam(String, f32),
    Shutdown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInfo {
    pub devices: Vec<String>,
    pub selected_device: String,
    pub host: String,
    pub running: bool,
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_format: String,
    pub fft_size: usize,
    pub smoothing: f32,
    pub input_gain: f32,
    pub gate: f32,
    pub transient_sensitivity: f32,
    pub callback_count: u64,
    pub captured_samples: u64,
    pub dropped_chunks: u64,
    pub stream_errors: u64,
    pub analysis_fps: f64,
    pub rms: f32,
    pub peak: f32,
    pub bass: f32,
    pub low_mid: f32,
    pub high_mid: f32,
    pub treble: f32,
    pub spectral_centroid_hz: f32,
    pub transient: f32,
    pub last_error: String,
}

impl Default for AudioInfo {
    fn default() -> Self {
        Self {
            devices: Vec::new(),
            selected_device: String::new(),
            host: String::new(),
            running: false,
            sample_rate: 0,
            channels: 0,
            sample_format: String::new(),
            fft_size: DEFAULT_FFT_SIZE,
            smoothing: DEFAULT_SMOOTHING,
            input_gain: DEFAULT_INPUT_GAIN,
            gate: DEFAULT_GATE,
            transient_sensitivity: DEFAULT_TRANSIENT_SENSITIVITY,
            callback_count: 0,
            captured_samples: 0,
            dropped_chunks: 0,
            stream_errors: 0,
            analysis_fps: 0.0,
            rms: 0.0,
            peak: 0.0,
            bass: 0.0,
            low_mid: 0.0,
            high_mid: 0.0,
            treble: 0.0,
            spectral_centroid_hz: 0.0,
            transient: 0.0,
            last_error: String::new(),
        }
    }
}

#[derive(Clone)]
pub struct AudioSnapshot {
    pub spectrum: [f32; SPECTRUM_BINS],
    pub waveform: [f32; WAVEFORM_SAMPLES],
    pub rms: f32,
    pub peak: f32,
    pub bass: f32,
    pub low_mid: f32,
    pub high_mid: f32,
    pub treble: f32,
    pub centroid_normalized: f32,
    pub transient: f32,
    pub sequence: u64,
}

impl Default for AudioSnapshot {
    fn default() -> Self {
        Self {
            spectrum: [0.0; SPECTRUM_BINS],
            waveform: [0.0; WAVEFORM_SAMPLES],
            rms: 0.0,
            peak: 0.0,
            bass: 0.0,
            low_mid: 0.0,
            high_mid: 0.0,
            treble: 0.0,
            centroid_normalized: 0.0,
            transient: 0.0,
            sequence: 0,
        }
    }
}

#[derive(Clone)]
pub struct AudioHandle {
    tx: SyncSender<AudioCommand>,
    info: Arc<RwLock<AudioInfo>>,
    snapshot: Arc<RwLock<AudioSnapshot>>,
}

impl AudioHandle {
    pub fn send(&self, command: AudioCommand) {
        let _ = self.tx.try_send(command);
    }

    pub fn info(&self) -> AudioInfo {
        self.info.read().expect("audio info poisoned").clone()
    }

    pub fn snapshot(&self) -> Arc<RwLock<AudioSnapshot>> {
        Arc::clone(&self.snapshot)
    }
}

#[derive(Default)]
struct CallbackCounters {
    callbacks: AtomicU64,
    samples: AtomicU64,
    dropped_chunks: AtomicU64,
    stream_errors: AtomicU64,
}

pub(crate) struct Analyzer {
    fft_size: usize,
    hop_size: usize,
    sample_rate: u32,
    smoothing: f32,
    input_gain: f32,
    gate: f32,
    transient_sensitivity: f32,
    sample_buffer: VecDeque<f32>,
    fft_buffer: Vec<Complex32>,
    fft: Arc<dyn rustfft::Fft<f32>>,
    window: Vec<f32>,
    previous_bins: [f32; SPECTRUM_BINS],
    smoothed_bins: [f32; SPECTRUM_BINS],
    transient: f32,
    last_analysis: Instant,
    sequence: u64,
}

impl Analyzer {
    pub(crate) fn new(sample_rate: u32) -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(DEFAULT_FFT_SIZE);
        let mut analyzer = Self {
            fft_size: DEFAULT_FFT_SIZE,
            hop_size: DEFAULT_FFT_SIZE / 4,
            sample_rate: sample_rate.max(1),
            smoothing: DEFAULT_SMOOTHING,
            input_gain: DEFAULT_INPUT_GAIN,
            gate: DEFAULT_GATE,
            transient_sensitivity: DEFAULT_TRANSIENT_SENSITIVITY,
            sample_buffer: VecDeque::with_capacity(DEFAULT_FFT_SIZE * 4),
            fft_buffer: Vec::new(),
            fft,
            window: Vec::new(),
            previous_bins: [0.0; SPECTRUM_BINS],
            smoothed_bins: [0.0; SPECTRUM_BINS],
            transient: 0.0,
            last_analysis: Instant::now(),
            sequence: 0,
        };
        analyzer.rebuild_fft_buffers();
        analyzer
    }

    pub(crate) fn rebuild_fft_buffers(&mut self) {
        self.hop_size = (self.fft_size / 4).max(1);
        self.fft_buffer = vec![Complex32::new(0.0, 0.0); self.fft_size];
        let mut planner = FftPlanner::<f32>::new();
        self.fft = planner.plan_fft_forward(self.fft_size);
        self.window = (0..self.fft_size)
            .map(|index| {
                let phase = std::f32::consts::TAU * index as f32
                    / (self.fft_size.saturating_sub(1).max(1) as f32);
                0.5 - 0.5 * phase.cos()
            })
            .collect();
        self.sample_buffer.clear();
        self.previous_bins = [0.0; SPECTRUM_BINS];
        self.smoothed_bins = [0.0; SPECTRUM_BINS];
    }

    pub(crate) fn set_fft_size(&mut self, fft_size: usize) {
        let valid = match fft_size {
            1024 | 2048 | 4096 | 8192 => fft_size,
            _ => DEFAULT_FFT_SIZE,
        };
        if valid != self.fft_size {
            self.fft_size = valid;
            self.rebuild_fft_buffers();
        }
    }

    pub(crate) fn push_samples(&mut self, samples: &[f32]) {
        self.sample_buffer.extend(samples.iter().copied());
        let maximum = self.fft_size * 8;
        while self.sample_buffer.len() > maximum {
            self.sample_buffer.pop_front();
        }
    }

    pub(crate) fn analyze_available(&mut self, snapshot: &Arc<RwLock<AudioSnapshot>>) -> Option<f64> {
        let mut latest_fps = None;
        while self.sample_buffer.len() >= self.fft_size {
            let mut time_samples = vec![0.0f32; self.fft_size];
            for (index, sample) in self.sample_buffer.iter().take(self.fft_size).enumerate() {
                time_samples[index] = *sample * self.input_gain;
                self.fft_buffer[index] = Complex32::new(
                    time_samples[index] * self.window[index],
                    0.0,
                );
            }

            self.fft.process(&mut self.fft_buffer);

            let nyquist = self.sample_rate as f32 * 0.5;
            let min_frequency = 20.0f32;
            let max_frequency = nyquist.max(min_frequency + 1.0);
            let ratio = max_frequency / min_frequency;
            let mut raw_bins = [0.0f32; SPECTRUM_BINS];

            for (bin_index, bin_value) in raw_bins.iter_mut().enumerate() {
                let t0 = bin_index as f32 / SPECTRUM_BINS as f32;
                let t1 = (bin_index + 1) as f32 / SPECTRUM_BINS as f32;
                let frequency0 = min_frequency * ratio.powf(t0);
                let frequency1 = min_frequency * ratio.powf(t1);
                let fft_index0 = ((frequency0 * self.fft_size as f32 / self.sample_rate as f32)
                    .floor() as usize)
                    .clamp(1, self.fft_size / 2);
                let fft_index1 = ((frequency1 * self.fft_size as f32 / self.sample_rate as f32)
                    .ceil() as usize)
                    .clamp(fft_index0 + 1, self.fft_size / 2 + 1);

                let mut maximum_magnitude = 0.0f32;
                for fft_index in fft_index0..fft_index1 {
                    maximum_magnitude = maximum_magnitude.max(self.fft_buffer[fft_index].norm());
                }
                let normalized_magnitude = maximum_magnitude * 2.0 / self.fft_size as f32;
                let decibels = 20.0 * normalized_magnitude.max(1.0e-8).log10();
                let normalized = ((decibels + 78.0) / 78.0).clamp(0.0, 1.0);
                *bin_value = if normalized < self.gate { 0.0 } else { normalized };
            }

            let mut spectral_flux = 0.0f32;
            for index in 0..SPECTRUM_BINS {
                spectral_flux += (raw_bins[index] - self.previous_bins[index]).max(0.0);
                self.smoothed_bins[index] = self.smoothed_bins[index] * self.smoothing
                    + raw_bins[index] * (1.0 - self.smoothing);
                self.previous_bins[index] = raw_bins[index];
            }
            let flux_average = spectral_flux / SPECTRUM_BINS as f32;
            if flux_average > self.transient_sensitivity {
                self.transient = 1.0;
            } else {
                self.transient *= 0.82;
            }

            let rms = (time_samples.iter().map(|value| value * value).sum::<f32>()
                / self.fft_size as f32)
                .sqrt()
                .clamp(0.0, 2.0);
            let peak = time_samples
                .iter()
                .fold(0.0f32, |maximum, value| maximum.max(value.abs()))
                .clamp(0.0, 2.0);

            let band_average = |low_hz: f32, high_hz: f32| -> f32 {
                let mut total = 0.0;
                let mut count = 0usize;
                for (index, value) in self.smoothed_bins.iter().enumerate() {
                    let t = (index as f32 + 0.5) / SPECTRUM_BINS as f32;
                    let frequency = min_frequency * ratio.powf(t);
                    if frequency >= low_hz && frequency < high_hz {
                        total += *value;
                        count += 1;
                    }
                }
                if count == 0 { 0.0 } else { total / count as f32 }
            };

            let bass = band_average(20.0, 200.0);
            let low_mid = band_average(200.0, 800.0);
            let high_mid = band_average(800.0, 4_000.0);
            let treble = band_average(4_000.0, 16_000.0_f32.min(nyquist));

            let mut weighted_frequency = 0.0f32;
            let mut magnitude_sum = 0.0f32;
            for (index, value) in self.smoothed_bins.iter().enumerate() {
                let t = (index as f32 + 0.5) / SPECTRUM_BINS as f32;
                let frequency = min_frequency * ratio.powf(t);
                weighted_frequency += frequency * *value;
                magnitude_sum += *value;
            }
            let centroid_hz = if magnitude_sum > 1.0e-6 {
                weighted_frequency / magnitude_sum
            } else {
                0.0
            };

            let mut waveform = [0.0f32; WAVEFORM_SAMPLES];
            for (index, output) in waveform.iter_mut().enumerate() {
                let source_index = index * self.fft_size / WAVEFORM_SAMPLES;
                *output = time_samples[source_index].clamp(-1.0, 1.0);
            }

            self.sequence = self.sequence.wrapping_add(1);
            let now = Instant::now();
            let elapsed = now.duration_since(self.last_analysis).as_secs_f64();
            let analysis_fps = if elapsed > 0.0 { 1.0 / elapsed } else { 0.0 };
            self.last_analysis = now;
            latest_fps = Some(analysis_fps);

            let next_snapshot = AudioSnapshot {
                spectrum: self.smoothed_bins,
                waveform,
                rms,
                peak,
                bass,
                low_mid,
                high_mid,
                treble,
                centroid_normalized: (centroid_hz / nyquist.max(1.0)).clamp(0.0, 1.0),
                transient: self.transient,
                sequence: self.sequence,
            };
            *snapshot.write().expect("audio snapshot poisoned") = next_snapshot;

            for _ in 0..self.hop_size {
                self.sample_buffer.pop_front();
            }
        }
        latest_fps
    }
}

pub fn start() -> Result<AudioHandle, String> {
    let (tx, rx) = sync_channel(128);
    let info = Arc::new(RwLock::new(AudioInfo::default()));
    let snapshot = Arc::new(RwLock::new(AudioSnapshot::default()));
    let thread_info = Arc::clone(&info);
    let thread_snapshot = Arc::clone(&snapshot);

    thread::Builder::new()
        .name("huff-audio-analysis".into())
        .spawn(move || audio_thread(rx, thread_info, thread_snapshot))
        .map_err(|error| format!("could not start audio thread: {error}"))?;

    Ok(AudioHandle { tx, info, snapshot })
}

fn enumerate_input_devices(host: &cpal::Host) -> Vec<String> {
    let mut names = host
        .input_devices()
        .map(|devices| {
            devices
                .filter_map(|device| device.name().ok())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    names.sort();
    names.dedup();
    names
}

fn find_device(host: &cpal::Host, selected_name: &str) -> Option<cpal::Device> {
    if !selected_name.is_empty() {
        if let Ok(mut devices) = host.input_devices() {
            if let Some(device) = devices.find(|device| {
                device
                    .name()
                    .map(|name| name == selected_name)
                    .unwrap_or(false)
            }) {
                return Some(device);
            }
        }
    }
    host.default_input_device()
}

fn callback_mono_f32(data: &[f32], channels: usize, tx: &SyncSender<Vec<f32>>, counters: &CallbackCounters) {
    publish_mono(
        data.chunks(channels).map(|frame| frame.iter().copied().sum::<f32>() / channels as f32),
        tx,
        counters,
    );
}

fn callback_mono_i16(data: &[i16], channels: usize, tx: &SyncSender<Vec<f32>>, counters: &CallbackCounters) {
    publish_mono(
        data.chunks(channels).map(|frame| {
            frame.iter().map(|sample| *sample as f32 / i16::MAX as f32).sum::<f32>()
                / channels as f32
        }),
        tx,
        counters,
    );
}

fn callback_mono_u16(data: &[u16], channels: usize, tx: &SyncSender<Vec<f32>>, counters: &CallbackCounters) {
    publish_mono(
        data.chunks(channels).map(|frame| {
            frame.iter().map(|sample| (*sample as f32 - 32768.0) / 32768.0).sum::<f32>()
                / channels as f32
        }),
        tx,
        counters,
    );
}

fn publish_mono<I>(samples: I, tx: &SyncSender<Vec<f32>>, counters: &CallbackCounters)
where
    I: Iterator<Item = f32>,
{
    let chunk = samples.collect::<Vec<_>>();
    counters.callbacks.fetch_add(1, Ordering::Relaxed);
    counters
        .samples
        .fetch_add(chunk.len() as u64, Ordering::Relaxed);
    match tx.try_send(chunk) {
        Ok(()) => {}
        Err(TrySendError::Full(_)) | Err(TrySendError::Disconnected(_)) => {
            counters.dropped_chunks.fetch_add(1, Ordering::Relaxed);
        }
    }
}

fn open_stream(
    host: &cpal::Host,
    selected_name: &str,
    sample_tx: SyncSender<Vec<f32>>,
    counters: Arc<CallbackCounters>,
    info: Arc<RwLock<AudioInfo>>,
) -> Result<(cpal::Stream, u32), String> {
    let device = find_device(host, selected_name).ok_or_else(|| "no audio input device is available".to_string())?;
    let device_name = device.name().unwrap_or_else(|_| "Unknown input device".into());
    let supported = device
        .default_input_config()
        .map_err(|error| format!("could not query default input config: {error}"))?;
    let sample_format = supported.sample_format();
    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels();
    let stream_config: cpal::StreamConfig = supported.into();
    let channel_count = channels.max(1) as usize;

    {
        let mut state = info.write().expect("audio info poisoned");
        state.selected_device = device_name;
        state.sample_rate = sample_rate;
        state.channels = channels;
        state.sample_format = format!("{sample_format}");
        state.last_error.clear();
    }

    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let tx = sample_tx.clone();
            let callback_counters = Arc::clone(&counters);
            let error_info = Arc::clone(&info);
            let error_counters = Arc::clone(&counters);
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| callback_mono_f32(data, channel_count, &tx, &callback_counters),
                move |error: cpal::StreamError| {
                    error_counters.stream_errors.fetch_add(1, Ordering::Relaxed);
                    let mut state = error_info.write().expect("audio info poisoned");
                    state.last_error = format!("audio stream error: {error}");
                },
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let tx = sample_tx.clone();
            let callback_counters = Arc::clone(&counters);
            let error_info = Arc::clone(&info);
            let error_counters = Arc::clone(&counters);
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| callback_mono_i16(data, channel_count, &tx, &callback_counters),
                move |error: cpal::StreamError| {
                    error_counters.stream_errors.fetch_add(1, Ordering::Relaxed);
                    let mut state = error_info.write().expect("audio info poisoned");
                    state.last_error = format!("audio stream error: {error}");
                },
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let tx = sample_tx;
            let callback_counters = Arc::clone(&counters);
            let error_info = Arc::clone(&info);
            let error_counters = Arc::clone(&counters);
            device.build_input_stream(
                &stream_config,
                move |data: &[u16], _| callback_mono_u16(data, channel_count, &tx, &callback_counters),
                move |error: cpal::StreamError| {
                    error_counters.stream_errors.fetch_add(1, Ordering::Relaxed);
                    let mut state = error_info.write().expect("audio info poisoned");
                    state.last_error = format!("audio stream error: {error}");
                },
                None,
            )
        }
        other => return Err(format!("unsupported input sample format: {other}")),
    }
    .map_err(|error| format!("could not build audio input stream: {error}"))?;

    stream
        .play()
        .map_err(|error| format!("could not start audio input stream: {error}"))?;
    Ok((stream, sample_rate))
}

fn audio_thread(
    command_rx: Receiver<AudioCommand>,
    info: Arc<RwLock<AudioInfo>>,
    snapshot: Arc<RwLock<AudioSnapshot>>,
) {
    let host = cpal::default_host();
    let host_name = format!("{:?}", host.id());
    let mut devices = enumerate_input_devices(&host);
    let default_name = host
        .default_input_device()
        .and_then(|device| device.name().ok())
        .unwrap_or_default();
    if !default_name.is_empty() && !devices.iter().any(|name| name == &default_name) {
        devices.insert(0, default_name.clone());
    }

    {
        let mut state = info.write().expect("audio info poisoned");
        state.host = host_name;
        state.devices = devices;
        state.selected_device = default_name;
    }

    let (sample_tx, sample_rx) = sync_channel::<Vec<f32>>(16);
    let counters = Arc::new(CallbackCounters::default());
    let mut stream: Option<cpal::Stream> = None;
    let mut analyzer = Analyzer::new(48_000);
    let mut selected_name = info
        .read()
        .expect("audio info poisoned")
        .selected_device
        .clone();
    let mut running = true;
    let mut last_info_update = Instant::now();

    while running {
        loop {
            match command_rx.try_recv() {
                Ok(AudioCommand::RefreshDevices) => {
                    let devices = enumerate_input_devices(&host);
                    info.write().expect("audio info poisoned").devices = devices;
                }
                Ok(AudioCommand::SelectDevice(name)) => {
                    selected_name = name;
                    info.write().expect("audio info poisoned").selected_device = selected_name.clone();
                    if stream.is_some() {
                        stream = None;
                        match open_stream(
                            &host,
                            &selected_name,
                            sample_tx.clone(),
                            Arc::clone(&counters),
                            Arc::clone(&info),
                        ) {
                            Ok((next_stream, sample_rate)) => {
                                analyzer.sample_rate = sample_rate;
                                analyzer.rebuild_fft_buffers();
                                stream = Some(next_stream);
                                info.write().expect("audio info poisoned").running = true;
                            }
                            Err(error) => {
                                let mut state = info.write().expect("audio info poisoned");
                                state.running = false;
                                state.last_error = error;
                            }
                        }
                    }
                }
                Ok(AudioCommand::Start) => {
                    if stream.is_none() {
                        match open_stream(
                            &host,
                            &selected_name,
                            sample_tx.clone(),
                            Arc::clone(&counters),
                            Arc::clone(&info),
                        ) {
                            Ok((next_stream, sample_rate)) => {
                                analyzer.sample_rate = sample_rate;
                                analyzer.rebuild_fft_buffers();
                                stream = Some(next_stream);
                                info.write().expect("audio info poisoned").running = true;
                            }
                            Err(error) => {
                                let mut state = info.write().expect("audio info poisoned");
                                state.running = false;
                                state.last_error = error;
                            }
                        }
                    }
                }
                Ok(AudioCommand::Stop) => {
                    stream = None;
                    info.write().expect("audio info poisoned").running = false;
                }
                Ok(AudioCommand::SetFftSize(size)) => {
                    analyzer.set_fft_size(size);
                    info.write().expect("audio info poisoned").fft_size = analyzer.fft_size;
                }
                Ok(AudioCommand::SetAnalysisParam(name, value)) => {
                    match name.as_str() {
                        "smoothing" => analyzer.smoothing = value.clamp(0.0, 0.98),
                        "input_gain" => analyzer.input_gain = value.clamp(0.05, 12.0),
                        "gate" => analyzer.gate = value.clamp(0.0, 0.3),
                        "transient_sensitivity" => {
                            analyzer.transient_sensitivity = value.clamp(0.001, 0.5)
                        }
                        _ => {}
                    }
                    let mut state = info.write().expect("audio info poisoned");
                    state.smoothing = analyzer.smoothing;
                    state.input_gain = analyzer.input_gain;
                    state.gate = analyzer.gate;
                    state.transient_sensitivity = analyzer.transient_sensitivity;
                }
                Ok(AudioCommand::Shutdown) => {
                    running = false;
                    break;
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    running = false;
                    break;
                }
            }
        }

        match sample_rx.recv_timeout(Duration::from_millis(8)) {
            Ok(samples) => {
                analyzer.push_samples(&samples);
                if let Some(analysis_fps) = analyzer.analyze_available(&snapshot) {
                    let latest = snapshot.read().expect("audio snapshot poisoned").clone();
                    let mut state = info.write().expect("audio info poisoned");
                    state.analysis_fps = analysis_fps;
                    state.rms = latest.rms;
                    state.peak = latest.peak;
                    state.bass = latest.bass;
                    state.low_mid = latest.low_mid;
                    state.high_mid = latest.high_mid;
                    state.treble = latest.treble;
                    state.spectral_centroid_hz =
                        latest.centroid_normalized * analyzer.sample_rate as f32 * 0.5;
                    state.transient = latest.transient;
                }
            }
            Err(_) => {}
        }

        if last_info_update.elapsed() >= Duration::from_millis(100) {
            let mut state = info.write().expect("audio info poisoned");
            state.callback_count = counters.callbacks.load(Ordering::Relaxed);
            state.captured_samples = counters.samples.load(Ordering::Relaxed);
            state.dropped_chunks = counters.dropped_chunks.load(Ordering::Relaxed);
            state.stream_errors = counters.stream_errors.load(Ordering::Relaxed);
            last_info_update = Instant::now();
        }
    }

    drop(stream);
    info.write().expect("audio info poisoned").running = false;
}
