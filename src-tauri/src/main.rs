#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

mod audio;
mod audio_router;
mod camera;
mod export;
mod export_queue;
mod gesture;
mod history;
mod midi;
mod offline_export;
mod osc;
mod output_frame;
mod parameters;
mod recording;
mod renderer;
mod source;
mod spout;
mod syphon;
mod video;
mod video_audio;

use audio::{AudioCommand, AudioHandle};
use audio_router::{AudioRouterCommand, AudioRouterHandle};
use camera::{CameraDevice, CameraHandle};
use export::{ExportHandle, StillExportConfig, StillExportMetadata};
use export_queue::{ExportQueueHandle, ExportQueueReceipt};
use gesture::{GestureHandle, GesturePoint};
use midi::{MidiCommand, MidiHandle};
use offline_export::{
    profile_codec, profile_container, profile_extension, profile_label,
    profile_pixel_format, profile_requires_even_dimensions, profile_supports_alpha,
    validate_profile_support, OfflineExportConfig, OfflineExportHandle, OfflineExportMetadata,
    PROFILE_PNG_SEQUENCE,
};
use osc::{OscCommand, OscHandle};
use parameters::{ParameterDefinition, ParameterSnapshot, ParameterStore};
use recording::{RecordingAudioSource, RecordingHandle, RecordingStartConfig};
use renderer::{RenderCommand, RendererHandle};
use source::{ActiveSource, SourceSelector};
use rosc::{encoder, OscMessage, OscPacket, OscType};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    net::UdpSocket,
    path::PathBuf,
};
use tauri::Manager;
use video::VideoHandle;
use video_audio::{VideoAudioCommand, VideoAudioHandle};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioSystemInfo {
    router: audio_router::AudioRouterInfo,
    microphone: audio::AudioInfo,
    video: video_audio::VideoAudioInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    build: String,
    renderer: renderer::RendererInfo,
    camera: camera::CameraStatus,
    camera_devices: Vec<CameraDevice>,
    video: video::VideoStatus,
    audio: AudioSystemInfo,
    midi: midi::MidiInfo,
    osc: osc::OscInfo,
    syphon: syphon::SyphonInfo,
    spout: spout::SpoutInfo,
    recording: recording::RecordingInfo,
    export: export::ExportInfo,
    offline_export: offline_export::OfflineExportInfo,
    export_queue: export_queue::ExportQueueInfo,
    gesture: gesture::GestureInfo,
    parameter_revision: u64,
    native_milestone: String,
    active_source: String,
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
    parameters: tauri::State<'_, ParameterStore>,
    source: tauri::State<'_, SourceSelector>,
) -> AppInfo {
    AppInfo {
        build: "HNW-13".into(),
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
        parameter_revision: parameters.revision(),
        native_milestone: "HNW-13".into(),
        active_source: source.get().label().into(),
    }
}

#[tauri::command]
fn get_parameter_registry() -> Vec<ParameterDefinition> {
    parameters::definitions().to_vec()
}

#[tauri::command]
fn get_parameter_state(state: tauri::State<'_, ParameterStore>) -> ParameterSnapshot {
    state.snapshot()
}

#[tauri::command]
fn set_parameter(
    state: tauri::State<'_, ParameterStore>,
    id: String,
    value: serde_json::Value,
) -> Result<u64, String> {
    state.set(&id, value)
}

#[tauri::command]
fn set_parameter_batch(
    state: tauri::State<'_, ParameterStore>,
    values: BTreeMap<String, serde_json::Value>,
) -> Result<u64, String> {
    state.set_many(values)
}

#[tauri::command]
fn reset_parameters(
    state: tauri::State<'_, ParameterStore>,
    renderer: tauri::State<'_, RendererHandle>,
) -> u64 {
    renderer.send(RenderCommand::ClearFeedback);
    state.reset()
}

#[tauri::command]
fn clear_native_buffers(renderer: tauri::State<'_, RendererHandle>) {
    renderer.send(RenderCommand::ClearFeedback);
}

#[tauri::command]
fn fire_flow_pulse(renderer: tauri::State<'_, RendererHandle>) {
    renderer.send(RenderCommand::FireFlowPulse);
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
        engine_build: "HNW-13".into(),
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
) -> Result<Option<ExportQueueReceipt>, String> {
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
        queue_job_id: String::new(),
    };
    let metadata = OfflineExportMetadata {
        engine_build: "HNW-13".into(),
        created_unix_ms: OfflineExportMetadata::now_unix_ms(),
        source_file: video_info.file_path.clone(),
        source_codec: video_info.codec,
        source_duration_seconds: video_info.duration_seconds,
        source_playback_rate: playback_rate,
        export_start_seconds: start,
        export_duration_seconds: duration_seconds,
        export_fps: fps,
        render_width: render.width,
        render_height: render.height,
        export_width: width,
        export_height: height,
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
    state.send(MidiCommand::LoadStarterMappings);
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
    state.send(OscCommand::LoadStarterMappings);
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
    state.set(canonical, serde_json::json!(value))
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
) {
    renderer.send(RenderCommand::ClearFeedback);
    state.reset();
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
            let midi = midi::start().map_err(std::io::Error::other)?;
            let osc = osc::start().map_err(std::io::Error::other)?;
            let gesture = GestureHandle::new();
            let parameters = ParameterStore::new();
            let source = SourceSelector::new(ActiveSource::Camera);

            osc.send(OscCommand::LoadStarterMappings);
            osc.send(OscCommand::Bind("0.0.0.0".into(), 9000));
            midi.send(MidiCommand::LoadStarterMappings);

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
            app.manage(parameters);
            app.manage(source);
            app.manage(renderer);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            get_parameter_registry,
            get_parameter_state,
            set_parameter,
            set_parameter_batch,
            reset_parameters,
            clear_native_buffers,
            fire_flow_pulse,
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
            bind_osc,
            stop_osc,
            send_osc_test,
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
