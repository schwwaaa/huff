use crate::{
    automation::AutomationHandle,
    control_mapping::{
        apply_target, default_behavior, default_curve, default_threshold, default_true,
        normalize_curve, valid_target, ControlActionBus,
    },
    parameters::ParameterStore,
};
use midir::{Ignore, MidiInput, MidiInputConnection};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, VecDeque},
    sync::{
        mpsc::{sync_channel, Receiver, SyncSender},
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

pub const DEFAULT_PARAMETERS: [f32; PARAMETER_COUNT] = [
    0.58, 0.45, 0.50, 0.55, 0.42, 0.76, 0.45, 0.62,
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
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_behavior")]
    pub behavior: String,
    #[serde(default = "default_curve")]
    pub curve: String,
    #[serde(default = "default_threshold")]
    pub threshold: f32,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone)]
pub enum MidiCommand {
    RefreshPorts,
    Connect(String),
    Disconnect,
    ArmLearn(String),
    CancelLearn,
    UpdateMapping(MidiMapping),
    DeleteMapping(u64),
    ReplaceMappings(Vec<MidiMapping>),
    ClearMappings,
    LoadStarterMappings,
    SetMapName(String),
    Shutdown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiInfo {
    pub ports: Vec<String>,
    pub connected_port: String,
    pub connected: bool,
    pub learn_target: String,
    pub map_name: String,
    pub mappings: Vec<MidiMapping>,
    pub validation_warnings: Vec<String>,
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
    map_name: String,
    mappings: Vec<MidiMapping>,
    previous_inputs: BTreeMap<u64, f32>,
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
            map_name: "Factory: Minimal".into(),
            mappings: Vec::new(),
            previous_inputs: BTreeMap::new(),
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

    pub fn mappings(&self) -> Vec<MidiMapping> {
        self.shared
            .read()
            .expect("MIDI state poisoned")
            .mappings
            .clone()
    }

    pub fn info(&self) -> MidiInfo {
        let shared = self.shared.read().expect("MIDI state poisoned");
        let snapshot = self.snapshot.read().expect("MIDI snapshot poisoned");
        MidiInfo {
            ports: shared.ports.clone(),
            connected_port: shared.connected_port.clone(),
            connected: !shared.connected_port.is_empty(),
            learn_target: shared.learn_target.clone().unwrap_or_default(),
            map_name: shared.map_name.clone(),
            mappings: shared.mappings.clone(),
            validation_warnings: mapping_warnings(&shared.mappings),
            history: shared.history.iter().cloned().collect(),
            total_messages: shared.total_messages,
            messages_per_second: shared.messages_per_second,
            active_notes: snapshot.notes.iter().filter(|value| **value > 0.001).count() as u32,
            pitch_bend: snapshot.pitch_bend,
            channel_pressure: snapshot.channel_pressure,
            sequence: snapshot.sequence,
            last_error: shared.last_error.clone(),
        }
    }
}

pub fn start(
    parameters: ParameterStore,
    automation: AutomationHandle,
    actions: ControlActionBus,
) -> Result<MidiHandle, String> {
    let (tx, rx) = sync_channel(256);
    let shared = Arc::new(RwLock::new(MidiShared::default()));
    let snapshot = Arc::new(RwLock::new(MidiSnapshot::default()));
    let thread_shared = Arc::clone(&shared);
    let thread_snapshot = Arc::clone(&snapshot);
    thread::Builder::new()
        .name("huff-midi-registry".into())
        .spawn(move || {
            run_midi_thread(
                rx,
                thread_shared,
                thread_snapshot,
                parameters,
                automation,
                actions,
            )
        })
        .map_err(|error| format!("could not start MIDI thread: {error}"))?;

    let handle = MidiHandle { tx, shared, snapshot };
    handle.send(MidiCommand::RefreshPorts);
    handle.send(MidiCommand::LoadStarterMappings);
    Ok(handle)
}

fn run_midi_thread(
    rx: Receiver<MidiCommand>,
    shared: Arc<RwLock<MidiShared>>,
    snapshot: Arc<RwLock<MidiSnapshot>>,
    parameters: ParameterStore,
    automation: AutomationHandle,
    actions: ControlActionBus,
) {
    let mut connection: Option<MidiInputConnection<()>> = None;
    loop {
        match rx.recv_timeout(Duration::from_millis(40)) {
            Ok(MidiCommand::RefreshPorts) => refresh_ports(&shared),
            Ok(MidiCommand::Connect(name)) => {
                connection = None;
                match open_connection(
                    &name,
                    Arc::clone(&shared),
                    Arc::clone(&snapshot),
                    parameters.clone(),
                    automation.clone(),
                    actions.clone(),
                ) {
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
                if valid_target(&target) {
                    shared.write().expect("MIDI state poisoned").learn_target = Some(target);
                }
            }
            Ok(MidiCommand::CancelLearn) => {
                shared.write().expect("MIDI state poisoned").learn_target = None;
            }
            Ok(MidiCommand::UpdateMapping(mapping)) => update_mapping(mapping, &shared),
            Ok(MidiCommand::DeleteMapping(id)) => {
                let mut state = shared.write().expect("MIDI state poisoned");
                state.mappings.retain(|mapping| mapping.id != id);
                state.previous_inputs.remove(&id);
            }
            Ok(MidiCommand::ReplaceMappings(mappings)) => replace_mappings(mappings, &shared),
            Ok(MidiCommand::ClearMappings) => {
                let mut state = shared.write().expect("MIDI state poisoned");
                state.mappings.clear();
                state.previous_inputs.clear();
                state.learn_target = None;
                state.map_name = "Empty".into();
            }
            Ok(MidiCommand::LoadStarterMappings) => {
                replace_mappings(starter_mappings(), &shared);
                shared.write().expect("MIDI state poisoned").map_name = "Factory: Minimal".into();
            }
            Ok(MidiCommand::SetMapName(name)) => {
                shared.write().expect("MIDI state poisoned").map_name = name;
            }
            Ok(MidiCommand::Shutdown) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }
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
    parameters: ParameterStore,
    automation: AutomationHandle,
    actions: ControlActionBus,
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
                if !bytes.is_empty() {
                    process_event(
                        parse_midi(timestamp, bytes),
                        &shared,
                        &snapshot,
                        &parameters,
                        &automation,
                        &actions,
                    );
                }
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
        _ => ("unknown", data1, data2, 0.0, 0.0),
    };
    MidiEvent {
        kind: kind.into(),
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
    parameters: &ParameterStore,
    automation: &AutomationHandle,
    actions: &ControlActionBus,
) {
    let mappings = {
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
                let id = state.next_mapping_id;
                state.next_mapping_id = state.next_mapping_id.wrapping_add(1).max(1);
                state.mappings.push(MidiMapping {
                    id,
                    target,
                    source_kind: learn_kind(&event).into(),
                    channel: event.channel,
                    number: event.data1,
                    min: 0.0,
                    max: 1.0,
                    invert: false,
                    smoothing: 0.18,
                    enabled: true,
                    behavior: if event.kind == "note_on" { "toggle".into() } else { "absolute".into() },
                    curve: "linear".into(),
                    threshold: 0.5,
                    note: "Learned".into(),
                });
                state.map_name = "Custom / learned".into();
            } else {
                state.learn_target = Some(target);
            }
        }
        state.mappings.clone()
    };

    {
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
        data.sequence = data.sequence.wrapping_add(1);
    }

    for mapping in mappings {
        if !mapping.enabled || !mapping_matches(&mapping, &event) {
            continue;
        }
        let source_value = if mapping.source_kind == "note_on" && event.kind == "note_off" {
            0.0
        } else {
            event.value
        };
        let mut normalized = if mapping.invert { 1.0 - source_value } else { source_value };
        normalized = normalize_curve(normalized, &mapping.curve);
        if matches!(mapping.behavior.as_str(), "toggle" | "trigger" | "gate") {
            normalized = if normalized >= mapping.threshold { 1.0 } else { 0.0 };
        }
        let previous = {
            let state = shared.read().expect("MIDI state poisoned");
            state.previous_inputs.get(&mapping.id).copied().unwrap_or(0.0)
        };
        let effective = if mapping.behavior == "absolute" {
            previous + (normalized - previous) * (1.0 - mapping.smoothing.clamp(0.0, 0.98))
        } else {
            normalized
        };
        if let Err(error) = apply_target(
            &mapping.target,
            &mapping.behavior,
            effective,
            previous,
            mapping.min,
            mapping.max,
            parameters,
            automation,
            actions,
        ) {
            shared.write().expect("MIDI state poisoned").last_error = error;
        }
        shared
            .write()
            .expect("MIDI state poisoned")
            .previous_inputs
            .insert(mapping.id, effective);
    }
}

fn can_learn_from(event: &MidiEvent) -> bool {
    matches!(
        event.kind.as_str(),
        "cc" | "note_on" | "pitch_bend" | "channel_pressure" | "poly_aftertouch"
    )
}

fn learn_kind(event: &MidiEvent) -> &str {
    if event.kind == "note_off" { "note_on" } else { &event.kind }
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
        "program_change" => event.kind == "program_change" && mapping.number == event.data1,
        _ => false,
    }
}

