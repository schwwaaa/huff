use crate::{
    audio::AudioSnapshot,
    camera::{CameraFrame, SharedCameraFrame},
    gesture::{GestureSnapshot, MAX_POINTS},
    history::{GpuHistoryRing, HISTORY_FORMAT},
    midi::MidiSnapshot,
    osc::OscSnapshot,
    parameters::{ParameterSnapshot, ParameterStore},
    source::{ActiveSource, SourceSelector},
    video::{SharedVideoFrame, VideoFrame},
};
use bytemuck::{Pod, Zeroable};
use serde::Serialize;
use std::{
    env,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{sync_channel, Receiver, SyncSender, TryRecvError},
        Arc, RwLock,
    },
    thread,
    time::{Duration, Instant},
};
use wgpu::util::DeviceExt;

const SIGNAL_COUNT: usize = 160;
const HDR_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;

#[derive(Clone)]
pub struct InputSources {
    pub camera: SharedCameraFrame,
    pub video: SharedVideoFrame,
    pub audio: Arc<RwLock<AudioSnapshot>>,
    pub midi: Arc<RwLock<MidiSnapshot>>,
    pub osc: Arc<RwLock<OscSnapshot>>,
    pub gesture: Arc<RwLock<GestureSnapshot>>,
    pub source: SourceSelector,
}

#[derive(Debug, Clone)]
pub enum RenderCommand {
    Resize(u32, u32),
    ClearFeedback,
    RecoverSurface,
    Shutdown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RendererInfo {
    pub backend: String,
    pub adapter: String,
    pub driver: String,
    pub surface_format: String,
    pub width: u32,
    pub height: u32,
    pub surface_width: u32,
    pub surface_height: u32,
    pub render_mode: String,
    pub fps: f64,
    pub frame_time_ms: f64,
    pub frame_count: u64,
    pub camera_width: u32,
    pub camera_height: u32,
    pub camera_uploads: u64,
    pub video_width: u32,
    pub video_height: u32,
    pub video_uploads: u64,
    pub audio_sequence: u64,
    pub midi_sequence: u64,
    pub osc_sequence: u64,
    pub gesture_sequence: u64,
    pub active_gesture_points: u32,
    pub base_enabled: bool,
    pub base_mix: f32,
    pub brightness: f32,
    pub contrast: f32,
    pub feedback: f32,
    pub persistence: f32,
    pub history_width: u32,
    pub history_height: u32,
    pub history_capture_rate: String,
    pub history_sampling: String,
    pub history_status: String,
    pub history_capacity: u32,
    pub history_count: u32,
    pub history_memory_bytes: u64,
    pub history_captured_frames: u64,
    pub history_rate_skips: u64,
    pub history_rebuilds: u64,
    pub history_preview_active: bool,
    pub parameter_revision: u64,
    pub active_source: String,
    pub surface_skips: u64,
    pub surface_recoveries: u64,
    pub mode: String,
    pub running: bool,
    pub last_error: String,
}

#[derive(Clone)]
pub struct RendererHandle {
    tx: SyncSender<RenderCommand>,
    info: Arc<RwLock<RendererInfo>>,
}

impl RendererHandle {
    pub fn send(&self, command: RenderCommand) {
        let _ = self.tx.try_send(command);
    }

