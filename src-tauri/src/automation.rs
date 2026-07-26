use crate::parameters::{
    canonicalize_parameter_value, find_definition, ParameterKind, ParameterSnapshot,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    sync::{Arc, RwLock},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

const AUTOMATION_SCHEMA_VERSION: u32 = 1;
const MAX_AUTOMATION_EVENTS: usize = 100_000;
const MAX_AUTOMATION_SECONDS: f64 = 86_400.0;
const EVENT_EPSILON: f64 = 1.0e-9;

pub const ACTION_CLEAR_BUFFERS: &str = "clear_buffers";
pub const ACTION_FLOW_PULSE: &str = "flow_pulse";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AutomationInterpolation {
    Step,
    Linear,
    Smooth,
    EaseIn,
    EaseOut,
}

impl Default for AutomationInterpolation {
    fn default() -> Self {
        Self::Linear
    }
}

impl AutomationInterpolation {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "step" => Ok(Self::Step),
            "linear" => Ok(Self::Linear),
            "smooth" => Ok(Self::Smooth),
            "ease_in" => Ok(Self::EaseIn),
            "ease_out" => Ok(Self::EaseOut),
            _ => Err("automation interpolation must be step, linear, smooth, ease_in, or ease_out".into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationEvent {
    pub time_seconds: f64,
    #[serde(default)]
    pub sequence: u64,
    #[serde(flatten)]
    pub kind: AutomationEventKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AutomationEventKind {
    Parameter {
        id: String,
        value: Value,
        #[serde(default)]
        interpolation: AutomationInterpolation,
    },
    ParameterBatch {
        values: BTreeMap<String, Value>,
        #[serde(default)]
        interpolation: AutomationInterpolation,
        #[serde(default)]
        label: String,
    },
    Action {
        action: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationClip {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub created_unix_ms: u64,
    pub duration_seconds: f64,
    pub events: Vec<AutomationEvent>,
}

impl AutomationClip {
    pub fn summary(&self) -> AutomationClipSummary {
        let mut parameter_events = 0usize;
        let mut action_events = 0usize;
        for event in &self.events {
            match &event.kind {
                AutomationEventKind::Parameter { .. }
                | AutomationEventKind::ParameterBatch { .. } => parameter_events += 1,
                AutomationEventKind::Action { .. } => action_events += 1,
            }
        }
        AutomationClipSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            created_unix_ms: self.created_unix_ms,
            duration_seconds: self.duration_seconds,
            event_count: self.events.len(),
            parameter_events,
            action_events,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationClipSummary {
    pub id: String,
    pub name: String,
    pub created_unix_ms: u64,
    pub duration_seconds: f64,
    pub event_count: usize,
    pub parameter_events: usize,
    pub action_events: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationInfo {
    pub recording: bool,
    pub elapsed_seconds: f64,
    pub active_clip: Option<AutomationClipSummary>,
    pub revision: u64,
    pub last_error: String,
}

#[derive(Debug)]
struct AutomationDraft {
    id: String,
    name: String,
    created_unix_ms: u64,
    started: Instant,
    interpolation: AutomationInterpolation,
    next_sequence: u64,
    events: Vec<AutomationEvent>,
}

#[derive(Debug, Default)]
struct AutomationState {
    draft: Option<AutomationDraft>,
    active_clip: Option<AutomationClip>,
    revision: u64,
    last_error: String,
}

#[derive(Clone, Default)]
pub struct AutomationHandle {
    state: Arc<RwLock<AutomationState>>,
}

impl AutomationHandle {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn info(&self) -> AutomationInfo {
        let state = self.state.read().expect("automation state poisoned");
        AutomationInfo {
            recording: state.draft.is_some(),
            elapsed_seconds: state
                .draft
                .as_ref()
                .map(|draft| draft.started.elapsed().as_secs_f64())
                .unwrap_or(0.0),
            active_clip: state.active_clip.as_ref().map(AutomationClip::summary),
            revision: state.revision,
            last_error: state.last_error.clone(),
        }
    }

    pub fn active_clip(&self) -> Option<AutomationClip> {
        self.state
            .read()
            .expect("automation state poisoned")
            .active_clip
            .clone()
    }

    pub fn is_recording(&self) -> bool {
        self.state
            .read()
            .map(|state| state.draft.is_some())
            .unwrap_or(false)
    }

    pub fn begin(
        &self,
        name: String,
        interpolation: AutomationInterpolation,
        snapshot: ParameterSnapshot,
    ) -> Result<(), String> {
        let name = clean_name(&name);
        let mut state = self
            .state
            .write()
            .map_err(|_| "automation state poisoned".to_string())?;
        if state.draft.is_some() {
            return Err("automation recording is already active".into());
        }
        let created = unix_ms();
        let mut draft = AutomationDraft {
            id: format!("hnw16-auto-{created}-{}", std::process::id()),
            name,
            created_unix_ms: created,
            started: Instant::now(),
            interpolation,
            next_sequence: 1,
            events: Vec::new(),
        };
        let initial_values = snapshot
            .values
            .into_iter()
            .filter(|(id, _)| is_automation_parameter(id))
            .collect();
        draft.events.push(AutomationEvent {
            time_seconds: 0.0,
            sequence: draft.next_sequence,
            kind: AutomationEventKind::ParameterBatch {
                values: initial_values,
                interpolation: AutomationInterpolation::Step,
                label: "initial_state".into(),
            },
        });
        draft.next_sequence += 1;
        state.draft = Some(draft);
        state.revision = state.revision.wrapping_add(1);
        state.last_error.clear();
        Ok(())
    }

    pub fn stop(&self) -> Result<AutomationClip, String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "automation state poisoned".to_string())?;
        let draft = state
            .draft
            .take()
            .ok_or_else(|| "automation recording is not active".to_string())?;
        let duration = draft
            .started
            .elapsed()
            .as_secs_f64()
            .max(last_event_time(&draft.events))
            .max(0.001);
        let clip = normalize_clip(AutomationClip {
            schema_version: AUTOMATION_SCHEMA_VERSION,
            id: draft.id,
            name: draft.name,
            created_unix_ms: draft.created_unix_ms,
            duration_seconds: duration,
            events: draft.events,
        })?;
        state.active_clip = Some(clip.clone());
        state.revision = state.revision.wrapping_add(1);
        state.last_error.clear();
        Ok(clip)
    }

    pub fn clear(&self) {
        if let Ok(mut state) = self.state.write() {
            state.draft = None;
            state.active_clip = None;
            state.revision = state.revision.wrapping_add(1);
            state.last_error.clear();
        }
    }

    pub fn set_active_clip(&self, clip: AutomationClip) -> Result<AutomationClipSummary, String> {
        let clip = normalize_clip(clip)?;
        let summary = clip.summary();
        let mut state = self
            .state
            .write()
            .map_err(|_| "automation state poisoned".to_string())?;
        if state.draft.is_some() {
            return Err("stop automation recording before replacing the active clip".into());
        }
        state.active_clip = Some(clip);
        state.revision = state.revision.wrapping_add(1);
        state.last_error.clear();
        Ok(summary)
    }

    pub fn record_parameter(&self, id: &str, value: Value) {
        let Ok((id, value)) = canonicalize_parameter_value(id, value) else {
            return;
        };
        if !is_automation_parameter(&id) {
            return;
        }
        let Ok(mut state) = self.state.write() else {
            return;
        };
        let mut changed = false;
        let mut reached_limit = false;
        {
            let Some(draft) = state.draft.as_mut() else {
                return;
            };
            if draft.events.len() >= MAX_AUTOMATION_EVENTS {
                reached_limit = true;
            } else {
                let interpolation = find_definition(&id)
                    .map(|definition| match definition.kind {
                        ParameterKind::Number => draft.interpolation,
                        ParameterKind::Bool | ParameterKind::Select => AutomationInterpolation::Step,
                    })
                    .unwrap_or(AutomationInterpolation::Step);
                let time_seconds = draft.started.elapsed().as_secs_f64();
                let mut replaced = false;
                if let Some(last) = draft.events.last_mut() {
                    if time_seconds - last.time_seconds <= 0.008 {
                        if let AutomationEventKind::Parameter {
                            id: last_id,
                            value: last_value,
                            interpolation: last_interpolation,
                        } = &mut last.kind
                        {
                            if last_id == &id {
                                last.time_seconds = time_seconds;
                                *last_value = value.clone();
                                *last_interpolation = interpolation;
                                replaced = true;
                            }
                        }
                    }
                }
                if !replaced {
                    draft.events.push(AutomationEvent {
                        time_seconds,
                        sequence: draft.next_sequence,
                        kind: AutomationEventKind::Parameter {
                            id,
                            value,
                            interpolation,
                        },
                    });
                    draft.next_sequence += 1;
                }
                changed = true;
            }
        }
        if reached_limit {
            state.last_error = format!(
                "automation recording reached the bounded {MAX_AUTOMATION_EVENTS} event limit"
            );
        } else if changed {
            state.revision = state.revision.wrapping_add(1);
        }
    }

    pub fn record_parameter_batch(&self, values: BTreeMap<String, Value>, label: String) {
        let mut canonical = BTreeMap::new();
        for (id, value) in values {
            if let Ok((id, value)) = canonicalize_parameter_value(&id, value) {
                if is_automation_parameter(&id) {
                    canonical.insert(id, value);
                }
            }
        }
        if canonical.is_empty() {
            return;
        }
        let Ok(mut state) = self.state.write() else {
            return;
        };
        let mut changed = false;
        let mut reached_limit = false;
        {
            let Some(draft) = state.draft.as_mut() else {
                return;
            };
            if draft.events.len() >= MAX_AUTOMATION_EVENTS {
                reached_limit = true;
            } else {
                draft.events.push(AutomationEvent {
                    time_seconds: draft.started.elapsed().as_secs_f64(),
                    sequence: draft.next_sequence,
                    kind: AutomationEventKind::ParameterBatch {
                        values: canonical,
                        interpolation: AutomationInterpolation::Step,
                        label: clean_label(&label),
                    },
                });
                draft.next_sequence += 1;
                changed = true;
            }
        }
        if reached_limit {
            state.last_error = format!(
                "automation recording reached the bounded {MAX_AUTOMATION_EVENTS} event limit"
            );
        } else if changed {
            state.revision = state.revision.wrapping_add(1);
        }
    }

    pub fn record_action(&self, action: &str) {
        if !is_supported_action(action) {
            return;
        }
        let Ok(mut state) = self.state.write() else {
            return;
        };
        let mut changed = false;
        let mut reached_limit = false;
        {
            let Some(draft) = state.draft.as_mut() else {
                return;
            };
            if draft.events.len() >= MAX_AUTOMATION_EVENTS {
                reached_limit = true;
            } else {
                draft.events.push(AutomationEvent {
                    time_seconds: draft.started.elapsed().as_secs_f64(),
                    sequence: draft.next_sequence,
                    kind: AutomationEventKind::Action {
                        action: action.into(),
                    },
                });
                draft.next_sequence += 1;
                changed = true;
            }
        }
        if reached_limit {
            state.last_error = format!(
                "automation recording reached the bounded {MAX_AUTOMATION_EVENTS} event limit"
            );
        } else if changed {
            state.revision = state.revision.wrapping_add(1);
        }
    }

}

#[derive(Debug, Clone)]
struct ParameterKeyframe {
    time_seconds: f64,
    sequence: u64,
    value: Value,
    interpolation: AutomationInterpolation,
}

#[derive(Debug, Clone)]
struct ActionKeyframe {
    time_seconds: f64,
    sequence: u64,
    action: String,
}

pub struct AutomationFrame {
    pub snapshot: ParameterSnapshot,
    pub actions: Vec<String>,
}

pub struct OfflineAutomationPlayer {
    base: ParameterSnapshot,
    clip: AutomationClip,
    tracks: BTreeMap<String, Vec<ParameterKeyframe>>,
    actions: Vec<ActionKeyframe>,
    looping: bool,
    last_absolute_seconds: Option<f64>,
    frame_revision: u64,
}

impl OfflineAutomationPlayer {
    pub fn new(
        base: ParameterSnapshot,
        clip: AutomationClip,
        looping: bool,
    ) -> Result<Self, String> {
        let clip = normalize_clip(clip)?;
        let mut tracks: BTreeMap<String, Vec<ParameterKeyframe>> = BTreeMap::new();
        let mut actions = Vec::new();
        for event in &clip.events {
            match &event.kind {
                AutomationEventKind::Parameter {
                    id,
                    value,
                    interpolation,
                } => {
                    tracks.entry(id.clone()).or_default().push(ParameterKeyframe {
                        time_seconds: event.time_seconds,
                        sequence: event.sequence,
                        value: value.clone(),
                        interpolation: *interpolation,
                    });
                }
                AutomationEventKind::ParameterBatch {
                    values,
                    interpolation,
                    ..
                } => {
                    for (id, value) in values {
                        tracks.entry(id.clone()).or_default().push(ParameterKeyframe {
                            time_seconds: event.time_seconds,
                            sequence: event.sequence,
                            value: value.clone(),
                            interpolation: *interpolation,
                        });
                    }
                }
                AutomationEventKind::Action { action } => actions.push(ActionKeyframe {
                    time_seconds: event.time_seconds,
                    sequence: event.sequence,
                    action: action.clone(),
                }),
            }
        }
        for track in tracks.values_mut() {
            track.sort_by(|left, right| {
                left.time_seconds
                    .total_cmp(&right.time_seconds)
                    .then(left.sequence.cmp(&right.sequence))
            });
        }
        actions.sort_by(|left, right| {
            left.time_seconds
                .total_cmp(&right.time_seconds)
                .then(left.sequence.cmp(&right.sequence))
        });
        Ok(Self {
            frame_revision: base.revision,
            base,
            clip,
            tracks,
            actions,
            looping,
            last_absolute_seconds: None,
        })
    }

    pub fn evaluate(&mut self, absolute_seconds: f64) -> AutomationFrame {
        let absolute_seconds = absolute_seconds.max(0.0);
        let local_seconds = self.local_time(absolute_seconds);
        let mut values = self.base.values.clone();
        for (id, track) in &self.tracks {
            let base_value = values.get(id).cloned().unwrap_or(Value::Null);
            values.insert(id.clone(), evaluate_track(track, &base_value, local_seconds));
        }
        let actions = self.actions_between(self.last_absolute_seconds, absolute_seconds);
        self.last_absolute_seconds = Some(absolute_seconds);
        self.frame_revision = self.frame_revision.wrapping_add(1).max(1);
        AutomationFrame {
            snapshot: ParameterSnapshot {
                revision: self.frame_revision,
                values,
            },
            actions,
        }
    }

    fn local_time(&self, absolute_seconds: f64) -> f64 {
        if self.looping && self.clip.duration_seconds > EVENT_EPSILON {
            absolute_seconds.rem_euclid(self.clip.duration_seconds)
        } else {
            absolute_seconds.min(self.clip.duration_seconds)
        }
    }

    fn actions_between(&self, previous: Option<f64>, current: f64) -> Vec<String> {
        let lower = previous.unwrap_or(-2.0 * EVENT_EPSILON);
        if current + EVENT_EPSILON < lower {
            return Vec::new();
        }
        let mut fired: Vec<(f64, u64, String)> = Vec::new();
        for action in &self.actions {
            if self.looping && self.clip.duration_seconds > EVENT_EPSILON {
                let duration = self.clip.duration_seconds;
                let first_loop = (((lower - action.time_seconds) / duration).floor() as i64).max(-1);
                let last_loop = (((current - action.time_seconds) / duration).floor() as i64).max(-1);
                for loop_index in first_loop..=last_loop {
                    if loop_index < 0 {
                        continue;
                    }
                    let absolute_event = action.time_seconds + loop_index as f64 * duration;
                    if absolute_event > lower + EVENT_EPSILON
                        && absolute_event <= current + EVENT_EPSILON
                    {
                        fired.push((absolute_event, action.sequence, action.action.clone()));
                    }
                }
            } else if action.time_seconds > lower + EVENT_EPSILON
                && action.time_seconds <= current + EVENT_EPSILON
            {
                fired.push((action.time_seconds, action.sequence, action.action.clone()));
            } else if previous.is_none()
                && action.time_seconds.abs() <= EVENT_EPSILON
                && current.abs() <= EVENT_EPSILON
            {
                fired.push((action.time_seconds, action.sequence, action.action.clone()));
            }
        }
        fired.sort_by(|left, right| left.0.total_cmp(&right.0).then(left.1.cmp(&right.1)));
        fired.into_iter().map(|(_, _, action)| action).collect()
    }
}

fn evaluate_track(track: &[ParameterKeyframe], base: &Value, time_seconds: f64) -> Value {
    if track.is_empty() {
        return base.clone();
    }
    let split = track.partition_point(|keyframe| keyframe.time_seconds <= time_seconds + EVENT_EPSILON);
    if split >= track.len() {
        return track.last().map(|frame| frame.value.clone()).unwrap_or_else(|| base.clone());
    }
    let next = &track[split];
    let (previous_time, previous_value) = if split == 0 {
        (0.0, base)
    } else {
        (track[split - 1].time_seconds, &track[split - 1].value)
    };
    if next.interpolation == AutomationInterpolation::Step
        || next.time_seconds <= previous_time + EVENT_EPSILON
    {
        return previous_value.clone();
    }
    let (Some(from), Some(to)) = (previous_value.as_f64(), next.value.as_f64()) else {
        return previous_value.clone();
    };
    let normalized = ((time_seconds - previous_time) / (next.time_seconds - previous_time))
        .clamp(0.0, 1.0);
    let amount = match next.interpolation {
        AutomationInterpolation::Step => 0.0,
        AutomationInterpolation::Linear => normalized,
        AutomationInterpolation::Smooth => normalized * normalized * (3.0 - 2.0 * normalized),
        AutomationInterpolation::EaseIn => normalized * normalized,
        AutomationInterpolation::EaseOut => 1.0 - (1.0 - normalized) * (1.0 - normalized),
    };
    serde_json::Number::from_f64(from + (to - from) * amount)
        .map(Value::Number)
        .unwrap_or_else(|| previous_value.clone())
}

pub fn normalize_clip(mut clip: AutomationClip) -> Result<AutomationClip, String> {
    if clip.schema_version == 0 {
        clip.schema_version = AUTOMATION_SCHEMA_VERSION;
    }
    if clip.schema_version > AUTOMATION_SCHEMA_VERSION {
        return Err(format!(
            "automation schema {} is newer than this build supports",
            clip.schema_version
        ));
    }
    clip.name = clean_name(&clip.name);
    if clip.id.trim().is_empty() {
        clip.id = format!("hnw16-auto-{}-{}", unix_ms(), std::process::id());
    }
    if clip.events.len() > MAX_AUTOMATION_EVENTS {
        return Err(format!(
            "automation clip exceeds the bounded {MAX_AUTOMATION_EVENTS} event limit"
        ));
    }
    let mut next_sequence = 1u64;
    for event in &mut clip.events {
        if !event.time_seconds.is_finite()
            || event.time_seconds < 0.0
            || event.time_seconds > MAX_AUTOMATION_SECONDS
        {
            return Err("automation event time must be finite and between 0 and 86400 seconds".into());
        }
        if event.sequence == 0 {
            event.sequence = next_sequence;
        }
        next_sequence = next_sequence.max(event.sequence.saturating_add(1));
        match &mut event.kind {
            AutomationEventKind::Parameter {
                id,
                value,
                interpolation,
            } => {
                let (canonical_id, canonical_value) =
                    canonicalize_parameter_value(id, value.clone())?;
                if !is_automation_parameter(&canonical_id) {
                    return Err(format!("parameter {canonical_id} is not safe for deterministic automation"));
                }
                *id = canonical_id;
                *value = canonical_value;
                if !matches!(find_definition(id).map(|definition| definition.kind), Some(ParameterKind::Number)) {
                    *interpolation = AutomationInterpolation::Step;
                }
            }
            AutomationEventKind::ParameterBatch {
                values,
                interpolation,
                label,
            } => {
                let mut canonical = BTreeMap::new();
                for (id, value) in std::mem::take(values) {
                    let (id, value) = canonicalize_parameter_value(&id, value)?;
                    if !is_automation_parameter(&id) {
                        return Err(format!("parameter {id} is not safe for deterministic automation"));
                    }
                    canonical.insert(id, value);
                }
                if canonical.is_empty() {
                    return Err("automation parameter batch cannot be empty".into());
                }
                *values = canonical;
                *label = clean_label(label);
                if *interpolation != AutomationInterpolation::Step
                    && values.keys().any(|id| {
                        !matches!(
                            find_definition(id).map(|definition| definition.kind),
                            Some(ParameterKind::Number)
                        )
                    })
                {
                    *interpolation = AutomationInterpolation::Step;
                }
            }
            AutomationEventKind::Action { action } => {
                if !is_supported_action(action) {
                    return Err(format!("unsupported automation action: {action}"));
                }
            }
        }
    }
    clip.events.sort_by(|left, right| {
        left.time_seconds
            .total_cmp(&right.time_seconds)
            .then(left.sequence.cmp(&right.sequence))
    });
    for (index, event) in clip.events.iter_mut().enumerate() {
        event.sequence = index as u64 + 1;
    }
    let max_time = last_event_time(&clip.events);
    if !clip.duration_seconds.is_finite() || clip.duration_seconds < 0.0 {
        return Err("automation duration must be finite and non-negative".into());
    }
    clip.duration_seconds = clip.duration_seconds.max(max_time).max(0.001);
    if clip.duration_seconds > MAX_AUTOMATION_SECONDS {
        return Err("automation duration exceeds the bounded 24 hour limit".into());
    }
    Ok(clip)
}

pub fn is_automation_parameter(id: &str) -> bool {
    !id.starts_with("render.")
        && !id.starts_with("history.")
        && id != "source.seed_on_load"
}

fn is_supported_action(action: &str) -> bool {
    matches!(action, ACTION_CLEAR_BUFFERS | ACTION_FLOW_PULSE)
}

fn clean_name(value: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        "Untitled Automation".into()
    } else {
        value.chars().take(120).collect()
    }
}

fn clean_label(value: &str) -> String {
    value.trim().chars().take(160).collect()
}

fn last_event_time(events: &[AutomationEvent]) -> f64 {
    events
        .iter()
        .map(|event| event.time_seconds)
        .fold(0.0, f64::max)
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn snapshot(values: &[(&str, Value)]) -> ParameterSnapshot {
        ParameterSnapshot {
            revision: 1,
            values: values
                .iter()
                .map(|(id, value)| ((*id).to_string(), value.clone()))
                .collect(),
        }
    }

    fn clip(events: Vec<AutomationEvent>, duration_seconds: f64) -> AutomationClip {
        AutomationClip {
            schema_version: AUTOMATION_SCHEMA_VERSION,
            id: "test-clip".into(),
            name: "Test Clip".into(),
            created_unix_ms: 1,
            duration_seconds,
            events,
        }
    }

    #[test]
    fn numeric_tracks_interpolate_at_exact_timeline_time() {
        let base = snapshot(&[("feedback.amount", json!(0.0))]);
        let clip = clip(
            vec![
                AutomationEvent {
                    time_seconds: 0.0,
                    sequence: 1,
                    kind: AutomationEventKind::Parameter {
                        id: "feedback.amount".into(),
                        value: json!(0.0),
                        interpolation: AutomationInterpolation::Step,
                    },
                },
                AutomationEvent {
                    time_seconds: 1.0,
                    sequence: 2,
                    kind: AutomationEventKind::Parameter {
                        id: "feedback.amount".into(),
                        value: json!(1.0),
                        interpolation: AutomationInterpolation::Linear,
                    },
                },
            ],
            1.0,
        );
        let mut player = OfflineAutomationPlayer::new(base, clip, false).unwrap();
        let frame = player.evaluate(0.5);
        let value = frame.snapshot.values["feedback.amount"].as_f64().unwrap();
        assert!((value - 0.5).abs() < 1.0e-9);
    }

    #[test]
    fn discrete_values_remain_step_keyframes() {
        let base = snapshot(&[("source.base_enabled", json!(false))]);
        let clip = clip(
            vec![
                AutomationEvent {
                    time_seconds: 0.0,
                    sequence: 1,
                    kind: AutomationEventKind::Parameter {
                        id: "source.base_enabled".into(),
                        value: json!(false),
                        interpolation: AutomationInterpolation::Step,
                    },
                },
                AutomationEvent {
                    time_seconds: 1.0,
                    sequence: 2,
                    kind: AutomationEventKind::Parameter {
                        id: "source.base_enabled".into(),
                        value: json!(true),
                        interpolation: AutomationInterpolation::Linear,
                    },
                },
            ],
            1.0,
        );
        let mut player = OfflineAutomationPlayer::new(base, clip, false).unwrap();
        assert_eq!(
            player.evaluate(0.5).snapshot.values["source.base_enabled"],
            json!(false)
        );
        assert_eq!(
            player.evaluate(1.0).snapshot.values["source.base_enabled"],
            json!(true)
        );
    }

    #[test]
    fn looping_actions_fire_once_per_crossed_loop() {
        let base = snapshot(&[]);
        let clip = clip(
            vec![AutomationEvent {
                time_seconds: 0.25,
                sequence: 1,
                kind: AutomationEventKind::Action {
                    action: ACTION_FLOW_PULSE.into(),
                },
            }],
            1.0,
        );
        let mut player = OfflineAutomationPlayer::new(base, clip, true).unwrap();
        assert!(player.evaluate(0.0).actions.is_empty());
        assert_eq!(player.evaluate(0.3).actions, vec![ACTION_FLOW_PULSE.to_string()]);
        assert!(player.evaluate(0.9).actions.is_empty());
        assert_eq!(player.evaluate(1.3).actions, vec![ACTION_FLOW_PULSE.to_string()]);
    }

    #[test]
    fn time_zero_actions_fire_on_the_first_frame() {
        let base = snapshot(&[]);
        let clip = clip(
            vec![AutomationEvent {
                time_seconds: 0.0,
                sequence: 1,
                kind: AutomationEventKind::Action {
                    action: ACTION_CLEAR_BUFFERS.into(),
                },
            }],
            1.0,
        );
        let mut player = OfflineAutomationPlayer::new(base, clip, false).unwrap();
        assert_eq!(player.evaluate(0.0).actions, vec![ACTION_CLEAR_BUFFERS.to_string()]);
        assert!(player.evaluate(0.0).actions.is_empty());
    }
}
