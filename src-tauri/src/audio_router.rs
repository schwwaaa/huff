use crate::audio::{AudioSnapshot, SPECTRUM_BINS, WAVEFORM_SAMPLES};
use serde::Serialize;
use std::{
    sync::{
        mpsc::{sync_channel, Receiver, SyncSender, TryRecvError},
        Arc, RwLock,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Debug, Clone)]
pub enum AudioRouterCommand {
    SetSource(String),
    Shutdown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioRouterInfo {
    pub source: String,
    pub analysis_fps: f64,
    pub rms: f32,
    pub peak: f32,
    pub bass: f32,
    pub low_mid: f32,
    pub high_mid: f32,
    pub treble: f32,
    pub transient: f32,
    pub sequence: u64,
}

impl Default for AudioRouterInfo {
    fn default() -> Self {
        Self {
            source: "microphone".into(),
            analysis_fps: 0.0,
            rms: 0.0,
            peak: 0.0,
            bass: 0.0,
            low_mid: 0.0,
            high_mid: 0.0,
            treble: 0.0,
            transient: 0.0,
            sequence: 0,
        }
    }
}

#[derive(Clone)]
pub struct AudioRouterHandle {
    tx: SyncSender<AudioRouterCommand>,
    info: Arc<RwLock<AudioRouterInfo>>,
    snapshot: Arc<RwLock<AudioSnapshot>>,
}

impl AudioRouterHandle {
    pub fn send(&self, command: AudioRouterCommand) {
        let _ = self.tx.try_send(command);
    }

    pub fn info(&self) -> AudioRouterInfo {
        self.info.read().expect("audio router info poisoned").clone()
    }

    pub fn snapshot(&self) -> Arc<RwLock<AudioSnapshot>> {
        Arc::clone(&self.snapshot)
    }
}

pub fn start(
    microphone: Arc<RwLock<AudioSnapshot>>,
    video: Arc<RwLock<AudioSnapshot>>,
) -> Result<AudioRouterHandle, String> {
    let (tx, rx) = sync_channel(32);
    let info = Arc::new(RwLock::new(AudioRouterInfo::default()));
    let snapshot = Arc::new(RwLock::new(AudioSnapshot::default()));
    let thread_info = Arc::clone(&info);
    let thread_snapshot = Arc::clone(&snapshot);

    thread::Builder::new()
        .name("huff-audio-router".into())
        .spawn(move || router_thread(rx, microphone, video, thread_info, thread_snapshot))
        .map_err(|error| format!("could not start audio router: {error}"))?;

    Ok(AudioRouterHandle { tx, info, snapshot })
}

fn router_thread(
    rx: Receiver<AudioRouterCommand>,
    microphone: Arc<RwLock<AudioSnapshot>>,
    video: Arc<RwLock<AudioSnapshot>>,
    info: Arc<RwLock<AudioRouterInfo>>,
    output: Arc<RwLock<AudioSnapshot>>,
) {
    let mut source = "microphone".to_string();
    let mut running = true;
    let mut output_sequence = 0u64;
    let mut last_update = Instant::now();
    let mut last_mic_sequence = u64::MAX;
    let mut last_video_sequence = u64::MAX;

    while running {
        loop {
            match rx.try_recv() {
                Ok(AudioRouterCommand::SetSource(next)) => {
                    if matches!(next.as_str(), "microphone" | "video" | "mix") {
                        source = next;
                        info.write().expect("audio router info poisoned").source = source.clone();
                        last_mic_sequence = u64::MAX;
                        last_video_sequence = u64::MAX;
                    }
                }
                Ok(AudioRouterCommand::Shutdown) => {
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
        if !running {
            break;
        }

        let mic = microphone
            .read()
            .expect("microphone snapshot poisoned")
            .clone();
        let video_audio = video
            .read()
            .expect("video audio snapshot poisoned")
            .clone();
        let changed = mic.sequence != last_mic_sequence
            || video_audio.sequence != last_video_sequence;
        if changed {
            output_sequence = output_sequence.wrapping_add(1);
            let mut next = match source.as_str() {
                "video" => video_audio.clone(),
                "mix" => combine(&mic, &video_audio),
                _ => mic.clone(),
            };
            next.sequence = output_sequence;
            *output.write().expect("audio router snapshot poisoned") = next.clone();

            let now = Instant::now();
            let elapsed = now.duration_since(last_update).as_secs_f64();
            last_update = now;
            let mut state = info.write().expect("audio router info poisoned");
            state.analysis_fps = if elapsed > 0.0 { 1.0 / elapsed } else { 0.0 };
            state.rms = next.rms;
            state.peak = next.peak;
            state.bass = next.bass;
            state.low_mid = next.low_mid;
            state.high_mid = next.high_mid;
            state.treble = next.treble;
            state.transient = next.transient;
            state.sequence = next.sequence;
            last_mic_sequence = mic.sequence;
            last_video_sequence = video_audio.sequence;
        }

        thread::sleep(Duration::from_millis(4));
    }
}

fn combine(microphone: &AudioSnapshot, video: &AudioSnapshot) -> AudioSnapshot {
    if microphone.sequence == 0 {
        return video.clone();
    }
    if video.sequence == 0 {
        return microphone.clone();
    }
    let mut spectrum = [0.0f32; SPECTRUM_BINS];
    for index in 0..SPECTRUM_BINS {
        spectrum[index] = (microphone.spectrum[index] * 0.5 + video.spectrum[index] * 0.5)
            .clamp(0.0, 1.0);
    }
    let mut waveform = [0.0f32; WAVEFORM_SAMPLES];
    for index in 0..WAVEFORM_SAMPLES {
        waveform[index] = (microphone.waveform[index] * 0.5 + video.waveform[index] * 0.5)
            .clamp(-1.0, 1.0);
    }
    AudioSnapshot {
        spectrum,
        waveform,
        rms: (microphone.rms * 0.5 + video.rms * 0.5).clamp(0.0, 2.0),
        peak: microphone.peak.max(video.peak),
        bass: (microphone.bass * 0.5 + video.bass * 0.5).clamp(0.0, 1.0),
        low_mid: (microphone.low_mid * 0.5 + video.low_mid * 0.5).clamp(0.0, 1.0),
        high_mid: (microphone.high_mid * 0.5 + video.high_mid * 0.5).clamp(0.0, 1.0),
        treble: (microphone.treble * 0.5 + video.treble * 0.5).clamp(0.0, 1.0),
        centroid_normalized: (microphone.centroid_normalized * 0.5
            + video.centroid_normalized * 0.5)
            .clamp(0.0, 1.0),
        transient: microphone.transient.max(video.transient),
        sequence: 0,
    }
}
