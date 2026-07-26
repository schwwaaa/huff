#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

mod automation;
mod audio;
mod audio_router;
mod camera;
mod control_mapping;
mod export;
mod export_queue;
mod gesture;
mod history;
mod interop;
mod midi;
mod offline_export;
mod osc;
mod output_frame;
mod parameters;
mod parity;
mod production;
mod recording;
mod renderer;
mod routing;
mod source;
mod spout;
mod state_documents;
mod syphon;
mod video;
mod video_audio;

use automation::{
    AutomationClip, AutomationHandle, AutomationInterpolation, ACTION_CLEAR_BUFFERS,
    ACTION_FLOW_PULSE,
};
use audio::{AudioCommand, AudioHandle};
use audio_router::{AudioRouterCommand, AudioRouterHandle};
use camera::{CameraDevice, CameraHandle};
use control_mapping::{target_catalog, ControlActionBus, ControlTargetInfo};
use export::{ExportHandle, StillExportConfig, StillExportMetadata};
use export_queue::{ExportQueueHandle, ExportQueueReceipt};
use gesture::{GestureHandle, GesturePoint};
use interop::{InteropCopyProbe, InteropReport};
use midi::{MidiCommand, MidiHandle, MidiMapping};
use offline_export::{
    profile_codec, profile_container, profile_extension, profile_label,
    profile_pixel_format, profile_requires_even_dimensions, profile_supports_alpha,
    validate_profile_support, OfflineExportConfig, OfflineExportHandle, OfflineExportMetadata,
    PROFILE_PNG_SEQUENCE,
};
use osc::{OscCommand, OscHandle, OscMapping};
use parameters::{ParameterDefinition, ParameterSnapshot, ParameterStore};
use production::{ProductionReport, RecoveryReceipt};
use recording::{RecordingAudioSource, RecordingHandle, RecordingStartConfig};
use renderer::{RenderCommand, RendererHandle};
use source::{ActiveSource, SourceSelector};
use state_documents::{
    StateDocument, StateDocumentKind, StateDocumentReceipt, StateLoadResult, StateModelCatalog,
    StateRecallScope,
};
use rosc::{encoder, OscMessage, OscPacket, OscType};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    net::UdpSocket,
    path::PathBuf,
};
use tauri::Manager;
use video::VideoHandle;
use video_audio::{VideoAudioCommand, VideoAudioHandle};


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MidiMapDocument {
    schema: String,
    name: String,
    #[serde(default)]
    notes: String,
    mappings: Vec<MidiMapping>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OscMapDocument {
    schema: String,
    name: String,
    #[serde(default)]
    notes: String,
    mappings: Vec<OscMapping>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ControlMapFileResult {
    path: String,
    name: String,
    mapping_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioSystemInfo {
    pub(crate) router: audio_router::AudioRouterInfo,
    pub(crate) microphone: audio::AudioInfo,
    pub(crate) video: video_audio::VideoAudioInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppInfo {
    pub(crate) build: String,
    pub(crate) renderer: renderer::RendererInfo,
    pub(crate) camera: camera::CameraStatus,
    pub(crate) camera_devices: Vec<CameraDevice>,
    pub(crate) video: video::VideoStatus,
    pub(crate) audio: AudioSystemInfo,
    pub(crate) midi: midi::MidiInfo,
    pub(crate) osc: osc::OscInfo,
    pub(crate) syphon: syphon::SyphonInfo,
    pub(crate) spout: spout::SpoutInfo,
    pub(crate) recording: recording::RecordingInfo,
    pub(crate) export: export::ExportInfo,
    pub(crate) offline_export: offline_export::OfflineExportInfo,
    pub(crate) export_queue: export_queue::ExportQueueInfo,
    pub(crate) gesture: gesture::GestureInfo,
    pub(crate) automation: automation::AutomationInfo,
    pub(crate) parameter_revision: u64,
    pub(crate) native_milestone: String,
    pub(crate) active_source: String,
}

fn collect_app_info(
    renderer: &RendererHandle,
    camera: &CameraHandle,
    video: &VideoHandle,
    microphone_audio: &AudioHandle,
    video_audio: &VideoAudioHandle,
    audio_router: &AudioRouterHandle,
    midi: &MidiHandle,
    osc: &OscHandle,
    gesture: &GestureHandle,
    recording: &RecordingHandle,
    export: &ExportHandle,
    offline_export: &OfflineExportHandle,
    export_queue: &ExportQueueHandle,
    automation: &AutomationHandle,
    parameters: &ParameterStore,
    source: &SourceSelector,
) -> AppInfo {
    AppInfo {
        build: "HNW-21".into(),
        renderer: renderer.info(),
        camera: camera.status(),
        camera_devices: camera.devices(),
        video: video.status(),
        audio: AudioSystemInfo {
            router: audio_router.info(),
            microphone: microphone_audio.info(),
            video: video_audio.info(),
        },
        midi: midi.info(),
        osc: osc.info(),
        syphon: syphon::info(),
        spout: spout::info(),
        recording: recording.info(),
        export: export.info(),
        offline_export: offline_export.info(),
        export_queue: export_queue.info(),
        gesture: gesture.info(),
        automation: automation.info(),
        parameter_revision: parameters.revision(),
        native_milestone: "HNW-21".into(),
        active_source: source.get().label().into(),
    }
}

#[tauri::command]
fn get_app_info(
    renderer: tauri::State<'_, RendererHandle>,
    camera: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    microphone_audio: tauri::State<'_, AudioHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    audio_router: tauri::State<'_, AudioRouterHandle>,
    midi: tauri::State<'_, MidiHandle>,
    osc: tauri::State<'_, OscHandle>,
    gesture: tauri::State<'_, GestureHandle>,
    recording: tauri::State<'_, RecordingHandle>,
    export: tauri::State<'_, ExportHandle>,
    offline_export: tauri::State<'_, OfflineExportHandle>,
    export_queue: tauri::State<'_, ExportQueueHandle>,
    automation: tauri::State<'_, AutomationHandle>,
    parameters: tauri::State<'_, ParameterStore>,
    source: tauri::State<'_, SourceSelector>,
) -> AppInfo {
    collect_app_info(
        renderer.inner(),
        camera.inner(),
        video.inner(),
        microphone_audio.inner(),
        video_audio.inner(),
        audio_router.inner(),
        midi.inner(),
        osc.inner(),
        gesture.inner(),
        recording.inner(),
        export.inner(),
        offline_export.inner(),
        export_queue.inner(),
        automation.inner(),
        parameters.inner(),
        source.inner(),
    )
}


#[tauri::command]
fn run_interop_analysis(
    renderer: tauri::State<'_, RendererHandle>,
    camera: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    microphone_audio: tauri::State<'_, AudioHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    audio_router: tauri::State<'_, AudioRouterHandle>,
    midi: tauri::State<'_, MidiHandle>,
    osc: tauri::State<'_, OscHandle>,
    gesture: tauri::State<'_, GestureHandle>,
    recording: tauri::State<'_, RecordingHandle>,
    export: tauri::State<'_, ExportHandle>,
    offline_export: tauri::State<'_, OfflineExportHandle>,
    export_queue: tauri::State<'_, ExportQueueHandle>,
    automation: tauri::State<'_, AutomationHandle>,
    parameters: tauri::State<'_, ParameterStore>,
    source: tauri::State<'_, SourceSelector>,
) -> InteropReport {
    let info = collect_app_info(
        renderer.inner(),
        camera.inner(),
        video.inner(),
        microphone_audio.inner(),
        video_audio.inner(),
        audio_router.inner(),
        midi.inner(),
        osc.inner(),
        gesture.inner(),
        recording.inner(),
        export.inner(),
        offline_export.inner(),
        export_queue.inner(),
        automation.inner(),
        parameters.inner(),
        source.inner(),
    );
    interop::build_report(&info)
}

#[tauri::command]
fn run_interop_copy_probe(
    renderer: tauri::State<'_, RendererHandle>,
) -> InteropCopyProbe {
    let info = renderer.info();
    interop::run_copy_probe(info.width, info.height)
}

#[tauri::command]
fn export_interop_report(
    renderer: tauri::State<'_, RendererHandle>,
    camera: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    microphone_audio: tauri::State<'_, AudioHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    audio_router: tauri::State<'_, AudioRouterHandle>,
    midi: tauri::State<'_, MidiHandle>,
    osc: tauri::State<'_, OscHandle>,
    gesture: tauri::State<'_, GestureHandle>,
    recording: tauri::State<'_, RecordingHandle>,
    export: tauri::State<'_, ExportHandle>,
    offline_export: tauri::State<'_, OfflineExportHandle>,
    export_queue: tauri::State<'_, ExportQueueHandle>,
    automation: tauri::State<'_, AutomationHandle>,
    parameters: tauri::State<'_, ParameterStore>,
    source: tauri::State<'_, SourceSelector>,
) -> Result<Option<String>, String> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("Export HUFF interoperability report")
        .add_filter("HUFF interoperability report", &["json"])
        .set_file_name("huff-interop-report.json")
        .save_file()
    else {
        return Ok(None);
    };
    let info = collect_app_info(
        renderer.inner(), camera.inner(), video.inner(), microphone_audio.inner(),
        video_audio.inner(), audio_router.inner(), midi.inner(), osc.inner(), gesture.inner(),
        recording.inner(), export.inner(), offline_export.inner(), export_queue.inner(),
        automation.inner(), parameters.inner(), source.inner(),
    );
    let report = interop::build_report(&info);
    let bytes = serde_json::to_vec_pretty(&report)
        .map_err(|error| format!("could not serialize interoperability report: {error}"))?;
    std::fs::write(&path, bytes)
        .map_err(|error| format!("could not write {}: {error}", path.display()))?;
    let text_path = path.with_extension("txt");
    std::fs::write(&text_path, interop::human_report(&report))
        .map_err(|error| format!("could not write {}: {error}", text_path.display()))?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
fn run_production_check(
    renderer: tauri::State<'_, RendererHandle>,
    camera: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    microphone_audio: tauri::State<'_, AudioHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    audio_router: tauri::State<'_, AudioRouterHandle>,
    midi: tauri::State<'_, MidiHandle>,
    osc: tauri::State<'_, OscHandle>,
    gesture: tauri::State<'_, GestureHandle>,
    recording: tauri::State<'_, RecordingHandle>,
    export: tauri::State<'_, ExportHandle>,
    offline_export: tauri::State<'_, OfflineExportHandle>,
    export_queue: tauri::State<'_, ExportQueueHandle>,
    automation: tauri::State<'_, AutomationHandle>,
    parameters: tauri::State<'_, ParameterStore>,
    source: tauri::State<'_, SourceSelector>,
) -> ProductionReport {
    let info = collect_app_info(
        renderer.inner(),
        camera.inner(),
        video.inner(),
        microphone_audio.inner(),
        video_audio.inner(),
        audio_router.inner(),
        midi.inner(),
        osc.inner(),
        gesture.inner(),
        recording.inner(),
        export.inner(),
        offline_export.inner(),
        export_queue.inner(),
        automation.inner(),
        parameters.inner(),
        source.inner(),
    );
    production::build_report(&info)
}

#[tauri::command]
fn recover_live_runtime(
    renderer: tauri::State<'_, RendererHandle>,
    camera: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    microphone_audio: tauri::State<'_, AudioHandle>,
    recording: tauri::State<'_, RecordingHandle>,
    offline_export: tauri::State<'_, OfflineExportHandle>,
    source: tauri::State<'_, SourceSelector>,
    scope: String,
) -> Result<RecoveryReceipt, String> {
    if !matches!(scope.as_str(), "surface" | "source" | "outputs" | "all") {
        return Err("recovery scope must be surface, source, outputs, or all".into());
    }

    let mut actions = Vec::new();
    let mut warnings = Vec::new();
    let recover_surface = matches!(scope.as_str(), "surface" | "all");
    let recover_source = matches!(scope.as_str(), "source" | "all");
    let recover_outputs = matches!(scope.as_str(), "outputs" | "all");

    if recover_surface {
        renderer.send(RenderCommand::RecoverSurface);
        actions.push("Requested native wgpu surface recovery".into());
    }

    if recover_source {
        if recording.info().active
            || recording.info().finalizing
            || offline_export.info().active
        {
            return Err("source recovery is disabled while recording or deterministic export owns the pipeline".into());
        }
        camera.refresh();
        microphone_audio.send(AudioCommand::RefreshDevices);
        actions.push("Refreshed camera and microphone device lists".into());

        let selected_source = match source.get() {
            ActiveSource::Automatic if camera.status().streaming => ActiveSource::Camera,
            ActiveSource::Automatic if video.status().loaded => ActiveSource::Video,
            selected => selected,
        };
        match selected_source {
            ActiveSource::Video => {
                let status = video.status();
                if status.loaded {
                    video_audio.send(VideoAudioCommand::Seek {
                        seconds: status.position_seconds,
                        playing: status.playing,
                    });
                    video.seek(status.position_seconds);
                    actions.push(format!(
                        "Restarted video and source-audio decoders at {:.3} seconds",
                        status.position_seconds
                    ));
                } else {
                    warnings.push("Video is selected but no file is loaded".into());
                }
            }
            ActiveSource::Camera => {
                let status = camera.status();
                if status.streaming {
                    if let Some(slot) = status.selected_slot {
                        camera.stop_camera();
                        std::thread::sleep(std::time::Duration::from_millis(120));
                        camera.start_camera(slot, status.profile.clone());
                        actions.push(format!("Restarted camera {}", status.selected_name));
                    } else {
                        warnings.push("Camera is streaming without a selected device slot".into());
                    }
                } else {
                    warnings.push("Camera source is selected but capture is not active".into());
                }
            }
            ActiveSource::Automatic | ActiveSource::None => {
                warnings.push("No active media source to recover".into())
            }
        }
    }

    if recover_outputs {
        let mut output_restarted = false;
        let syphon_info = syphon::info();
        if syphon_info.active {
            renderer.stop_syphon();
            std::thread::sleep(std::time::Duration::from_millis(120));
            renderer.start_syphon(syphon_info.fps)?;
            actions.push(format!("Restarted Syphon at {} fps", syphon_info.fps));
            output_restarted = true;
        } else if syphon_info.available {
            warnings.push("Syphon is available but was not active".into());
        }

        let spout_info = spout::info();
        if spout_info.active {
            renderer.stop_spout();
            std::thread::sleep(std::time::Duration::from_millis(120));
            renderer.start_spout(spout_info.fps, spout_info.adapter_index)?;
            actions.push(format!(
                "Restarted Spout at {} fps on adapter {}",
                spout_info.fps, spout_info.adapter_index
            ));
            output_restarted = true;
        } else if spout_info.available {
            warnings.push("Spout is available but was not active".into());
        }

        if !output_restarted {
            warnings.push("No active platform output bridge required recovery".into());
        }
    }

    Ok(RecoveryReceipt {
        scope,
        actions,
        warnings,
    })
}

#[tauri::command]
fn export_diagnostics_bundle(
    renderer: tauri::State<'_, RendererHandle>,
    camera: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    microphone_audio: tauri::State<'_, AudioHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    audio_router: tauri::State<'_, AudioRouterHandle>,
    midi: tauri::State<'_, MidiHandle>,
    osc: tauri::State<'_, OscHandle>,
    gesture: tauri::State<'_, GestureHandle>,
    recording: tauri::State<'_, RecordingHandle>,
    export: tauri::State<'_, ExportHandle>,
    offline_export: tauri::State<'_, OfflineExportHandle>,
    export_queue: tauri::State<'_, ExportQueueHandle>,
    automation: tauri::State<'_, AutomationHandle>,
    parameters: tauri::State<'_, ParameterStore>,
    source: tauri::State<'_, SourceSelector>,
) -> Result<Option<String>, String> {
    let Some(parent) = rfd::FileDialog::new()
        .set_title("Choose a folder for the HUFF diagnostics bundle")
        .pick_folder()
    else {
        return Ok(None);
    };

    let info = collect_app_info(
        renderer.inner(),
        camera.inner(),
        video.inner(),
        microphone_audio.inner(),
        video_audio.inner(),
        audio_router.inner(),
        midi.inner(),
        osc.inner(),
        gesture.inner(),
        recording.inner(),
        export.inner(),
        offline_export.inner(),
        export_queue.inner(),
        automation.inner(),
        parameters.inner(),
        source.inner(),
    );
    let report = production::build_report(&info);
    let directory = parent.join(format!(
        "huff-diagnostics-HNW-21-{}",
        production::now_unix_ms()
    ));
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("could not create {}: {error}", directory.display()))?;

    fn write_json<T: Serialize>(directory: &std::path::Path, name: &str, value: &T) -> Result<(), String> {
        let path = directory.join(name);
        let bytes = serde_json::to_vec_pretty(value)
            .map_err(|error| format!("could not serialize {name}: {error}"))?;
        std::fs::write(&path, bytes)
            .map_err(|error| format!("could not write {}: {error}", path.display()))
    }

    write_json(&directory, "production-report.json", &report)?;
    let interop_report = interop::build_report(&info);
    write_json(&directory, "interop-report.json", &interop_report)?;
    write_json(&directory, "app-info.json", &info)?;
    write_json(&directory, "parameter-state.json", &parameters.snapshot())?;
    write_json(
        &directory,
        "routing-plan.json",
        &routing::build_plan(&parameters.snapshot()),
    )?;
    write_json(
        &directory,
        "state-model.json",
        &state_documents::model_catalog(),
    )?;
    std::fs::write(
        directory.join("production-report.txt"),
        production::human_report(&report),
    )
    .map_err(|error| format!("could not write production-report.txt: {error}"))?;
    std::fs::write(
        directory.join("interop-report.txt"),
        interop::human_report(&interop_report),
    )
    .map_err(|error| format!("could not write interop-report.txt: {error}"))?;
    std::fs::write(
        directory.join("README.txt"),
        "HUFF Native HNW-21 diagnostics bundle\n\nThis folder contains runtime status, production checks, lower-copy interoperability analysis, canonical parameter state, routing state, and the state-model catalog. Source file paths and device names may be present. Review the files before sharing them publicly. GPU pixel buffers and media files are not included.\n",
    )
    .map_err(|error| format!("could not write diagnostics README: {error}"))?;

    Ok(Some(directory.display().to_string()))
}


#[tauri::command]
fn get_parameter_registry() -> Vec<ParameterDefinition> {
    parameters::definitions().to_vec()
}

#[tauri::command]
fn get_control_target_catalog() -> Vec<ControlTargetInfo> {
    target_catalog()
}

#[tauri::command]
fn get_parameter_state(state: tauri::State<'_, ParameterStore>) -> ParameterSnapshot {
    state.snapshot()
}

#[tauri::command]
fn get_routing_catalog() -> routing::RoutingCatalog {
    routing::routing_catalog()
}

#[tauri::command]
fn get_routing_plan(state: tauri::State<'_, ParameterStore>) -> routing::RoutingPlan {
    routing::build_plan(&state.snapshot())
}

#[tauri::command]
fn apply_routing_recipe(
    state: tauri::State<'_, ParameterStore>,
    automation: tauri::State<'_, AutomationHandle>,
    recipe_id: String,
) -> Result<ParameterSnapshot, String> {
    let values = routing::recipe_values(&recipe_id)?;
    state.set_many(values.clone())?;
    automation.record_parameter_batch(values, format!("routing_recipe:{recipe_id}"));
    Ok(state.snapshot())
}

#[tauri::command]
fn export_routing_plan(
    state: tauri::State<'_, ParameterStore>,
) -> Result<Option<String>, String> {
    let Some(mut path) = rfd::FileDialog::new()
        .add_filter("HUFF routing plan", &["json"])
        .set_file_name("huff-routing-plan.json")
        .save_file()
    else {
        return Ok(None);
    };
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("json"))
        .unwrap_or(false)
    {
        path.set_extension("json");
    }
    let plan = routing::build_plan(&state.snapshot());
    let payload = serde_json::to_vec_pretty(&plan)
        .map_err(|error| format!("could not serialize routing plan: {error}"))?;
    std::fs::write(&path, payload)
        .map_err(|error| format!("could not write routing plan {}: {error}", path.display()))?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
fn get_calibration_profiles() -> Vec<parity::CalibrationProfileSummary> {
    parity::calibration_profiles()
}

#[tauri::command]
fn get_parity_report(state: tauri::State<'_, ParameterStore>) -> parity::ParityReport {
    parity::build_report(state.inner())
}

#[tauri::command]
fn apply_calibration_profile(
    state: tauri::State<'_, ParameterStore>,
    renderer: tauri::State<'_, RendererHandle>,
    automation: tauri::State<'_, AutomationHandle>,
    profile_id: String,
) -> Result<ParameterSnapshot, String> {
    let values = parity::calibration_profile_values(&profile_id)?;
    state.set_many(values.clone())?;
    renderer.send(RenderCommand::ClearFeedback);
    automation.record_parameter_batch(values, format!("calibration_profile:{profile_id}"));
    automation.record_action(ACTION_CLEAR_BUFFERS);
    Ok(state.snapshot())
}

#[tauri::command]
fn export_parity_report(
    state: tauri::State<'_, ParameterStore>,
) -> Result<Option<String>, String> {
    let Some(mut path) = rfd::FileDialog::new()
        .add_filter("HUFF parity report", &["json"])
        .set_file_name("huff-parity-report.json")
        .save_file()
    else {
        return Ok(None);
    };
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("json"))
        .unwrap_or(false)
    {
        path.set_extension("json");
    }
    let report = parity::build_report(state.inner());
    let payload = serde_json::to_vec_pretty(&report)
        .map_err(|error| format!("could not serialize parity report: {error}"))?;
    std::fs::write(&path, payload)
        .map_err(|error| format!("could not write parity report {}: {error}", path.display()))?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
fn set_parameter(
    state: tauri::State<'_, ParameterStore>,
    automation: tauri::State<'_, AutomationHandle>,
    id: String,
    value: serde_json::Value,
) -> Result<u64, String> {
    let revision = state.set(&id, value)?;
    if let Some(value) = state.value(&id) {
        automation.record_parameter(&id, value);
    }
    Ok(revision)
}

#[tauri::command]
fn set_parameter_batch(
    state: tauri::State<'_, ParameterStore>,
    automation: tauri::State<'_, AutomationHandle>,
    values: BTreeMap<String, serde_json::Value>,
    automation_label: Option<String>,
) -> Result<u64, String> {
    let ids: Vec<String> = values.keys().cloned().collect();
    let revision = state.set_many(values)?;
    let canonical = ids
        .into_iter()
        .filter_map(|id| state.value(&id).map(|value| (id, value)))
        .collect();
    automation.record_parameter_batch(
        canonical,
        automation_label.unwrap_or_else(|| "parameter_batch".into()),
    );
    Ok(revision)
}

#[tauri::command]
fn reset_parameters(
    state: tauri::State<'_, ParameterStore>,
    renderer: tauri::State<'_, RendererHandle>,
    automation: tauri::State<'_, AutomationHandle>,
) -> u64 {
    renderer.send(RenderCommand::ClearFeedback);
    let revision = state.reset();
    automation.record_parameter_batch(state.snapshot().values, "reset_parameters".into());
    automation.record_action(ACTION_CLEAR_BUFFERS);
    revision
}

#[tauri::command]
fn clear_native_buffers(
    renderer: tauri::State<'_, RendererHandle>,
    automation: tauri::State<'_, AutomationHandle>,
) {
    renderer.send(RenderCommand::ClearFeedback);
    automation.record_action(ACTION_CLEAR_BUFFERS);
}

#[tauri::command]
fn fire_flow_pulse(
    renderer: tauri::State<'_, RendererHandle>,
    automation: tauri::State<'_, AutomationHandle>,
) {
    renderer.send(RenderCommand::FireFlowPulse);
    automation.record_action(ACTION_FLOW_PULSE);
}

#[tauri::command]
fn start_automation_recording(
    automation: tauri::State<'_, AutomationHandle>,
    parameters: tauri::State<'_, ParameterStore>,
    name: String,
    interpolation: String,
) -> Result<(), String> {
    automation.begin(
        name,
        AutomationInterpolation::parse(&interpolation)?,
        parameters.snapshot(),
    )
}

#[tauri::command]
fn stop_automation_recording(
    automation: tauri::State<'_, AutomationHandle>,
) -> Result<AutomationClip, String> {
    automation.stop()
}

#[tauri::command]
fn get_active_automation_clip(
    automation: tauri::State<'_, AutomationHandle>,
) -> Option<AutomationClip> {
    automation.active_clip()
}

#[tauri::command]
fn set_active_automation_clip(
    automation: tauri::State<'_, AutomationHandle>,
    clip: AutomationClip,
) -> Result<automation::AutomationClipSummary, String> {
    automation.set_active_clip(clip)
}

#[tauri::command]
fn clear_active_automation_clip(automation: tauri::State<'_, AutomationHandle>) {
    automation.clear();
}

#[tauri::command]
fn get_state_model_catalog() -> StateModelCatalog {
    state_documents::model_catalog()
}

#[tauri::command]
fn export_state_model_catalog() -> Result<Option<String>, String> {
    let Some(mut path) = rfd::FileDialog::new()
        .add_filter("HUFF state model", &["json"])
        .set_file_name("huff-state-model-v1.json")
        .save_file()
    else {
        return Ok(None);
    };
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("json"))
        .unwrap_or(false)
    {
        path.set_extension("json");
    }
    let payload = serde_json::to_vec_pretty(&state_documents::model_catalog())
        .map_err(|error| format!("could not serialize state model: {error}"))?;
    std::fs::write(&path, payload)
        .map_err(|error| format!("could not write state model {}: {error}", path.display()))?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
fn save_state_document(
    parameters: tauri::State<'_, ParameterStore>,
    automation: tauri::State<'_, AutomationHandle>,
    video: tauri::State<'_, VideoHandle>,
    source: tauri::State<'_, SourceSelector>,
    midi: tauri::State<'_, MidiHandle>,
    osc: tauri::State<'_, OscHandle>,
    kind: String,
    name: String,
    scope: StateRecallScope,
) -> Result<Option<StateDocumentReceipt>, String> {
    if automation.is_recording() {
        return Err("stop automation recording before saving a state document".into());
    }
    let kind = StateDocumentKind::parse(&kind)?;
    let document = state_documents::build_document(
        kind,
        name,
        scope,
        parameters.snapshot(),
        source.get(),
        video.status(),
        automation.active_clip(),
        midi.info(),
        osc.info(),
    )?;
    let Some(path) = rfd::FileDialog::new()
        .add_filter("HUFF state document", &["json"])
        .set_file_name(state_documents::suggested_filename(kind, &document.name))
        .save_file()
    else {
        return Ok(None);
    };
    let payload = serde_json::to_vec_pretty(&document)
        .map_err(|error| format!("could not serialize state document: {error}"))?;
    std::fs::write(&path, payload)
        .map_err(|error| format!("could not write state document {}: {error}", path.display()))?;
    Ok(Some(state_documents::receipt(
        path.display().to_string(),
        &document,
    )))
}

#[tauri::command]
fn load_state_document(
    parameters: tauri::State<'_, ParameterStore>,
    automation: tauri::State<'_, AutomationHandle>,
    renderer: tauri::State<'_, RendererHandle>,
    camera: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    source: tauri::State<'_, SourceSelector>,
    midi: tauri::State<'_, MidiHandle>,
    osc: tauri::State<'_, OscHandle>,
    scope: StateRecallScope,
) -> Result<Option<StateLoadResult>, String> {
    if automation.is_recording() {
        return Err("stop automation recording before loading a state document".into());
    }
    let Some(path) = rfd::FileDialog::new()
        .add_filter("HUFF state document", &["json"])
        .pick_file()
    else {
        return Ok(None);
    };
    let bytes = std::fs::read(&path)
        .map_err(|error| format!("could not read state document {}: {error}", path.display()))?;
    let document: StateDocument = serde_json::from_slice(&bytes)
        .map_err(|error| format!("invalid state document {}: {error}", path.display()))?;
    let document = state_documents::validate_document(document)?;
    let mut result = state_documents::prepare_load(
        &document,
        &scope,
        parameters.inner(),
        path.display().to_string(),
    )?;

    if result.clear_temporal_buffers {
        renderer.send(RenderCommand::ClearFeedback);
        automation.record_action(ACTION_CLEAR_BUFFERS);
    }
    if result.applied_parameter_count > 0 {
        automation.record_parameter_batch(
            result.parameter_snapshot.values.clone(),
            format!("state_recall:{}", result.name),
        );
    }

    if result.applied_scope.automation {
        if let Some(clip) = document.automation_clip.clone() {
            result.automation = Some(automation.set_active_clip(clip)?);
        }
    }

    if result.applied_scope.control_maps {
        if let Some(map) = document.midi_map.clone() {
            midi.send(MidiCommand::ReplaceMappings(map.mappings.clone()));
            midi.send(MidiCommand::SetMapName(map.name.clone()));
        }
        if let Some(map) = document.osc_map.clone() {
            osc.send(OscCommand::ReplaceMappings(map.mappings.clone()));
            osc.send(OscCommand::SetMapName(map.name.clone()));
        }
    }

    if let Some(source_state) = document.source_state.clone() {
        let current_transport = video.status();
        let mut referenced_video_available = true;
        if result.applied_scope.source {
            match source_state.active_source.as_str() {
                "video" => {
                    let video_path = PathBuf::from(&source_state.video_path);
                    if video_path.is_file() {
                        source.set(ActiveSource::Video);
                        camera.stop_camera();
                        video_audio.send(VideoAudioCommand::Open(video_path.clone()));
                        video.open(video_path);
                    } else {
                        referenced_video_available = false;
                        if !source_state.video_path.is_empty() {
                            result.warnings.push(format!(
                                "Referenced video file is unavailable: {}",
                                source_state.video_path
                            ));
                        }
                    }
                }
                "none" => source.set(ActiveSource::None),
                "automatic" => source.set(ActiveSource::Automatic),
                "camera" => {
                    result.warnings.push(
                        "Camera source was captured, but camera device recall is intentionally manual."
                            .into(),
                    );
                }
                other => result
                    .warnings
                    .push(format!("Unknown source state {other:?} was not applied")),
            }
        }

        let should_apply_document_transport = result.applied_scope.transport
            && source_state.active_source == "video"
            && (!result.applied_scope.source || referenced_video_available);
        if should_apply_document_transport {
            apply_video_transport(
                &video,
                &video_audio,
                source_state.video_decode_mode.clone(),
                source_state.video_looping,
                source_state.video_playback_rate,
                source_state.video_position_seconds,
                source_state.video_playing,
            );
        } else if result.applied_scope.source
            && !result.applied_scope.transport
            && source_state.active_source == "video"
            && referenced_video_available
        {
            apply_video_transport(
                &video,
                &video_audio,
                current_transport.decode_mode,
                current_transport.looping,
                current_transport.playback_rate,
                current_transport.position_seconds,
                current_transport.playing,
            );
        }
    }

    result.parameter_snapshot = parameters.snapshot();
    Ok(Some(result))
}

fn apply_video_transport(
    video: &VideoHandle,
    video_audio: &VideoAudioHandle,
    decode_mode: String,
    looping: bool,
    playback_rate: f64,
    position_seconds: f64,
    playing: bool,
) {
    let rate = if playback_rate.is_finite() {
        playback_rate.clamp(0.25, 4.0)
    } else {
        1.0
    };
    let position = if position_seconds.is_finite() {
        position_seconds.max(0.0)
    } else {
        0.0
    };
    let decode_mode = if matches!(decode_mode.as_str(), "software" | "auto") {
        decode_mode
    } else {
        "software".into()
    };
    video.set_decode_mode(decode_mode);
    video.set_loop(looping);
    video.set_rate(rate);
    video.seek(position);
    video_audio.send(VideoAudioCommand::SetLoop(looping));
    video_audio.send(VideoAudioCommand::SetRate {
        rate,
        position,
        playing,
    });
    video_audio.send(VideoAudioCommand::Seek {
        seconds: position,
        playing,
    });
    if playing {
        video.play();
        video_audio.send(VideoAudioCommand::Play(position));
    } else {
        video.pause();
        video_audio.send(VideoAudioCommand::Pause);
    }
}

#[tauri::command]
fn start_syphon_output(
    renderer: tauri::State<'_, RendererHandle>,
    width: u32,
    height: u32,
    fps: u32,
) -> Result<(), String> {
    let info = renderer.info();
    if width != info.width || height != info.height {
        return Err(format!(
            "Native Syphon output follows the internal render size. Set Syphon to {}×{} or change R: first.",
            info.width, info.height
        ));
    }
    renderer.start_syphon(fps)
}

#[tauri::command]
fn stop_syphon_output(renderer: tauri::State<'_, RendererHandle>) {
    renderer.stop_syphon();
}

#[tauri::command]
fn start_spout_output(
    renderer: tauri::State<'_, RendererHandle>,
    width: u32,
    height: u32,
    fps: u32,
    adapter_index: i32,
) -> Result<(), String> {
    let info = renderer.info();
    if width != info.width || height != info.height {
        return Err(format!(
            "Native Spout output follows the internal render size. Set Spout to {}×{} or change R: first.",
            info.width, info.height
        ));
    }
    renderer.start_spout(fps, adapter_index)
}

#[tauri::command]
fn list_spout_adapters() -> Result<Vec<spout::SpoutAdapter>, String> {
    spout::adapters()
}

#[tauri::command]
fn stop_spout_output(renderer: tauri::State<'_, RendererHandle>) {
    renderer.stop_spout();
}

#[tauri::command]
fn start_recording(
    renderer: tauri::State<'_, RendererHandle>,
    recording: tauri::State<'_, RecordingHandle>,
    export: tauri::State<'_, ExportHandle>,
    offline_export: tauri::State<'_, OfflineExportHandle>,
    source: tauri::State<'_, SourceSelector>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    microphone_audio: tauri::State<'_, AudioHandle>,
    fps: u32,
    audio_mode: String,
) -> Result<Option<String>, String> {
    if recording.info().active || recording.info().finalizing {
        return Err("a recording is already active or finalizing".into());
    }
    if export.info().active {
        return Err("recording is disabled while a still export is active".into());
    }
    if offline_export.info().active {
        return Err("recording is disabled while deterministic export is active".into());
    }
    if !matches!(fps, 30 | 60) {
        return Err("recording FPS must be 30 or 60".into());
    }
    if !matches!(audio_mode.as_str(), "auto" | "video" | "microphone" | "none") {
        return Err("recording audio mode must be auto, video, microphone, or none".into());
    }

    let selected = rfd::FileDialog::new()
        .add_filter("MPEG-4 video", &["mp4"])
        .set_file_name("huff-recording.mp4")
        .save_file();
    let Some(mut path) = selected else {
        return Ok(None);
    };
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("mp4"))
        .unwrap_or(false)
    {
        path.set_extension("mp4");
    }

    let active_source = source.get();
    let video_info = video_audio.info();
    let mut mic_info = microphone_audio.info();
    let requested_audio = match audio_mode.as_str() {
        "video" => Some(RecordingAudioSource::Video),
        "microphone" => Some(RecordingAudioSource::Microphone),
        "none" => None,
        _ => match active_source {
            ActiveSource::Video if video_info.has_audio => Some(RecordingAudioSource::Video),
            ActiveSource::Camera => Some(RecordingAudioSource::Microphone),
            _ => None,
        },
    };

    let (audio_source, audio_sample_rate, audio_channels) = match requested_audio {
        Some(RecordingAudioSource::Video) => {
            if !video_info.has_audio
                || video_info.output_sample_rate == 0
                || video_info.output_channels == 0
            {
                if audio_mode == "video" {
                    return Err("the loaded video has no recordable audio stream".into());
                }
                (None, 0, 0)
            } else {
                (
                    Some(RecordingAudioSource::Video),
                    video_info.output_sample_rate,
                    video_info.output_channels,
                )
            }
        }
        Some(RecordingAudioSource::Microphone) => {
            if !mic_info.running || mic_info.sample_rate == 0 {
                microphone_audio.send(AudioCommand::Start);
                for _ in 0..200 {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    mic_info = microphone_audio.info();
                    if mic_info.running && mic_info.sample_rate > 0 {
                        break;
                    }
                }
            }
            if !mic_info.running || mic_info.sample_rate == 0 {
                if audio_mode == "microphone" {
                    return Err(mic_info
                        .last_error
                        .clone()
                        .is_empty()
                        .then_some("microphone capture could not be started".to_string())
                        .unwrap_or_else(|| mic_info.last_error.clone()));
                }
                (None, 0, 0)
            } else {
                (Some(RecordingAudioSource::Microphone), mic_info.sample_rate, 1)
            }
        }
        None => (None, 0, 0),
    };

    let render = renderer.info();
    recording.start(RecordingStartConfig {
        path: path.clone(),
        width: render.width,
        height: render.height,
        fps,
        audio_source,
        audio_sample_rate,
        audio_channels,
    })?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
fn stop_recording(recording: tauri::State<'_, RecordingHandle>) -> Result<(), String> {
    recording.stop()
}


#[tauri::command]
fn export_still(
    renderer: tauri::State<'_, RendererHandle>,
    export: tauri::State<'_, ExportHandle>,
    recording: tauri::State<'_, RecordingHandle>,
    offline_export: tauri::State<'_, OfflineExportHandle>,
    parameters: tauri::State<'_, ParameterStore>,
    source: tauri::State<'_, SourceSelector>,
    video: tauri::State<'_, VideoHandle>,
    width: u32,
    height: u32,
    sampling: String,
    fit_mode: String,
) -> Result<Option<String>, String> {
    if recording.info().active || recording.info().finalizing {
        return Err("still export is disabled while recording or finalizing".into());
    }
    if export.info().active {
        return Err("another still export is already active".into());
    }
    if offline_export.info().active {
        return Err("still export is disabled while deterministic export is active".into());
    }
    if !matches!(sampling.as_str(), "smooth" | "crisp") {
        return Err("export sampling must be smooth or crisp".into());
    }
    if !matches!(fit_mode.as_str(), "fit" | "crop" | "stretch") {
        return Err("export fit mode must be fit, crop, or stretch".into());
    }

    let selected = rfd::FileDialog::new()
        .add_filter("PNG image", &["png"])
        .set_file_name("huff-still.png")
        .save_file();
    let Some(mut path) = selected else {
        return Ok(None);
    };
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("png"))
        .unwrap_or(false)
    {
        path.set_extension("png");
    }

    let render = renderer.info();
    let video_info = video.status();
    let snapshot = parameters.snapshot();
    let config = StillExportConfig {
        path: path.clone(),
        width,
        height,
        source_width: render.width,
        source_height: render.height,
        sampling: sampling.clone(),
        fit_mode: fit_mode.clone(),
    };
    let metadata = StillExportMetadata {
        engine_build: "HNW-21".into(),
        captured_unix_ms: StillExportMetadata::now_unix_ms(),
        active_source: source.get().label().into(),
        source_file: video_info.file_path,
        source_position_seconds: video_info.position_seconds,
        source_duration_seconds: video_info.duration_seconds,
        source_playback_rate: video_info.playback_rate,
        render_width: render.width,
        render_height: render.height,
        export_width: width,
        export_height: height,
        sampling,
        fit_mode,
        parameter_revision: snapshot.revision,
        parameter_values: serde_json::to_value(snapshot.values.clone())
            .map_err(|error| format!("could not serialize parameter state: {error}"))?,
    };
    renderer.capture_still(config, metadata)?;
    Ok(Some(path.display().to_string()))
}

fn choose_offline_export_destination(profile: &str) -> Result<Option<PathBuf>, String> {
    let extension = profile_extension(profile)?;
    let mut dialog = rfd::FileDialog::new();
    dialog = match profile {
        "prores_hq" | "prores_4444" => dialog
            .add_filter("QuickTime movie", &["mov"])
            .set_file_name("huff-offline-export.mov"),
        "ffv1" => dialog
            .add_filter("Matroska video", &["mkv"])
            .set_file_name("huff-offline-export.mkv"),
        PROFILE_PNG_SEQUENCE => dialog.set_file_name("huff-png-sequence"),
        _ => dialog
            .add_filter("MPEG-4 video", &["mp4"])
            .set_file_name("huff-offline-export.mp4"),
    };
    let Some(mut path) = dialog.save_file() else {
        return Ok(None);
    };
    if profile != PROFILE_PNG_SEQUENCE
        && !path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case(extension))
            .unwrap_or(false)
    {
        path.set_extension(extension);
    }
    if path.exists() {
        return Err("export destination already exists; choose a new file or folder name".into());
    }
    Ok(Some(path))
}

#[tauri::command]
fn start_offline_export(
    renderer: tauri::State<'_, RendererHandle>,
    queue: tauri::State<'_, ExportQueueHandle>,
    parameters: tauri::State<'_, ParameterStore>,
    automation: tauri::State<'_, AutomationHandle>,
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    fps: u32,
    duration_seconds: f64,
    start_mode: String,
    start_seconds: f64,
    width: u32,
    height: u32,
    sampling: String,
    fit_mode: String,
    audio_mode: String,
    profile: String,
    preserve_alpha: bool,
    automation_mode: String,
    automation_loop: bool,
) -> Result<Option<ExportQueueReceipt>, String> {
    if automation.is_recording() {
        return Err("stop automation recording before queueing a deterministic export".into());
    }
    if !matches!(fps, 24 | 30 | 60) {
        return Err("deterministic export FPS must be 24, 30, or 60".into());
    }
    if !duration_seconds.is_finite() || !(0.1..=3600.0).contains(&duration_seconds) {
        return Err("deterministic export duration must be between 0.1 and 3600 seconds".into());
    }
    if !matches!(start_mode.as_str(), "current" | "zero" | "custom") {
        return Err("deterministic export start mode must be current, zero, or custom".into());
    }
    if !matches!(sampling.as_str(), "smooth" | "crisp") {
        return Err("deterministic export sampling must be smooth or crisp".into());
    }
    if !matches!(fit_mode.as_str(), "fit" | "crop" | "stretch") {
        return Err("deterministic export fit mode must be fit, crop, or stretch".into());
    }
    if !matches!(audio_mode.as_str(), "source" | "none") {
        return Err("deterministic export audio mode must be source or none".into());
    }
    if !matches!(automation_mode.as_str(), "none" | "active") {
        return Err("deterministic export automation mode must be none or active".into());
    }
    validate_profile_support(&profile, preserve_alpha)?;
    if preserve_alpha && !profile_supports_alpha(&profile) {
        return Err(format!("{} does not support alpha output", profile_label(&profile)));
    }
    if width == 0 || height == 0 || width > 8192 || height > 8192 {
        return Err("deterministic export dimensions must be between 1 and 8192 pixels per axis".into());
    }
    if profile_requires_even_dimensions(&profile) && (width % 2 != 0 || height % 2 != 0) {
        return Err(format!(
            "{} dimensions must be even",
            profile_label(&profile)
        ));
    }
    if u64::from(width).saturating_mul(u64::from(height)) > 35_000_000 {
        return Err("deterministic export exceeds the bounded 35 megapixel limit".into());
    }

    let video_info = video.status();
    if !video_info.loaded || video_info.file_path.is_empty() {
        return Err("load a video file before queueing deterministic export".into());
    }
    let start = match start_mode.as_str() {
        "zero" => 0.0,
        "custom" => start_seconds,
        _ => video_info.position_seconds,
    };
    if !start.is_finite() || start < 0.0 || start > video_info.duration_seconds.max(0.0) {
        return Err("deterministic export start time is outside the loaded video".into());
    }
    let playback_rate = video_info.playback_rate.clamp(0.1, 4.0);
    if !video_info.looping {
        let source_end = start + duration_seconds * playback_rate;
        if video_info.duration_seconds > 0.0 && source_end > video_info.duration_seconds + 0.001 {
            let available = ((video_info.duration_seconds - start) / playback_rate).max(0.0);
            return Err(format!(
                "the requested export exceeds the remaining source duration; {:.2} seconds are available at {:.2}×",
                available, playback_rate
            ));
        }
    }

    let automation_clip = if automation_mode == "active" {
        Some(
            automation
                .active_clip()
                .ok_or_else(|| "record or import an automation clip before queueing automated export".to_string())?,
        )
    } else {
        None
    };
    if automation_loop && automation_clip.is_none() {
        return Err("automation looping requires ACTIVE AUTOMATION".into());
    }
    let Some(path) = choose_offline_export_destination(&profile)? else {
        return Ok(None);
    };

    let render = renderer.info();
    let audio_info = video_audio.info();
    let snapshot = parameters.snapshot();
    let deterministic_seed = snapshot
        .number("source.seed", 912_831.0)
        .round()
        .max(0.0) as u64;
    let include_audio = audio_mode == "source" && audio_info.has_audio;
    if audio_mode == "source" && !audio_info.has_audio {
        return Err("the loaded video has no audio stream; choose SILENT export".into());
    }
    let config = OfflineExportConfig {
        path: path.clone(),
        source_path: PathBuf::from(&video_info.file_path),
        source_width: video_info.width,
        source_height: video_info.height,
        output_width: width,
        output_height: height,
        start_seconds: start,
        duration_seconds,
        fps,
        playback_rate,
        loop_source: video_info.looping,
        include_audio,
        audio_volume: audio_info.volume,
        sampling: sampling.clone(),
        fit_mode: fit_mode.clone(),
        profile: profile.clone(),
        preserve_alpha,
        automation_clip: automation_clip.clone(),
        automation_loop,
        queue_job_id: String::new(),
    };
    let metadata = OfflineExportMetadata {
        engine_build: "HNW-21".into(),
        created_unix_ms: OfflineExportMetadata::now_unix_ms(),
        source_file: video_info.file_path.clone(),
        source_codec: video_info.codec,
        source_duration_seconds: video_info.duration_seconds,
        source_playback_rate: playback_rate,
        export_start_seconds: start,
        export_duration_seconds: duration_seconds,
        export_fps: fps,
        render_width: width,
        render_height: height,
        export_width: width,
        export_height: height,
        graph_mode: "full_resolution".into(),
        live_reference_width: render.width,
        live_reference_height: render.height,
        graph_history_width: 0,
        graph_history_height: 0,
        graph_history_capacity: 0,
        graph_estimated_gpu_bytes: 0,
        sampling,
        fit_mode,
        include_audio,
        loop_source: video_info.looping,
        parameter_revision: snapshot.revision,
        parameter_values: serde_json::to_value(snapshot.values.clone())
            .map_err(|error| format!("could not serialize deterministic export state: {error}"))?,
        deterministic_seed,
        export_profile: profile.clone(),
        export_profile_label: profile_label(&profile).into(),
        output_kind: if profile == PROFILE_PNG_SEQUENCE {
            "image_sequence".into()
        } else {
            "video".into()
        },
        container: profile_container(&profile)?.into(),
        video_codec: profile_codec(&profile)?,
        pixel_format: profile_pixel_format(&profile, preserve_alpha)?.into(),
        preserve_alpha,
        automation_enabled: automation_clip.is_some(),
        automation_name: automation_clip
            .as_ref()
            .map(|clip| clip.name.clone())
            .unwrap_or_default(),
        automation_duration_seconds: automation_clip
            .as_ref()
            .map(|clip| clip.duration_seconds)
            .unwrap_or(0.0),
        automation_event_count: automation_clip
            .as_ref()
            .map(|clip| clip.events.len())
            .unwrap_or(0),
        automation_loop,
        automation_clip,
        frame_pattern: if profile == PROFILE_PNG_SEQUENCE {
            path.join("frame_%06d.png").display().to_string()
        } else {
            String::new()
        },
        audio_artifact: if include_audio && profile == PROFILE_PNG_SEQUENCE {
            path.join("audio.wav").display().to_string()
        } else if include_audio {
            path.display().to_string()
        } else {
            String::new()
        },
    };
    queue.enqueue(config, metadata, snapshot).map(Some)
}

#[tauri::command]
fn cancel_offline_export(
    renderer: tauri::State<'_, RendererHandle>,
    offline_export: tauri::State<'_, OfflineExportHandle>,
    queue: tauri::State<'_, ExportQueueHandle>,
) {
    queue.cancel_active(&renderer, &offline_export);
}

#[tauri::command]
fn set_export_queue_paused(
    queue: tauri::State<'_, ExportQueueHandle>,
    paused: bool,
) -> Result<(), String> {
    queue.set_paused(paused)
}

#[tauri::command]
fn cancel_export_queue_job(
    queue: tauri::State<'_, ExportQueueHandle>,
    job_id: String,
) -> Result<(), String> {
    queue.cancel_job(&job_id)
}

#[tauri::command]
fn retry_export_queue_job(
    queue: tauri::State<'_, ExportQueueHandle>,
    job_id: String,
) -> Result<(), String> {
    queue.retry_job(&job_id)
}

#[tauri::command]
fn repeat_export_queue_job(
    queue: tauri::State<'_, ExportQueueHandle>,
    job_id: String,
) -> Result<Option<ExportQueueReceipt>, String> {
    let job = queue.job(&job_id)?;
    let Some(path) = choose_offline_export_destination(&job.config.profile)? else {
        return Ok(None);
    };
    queue.repeat_job_to(&job_id, path).map(Some)
}

#[tauri::command]
fn remove_export_queue_job(
    queue: tauri::State<'_, ExportQueueHandle>,
    job_id: String,
) -> Result<(), String> {
    queue.remove_job(&job_id)
}

#[tauri::command]
fn clear_finished_export_jobs(
    queue: tauri::State<'_, ExportQueueHandle>,
) -> Result<usize, String> {
    queue.clear_finished()
}

#[tauri::command]
fn move_export_queue_job(
    queue: tauri::State<'_, ExportQueueHandle>,
    job_id: String,
    direction: i32,
) -> Result<(), String> {
    queue.move_job(&job_id, direction)
}

#[tauri::command]
fn focus_renderer(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_window("renderer")
        .ok_or_else(|| "renderer window unavailable".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn refresh_cameras(state: tauri::State<'_, CameraHandle>) {
    state.refresh();
}

#[tauri::command]
fn start_camera(
    state: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    source: tauri::State<'_, SourceSelector>,
    slot: usize,
    profile: String,
) -> Result<(), String> {
    if !matches!(profile.as_str(), "lowLatency" | "balanced" | "speed" | "quality") {
        return Err("profile must be lowLatency, balanced, speed, or quality".into());
    }
    // Camera and file playback are mutually exclusive authoritative sources.
    // Keep the loaded file and position, but stop its decoder/audio while the
    // camera is active so no hidden transport continues in the background.
    video_audio.send(VideoAudioCommand::Pause);
    video.pause();
    source.set(ActiveSource::Camera);
    state.start_camera(slot, profile);
    Ok(())
}

#[tauri::command]
fn stop_camera(
    state: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    source: tauri::State<'_, SourceSelector>,
) {
    state.stop_camera();
    source.set(if video.status().loaded {
        ActiveSource::Video
    } else {
        ActiveSource::None
    });
}

#[tauri::command]
fn open_video_file(
    camera: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    source: tauri::State<'_, SourceSelector>,
) -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .add_filter(
            "Video",
            &["mp4", "mov", "m4v", "mkv", "webm", "avi", "mpeg", "mpg", "ts"],
        )
        .pick_file();
    if let Some(path) = path {
        let display = path.display().to_string();
        // Select video immediately instead of waiting for the asynchronous
        // camera stop command or the first decoded file frame.
        source.set(ActiveSource::Video);
        camera.stop_camera();
        video_audio.send(VideoAudioCommand::Open(path.clone()));
        video.open(path);
        Ok(Some(display))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn open_video_path(
    camera: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    source: tauri::State<'_, SourceSelector>,
    path: String,
) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err("selected path is not a file".into());
    }
    source.set(ActiveSource::Video);
    camera.stop_camera();
    video_audio.send(VideoAudioCommand::Open(path.clone()));
    video.open(path);
    Ok(())
}

#[tauri::command]
fn play_video(
    camera: tauri::State<'_, CameraHandle>,
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    source: tauri::State<'_, SourceSelector>,
) {
    camera.stop_camera();
    source.set(ActiveSource::Video);
    let position = video.status().position_seconds;
    video_audio.send(VideoAudioCommand::Play(position));
    video.play();
}

#[tauri::command]
fn pause_video(
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
) {
    video_audio.send(VideoAudioCommand::Pause);
    video.pause();
}

#[tauri::command]
fn stop_video(
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
) {
    video_audio.send(VideoAudioCommand::Stop);
    video.stop();
}

#[tauri::command]
fn seek_video(
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    seconds: f64,
) -> Result<(), String> {
    if !seconds.is_finite() {
        return Err("seek position must be finite".into());
    }
    let status = video.status();
    let target = seconds.clamp(0.0, status.duration_seconds.max(0.0));
    video_audio.send(VideoAudioCommand::Seek {
        seconds: target,
        playing: status.playing,
    });
    video.seek(target);
    Ok(())
}

#[tauri::command]
fn step_video(
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    direction: i32,
) {
    let status = video.status();
    let frame_seconds = 1.0 / status.source_fps.max(1.0);
    let target = (status.position_seconds + frame_seconds * direction.signum() as f64)
        .clamp(0.0, status.duration_seconds.max(0.0));
    video_audio.send(VideoAudioCommand::Seek {
        seconds: target,
        playing: false,
    });
    video.step(direction);
}

#[tauri::command]
fn set_video_rate(
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    rate: f64,
) -> Result<(), String> {
    if !rate.is_finite() {
        return Err("playback rate must be finite".into());
    }
    let status = video.status();
    let clamped = rate.clamp(0.25, 4.0);
    video_audio.send(VideoAudioCommand::SetRate {
        rate: clamped,
        position: status.position_seconds,
        playing: status.playing,
    });
    video.set_rate(clamped);
    Ok(())
}

#[tauri::command]
fn set_video_decode_mode(
    video: tauri::State<'_, VideoHandle>,
    mode: String,
) -> Result<(), String> {
    if !matches!(mode.as_str(), "software" | "auto") {
        return Err("decode mode must be software or auto".into());
    }
    video.set_decode_mode(mode);
    Ok(())
}

#[tauri::command]
fn set_video_loop(
    video: tauri::State<'_, VideoHandle>,
    video_audio: tauri::State<'_, VideoAudioHandle>,
    looping: bool,
) {
    video_audio.send(VideoAudioCommand::SetLoop(looping));
    video.set_loop(looping);
}

#[tauri::command]
fn refresh_audio_devices(state: tauri::State<'_, AudioHandle>) {
    state.send(AudioCommand::RefreshDevices);
}

#[tauri::command]
fn select_audio_device(state: tauri::State<'_, AudioHandle>, name: String) {
    state.send(AudioCommand::SelectDevice(name));
}

#[tauri::command]
fn start_audio(state: tauri::State<'_, AudioHandle>) {
    state.send(AudioCommand::Start);
}

#[tauri::command]
fn stop_audio(state: tauri::State<'_, AudioHandle>) {
    state.send(AudioCommand::Stop);
}

#[tauri::command]
fn set_audio_fft_source(
    state: tauri::State<'_, AudioRouterHandle>,
    source: String,
) -> Result<(), String> {
    if !matches!(source.as_str(), "microphone" | "video" | "mix") {
        return Err("audio FFT source must be microphone, video, or mix".into());
    }
    state.send(AudioRouterCommand::SetSource(source));
    Ok(())
}

#[tauri::command]
fn set_video_audio_preview(
    state: tauri::State<'_, VideoAudioHandle>,
    enabled: bool,
) {
    state.send(VideoAudioCommand::SetPreview(enabled));
}

#[tauri::command]
fn set_video_audio_volume(
    state: tauri::State<'_, VideoAudioHandle>,
    volume: f32,
) -> Result<(), String> {
    if !volume.is_finite() {
        return Err("volume must be finite".into());
    }
    state.send(VideoAudioCommand::SetVolume(volume.clamp(0.0, 1.0)));
    Ok(())
}

#[tauri::command]
fn refresh_midi_ports(state: tauri::State<'_, MidiHandle>) {
    state.send(MidiCommand::RefreshPorts);
}

#[tauri::command]
fn connect_midi(state: tauri::State<'_, MidiHandle>, name: String) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("select a MIDI input".into());
    }
    state.send(MidiCommand::Connect(name));
    Ok(())
}

#[tauri::command]
fn disconnect_midi(state: tauri::State<'_, MidiHandle>) {
    state.send(MidiCommand::Disconnect);
}

#[tauri::command]
fn bind_osc(
    state: tauri::State<'_, OscHandle>,
    host: String,
    port: u16,
) -> Result<(), String> {
    if port == 0 {
        return Err("OSC port must be between 1 and 65535".into());
    }
    state.send(OscCommand::Bind(host, port));
    Ok(())
}

#[tauri::command]
fn stop_osc(state: tauri::State<'_, OscHandle>) {
    state.send(OscCommand::Stop);
}

#[tauri::command]
fn send_osc_test(host: String, port: u16, address: String, value: f32) -> Result<(), String> {
    if port == 0 || !value.is_finite() {
        return Err("invalid OSC test arguments".into());
    }
    let address = if address.trim().starts_with('/') {
        address.trim().to_string()
    } else {
        format!("/{}", address.trim())
    };
    let packet = OscPacket::Message(OscMessage {
        addr: address,
        args: vec![OscType::Float(value)],
    });
    let bytes = encoder::encode(&packet).map_err(|error| error.to_string())?;
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
    socket
        .send_to(&bytes, format!("{}:{}", host.trim(), port))
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn arm_midi_learn(state: tauri::State<'_, MidiHandle>, target: String) -> Result<(), String> {
    if !control_mapping::valid_target(&target) {
        return Err(format!("invalid MIDI learn target: {target}"));
    }
    state.send(MidiCommand::ArmLearn(target));
    Ok(())
}

#[tauri::command]
fn cancel_midi_learn(state: tauri::State<'_, MidiHandle>) {
    state.send(MidiCommand::CancelLearn);
}

#[tauri::command]
fn update_midi_mapping(state: tauri::State<'_, MidiHandle>, mapping: MidiMapping) {
    state.send(MidiCommand::UpdateMapping(mapping));
}

#[tauri::command]
fn delete_midi_mapping(state: tauri::State<'_, MidiHandle>, id: u64) {
    state.send(MidiCommand::DeleteMapping(id));
}

#[tauri::command]
fn clear_midi_mappings(state: tauri::State<'_, MidiHandle>) {
    state.send(MidiCommand::ClearMappings);
}

#[tauri::command]
fn load_factory_midi_map(state: tauri::State<'_, MidiHandle>) {
    state.send(MidiCommand::LoadStarterMappings);
}

#[tauri::command]
fn load_midi_map(state: tauri::State<'_, MidiHandle>) -> Result<Option<ControlMapFileResult>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("HUFF MIDI map", &["json"])
        .pick_file()
    else {
        return Ok(None);
    };
    let bytes = std::fs::read(&path)
        .map_err(|error| format!("could not read MIDI map {}: {error}", path.display()))?;
    let document: MidiMapDocument = serde_json::from_slice(&bytes)
        .map_err(|error| format!("invalid MIDI map {}: {error}", path.display()))?;
    if document.schema != control_mapping::MAPPING_SCHEMA {
        return Err(format!("unsupported MIDI map schema: {}", document.schema));
    }
    let count = document.mappings.len();
    state.send(MidiCommand::ReplaceMappings(document.mappings));
    state.send(MidiCommand::SetMapName(document.name.clone()));
    Ok(Some(ControlMapFileResult {
        path: path.display().to_string(),
        name: document.name,
        mapping_count: count,
    }))
}

#[tauri::command]
fn save_midi_map(state: tauri::State<'_, MidiHandle>) -> Result<Option<ControlMapFileResult>, String> {
    let info = state.info();
    let Some(mut path) = rfd::FileDialog::new()
        .add_filter("HUFF MIDI map", &["json"])
        .set_file_name("huff-midi-map.json")
        .save_file()
    else {
        return Ok(None);
    };
    if !path.extension().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("json")).unwrap_or(false) {
        path.set_extension("json");
    }
    let document = MidiMapDocument {
        schema: control_mapping::MAPPING_SCHEMA.into(),
        name: info.map_name.clone(),
        notes: "Portable HUFF canonical MIDI mapping".into(),
        mappings: info.mappings,
    };
    let payload = serde_json::to_vec_pretty(&document)
        .map_err(|error| format!("could not serialize MIDI map: {error}"))?;
    std::fs::write(&path, payload)
        .map_err(|error| format!("could not write MIDI map {}: {error}", path.display()))?;
    Ok(Some(ControlMapFileResult {
        path: path.display().to_string(),
        name: document.name,
        mapping_count: document.mappings.len(),
    }))
}

#[tauri::command]
fn arm_osc_learn(state: tauri::State<'_, OscHandle>, target: String) -> Result<(), String> {
    if !control_mapping::valid_target(&target) {
        return Err(format!("invalid OSC learn target: {target}"));
    }
    state.send(OscCommand::ArmLearn(target));
    Ok(())
}

#[tauri::command]
fn cancel_osc_learn(state: tauri::State<'_, OscHandle>) {
    state.send(OscCommand::CancelLearn);
}

#[tauri::command]
fn update_osc_mapping(state: tauri::State<'_, OscHandle>, mapping: OscMapping) {
    state.send(OscCommand::UpdateMapping(mapping));
}

#[tauri::command]
fn delete_osc_mapping(state: tauri::State<'_, OscHandle>, id: u64) {
    state.send(OscCommand::DeleteMapping(id));
}

#[tauri::command]
fn clear_osc_mappings(state: tauri::State<'_, OscHandle>) {
    state.send(OscCommand::ClearMappings);
}

#[tauri::command]
fn load_factory_osc_map(state: tauri::State<'_, OscHandle>) {
    state.send(OscCommand::LoadStarterMappings);
}

#[tauri::command]
fn load_osc_map(state: tauri::State<'_, OscHandle>) -> Result<Option<ControlMapFileResult>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("HUFF OSC map", &["json"])
        .pick_file()
    else {
        return Ok(None);
    };
    let bytes = std::fs::read(&path)
        .map_err(|error| format!("could not read OSC map {}: {error}", path.display()))?;
    let document: OscMapDocument = serde_json::from_slice(&bytes)
        .map_err(|error| format!("invalid OSC map {}: {error}", path.display()))?;
    if document.schema != control_mapping::MAPPING_SCHEMA {
        return Err(format!("unsupported OSC map schema: {}", document.schema));
    }
    let count = document.mappings.len();
    state.send(OscCommand::ReplaceMappings(document.mappings));
    state.send(OscCommand::SetMapName(document.name.clone()));
    Ok(Some(ControlMapFileResult {
        path: path.display().to_string(),
        name: document.name,
        mapping_count: count,
    }))
}

#[tauri::command]
fn save_osc_map(state: tauri::State<'_, OscHandle>) -> Result<Option<ControlMapFileResult>, String> {
    let info = state.info();
    let Some(mut path) = rfd::FileDialog::new()
        .add_filter("HUFF OSC map", &["json"])
        .set_file_name("huff-osc-map.json")
        .save_file()
    else {
        return Ok(None);
    };
    if !path.extension().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("json")).unwrap_or(false) {
        path.set_extension("json");
    }
    let document = OscMapDocument {
        schema: control_mapping::MAPPING_SCHEMA.into(),
        name: info.map_name.clone(),
        notes: "Portable HUFF canonical OSC mapping".into(),
        mappings: info.mappings,
    };
    let payload = serde_json::to_vec_pretty(&document)
        .map_err(|error| format!("could not serialize OSC map: {error}"))?;
    std::fs::write(&path, payload)
        .map_err(|error| format!("could not write OSC map {}: {error}", path.display()))?;
    Ok(Some(ControlMapFileResult {
        path: path.display().to_string(),
        name: document.name,
        mapping_count: document.mappings.len(),
    }))
}

