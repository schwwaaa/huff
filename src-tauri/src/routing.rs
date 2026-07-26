use crate::parameters::ParameterSnapshot;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub const ROUTING_SCHEMA: &str = "huff-routing/v1";
pub const ENGINE_BUILD: &str = "HNW-19";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingBusDescriptor {
    pub id: String,
    pub label: String,
    pub bus_type: String,
    pub owner: String,
    pub persistent: bool,
    pub writable: bool,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingEdge {
    pub from: String,
    pub to: String,
    pub role: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingRecipeSummary {
    pub id: String,
    pub label: String,
    pub description: String,
    pub changes: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingCatalog {
    pub schema: String,
    pub engine_build: String,
    pub topology: String,
    pub fixed_pipeline_preserved: bool,
    pub buses: Vec<RoutingBusDescriptor>,
    pub recipes: Vec<RoutingRecipeSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingPlan {
    pub schema: String,
    pub engine_build: String,
    pub topology: String,
    pub program_bus: String,
    pub monitor_bus: String,
    pub flow_target: String,
    pub layer_priority: String,
    pub global_mix_position: String,
    pub smoosh_enabled: bool,
    pub luma_key_enabled: bool,
    pub feedback_enabled: bool,
    pub buses: Vec<RoutingBusDescriptor>,
    pub edges: Vec<RoutingEdge>,
    pub legal_temporal_cycles: Vec<String>,
    pub warnings: Vec<String>,
    pub summary: String,
}

pub fn bus_catalog() -> Vec<RoutingBusDescriptor> {
    vec![
        bus(
            "clean",
            "Clean",
            "video",
            "source compositor",
            false,
            false,
            "The normalized current source before persistent effects. History capture and clean restoration read this bus.",
        ),
        bus(
            "history",
            "History",
            "temporal_video",
            "GPU history ring",
            true,
            true,
            "A bounded read-only-at-render-time array of previously captured Clean frames used by glitch tiles and temporal sampling.",
        ),
        bus(
            "process",
            "Process",
            "video",
            "fixed HUFF recipe",
            false,
            true,
            "The constrained glitch, scanline, Smoosh, luma, Global Mix, Flow, and feedback processing path.",
        ),
        bus(
            "field_store",
            "Field Store",
            "persistent_video",
            "persistent ping-pong effect store",
            true,
            true,
            "The persistent flying effect image carried from frame to frame. This is the only legal recursive image cycle in the HUFF recipe.",
        ),
        bus(
            "mask",
            "Mask",
            "mask",
            "luma key",
            false,
            false,
            "The live luminance-derived region control used to restore or reveal Clean imagery inside the processed image.",
        ),
        bus(
            "program",
            "Program",
            "video",
            "authoritative output selector",
            false,
            true,
            "The committed RGBA output consumed by Syphon, Spout, recording, still export, and deterministic export.",
        ),
        bus(
            "monitor",
            "Monitor",
            "video_monitor",
            "native output window",
            false,
            true,
            "The local native window monitor. It can inspect Program, Clean, or Field Store without changing external Program output.",
        ),
    ]
}

pub fn routing_recipes() -> Vec<RoutingRecipeSummary> {
    vec![
        recipe(
            "classic",
            "Classic HUFF",
            "Preserve the fixed parity recipe: scan-priority layering, Flow at the final stage, Global Mix after feedback, and Program monitored normally.",
            &[
                ("layers.layer_priority", json!("scan")),
                ("flow.flow_target", json!("final")),
                ("global_mix.global_mix_pos", json!("after")),
                ("smoosh.smoosh_on", json!(false)),
                ("routing.program_bus", json!("program")),
                ("routing.monitor_bus", json!("program")),
            ],
        ),
        recipe(
            "glitch_flow_scan",
            "Glitch → Flow → Scan",
            "Route Flow immediately after glitch, then continue through luma and scanline stages before feedback and Program.",
            &[
                ("flow.flow_target", json!("glitch")),
                ("layers.layer_priority", json!("scan")),
                ("smoosh.smoosh_on", json!(false)),
                ("routing.program_bus", json!("program")),
                ("routing.monitor_bus", json!("program")),
            ],
        ),
        recipe(
            "scan_flow_glitch",
            "Scan → Flow → Glitch",
            "Route Flow immediately after scanlines, then place glitch and luma before feedback and Program.",
            &[
                ("flow.flow_target", json!("scan")),
                ("layers.layer_priority", json!("glitch")),
                ("smoosh.smoosh_on", json!(false)),
                ("routing.program_bus", json!("program")),
                ("routing.monitor_bus", json!("program")),
            ],
        ),
        recipe(
            "smoosh_layers",
            "Isolated Smoosh Layers",
            "Isolate glitch and scanline layers, combine them through Smoosh, and keep Flow at the final constrained stage.",
            &[
                ("smoosh.smoosh_on", json!(true)),
                ("flow.flow_target", json!("final")),
                ("routing.program_bus", json!("program")),
                ("routing.monitor_bus", json!("program")),
            ],
        ),
        recipe(
            "clean_bypass",
            "Clean Program Bypass",
            "Commit the Clean bus directly to Program and monitor it. The effect graph continues running so returning to Program preserves temporal continuity.",
            &[
                ("routing.program_bus", json!("clean")),
                ("routing.monitor_bus", json!("clean")),
            ],
        ),
        recipe(
            "field_store_monitor",
            "Program + Field Store Monitor",
            "Keep the normal composed Program output while the native window inspects the raw persistent Field Store.",
            &[
                ("routing.program_bus", json!("program")),
                ("routing.monitor_bus", json!("field_store")),
            ],
        ),
    ]
}

pub fn routing_catalog() -> RoutingCatalog {
    RoutingCatalog {
        schema: ROUTING_SCHEMA.into(),
        engine_build: ENGINE_BUILD.into(),
        topology: "constrained_named_bus_fixed_recipe".into(),
        fixed_pipeline_preserved: true,
        buses: bus_catalog(),
        recipes: routing_recipes(),
    }
}

pub fn recipe_values(id: &str) -> Result<BTreeMap<String, Value>, String> {
    routing_recipes()
        .into_iter()
        .find(|recipe| recipe.id == id)
        .map(|recipe| recipe.changes)
        .ok_or_else(|| format!("unknown routing recipe: {id}"))
}

pub fn build_plan(snapshot: &ParameterSnapshot) -> RoutingPlan {
    let program_bus = normalized_bus(snapshot.text("routing.program_bus", "program"));
    let monitor_bus = normalized_bus(snapshot.text("routing.monitor_bus", "program"));
    let flow_target = match snapshot.text("flow.flow_target", "final") {
        "glitch" => "glitch",
        "scan" => "scan",
        _ => "final",
    }
    .to_string();
    let layer_priority = snapshot
        .text("layers.layer_priority", "scan")
        .to_string();
    let global_mix_position = snapshot
        .text("global_mix.global_mix_pos", "after")
        .to_string();
    let smoosh_enabled = snapshot.bool_value("smoosh.smoosh_on", false);
    let luma_key_enabled = snapshot.bool_value("luma.luma_key_on", false)
        && snapshot.number("luma.luma_key_mix", 0.0) > 0.0;
    let feedback_enabled = snapshot.number("feedback.amount", 0.0) > 0.0;
    let flow_enabled = snapshot.bool_value("flow.flow_on", false)
        && snapshot.number("flow.flow_strength", 0.0) > 0.0;
    let glitch_enabled = snapshot.bool_value("glitch.corrupt_on", false);
    let scan_enabled = snapshot.bool_value("scanlines.clusters", false);

    let mut edges = vec![
        edge("clean", "history", "capture", true),
        edge("clean", "process", "current source", true),
        edge("history", "process", "historical samples", glitch_enabled),
        edge("process", "field_store", "write/update", true),
        edge("field_store", "process", "one-frame temporal return", true),
        edge("mask", "process", "clean restore / luma region", luma_key_enabled),
        edge(
            match program_bus.as_str() {
                "clean" => "clean",
                "field_store" => "field_store",
                _ => "process",
            },
            "program",
            "authoritative selection",
            true,
        ),
        edge(
            match monitor_bus.as_str() {
                "clean" => "clean",
                "field_store" => "field_store",
                _ => "program",
            },
            "monitor",
            "local monitor selection",
            true,
        ),
    ];
    if flow_enabled {
        edges.push(edge(
            match flow_target.as_str() {
                "glitch" => "process:glitch",
                "scan" => "process:scan",
                _ => "process:final",
            },
            "process:flow",
            "Flow insertion",
            true,
        ));
    }
    if scan_enabled {
        edges.push(edge("clean", "process:scan", "clean scan source", true));
    }

    let mut warnings = Vec::new();
    if smoosh_enabled && flow_target != "final" {
        warnings.push(
            "Smoosh owns isolated glitch/scan compositing, so Flow target is resolved to the final stage at render time.".into(),
        );
    }
    if program_bus == "field_store" {
        warnings.push(
            "Program is exposing the raw Field Store on black rather than the clean/effect composite.".into(),
        );
    }
    if monitor_bus != "program" {
        warnings.push(
            "The native window is monitoring a diagnostic bus; Syphon, Spout, recording, and export still follow Program.".into(),
        );
    }

    let summary = format!(
        "Program ← {} · Monitor ← {} · Flow → {} · Layer {} · Global Mix {}",
        bus_label(&program_bus),
        bus_label(&monitor_bus),
        flow_target.to_uppercase(),
        layer_priority.to_uppercase(),
        global_mix_position.to_uppercase(),
    );

    RoutingPlan {
        schema: ROUTING_SCHEMA.into(),
        engine_build: ENGINE_BUILD.into(),
        topology: "constrained_named_bus_fixed_recipe".into(),
        program_bus,
        monitor_bus,
        flow_target,
        layer_priority,
        global_mix_position,
        smoosh_enabled,
        luma_key_enabled,
        feedback_enabled,
        buses: bus_catalog(),
        edges,
        legal_temporal_cycles: vec![
            "field_store -> process -> field_store (one frame minimum delay)".into(),
            "history capture -> history read (older captured frame only)".into(),
        ],
        warnings,
        summary,
    }
}

fn bus(
    id: &str,
    label: &str,
    bus_type: &str,
    owner: &str,
    persistent: bool,
    writable: bool,
    description: &str,
) -> RoutingBusDescriptor {
    RoutingBusDescriptor {
        id: id.into(),
        label: label.into(),
        bus_type: bus_type.into(),
        owner: owner.into(),
        persistent,
        writable,
        description: description.into(),
    }
}

fn edge(from: &str, to: &str, role: &str, active: bool) -> RoutingEdge {
    RoutingEdge {
        from: from.into(),
        to: to.into(),
        role: role.into(),
        active,
    }
}

fn recipe(
    id: &str,
    label: &str,
    description: &str,
    changes: &[(&str, Value)],
) -> RoutingRecipeSummary {
    RoutingRecipeSummary {
        id: id.into(),
        label: label.into(),
        description: description.into(),
        changes: changes
            .iter()
            .map(|(id, value)| ((*id).to_string(), value.clone()))
            .collect(),
    }
}

fn normalized_bus(value: &str) -> String {
    match value {
        "clean" => "clean",
        "field_store" => "field_store",
        _ => "program",
    }
    .into()
}

fn bus_label(value: &str) -> &'static str {
    match value {
        "clean" => "CLEAN",
        "field_store" => "FIELD STORE",
        _ => "PROGRAM",
    }
}