fn normalize_mapping(mapping: &mut MidiMapping) -> Result<(), String> {
    if !valid_target(&mapping.target) {
        return Err(format!("invalid MIDI mapping target: {}", mapping.target));
    }
    if !matches!(
        mapping.source_kind.as_str(),
        "cc" | "note_on" | "pitch_bend" | "channel_pressure" | "poly_aftertouch" | "program_change"
    ) {
        return Err(format!("invalid MIDI source kind: {}", mapping.source_kind));
    }
    if !matches!(mapping.behavior.as_str(), "absolute" | "toggle" | "gate" | "trigger") {
        mapping.behavior = "absolute".into();
    }
    if !matches!(mapping.curve.as_str(), "linear" | "square" | "cube" | "sqrt" | "smooth") {
        mapping.curve = "linear".into();
    }
    mapping.channel = mapping.channel.min(16);
    mapping.min = mapping.min.clamp(0.0, 1.0);
    mapping.max = mapping.max.clamp(0.0, 1.0);
    mapping.smoothing = mapping.smoothing.clamp(0.0, 0.98);
    mapping.threshold = mapping.threshold.clamp(0.0, 1.0);
    Ok(())
}

fn update_mapping(mut mapping: MidiMapping, shared: &Arc<RwLock<MidiShared>>) {
    let result = normalize_mapping(&mut mapping);
    let mut state = shared.write().expect("MIDI state poisoned");
    if let Err(error) = result {
        state.last_error = error;
        return;
    }
    if mapping.id == 0 {
        mapping.id = state.next_mapping_id;
        state.next_mapping_id = state.next_mapping_id.wrapping_add(1).max(1);
        state.mappings.push(mapping);
    } else if let Some(existing) = state.mappings.iter_mut().find(|item| item.id == mapping.id) {
        *existing = mapping;
    } else {
        state.next_mapping_id = state.next_mapping_id.max(mapping.id.saturating_add(1));
        state.mappings.push(mapping);
    }
    state.map_name = "Custom".into();
    state.last_error.clear();
}