#[tauri::command]
fn push_gesture_point(state: tauri::State<'_, GestureHandle>, point: GesturePoint) {
    state.push(point);
}

#[tauri::command]
fn clear_gesture(state: tauri::State<'_, GestureHandle>) {
    state.clear();
}

#[tauri::command]
fn set_compositor_param(
    state: tauri::State<'_, ParameterStore>,
    automation: tauri::State<'_, AutomationHandle>,
    name: String,
    value: f32,
) -> Result<u64, String> {
    let canonical = match name.as_str() {
        "sourceMix" => "source.base_mix",
        "feedback" => "feedback.persistence",
        "exposure" => "color.brightness",
        "contrast" => "color.contrast",
        _ => return Err(format!("legacy compositor parameter is not part of Huff Milestone 03: {name}")),
    };
    let revision = state.set(canonical, serde_json::json!(value))?;
    if let Some(value) = state.value(canonical) {
        automation.record_parameter(canonical, value);
    }
    Ok(revision)
}

#[tauri::command]
fn set_compositor_mode(mode: String) -> Result<(), String> {
    let _ = mode;
    Ok(())
}

#[tauri::command]
fn reset_compositor(
    state: tauri::State<'_, ParameterStore>,
    renderer: tauri::State<'_, RendererHandle>,
    automation: tauri::State<'_, AutomationHandle>,
) {
    renderer.send(RenderCommand::ClearFeedback);
    state.reset();
    automation.record_parameter_batch(state.snapshot().values, "reset_compositor".into());
    automation.record_action(ACTION_CLEAR_BUFFERS);
}

