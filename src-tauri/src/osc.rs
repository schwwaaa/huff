use crate::{
    automation::AutomationHandle,
    control_mapping::{
        apply_target, default_behavior, default_curve, default_threshold, default_true,
        normalize_curve, valid_target, ControlActionBus,
    },
    parameters::ParameterStore,
};
use rosc::{decoder, OscMessage, OscPacket, OscType};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, VecDeque},
    io::ErrorKind,
    net::UdpSocket,
    sync::{
        mpsc::{sync_channel, Receiver, SyncSender},
        Arc, RwLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub const PARAMETER_COUNT: usize = 8;
pub const SIGNAL_COUNT: usize = 32;
pub const HISTORY_LIMIT: usize = 32;

pub const DEFAULT_PARAMETERS: [f32; PARAMETER_COUNT] = [
    0.58, 0.45, 0.50, 0.55, 0.42, 0.76, 0.45, 0.62,
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OscMapping {
    pub id: u64,
    pub target: String,
    pub address: String,
    pub argument_index: usize,
    pub input_min: f32,
    pub input_max: f32,
    pub output_min: f32,
    pub output_max: f32,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OscEvent {
    pub address: String,
    pub argument_types: Vec<String>,
    pub arguments: Vec<String>,
    pub numeric_values: Vec<f32>,
    pub sender: String,
    pub bundle_depth: u32,
    pub timestamp_micros: u64,
}

#[derive(Debug, Clone)]
pub enum OscCommand {
    Bind(String, u16),
    Stop,
    ArmLearn(String),
    CancelLearn,
    UpdateMapping(OscMapping),
    DeleteMapping(u64),
    ReplaceMappings(Vec<OscMapping>),
    ClearMappings,
    LoadStarterMappings,
    SetMapName(String),
    ClearHistory,
    Shutdown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OscInfo {
    pub bind_host: String,
    pub port: u16,
    pub listening: bool,
    pub local_address: String,
    pub learn_target: String,
    pub map_name: String,
    pub mappings: Vec<OscMapping>,
    pub validation_warnings: Vec<String>,
    pub history: Vec<OscEvent>,
    pub total_packets: u64,
    pub total_messages: u64,
    pub total_bundles: u64,
    pub decode_errors: u64,
    pub messages_per_second: f64,
    pub last_sender: String,
    pub sequence: u64,
    pub last_error: String,
}

#[derive(Debug, Clone)]
pub struct OscSnapshot {
    pub parameters: [f32; PARAMETER_COUNT],
    pub smoothing: [f32; PARAMETER_COUNT],
    pub signals: [f32; SIGNAL_COUNT],
    pub last_value: f32,
    pub last_address_phase: f32,
    pub pulse: f32,
    pub signal_sequence: u64,
    pub sequence: u64,
}

impl Default for OscSnapshot {
    fn default() -> Self {
        Self {
            parameters: DEFAULT_PARAMETERS,
            smoothing: [0.18; PARAMETER_COUNT],
            signals: [0.0; SIGNAL_COUNT],
            last_value: 0.0,
            last_address_phase: 0.5,
            pulse: 0.0,
            signal_sequence: 0,
            sequence: 0,
        }
    }
}

struct OscShared {
    bind_host: String,
    port: u16,
    listening: bool,
    local_address: String,
    learn_target: Option<String>,
    map_name: String,
    mappings: Vec<OscMapping>,
    previous_inputs: BTreeMap<u64, f32>,
    history: VecDeque<OscEvent>,
    total_packets: u64,
    total_messages: u64,
    total_bundles: u64,
    decode_errors: u64,
    messages_per_second: f64,
    rate_window_started: Instant,
    rate_window_messages: u64,
    last_sender: String,
    last_error: String,
    next_mapping_id: u64,
}

impl Default for OscShared {
    fn default() -> Self {
        Self {
            bind_host: "0.0.0.0".into(),
            port: 9000,
            listening: false,
            local_address: String::new(),
            learn_target: None,
            map_name: "Factory: Minimal".into(),
            mappings: Vec::new(),
            previous_inputs: BTreeMap::new(),
            history: VecDeque::new(),
            total_packets: 0,
            total_messages: 0,
            total_bundles: 0,
            decode_errors: 0,
            messages_per_second: 0.0,
            rate_window_started: Instant::now(),
            rate_window_messages: 0,
            last_sender: String::new(),
            last_error: String::new(),
            next_mapping_id: 1,
        }
    }
}

#[derive(Clone)]
pub struct OscHandle {
    tx: SyncSender<OscCommand>,
    shared: Arc<RwLock<OscShared>>,
    snapshot: Arc<RwLock<OscSnapshot>>,
}

impl OscHandle {
    pub fn send(&self, command: OscCommand) {
        let _ = self.tx.try_send(command);
    }

    pub fn snapshot(&self) -> Arc<RwLock<OscSnapshot>> {
        Arc::clone(&self.snapshot)
    }

    pub fn mappings(&self) -> Vec<OscMapping> {
        self.shared
            .read()
            .expect("OSC state poisoned")
            .mappings
            .clone()
    }

    pub fn info(&self) -> OscInfo {
        let shared = self.shared.read().expect("OSC state poisoned");
        let snapshot = self.snapshot.read().expect("OSC snapshot poisoned");
        OscInfo {
            bind_host: shared.bind_host.clone(),
            port: shared.port,
            listening: shared.listening,
            local_address: shared.local_address.clone(),
            learn_target: shared.learn_target.clone().unwrap_or_default(),
            map_name: shared.map_name.clone(),
            mappings: shared.mappings.clone(),
            validation_warnings: mapping_warnings(&shared.mappings),
            history: shared.history.iter().cloned().collect(),
            total_packets: shared.total_packets,
            total_messages: shared.total_messages,
            total_bundles: shared.total_bundles,
            decode_errors: shared.decode_errors,
            messages_per_second: shared.messages_per_second,
            last_sender: shared.last_sender.clone(),
            sequence: snapshot.sequence,
            last_error: shared.last_error.clone(),
        }
    }
}

pub fn start(
    parameters: ParameterStore,
    automation: AutomationHandle,
    actions: ControlActionBus,
) -> Result<OscHandle, String> {
    let (tx, rx) = sync_channel(256);
    let shared = Arc::new(RwLock::new(OscShared::default()));
    let snapshot = Arc::new(RwLock::new(OscSnapshot::default()));
    let thread_shared = Arc::clone(&shared);
    let thread_snapshot = Arc::clone(&snapshot);
    thread::Builder::new()
        .name("huff-osc-network".into())
        .spawn(move || {
            worker(
                rx,
                thread_shared,
                thread_snapshot,
                parameters,
                automation,
                actions,
            )
        })
        .map_err(|error| format!("could not start OSC worker: {error}"))?;
    let handle = OscHandle { tx, shared, snapshot };
    handle.send(OscCommand::LoadStarterMappings);
    handle.send(OscCommand::Bind("0.0.0.0".into(), 9000));
    Ok(handle)
}

fn worker(
    rx: Receiver<OscCommand>,
    shared: Arc<RwLock<OscShared>>,
    snapshot: Arc<RwLock<OscSnapshot>>,
    parameters: ParameterStore,
    automation: AutomationHandle,
    actions: ControlActionBus,
) {
    let mut socket: Option<UdpSocket> = None;
    let mut buffer = vec![0_u8; 65_536];
    let mut running = true;
    while running {
        loop {
            match rx.try_recv() {
                Ok(command) => match command {
                    OscCommand::Bind(host, port) => socket = bind_socket(&host, port, &shared),
                    OscCommand::Stop => {
                        socket = None;
                        let mut state = shared.write().expect("OSC state poisoned");
                        state.listening = false;
                        state.local_address.clear();
                        state.last_error.clear();
                    }
                    OscCommand::ArmLearn(target) => {
                        if valid_target(&target) {
                            shared.write().expect("OSC state poisoned").learn_target = Some(target);
                        }
                    }
                    OscCommand::CancelLearn => {
                        shared.write().expect("OSC state poisoned").learn_target = None;
                    }
                    OscCommand::UpdateMapping(mapping) => update_mapping(mapping, &shared),
                    OscCommand::DeleteMapping(id) => {
                        let mut state = shared.write().expect("OSC state poisoned");
                        state.mappings.retain(|mapping| mapping.id != id);
                        state.previous_inputs.remove(&id);
                    }
                    OscCommand::ReplaceMappings(mappings) => replace_mappings(mappings, &shared),
                    OscCommand::ClearMappings => {
                        let mut state = shared.write().expect("OSC state poisoned");
                        state.mappings.clear();
                        state.previous_inputs.clear();
                        state.learn_target = None;
                        state.map_name = "Empty".into();
                    }
                    OscCommand::LoadStarterMappings => {
                        replace_mappings(starter_mappings(), &shared);
                        shared.write().expect("OSC state poisoned").map_name = "Factory: Minimal".into();
                    }
                    OscCommand::SetMapName(name) => {
                        shared.write().expect("OSC state poisoned").map_name = name;
                    }
                    OscCommand::ClearHistory => {
                        shared.write().expect("OSC state poisoned").history.clear();
                    }
                    OscCommand::Shutdown => {
                        running = false;
                        break;
                    }
                },
                Err(std::sync::mpsc::TryRecvError::Empty) => break,
                Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                    running = false;
                    break;
                }
            }
        }
        if !running {
            break;
        }

        if let Some(active_socket) = socket.as_ref() {
            match active_socket.recv_from(&mut buffer) {
                Ok((size, sender)) => {
                    {
                        let mut state = shared.write().expect("OSC state poisoned");
                        state.total_packets = state.total_packets.wrapping_add(1);
                    }
                    match decoder::decode_udp(&buffer[..size]) {
                        Ok((_, packet)) => process_packet(
                            packet,
                            &sender.to_string(),
                            0,
                            &shared,
                            &snapshot,
                            &parameters,
                            &automation,
                            &actions,
                        ),
                        Err(error) => {
                            let mut state = shared.write().expect("OSC state poisoned");
                            state.decode_errors = state.decode_errors.wrapping_add(1);
                            state.last_error = format!("OSC decode error: {error}");
                        }
                    }
                }
                Err(error) if error.kind() == ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(2));
                }
                Err(error) => {
                    shared.write().expect("OSC state poisoned").last_error =
                        format!("OSC receive error: {error}");
                    thread::sleep(Duration::from_millis(20));
                }
            }
        } else {
            thread::sleep(Duration::from_millis(20));
        }
        update_message_rate(&shared);
    }
}

fn bind_socket(host: &str, port: u16, shared: &Arc<RwLock<OscShared>>) -> Option<UdpSocket> {
    let host = if host.trim().is_empty() { "0.0.0.0" } else { host.trim() };
    let address = format!("{host}:{port}");
    match UdpSocket::bind(&address) {
        Ok(socket) => {
            if let Err(error) = socket.set_nonblocking(true) {
                shared.write().expect("OSC state poisoned").last_error =
                    format!("could not make OSC socket nonblocking: {error}");
                return None;
            }
            let local = socket.local_addr().map(|value| value.to_string()).unwrap_or(address.clone());
            let mut state = shared.write().expect("OSC state poisoned");
            state.bind_host = host.into();
            state.port = port;
            state.listening = true;
            state.local_address = local;
            state.last_error.clear();
            Some(socket)
        }
        Err(error) => {
            let mut state = shared.write().expect("OSC state poisoned");
            state.listening = false;
            state.last_error = format!("could not bind UDP {address}: {error}");
            None
        }
    }
}

fn process_packet(
    packet: OscPacket,
    sender: &str,
    depth: u32,
    shared: &Arc<RwLock<OscShared>>,
    snapshot: &Arc<RwLock<OscSnapshot>>,
    parameters: &ParameterStore,
    automation: &AutomationHandle,
    actions: &ControlActionBus,
) {
    match packet {
        OscPacket::Message(message) => process_message(
            message,
            sender,
            depth,
            shared,
            snapshot,
            parameters,
            automation,
            actions,
        ),
        OscPacket::Bundle(bundle) => {
            shared.write().expect("OSC state poisoned").total_bundles += 1;
            for nested in bundle.content {
                process_packet(
                    nested,
                    sender,
                    depth.saturating_add(1),
                    shared,
                    snapshot,
                    parameters,
                    automation,
                    actions,
                );
            }
        }
    }
}

fn process_message(
    message: OscMessage,
    sender: &str,
    depth: u32,
    shared: &Arc<RwLock<OscShared>>,
    snapshot: &Arc<RwLock<OscSnapshot>>,
    parameters: &ParameterStore,
    automation: &AutomationHandle,
    actions: &ControlActionBus,
) {
    let numeric_values = message.args.iter().filter_map(numeric_value).collect::<Vec<_>>();
    let event = OscEvent {
        address: message.addr.clone(),
        argument_types: message.args.iter().map(argument_type_name).collect(),
        arguments: message.args.iter().map(argument_display).collect(),
        numeric_values: numeric_values.clone(),
        sender: sender.into(),
        bundle_depth: depth,
        timestamp_micros: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_micros() as u64)
            .unwrap_or(0),
    };

    let mappings = {
        let mut state = shared.write().expect("OSC state poisoned");
        state.total_messages = state.total_messages.wrapping_add(1);
        state.rate_window_messages = state.rate_window_messages.wrapping_add(1);
        state.last_sender = sender.into();
        state.last_error.clear();
        state.history.push_front(event);
        while state.history.len() > HISTORY_LIMIT {
            state.history.pop_back();
        }
        if let Some(target) = state.learn_target.take() {
            if let Some((argument_index, _)) = message
                .args
                .iter()
                .enumerate()
                .find(|(_, argument)| numeric_value(argument).is_some())
            {
                let id = state.next_mapping_id;
                state.next_mapping_id = state.next_mapping_id.wrapping_add(1).max(1);
                state.mappings.push(OscMapping {
                    id,
                    target,
                    address: message.addr.clone(),
                    argument_index,
                    input_min: 0.0,
                    input_max: 1.0,
                    output_min: 0.0,
                    output_max: 1.0,
                    invert: false,
                    smoothing: 0.18,
                    enabled: true,
                    behavior: "absolute".into(),
                    curve: "linear".into(),
                    threshold: 0.5,
                    note: "Learned".into(),
                });
                state.map_name = "Custom / learned".into();
            } else {
                state.last_error = "OSC Learn requires a numeric argument".into();
            }
        }
        state.mappings.clone()
    };

    {
        let mut data = snapshot.write().expect("OSC snapshot poisoned");
        let first_value = numeric_values.first().copied().unwrap_or(1.0);
        let signal_index = address_hash(&message.addr) % SIGNAL_COUNT;
        data.signals = [0.0; SIGNAL_COUNT];
        data.signals[signal_index] = normalize_visual_value(first_value);
        data.last_value = first_value;
        data.last_address_phase = signal_index as f32 / (SIGNAL_COUNT.saturating_sub(1).max(1) as f32);
        data.pulse = 1.0;
        data.signal_sequence = data.signal_sequence.wrapping_add(1);
        data.sequence = data.sequence.wrapping_add(1);
    }

    for mapping in mappings {
        if !mapping.enabled || mapping.address != message.addr {
            continue;
        }
        let Some(raw_value) = message.args.get(mapping.argument_index).and_then(numeric_value) else {
            continue;
        };
        let mut normalized = ((raw_value - mapping.input_min)
            / (mapping.input_max - mapping.input_min))
            .clamp(0.0, 1.0);
        if mapping.invert {
            normalized = 1.0 - normalized;
        }
        normalized = normalize_curve(normalized, &mapping.curve);
        if matches!(mapping.behavior.as_str(), "toggle" | "trigger" | "gate") {
            normalized = if normalized >= mapping.threshold { 1.0 } else { 0.0 };
        }
        let previous = shared
            .read()
            .expect("OSC state poisoned")
            .previous_inputs
            .get(&mapping.id)
            .copied()
            .unwrap_or(0.0);
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
            mapping.output_min,
            mapping.output_max,
            parameters,
            automation,
            actions,
        ) {
            shared.write().expect("OSC state poisoned").last_error = error;
        }
        shared
            .write()
            .expect("OSC state poisoned")
            .previous_inputs
            .insert(mapping.id, effective);
    }
}