    pub fn info(&self) -> RendererInfo {
        self.info.read().expect("renderer info poisoned").clone()
    }
}

pub fn start(
    window: tauri::Window,
    sources: InputSources,
    parameters: ParameterStore,
) -> Result<RendererHandle, String> {
    let (tx, rx) = sync_channel(128);
    let alive = Arc::new(AtomicBool::new(true));
    let mut renderer = pollster::block_on(Renderer::new(window, sources, parameters))?;
    let info = Arc::new(RwLock::new(renderer.info()));
    let thread_info = Arc::clone(&info);
    let thread_alive = Arc::clone(&alive);
    thread::Builder::new()
        .name("huff-native-wgpu-renderer".into())
        .spawn(move || renderer.run(rx, thread_info, thread_alive))
        .map_err(|error| format!("could not start renderer thread: {error}"))?;
    Ok(RendererHandle { tx, info })
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Uniforms {
    resolution_time: [f32; 4],
    source_dimensions: [f32; 4],
    source_state: [f32; 4],
    controls0: [f32; 4],
    controls1: [f32; 4],
    feedback_transform: [f32; 4],
    audio0: [f32; 4],
    input0: [f32; 4],
    network0: [f32; 4],
    history_state: [f32; 4],
    history_controls: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct GpuPoint {
    position_velocity: [f32; 4],
    pressure_age_tool_active: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct GpuGestureData {
    points: [GpuPoint; MAX_POINTS],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct GpuSignals {
    values: [f32; SIGNAL_COUNT],
}

struct SourceTexture {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    width: u32,
    height: u32,
    sequence: u64,
}

struct OffscreenTargets {
    _composite: wgpu::Texture,
    composite_view: wgpu::TextureView,
    _feedback_a: wgpu::Texture,
    feedback_a_view: wgpu::TextureView,
    _feedback_b: wgpu::Texture,
    feedback_b_view: wgpu::TextureView,
    feedback_bind_a_smooth: wgpu::BindGroup,
    feedback_bind_b_smooth: wgpu::BindGroup,
    feedback_bind_a_crisp: wgpu::BindGroup,
    feedback_bind_b_crisp: wgpu::BindGroup,
    present_bind_a: wgpu::BindGroup,
    present_bind_b: wgpu::BindGroup,
}

struct Renderer {
    window: tauri::Window,
    instance: wgpu::Instance,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    adapter_info: wgpu::AdapterInfo,

    composite_pipeline: wgpu::RenderPipeline,
    feedback_pipeline: wgpu::RenderPipeline,
    present_pipeline: wgpu::RenderPipeline,
    history_capture_pipeline: wgpu::RenderPipeline,
    uniform_buffer: wgpu::Buffer,
    gesture_buffer: wgpu::Buffer,
    signals_buffer: wgpu::Buffer,
    global_bind: wgpu::BindGroup,
    source_layout: wgpu::BindGroupLayout,
    feedback_layout: wgpu::BindGroupLayout,
    present_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    crisp_sampler: wgpu::Sampler,
    source_bind: wgpu::BindGroup,
    camera_texture: SourceTexture,
    video_texture: SourceTexture,
    targets: OffscreenTargets,
    history_capture_bind: wgpu::BindGroup,
    history: GpuHistoryRing,
    write_a: bool,

    sources: InputSources,
    parameters: ParameterStore,
    parameter_snapshot: ParameterSnapshot,
    uniforms: Uniforms,

    base_enabled: bool,
    base_mix: f32,
    background_mode: String,
    brightness: f32,
    contrast: f32,
    feedback: f32,
    persistence: f32,
    feedback_x: f32,
    feedback_y: f32,
    feedback_scale: f32,
    feedback_rotation: f32,

    surface_width: u32,
    surface_height: u32,
    render_width: u32,
    render_height: u32,
    render_mode: String,
    history_width: u32,
    history_height: u32,
    history_capture_rate: String,
    history_sampling: String,
    history_quality: f32,
    history_preview_enabled: bool,
    history_preview_depth: f32,
    history_preview_mix: f32,
    history_preview_alpha: f32,
    last_history_source: ActiveSource,

    minimized: bool,
    surface_skips: u64,
    surface_recoveries: u64,
    started: Instant,
    last_frame: Instant,
    frame_count: u64,
    measured_fps: f64,
    measured_frame_time_ms: f64,
    camera_uploads: u64,
    video_uploads: u64,
    camera_age_ms: f64,
    video_age_ms: f64,
    audio_sequence: u64,
    midi_sequence: u64,
    osc_sequence: u64,
    gesture_sequence: u64,
    active_gesture_points: u32,
    last_error: String,
}

#[derive(Debug, Clone, Copy)]
enum RenderOutcome {
    Presented,
    Recovered,
    SurfaceUnavailable,
}

impl Renderer {
    async fn new(
        window: tauri::Window,
        sources: InputSources,
        parameters: ParameterStore,
    ) -> Result<Self, String> {
        let size = window.inner_size().map_err(|error| error.to_string())?;
        let surface_width = size.width.max(1);
        let surface_height = size.height.max(1);
        let requested_backends = wgpu::Backends::from_env().unwrap_or(wgpu::Backends::PRIMARY);
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: requested_backends,
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });
        let surface = instance
            .create_surface(window.clone())
            .map_err(|error| format!("could not create GPU surface: {error}"))?;
        let adapter_filter = env::var("WGPU_ADAPTER_NAME")
            .ok()
            .map(|value| value.to_lowercase());
        let adapter = instance
            .enumerate_adapters(requested_backends)
            .await
            .into_iter()
            .find(|candidate| {
                candidate.is_surface_supported(&surface)
                    && adapter_filter
                        .as_ref()
                        .map(|filter| candidate.get_info().name.to_lowercase().contains(filter))
                        .unwrap_or(true)
            })
            .ok_or_else(|| "no compatible adapter found".to_string())?;
        let adapter_info = adapter.get_info();
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("huff native renderer device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: wgpu::MemoryHints::Performance,
                trace: wgpu::Trace::Off,
                ..Default::default()
            })
            .await
            .map_err(|error| format!("could not create GPU device: {error}"))?;

        let mut config = surface
            .get_default_config(&adapter, surface_width, surface_height)
            .ok_or_else(|| "adapter cannot produce a default surface configuration".to_string())?;
        config.present_mode = wgpu::PresentMode::Fifo;
        surface.configure(&device, &config);

        let parameter_snapshot = parameters.snapshot();
        let render_width = surface_width;
        let render_height = surface_height;
        let uniforms = Uniforms {
            resolution_time: [render_width as f32, render_height as f32, 0.0, 0.0],
            source_dimensions: [2.0, 2.0, 2.0, 2.0],
            source_state: [0.0; 4],
            controls0: [1.0, 0.6, 0.7, 1.0],
            controls1: [1.0, 1.0, 0.0, 0.0],
            feedback_transform: [1.0, 1.0, 1.0, 0.01],
            audio0: [0.0; 4],
            input0: [0.0; 4],
            network0: [0.0; 4],
            history_state: [0.0; 4],
            history_controls: [0.0; 4],
        };
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("huff native uniform buffer"),
            contents: bytemuck::bytes_of(&uniforms),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let empty_gestures = GpuGestureData {
            points: [GpuPoint::zeroed(); MAX_POINTS],
        };
        let gesture_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("huff native gesture storage"),
            contents: bytemuck::bytes_of(&empty_gestures),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        });
        let empty_signals = GpuSignals {
            values: [0.0; SIGNAL_COUNT],
        };
        let signals_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("huff native signal storage"),
            contents: bytemuck::bytes_of(&empty_signals),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        });

        let global_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("huff native global layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let global_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("huff native global bind group"),
            layout: &global_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: gesture_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: signals_buffer.as_entire_binding(),
                },
            ],
        });

        let source_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("huff native source layout"),
            entries: &[
                texture_layout_entry(0),
                texture_layout_entry(1),
                sampler_layout_entry(2),
            ],
        });
        let feedback_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("huff native feedback layout"),
                entries: &[
                    texture_layout_entry(0),
                    texture_layout_entry(1),
                    sampler_layout_entry(2),
                    history_texture_layout_entry(3),
                    sampler_layout_entry(4),
                ],
            });
        let present_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("huff native present layout"),
                entries: &[texture_layout_entry(0), sampler_layout_entry(1)],
            });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("huff native linear sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });

        let crisp_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("huff native nearest sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });

        let camera_texture = create_source_texture(
            &device,
            &queue,
            "camera source texture",
            [
                24, 28, 40, 255, 56, 66, 88, 255, 56, 66, 88, 255, 24, 28, 40, 255,
            ],
        );
        let video_texture = create_source_texture(
            &device,
            &queue,
            "video source texture",
            [
                35, 20, 48, 255, 88, 44, 70, 255, 88, 44, 70, 255, 35, 20, 48, 255,
            ],
        );
        let source_bind = create_source_bind(
            &device,
            &source_layout,
            &camera_texture.view,
            &video_texture.view,
            &sampler,
        );

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("huff native WGSL"),
            source: wgpu::ShaderSource::Wgsl(include_str!("compositor.wgsl").into()),
        });
        let composite_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("huff native composite pipeline layout"),
                bind_group_layouts: &[Some(&global_layout), Some(&source_layout), None, None],
                immediate_size: 0,
            });
        let feedback_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("huff native feedback pipeline layout"),
                bind_group_layouts: &[
                    Some(&global_layout),
                    None,
                    Some(&feedback_layout),
                ],
                immediate_size: 0,
            });
        let present_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("huff native present pipeline layout"),
                bind_group_layouts: &[Some(&global_layout), None, None, Some(&present_layout)],
                immediate_size: 0,
            });
        let history_capture_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("huff native history capture pipeline layout"),
                bind_group_layouts: &[None, None, None, Some(&present_layout)],
                immediate_size: 0,
            });

        let composite_pipeline = create_pipeline(
            &device,
            &shader,
            &composite_layout,
            "huff native composite pipeline",
            "fs_composite",
            HDR_FORMAT,
        );
        let feedback_pipeline = create_pipeline(
            &device,
            &shader,
            &feedback_pipeline_layout,
            "huff native feedback pipeline",
            "fs_feedback",
            HDR_FORMAT,
        );
        let present_pipeline = create_pipeline(
            &device,
            &shader,
            &present_pipeline_layout,
            "huff native present pipeline",
            "fs_present",
            config.format,
        );
        let history_capture_pipeline = create_pipeline(
            &device,
            &shader,
            &history_capture_pipeline_layout,
            "huff native history capture pipeline",
            "fs_history_capture",
            HISTORY_FORMAT,
        );
        let history_capacity = GpuHistoryRing::capacity_for(
            render_width,
            render_height,
            1.0,
            device.limits().max_texture_array_layers,
        );
        let history = GpuHistoryRing::new(
            &device,
            render_width,
            render_height,
            history_capacity,
            0,
        );
        let targets = create_targets(
            &device,
            render_width,
            render_height,
            &feedback_layout,
            &present_layout,
            &sampler,
            &crisp_sampler,
            history.array_view(),
        );
        let history_capture_bind = create_present_bind(
            &device,
            &present_layout,
            &targets.composite_view,
            &sampler,
            "huff history capture source bind",
        );

        let now = Instant::now();
        let mut renderer = Self {
            window,
            instance,
            surface,
            device,
            queue,
            config,
            adapter_info,
            composite_pipeline,
            feedback_pipeline,
            present_pipeline,
            history_capture_pipeline,
            uniform_buffer,
            gesture_buffer,
            signals_buffer,
            global_bind,
            source_layout,
            feedback_layout,
            present_layout,
            sampler,
            crisp_sampler,
            source_bind,
            camera_texture,
            video_texture,
            targets,
            history_capture_bind,
            history,
            write_a: true,
            sources,
            parameters,
            parameter_snapshot,
            uniforms,
            base_enabled: true,
            base_mix: 1.0,
            background_mode: "black".into(),
            brightness: 1.0,
            contrast: 1.0,
            feedback: 0.6,
            persistence: 0.7,
            feedback_x: 1.0,
            feedback_y: 1.0,
            feedback_scale: 1.0,
            feedback_rotation: 0.01,
            surface_width,
            surface_height,
            render_width,
            render_height,
            render_mode: "match".into(),
            history_width: render_width,
            history_height: render_height,
            history_capture_rate: "every".into(),
            history_sampling: "smooth".into(),
            history_quality: 1.0,
            history_preview_enabled: false,
            history_preview_depth: 0.5,
            history_preview_mix: 0.3,
            history_preview_alpha: 1.0,
            last_history_source: ActiveSource::None,
            minimized: false,
            surface_skips: 0,
            surface_recoveries: 0,
            started: now,
            last_frame: now,
            frame_count: 0,
            measured_fps: 0.0,
            measured_frame_time_ms: 0.0,
            camera_uploads: 0,
            video_uploads: 0,
            camera_age_ms: 0.0,
            video_age_ms: 0.0,
            audio_sequence: 0,
            midi_sequence: 0,
            osc_sequence: 0,
            gesture_sequence: 0,
            active_gesture_points: 0,
            last_error: String::new(),
        };
        renderer.apply_parameter_state(true);
        Ok(renderer)
    }

    fn info(&self) -> RendererInfo {
        RendererInfo {
            backend: format!("{:?}", self.adapter_info.backend),
            adapter: self.adapter_info.name.clone(),
            driver: if self.adapter_info.driver_info.is_empty() {
                self.adapter_info.driver.clone()
            } else {
                format!(
                    "{} · {}",
                    self.adapter_info.driver, self.adapter_info.driver_info
                )
            },
            surface_format: format!("{:?}", self.config.format),
            width: self.render_width,
            height: self.render_height,
            surface_width: self.surface_width,
            surface_height: self.surface_height,
            render_mode: self.render_mode.clone(),
            fps: self.measured_fps,
            frame_time_ms: self.measured_frame_time_ms,
            frame_count: self.frame_count,
            camera_width: self.camera_texture.width,
            camera_height: self.camera_texture.height,
            camera_uploads: self.camera_uploads,
            video_width: self.video_texture.width,
            video_height: self.video_texture.height,
            video_uploads: self.video_uploads,
            audio_sequence: self.audio_sequence,
            midi_sequence: self.midi_sequence,
            osc_sequence: self.osc_sequence,
            gesture_sequence: self.gesture_sequence,
            active_gesture_points: self.active_gesture_points,
            base_enabled: self.base_enabled,
            base_mix: self.base_mix,
            brightness: self.brightness,
            contrast: self.contrast,
            feedback: self.feedback,
            persistence: self.persistence,
            history_width: self.history.width,
            history_height: self.history.height,
            history_capture_rate: self.history_capture_rate.clone(),
            history_sampling: self.history_sampling.clone(),
            history_status: format!(
                "GPU temporal ring · {}/{} frames · {:.1} MiB",
                self.history.count,
                self.history.capacity,
                self.history.estimated_bytes() as f64 / (1024.0 * 1024.0),
            ),
            history_capacity: self.history.capacity,
            history_count: self.history.count,
            history_memory_bytes: self.history.estimated_bytes(),
            history_captured_frames: self.history.captured_frames,
            history_rate_skips: self.history.rate_skips,
            history_rebuilds: self.history.rebuilds,
            history_preview_active: self.history_preview_enabled,
            parameter_revision: self.parameter_snapshot.revision,
            active_source: self.sources.source.get().label().into(),
            surface_skips: self.surface_skips,
            surface_recoveries: self.surface_recoveries,
            mode: "huff-native".into(),
            running: true,
            last_error: self.last_error.clone(),
        }
    }

    fn resize_surface(&mut self, width: u32, height: u32) {
        self.minimized = width == 0 || height == 0;
        self.surface_width = width.max(1);
        self.surface_height = height.max(1);
        if self.minimized {
            return;
        }
        self.config.width = self.surface_width;
        self.config.height = self.surface_height;
        self.surface.configure(&self.device, &self.config);
        if self.render_mode == "match" {
            self.apply_parameter_state(true);
        }
    }

    fn rebuild_targets(&mut self, width: u32, height: u32) {
        let width = width.max(1);
        let height = height.max(1);
        if width == self.render_width && height == self.render_height {
            return;
        }
        self.render_width = width;
        self.render_height = height;
        self.targets = create_targets(
            &self.device,
            width,
            height,
            &self.feedback_layout,
            &self.present_layout,
            &self.sampler,
            &self.crisp_sampler,
            self.history.array_view(),
        );
        self.history_capture_bind = create_present_bind(
            &self.device,
            &self.present_layout,
            &self.targets.composite_view,
            &self.sampler,
            "huff history capture source bind",
        );
        self.write_a = true;
    }

    fn clear_feedback(&mut self) {
        self.targets = create_targets(
            &self.device,
            self.render_width,
            self.render_height,
            &self.feedback_layout,
            &self.present_layout,
            &self.sampler,
            &self.crisp_sampler,
            self.history.array_view(),
        );
        self.history_capture_bind = create_present_bind(
            &self.device,
            &self.present_layout,
            &self.targets.composite_view,
            &self.sampler,
            "huff history capture source bind",
        );
        self.history.clear();
        self.write_a = true;
    }

    fn rebuild_history_if_needed(&mut self, width: u32, height: u32, capacity: u32) {
        let width = width.max(1);
        let height = height.max(1);
        let capacity = capacity.max(1);
        if self.history.width == width
            && self.history.height == height
            && self.history.capacity == capacity
        {
            return;
        }
        let rebuilds = self.history.rebuilds.wrapping_add(1);
        self.history = GpuHistoryRing::new(
            &self.device,
            width,
            height,
            capacity,
            rebuilds,
        );
        // The temporal history texture is part of bind group 2 so Huff stays
        // within the portable four-bind-group limit (groups 0 through 3).
        // Rebuild only the offscreen bind groups/targets when the array changes.
        self.targets = create_targets(
            &self.device,
            self.render_width,
            self.render_height,
            &self.feedback_layout,
            &self.present_layout,
            &self.sampler,
            &self.crisp_sampler,
            self.history.array_view(),
        );
        self.history_capture_bind = create_present_bind(
            &self.device,
            &self.present_layout,
            &self.targets.composite_view,
            &self.sampler,
            "huff history capture source bind",
        );
        self.write_a = true;
    }

    fn apply_parameter_state(&mut self, force: bool) {
        let revision = self.parameters.revision();
        if !force && revision == self.parameter_snapshot.revision {
            return;
        }
        self.parameter_snapshot = self.parameters.snapshot();
        let snapshot = self.parameter_snapshot.clone();

        self.base_enabled = snapshot.bool_value("source.base_enabled", true);
        self.base_mix = snapshot.number("source.base_mix", 1.0).clamp(0.0, 1.0) as f32;
        self.background_mode = snapshot.text("source.background", "black").to_string();
        self.brightness = snapshot.number("color.brightness", 1.0).clamp(0.0, 2.0) as f32;
        self.contrast = snapshot.number("color.contrast", 1.0).clamp(0.0, 2.0) as f32;
        self.feedback = snapshot.number("feedback.amount", 0.6).clamp(0.0, 3.0) as f32;
        self.persistence = snapshot.number("feedback.persistence", 0.7).clamp(0.0, 10.0) as f32;
        self.feedback_x = snapshot.number("feedback.translate_x", 1.0) as f32;
        self.feedback_y = snapshot.number("feedback.translate_y", 1.0) as f32;
        self.feedback_scale = snapshot.number("feedback.scale", 1.0).clamp(0.8, 1.2) as f32;
        self.feedback_rotation = snapshot.number("feedback.rotation", 0.01) as f32;
        self.history_quality = snapshot.number("render.quality", 1.0).clamp(0.0, 3.0) as f32;
        self.history_preview_enabled = snapshot.bool_value("glitch.corrupt_on", false);
        self.history_preview_depth = snapshot.number("glitch.depth", 0.5).clamp(0.0, 0.5) as f32;
        self.history_preview_mix = snapshot.number("glitch.corrupt", 0.3).clamp(0.0, 1.0) as f32;
        self.history_preview_alpha = snapshot.number("glitch.glitch_alpha", 1.0).clamp(0.0, 1.0) as f32;

        self.render_mode = snapshot.text("render.resolution_mode", "match").to_string();
        let desired = match self.render_mode.as_str() {
            "640x360" => (640, 360),
            "960x540" => (960, 540),
            "1280x720" => (1280, 720),
            "1920x1080" => (1920, 1080),
            "custom" => (
                snapshot
                    .number("render.custom_width", 1280.0)
                    .round()
                    .clamp(160.0, 3840.0) as u32,
                snapshot
                    .number("render.custom_height", 720.0)
                    .round()
                    .clamp(160.0, 2160.0) as u32,
            ),
            _ => (self.surface_width, self.surface_height),
        };
        self.rebuild_targets(desired.0, desired.1);

        self.history_capture_rate =
            snapshot.text("history.capture_rate", "every").to_string();
        self.history_sampling = snapshot.text("history.sampling", "smooth").to_string();
        let history_resolution = snapshot.text("history.resolution", "full");
        let (history_width, history_height) = match history_resolution {
            "75" => (
                (self.render_width as f32 * 0.75).round() as u32,
                (self.render_height as f32 * 0.75).round() as u32,
            ),
            "50" => (
                (self.render_width as f32 * 0.5).round() as u32,
                (self.render_height as f32 * 0.5).round() as u32,
            ),
            "25" => (
                (self.render_width as f32 * 0.25).round() as u32,
                (self.render_height as f32 * 0.25).round() as u32,
            ),
            "custom" => (
                snapshot
                    .number("history.custom_width", 960.0)
                    .round()
                    .clamp(64.0, 3840.0) as u32,
                snapshot
                    .number("history.custom_height", 540.0)
                    .round()
                    .clamp(64.0, 2160.0) as u32,
            ),
            _ => (self.render_width, self.render_height),
        };
        self.history_width = history_width.max(1);
        self.history_height = history_height.max(1);
        let capacity = GpuHistoryRing::capacity_for(
            self.history_width,
            self.history_height,
            self.history_quality,
            self.device.limits().max_texture_array_layers,
        );
        self.rebuild_history_if_needed(self.history_width, self.history_height, capacity);
    }

    fn handle_commands(&mut self, rx: &Receiver<RenderCommand>) -> bool {
        loop {
            match rx.try_recv() {
                Ok(RenderCommand::Resize(width, height)) => self.resize_surface(width, height),
                Ok(RenderCommand::ClearFeedback) => self.clear_feedback(),
                Ok(RenderCommand::RecoverSurface) => {
                    if let Err(error) = self.recover_surface(false) {
                        self.last_error = error;
                    }
                }
                Ok(RenderCommand::Shutdown) => return false,
                Err(TryRecvError::Empty) => return true,
                Err(TryRecvError::Disconnected) => return false,
            }
        }
    }

    fn upload_camera(&mut self) {
        let latest = self
            .sources
            .camera
            .read()
            .expect("camera frame poisoned")
            .clone();
        let Some(frame) = latest else {
            self.camera_texture.sequence = 0;
            return;
        };
        if frame.sequence == self.camera_texture.sequence {
            return;
        }
        if frame.sequence < self.camera_texture.sequence {
            self.history.clear();
        }
        self.ensure_camera_texture(&frame);
        self.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &self.camera_texture.texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &frame.rgba,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(frame.width * 4),
                rows_per_image: Some(frame.height),
            },
            wgpu::Extent3d {
                width: frame.width,
                height: frame.height,
                depth_or_array_layers: 1,
            },
        );
        self.camera_texture.sequence = frame.sequence;
        self.camera_uploads = self.camera_uploads.wrapping_add(1);
        self.camera_age_ms = frame.captured_at.elapsed().as_secs_f64() * 1000.0;
    }

    fn upload_video(&mut self) {
        let latest = self
            .sources
            .video
            .read()
            .expect("video frame poisoned")
            .clone();
        let Some(frame) = latest else {
            self.video_texture.sequence = 0;
            return;
        };
        if frame.sequence == self.video_texture.sequence {
            return;
        }
        if frame.sequence < self.video_texture.sequence {
            self.history.clear();
        }
        self.ensure_video_texture(&frame);
        self.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &self.video_texture.texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &frame.bgra,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(frame.width * 4),
                rows_per_image: Some(frame.height),
            },
            wgpu::Extent3d {
                width: frame.width,
                height: frame.height,
                depth_or_array_layers: 1,
            },
        );
        self.video_texture.sequence = frame.sequence;
        self.video_uploads = self.video_uploads.wrapping_add(1);
        self.video_age_ms = frame.presented_at.elapsed().as_secs_f64() * 1000.0;
    }

    fn ensure_camera_texture(&mut self, frame: &CameraFrame) {
        if frame.width == self.camera_texture.width && frame.height == self.camera_texture.height {
            return;
        }
        self.camera_texture =
            create_empty_source_texture(&self.device, "camera source texture", frame.width, frame.height);
        self.rebuild_source_bind();
    }

    fn ensure_video_texture(&mut self, frame: &VideoFrame) {
        if frame.width == self.video_texture.width && frame.height == self.video_texture.height {
            return;
        }
        self.video_texture =
            create_empty_source_texture(&self.device, "video source texture", frame.width, frame.height);
        self.rebuild_source_bind();
    }

    fn rebuild_source_bind(&mut self) {
        self.source_bind = create_source_bind(
            &self.device,
            &self.source_layout,
            &self.camera_texture.view,
            &self.video_texture.view,
            &self.sampler,
        );
    }

    fn upload_state(&mut self, delta_seconds: f32) {
        self.apply_parameter_state(false);
        let audio = self
            .sources
            .audio
            .read()
            .expect("audio snapshot poisoned")
            .clone();
        let midi = self
            .sources
            .midi
            .read()
            .expect("MIDI snapshot poisoned")
            .clone();
        let osc = self
            .sources
            .osc
            .read()
            .expect("OSC snapshot poisoned")
            .clone();
        let gesture = self
            .sources
            .gesture
            .read()
            .expect("gesture snapshot poisoned")
            .clone();

        self.audio_sequence = audio.sequence;
        self.midi_sequence = midi.sequence;
        self.osc_sequence = osc.sequence;
        self.gesture_sequence = gesture.sequence;
        self.active_gesture_points = gesture.count;

        let active_source = self.sources.source.get();
        if active_source != self.last_history_source {
            self.history.clear();
            self.last_history_source = active_source;
        }

        let background_code = match self.background_mode.as_str() {
            "green" => 1.0,
            "blue" => 2.0,
            "white" => 3.0,
            _ => 0.0,
        };
        self.uniforms.resolution_time = [
            self.render_width as f32,
            self.render_height as f32,
            self.started.elapsed().as_secs_f32(),
            delta_seconds,
        ];
        self.uniforms.source_dimensions = [
            self.camera_texture.width as f32,
            self.camera_texture.height as f32,
            self.video_texture.width as f32,
            self.video_texture.height as f32,
        ];
        self.uniforms.source_state = [
            if self.camera_texture.sequence > 0 { 1.0 } else { 0.0 },
            if self.video_texture.sequence > 0 { 1.0 } else { 0.0 },
            background_code,
            if self.base_enabled { 1.0 } else { 0.0 },
        ];
        self.uniforms.controls0 = [
            self.base_mix,
            self.feedback.min(1.0),
            self.persistence.min(1.0),
            self.sources.source.shader_code(),
        ];
        self.uniforms.controls1 = [
            self.brightness,
            self.contrast,
            self.surface_width as f32,
            self.surface_height as f32,
        ];
        self.uniforms.feedback_transform = [
            self.feedback_x,
            self.feedback_y,
            self.feedback_scale,
            self.feedback_rotation.to_radians(),
        ];
        self.uniforms.audio0 = [audio.rms, audio.bass, audio.treble, audio.transient];
        self.uniforms.input0 = [midi.pulse, osc.pulse, gesture.count as f32, 0.0];
        self.uniforms.network0 = [
            midi.parameters[0],
            osc.parameters[0],
            midi.parameters[2],
            osc.parameters[2],
        ];
        self.uniforms.history_state = [
            self.history.newest_layer() as f32,
            self.history.count as f32,
            self.history.capacity as f32,
            self.history_quality,
        ];
        self.uniforms.history_controls = [
            if self.history_preview_enabled { 1.0 } else { 0.0 },
            self.history_preview_depth,
            self.history_preview_mix,
            self.history_preview_alpha,
        ];

        let mut gpu_gestures = GpuGestureData {
            points: [GpuPoint::zeroed(); MAX_POINTS],
        };
        for (index, point) in gesture.points.iter().enumerate() {
            gpu_gestures.points[index] = GpuPoint {
                position_velocity: [point.x, point.y, point.velocity_x, point.velocity_y],
                pressure_age_tool_active: [point.pressure, point.age, point.tool, point.active],
            };
        }
        let mut gpu_signals = GpuSignals {
            values: [0.0; SIGNAL_COUNT],
        };
        gpu_signals.values[..128].copy_from_slice(&midi.notes);
        gpu_signals.values[128..160].copy_from_slice(&osc.signals);

        self.queue
            .write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&self.uniforms));
        self.queue
            .write_buffer(&self.gesture_buffer, 0, bytemuck::bytes_of(&gpu_gestures));
        self.queue
            .write_buffer(&self.signals_buffer, 0, bytemuck::bytes_of(&gpu_signals));
    }

    fn active_source_sequence(&self) -> u64 {
        match self.sources.source.get() {
            ActiveSource::Video => self.video_texture.sequence,
            ActiveSource::Camera => self.camera_texture.sequence,
            ActiveSource::Automatic => {
                if self.camera_texture.sequence > 0 {
                    self.camera_texture.sequence
                } else {
                    self.video_texture.sequence
                }
            }
            ActiveSource::None => 0,
        }
    }

    fn render(&mut self) -> Result<RenderOutcome, String> {
        let now = Instant::now();
        let delta = now.duration_since(self.last_frame).as_secs_f64();
        self.last_frame = now;
        if delta > 0.0 {
            self.measured_fps = 1.0 / delta;
            self.measured_frame_time_ms = delta * 1000.0;
        }
        self.upload_camera();
        self.upload_video();
        self.upload_state(delta as f32);

        let (frame, reconfigure) = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame) => (frame, false),
            wgpu::CurrentSurfaceTexture::Suboptimal(frame) => (frame, true),
            wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => {
                self.surface_skips = self.surface_skips.wrapping_add(1);
                if self.surface_skips % 120 == 0 {
                    self.recover_surface(false)?;
                }
                return Ok(RenderOutcome::SurfaceUnavailable);
            }
            wgpu::CurrentSurfaceTexture::Outdated => {
                self.recover_surface(false)?;
                return Ok(RenderOutcome::Recovered);
            }
            wgpu::CurrentSurfaceTexture::Lost => {
                self.recover_surface(true)?;
                return Ok(RenderOutcome::Recovered);
            }
            wgpu::CurrentSurfaceTexture::Validation => {
                return Err("surface validation error".into())
            }
        };
        let surface_view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder =
            self.device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("huff native encoder"),
                });

        begin_fullscreen_pass(
            &mut encoder,
            "huff source pass",
            &self.targets.composite_view,
            &self.composite_pipeline,
            &self.global_bind,
            1,
            &self.source_bind,
            wgpu::Color::BLACK,
        );

        let source_sequence = self.active_source_sequence();
        if let Some(layer) = self
            .history
            .reserve_capture(source_sequence, &self.history_capture_rate, now)
        {
            begin_texture_pass(
                &mut encoder,
                "huff GPU history capture pass",
                self.history.layer_view(layer),
                &self.history_capture_pipeline,
                3,
                &self.history_capture_bind,
                wgpu::Color::BLACK,
            );
            self.uniforms.history_state = [
                self.history.newest_layer() as f32,
                self.history.count as f32,
                self.history.capacity as f32,
                self.history_quality,
            ];
            self.queue
                .write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&self.uniforms));
        }

        let use_crisp_history = self.history_sampling == "crisp";
        let (feedback_view, feedback_bind, present_bind) = if self.write_a {
            (
                &self.targets.feedback_a_view,
                if use_crisp_history {
                    &self.targets.feedback_bind_a_crisp
                } else {
                    &self.targets.feedback_bind_a_smooth
                },
                &self.targets.present_bind_a,
            )
        } else {
            (
                &self.targets.feedback_b_view,
                if use_crisp_history {
                    &self.targets.feedback_bind_b_crisp
                } else {
                    &self.targets.feedback_bind_b_smooth
                },
                &self.targets.present_bind_b,
            )
        };
        begin_feedback_pass(
            &mut encoder,
            feedback_view,
            &self.feedback_pipeline,
            &self.global_bind,
            feedback_bind,
        );
        begin_fullscreen_pass(
            &mut encoder,
            "huff presentation pass",
            &surface_view,
            &self.present_pipeline,
            &self.global_bind,
            3,
            present_bind,
            wgpu::Color::BLACK,
        );

        self.queue.submit([encoder.finish()]);
        frame.present();
        if reconfigure {
            self.surface.configure(&self.device, &self.config);
        }
        self.write_a = !self.write_a;
        self.frame_count = self.frame_count.wrapping_add(1);
        self.surface_skips = 0;
        Ok(RenderOutcome::Presented)
    }

    fn recover_surface(&mut self, recreate: bool) -> Result<(), String> {
        if self.minimized {
            return Ok(());
        }
        if recreate {
            self.surface = self
                .instance
                .create_surface(self.window.clone())
                .map_err(|error| format!("could not recreate surface: {error}"))?;
        }
        self.config.width = self.surface_width.max(1);
        self.config.height = self.surface_height.max(1);
        self.surface.configure(&self.device, &self.config);
        self.surface_recoveries = self.surface_recoveries.wrapping_add(1);
        self.last_frame = Instant::now();
        Ok(())
    }

    fn run(
        &mut self,
        rx: Receiver<RenderCommand>,
        info: Arc<RwLock<RendererInfo>>,
        alive: Arc<AtomicBool>,
    ) {
        let target_frame = Duration::from_micros(16_667);
        while alive.load(Ordering::Relaxed) {
            let iteration_started = Instant::now();
            if !self.handle_commands(&rx) {
                break;
            }
            if self.minimized {
                self.apply_parameter_state(false);
                *info.write().expect("renderer info poisoned") = self.info();
                thread::sleep(target_frame);
                continue;
            }
            match self.render() {
                Ok(RenderOutcome::Presented) => self.last_error.clear(),
                Ok(RenderOutcome::Recovered | RenderOutcome::SurfaceUnavailable) => {}
                Err(error) => {
                    self.last_error = error;
                }
            }
            *info.write().expect("renderer info poisoned") = self.info();
            let elapsed = iteration_started.elapsed();
            if elapsed < target_frame {
                thread::sleep(target_frame - elapsed);
            }
        }
        alive.store(false, Ordering::Relaxed);
    }
}

