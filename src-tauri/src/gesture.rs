use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    sync::{Arc, RwLock},
    time::{Duration, Instant},
};

pub const MAX_POINTS: usize = 64;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GesturePoint {
    pub x: f32,
    pub y: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub pressure: f32,
    pub age: f32,
    pub tool: f32,
    pub active: f32,
}

impl Default for GesturePoint {
    fn default() -> Self {
        Self { x: 0.5, y: 0.5, velocity_x: 0.0, velocity_y: 0.0, pressure: 0.0, age: 999.0, tool: 0.0, active: 0.0 }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GestureInfo {
    pub received_events: u64,
    pub event_rate: f64,
    pub active_pointers: u32,
    pub history_points: usize,
    pub recording: bool,
    pub playing: bool,
    pub recorded_points: usize,
    pub sequence: u64,
    pub last_error: String,
}

#[derive(Debug, Clone)]
pub struct GestureSnapshot {
    pub points: [GesturePoint; MAX_POINTS],
    pub count: u32,
    pub sequence: u64,
    pub brush_radius: f32,
    pub force: f32,
    pub decay: f32,
    pub mode: f32,
    pub depth: f32,
    pub exposure: f32,
}

impl Default for GestureSnapshot {
    fn default() -> Self {
        Self {
            points: [GesturePoint::default(); MAX_POINTS], count: 0, sequence: 0,
            brush_radius: 0.08, force: 1.0, decay: 0.94, mode: 0.0, depth: 0.5, exposure: 1.2,
        }
    }
}

struct Shared {
    info: GestureInfo,
    history: VecDeque<GesturePoint>,
    recording: bool,
    playing: bool,
    recorded: Vec<(f32, GesturePoint)>,
    record_started: Instant,
    playback_started: Instant,
    rate_started: Instant,
    rate_count: u64,
}

#[derive(Clone)]
pub struct GestureHandle {
    shared: Arc<RwLock<Shared>>,
    snapshot: Arc<RwLock<GestureSnapshot>>,
}

impl GestureHandle {
    pub fn new() -> Self {
        let info = GestureInfo {
            received_events: 0, event_rate: 0.0, active_pointers: 0, history_points: 0,
            recording: false, playing: false, recorded_points: 0, sequence: 0, last_error: String::new(),
        };
        Self {
            shared: Arc::new(RwLock::new(Shared {
                info, history: VecDeque::with_capacity(MAX_POINTS), recording: false, playing: false,
                recorded: Vec::new(), record_started: Instant::now(), playback_started: Instant::now(),
                rate_started: Instant::now(), rate_count: 0,
            })),
            snapshot: Arc::new(RwLock::new(GestureSnapshot::default())),
        }
    }

    pub fn snapshot(&self) -> Arc<RwLock<GestureSnapshot>> { Arc::clone(&self.snapshot) }

    pub fn info(&self) -> GestureInfo {
        self.update_playback();
        self.shared.read().expect("gesture state poisoned").info.clone()
    }

    pub fn push(&self, mut point: GesturePoint) {
        point.x = point.x.clamp(0.0, 1.0);
        point.y = point.y.clamp(0.0, 1.0);
        point.pressure = point.pressure.clamp(0.0, 1.0);
        point.age = 0.0;
        let now = Instant::now();
        let mut shared = self.shared.write().expect("gesture state poisoned");
        shared.info.received_events += 1;
        shared.rate_count += 1;
        if now.duration_since(shared.rate_started) >= Duration::from_secs(1) {
            shared.info.event_rate = shared.rate_count as f64 / now.duration_since(shared.rate_started).as_secs_f64();
            shared.rate_count = 0;
            shared.rate_started = now;
        }
        if shared.recording {
            let t = now.duration_since(shared.record_started).as_secs_f32();
            shared.recorded.push((t, point));
        }
        shared.history.push_back(point);
        while shared.history.len() > MAX_POINTS { shared.history.pop_front(); }
        shared.info.active_pointers = if point.active > 0.5 { 1 } else { 0 };
        shared.info.history_points = shared.history.len();
        shared.info.recorded_points = shared.recorded.len();
        shared.info.sequence += 1;
        drop(shared);
        self.publish_snapshot();
    }

    pub fn set_parameter(&self, name: &str, value: f32) -> Result<(), String> {
        let mut snapshot = self.snapshot.write().map_err(|_| "gesture snapshot poisoned".to_string())?;
        match name {
            "brushRadius" => snapshot.brush_radius = value.clamp(0.005, 0.35),
            "force" => snapshot.force = value.clamp(0.0, 4.0),
            "decay" => snapshot.decay = value.clamp(0.80, 0.999),
            "mode" => snapshot.mode = value.clamp(0.0, 3.0),
            "depth" => snapshot.depth = value.clamp(0.0, 2.0),
            "exposure" => snapshot.exposure = value.clamp(0.2, 4.0),
            _ => return Err(format!("unknown gesture parameter: {name}")),
        }
        snapshot.sequence += 1;
        Ok(())
    }

    pub fn clear(&self) {
        let mut shared = self.shared.write().expect("gesture state poisoned");
        shared.history.clear();
        shared.info.history_points = 0;
        shared.info.sequence += 1;
        drop(shared);
        self.publish_snapshot();
    }

    pub fn start_recording(&self) {
        let mut shared = self.shared.write().expect("gesture state poisoned");
        shared.recorded.clear();
        shared.recording = true;
        shared.playing = false;
        shared.record_started = Instant::now();
        shared.info.recording = true;
        shared.info.playing = false;
        shared.info.recorded_points = 0;
    }

    pub fn stop_recording(&self) {
        let mut shared = self.shared.write().expect("gesture state poisoned");
        shared.recording = false;
        shared.info.recording = false;
        shared.info.recorded_points = shared.recorded.len();
    }

    pub fn play(&self) {
        let mut shared = self.shared.write().expect("gesture state poisoned");
        if shared.recorded.is_empty() { return; }
        shared.playing = true;
        shared.recording = false;
        shared.playback_started = Instant::now();
        shared.info.playing = true;
        shared.info.recording = false;
    }

    pub fn stop_playback(&self) {
        let mut shared = self.shared.write().expect("gesture state poisoned");
        shared.playing = false;
        shared.info.playing = false;
    }

    fn update_playback(&self) {
        let mut replay = Vec::new();
        {
            let mut shared = self.shared.write().expect("gesture state poisoned");
            if !shared.playing || shared.recorded.is_empty() { return; }
            let elapsed = shared.playback_started.elapsed().as_secs_f32();
            let duration = shared.recorded.last().map(|value| value.0).unwrap_or(0.0).max(0.01);
            let local = elapsed % duration;
            for (time, point) in &shared.recorded {
                if (*time - local).abs() < 0.020 { replay.push(*point); }
            }
            shared.info.playing = true;
        }
        for point in replay { self.push(point); }
    }

    fn publish_snapshot(&self) {
        let shared = self.shared.read().expect("gesture state poisoned");
        let mut snapshot = self.snapshot.write().expect("gesture snapshot poisoned");
        let mut points = [GesturePoint::default(); MAX_POINTS];
        let count = shared.history.len().min(MAX_POINTS);
        for (index, point) in shared.history.iter().rev().take(MAX_POINTS).enumerate() {
            let mut value = *point;
            value.age = index as f32 / MAX_POINTS as f32;
            points[index] = value;
        }
        snapshot.points = points;
        snapshot.count = count as u32;
        snapshot.sequence = snapshot.sequence.wrapping_add(1);
    }
}