fn update_message_rate(shared: &Arc<RwLock<OscShared>>) {
    let mut state = shared.write().expect("OSC state poisoned");
    let elapsed = state.rate_window_started.elapsed();
    if elapsed >= Duration::from_secs(1) {
        state.messages_per_second = state.rate_window_messages as f64 / elapsed.as_secs_f64();
        state.rate_window_messages = 0;
        state.rate_window_started = Instant::now();
    }
}

fn normalize_mapping(mapping: &mut OscMapping) -> Result<(), String> {
    if !valid_target(&mapping.target) {
        return Err(format!("invalid OSC mapping target: {}", mapping.target));
    }
    let trimmed = mapping.address.trim();
    mapping.address = if trimmed.starts_with('/') { trimmed.into() } else { format!("/{trimmed}") };
    if mapping.address == "/" {
        return Err("OSC address cannot be empty".into());
    }
    mapping.input_min = finite_or(mapping.input_min, 0.0);
    mapping.input_max = finite_or(mapping.input_max, 1.0);
    if (mapping.input_max - mapping.input_min).abs() < f32::EPSILON {
        mapping.input_max = mapping.input_min + 1.0;
    }
    mapping.output_min = finite_or(mapping.output_min, 0.0).clamp(0.0, 1.0);
    mapping.output_max = finite_or(mapping.output_max, 1.0).clamp(0.0, 1.0);
    mapping.smoothing = finite_or(mapping.smoothing, 0.18).clamp(0.0, 0.98);
    mapping.threshold = finite_or(mapping.threshold, 0.5).clamp(0.0, 1.0);
    if !matches!(mapping.behavior.as_str(), "absolute" | "toggle" | "gate" | "trigger") {
        mapping.behavior = "absolute".into();
    }
    if !matches!(mapping.curve.as_str(), "linear" | "square" | "cube" | "sqrt" | "smooth") {
        mapping.curve = "linear".into();
    }
    Ok(())
}

