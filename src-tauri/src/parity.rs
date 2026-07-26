use crate::parameters::{definitions, ParameterDefinition, ParameterKind, ParameterSnapshot, ParameterStore};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::{BTreeMap, BTreeSet}, sync::OnceLock, time::{SystemTime, UNIX_EPOCH}};

const LEGACY_CONTRACT_JSON: &str = include_str!("legacy_parameter_contract.json");

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyContractFile {
    schema_version: u32,
    source: String,
    source_interface: String,
    description: String,
    parameter_count: usize,
    parameters: Vec<LegacyParameterContractEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyParameterContractEntry {
    canonical_id: String,
    legacy_id: String,
    label: String,
    group: String,
    kind: String,
    default: Value,
    min: Option<f64>,
    max: Option<f64>,
    step: Option<f64>,
    options: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationProfileSummary {
    pub id: String,
    pub title: String,
    pub description: String,
    pub parameter_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParityMismatch {
    pub canonical_id: String,
    pub legacy_id: String,
    pub label: String,
    pub group: String,
    pub field: String,
    pub native_value: Value,
    pub legacy_value: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentParityDifference {
    pub canonical_id: String,
    pub legacy_id: String,
    pub label: String,
    pub group: String,
    pub current_value: Value,
    pub legacy_default: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParityReport {
    pub schema_version: u32,
    pub engine_build: String,
    pub generated_unix_ms: u128,
    pub parameter_revision: u64,
    pub legacy_source: String,
    pub legacy_source_interface: String,
    pub contract_description: String,
    pub legacy_contract_parameters: usize,
    pub native_registry_parameters: usize,
    pub exact_contract_parameters: usize,
    pub contract_mismatch_fields: usize,
    pub contract_mismatches: Vec<ParityMismatch>,
    pub native_only_parameters: Vec<String>,
    pub current_values_different_from_legacy_defaults: usize,
    pub current_differences: Vec<CurrentParityDifference>,
    pub profiles: Vec<CalibrationProfileSummary>,
}

fn contract() -> &'static LegacyContractFile {
    static CONTRACT: OnceLock<LegacyContractFile> = OnceLock::new();
    CONTRACT.get_or_init(|| {
        serde_json::from_str(LEGACY_CONTRACT_JSON)
            .expect("embedded legacy parameter contract must be valid JSON")
    })
}

fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn parameter_kind_name(kind: ParameterKind) -> &'static str {
    match kind {
        ParameterKind::Bool => "bool",
        ParameterKind::Number => "number",
        ParameterKind::Select => "select",
    }
}

fn numeric_value(value: Option<f64>) -> Value {
    value.map_or(Value::Null, |number| serde_json::json!(number))
}

fn value_equal(left: &Value, right: &Value) -> bool {
    match (left.as_f64(), right.as_f64()) {
        (Some(left), Some(right)) => (left - right).abs() <= 0.000_000_1,
        _ => left == right,
    }
}

fn compare_field(
    mismatches: &mut Vec<ParityMismatch>,
    definition: &ParameterDefinition,
    legacy: &LegacyParameterContractEntry,
    field: &str,
    native_value: Value,
    legacy_value: Value,
) {
    if value_equal(&native_value, &legacy_value) {
        return;
    }
    mismatches.push(ParityMismatch {
        canonical_id: definition.id.clone(),
        legacy_id: legacy.legacy_id.clone(),
        label: legacy.label.clone(),
        group: legacy.group.clone(),
        field: field.into(),
        native_value,
        legacy_value,
    });
}

fn legacy_default_values() -> BTreeMap<String, Value> {
    contract()
        .parameters
        .iter()
        .map(|entry| (entry.canonical_id.clone(), entry.default.clone()))
        .collect()
}

fn put(values: &mut BTreeMap<String, Value>, id: &str, value: Value) {
    values.insert(id.into(), value);
}

pub fn calibration_profiles() -> Vec<CalibrationProfileSummary> {
    profile_specs()
        .into_iter()
        .map(|(id, title, description, values)| CalibrationProfileSummary {
            id: id.into(),
            title: title.into(),
            description: description.into(),
            parameter_count: values.len(),
        })
        .collect()
}

pub fn calibration_profile_values(id: &str) -> Result<BTreeMap<String, Value>, String> {
    profile_specs()
        .into_iter()
        .find(|(profile_id, _, _, _)| *profile_id == id)
        .map(|(_, _, _, values)| values)
        .ok_or_else(|| format!("unknown calibration profile: {id}"))
}

fn profile_specs() -> Vec<(&'static str, &'static str, &'static str, BTreeMap<String, Value>)> {
    let legacy = legacy_default_values();

    let mut glitch = legacy.clone();
    put(&mut glitch, "feedback.amount", serde_json::json!(0.0));
    put(&mut glitch, "feedback.persistence", serde_json::json!(0.0));
    put(&mut glitch, "glitch.corrupt_on", Value::Bool(true));
    put(&mut glitch, "clusters.cluster_tiles", Value::Bool(false));
    put(&mut glitch, "scanlines.clusters", Value::Bool(false));
    put(&mut glitch, "smoosh.smoosh_on", Value::Bool(false));
    put(&mut glitch, "luma.luma_key_on", Value::Bool(false));
    put(&mut glitch, "global_mix.global_mix_on", Value::Bool(false));
    put(&mut glitch, "flow.flow_on", Value::Bool(false));

    let mut clusters = glitch.clone();
    put(&mut clusters, "clusters.cluster_tiles", Value::Bool(true));
    put(&mut clusters, "clusters.clu_drift", serde_json::json!(0.75));
    put(&mut clusters, "clusters.clu_speed", serde_json::json!(1.0));
    put(&mut clusters, "clusters.clu_speed_var", serde_json::json!(0.25));

    let mut scan = legacy.clone();
    put(&mut scan, "feedback.amount", serde_json::json!(0.0));
    put(&mut scan, "feedback.persistence", serde_json::json!(0.0));
    put(&mut scan, "glitch.corrupt_on", Value::Bool(false));
    put(&mut scan, "clusters.cluster_tiles", Value::Bool(false));
    put(&mut scan, "scanlines.clusters", Value::Bool(true));
    put(&mut scan, "smoosh.smoosh_on", Value::Bool(false));
    put(&mut scan, "luma.luma_key_on", Value::Bool(false));
    put(&mut scan, "global_mix.global_mix_on", Value::Bool(false));
    put(&mut scan, "flow.flow_on", Value::Bool(false));

    let mut feedback = legacy.clone();
    put(&mut feedback, "glitch.corrupt_on", Value::Bool(false));
    put(&mut feedback, "clusters.cluster_tiles", Value::Bool(false));
    put(&mut feedback, "scanlines.clusters", Value::Bool(false));
    put(&mut feedback, "smoosh.smoosh_on", Value::Bool(false));
    put(&mut feedback, "luma.luma_key_on", Value::Bool(false));
    put(&mut feedback, "global_mix.global_mix_on", Value::Bool(false));
    put(&mut feedback, "flow.flow_on", Value::Bool(false));

    let mut flow = feedback.clone();
    put(&mut flow, "feedback.amount", serde_json::json!(0.85));
    put(&mut flow, "feedback.persistence", serde_json::json!(0.8));
    put(&mut flow, "flow.flow_on", Value::Bool(true));
    put(&mut flow, "flow.flow_strength", serde_json::json!(6.0));
    put(&mut flow, "flow.flow_target", Value::String("final".into()));

    vec![
        (
            "legacy-defaults",
            "Legacy defaults",
            "Restores every mapped legacy HUFF control to the exact default recorded in the supplied web/Tauri baseline. Native-only render and history configuration is preserved.",
            legacy,
        ),
        (
            "glitch-isolation",
            "Glitch isolation",
            "Disables the other effect families and enables deterministic historical glitch tiles for direct visual comparison.",
            glitch,
        ),
        (
            "cluster-isolation",
            "Cluster isolation",
            "Runs the glitch stage with moving cluster bodies and conservative deterministic motion values.",
            clusters,
        ),
        (
            "scan-isolation",
            "Scanline isolation",
            "Disables glitch, feedback recursion, Flow, and composite modifiers while enabling the scanline band system.",
            scan,
        ),
        (
            "feedback-reference",
            "Feedback reference",
            "Uses the original feedback defaults with all other effect families disabled so transform, persistence, and decay can be judged independently.",
            feedback,
        ),
        (
            "flow-reference",
            "Flow reference",
            "Feeds a bounded feedback image into the default final Flow warp so displacement behavior can be evaluated without glitch or scanline layers.",
            flow,
        ),
    ]
}

pub fn build_report(parameters: &ParameterStore) -> ParityReport {
    let legacy = contract();
    let registry = definitions();
    let snapshot: ParameterSnapshot = parameters.snapshot();
    let registry_by_id: BTreeMap<&str, &ParameterDefinition> = registry
        .iter()
        .map(|definition| (definition.id.as_str(), definition))
        .collect();
    let legacy_ids: BTreeSet<&str> = legacy
        .parameters
        .iter()
        .map(|entry| entry.canonical_id.as_str())
        .collect();

    let mut mismatches = Vec::new();
    let mut mismatched_parameters = BTreeSet::new();
    let mut current_differences = Vec::new();

    for entry in &legacy.parameters {
        let Some(definition) = registry_by_id.get(entry.canonical_id.as_str()).copied() else {
            mismatched_parameters.insert(entry.canonical_id.clone());
            mismatches.push(ParityMismatch {
                canonical_id: entry.canonical_id.clone(),
                legacy_id: entry.legacy_id.clone(),
                label: entry.label.clone(),
                group: entry.group.clone(),
                field: "missing_parameter".into(),
                native_value: Value::Null,
                legacy_value: entry.default.clone(),
            });
            continue;
        };

        let before = mismatches.len();
        compare_field(
            &mut mismatches,
            definition,
            entry,
            "legacyId",
            Value::String(definition.legacy_id.clone()),
            Value::String(entry.legacy_id.clone()),
        );
        compare_field(
            &mut mismatches,
            definition,
            entry,
            "kind",
            Value::String(parameter_kind_name(definition.kind).into()),
            Value::String(entry.kind.clone()),
        );
        compare_field(
            &mut mismatches,
            definition,
            entry,
            "default",
            definition.default.clone(),
            entry.default.clone(),
        );
        compare_field(
            &mut mismatches,
            definition,
            entry,
            "min",
            numeric_value(definition.min),
            numeric_value(entry.min),
        );
        compare_field(
            &mut mismatches,
            definition,
            entry,
            "max",
            numeric_value(definition.max),
            numeric_value(entry.max),
        );
        compare_field(
            &mut mismatches,
            definition,
            entry,
            "step",
            numeric_value(definition.step),
            numeric_value(entry.step),
        );
        compare_field(
            &mut mismatches,
            definition,
            entry,
            "options",
            serde_json::json!(&definition.options),
            serde_json::json!(&entry.options),
        );
        if mismatches.len() != before {
            mismatched_parameters.insert(entry.canonical_id.clone());
        }

        let current = snapshot
            .values
            .get(&entry.canonical_id)
            .cloned()
            .unwrap_or(Value::Null);
        if !value_equal(&current, &entry.default) {
            current_differences.push(CurrentParityDifference {
                canonical_id: entry.canonical_id.clone(),
                legacy_id: entry.legacy_id.clone(),
                label: entry.label.clone(),
                group: entry.group.clone(),
                current_value: current,
                legacy_default: entry.default.clone(),
            });
        }
    }

    let native_only_parameters = registry
        .iter()
        .filter(|definition| !legacy_ids.contains(definition.id.as_str()))
        .map(|definition| definition.id.clone())
        .collect::<Vec<_>>();

    ParityReport {
        schema_version: legacy.schema_version,
        engine_build: "HNW-18".into(),
        generated_unix_ms: now_unix_ms(),
        parameter_revision: snapshot.revision,
        legacy_source: legacy.source.clone(),
        legacy_source_interface: legacy.source_interface.clone(),
        contract_description: legacy.description.clone(),
        legacy_contract_parameters: legacy.parameter_count,
        native_registry_parameters: registry.len(),
        exact_contract_parameters: legacy
            .parameter_count
            .saturating_sub(mismatched_parameters.len()),
        contract_mismatch_fields: mismatches.len(),
        contract_mismatches: mismatches,
        native_only_parameters,
        current_values_different_from_legacy_defaults: current_differences.len(),
        current_differences,
        profiles: calibration_profiles(),
    }
}