fn texture_layout_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: true },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    }
}

fn history_texture_layout_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: true },
            view_dimension: wgpu::TextureViewDimension::D2Array,
            multisampled: false,
        },
        count: None,
    }
}

fn sampler_layout_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
        count: None,
    }
}

fn create_pipeline(
    device: &wgpu::Device,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::PipelineLayout,
    label: &str,
    fragment_entry: &str,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(label),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vs_fullscreen"),
            compilation_options: Default::default(),
            buffers: &[],
        },
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some(fragment_entry),
            compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::REPLACE),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview_mask: None,
        cache: None,
    })
}

fn create_empty_source_texture(device: &wgpu::Device, label: &str, width: u32, height: u32) -> SourceTexture {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size: wgpu::Extent3d { width: width.max(1), height: height.max(1), depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Bgra8UnormSrgb,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    SourceTexture { texture, view, width: width.max(1), height: height.max(1), sequence: 0 }
}

fn create_source_texture(device: &wgpu::Device, queue: &wgpu::Queue, label: &str, pixels: [u8; 16]) -> SourceTexture {
    let source = create_empty_source_texture(device, label, 2, 2);
    queue.write_texture(
        wgpu::TexelCopyTextureInfo { texture: &source.texture, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
        &pixels,
        wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(8), rows_per_image: Some(2) },
        wgpu::Extent3d { width: 2, height: 2, depth_or_array_layers: 1 },
    );
    source
}

fn create_source_bind(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    camera: &wgpu::TextureView,
    video: &wgpu::TextureView,
    sampler: &wgpu::Sampler,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("huff native source bind group"),
        layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(camera) },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(video) },
            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(sampler) },
        ],
    })
}

