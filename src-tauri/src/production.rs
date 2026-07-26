use crate::{interop, AppInfo};
use serde::Serialize;
use std::{
    env,
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

pub const PRODUCTION_REPORT_SCHEMA: &str = "huff-production-report/v1";
pub const ENGINE_BUILD: &str = "HNW-21";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub family: String,
    pub app_version: String,
    pub engine_build: String,
    pub debug_build: bool,
    pub executable_path: String,
    pub expected_backend: String,
    pub requested_backend: String,
    pub requested_adapter: String,
    pub ffmpeg_version: String,
    pub ffprobe_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionCheck {
    pub id: String,
    pub category: String,
    pub label: String,
    pub status: String,
    pub summary: String,
    pub detail: String,
    pub recovery_scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionReport {
    pub schema: String,
    pub engine_build: String,
    pub generated_unix_ms: u128,
    pub overall_status: String,
    pub passed: usize,
    pub warnings: usize,
    pub failures: usize,
    pub informational: usize,
    pub platform: PlatformInfo,
    pub checks: Vec<ProductionCheck>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryReceipt {
    pub scope: String,
    pub actions: Vec<String>,
    pub warnings: Vec<String>,
}

pub fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

pub fn platform_info() -> PlatformInfo {
    let expected_backend = match env::consts::OS {
        "macos" => "Metal",
        "windows" => "Dx12",
        "linux" => "Vulkan or Gl",
        _ => "Primary",
    };
    PlatformInfo {
        os: env::consts::OS.into(),
        arch: env::consts::ARCH.into(),
        family: env::consts::FAMILY.into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        engine_build: ENGINE_BUILD.into(),
        debug_build: cfg!(debug_assertions),
        executable_path: env::current_exe()
            .map(|path| path.display().to_string())
            .unwrap_or_default(),
        expected_backend: expected_backend.into(),
        requested_backend: env::var("WGPU_BACKEND").unwrap_or_default(),
        requested_adapter: env::var("WGPU_ADAPTER_NAME").unwrap_or_default(),
        ffmpeg_version: command_first_line("ffmpeg", &["-version"]),
        ffprobe_version: command_first_line("ffprobe", &["-version"]),
    }
}

pub fn build_report(info: &AppInfo) -> ProductionReport {
    let platform = platform_info();
    let mut checks = Vec::new();

    let mut push = |id: &str,
                    category: &str,
                    label: &str,
                    status: &str,
                    summary: String,
                    detail: String,
                    recovery_scope: &str| {
        checks.push(ProductionCheck {
            id: id.into(),
            category: category.into(),
            label: label.into(),
            status: status.into(),
            summary,
            detail,
            recovery_scope: recovery_scope.into(),
        });
    };

    let backend = info.renderer.backend.to_lowercase();
    let expected_backend_ok = match platform.os.as_str() {
        "macos" => backend.contains("metal"),
        "windows" => backend.contains("dx12") || backend.contains("direct3d12"),
        "linux" => backend.contains("vulkan") || backend.contains("gl"),
        _ => true,
    };
    push(
        "gpu.backend",
        "GPU",
        "Backend selection",
        if expected_backend_ok { "pass" } else { "warning" },
        format!("{} on {}", info.renderer.backend, platform.os),
        format!(
            "Adapter: {} · Driver: {} · expected production backend: {}{}",
            info.renderer.adapter,
            info.renderer.driver,
            platform.expected_backend,
            if platform.requested_backend.is_empty() {
                String::new()
            } else {
                format!(" · WGPU_BACKEND={}", platform.requested_backend)
            }
        ),
        "surface",
    );

    push(
        "gpu.renderer",
        "GPU",
        "Renderer thread",
        if info.renderer.running { "pass" } else { "fail" },
        if info.renderer.running {
            format!("Running · {} frames", info.renderer.frame_count)
        } else {
            "Renderer is not running".into()
        },
        format!(
            "Render {}×{} · Surface {}×{} · {:.1} fps · {:.2} ms",
            info.renderer.width,
            info.renderer.height,
            info.renderer.surface_width,
            info.renderer.surface_height,
            info.renderer.fps,
            info.renderer.frame_time_ms
        ),
        "surface",
    );

    let surface_ok = info.renderer.surface_width > 0 && info.renderer.surface_height > 0;
    push(
        "gpu.surface",
        "GPU",
        "Native output surface",
        if surface_ok { "pass" } else { "fail" },
        if surface_ok {
            format!(
                "{}×{} · {}",
                info.renderer.surface_width, info.renderer.surface_height, info.renderer.surface_format
            )
        } else {
            "Surface dimensions are unavailable".into()
        },
        format!(
            "Skips: {} · recoveries: {} · last error: {}",
            info.renderer.surface_skips,
            info.renderer.surface_recoveries,
            empty_as(&info.renderer.last_error, "none")
        ),
        "surface",
    );

    let frame_status = if info.renderer.frame_count < 2 {
        "warning"
    } else if info.active_source != "none" && info.renderer.fps > 0.0 && info.renderer.fps < 10.0 {
        "warning"
    } else {
        "pass"
    };
    push(
        "gpu.frame_pacing",
        "GPU",
        "Frame progression",
        frame_status,
        format!("{:.1} fps · {} frames", info.renderer.fps, info.renderer.frame_count),
        if info.renderer.frame_count < 2 {
            "The application may still be starting, minimized, or waiting for a source.".into()
        } else {
            format!("Active source: {}", info.active_source)
        },
        "surface",
    );

    let readback_total = info
        .renderer
        .output_readbacks
        .saturating_add(info.renderer.output_readback_drops);
    let drop_ratio = if readback_total > 0 {
        info.renderer.output_readback_drops as f64 / readback_total as f64
    } else {
        0.0
    };
    let readback_status = if info.renderer.output_map_errors > 0 || drop_ratio > 0.25 {
        "warning"
    } else {
        "pass"
    };
    push(
        "gpu.readback",
        "GPU",
        "External-output readback",
        readback_status,
        format!(
            "{} complete · {} busy drops",
            info.renderer.output_readbacks, info.renderer.output_readback_drops
        ),
        format!(
            "Map errors: {} · pending slots: {} · last copy: {:.2} ms",
            info.renderer.output_map_errors,
            info.renderer.output_pending_slots,
            info.renderer.output_copy_ms
        ),
        "outputs",
    );

    let interop_report = interop::build_report(info);
    push(
        "output.interop_transport",
        "Output",
        "Platform interoperability transport",
        "info",
        format!(
            "{} · {:.1} MiB/s per transfer stage",
            interop_report.current_transport, interop_report.readback_mib_per_second
        ),
        "Milestone 21 keeps bounded CPU readback as the production fallback. The INTEROP lab documents Metal, D3D12, D3D11On12, and Vulkan candidates without enabling unsafe native texture sharing.".into(),
        "outputs",
    );

    let ffmpeg_available = info.video.ffmpeg_available
        && info.recording.ffmpeg_available
        && info.export.ffmpeg_available
        && info.offline_export.ffmpeg_available;
    push(
        "media.ffmpeg",
        "Media",
        "FFmpeg runtime",
        if ffmpeg_available { "pass" } else { "fail" },
        if ffmpeg_available {
            "Available to playback, record, and export".into()
        } else {
            "One or more FFmpeg-backed systems are unavailable".into()
        },
        format!(
            "Video: {} · recording: {} · still: {} · offline: {} · {}",
            yes_no(info.video.ffmpeg_available),
            yes_no(info.recording.ffmpeg_available),
            yes_no(info.export.ffmpeg_available),
            yes_no(info.offline_export.ffmpeg_available),
            empty_as(&platform.ffmpeg_version, "ffmpeg version unavailable")
        ),
        "source",
    );

    let encoder_output = command_output("ffmpeg", &["-hide_banner", "-encoders"]);
    let required_encoders = [
        ("libx264", "H.264"),
        ("prores_ks", "ProRes"),
        ("ffv1", "FFV1"),
        ("png", "PNG"),
        ("aac", "AAC"),
        ("pcm_s24le", "PCM 24-bit"),
        ("flac", "FLAC"),
    ];
    let missing: Vec<&str> = required_encoders
        .iter()
        .filter_map(|(encoder, label)| (!encoder_output.contains(encoder)).then_some(*label))
        .collect();
    push(
        "media.encoders",
        "Media",
        "Production encoders",
        if encoder_output.is_empty() {
            "fail"
        } else if missing.is_empty() {
            "pass"
        } else {
            "warning"
        },
        if encoder_output.is_empty() {
            "Could not inspect FFmpeg encoders".into()
        } else if missing.is_empty() {
            "H.264, ProRes, FFV1, PNG, AAC, PCM, and FLAC found".into()
        } else {
            format!("Missing or unreported: {}", missing.join(", "))
        },
        "Milestone 12 profiles depend on these encoders. Exact availability follows the FFmpeg build installed on this computer.".into(),
        "source",
    );

    let ffprobe_ok = !platform.ffprobe_version.is_empty();
    push(
        "media.ffprobe",
        "Media",
        "FFprobe runtime",
        if ffprobe_ok { "pass" } else { "fail" },
        if ffprobe_ok {
            platform.ffprobe_version.clone()
        } else {
            "ffprobe was not found".into()
        },
        "Exact source metadata and deterministic export probing require ffprobe.".into(),
        "source",
    );

    let video_status = if !info.video.loaded {
        "info"
    } else if info.video.playing && info.video.decode_fps <= 0.1 {
        "warning"
    } else if info.video.last_error.is_empty() {
        "pass"
    } else {
        "warning"
    };
    push(
        "source.video",
        "Source",
        "Video decoder",
        video_status,
        if info.video.loaded {
            format!(
                "{} · {:.1} decode fps · {:.2}/{:.2} s",
                info.video.file_name,
                info.video.decode_fps,
                info.video.position_seconds,
                info.video.duration_seconds
            )
        } else {
            "No file loaded".into()
        },
        format!(
            "Stalls: {} · watchdog recoveries: {} · decoder restarts: {} · last error: {}",
            info.video.decoder_stalls,
            info.video.watchdog_restarts,
            info.video.decoder_restarts,
            empty_as(&info.video.last_error, "none")
        ),
        "source",
    );

    let camera_status = if info.camera.permission.eq_ignore_ascii_case("denied") {
        "warning"
    } else if info.camera.streaming && info.camera.capture_fps <= 0.1 {
        "warning"
    } else if info.camera.streaming {
        "pass"
    } else {
        "info"
    };
    push(
        "source.camera",
        "Source",
        "Camera capture",
        camera_status,
        if info.camera.streaming {
            format!(
                "{} · {}×{} · {:.1} fps",
                info.camera.selected_name,
                info.camera.width,
                info.camera.height,
                info.camera.capture_fps
            )
        } else {
            format!("Idle · {} device(s) discovered", info.camera_devices.len())
        },
        format!(
            "Backend: {} · permission: {} · decode errors: {} · last error: {}",
            info.camera.backend,
            info.camera.permission,
            info.camera.decode_errors,
            empty_as(&info.camera.last_error, "none")
        ),
        "source",
    );

    let audio_status = if info.audio.video.loaded
        && info.audio.video.has_audio
        && info.audio.video.preview_enabled
        && info.audio.video.output_device.is_empty()
    {
        "warning"
    } else if !info.audio.video.last_error.is_empty() || !info.audio.microphone.last_error.is_empty() {
        "warning"
    } else {
        "pass"
    };
    push(
        "audio.runtime",
        "Audio",
        "Audio devices and preview",
        audio_status,
        format!(
            "Router: {} · video output: {} · microphone: {}",
            info.audio.router.source,
            empty_as(&info.audio.video.output_device, "not active"),
            empty_as(&info.audio.microphone.selected_device, "not selected")
        ),
        format!(
            "Video buffer: {:.0} ms · underflows: {} · microphone stream errors: {}",
            info.audio.video.buffered_ms,
            info.audio.video.output_underflows,
            info.audio.microphone.stream_errors
        ),
        "source",
    );

    let bridge_expected = match platform.os.as_str() {
        "macos" => Some(("Syphon", info.syphon.available)),
        "windows" => Some(("Spout", info.spout.available)),
        _ => None,
    };
    if let Some((bridge, available)) = bridge_expected {
        push(
            "output.platform_bridge",
            "Output",
            "Platform texture-sharing bridge",
            if available { "pass" } else { "warning" },
            format!("{} {}", bridge, if available { "available" } else { "unavailable" }),
            "Availability confirms the native bridge is present; a receiver test is still required for production verification.".into(),
            "outputs",
        );
    } else {
        push(
            "output.platform_bridge",
            "Output",
            "Platform texture-sharing bridge",
            "info",
            "Syphon and Spout are not expected on this platform".into(),
            "Use window output, recording, or another future transport on this platform.".into(),
            "",
        );
    }

    let syphon_status = if !info.syphon.active {
        "info"
    } else if !info.syphon.last_error.is_empty() || info.syphon.published_frames == 0 {
        "warning"
    } else {
        "pass"
    };
    push(
        "output.syphon",
        "Output",
        "Syphon sender",
        syphon_status,
        if info.syphon.active {
            format!("{} frames published", info.syphon.published_frames)
        } else {
            "Not active".into()
        },
        format!(
            "Available: {} · received: {} · replaced: {} · rejected: {} · last error: {}",
            yes_no(info.syphon.available),
            info.syphon.received_frames,
            info.syphon.replaced_frames,
            info.syphon.rejected_frames,
            empty_as(&info.syphon.last_error, "none")
        ),
        "outputs",
    );

    let spout_status = if !info.spout.active {
        "info"
    } else if !info.spout.worker_alive
        || !info.spout.last_error.is_empty()
        || (info.spout.initialized && info.spout.published_frames == 0)
    {
        "warning"
    } else {
        "pass"
    };
    push(
        "output.spout",
        "Output",
        "Spout sender",
        spout_status,
        if info.spout.active {
            format!(
                "{} · {} frames sent",
                if info.spout.initialized { "initialized" } else { "arming" },
                info.spout.published_frames
            )
        } else {
            "Not active".into()
        },
        format!(
            "Available: {} · worker: {} · adapter {} {} · last error: {}",
            yes_no(info.spout.available),
            yes_no(info.spout.worker_alive),
            info.spout.adapter_index,
            info.spout.adapter_name,
            empty_as(&info.spout.last_error, "none")
        ),
        "outputs",
    );

    let conflicting_jobs = info.recording.active && info.offline_export.active;
    push(
        "output.operation_lock",
        "Output",
        "Recording and export ownership",
        if conflicting_jobs { "fail" } else { "pass" },
        if conflicting_jobs {
            "Live recording and offline export are active together".into()
        } else if info.recording.active {
            "Live recording owns output submission".into()
        } else if info.offline_export.active {
            "Deterministic export owns the private graph".into()
        } else {
            "No conflicting output job".into()
        },
        format!(
            "Recording: {} · still export: {} · offline export: {}",
            yes_no(info.recording.active || info.recording.finalizing),
            yes_no(info.export.active),
            yes_no(info.offline_export.active)
        ),
        "",
    );

    let queue_status = if info.export_queue.failed_count > 0 || info.export_queue.interrupted_count > 0 {
        "warning"
    } else {
        "info"
    };
    push(
        "export.queue",
        "Export",
        "Durable export queue",
        queue_status,
        format!(
            "{} queued · {} completed · {} failed · {} interrupted",
            info.export_queue.queued_count,
            info.export_queue.completed_count,
            info.export_queue.failed_count,
            info.export_queue.interrupted_count
        ),
        "The queue remains provisional. Failed or interrupted jobs should be reviewed before an unattended production export.".into(),
        "",
    );

    let control_status = if (info.midi.connected && !info.midi.last_error.is_empty())
        || (info.osc.listening && !info.osc.last_error.is_empty())
    {
        "warning"
    } else {
        "pass"
    };
    push(
        "control.runtime",
        "Control",
        "MIDI and OSC services",
        control_status,
        format!(
            "MIDI {} · OSC {}",
            if info.midi.connected { "connected" } else { "idle" },
            if info.osc.listening { "listening" } else { "stopped" }
        ),
        format!(
            "MIDI mappings: {} · OSC mappings: {} · MIDI error: {} · OSC error: {}",
            info.midi.mappings.len(),
            info.osc.mappings.len(),
            empty_as(&info.midi.last_error, "none"),
            empty_as(&info.osc.last_error, "none")
        ),
        "",
    );

    let temp_result = writable_temp_check();
    push(
        "system.temp_write",
        "System",
        "Temporary-file access",
        if temp_result.is_ok() { "pass" } else { "fail" },
        temp_result
            .as_ref()
            .map(|path| format!("Writable at {}", path.display()))
            .unwrap_or_else(|error| error.clone()),
        "Recording and deterministic export require writable temporary storage.".into(),
        "",
    );

    push(
        "system.build",
        "System",
        "Build identity",
        "info",
        format!("{} · version {}", info.build, platform.app_version),
        format!(
            "{} build · executable: {}",
            if platform.debug_build { "debug" } else { "release" },
            empty_as(&platform.executable_path, "unknown")
        ),
        "",
    );

    drop(push);
    let passed = checks.iter().filter(|check| check.status == "pass").count();
    let warnings = checks.iter().filter(|check| check.status == "warning").count();
    let failures = checks.iter().filter(|check| check.status == "fail").count();
    let informational = checks.iter().filter(|check| check.status == "info").count();
    let overall_status = if failures > 0 {
        "fail"
    } else if warnings > 0 {
        "warning"
    } else {
        "pass"
    };

    ProductionReport {
        schema: PRODUCTION_REPORT_SCHEMA.into(),
        engine_build: ENGINE_BUILD.into(),
        generated_unix_ms: now_unix_ms(),
        overall_status: overall_status.into(),
        passed,
        warnings,
        failures,
        informational,
        platform,
        checks,
    }
}

pub fn human_report(report: &ProductionReport) -> String {
    let mut lines = vec![
        "HUFF Native Production Verification".to_string(),
        format!("Schema: {}", report.schema),
        format!("Build: {}", report.engine_build),
        format!("Overall: {}", report.overall_status.to_uppercase()),
        format!(
            "Pass: {} · Warnings: {} · Failures: {} · Info: {}",
            report.passed, report.warnings, report.failures, report.informational
        ),
        String::new(),
    ];
    for check in &report.checks {
        lines.push(format!(
            "[{}] {} / {} — {}",
            check.status.to_uppercase(),
            check.category,
            check.label,
            check.summary
        ));
        if !check.detail.is_empty() {
            lines.push(format!("    {}", check.detail));
        }
    }
    lines.join("\n")
}

fn command_first_line(program: &str, args: &[&str]) -> String {
    command_output(program, args)
        .lines()
        .next()
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn command_output(program: &str, args: &[&str]) -> String {
    let Ok(output) = Command::new(program).args(args).output() else {
        return String::new();
    };
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    if !output.stderr.is_empty() {
        text.push('\n');
        text.push_str(&String::from_utf8_lossy(&output.stderr));
    }
    text
}

fn writable_temp_check() -> Result<PathBuf, String> {
    let directory = env::temp_dir();
    let path = directory.join(format!(".huff-production-write-test-{}", now_unix_ms()));
    fs::write(&path, b"huff")
        .map_err(|error| format!("Could not write {}: {error}", path.display()))?;
    fs::remove_file(&path)
        .map_err(|error| format!("Could not remove {}: {error}", path.display()))?;
    Ok(directory)
}

fn empty_as<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.trim().is_empty() { fallback } else { value }
}

fn yes_no(value: bool) -> &'static str {
    if value { "yes" } else { "no" }
}
