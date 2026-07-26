use crate::{
    automation::{AutomationHandle, ACTION_CLEAR_BUFFERS, ACTION_FLOW_PULSE},
    parameters::{definitions, find_definition, ParameterKind, ParameterStore},
};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};

pub const MAPPING_SCHEMA: &str = "huff-control-map/v1";
pub const ACTION_RESET_PARAMETERS: &str = "reset_parameters";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlTargetInfo {
    pub id: String,
    pub label: String,
    pub group: String,
    pub kind: String,
    pub default: Value,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub options: Vec<String>,
    pub mappable: bool,
}

#[derive(Clone, Default)]
pub struct ControlActionBus {
    queue: Arc<Mutex<VecDeque<String>>>,
}

impl ControlActionBus {
    pub fn push(&self, action: impl Into<String>) {
        if let Ok(mut queue) = self.queue.lock() {
            if queue.len() >= 64 {
                queue.pop_front();
            }
            queue.push_back(action.into());
        }
    }

    pub fn drain(&self) -> Vec<String> {
        if let Ok(mut queue) = self.queue.lock() {
            return queue.drain(..).collect();
        }
        Vec::new()
    }
}

pub fn target_catalog() -> Vec<ControlTargetInfo> {
    let mut targets = definitions()
        .iter()
        .map(|definition| ControlTargetInfo {
            id: definition.id.clone(),
            label: definition.label.clone(),
            group: definition.group.clone(),
            kind: match definition.kind {
                ParameterKind::Bool => "bool",
                ParameterKind::Number => "number",
                ParameterKind::Select => "select",
            }
            .into(),
            default: definition.default.clone(),
            min: definition.min,
            max: definition.max,
            options: definition.options.clone(),
            mappable: definition.implemented
                && (!matches!(definition.kind, ParameterKind::Number)
                    || (definition.min.is_some() && definition.max.is_some())),
        })
        .collect::<Vec<_>>();

    targets.extend([
        ControlTargetInfo {
            id: ACTION_CLEAR_BUFFERS.into(),
            label: "CLEAR BUFFERS".into(),
            group: "Actions".into(),
            kind: "action".into(),
            default: Value::Null,
            min: None,
            max: None,
            options: Vec::new(),
            mappable: true,
        },
        ControlTargetInfo {
            id: ACTION_FLOW_PULSE.into(),
            label: "FLOW PULSE".into(),
            group: "Actions".into(),
            kind: "action".into(),
            default: Value::Null,
            min: None,
            max: None,
            options: Vec::new(),
            mappable: true,
        },
        ControlTargetInfo {
            id: ACTION_RESET_PARAMETERS.into(),
            label: "RESET PARAMETERS".into(),
            group: "Actions".into(),
            kind: "action".into(),
            default: Value::Null,
            min: None,
            max: None,
            options: Vec::new(),
            mappable: true,
        },
    ]);
    targets
}

pub fn valid_target(target: &str) -> bool {
    if matches!(
        target,
        ACTION_CLEAR_BUFFERS | ACTION_FLOW_PULSE | ACTION_RESET_PARAMETERS
    ) {
        return true;
    }
    find_definition(target)
        .map(|definition| {
            definition.implemented
                && (!matches!(definition.kind, ParameterKind::Number)
                    || (definition.min.is_some() && definition.max.is_some()))
        })
        .unwrap_or(false)
}

pub fn normalize_curve(value: f32, curve: &str) -> f32 {
    let value = value.clamp(0.0, 1.0);
    match curve {
        "square" => value * value,
        "cube" => value * value * value,
        "sqrt" => value.sqrt(),
        "smooth" => value * value * (3.0 - 2.0 * value),
        _ => value,
    }
}

pub fn apply_target(
    target: &str,
    behavior: &str,
    normalized: f32,
    previous: f32,
    output_min: f32,
    output_max: f32,
    parameters: &ParameterStore,
    automation: &AutomationHandle,
    actions: &ControlActionBus,
) -> Result<(), String> {
    let normalized = normalized.clamp(0.0, 1.0);
    let rising = previous < 0.5 && normalized >= 0.5;

    if matches!(
        target,
        ACTION_CLEAR_BUFFERS | ACTION_FLOW_PULSE | ACTION_RESET_PARAMETERS
    ) {
        if rising || (behavior == "trigger" && normalized > 0.0 && previous <= 0.0) {
            if target == ACTION_RESET_PARAMETERS {
                parameters.reset();
                automation.record_parameter_batch(
                    parameters.snapshot().values,
                    "control_reset_parameters".into(),
                );
                actions.push(ACTION_CLEAR_BUFFERS);
                automation.record_action(ACTION_CLEAR_BUFFERS);
            } else {
                actions.push(target);
                automation.record_action(target);
            }
        }
        return Ok(());
    }

    let definition = find_definition(target)
        .ok_or_else(|| format!("unknown control target: {target}"))?;
    if !definition.implemented {
        return Err(format!("control target is not implemented: {target}"));
    }

    let fraction = (output_min + (output_max - output_min) * normalized).clamp(0.0, 1.0);
    let value = match definition.kind {
        ParameterKind::Bool => {
            let current = parameters.value(target).and_then(|value| value.as_bool()).unwrap_or(false);
            let next = match behavior {
                "toggle" => {
                    if !rising {
                        return Ok(());
                    }
                    !current
                }
                "trigger" => {
                    if !rising {
                        return Ok(());
                    }
                    true
                }
                _ => fraction >= 0.5,
            };
            Value::Bool(next)
        }
        ParameterKind::Number => {
            let minimum = definition
                .min
                .ok_or_else(|| format!("{target} has no bounded minimum"))?;
            let maximum = definition
                .max
                .ok_or_else(|| format!("{target} has no bounded maximum"))?;
            serde_json::json!(minimum + (maximum - minimum) * f64::from(fraction))
        }
        ParameterKind::Select => {
            if definition.options.is_empty() {
                return Err(format!("{target} has no selectable options"));
            }
            let maximum_index = definition.options.len().saturating_sub(1);
            let index = (fraction * maximum_index as f32).round() as usize;
            Value::String(definition.options[index.min(maximum_index)].clone())
        }
    };

    parameters.set(target, value.clone())?;
    automation.record_parameter(target, value);
    Ok(())
}

pub fn default_true() -> bool {
    true
}

pub fn default_behavior() -> String {
    "absolute".into()
}

pub fn default_curve() -> String {
    "linear".into()
}

pub fn default_threshold() -> f32 {
    0.5
}