fn create_present_bind(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    view: &wgpu::TextureView,
    sampler: &wgpu::Sampler,
    label: &str,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some(label),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
        ],
    })
}

fn create_hdr_texture(device: &wgpu::Device, label: &str, width: u32, height: u32) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size: wgpu::Extent3d { width: width.max(1), height: height.max(1), depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: HDR_FORMAT,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}

fn create_targets(
    device: &wgpu::Device,
    width: u32,
    height: u32,
    feedback_layout: &wgpu::BindGroupLayout,
    present_layout: &wgpu::BindGroupLayout,
    sampler: &wgpu::Sampler,
    crisp_sampler: &wgpu::Sampler,
    history_view: &wgpu::TextureView,
) -> OffscreenTargets {
    let (composite, composite_view) = create_hdr_texture(device, "huff native composite target", width, height);
    let (feedback_a, feedback_a_view) = create_hdr_texture(device, "huff native feedback A", width, height);
    let (feedback_b, feedback_b_view) = create_hdr_texture(device, "huff native feedback B", width, height);

    let create_feedback_bind = |
        label: &str,
        previous_feedback: &wgpu::TextureView,
        history_sampler: &wgpu::Sampler,
    | {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some(label),
            layout: feedback_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&composite_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(previous_feedback),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(history_view),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::Sampler(history_sampler),
                },
            ],
        })
    };
    let feedback_bind_a_smooth =
        create_feedback_bind("feedback bind A smooth history", &feedback_b_view, sampler);
    let feedback_bind_b_smooth =
        create_feedback_bind("feedback bind B smooth history", &feedback_a_view, sampler);
    let feedback_bind_a_crisp =
        create_feedback_bind("feedback bind A crisp history", &feedback_b_view, crisp_sampler);
    let feedback_bind_b_crisp =
        create_feedback_bind("feedback bind B crisp history", &feedback_a_view, crisp_sampler);
    let present_bind_a = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("present bind A"), layout: present_layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&feedback_a_view) },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(sampler) },
        ],
    });
    let present_bind_b = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("present bind B"), layout: present_layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&feedback_b_view) },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(sampler) },
        ],
    });

    OffscreenTargets {
        _composite: composite, composite_view,
        _feedback_a: feedback_a, feedback_a_view,
        _feedback_b: feedback_b, feedback_b_view,
        feedback_bind_a_smooth,
        feedback_bind_b_smooth,
        feedback_bind_a_crisp,
        feedback_bind_b_crisp,
        present_bind_a,
        present_bind_b,
    }
}

