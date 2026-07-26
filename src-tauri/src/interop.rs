use crate::AppInfo;
use serde::Serialize;
use std::{
    hint::black_box,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub const INTEROP_REPORT_SCHEMA: &str = "huff-interop-report/v1";
pub const ENGINE_BUILD: &str = "HNW-21";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteropPlatform {
    pub os: String,
    pub arch: String,
    pub backend: String,
    pub adapter: String,
    pub driver: String,
    pub surface_format: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteropCopyStage {
    pub id: String,
    pub label: String,
    pub domain: String,
    pub active: bool,
    pub bytes_per_frame: u64,
    pub estimated_mib_per_second: f64,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteropCandidate {
    pub id: String,
    pub label: String,
    pub platform: String,
    pub backend: String,
    pub output: String,
    pub status: String,
    pub cpu_round_trips: String,
    pub gpu_copies: String,
    pub requirements: Vec<String>,
    pub blockers: Vec<String>,
    pub risk: String,
    pub recommendation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteropReport {
    pub schema: String,
    pub engine_build: String,
    pub generated_unix_ms: u128,
    pub platform: InteropPlatform,
    pub width: u32,
    pub height: u32,
    pub bytes_per_frame: u64,
    pub reference_fps: u32,
    pub active_external_outputs: Vec<String>,
    pub current_transport: String,
    pub current_copy_path: Vec<String>,
    pub readback_mib_per_second: f64,
    pub upload_mib_per_second: f64,
    pub host_repack_mib_per_second: f64,
    pub current_path_status: String,
    pub stages: Vec<InteropCopyStage>,
    pub candidates: Vec<InteropCandidate>,
    pub recommended_next_step: String,
    pub conclusion: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteropCopyProbe {
    pub schema: String,
    pub engine_build: String,
    pub generated_unix_ms: u128,
    pub requested_width: u32,
    pub requested_height: u32,
    pub frame_bytes: u64,
    pub sampled_bytes: u64,
    pub iterations: u32,
    pub elapsed_ms: f64,
    pub throughput_mib_per_second: f64,
    pub estimated_full_frame_copy_ms: f64,
    pub estimated_60_fps_cpu_share_percent: f64,
    pub checksum: u64,
    pub note: String,
}

pub fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn frame_bytes(width: u32, height: u32) -> u64 {
    u64::from(width.max(1))
        .saturating_mul(u64::from(height.max(1)))
        .saturating_mul(4)
}

fn mib_per_second(bytes: u64, fps: u32) -> f64 {
    bytes as f64 * fps.max(1) as f64 / (1024.0 * 1024.0)
}

fn output_reference_fps(info: &AppInfo) -> u32 {
    let mut fps = 0_u32;
    if info.syphon.active {
        fps = fps.max(info.syphon.fps);
    }
    if info.spout.active {
        fps = fps.max(info.spout.fps);
    }
    if fps == 0 {
        60
    } else {
        fps
    }
}

fn current_outputs(info: &AppInfo) -> Vec<String> {
    let mut outputs = Vec::new();
    if info.syphon.active {
        outputs.push(format!("Syphon @ {} fps", info.syphon.fps));
    }
    if info.spout.active {
        outputs.push(format!(
            "Spout @ {} fps · adapter {}",
            info.spout.fps, info.spout.adapter_index
        ));
    }
    if outputs.is_empty() {
        outputs.push("No platform output active; values use a 60 fps reference".into());
    }
    outputs
}

pub fn build_report(info: &AppInfo) -> InteropReport {
    let width = info.renderer.width.max(1);
    let height = info.renderer.height.max(1);
    let bytes = frame_bytes(width, height);
    let fps = output_reference_fps(info);
    let transfer = mib_per_second(bytes, fps);
    let external_active = info.syphon.active || info.spout.active;
    let backend = info.renderer.backend.to_lowercase();
    let os = std::env::consts::OS;

    let current_path = vec![
        "Program wgpu texture → aligned MAP_READ buffer".into(),
        "Mapped padded rows → dense shared CPU RGBA frame".into(),
        "Dense CPU frame → platform-owned Syphon/Spout texture".into(),
    ];

    let stages = vec![
        InteropCopyStage {
            id: "gpu-readback".into(),
            label: "GPU → host readback".into(),
            domain: "GPU/CPU boundary".into(),
            active: external_active,
            bytes_per_frame: bytes,
            estimated_mib_per_second: transfer,
            detail: "wgpu copies Program into one of three bounded MAP_READ buffers. Busy slots drop the external-output capture rather than blocking the render thread.".into(),
        },
        InteropCopyStage {
            id: "host-repack".into(),
            label: "Mapped rows → dense RGBA".into(),
            domain: "Host memory".into(),
            active: external_active,
            bytes_per_frame: bytes,
            estimated_mib_per_second: transfer,
            detail: "The mapped buffer is repacked into one Arc-backed dense frame. Syphon and Spout share that allocation when both are eligible; the image is not duplicated per output.".into(),
        },
        InteropCopyStage {
            id: "platform-upload".into(),
            label: "Host → platform texture upload".into(),
            domain: "CPU/GPU boundary".into(),
            active: external_active,
            bytes_per_frame: bytes,
            estimated_mib_per_second: transfer,
            detail: "Syphon uses replaceRegion into a Metal texture. Spout uses the bridge image-upload path. This stage is the primary target for a lower-copy platform implementation.".into(),
        },
    ];

    let metal_ready = os == "macos" && backend.contains("metal") && info.syphon.available;
    let dx12_ready = os == "windows"
        && (backend.contains("dx12") || backend.contains("direct3d12"))
        && info.spout.available;
    let vulkan_ready = backend.contains("vulkan");

    let candidates = vec![
        InteropCandidate {
            id: "metal-direct-syphon".into(),
            label: "Direct Metal texture publication".into(),
            platform: "macOS".into(),
            backend: "Metal".into(),
            output: "SyphonMetalServer".into(),
            status: if metal_ready { "candidate" } else { "not-applicable" }.into(),
            cpu_round_trips: "0 target".into(),
            gpu_copies: "0 target; 1 acceptable fallback".into(),
            requirements: vec![
                "Feature-gated access to the native Metal texture behind the wgpu resource".into(),
                "Explicit GPU completion synchronization before Syphon publication".into(),
                "Device identity verification between wgpu and Syphon".into(),
                "Stable RGBA/BGRA format and color-orientation contract".into(),
            ],
            blockers: vec![
                "wgpu intentionally hides backend handles in its portable public API".into(),
                "Unsafe backend access couples the build to wgpu-hal and exact wgpu versions".into(),
                "Publishing a texture before its command buffer completes can expose partial frames".into(),
            ],
            risk: "medium-high".into(),
            recommendation: "Build only as an opt-in proof of concept that automatically falls back to bounded readback on any handle, device, format, or synchronization mismatch.".into(),
        },
        InteropCandidate {
            id: "metal-iosurface-bridge".into(),
            label: "IOSurface-backed Metal bridge texture".into(),
            platform: "macOS".into(),
            backend: "Metal".into(),
            output: "Syphon".into(),
            status: if metal_ready { "secondary-candidate" } else { "not-applicable" }.into(),
            cpu_round_trips: "0 target".into(),
            gpu_copies: "1 likely".into(),
            requirements: vec![
                "Create a Syphon-compatible IOSurface-backed Metal texture".into(),
                "Encode a GPU texture-to-texture copy from Program".into(),
                "Fence publication after the copy completes".into(),
            ],
            blockers: vec![
                "Still backend-specific and synchronization-sensitive".into(),
                "Adds one dedicated output texture and GPU copy per published frame".into(),
            ],
            risk: "medium".into(),
            recommendation: "Prefer this over raw texture aliasing if direct publication proves fragile; it removes CPU traffic while retaining a clear ownership boundary.".into(),
        },
        InteropCandidate {
            id: "d3d12-shared-handle-spout".into(),
            label: "D3D12 shared-handle publication".into(),
            platform: "Windows".into(),
            backend: "Direct3D 12".into(),
            output: "Spout bridge".into(),
            status: if dx12_ready { "candidate" } else { "not-applicable" }.into(),
            cpu_round_trips: "0 target".into(),
            gpu_copies: "0-1 target".into(),
            requirements: vec![
                "Extend the native Spout bridge to accept a shared texture handle rather than pixels".into(),
                "Guarantee that wgpu and the bridge use the same physical adapter".into(),
                "Share or translate fences across D3D12 and the receiver-facing API".into(),
                "Define DXGI format, row orientation, and lifetime ownership".into(),
            ],
            blockers: vec![
                "Spout receiver ecosystems may expect D3D11-facing resources".into(),
                "Multi-GPU systems make adapter and handle compatibility non-negotiable".into(),
                "Raw D3D12 handle access is wgpu-version-sensitive".into(),
            ],
            risk: "high".into(),
            recommendation: "Prototype on one known adapter with receiver verification, then add adapter-mismatch rejection and automatic readback fallback before broader use.".into(),
        },
        InteropCandidate {
            id: "d3d11on12-spout".into(),
            label: "D3D11On12 compatibility bridge".into(),
            platform: "Windows".into(),
            backend: "Direct3D 12 → Direct3D 11".into(),
            output: "Spout".into(),
            status: if dx12_ready { "secondary-candidate" } else { "not-applicable" }.into(),
            cpu_round_trips: "0 target".into(),
            gpu_copies: "0-1 target".into(),
            requirements: vec![
                "Wrap or copy the D3D12 Program texture into a D3D11-visible resource".into(),
                "Correct acquire/release and queue synchronization".into(),
                "Same-adapter validation".into(),
            ],
            blockers: vec![
                "Adds another graphics API ownership layer".into(),
                "Incorrect wrapped-resource transitions can deadlock or corrupt output".into(),
            ],
            risk: "medium-high".into(),
            recommendation: "Use only if receiver compatibility makes a native D3D12 path impractical; keep the bridge isolated from HUFF's render graph.".into(),
        },
        InteropCandidate {
            id: "vulkan-external-memory".into(),
            label: "Vulkan external-memory export".into(),
            platform: "Linux / Vulkan environments".into(),
            backend: "Vulkan".into(),
            output: "Consumer-specific".into(),
            status: if vulkan_ready { "research-only" } else { "not-applicable" }.into(),
            cpu_round_trips: "0 target".into(),
            gpu_copies: "0-1 target".into(),
            requirements: vec![
                "A named consumer protocol that accepts exported memory and semaphore handles".into(),
                "Compatible external-memory and external-semaphore extensions".into(),
                "Format and modifier negotiation".into(),
            ],
            blockers: vec![
                "There is no single Syphon/Spout-equivalent consumer contract across Linux applications".into(),
                "DMA-BUF and modifier support varies by driver, compositor, and receiver".into(),
            ],
            risk: "high".into(),
            recommendation: "Do not add a generic Vulkan sharing layer until a real target receiver and protocol are selected.".into(),
        },
    ];

    let recommended_next_step = match os {
        "macos" if metal_ready => "Prototype an opt-in IOSurface or direct-Metal Syphon path behind a compile-time feature, compare frame identity and latency against the current readback path, and preserve automatic fallback.".into(),
        "windows" if dx12_ready => "Extend the Spout bridge with a shared-handle experiment on one adapter, add fence and adapter verification, then compare it with the current SendImage path.".into(),
        _ => "Keep the bounded readback path authoritative. Select a concrete platform output and receiver before implementing a native-sharing proof of concept.".into(),
    };

    InteropReport {
        schema: INTEROP_REPORT_SCHEMA.into(),
        engine_build: ENGINE_BUILD.into(),
        generated_unix_ms: now_unix_ms(),
        platform: InteropPlatform {
            os: os.into(),
            arch: std::env::consts::ARCH.into(),
            backend: info.renderer.backend.clone(),
            adapter: info.renderer.adapter.clone(),
            driver: info.renderer.driver.clone(),
            surface_format: info.renderer.surface_format.clone(),
        },
        width,
        height,
        bytes_per_frame: bytes,
        reference_fps: fps,
        active_external_outputs: current_outputs(info),
        current_transport: "cpu-readback-upload".into(),
        current_copy_path: current_path,
        readback_mib_per_second: transfer,
        upload_mib_per_second: transfer,
        host_repack_mib_per_second: transfer,
        current_path_status: if info.renderer.output_map_errors > 0 {
            "degraded"
        } else if external_active {
            "active-safe-fallback"
        } else {
            "idle-safe-fallback"
        }
        .into(),
        stages,
        candidates,
        recommended_next_step,
        conclusion: "Milestone 21 does not silently enable unsafe zero-copy output. It makes the current copies measurable, creates a typed external-output transport seam, documents platform candidates, and preserves bounded CPU readback as the production fallback.".into(),
    }
}

pub fn run_copy_probe(width: u32, height: u32) -> InteropCopyProbe {
    let full_frame_bytes = frame_bytes(width, height);
    let maximum_sample = 64_u64 * 1024 * 1024;
    let sampled_bytes = full_frame_bytes.min(maximum_sample).max(4);
    let sampled_len = sampled_bytes as usize;
    let target_total = 512_u64 * 1024 * 1024;
    let iterations = (target_total / sampled_bytes).clamp(4, 128) as u32;

    let mut source = vec![0_u8; sampled_len];
    for (index, byte) in source.iter_mut().enumerate() {
        *byte = ((index as u64).wrapping_mul(31).wrapping_add(17) & 0xff) as u8;
    }
    let mut destination = vec![0_u8; sampled_len];

    let started = Instant::now();
    let mut checksum = 0_u64;
    for iteration in 0..iterations {
        destination.copy_from_slice(&source);
        let sample_index = (iteration as usize * 4099) % sampled_len;
        checksum = checksum.wrapping_add(u64::from(destination[sample_index]));
        black_box(&destination);
    }
    let elapsed = started.elapsed().max(Duration::from_nanos(1));
    let total_bytes = sampled_bytes.saturating_mul(u64::from(iterations));
    let throughput = total_bytes as f64 / elapsed.as_secs_f64() / (1024.0 * 1024.0);
    let full_copy_ms = if throughput > 0.0 {
        full_frame_bytes as f64 / (throughput * 1024.0 * 1024.0) * 1000.0
    } else {
        0.0
    };

    InteropCopyProbe {
        schema: "huff-interop-copy-probe/v1".into(),
        engine_build: ENGINE_BUILD.into(),
        generated_unix_ms: now_unix_ms(),
        requested_width: width,
        requested_height: height,
        frame_bytes: full_frame_bytes,
        sampled_bytes,
        iterations,
        elapsed_ms: elapsed.as_secs_f64() * 1000.0,
        throughput_mib_per_second: throughput,
        estimated_full_frame_copy_ms: full_copy_ms,
        estimated_60_fps_cpu_share_percent: (full_copy_ms * 60.0 / 1000.0 * 100.0).min(10_000.0),
        checksum,
        note: "This is a bounded host-memory memcpy probe only. It does not measure GPU readback, map latency, Metal/DX upload, driver synchronization, or receiver latency.".into(),
    }
}

pub fn human_report(report: &InteropReport) -> String {
    let mut lines = Vec::new();
    lines.push(format!("HUFF lower-copy interoperability report · {}", report.engine_build));
    lines.push(format!("Schema: {}", report.schema));
    lines.push(format!(
        "Platform: {} / {} · backend {} · adapter {}",
        report.platform.os, report.platform.arch, report.platform.backend, report.platform.adapter
    ));
    lines.push(format!(
        "Reference image: {}×{} · {} bytes/frame · {} fps",
        report.width, report.height, report.bytes_per_frame, report.reference_fps
    ));
    lines.push(format!("Current transport: {} ({})", report.current_transport, report.current_path_status));
    lines.push(String::new());
    lines.push("Current copy path:".into());
    for stage in &report.current_copy_path {
        lines.push(format!("  - {stage}"));
    }
    lines.push(String::new());
    lines.push(format!(
        "Estimated per-stage traffic: {:.1} MiB/s at the reference rate",
        report.readback_mib_per_second
    ));
    lines.push(String::new());
    lines.push("Candidate paths:".into());
    for candidate in &report.candidates {
        lines.push(format!(
            "  - {} [{}] · CPU round trips {} · GPU copies {}",
            candidate.label, candidate.status, candidate.cpu_round_trips, candidate.gpu_copies
        ));
        lines.push(format!("    Recommendation: {}", candidate.recommendation));
    }
    lines.push(String::new());
    lines.push(format!("Next step: {}", report.recommended_next_step));
    lines.push(String::new());
    lines.push(report.conclusion.clone());
    lines.join("\n")
}
