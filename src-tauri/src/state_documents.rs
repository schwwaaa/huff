use crate::{
    automation::{self, AutomationClip, AutomationClipSummary},
    midi::{MidiInfo, MidiMapping},
    osc::{OscInfo, OscMapping},
    parameters::{
        canonicalize_parameter_value, definitions, ParameterDefinition, ParameterKind,
        ParameterSnapshot, ParameterStore,
    },
    source::ActiveSource,
    video::VideoStatus,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    time::{SystemTime, UNIX_EPOCH},
};

pub const STATE_DOCUMENT_SCHEMA: &str = "huff-state/v1";
pub const STATE_MODEL_VERSION: u32 = 1;
pub const ENGINE_BUILD: &str = "HNW-20";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StateDocumentKind {
    Preset,
    Snapshot,
    Sequence,
    Project,
}

impl StateDocumentKind {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "preset" => Ok(Self::Preset),
            "snapshot" => Ok(Self::Snapshot),
            "sequence" => Ok(Self::Sequence),
            "project" => Ok(Self::Project),
            _ => Err("state document kind must be preset, snapshot, sequence, or project".into()),
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Preset => "Preset",
            Self::Snapshot => "Snapshot",
            Self::Sequence => "Sequence",
            Self::Project => "Project",
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Preset => "huff-preset.json",
            Self::Snapshot => "huff-snapshot.json",
            Self::Sequence => "huff-sequence.json",
            Self::Project => "huff-project.json",
        }
    }

    pub fn default_scope(self) -> StateRecallScope {
        match self {
            Self::Preset => StateRecallScope {
                look: true,
                source: false,
                temporal: true,
                routing: true,
                render: false,
                transport: false,
                automation: false,
                control_maps: false,
                persistent_pixels: false,
            },
            Self::Snapshot => StateRecallScope {
                look: true,
                source: true,
                temporal: true,
                routing: true,
                render: true,
                transport: true,
                automation: true,
                control_maps: false,
                persistent_pixels: false,
            },
            Self::Sequence => StateRecallScope {
                look: false,
                source: false,
                temporal: false,
                routing: false,
                render: false,
                transport: false,
                automation: true,
                control_maps: false,
                persistent_pixels: false,
            },
            Self::Project => StateRecallScope {
                look: true,
                source: true,
                temporal: true,
                routing: true,
                render: true,
                transport: true,
                automation: true,
                control_maps: true,
                persistent_pixels: false,
            },
        }
    }

    pub fn allowed_scope(self) -> StateRecallScope {
        match self {
            Self::Preset => StateRecallScope {
                look: true,
                source: true,
                temporal: true,
                routing: true,
                render: false,
                transport: false,
                automation: false,
                control_maps: false,
                persistent_pixels: false,
            },
            Self::Snapshot => StateRecallScope {
                look: true,
                source: true,
                temporal: true,
                routing: true,
                render: true,
                transport: true,
                automation: true,
                control_maps: false,
                persistent_pixels: false,
            },
            Self::Sequence => StateRecallScope {
                look: false,
                source: false,
                temporal: false,
                routing: false,
                render: false,
                transport: false,
                automation: true,
                control_maps: false,
                persistent_pixels: false,
            },
            Self::Project => StateRecallScope {
                look: true,
                source: true,
                temporal: true,
                routing: true,
                render: true,
                transport: true,
                automation: true,
                control_maps: true,
                persistent_pixels: false,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateRecallScope {
    #[serde(default)]
    pub look: bool,
    #[serde(default)]
    pub source: bool,
    #[serde(default)]
    pub temporal: bool,
    #[serde(default)]
    pub routing: bool,
    #[serde(default)]
    pub render: bool,
    #[serde(default)]
    pub transport: bool,
    #[serde(default)]
    pub automation: bool,
    #[serde(default)]
    pub control_maps: bool,
    #[serde(default)]
    pub persistent_pixels: bool,
}

impl StateRecallScope {
    pub fn intersect(&self, other: &Self) -> Self {
        Self {
            look: self.look && other.look,
            source: self.source && other.source,
            temporal: self.temporal && other.temporal,
            routing: self.routing && other.routing,
            render: self.render && other.render,
            transport: self.transport && other.transport,
            automation: self.automation && other.automation,
            control_maps: self.control_maps && other.control_maps,
            persistent_pixels: self.persistent_pixels && other.persistent_pixels,
        }
    }

    pub fn allows(&self, domain: ParameterStateDomain) -> bool {
        match domain {
            ParameterStateDomain::Look => self.look,
            ParameterStateDomain::Source => self.source,
            ParameterStateDomain::Temporal => self.temporal,
            ParameterStateDomain::Routing => self.routing,
            ParameterStateDomain::Render => self.render,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParameterStateDomain {
    Look,
    Source,
    Temporal,
    Routing,
    Render,
}

impl ParameterStateDomain {
    pub fn label(self) -> &'static str {
        match self {
            Self::Look => "look",
            Self::Source => "source",
            Self::Temporal => "temporal",
            Self::Routing => "routing",
            Self::Render => "render",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParameterInterpolationPolicy {
    Step,
    Continuous,
    TriggerOnly,
    NotSequenceable,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParameterLiveSafety {
    Safe,
    ClearsTemporalState,
    RebuildsRenderGraph,
    TriggerOnly,
    NotImplemented,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateParameterMetadata {
    pub id: String,
    pub label: String,
    pub group: String,
    pub domain: ParameterStateDomain,
    pub presettable: bool,
    pub snapshot_scoped: bool,
    pub sequenceable: bool,
    pub interpolation_policy: ParameterInterpolationPolicy,
    pub project_scoped: bool,
    pub live_safety: ParameterLiveSafety,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateModelCatalog {
    pub schema: String,
    pub model_version: u32,
    pub engine_build: String,
    pub parameter_count: usize,
    pub presettable_count: usize,
    pub sequenceable_count: usize,
    pub domains: BTreeMap<String, usize>,
    pub default_scopes: BTreeMap<String, StateRecallScope>,
    pub persistent_image_policy: String,
    pub parameters: Vec<StateParameterMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStateDocument {
    pub active_source: String,
    #[serde(default)]
    pub video_path: String,
    #[serde(default)]
    pub video_position_seconds: f64,
    #[serde(default)]
    pub video_playing: bool,
    #[serde(default)]
    pub video_looping: bool,
    #[serde(default = "default_playback_rate")]
    pub video_playback_rate: f64,
    #[serde(default = "default_decode_mode")]
    pub video_decode_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiMapState {
    pub name: String,
    pub mappings: Vec<MidiMapping>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OscMapState {
    pub name: String,
    pub mappings: Vec<OscMapping>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistentImageState {
    pub embedded: bool,
    pub policy: String,
    pub resources: Vec<String>,
}

impl Default for PersistentImageState {
    fn default() -> Self {
        Self {
            embedded: false,
            policy: "not_embedded_clear_on_recall_when_temporal_or_render_state_changes".into(),
            resources: vec![
                "gpu_history_ring".into(),
                "flying_glitch_buffer".into(),
                "feedback_store".into(),
                "flow_state".into(),
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateDocument {
    pub schema: String,
    pub model_version: u32,
    pub kind: StateDocumentKind,
    pub name: String,
    pub created_unix_ms: u64,
    pub engine_build: String,
    pub recall_scope: StateRecallScope,
    #[serde(default)]
    pub parameter_values: BTreeMap<String, Value>,
    #[serde(default)]
    pub source_state: Option<SourceStateDocument>,
    #[serde(default)]
    pub automation_clip: Option<AutomationClip>,
    #[serde(default)]
    pub midi_map: Option<MidiMapState>,
    #[serde(default)]
    pub osc_map: Option<OscMapState>,
    #[serde(default)]
    pub persistent_images: PersistentImageState,
    #[serde(default)]
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateDocumentReceipt {
    pub path: String,
    pub kind: StateDocumentKind,
    pub name: String,
    pub parameter_count: usize,
    pub has_automation: bool,
    pub has_source_state: bool,
    pub has_control_maps: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateLoadResult {
    pub path: String,
    pub kind: StateDocumentKind,
    pub name: String,
    pub applied_scope: StateRecallScope,
    pub parameter_snapshot: ParameterSnapshot,
    pub applied_parameter_count: usize,
    pub automation: Option<AutomationClipSummary>,
    pub source_state: Option<SourceStateDocument>,
    pub midi_map: Option<MidiMapState>,
    pub osc_map: Option<OscMapState>,
    pub clear_temporal_buffers: bool,
    pub warnings: Vec<String>,
}

pub fn parameter_metadata(definition: &ParameterDefinition) -> StateParameterMetadata {
    let domain = parameter_domain(&definition.id);
    let sequenceable = definition.implemented && automation::is_automation_parameter(&definition.id);
    let presettable = definition.implemented
        && !matches!(domain, ParameterStateDomain::Render)
        && !definition.id.starts_with("history.")
        && definition.id != "source.seed_on_load"
        && definition.id != "flow.flow_pulse_trig";
    let interpolation_policy = if !sequenceable {
        ParameterInterpolationPolicy::NotSequenceable
    } else if definition.id == "flow.flow_pulse_trig" {
        ParameterInterpolationPolicy::TriggerOnly
    } else {
        match definition.kind {
            ParameterKind::Number => ParameterInterpolationPolicy::Continuous,
            ParameterKind::Bool | ParameterKind::Select => ParameterInterpolationPolicy::Step,
        }
    };
    let live_safety = if !definition.implemented {
        ParameterLiveSafety::NotImplemented
    } else if definition.id == "flow.flow_pulse_trig" {
        ParameterLiveSafety::TriggerOnly
    } else if definition.id.starts_with("render.") {
        ParameterLiveSafety::RebuildsRenderGraph
    } else if definition.id.starts_with("history.") {
        ParameterLiveSafety::ClearsTemporalState
    } else {
        ParameterLiveSafety::Safe
    };
    StateParameterMetadata {
        id: definition.id.clone(),
        label: definition.label.clone(),
        group: definition.group.clone(),
        domain,
        presettable,
        snapshot_scoped: definition.implemented,
        sequenceable,
        interpolation_policy,
        project_scoped: definition.implemented,
        live_safety,
    }
}

pub fn parameter_domain(id: &str) -> ParameterStateDomain {
    if id.starts_with("render.") {
        ParameterStateDomain::Render
    } else if id.starts_with("source.") {
        ParameterStateDomain::Source
    } else if id.starts_with("history.") || id.starts_with("feedback.") {
        ParameterStateDomain::Temporal
    } else if id.starts_with("routing.")
        || id.starts_with("layers.")
        || id == "global_mix.global_mix_pos"
        || id == "flow.flow_target"
        || id == "luma.luma_key_ab"
    {
        ParameterStateDomain::Routing
    } else {
        ParameterStateDomain::Look
    }
}

pub fn model_catalog() -> StateModelCatalog {
    let parameters: Vec<_> = definitions().iter().map(parameter_metadata).collect();
    let mut domains = BTreeMap::new();
    for metadata in &parameters {
        *domains.entry(metadata.domain.label().to_string()).or_insert(0) += 1;
    }
    let mut default_scopes = BTreeMap::new();
    for kind in [
        StateDocumentKind::Preset,
        StateDocumentKind::Snapshot,
        StateDocumentKind::Sequence,
        StateDocumentKind::Project,
    ] {
        default_scopes.insert(kind_label_key(kind).into(), kind.default_scope());
    }
    StateModelCatalog {
        schema: STATE_DOCUMENT_SCHEMA.into(),
        model_version: STATE_MODEL_VERSION,
        engine_build: ENGINE_BUILD.into(),
        parameter_count: parameters.len(),
        presettable_count: parameters.iter().filter(|metadata| metadata.presettable).count(),
        sequenceable_count: parameters.iter().filter(|metadata| metadata.sequenceable).count(),
        domains,
        default_scopes,
        persistent_image_policy: "Persistent GPU pixels are intentionally separate from presets, snapshots, sequences, and projects in HNW-20. State documents identify these resources but do not silently embed them.".into(),
        parameters,
    }
}

pub fn build_document(
    kind: StateDocumentKind,
    name: String,
    requested_scope: StateRecallScope,
    parameter_snapshot: ParameterSnapshot,
    active_source: ActiveSource,
    video: VideoStatus,
    automation_clip: Option<AutomationClip>,
    midi: MidiInfo,
    osc: OscInfo,
) -> Result<StateDocument, String> {
    let name = clean_name(&name, kind.label());
    let scope = requested_scope.intersect(&kind.allowed_scope());
    if kind == StateDocumentKind::Sequence && automation_clip.is_none() {
        return Err("record or import an active automation clip before saving a sequence".into());
    }
    if kind == StateDocumentKind::Sequence && !scope.automation {
        return Err("sequence documents require the Automation scope".into());
    }
    let parameter_values = filter_parameter_values(&parameter_snapshot.values, &scope, kind);
    let source_state = if scope.source || scope.transport {
        Some(SourceStateDocument {
            active_source: active_source.label().into(),
            video_path: video.file_path,
            video_position_seconds: video.position_seconds,
            video_playing: video.playing,
            video_looping: video.looping,
            video_playback_rate: video.playback_rate,
            video_decode_mode: video.decode_mode,
        })
    } else {
        None
    };
    let automation_clip = if scope.automation { automation_clip } else { None };
    let midi_map = if scope.control_maps {
        Some(MidiMapState {
            name: midi.map_name,
            mappings: midi.mappings,
        })
    } else {
        None
    };
    let osc_map = if scope.control_maps {
        Some(OscMapState {
            name: osc.map_name,
            mappings: osc.mappings,
        })
    } else {
        None
    };
    let mut notes = Vec::new();
    if requested_scope.persistent_pixels {
        notes.push("Persistent GPU pixel contents were requested but are not embedded by huff-state/v1.".into());
    }
    notes.push(match kind {
        StateDocumentKind::Preset => "Preset: reusable scoped artistic state; does not imply full machine recall.".into(),
        StateDocumentKind::Snapshot => "Snapshot: broad machine-state capture with explicit recall scope; persistent GPU pixels remain separate.".into(),
        StateDocumentKind::Sequence => "Sequence: source-independent canonical automation clip; not a rendered movie.".into(),
        StateDocumentKind::Project => "Project: portable state container for parameters, source/transport references, automation, and controller maps selected by scope.".into(),
    });
    Ok(StateDocument {
        schema: STATE_DOCUMENT_SCHEMA.into(),
        model_version: STATE_MODEL_VERSION,
        kind,
        name,
        created_unix_ms: unix_ms(),
        engine_build: ENGINE_BUILD.into(),
        recall_scope: scope,
        parameter_values,
        source_state,
        automation_clip,
        midi_map,
        osc_map,
        persistent_images: PersistentImageState::default(),
        notes,
    })
}

pub fn validate_document(mut document: StateDocument) -> Result<StateDocument, String> {
    if document.schema != STATE_DOCUMENT_SCHEMA {
        return Err(format!(
            "unsupported state document schema: {}; expected {}",
            document.schema, STATE_DOCUMENT_SCHEMA
        ));
    }
    if document.model_version == 0 {
        document.model_version = STATE_MODEL_VERSION;
    }
    if document.model_version > STATE_MODEL_VERSION {
        return Err(format!(
            "state model version {} is newer than this build supports",
            document.model_version
        ));
    }
    document.name = clean_name(&document.name, document.kind.label());
    let mut canonical = BTreeMap::new();
    for (id, value) in std::mem::take(&mut document.parameter_values) {
        let Ok((id, value)) = canonicalize_parameter_value(&id, value) else {
            continue;
        };
        let Some(definition) = definitions().iter().find(|definition| definition.id == id) else {
            continue;
        };
        let metadata = parameter_metadata(definition);
        if document.recall_scope.allows(metadata.domain)
            && allowed_for_kind(&metadata, document.kind)
        {
            canonical.insert(id, value);
        }
    }
    document.parameter_values = canonical;
    if let Some(clip) = document.automation_clip.take() {
        document.automation_clip = Some(automation::normalize_clip(clip)?);
    }
    if document.kind == StateDocumentKind::Sequence && document.automation_clip.is_none() {
        return Err("sequence document contains no automation clip".into());
    }
    Ok(document)
}

pub fn prepare_load(
    document: &StateDocument,
    requested_scope: &StateRecallScope,
    parameters: &ParameterStore,
    path: String,
) -> Result<StateLoadResult, String> {
    let applied_scope = requested_scope.intersect(&document.recall_scope);
    let mut updates = BTreeMap::new();
    let mut clear_temporal_buffers = false;
    for (id, value) in &document.parameter_values {
        let Some(definition) = definitions().iter().find(|definition| definition.id == *id) else {
            continue;
        };
        let metadata = parameter_metadata(definition);
        if applied_scope.allows(metadata.domain) && allowed_for_kind(&metadata, document.kind) {
            updates.insert(id.clone(), value.clone());
            if matches!(
                metadata.live_safety,
                ParameterLiveSafety::ClearsTemporalState | ParameterLiveSafety::RebuildsRenderGraph
            ) || matches!(metadata.domain, ParameterStateDomain::Temporal)
            {
                clear_temporal_buffers = true;
            }
        }
    }
    if !updates.is_empty() {
        parameters.set_many(updates.clone())?;
    }
    let mut warnings = Vec::new();
    if applied_scope.persistent_pixels {
        warnings.push("Persistent GPU pixel contents are not embedded in huff-state/v1; temporal stores will start from the current or cleared runtime state.".into());
    }
    if document.persistent_images.embedded {
        warnings.push("This build does not restore embedded persistent-image payloads; only their manifest is recognized.".into());
    }
    Ok(StateLoadResult {
        path,
        kind: document.kind,
        name: document.name.clone(),
        applied_scope,
        parameter_snapshot: parameters.snapshot(),
        applied_parameter_count: updates.len(),
        automation: None,
        source_state: document.source_state.clone(),
        midi_map: document.midi_map.clone(),
        osc_map: document.osc_map.clone(),
        clear_temporal_buffers,
        warnings,
    })
}

pub fn receipt(path: String, document: &StateDocument) -> StateDocumentReceipt {
    StateDocumentReceipt {
        path,
        kind: document.kind,
        name: document.name.clone(),
        parameter_count: document.parameter_values.len(),
        has_automation: document.automation_clip.is_some(),
        has_source_state: document.source_state.is_some(),
        has_control_maps: document.midi_map.is_some() || document.osc_map.is_some(),
    }
}

pub fn suggested_filename(kind: StateDocumentKind, name: &str) -> String {
    let stem = clean_file_stem(name, "huff-state");
    format!("{stem}.{}", kind.extension())
}

fn filter_parameter_values(
    values: &BTreeMap<String, Value>,
    scope: &StateRecallScope,
    kind: StateDocumentKind,
) -> BTreeMap<String, Value> {
    values
        .iter()
        .filter_map(|(id, value)| {
            let definition = definitions().iter().find(|definition| definition.id == *id)?;
            let metadata = parameter_metadata(definition);
            (scope.allows(metadata.domain) && allowed_for_kind(&metadata, kind))
                .then(|| (id.clone(), value.clone()))
        })
        .collect()
}

fn allowed_for_kind(metadata: &StateParameterMetadata, kind: StateDocumentKind) -> bool {
    match kind {
        StateDocumentKind::Preset => metadata.presettable,
        StateDocumentKind::Snapshot => metadata.snapshot_scoped,
        StateDocumentKind::Sequence => false,
        StateDocumentKind::Project => metadata.project_scoped,
    }
}

fn kind_label_key(kind: StateDocumentKind) -> &'static str {
    match kind {
        StateDocumentKind::Preset => "preset",
        StateDocumentKind::Snapshot => "snapshot",
        StateDocumentKind::Sequence => "sequence",
        StateDocumentKind::Project => "project",
    }
}

fn clean_name(value: &str, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.into()
    } else {
        value.chars().take(120).collect()
    }
}

fn clean_file_stem(value: &str, fallback: &str) -> String {
    let cleaned: String = value
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else if character.is_whitespace() {
                '-'
            } else {
                '_'
            }
        })
        .take(80)
        .collect();
    let cleaned = cleaned.trim_matches(|character| matches!(character, '-' | '_'));
    if cleaned.is_empty() {
        fallback.into()
    } else {
        cleaned.into()
    }
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

fn default_playback_rate() -> f64 {
    1.0
}

fn default_decode_mode() -> String {
    "software".into()
}