fn replace_mappings(mappings: Vec<MidiMapping>, shared: &Arc<RwLock<MidiShared>>) {
    let mut cleaned = Vec::new();
    let mut errors = Vec::new();
    let mut next_id = 1_u64;
    for mut mapping in mappings.into_iter().take(256) {
        if mapping.id == 0 {
            mapping.id = next_id;
        }
        next_id = next_id.max(mapping.id.saturating_add(1));
        match normalize_mapping(&mut mapping) {
            Ok(()) => cleaned.push(mapping),
            Err(error) => errors.push(error),
        }
    }
    let mut state = shared.write().expect("MIDI state poisoned");
    state.mappings = cleaned;
    state.previous_inputs.clear();
    state.next_mapping_id = next_id.max(1);
    state.learn_target = None;
    state.last_error = errors.join("; ");
}

fn mapping_warnings(mappings: &[MidiMapping]) -> Vec<String> {
    let mut warnings = Vec::new();
    for (index, mapping) in mappings.iter().enumerate() {
        if !valid_target(&mapping.target) {
            warnings.push(format!("Mapping {} has unknown target {}", mapping.id, mapping.target));
        }
        for other in mappings.iter().skip(index + 1) {
            if mapping.enabled
                && other.enabled
                && mapping.source_kind == other.source_kind
                && mapping.channel == other.channel
                && mapping.number == other.number
            {
                warnings.push(format!(
                    "Source conflict: {} ch{} #{} drives {} and {}",
                    mapping.source_kind, mapping.channel, mapping.number, mapping.target, other.target
                ));
            }
        }
    }
    warnings
}

fn starter_mappings() -> Vec<MidiMapping> {
    vec![
        MidiMapping {
            id: 1,
            target: "feedback.amount".into(),
            source_kind: "cc".into(),
            channel: 1,
            number: 1,
            min: 0.0,
            max: 1.0,
            invert: false,
            smoothing: 0.18,
            enabled: true,
            behavior: "absolute".into(),
            curve: "linear".into(),
            threshold: 0.5,
            note: "Mod wheel → feedback".into(),
        },
        MidiMapping {
            id: 2,
            target: "flow_pulse".into(),
            source_kind: "note_on".into(),
            channel: 1,
            number: 60,
            min: 0.0,
            max: 1.0,
            invert: false,
            smoothing: 0.0,
            enabled: true,
            behavior: "trigger".into(),
            curve: "linear".into(),
            threshold: 0.1,
            note: "Middle C → Flow pulse".into(),
        },
    ]
}