fn update_mapping(mut mapping: OscMapping, shared: &Arc<RwLock<OscShared>>) {
    let result = normalize_mapping(&mut mapping);
    let mut state = shared.write().expect("OSC state poisoned");
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

fn replace_mappings(mappings: Vec<OscMapping>, shared: &Arc<RwLock<OscShared>>) {
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
    let mut state = shared.write().expect("OSC state poisoned");
    state.mappings = cleaned;
    state.previous_inputs.clear();
    state.next_mapping_id = next_id.max(1);
    state.learn_target = None;
    state.last_error = errors.join("; ");
}

fn mapping_warnings(mappings: &[OscMapping]) -> Vec<String> {
    let mut warnings = Vec::new();
    for (index, mapping) in mappings.iter().enumerate() {
        if !valid_target(&mapping.target) {
            warnings.push(format!("Mapping {} has unknown target {}", mapping.id, mapping.target));
        }
        for other in mappings.iter().skip(index + 1) {
            if mapping.enabled
                && other.enabled
                && mapping.address == other.address
                && mapping.argument_index == other.argument_index
            {
                warnings.push(format!(
                    "Source conflict: {}[{}] drives {} and {}",
                    mapping.address, mapping.argument_index, mapping.target, other.target
                ));
            }
        }
    }
    warnings
}

fn starter_mappings() -> Vec<OscMapping> {
    vec![
        OscMapping {
            id: 1,
            target: "feedback.amount".into(),
            address: "/huff/feedback".into(),
            argument_index: 0,
            input_min: 0.0,
            input_max: 1.0,
            output_min: 0.0,
            output_max: 1.0,
            invert: false,
            smoothing: 0.18,
            enabled: true,
            behavior: "absolute".into(),
            curve: "linear".into(),
            threshold: 0.5,
            note: "Feedback amount".into(),
        },
        OscMapping {
            id: 2,
            target: "flow_pulse".into(),
            address: "/huff/flow/pulse".into(),
            argument_index: 0,
            input_min: 0.0,
            input_max: 1.0,
            output_min: 0.0,
            output_max: 1.0,
            invert: false,
            smoothing: 0.0,
            enabled: true,
            behavior: "trigger".into(),
            curve: "linear".into(),
            threshold: 0.1,
            note: "Flow pulse".into(),
        },
    ]
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() { value } else { fallback }
}

fn normalize_visual_value(value: f32) -> f32 {
    if !value.is_finite() {
        0.0
    } else if (0.0..=1.0).contains(&value) {
        value
    } else {
        (value.abs() / (1.0 + value.abs())).clamp(0.0, 1.0)
    }
}

fn numeric_value(value: &OscType) -> Option<f32> {
    match value {
        OscType::Int(value) => Some(*value as f32),
        OscType::Float(value) => Some(*value),
        OscType::Long(value) => Some(*value as f32),
        OscType::Double(value) => Some(*value as f32),
        OscType::Char(value) => Some(*value as u32 as f32),
        OscType::Bool(value) => Some(if *value { 1.0 } else { 0.0 }),
        _ => None,
    }
}

fn argument_type_name(value: &OscType) -> String {
    match value {
        OscType::Int(_) => "int",
        OscType::Float(_) => "float",
        OscType::String(_) => "string",
        OscType::Blob(_) => "blob",
        OscType::Time(_) => "time",
        OscType::Long(_) => "long",
        OscType::Double(_) => "double",
        OscType::Char(_) => "char",
        OscType::Color(_) => "color",
        OscType::Midi(_) => "midi",
        OscType::Bool(_) => "bool",
        OscType::Array(_) => "array",
        OscType::Nil => "nil",
        OscType::Inf => "inf",
    }
    .into()
}

fn argument_display(value: &OscType) -> String {
    match value {
        OscType::Int(value) => value.to_string(),
        OscType::Float(value) => format!("{value:.5}"),
        OscType::String(value) => value.clone(),
        OscType::Blob(value) => format!("blob[{}]", value.len()),
        OscType::Time(value) => format!("{value:?}"),
        OscType::Long(value) => value.to_string(),
        OscType::Double(value) => format!("{value:.6}"),
        OscType::Char(value) => value.to_string(),
        OscType::Color(value) => format!("{value:?}"),
        OscType::Midi(value) => format!("{value:?}"),
        OscType::Bool(value) => value.to_string(),
        OscType::Array(value) => format!("{value:?}"),
        OscType::Nil => "nil".into(),
        OscType::Inf => "inf".into(),
    }
}

fn address_hash(address: &str) -> usize {
    let mut hash = 2_166_136_261_u32;
    for byte in address.bytes() {
        hash ^= byte as u32;
        hash = hash.wrapping_mul(16_777_619);
    }
    hash as usize
}
