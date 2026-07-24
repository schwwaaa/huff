use midir::{Ignore, MidiInput, MidiInputConnection};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    sync::{
        mpsc::{sync_channel, Receiver, SyncSender, TryRecvError},
        Arc, RwLock,
    },
    thread,
    time::{Duration, Instant},
};

pub const PARAMETER_COUNT: usize = 8;
pub const NOTE_COUNT: usize = 128;
pub const HISTORY_LIMIT: usize = 24;

pub const PARAMETER_NAMES: [&str; PARAMETER_COUNT] = [
    "hue",
    "zoom",
    "rotation",
    "field_strength",
    "turbulence",
    "trail",
    "exposure",
    "pulse_decay",
];

pub const PARAMETER_LABELS: [&str; PARAMETER_COUNT] = [
    "Hue",
    "Zoom",
    "Rotation",
    "Field strength",
    "Turbulence",
    "Trail persistence",
    "Exposure",
    "Pulse decay",
];

pub const DEFAULT_PARAMETERS: [f32; PARAMETER_COUNT] = [
    0.58, // hue
    0.45, // normalized zoom
    0.50, // normalized rotation
    0.55, // field strength
    0.42, // turbulence
    0.76, // trail persistence
    0.45, // normalized exposure
    0.62, // pulse decay
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiEvent {
    pub kind: String,
    pub channel: u8,
    pub data1: u8,
    pub data2: u8,
    pub value: f32,
    pub signed_value: f32,
    pub raw: Vec<u8>,
    pub timestamp_micros: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiMapping {
    pub id: u64,
    pub target: String,
    pub source_kind: String,
    pub channel: u8,
    pub number: u8,
    pub min: f32,
    pub max: f32,
    pub invert: bool,
    pub smoothing: f32,
}

#[derive(Debug, Clone)]
pub enum MidiCommand {
    RefreshPorts,
    Connect(String),
    Disconnect,
    ArmLearn(String),
    CancelLearn,
    SetManual(String, f32),
    UpdateMapping(MidiMapping),
    DeleteMapping(u64),
    ReplaceMappings(Vec<MidiMapping>),
    ClearMappings,
    LoadStarterMappings,
    ResetParameters,
    Shutdown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterInfo {
    pub name: String,
    pub label: String,
    pub value: f32,
    pub smoothing: f32,
    pub mapped: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiInfo {
    pub ports: Vec<String>,
    pub connected_port: String,
    pub connected: bool,
    pub learn_target: String,
    pub mappings: Vec<MidiMapping>,
    pub parameters: Vec<ParameterInfo>,
    pub history: Vec<MidiEvent>,
    pub total_messages: u64,
    pub messages_per_second: f64,
    pub active_notes: u32,
    pub pitch_bend: f32,
    pub channel_pressure: f32,
    pub sequence: u64,
    pub last_error: String,
}

#[derive(Debug, Clone)]
pub struct MidiSnapshot {
    pub parameters: [f32; PARAMETER_COUNT],
    pub smoothing: [f32; PARAMETER_COUNT],
    pub notes: [f32; NOTE_COUNT],
    pub pitch_bend: f32,
    pub channel_pressure: f32,
    pub last_note: f32,
    pub pulse: f32,
    pub note_sequence: u64,
    pub sequence: u64,
}

impl Default for MidiSnapshot {
    fn default() -> Self {
        Self {
            parameters: DEFAULT_PARAMETERS,
            smoothing: [0.18; PARAMETER_COUNT],
            notes: [0.0; NOTE_COUNT],
            pitch_bend: 0.0,
            channel_pressure: 0.0,
            last_note: 0.5,
            pulse: 0.0,
            note_sequence: 0,
            sequence: 0,
        }
    }
}

struct MidiShared {
    ports: Vec<String>,
    connected_port: String,
    learn_target: Option<String>,
    mappings: Vec<MidiMapping>,
    history: VecDeque<MidiEvent>,
    total_messages: u64,
    messages_per_second: f64,
    rate_window_started: Instant,
    rate_window_messages: u64,
    last_error: String,
    next_mapping_id: u64,
}

impl Default for MidiShared {
    fn default() -> Self {
        Self {
            ports: Vec::new(),
            connected_port: String::new(),
            learn_target: None,
            mappings: Vec::new(),
            history: VecDeque::with_capacity(HISTORY_LIMIT),
            total_messages: 0,
            messages_per_second: 0.0,
            rate_window_started: Instant::now(),
            rate_window_messages: 0,
            last_error: String::new(),
            next_mapping_id: 1,
        }
    }
}

#[derive(Clone)]
pub struct MidiHandle {
    tx: SyncSender<MidiCommand>,
    shared: Arc<RwLock<MidiShared>>,
    snapshot: Arc<RwLock<MidiSnapshot>>,
}

impl MidiHandle {
    pub fn send(&self, command: MidiCommand) {
        let _ = self.tx.try_send(command);
    }

    pub fn snapshot(&self) -> Arc<RwLock<MidiSnapshot>> {
        Arc::clone(&self.snapshot)
    }

    pub fn info(&self) -> MidiInfo {
        let shared = self.shared.read().expect("MIDI state poisoned");
        let snapshot = self.snapshot.read().expect("MIDI snapshot poisoned");
        let parameters = PARAMETER_NAMES
            .iter()
            .enumerate()
            .map(|(index, name)| ParameterInfo {
                name: (*name).to_string(),
                label: PARAMETER_LABELS[index].to_string(),
                value: snapshot.parameters[index],
                smoothing: snapshot.smoothing[index],
                mapped: shared.mappings.iter().any(|mapping| mapping.target == *name),
            })
            .collect();
        let active_notes = snapshot.notes.iter().filter(|value| **value > 0.001).count() as u32;

        MidiInfo {
            ports: shared.ports.clone(),
            connected_port: shared.connected_port.clone(),
            connected: !shared.connected_port.is_empty(),
            learn_target: shared.learn_target.clone().unwrap_or_default(),
            mappings: shared.mappings.clone(),
            parameters,
            history: shared.history.iter().cloned().collect(),
            total_messages: shared.total_messages,
            messages_per_second: shared.messages_per_second,
            active_notes,
            pitch_bend: snapshot.pitch_bend,
            channel_pressure: snapshot.channel_pressure,
            sequence: snapshot.sequence,
            last_error: shared.last_error.clone(),
        }
    }
}

pub fn start() -> Result<MidiHandle, String> {
    let (tx, rx) = sync_channel(256);
    let shared = Arc::new(RwLock::new(MidiShared::default()));
    let snapshot = Arc::new(RwLock::new(MidiSnapshot::default()));

    let thread_shared = Arc::clone(&shared);
    let thread_snapshot = Arc::clone(&snapshot);
    thread::Builder::new()
        .name("huff-midi-registry".into())
        .spawn(move || run_midi_thread(rx, thread_shared, thread_snapshot))
        .map_err(|error| format!("could not start MIDI thread: {error}"))?;

    let handle = MidiHandle { tx, shared, snapshot };
    handle.send(MidiCommand::RefreshPorts);
    Ok(handle)
}

fn run_midi_thread(
    rx: Receiver<MidiCommand>,
    shared: Arc<RwLock<MidiShared>>,
    snapshot: Arc<RwLock<MidiSnapshot>>,
) {
    let mut connection: Option<MidiInputConnection<()>> = None;

    loop {
        match rx.recv_timeout(Duration::from_millis(40)) {
            Ok(MidiCommand::RefreshPorts) => refresh_ports(&shared),
            Ok(MidiCommand::Connect(name)) => {
                connection = None;
                match open_connection(&name, Arc::clone(&shared), Arc::clone(&snapshot)) {
                    Ok(new_connection) => {
                        connection = Some(new_connection);
                        let mut state = shared.write().expect("MIDI state poisoned");
                        state.connected_port = name;
                        state.last_error.clear();
                    }
                    Err(error) => {
                        let mut state = shared.write().expect("MIDI state poisoned");
                        state.connected_port.clear();
                        state.last_error = error;
                    }
                }
            }
            Ok(MidiCommand::Disconnect) => {
                connection = None;
                let mut state = shared.write().expect("MIDI state poisoned");
                state.connected_port.clear();
                state.learn_target = None;
            }
            Ok(MidiCommand::ArmLearn(target)) => {
                if parameter_index(&target).is_some() {
                    shared.write().expect("MIDI state poisoned").learn_target = Some(target);
                }
            }
            Ok(MidiCommand::CancelLearn) => {
                shared.write().expect("MIDI state poisoned").learn_target = None;
            }
            Ok(MidiCommand::SetManual(target, value)) => {
                if let Some(index) = parameter_index(&target) {
                    let mut data = snapshot.write().expect("MIDI snapshot poisoned");
                    data.parameters[index] = value.clamp(0.0, 1.0);
                    data.sequence = data.sequence.wrapping_add(1);
                }
            }
            Ok(MidiCommand::UpdateMapping(mapping)) => {
                update_mapping(mapping, &shared, &snapshot);
            }
            Ok(MidiCommand::DeleteMapping(id)) => {
                let mut state = shared.write().expect("MIDI state poisoned");
                state.mappings.retain(|mapping| mapping.id != id);
                refresh_mapping_smoothing(&state.mappings, &snapshot);
            }
            Ok(MidiCommand::ReplaceMappings(mappings)) => {
                replace_mappings(mappings, &shared, &snapshot);
            }
            Ok(MidiCommand::ClearMappings) => {
                let mut state = shared.write().expect("MIDI state poisoned");
                state.mappings.clear();
                state.learn_target = None;
                snapshot.write().expect("MIDI snapshot poisoned").smoothing = [0.18; PARAMETER_COUNT];
            }
            Ok(MidiCommand::LoadStarterMappings) => {
                replace_mappings(starter_mappings(), &shared, &snapshot);
            }
            Ok(MidiCommand::ResetParameters) => {
                let mut data = snapshot.write().expect("MIDI snapshot poisoned");
                data.parameters = DEFAULT_PARAMETERS;
                data.pitch_bend = 0.0;
                data.channel_pressure = 0.0;
                data.pulse = 0.0;
                data.note_sequence = data.note_sequence.wrapping_add(1);
                data.notes = [0.0; NOTE_COUNT];
                data.sequence = data.sequence.wrapping_add(1);
            }
            Ok(MidiCommand::Shutdown) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }

        // The connection is intentionally held by this thread. Dropping it disconnects the port.
        let _connection_is_active = connection.is_some();
    }
}

fn refresh_ports(shared: &Arc<RwLock<MidiShared>>) {
    match MidiInput::new("huff-midi-port-list") {
        Ok(input) => {
            let names = input
                .ports()
                .iter()
                .filter_map(|port| input.port_name(port).ok())
                .collect::<Vec<_>>();
            let mut state = shared.write().expect("MIDI state poisoned");
            state.ports = names;
            state.last_error.clear();
        }
        Err(error) => {
            shared.write().expect("MIDI state poisoned").last_error =
                format!("could not enumerate MIDI ports: {error}");
        }
    }
}

fn open_connection(
    requested_name: &str,
    shared: Arc<RwLock<MidiShared>>,
    snapshot: Arc<RwLock<MidiSnapshot>>,
) -> Result<MidiInputConnection<()>, String> {
    let mut input = MidiInput::new("huff-midi-input").map_err(|error| error.to_string())?;
    input.ignore(Ignore::None);
    let ports = input.ports();
    let requested_lower = requested_name.to_lowercase();
    let port = ports
        .iter()
        .find(|port| input.port_name(port).ok().as_deref() == Some(requested_name))
        .or_else(|| {
            ports.iter().find(|port| {
                input
                    .port_name(port)
                    .map(|name| name.to_lowercase().contains(&requested_lower))
                    .unwrap_or(false)
            })
        })
        .cloned()
        .ok_or_else(|| format!("MIDI port '{requested_name}' was not found"))?;

    input
        .connect(
            &port,
            "huff-midi-connection",
            move |timestamp, bytes, _| {
                if bytes.is_empty() {
                    return;
                }
                let event = parse_midi(timestamp, bytes);
                process_event(event, &shared, &snapshot);
            },
            (),
        )
        .map_err(|error| format!("could not connect to '{requested_name}': {error}"))
}

fn parse_midi(timestamp_micros: u64, bytes: &[u8]) -> MidiEvent {
    let status = bytes.first().copied().unwrap_or(0);
    let data1 = bytes.get(1).copied().unwrap_or(0);
    let data2 = bytes.get(2).copied().unwrap_or(0);
    let message_type = status & 0xF0;
    let channel = (status & 0x0F) + 1;

    let (kind, number, raw_value, value, signed_value) = match message_type {
        0x80 => ("note_off", data1, data2, 0.0, -1.0),
        0x90 if data2 > 0 => {
            let normalized = data2 as f32 / 127.0;
            ("note_on", data1, data2, normalized, normalized * 2.0 - 1.0)
        }
        0x90 => ("note_off", data1, data2, 0.0, -1.0),
        0xA0 => {
            let normalized = data2 as f32 / 127.0;
            ("poly_aftertouch", data1, data2, normalized, normalized * 2.0 - 1.0)
        }
        0xB0 => {
            let normalized = data2 as f32 / 127.0;
            ("cc", data1, data2, normalized, normalized * 2.0 - 1.0)
        }
        0xC0 => {
            let normalized = data1 as f32 / 127.0;
            ("program_change", data1, 0, normalized, normalized * 2.0 - 1.0)
        }
        0xD0 => {
            let normalized = data1 as f32 / 127.0;
            ("channel_pressure", 0, data1, normalized, normalized * 2.0 - 1.0)
        }
        0xE0 => {
            let raw14 = ((data2 as u16) << 7) | data1 as u16;
            let normalized = raw14 as f32 / 16383.0;
            ("pitch_bend", 0, data2, normalized, normalized * 2.0 - 1.0)
        }
        0xF0 => ("system", data1, data2, 0.0, 0.0),
        _ => ("unknown", data1, data2, 0.0, 0.0),
    };

    MidiEvent {
        kind: kind.to_string(),
        channel,
        data1: number,
        data2: raw_value,
        value,
        signed_value,
        raw: bytes.to_vec(),
        timestamp_micros,
    }
}

fn process_event(
    event: MidiEvent,
    shared: &Arc<RwLock<MidiShared>>,
    snapshot: &Arc<RwLock<MidiSnapshot>>,
) {
    let mut learned_mapping: Option<MidiMapping> = None;
    {
        let mut state = shared.write().expect("MIDI state poisoned");
        state.total_messages = state.total_messages.wrapping_add(1);
        state.rate_window_messages = state.rate_window_messages.wrapping_add(1);
        let elapsed = state.rate_window_started.elapsed().as_secs_f64();
        if elapsed >= 0.5 {
            state.messages_per_second = state.rate_window_messages as f64 / elapsed;
            state.rate_window_messages = 0;
            state.rate_window_started = Instant::now();
        }
        if state.history.len() == HISTORY_LIMIT {
            state.history.pop_back();
        }
        state.history.push_front(event.clone());
        state.last_error.clear();

        if let Some(target) = state.learn_target.take() {
            if can_learn_from(&event) {
                state.mappings.retain(|mapping| mapping.target != target);
                let mapping = MidiMapping {
                    id: state.next_mapping_id,
                    target,
                    source_kind: learn_kind(&event).to_string(),
                    channel: event.channel,
                    number: event.data1,
                    min: 0.0,
                    max: 1.0,
                    invert: false,
                    smoothing: 0.18,
                };
                state.next_mapping_id = state.next_mapping_id.wrapping_add(1).max(1);
                state.mappings.push(mapping.clone());
                learned_mapping = Some(mapping);
            } else {
                state.learn_target = Some(target);
            }
        }

        let mappings = state.mappings.clone();
        drop(state);
        apply_event_to_snapshot(&event, &mappings, snapshot);
    }

    if let Some(mapping) = learned_mapping {
        if let Some(index) = parameter_index(&mapping.target) {
            snapshot.write().expect("MIDI snapshot poisoned").smoothing[index] = mapping.smoothing;
        }
    }
}

fn apply_event_to_snapshot(
    event: &MidiEvent,
    mappings: &[MidiMapping],
    snapshot: &Arc<RwLock<MidiSnapshot>>,
) {
    let mut data = snapshot.write().expect("MIDI snapshot poisoned");
    match event.kind.as_str() {
        "note_on" => {
            let index = event.data1 as usize;
            if index < NOTE_COUNT {
                data.notes[index] = event.value;
                data.last_note = event.data1 as f32 / 127.0;
                data.pulse = event.value.max(data.pulse);
                data.note_sequence = data.note_sequence.wrapping_add(1);
            }
        }
        "note_off" => {
            let index = event.data1 as usize;
            if index < NOTE_COUNT {
                data.notes[index] = 0.0;
            }
        }
        "pitch_bend" => data.pitch_bend = event.signed_value,
        "channel_pressure" => data.channel_pressure = event.value,
        _ => {}
    }

    for mapping in mappings {
        if !mapping_matches(mapping, event) {
            continue;
        }
        if let Some(index) = parameter_index(&mapping.target) {
            let source_value = if mapping.source_kind == "note_on" && event.kind == "note_off" {
                0.0
            } else {
                event.value
            };
            let normalized = if mapping.invert {
                1.0 - source_value
            } else {
                source_value
            };
            data.parameters[index] = (mapping.min + (mapping.max - mapping.min) * normalized)
                .clamp(0.0, 1.0);
            data.smoothing[index] = mapping.smoothing.clamp(0.0, 0.98);
        }
    }
    data.sequence = data.sequence.wrapping_add(1);
}

fn can_learn_from(event: &MidiEvent) -> bool {
    matches!(
        event.kind.as_str(),
        "cc" | "note_on" | "pitch_bend" | "channel_pressure" | "poly_aftertouch"
    )
}

fn learn_kind(event: &MidiEvent) -> &str {
    match event.kind.as_str() {
        "note_off" => "note_on",
        kind => kind,
    }
}

fn mapping_matches(mapping: &MidiMapping, event: &MidiEvent) -> bool {
    if mapping.channel != 0 && mapping.channel != event.channel {
        return false;
    }
    match mapping.source_kind.as_str() {
        "note_on" => {
            matches!(event.kind.as_str(), "note_on" | "note_off") && mapping.number == event.data1
        }
        "cc" | "poly_aftertouch" => {
            mapping.source_kind == event.kind && mapping.number == event.data1
        }
        "pitch_bend" | "channel_pressure" => mapping.source_kind == event.kind,
        _ => false,
    }
}

fn parameter_index(name: &str) -> Option<usize> {
    PARAMETER_NAMES.iter().position(|candidate| *candidate == name)
}

fn update_mapping(
    mut mapping: MidiMapping,
    shared: &Arc<RwLock<MidiShared>>,
    snapshot: &Arc<RwLock<MidiSnapshot>>,
) {
    if parameter_index(&mapping.target).is_none() {
        return;
    }
    mapping.min = mapping.min.clamp(0.0, 1.0);
    mapping.max = mapping.max.clamp(0.0, 1.0);
    mapping.smoothing = mapping.smoothing.clamp(0.0, 0.98);
    let mut state = shared.write().expect("MIDI state poisoned");
    if let Some(existing) = state.mappings.iter_mut().find(|item| item.id == mapping.id) {
        *existing = mapping;
    }
    refresh_mapping_smoothing(&state.mappings, snapshot);
}

fn replace_mappings(
    mappings: Vec<MidiMapping>,
    shared: &Arc<RwLock<MidiShared>>,
    snapshot: &Arc<RwLock<MidiSnapshot>>,
) {
    let mut cleaned = Vec::new();
    let mut next_id = 1_u64;
    for mut mapping in mappings.into_iter().take(64) {
        if parameter_index(&mapping.target).is_none() {
            continue;
        }
        if !matches!(
            mapping.source_kind.as_str(),
            "cc" | "note_on" | "pitch_bend" | "channel_pressure" | "poly_aftertouch"
        ) {
            continue;
        }
        mapping.min = mapping.min.clamp(0.0, 1.0);
        mapping.max = mapping.max.clamp(0.0, 1.0);
        mapping.smoothing = mapping.smoothing.clamp(0.0, 0.98);
        if mapping.id == 0 {
            mapping.id = next_id;
        }
        next_id = next_id.max(mapping.id.saturating_add(1));
        cleaned.push(mapping);
    }

    let mut state = shared.write().expect("MIDI state poisoned");
    state.mappings = cleaned;
    state.next_mapping_id = next_id.max(1);
    state.learn_target = None;
    refresh_mapping_smoothing(&state.mappings, snapshot);
}

fn refresh_mapping_smoothing(
    mappings: &[MidiMapping],
    snapshot: &Arc<RwLock<MidiSnapshot>>,
) {
    let mut data = snapshot.write().expect("MIDI snapshot poisoned");
    data.smoothing = [0.18; PARAMETER_COUNT];
    for mapping in mappings {
        if let Some(index) = parameter_index(&mapping.target) {
            data.smoothing[index] = mapping.smoothing.clamp(0.0, 0.98);
        }
    }
}

fn starter_mappings() -> Vec<MidiMapping> {
    vec![
        MidiMapping {
            id: 1,
            target: "field_strength".into(),
            source_kind: "cc".into(),
            channel: 1,
            number: 1,
            min: 0.0,
            max: 1.0,
            invert: false,
            smoothing: 0.22,
        },
        MidiMapping {
            id: 2,
            target: "exposure".into(),
            source_kind: "cc".into(),
            channel: 1,
            number: 7,
            min: 0.15,
            max: 0.9,
            invert: false,
            smoothing: 0.18,
        },
        MidiMapping {
            id: 3,
            target: "hue".into(),
            source_kind: "cc".into(),
            channel: 1,
            number: 10,
            min: 0.0,
            max: 1.0,
            invert: false,
            smoothing: 0.12,
        },
        MidiMapping {
            id: 4,
            target: "turbulence".into(),
            source_kind: "cc".into(),
            channel: 1,
            number: 74,
            min: 0.0,
            max: 1.0,
            invert: false,
            smoothing: 0.28,
        },
        MidiMapping {
            id: 5,
            target: "rotation".into(),
            source_kind: "pitch_bend".into(),
            channel: 1,
            number: 0,
            min: 0.0,
            max: 1.0,
            invert: false,
            smoothing: 0.35,
        },
    ]
}