#[tauri::command]
fn toggle_renderer_fullscreen(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app
        .get_window("renderer")
        .ok_or_else(|| "renderer window unavailable".to_string())?;
    let next = !window.is_fullscreen().map_err(|error| error.to_string())?;
    window
        .set_fullscreen(next)
        .map_err(|error| error.to_string())?;
    Ok(next)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let recording = recording::start().map_err(std::io::Error::other)?;
            let export = export::start().map_err(std::io::Error::other)?;
            let offline_export = OfflineExportHandle::new();
            let recording_audio = recording.audio_tap();
            let camera = camera::start().map_err(std::io::Error::other)?;
            let video = video::start().map_err(std::io::Error::other)?;
            let microphone_audio = audio::start(recording_audio.clone()).map_err(std::io::Error::other)?;
            let video_audio = video_audio::start(recording_audio).map_err(std::io::Error::other)?;
            let audio_router = audio_router::start(
                microphone_audio.snapshot(),
                video_audio.snapshot(),
            )
            .map_err(std::io::Error::other)?;
            let gesture = GestureHandle::new();
            let automation = AutomationHandle::new();
            let parameters = ParameterStore::new();
            let control_actions = ControlActionBus::default();
            let midi = midi::start(
                parameters.clone(),
                automation.clone(),
                control_actions.clone(),
            )
            .map_err(std::io::Error::other)?;
            let osc = osc::start(
                parameters.clone(),
                automation.clone(),
                control_actions.clone(),
            )
            .map_err(std::io::Error::other)?;
            let source = SourceSelector::new(ActiveSource::Camera);


            let renderer_window = tauri::window::WindowBuilder::new(app, "renderer")
                .title("huff · native wgpu output")
                .inner_size(1280.0, 720.0)
                .min_inner_size(480.0, 270.0)
                .resizable(true)
                .build()?;

            let renderer = renderer::start(
                renderer_window.clone(),
                renderer::InputSources {
                    camera: camera.frame_source(),
                    video: video.frame_source(),
                    audio: audio_router.snapshot(),
                    midi: midi.snapshot(),
                    osc: osc.snapshot(),
                    gesture: gesture.snapshot(),
                    control_actions: control_actions.clone(),
                    source: source.clone(),
                    video_control: video.clone(),
                    video_audio_control: video_audio.clone(),
                },
                parameters.clone(),
                recording.clone(),
                export.clone(),
                offline_export.clone(),
            )
            .map_err(std::io::Error::other)?;

            let queue_dir = app
                .path()
                .app_data_dir()
                .map_err(std::io::Error::other)?;
            let export_queue = ExportQueueHandle::start(
                queue_dir.join("huff-export-queue.json"),
                renderer.clone(),
                offline_export.clone(),
                recording.clone(),
                export.clone(),
                automation.clone(),
            )
            .map_err(std::io::Error::other)?;

            let resize = renderer.clone();
            renderer_window.on_window_event(move |event| match event {
                tauri::WindowEvent::Resized(size) => {
                    resize.send(RenderCommand::Resize(size.width, size.height))
                }
                tauri::WindowEvent::ScaleFactorChanged { new_inner_size, .. } => {
                    resize.send(RenderCommand::Resize(
                        new_inner_size.width,
                        new_inner_size.height,
                    ))
                }
                tauri::WindowEvent::Focused(focused) => {
                    if *focused {
                        resize.send(RenderCommand::RecoverSurface);
                    }
                }
                tauri::WindowEvent::Destroyed => resize.send(RenderCommand::Shutdown),
                _ => {}
            });

            if let Some(controls) = app.get_webview_window("controls") {
                let app_handle = app.handle().clone();
                let close_renderer = renderer.clone();
                let close_camera = camera.clone();
                let close_video = video.clone();
                let close_microphone_audio = microphone_audio.clone();
                let close_video_audio = video_audio.clone();
                let close_audio_router = audio_router.clone();
                let close_midi = midi.clone();
                let close_osc = osc.clone();
                let close_recording = recording.clone();
                let close_export = export.clone();
                let close_offline_export = offline_export.clone();
                let close_export_queue = export_queue.clone();
                controls.on_window_event(move |event| match event {
                    tauri::WindowEvent::Focused(focused) => {
                        if *focused {
                            close_renderer.send(RenderCommand::RecoverSurface);
                        }
                    }
                    tauri::WindowEvent::CloseRequested { .. } => {
                        if close_recording.info().active || close_recording.info().finalizing {
                            let _ = close_recording.stop();
                        }
                        close_recording.shutdown();
                        close_export.shutdown();
                        close_offline_export.request_cancel();
                        close_export_queue.shutdown();
                        close_renderer.send(RenderCommand::Shutdown);
                        close_camera.shutdown();
                        close_video.shutdown();
                        close_microphone_audio.send(AudioCommand::Shutdown);
                        close_video_audio.send(VideoAudioCommand::Shutdown);
                        close_audio_router.send(AudioRouterCommand::Shutdown);
                        close_midi.send(MidiCommand::Shutdown);
                        close_osc.send(OscCommand::Shutdown);
                        app_handle.exit(0);
                    }
                    _ => {}
                });
            }

            app.manage(camera);
            app.manage(video);
            app.manage(microphone_audio);
            app.manage(video_audio);
            app.manage(audio_router);
            app.manage(midi);
            app.manage(osc);
            app.manage(gesture);
            app.manage(recording);
            app.manage(export);
            app.manage(offline_export);
            app.manage(export_queue);
            app.manage(automation);
            app.manage(parameters);
            app.manage(source);
            app.manage(renderer);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            run_interop_analysis,
            run_interop_copy_probe,
            export_interop_report,
            run_production_check,
            recover_live_runtime,
            export_diagnostics_bundle,
            get_parameter_registry,
            get_control_target_catalog,
            get_parameter_state,
            get_routing_catalog,
            get_routing_plan,
            apply_routing_recipe,
            export_routing_plan,
            get_calibration_profiles,
            get_parity_report,
            apply_calibration_profile,
            export_parity_report,
            set_parameter,
            set_parameter_batch,
            reset_parameters,
            clear_native_buffers,
            fire_flow_pulse,
            start_automation_recording,
            stop_automation_recording,
            get_active_automation_clip,
            set_active_automation_clip,
            clear_active_automation_clip,
            get_state_model_catalog,
            export_state_model_catalog,
            save_state_document,
            load_state_document,
            start_syphon_output,
            stop_syphon_output,
            start_spout_output,
            list_spout_adapters,
            stop_spout_output,
            start_recording,
            stop_recording,
            export_still,
            start_offline_export,
            cancel_offline_export,
            set_export_queue_paused,
            cancel_export_queue_job,
            retry_export_queue_job,
            repeat_export_queue_job,
            remove_export_queue_job,
            clear_finished_export_jobs,
            move_export_queue_job,
            focus_renderer,
            refresh_cameras,
            start_camera,
            stop_camera,
            open_video_file,
            open_video_path,
            play_video,
            pause_video,
            stop_video,
            seek_video,
            step_video,
            set_video_rate,
            set_video_decode_mode,
            set_video_loop,
            refresh_audio_devices,
            select_audio_device,
            start_audio,
            stop_audio,
            set_audio_fft_source,
            set_video_audio_preview,
            set_video_audio_volume,
            refresh_midi_ports,
            connect_midi,
            disconnect_midi,
            arm_midi_learn,
            cancel_midi_learn,
            update_midi_mapping,
            delete_midi_mapping,
            clear_midi_mappings,
            load_factory_midi_map,
            load_midi_map,
            save_midi_map,
            bind_osc,
            stop_osc,
            send_osc_test,
            arm_osc_learn,
            cancel_osc_learn,
            update_osc_mapping,
            delete_osc_mapping,
            clear_osc_mappings,
            load_factory_osc_map,
            load_osc_map,
            save_osc_map,
            push_gesture_point,
            clear_gesture,
            set_compositor_param,
            set_compositor_mode,
            reset_compositor,
            toggle_renderer_fullscreen
        ])
        .run(tauri::generate_context!())
        .expect("error while running Huff native wgpu engine");
}