fn begin_texture_pass(
    encoder: &mut wgpu::CommandEncoder,
    label: &str,
    view: &wgpu::TextureView,
    pipeline: &wgpu::RenderPipeline,
    bind_index: u32,
    bind: &wgpu::BindGroup,
    clear: wgpu::Color,
) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some(label),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            depth_slice: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(clear),
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    pass.set_pipeline(pipeline);
    pass.set_bind_group(bind_index, bind, &[]);
    pass.draw(0..3, 0..1);
}

fn begin_feedback_pass(
    encoder: &mut wgpu::CommandEncoder,
    view: &wgpu::TextureView,
    pipeline: &wgpu::RenderPipeline,
    global_bind: &wgpu::BindGroup,
    feedback_bind: &wgpu::BindGroup,
) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("huff feedback + temporal history pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            depth_slice: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, global_bind, &[]);
    pass.set_bind_group(2, feedback_bind, &[]);
    pass.draw(0..3, 0..1);
}

fn begin_fullscreen_pass(
    encoder: &mut wgpu::CommandEncoder,
    label: &str,
    view: &wgpu::TextureView,
    pipeline: &wgpu::RenderPipeline,
    global_bind: &wgpu::BindGroup,
    second_index: u32,
    second_bind: &wgpu::BindGroup,
    clear: wgpu::Color,
) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some(label),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            depth_slice: None,
            ops: wgpu::Operations { load: wgpu::LoadOp::Clear(clear), store: wgpu::StoreOp::Store },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, global_bind, &[]);
    pass.set_bind_group(second_index, second_bind, &[]);
    pass.draw(0..3, 0..1);
}
