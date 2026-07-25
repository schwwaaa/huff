use crate::{
    audio::AudioSnapshot,
    camera::{CameraFrame, SharedCameraFrame},
    export::{ExportHandle, StillExportConfig, StillExportMetadata},
    gesture::{GestureSnapshot, MAX_POINTS},
    history::{GpuHistoryRing, HISTORY_FORMAT},
    midi::MidiSnapshot,
    osc::OscSnapshot,
    output_frame::OutputFrame,
    parameters::{ParameterSnapshot, ParameterStore},
    recording::RecordingHandle,
    source::{ActiveSource, SourceSelector},
    video::{SharedVideoFrame, VideoFrame},
    spout, syphon,
};
use bytemuck::{Pod, Zeroable};
use serde::Serialize;
use std::{
    collections::HashMap,
    env,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{channel, sync_channel, Receiver, Sender, SyncSender, TryRecvError},
        Arc, RwLock,
    },
    thread,
    time::{Duration, Instant},
};
use wgpu::util::DeviceExt;

const SIGNAL_COUNT: usize = 160;
const MAX_GLITCH_INSTANCES: usize = 32_768;
const MAX_SCAN_BANDS: usize = 128;
const HDR_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;
const OUTPUT_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8UnormSrgb;
const OUTPUT_READBACK_SLOTS: usize = 3;
const OUTPUT_BYTES_PER_PIXEL: u32 = 4;

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
    FireFlowPulse,
    CaptureStill {
        config: StillExportConfig,
        metadata: StillExportMetadata,
        reply: SyncSender<Result<(), String>>,
    },
    StartSyphon {
        fps: u32,
        reply: SyncSender<Result<(), String>>,
    },
    StopSyphon,
    StartSpout {
        fps: u32,
        adapter_index: i32,
        reply: SyncSender<Result<(), String>>,
    },
    StopSpout,
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
    pub glitch_enabled: bool,
    pub glitch_base_tiles: u32,
    pub glitch_instances: u32,
    pub glitch_instance_capacity: u32,
    pub glitch_generation_ms: f64,
    pub glitch_dropped_instances: u64,
    pub scanlines_enabled: bool,
    pub scan_band_count: u32,
    pub scan_generation_ms: f64,
    pub scan_angle: f32,
    pub layer_priority: String,
    pub smoosh_enabled: bool,
    pub smoosh_blend: String,
    pub luma_key_enabled: bool,
    pub global_mix_enabled: bool,
    pub global_mix_position: String,
    pub flow_enabled: bool,
    pub flow_target: String,
    pub flow_strength: f32,
    pub flow_pulse_fires: u64,
    pub cluster_tiles_enabled: bool,
    pub cluster_centers_active: u32,
    pub cluster_bias_tiles: u32,
    pub cluster_rerolled_offsets: u32,
    pub cluster_pulses: u64,
    pub parameter_revision: u64,
    pub active_source: String,
    pub surface_skips: u64,
    pub surface_recoveries: u64,
    pub output_readbacks: u64,
    pub output_readback_drops: u64,
    pub output_map_errors: u64,
    pub output_copy_ms: f64,
    pub output_pending_slots: u32,
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

    pub fn capture_still(
        &self,
        config: StillExportConfig,
        metadata: StillExportMetadata,
    ) -> Result<(), String> {
        let (reply_tx, reply_rx) = sync_channel(1);
        self.tx
            .send(RenderCommand::CaptureStill {
                config,
                metadata,
                reply: reply_tx,
            })
            .map_err(|_| "renderer command channel is unavailable".to_string())?;
        reply_rx
            .recv_timeout(Duration::from_secs(4))
            .map_err(|_| "timed out queuing still export".to_string())?
    }

    pub fn start_syphon(&self, fps: u32) -> Result<(), String> {
        let (reply_tx, reply_rx) = sync_channel(1);
        self.tx
            .send(RenderCommand::StartSyphon {
                fps: fps.clamp(1, 60),
                reply: reply_tx,
            })
            .map_err(|_| "renderer command channel is unavailable".to_string())?;
        reply_rx
            .recv_timeout(Duration::from_secs(4))
            .map_err(|_| "timed out starting Syphon output".to_string())?
    }

    pub fn stop_syphon(&self) {
        self.send(RenderCommand::StopSyphon);
    }

    pub fn start_spout(&self, fps: u32, adapter_index: i32) -> Result<(), String> {
        let (reply_tx, reply_rx) = sync_channel(1);
        self.tx
            .send(RenderCommand::StartSpout {
                fps: fps.clamp(1, 60),
                adapter_index,
                reply: reply_tx,
            })
            .map_err(|_| "renderer command channel is unavailable".to_string())?;
        reply_rx
            .recv_timeout(Duration::from_secs(4))
            .map_err(|_| "timed out starting Spout output".to_string())?
    }

    pub fn stop_spout(&self) {
        self.send(RenderCommand::StopSpout);
    }
}

pub fn start(
    window: tauri::Window,
    sources: InputSources,
    parameters: ParameterStore,
    recording: RecordingHandle,
    export: ExportHandle,
) -> Result<RendererHandle, String> {
    let (tx, rx) = sync_channel(128);
    let alive = Arc::new(AtomicBool::new(true));
    let mut renderer = pollster::block_on(Renderer::new(window, sources, parameters, recording, export))?;
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
    effect_state: [f32; 4],
    scan_transform: [f32; 4],
    scan_dimensions: [f32; 4],
    smoosh_state: [f32; 4],
    luma_state: [f32; 4],
    global_mix_state: [f32; 4],
    flow_state0: [f32; 4],
    flow_state1: [f32; 4],
    flow_state2: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ExportUniforms {
    source_size: [f32; 2],
    target_size: [f32; 2],
    fit_mode: [f32; 4],
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

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct GpuGlitchTile {
    dest_rect: [f32; 4],
    source_rect: [f32; 4],
    layer_alpha: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct GpuScanBand {
    dest_rect: [f32; 4],
    source_rect: [f32; 4],
    alpha_pad: [f32; 4],
}

#[derive(Clone, Copy)]
struct ClusterTileOffset {
    angle: f64,
    radius_norm: f64,
}

struct ClusterCenter {
    x: f64,
    y: f64,
    velocity_x: f64,
    velocity_y: f64,
    noise_offset_x: f64,
    noise_offset_y: f64,
    speed_multiplier: f64,
    tiles: Vec<ClusterTileOffset>,
}

struct SpatialGapGrid {
    gap: f64,
    gap_squared: f64,
    grid_width: i64,
    cells: HashMap<i64, Vec<[f64; 2]>>,
}

impl SpatialGapGrid {
    fn new(width: f64, gap: f64) -> Self {
        Self {
            gap,
            gap_squared: gap * gap,
            grid_width: (width / gap).ceil() as i64 + 2,
            cells: HashMap::new(),
        }
    }

    fn accept(&mut self, x: f64, y: f64) -> bool {
        let grid_x = (x / self.gap).floor() as i64;
        let grid_y = (y / self.gap).floor() as i64;
        for delta_y in -1_i64..=1 {
            for delta_x in -1_i64..=1 {
                let key = (grid_y + delta_y) * self.grid_width + (grid_x + delta_x);
                if let Some(points) = self.cells.get(&key) {
                    for point in points {
                        let dx = x - point[0];
                        let dy = y - point[1];
                        if dx * dx + dy * dy < self.gap_squared {
                            return false;
                        }
                    }
                }
            }
        }
        let key = grid_y * self.grid_width + grid_x;
        self.cells.entry(key).or_default().push([x, y]);
        true
    }
}

fn try_add_glitch_target(
    targets: &mut Vec<[f64; 2]>,
    grid: &mut Option<SpatialGapGrid>,
    x: f64,
    y: f64,
) -> bool {
    if let Some(grid) = grid {
        if !grid.accept(x, y) {
            return false;
        }
    }
    targets.push([x, y]);
    true
}

// p5.js uses the Numerical Recipes LCG for randomSeed()/random().  Huff's
// original glitch engine re-seeds it once per draw with baseSeed + frameCount.
// Keeping this sequence is important: PIXEL SIZE/CORRUPT produce a fresh but
// deterministic grid selection each rendered frame rather than a set of
// continuously animated generic rectangles.
struct P5Random {
    state: u32,
}

impl P5Random {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    fn next(&mut self) -> f64 {
        self.state = self
            .state
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        self.state as f64 / 4_294_967_296.0
    }
}

const PERLIN_SIZE: usize = 4095;
const PERLIN_YWRAPB: usize = 4;
const PERLIN_YWRAP: usize = 1 << PERLIN_YWRAPB;
const PERLIN_ZWRAPB: usize = 8;
const PERLIN_ZWRAP: usize = 1 << PERLIN_ZWRAPB;

struct P5Noise {
    // p5.js performs noise math in JavaScript Number (IEEE-754 f64). Keeping
    // the table and phases in f64 prevents long-running SPEED drift.
    values: Vec<f64>,
}

impl P5Noise {
    fn new(seed: u32) -> Self {
        let mut random = P5Random::new(seed);
        let mut values = Vec::with_capacity(PERLIN_SIZE + 1);
        for _ in 0..=PERLIN_SIZE {
            values.push(random.next());
        }
        Self { values }
    }

    fn sample(&self, mut x: f64, mut y: f64, mut z: f64) -> f64 {
        x = x.abs();
        y = y.abs();
        z = z.abs();
        let mut xi = x.floor() as usize;
        let mut yi = y.floor() as usize;
        let mut zi = z.floor() as usize;
        let mut xf = x - xi as f64;
        let mut yf = y - yi as f64;
        let mut zf = z - zi as f64;
        let mut result = 0.0;
        let mut amplitude = 0.5_f64;

        for _ in 0..4 {
            let mut offset = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);
            let rxf = 0.5 * (1.0 - (xf * std::f64::consts::PI).cos());
            let ryf = 0.5 * (1.0 - (yf * std::f64::consts::PI).cos());

            let mut n1 = self.values[offset & PERLIN_SIZE];
            n1 += rxf * (self.values[(offset + 1) & PERLIN_SIZE] - n1);
            let mut n2 = self.values[(offset + PERLIN_YWRAP) & PERLIN_SIZE];
            n2 += rxf
                * (self.values[(offset + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
            n1 += ryf * (n2 - n1);

            offset += PERLIN_ZWRAP;
            n2 = self.values[offset & PERLIN_SIZE];
            n2 += rxf * (self.values[(offset + 1) & PERLIN_SIZE] - n2);
            let mut n3 = self.values[(offset + PERLIN_YWRAP) & PERLIN_SIZE];
            n3 += rxf
                * (self.values[(offset + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
            n2 += ryf * (n3 - n2);
            let rzf = 0.5 * (1.0 - (zf * std::f64::consts::PI).cos());
            n1 += rzf * (n2 - n1);
            result += n1 * amplitude;
            amplitude *= 0.5;

            xi <<= 1;
            xf *= 2.0;
            yi <<= 1;
            yf *= 2.0;
            zi <<= 1;
            zf *= 2.0;
            if xf >= 1.0 {
                xi += 1;
                xf -= 1.0;
            }
            if yf >= 1.0 {
                yi += 1;
                yf -= 1.0;
            }
            if zf >= 1.0 {
                zi += 1;
                zf -= 1.0;
            }
        }
        result
    }

    fn sample1(&self, x: f64) -> f64 {
        self.sample(x, 0.0, 0.0)
    }

    fn sample2(&self, x: f64, y: f64) -> f64 {
        self.sample(x, y, 0.0)
    }
}


struct SourceTexture {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    width: u32,
    height: u32,
    sequence: u64,
}

const OUTPUT_TARGET_SYPHON: u8 = 0b01;
const OUTPUT_TARGET_SPOUT: u8 = 0b10;
const OUTPUT_TARGET_RECORDING: u8 = 0b100;

enum ReadbackSlotState {
    Idle,
    Mapping {
        generation: u64,
        targets: u8,
        width: u32,
        height: u32,
        padded_bytes_per_row: u32,
        started: Instant,
    },
}

struct ReadbackSlot {
    buffer: wgpu::Buffer,
    state: ReadbackSlotState,
}

struct OutputReadback {
    slots: Vec<ReadbackSlot>,
    completion_tx: Sender<(u64, usize, Result<(), String>)>,
    completion_rx: Receiver<(u64, usize, Result<(), String>)>,
    generation: u64,
    next_slot: usize,
    width: u32,
    height: u32,
    padded_bytes_per_row: u32,
    readbacks: u64,
    dropped: u64,
    map_errors: u64,
    last_copy_ms: f64,
}

impl OutputReadback {
    fn new(device: &wgpu::Device, width: u32, height: u32) -> Self {
        let (completion_tx, completion_rx) = channel();
        let mut readback = Self {
            slots: Vec::new(),
            completion_tx,
            completion_rx,
            generation: 0,
            next_slot: 0,
            width: 0,
            height: 0,
            padded_bytes_per_row: 0,
            readbacks: 0,
            dropped: 0,
            map_errors: 0,
            last_copy_ms: 0.0,
        };
        readback.rebuild(device, width, height);
        readback
    }

    fn rebuild(&mut self, device: &wgpu::Device, width: u32, height: u32) {
        self.generation = self.generation.wrapping_add(1);
        self.width = width.max(1);
        self.height = height.max(1);
        let dense_bytes_per_row = self.width.saturating_mul(OUTPUT_BYTES_PER_PIXEL);
        self.padded_bytes_per_row = align_copy_bytes_per_row(dense_bytes_per_row);
        let size = u64::from(self.padded_bytes_per_row)
            .saturating_mul(u64::from(self.height));
        self.slots = (0..OUTPUT_READBACK_SLOTS)
            .map(|index| ReadbackSlot {
                buffer: device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some(match index {
                        0 => "huff native output readback A",
                        1 => "huff native output readback B",
                        _ => "huff native output readback C",
                    }),
                    size: size.max(4),
                    usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
                    mapped_at_creation: false,
                }),
                state: ReadbackSlotState::Idle,
            })
            .collect();
        self.next_slot = 0;
    }

    fn encode_copy(
        &mut self,
        encoder: &mut wgpu::CommandEncoder,
        texture: &wgpu::Texture,
        targets: u8,
        started: Instant,
    ) -> Option<usize> {
        if targets == 0 || self.slots.is_empty() {
            return None;
        }
        let slot_count = self.slots.len();
        let mut selected = None;
        for offset in 0..slot_count {
            let index = (self.next_slot + offset) % slot_count;
            if matches!(self.slots[index].state, ReadbackSlotState::Idle) {
                selected = Some(index);
                break;
            }
        }
        let Some(index) = selected else {
            self.dropped = self.dropped.wrapping_add(1);
            return None;
        };
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &self.slots[index].buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(self.padded_bytes_per_row),
                    rows_per_image: Some(self.height),
                },
            },
            wgpu::Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
        );
        self.slots[index].state = ReadbackSlotState::Mapping {
            generation: self.generation,
            targets,
            width: self.width,
            height: self.height,
            padded_bytes_per_row: self.padded_bytes_per_row,
            started,
        };
        self.next_slot = (index + 1) % slot_count;
        Some(index)
    }

    fn begin_mapping(&self, index: usize) {
        let generation = self.generation;
        let tx = self.completion_tx.clone();
        self.slots[index]
            .buffer
            .slice(..)
            .map_async(wgpu::MapMode::Read, move |result| {
                let _ = tx.send((
                    generation,
                    index,
                    result.map_err(|error| error.to_string()),
                ));
            });
    }

    fn process_completions(&mut self, recording: &RecordingHandle) {
        while let Ok((generation, index, result)) = self.completion_rx.try_recv() {
            if generation != self.generation || index >= self.slots.len() {
                continue;
            }
            let state = std::mem::replace(
                &mut self.slots[index].state,
                ReadbackSlotState::Idle,
            );
            let ReadbackSlotState::Mapping {
                generation: slot_generation,
                targets,
                width,
                height,
                padded_bytes_per_row,
                started,
            } = state
            else {
                continue;
            };
            if slot_generation != generation {
                continue;
            }
            if let Err(error) = result {
                self.map_errors = self.map_errors.wrapping_add(1);
                eprintln!("[native-output] readback map failed: {error}");
                continue;
            }
            let slice = self.slots[index].buffer.slice(..);
            let mapped = slice.get_mapped_range();
            let dense_bytes_per_row = width as usize * OUTPUT_BYTES_PER_PIXEL as usize;
            let mut pixels = vec![0_u8; dense_bytes_per_row * height as usize];
            for row in 0..height as usize {
                let source_start = row * padded_bytes_per_row as usize;
                let source_end = source_start + dense_bytes_per_row;
                let destination_start = row * dense_bytes_per_row;
                let destination_end = destination_start + dense_bytes_per_row;
                pixels[destination_start..destination_end]
                    .copy_from_slice(&mapped[source_start..source_end]);
            }
            drop(mapped);
            self.slots[index].buffer.unmap();
            self.last_copy_ms = started.elapsed().as_secs_f64() * 1000.0;
            self.readbacks = self.readbacks.wrapping_add(1);
            let frame = OutputFrame::new(width, height, pixels);
            if targets & OUTPUT_TARGET_SYPHON != 0 {
                syphon::submit(frame.clone());
            }
            if targets & OUTPUT_TARGET_SPOUT != 0 {
                spout::submit(frame.clone());
            }
            if targets & OUTPUT_TARGET_RECORDING != 0 {
                recording.submit_video(frame);
            }
        }
    }

    fn pending_slots(&self) -> u32 {
        self.slots
            .iter()
            .filter(|slot| !matches!(slot.state, ReadbackSlotState::Idle))
            .count() as u32
    }
}

struct PendingStillCapture {
    config: StillExportConfig,
    metadata: StillExportMetadata,
    started_at: Instant,
}

struct StillCaptureInFlight {
    generation: u64,
    config: StillExportConfig,
    metadata: StillExportMetadata,
    started_at: Instant,
    padded_bytes_per_row: u32,
    buffer: wgpu::Buffer,
    _texture: wgpu::Texture,
    _view: wgpu::TextureView,
    _uniform_buffer: wgpu::Buffer,
    _uniform_bind: wgpu::BindGroup,
    _source_bind: wgpu::BindGroup,
}

struct StillCapture {
    pending: Option<PendingStillCapture>,
    in_flight: Option<StillCaptureInFlight>,
    completion_tx: Sender<(u64, Result<(), String>)>,
    completion_rx: Receiver<(u64, Result<(), String>)>,
    generation: u64,
}

impl StillCapture {
    fn new() -> Self {
        let (completion_tx, completion_rx) = channel();
        Self {
            pending: None,
            in_flight: None,
            completion_tx,
            completion_rx,
            generation: 0,
        }
    }

    fn queue(
        &mut self,
        config: StillExportConfig,
        metadata: StillExportMetadata,
    ) -> Result<(), String> {
        if self.pending.is_some() || self.in_flight.is_some() {
            return Err("another GPU still capture is already pending".into());
        }
        self.pending = Some(PendingStillCapture {
            config,
            metadata,
            started_at: Instant::now(),
        });
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn encode_pending(
        &mut self,
        device: &wgpu::Device,
        encoder: &mut wgpu::CommandEncoder,
        pipeline: &wgpu::RenderPipeline,
        uniform_layout: &wgpu::BindGroupLayout,
        source_layout: &wgpu::BindGroupLayout,
        smooth_sampler: &wgpu::Sampler,
        crisp_sampler: &wgpu::Sampler,
        source_view: &wgpu::TextureView,
    ) -> bool {
        if self.in_flight.is_some() {
            return false;
        }
        let Some(request) = self.pending.take() else {
            return false;
        };
        self.generation = self.generation.wrapping_add(1);
        let generation = self.generation;
        let width = request.config.width.max(1);
        let height = request.config.height.max(1);
        let uniforms = ExportUniforms {
            source_size: [
                request.config.source_width.max(1) as f32,
                request.config.source_height.max(1) as f32,
            ],
            target_size: [width as f32, height as f32],
            fit_mode: [
                match request.config.fit_mode.as_str() {
                    "crop" => 1.0,
                    "stretch" => 2.0,
                    _ => 0.0,
                },
                0.0,
                0.0,
                0.0,
            ],
        };
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("huff still export uniforms"),
            contents: bytemuck::bytes_of(&uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let uniform_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("huff still export uniform bind"),
            layout: uniform_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });
        let selected_sampler = if request.config.sampling == "crisp" {
            crisp_sampler
        } else {
            smooth_sampler
        };
        let source_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("huff still export source bind"),
            layout: source_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(source_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(selected_sampler),
                },
            ],
        });
        let (texture, view) = create_output_texture(
            device,
            "huff high resolution still target",
            width,
            height,
        );
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("huff high resolution still render pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
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
            pass.set_bind_group(0, &uniform_bind, &[]);
            pass.set_bind_group(1, &source_bind, &[]);
            pass.draw(0..3, 0..1);
        }

        let dense_bytes_per_row = width.saturating_mul(OUTPUT_BYTES_PER_PIXEL);
        let padded_bytes_per_row = align_copy_bytes_per_row(dense_bytes_per_row);
        let buffer_size = u64::from(padded_bytes_per_row).saturating_mul(u64::from(height));
        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("huff high resolution still readback"),
            size: buffer_size.max(4),
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        self.in_flight = Some(StillCaptureInFlight {
            generation,
            config: request.config,
            metadata: request.metadata,
            started_at: request.started_at,
            padded_bytes_per_row,
            buffer,
            _texture: texture,
            _view: view,
            _uniform_buffer: uniform_buffer,
            _uniform_bind: uniform_bind,
            _source_bind: source_bind,
        });
        true
    }

    fn begin_mapping(&self) {
        let Some(in_flight) = self.in_flight.as_ref() else {
            return;
        };
        let generation = in_flight.generation;
        let tx = self.completion_tx.clone();
        in_flight
            .buffer
            .slice(..)
            .map_async(wgpu::MapMode::Read, move |result| {
                let _ = tx.send((generation, result.map_err(|error| error.to_string())));
            });
    }

    fn process_completion(&mut self, export: &ExportHandle) {
        while let Ok((generation, result)) = self.completion_rx.try_recv() {
            let Some(in_flight) = self.in_flight.take() else {
                continue;
            };
            if generation != in_flight.generation {
                self.in_flight = Some(in_flight);
                continue;
            }
            if let Err(error) = result {
                export.fail(format!("still export GPU readback failed: {error}"));
                continue;
            }
            let width = in_flight.config.width.max(1);
            let height = in_flight.config.height.max(1);
            let dense_bytes_per_row = width as usize * OUTPUT_BYTES_PER_PIXEL as usize;
            let slice = in_flight.buffer.slice(..);
            let mapped = slice.get_mapped_range();
            let mut pixels = vec![0_u8; dense_bytes_per_row * height as usize];
            for row in 0..height as usize {
                let source_start = row * in_flight.padded_bytes_per_row as usize;
                let source_end = source_start + dense_bytes_per_row;
                let destination_start = row * dense_bytes_per_row;
                let destination_end = destination_start + dense_bytes_per_row;
                pixels[destination_start..destination_end]
                    .copy_from_slice(&mapped[source_start..source_end]);
            }
            drop(mapped);
            drop(slice);
            in_flight.buffer.unmap();
            let frame = OutputFrame::new(width, height, pixels);
            if let Err(error) = export.submit(
                in_flight.config,
                in_flight.metadata,
                frame,
                in_flight.started_at,
            ) {
                export.fail(error);
            }
        }
    }

    fn busy(&self) -> bool {
        self.pending.is_some() || self.in_flight.is_some()
    }
}

fn align_copy_bytes_per_row(value: u32) -> u32 {
    let alignment = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    value.div_ceil(alignment) * alignment
}

struct OffscreenTargets {
    _composite: wgpu::Texture,
    composite_view: wgpu::TextureView,
    _feedback_a: wgpu::Texture,
    feedback_a_view: wgpu::TextureView,
    _feedback_b: wgpu::Texture,
    feedback_b_view: wgpu::TextureView,
    _glitch_layer: wgpu::Texture,
    glitch_layer_view: wgpu::TextureView,
    _scan_layer: wgpu::Texture,
    scan_layer_view: wgpu::TextureView,
    output: wgpu::Texture,
    output_view: wgpu::TextureView,
    output_surface_bind: wgpu::BindGroup,
    feedback_bind_a_smooth: wgpu::BindGroup,
    feedback_bind_b_smooth: wgpu::BindGroup,
    feedback_bind_a_crisp: wgpu::BindGroup,
    feedback_bind_b_crisp: wgpu::BindGroup,
    present_bind_a: wgpu::BindGroup,
    present_bind_b: wgpu::BindGroup,
    smoosh_bind_a: wgpu::BindGroup,
    smoosh_bind_b: wgpu::BindGroup,
    scan_bind: wgpu::BindGroup,
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
    effect_prepare_pipeline: wgpu::RenderPipeline,
    feedback_pipeline: wgpu::RenderPipeline,
    output_pipeline: wgpu::RenderPipeline,
    present_pipeline: wgpu::RenderPipeline,
    export_pipeline: wgpu::RenderPipeline,
    history_capture_pipeline: wgpu::RenderPipeline,
    glitch_pipeline: wgpu::RenderPipeline,
    scan_pipeline: wgpu::RenderPipeline,
    smoosh_pipeline: wgpu::RenderPipeline,
    luma_pipeline: wgpu::RenderPipeline,
    global_mix_pipeline: wgpu::RenderPipeline,
    flow_pipeline: wgpu::RenderPipeline,
    uniform_buffer: wgpu::Buffer,
    gesture_buffer: wgpu::Buffer,
    signals_buffer: wgpu::Buffer,
    glitch_tile_buffer: wgpu::Buffer,
    glitch_tiles_cpu: Vec<GpuGlitchTile>,
    scan_band_buffer: wgpu::Buffer,
    scan_bands_cpu: Vec<GpuScanBand>,
    global_bind: wgpu::BindGroup,
    source_layout: wgpu::BindGroupLayout,
    feedback_layout: wgpu::BindGroupLayout,
    scan_layout: wgpu::BindGroupLayout,
    glitch_history_layout: wgpu::BindGroupLayout,
    smoosh_layout: wgpu::BindGroupLayout,
    present_layout: wgpu::BindGroupLayout,
    export_uniform_layout: wgpu::BindGroupLayout,
    export_source_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    crisp_sampler: wgpu::Sampler,
    source_bind: wgpu::BindGroup,
    camera_texture: SourceTexture,
    video_texture: SourceTexture,
    targets: OffscreenTargets,
    history_capture_bind: wgpu::BindGroup,
    glitch_history_bind_smooth: wgpu::BindGroup,
    glitch_history_bind_crisp: wgpu::BindGroup,
    history: GpuHistoryRing,
    output_readback: OutputReadback,
    still_capture: StillCapture,
    recording: RecordingHandle,
    export: ExportHandle,
    syphon_enabled: bool,
    syphon_fps: u32,
    spout_enabled: bool,
    spout_fps: u32,
    last_syphon_capture: Instant,
    last_spout_capture: Instant,
    last_record_capture: Instant,
    recording_was_busy: bool,
    effect_is_a: bool,
    effect_seeded: bool,

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
    glitch_depth_scatter: f32,
    glitch_corrupt_drift: f32,
    glitch_block: f32,
    glitch_size: f32,
    glitch_jitter: f32,
    glitch_smear: f32,
    glitch_smear_angle: f32,
    glitch_speed: f32,
    glitch_speed_fine: f32,
    glitch_speed_mul: f32,
    glitch_base_x: f32,
    glitch_base_y: f32,
    glitch_spatial_gap: f32,
    layer_priority: String,
    layer_pulse_speed: f32,
    scanlines_enabled: bool,
    scan_angle_manual: f32,
    scan_spin_left: bool,
    scan_spin_right: bool,
    scan_spin_speed: f32,
    scan_requested_bands: u32,
    scan_radius: f32,
    scan_focus: f32,
    scan_shift: f32,
    scan_skew: f32,
    scan_drift: f32,
    scan_place_x: f32,
    scan_place_y: f32,
    scan_zoom: f32,
    scan_zoom_mode: String,
    scan_speed: f32,
    scan_gap: f32,
    scan_alpha: f32,
    scan_phase_x: f64,
    scan_phase_y: f64,
    scan_spin_angle: f64,
    scan_effective_angle: f32,
    scan_band_count: u32,
    scan_generation_ms: f64,
    smoosh_enabled: bool,
    smoosh_blend: String,
    smoosh_amount: f32,
    smoosh_invert: bool,
    luma_key_enabled: bool,
    luma_key_threshold: f32,
    luma_key_mix: f32,
    luma_key_invert: bool,
    global_mix_enabled: bool,
    global_mix_blend: String,
    global_mix_amount: f32,
    global_mix_position: String,
    flow_enabled: bool,
    flow_strength: f32,
    flow_scale: f32,
    flow_speed: f32,
    flow_pulse: u32,
    flow_pulse_triggered: bool,
    flow_implode: f32,
    flow_swirl: f32,
    flow_turbulence: f32,
    flow_spread: f32,
    flow_carry: f32,
    flow_target: String,
    flow_pulse_until: Option<Instant>,
    flow_pulse_fires: u64,
    cluster_tiles_enabled: bool,
    cluster_center_count: u32,
    cluster_spread: f32,
    cluster_min_spread: f32,
    cluster_bias: f32,
    cluster_drift: f32,
    cluster_speed: f32,
    cluster_steer: f32,
    cluster_speed_variation: f32,
    cluster_pulse: f32,
    cluster_inertia: f32,
    cluster_coherence: f32,
    cluster_breathe: f32,
    cluster_bounds: String,
    cluster_physics: Vec<ClusterCenter>,
    cluster_physics_time: f64,
    cluster_last_pulse_seconds: Option<f64>,
    cluster_pulses: u64,
    cluster_bias_tiles: u32,
    cluster_rerolled_offsets: u32,
    glitch_seed: u64,
    glitch_phase_x: f64,
    glitch_phase_y: f64,
    p5_noise_seed: u64,
    p5_noise: P5Noise,
    glitch_base_tiles: u32,
    glitch_instance_count: u32,
    glitch_generation_ms: f64,
    glitch_dropped_instances: u64,
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
        recording: RecordingHandle,
        export: ExportHandle,
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
            effect_state: [0.0; 4],
            scan_transform: [0.0; 4],
            scan_dimensions: [0.0; 4],
            smoosh_state: [0.0; 4],
            luma_state: [0.0; 4],
            global_mix_state: [0.0; 4],
            flow_state0: [0.0; 4],
            flow_state1: [-1.0, 0.0, 0.0, 0.0],
            flow_state2: [1.0, 0.0, 0.0, 0.0],
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
        let glitch_tile_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("huff native glitch tile storage"),
            size: (MAX_GLITCH_INSTANCES * std::mem::size_of::<GpuGlitchTile>()) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let scan_band_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("huff native scan band storage"),
            size: (MAX_SCAN_BANDS * std::mem::size_of::<GpuScanBand>()) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let global_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("huff native global layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
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
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::VERTEX,
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
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: glitch_tile_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: scan_band_buffer.as_entire_binding(),
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
        // Scanlines only sample the clean composite. Keep them on a dedicated
        // bind group so no persistent feedback texture is simultaneously bound
        // while that same texture is used as the active render attachment.
        // This avoids a Metal read/write alias hazard when Luma Key toggles the
        // ping-pong target immediately before the scanline pass.
        let scan_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("huff native scanline source layout"),
                entries: &[texture_layout_entry(0), sampler_layout_entry(2)],
            });
        let glitch_history_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("huff native glitch history layout"),
                entries: &[history_texture_layout_entry(5), sampler_layout_entry(6)],
            });
        let smoosh_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("huff native smoosh layer layout"),
                entries: &[
                    texture_layout_entry(7),
                    texture_layout_entry(8),
                    texture_layout_entry(9),
                    sampler_layout_entry(10),
                ],
            });
        let present_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("huff native present layout"),
                entries: &[
                    texture_layout_entry(0),
                    sampler_layout_entry(1),
                    texture_layout_entry(2),
                ],
            });
        let export_uniform_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("huff still export uniform layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });
        let export_source_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("huff still export source layout"),
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
        let export_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("huff still export WGSL"),
            source: wgpu::ShaderSource::Wgsl(include_str!("export.wgsl").into()),
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
        let glitch_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("huff native glitch tile pipeline layout"),
                bind_group_layouts: &[
                    Some(&global_layout),
                    None,
                    Some(&glitch_history_layout),
                ],
                immediate_size: 0,
            });
        let scan_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("huff native scanline pipeline layout"),
                bind_group_layouts: &[Some(&global_layout), None, Some(&scan_layout)],
                immediate_size: 0,
            });
        let smoosh_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("huff native smoosh pipeline layout"),
                bind_group_layouts: &[Some(&global_layout), None, Some(&smoosh_layout)],
                immediate_size: 0,
            });
        let export_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("huff still export pipeline layout"),
                bind_group_layouts: &[Some(&export_uniform_layout), Some(&export_source_layout)],
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
        let effect_prepare_pipeline = create_pipeline(
            &device,
            &shader,
            &feedback_pipeline_layout,
            "huff native persistent buffer prepare pipeline",
            "fs_effect_prepare",
            HDR_FORMAT,
        );
        let feedback_pipeline = create_pipeline(
            &device,
            &shader,
            &feedback_pipeline_layout,
            "huff native feedback transform pipeline",
            "fs_feedback",
            HDR_FORMAT,
        );
        let output_pipeline = create_pipeline(
            &device,
            &shader,
            &present_pipeline_layout,
            "huff native final output pipeline",
            "fs_output",
            OUTPUT_FORMAT,
        );
        let present_pipeline = create_pipeline(
            &device,
            &shader,
            &present_pipeline_layout,
            "huff native surface presentation pipeline",
            "fs_surface",
            config.format,
        );
        let export_pipeline = create_pipeline(
            &device,
            &export_shader,
            &export_pipeline_layout,
            "huff high resolution still export pipeline",
            "fs_export",
            OUTPUT_FORMAT,
        );
        let history_capture_pipeline = create_pipeline(
            &device,
            &shader,
            &history_capture_pipeline_layout,
            "huff native history capture pipeline",
            "fs_history_capture",
            HISTORY_FORMAT,
        );
        let glitch_pipeline = create_glitch_pipeline(
            &device,
            &shader,
            &glitch_pipeline_layout,
            HDR_FORMAT,
        );
        let scan_pipeline = create_scan_pipeline(
            &device,
            &shader,
            &scan_pipeline_layout,
            HDR_FORMAT,
        );
        let smoosh_pipeline = create_pipeline(
            &device,
            &shader,
            &smoosh_pipeline_layout,
            "huff native smoosh pipeline",
            "fs_smoosh",
            HDR_FORMAT,
        );
        let luma_pipeline = create_pipeline(
            &device,
            &shader,
            &feedback_pipeline_layout,
            "huff native luma key pipeline",
            "fs_luma_key",
            HDR_FORMAT,
        );
        let global_mix_pipeline = create_pipeline(
            &device,
            &shader,
            &feedback_pipeline_layout,
            "huff native global mix pipeline",
            "fs_global_mix",
            HDR_FORMAT,
        );
        let flow_pipeline = create_pipeline(
            &device,
            &shader,
            &feedback_pipeline_layout,
            "huff native flow warp pipeline",
            "fs_flow",
            HDR_FORMAT,
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
        let glitch_history_bind_smooth = create_glitch_history_bind(
            &device,
            &glitch_history_layout,
            history.array_view(),
            &sampler,
            "huff glitch history smooth bind",
        );
        let glitch_history_bind_crisp = create_glitch_history_bind(
            &device,
            &glitch_history_layout,
            history.array_view(),
            &crisp_sampler,
            "huff glitch history crisp bind",
        );
        let targets = create_targets(
            &device,
            render_width,
            render_height,
            &feedback_layout,
            &scan_layout,
            &smoosh_layout,
            &present_layout,
            &sampler,
            &crisp_sampler,
            history.array_view(),
        );
        let history_capture_bind = create_present_bind(
            &device,
            &present_layout,
            &targets.composite_view,
            &targets.composite_view,
            &sampler,
            "huff history capture source bind",
        );

        let output_readback = OutputReadback::new(&device, render_width, render_height);
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
            effect_prepare_pipeline,
            feedback_pipeline,
            output_pipeline,
            present_pipeline,
            export_pipeline,
            history_capture_pipeline,
            glitch_pipeline,
            scan_pipeline,
            smoosh_pipeline,
            luma_pipeline,
            global_mix_pipeline,
            flow_pipeline,
            uniform_buffer,
            gesture_buffer,
            signals_buffer,
            glitch_tile_buffer,
            glitch_tiles_cpu: Vec::with_capacity(MAX_GLITCH_INSTANCES),
            scan_band_buffer,
            scan_bands_cpu: Vec::with_capacity(MAX_SCAN_BANDS),
            global_bind,
            source_layout,
            feedback_layout,
            scan_layout,
            glitch_history_layout,
            smoosh_layout,
            present_layout,
            export_uniform_layout,
            export_source_layout,
            sampler,
            crisp_sampler,
            source_bind,
            camera_texture,
            video_texture,
            targets,
            history_capture_bind,
            glitch_history_bind_smooth,
            glitch_history_bind_crisp,
            output_readback,
            still_capture: StillCapture::new(),
            history,
            recording,
            export,
            syphon_enabled: false,
            syphon_fps: 30,
            spout_enabled: false,
            spout_fps: 30,
            last_syphon_capture: now,
            last_spout_capture: now,
            last_record_capture: now,
            recording_was_busy: false,
            effect_is_a: false,
            effect_seeded: false,
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
            glitch_depth_scatter: 1.0,
            glitch_corrupt_drift: 0.0,
            glitch_block: 1000.0,
            glitch_size: 10.0,
            glitch_jitter: 1.0,
            glitch_smear: 6.0,
            glitch_smear_angle: 0.0,
            glitch_speed: 0.8,
            glitch_speed_fine: 1.0,
            glitch_speed_mul: 1.0,
            glitch_base_x: 0.0,
            glitch_base_y: 0.0,
            glitch_spatial_gap: 40.0,
            layer_priority: "scan".into(),
            layer_pulse_speed: 2.0,
            scanlines_enabled: false,
            scan_angle_manual: 0.0,
            scan_spin_left: false,
            scan_spin_right: false,
            scan_spin_speed: 1.0,
            scan_requested_bands: 3,
            scan_radius: 10.0,
            scan_focus: 0.5,
            scan_shift: 0.12,
            scan_skew: 0.0,
            scan_drift: 0.5,
            scan_place_x: 0.0,
            scan_place_y: 0.0,
            scan_zoom: 1.0,
            scan_zoom_mode: "content".into(),
            scan_speed: 1.0,
            scan_gap: 0.0,
            scan_alpha: 0.86,
            scan_phase_x: 0.0,
            scan_phase_y: 2000.0,
            scan_spin_angle: 0.0,
            scan_effective_angle: 0.0,
            scan_band_count: 0,
            scan_generation_ms: 0.0,
            smoosh_enabled: false,
            smoosh_blend: "screen".into(),
            smoosh_amount: 1.0,
            smoosh_invert: false,
            luma_key_enabled: false,
            luma_key_threshold: 0.5,
            luma_key_mix: 0.0,
            luma_key_invert: false,
            global_mix_enabled: false,
            global_mix_blend: "screen".into(),
            global_mix_amount: 0.0,
            global_mix_position: "after".into(),
            flow_enabled: false,
            flow_strength: 6.0,
            flow_scale: 80.0,
            flow_speed: 1.0,
            flow_pulse: 0,
            flow_pulse_triggered: false,
            flow_implode: 0.0,
            flow_swirl: 0.0,
            flow_turbulence: 0.0,
            flow_spread: 1.0,
            flow_carry: 0.0,
            flow_target: "final".into(),
            flow_pulse_until: None,
            flow_pulse_fires: 0,
            cluster_tiles_enabled: false,
            cluster_center_count: 3,
            cluster_spread: 80.0,
            cluster_min_spread: 0.0,
            cluster_bias: 0.85,
            cluster_drift: 0.0,
            cluster_speed: 0.0,
            cluster_steer: 1.0,
            cluster_speed_variation: 0.0,
            cluster_pulse: 0.0,
            cluster_inertia: 0.92,
            cluster_coherence: 0.8,
            cluster_breathe: 0.0,
            cluster_bounds: "bounce".into(),
            cluster_physics: Vec::new(),
            cluster_physics_time: 0.0,
            cluster_last_pulse_seconds: None,
            cluster_pulses: 0,
            cluster_bias_tiles: 0,
            cluster_rerolled_offsets: 0,
            glitch_seed: 912_831,
            glitch_phase_x: 0.0,
            glitch_phase_y: 1000.0,
            p5_noise_seed: 912_831,
            p5_noise: P5Noise::new(912_831),
            glitch_base_tiles: 0,
            glitch_instance_count: 0,
            glitch_generation_ms: 0.0,
            glitch_dropped_instances: 0,
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
            glitch_enabled: self.history_preview_enabled,
            glitch_base_tiles: self.glitch_base_tiles,
            glitch_instances: self.glitch_instance_count,
            glitch_instance_capacity: MAX_GLITCH_INSTANCES as u32,
            glitch_generation_ms: self.glitch_generation_ms,
            glitch_dropped_instances: self.glitch_dropped_instances,
            scanlines_enabled: self.scanlines_enabled,
            scan_band_count: self.scan_band_count,
            scan_generation_ms: self.scan_generation_ms,
            scan_angle: self.scan_effective_angle,
            layer_priority: self.layer_priority.clone(),
            smoosh_enabled: self.smoosh_enabled,
            smoosh_blend: self.smoosh_blend.clone(),
            luma_key_enabled: self.luma_key_enabled,
            global_mix_enabled: self.global_mix_enabled,
            global_mix_position: self.global_mix_position.clone(),
            flow_enabled: self.flow_enabled && self.flow_strength > 0.0,
            flow_target: self.flow_target.clone(),
            flow_strength: self.flow_strength,
            flow_pulse_fires: self.flow_pulse_fires,
            cluster_tiles_enabled: self.cluster_tiles_enabled,
            cluster_centers_active: self.cluster_physics.len() as u32,
            cluster_bias_tiles: self.cluster_bias_tiles,
            cluster_rerolled_offsets: self.cluster_rerolled_offsets,
            cluster_pulses: self.cluster_pulses,
            parameter_revision: self.parameter_snapshot.revision,
            active_source: self.sources.source.get().label().into(),
            surface_skips: self.surface_skips,
            surface_recoveries: self.surface_recoveries,
            output_readbacks: self.output_readback.readbacks,
            output_readback_drops: self.output_readback.dropped,
            output_map_errors: self.output_readback.map_errors,
            output_copy_ms: self.output_readback.last_copy_ms,
            output_pending_slots: self.output_readback.pending_slots(),
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
        let recording = self.recording.info();
        if self.render_mode == "match" && !recording.active && !recording.finalizing {
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
        self.reset_cluster_physics();
        self.targets = create_targets(
            &self.device,
            width,
            height,
            &self.feedback_layout,
            &self.scan_layout,
            &self.smoosh_layout,
            &self.present_layout,
            &self.sampler,
            &self.crisp_sampler,
            self.history.array_view(),
        );
        self.history_capture_bind = create_present_bind(
            &self.device,
            &self.present_layout,
            &self.targets.composite_view,
            &self.targets.composite_view,
            &self.sampler,
            "huff history capture source bind",
        );
        self.output_readback
            .rebuild(&self.device, self.render_width, self.render_height);
        if self.syphon_enabled {
            if let Err(error) = syphon::start(self.render_width, self.render_height, self.syphon_fps) {
                self.syphon_enabled = false;
                self.last_error = format!("Syphon restart after resize failed: {error}");
            }
        }
        if self.spout_enabled {
            let adapter_index = spout::info().adapter_index;
            if let Err(error) = spout::start(
                self.render_width,
                self.render_height,
                self.spout_fps,
                adapter_index,
            ) {
                self.spout_enabled = false;
                self.last_error = format!("Spout restart after resize failed: {error}");
            }
        }
        self.effect_is_a = false;
        self.effect_seeded = false;
    }

    fn reset_cluster_physics(&mut self) {
        self.cluster_physics.clear();
        self.cluster_physics_time = 0.0;
        self.cluster_last_pulse_seconds = None;
        self.cluster_bias_tiles = 0;
        self.cluster_rerolled_offsets = 0;
    }

    fn clear_feedback(&mut self) {
        self.targets = create_targets(
            &self.device,
            self.render_width,
            self.render_height,
            &self.feedback_layout,
            &self.scan_layout,
            &self.smoosh_layout,
            &self.present_layout,
            &self.sampler,
            &self.crisp_sampler,
            self.history.array_view(),
        );
        self.history_capture_bind = create_present_bind(
            &self.device,
            &self.present_layout,
            &self.targets.composite_view,
            &self.targets.composite_view,
            &self.sampler,
            "huff history capture source bind",
        );
        self.history.clear();
        self.glitch_tiles_cpu.clear();
        self.glitch_base_tiles = 0;
        self.glitch_instance_count = 0;
        self.glitch_phase_x = 0.0;
        self.glitch_phase_y = 1000.0;
        self.scan_phase_x = 0.0;
        self.scan_phase_y = 2000.0;
        self.scan_spin_angle = f64::from(self.scan_angle_manual);
        self.scan_bands_cpu.clear();
        self.scan_band_count = 0;
        self.flow_pulse_until = None;
        self.reset_cluster_physics();
        self.effect_is_a = false;
        self.effect_seeded = false;
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
        self.glitch_history_bind_smooth = create_glitch_history_bind(
            &self.device,
            &self.glitch_history_layout,
            self.history.array_view(),
            &self.sampler,
            "huff glitch history smooth bind",
        );
        self.glitch_history_bind_crisp = create_glitch_history_bind(
            &self.device,
            &self.glitch_history_layout,
            self.history.array_view(),
            &self.crisp_sampler,
            "huff glitch history crisp bind",
        );
        // The temporal history texture is part of bind group 2 so Huff stays
        // within the portable four-bind-group limit (groups 0 through 3).
        // Rebuild only the offscreen bind groups/targets when the array changes.
        self.targets = create_targets(
            &self.device,
            self.render_width,
            self.render_height,
            &self.feedback_layout,
            &self.scan_layout,
            &self.smoosh_layout,
            &self.present_layout,
            &self.sampler,
            &self.crisp_sampler,
            self.history.array_view(),
        );
        self.history_capture_bind = create_present_bind(
            &self.device,
            &self.present_layout,
            &self.targets.composite_view,
            &self.targets.composite_view,
            &self.sampler,
            "huff history capture source bind",
        );
        self.effect_is_a = false;
        self.effect_seeded = false;
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
        self.feedback_scale = snapshot.number("feedback.scale", 1.0).clamp(0.98, 1.03) as f32;
        self.feedback_rotation = snapshot.number("feedback.rotation", 0.01) as f32;
        self.history_quality = snapshot.number("render.quality", 1.0).clamp(0.0, 3.0) as f32;
        self.history_preview_enabled = snapshot.bool_value("glitch.corrupt_on", false);
        self.history_preview_depth = snapshot.number("glitch.depth", 0.5).clamp(0.0, 0.5) as f32;
        self.history_preview_mix = snapshot.number("glitch.corrupt", 0.3).clamp(0.0, 7.0) as f32;
        self.history_preview_alpha = snapshot.number("glitch.glitch_alpha", 1.0).clamp(0.0, 1.0) as f32;
        self.glitch_depth_scatter = snapshot.number("glitch.depth_scatter", 1.0).clamp(0.0, 1.0) as f32;
        self.glitch_corrupt_drift = snapshot.number("glitch.corrupt_drift", 0.0).clamp(0.0, 1.0) as f32;
        self.glitch_block = snapshot.number("glitch.block", 1000.0).clamp(2.0, 4096.0) as f32;
        self.glitch_size = snapshot.number("glitch.glitch_size", 10.0).clamp(1.0, 60.0) as f32;
        self.glitch_jitter = snapshot.number("glitch.glitch_jitter", 1.0).clamp(0.0, 1.0) as f32;
        self.glitch_smear = snapshot.number("glitch.glitch_smear", 6.0).clamp(0.0, 200.0) as f32;
        self.glitch_smear_angle = snapshot.number("glitch.glitch_smear_angle", 0.0).rem_euclid(360.0) as f32;
        self.glitch_speed = snapshot.number("glitch.glitch_speed", 0.8).clamp(0.0, 5.0) as f32;
        self.glitch_speed_fine = snapshot.number("glitch.glitch_speed_fine", 1.0).clamp(0.0, 10.0) as f32;
        self.glitch_speed_mul = snapshot.number("glitch.glitch_speed_mul", 1.0).clamp(0.0, 10.0) as f32;
        self.glitch_base_x = snapshot.number("glitch.glitch_base_x", 0.0).clamp(-1000.0, 1000.0) as f32;
        self.glitch_base_y = snapshot.number("glitch.glitch_base_y", 0.0).clamp(-1000.0, 1000.0) as f32;
        // SPATIAL GAP belongs to the cluster panel in the UI, but the original
        // applyGlitch() uses it for ordinary, non-cluster tile placement too.
        self.glitch_spatial_gap = snapshot.number("clusters.spatial_gap", 40.0).clamp(0.0, 200.0) as f32;
        self.layer_priority = snapshot.text("layers.layer_priority", "scan").to_string();
        self.layer_pulse_speed = snapshot.number("layers.layer_pulse_speed", 2.0).clamp(0.2, 12.0) as f32;
        self.scanlines_enabled = snapshot.bool_value("scanlines.clusters", false);
        self.scan_angle_manual = snapshot.number("scanlines.scan_angle", 0.0).clamp(-180.0, 180.0) as f32;
        self.scan_spin_left = snapshot.bool_value("scanlines.scan_spin_left", false);
        self.scan_spin_right = snapshot.bool_value("scanlines.scan_spin_right", false);
        self.scan_spin_speed = snapshot.number("scanlines.scan_spin_speed", 1.0).clamp(0.1, 10.0) as f32;
        self.scan_requested_bands = snapshot.number("scanlines.cluster_count", 3.0).round().clamp(1.0, 50.0) as u32;
        self.scan_radius = snapshot.number("scanlines.cluster_radius", 10.0).clamp(1.0, 120.0) as f32;
        self.scan_focus = snapshot.number("scanlines.scan_focus", 0.5).clamp(0.0, 2.0) as f32;
        self.scan_shift = snapshot.number("scanlines.scan_shift", 0.12).clamp(-4.0, 4.0) as f32;
        self.scan_skew = snapshot.number("scanlines.scan_skew", 0.0).clamp(-3.0, 3.0) as f32;
        self.scan_drift = snapshot.number("scanlines.scan_drift", 0.5).clamp(0.0, 5.0) as f32;
        self.scan_place_x = snapshot.number("scanlines.scan_place_x", 0.0).clamp(-1.0, 1.0) as f32;
        self.scan_place_y = snapshot.number("scanlines.scan_place_y", 0.0).clamp(-1.0, 1.0) as f32;
        self.scan_zoom = snapshot.number("scanlines.scan_zoom", 1.0).clamp(0.25, 6.0) as f32;
        self.scan_zoom_mode = snapshot.text("scanlines.scan_zoom_mode", "content").to_string();
        self.scan_speed = snapshot.number("scanlines.scan_speed", 1.0).clamp(0.0, 5.0) as f32;
        self.scan_gap = snapshot.number("scanlines.scan_gap", 0.0).clamp(0.0, 200.0) as f32;
        self.scan_alpha = snapshot.number("scanlines.scan_alpha", 0.86).clamp(0.0, 1.0) as f32;
        self.smoosh_enabled = snapshot.bool_value("smoosh.smoosh_on", false);
        self.smoosh_blend = snapshot.text("smoosh.smoosh_blend", "screen").to_string();
        self.smoosh_amount = snapshot.number("smoosh.smoosh_amt", 1.0).clamp(0.0, 1.0) as f32;
        self.smoosh_invert = snapshot.bool_value("smoosh.smoosh_invert", false);
        self.luma_key_enabled = snapshot.bool_value("luma.luma_key_on", false);
        self.luma_key_threshold = snapshot.number("luma.luma_key_ab", 0.5).clamp(0.0, 1.0) as f32;
        self.luma_key_mix = snapshot.number("luma.luma_key_mix", 0.0).clamp(0.0, 1.0) as f32;
        self.luma_key_invert = snapshot.bool_value("luma.luma_key_invert", false);
        self.global_mix_enabled = snapshot.bool_value("global_mix.global_mix_on", false);
        self.global_mix_blend = snapshot.text("global_mix.global_mix_blend", "screen").to_string();
        self.global_mix_amount = snapshot.number("global_mix.global_mix_amt", 0.0).clamp(0.0, 1.0) as f32;
        self.global_mix_position = snapshot.text("global_mix.global_mix_pos", "after").to_string();
        self.flow_enabled = snapshot.bool_value("flow.flow_on", false);
        self.flow_strength = snapshot.number("flow.flow_strength", 6.0).clamp(0.0, 20.0) as f32;
        self.flow_scale = snapshot.number("flow.flow_scale", 80.0).clamp(40.0, 200.0) as f32;
        self.flow_speed = snapshot.number("flow.flow_speed", 1.0).clamp(0.0, 6.0) as f32;
        self.flow_pulse = snapshot.number("flow.flow_pulse", 0.0).round().clamp(0.0, 200.0) as u32;
        self.flow_pulse_triggered = snapshot.bool_value("flow.flow_pulse_trig", false);
        self.flow_implode = snapshot.number("flow.flow_impl", 0.0).clamp(-5.0, 5.0) as f32;
        self.flow_swirl = snapshot.number("flow.flow_swirl", 0.0).clamp(-2.0, 2.0) as f32;
        self.flow_turbulence = snapshot.number("flow.flow_turb", 0.0).clamp(0.0, 1.0) as f32;
        self.flow_spread = snapshot.number("flow.flow_spread", 1.0).clamp(0.25, 4.0) as f32;
        self.flow_carry = snapshot.number("flow.flow_carry", 0.0).clamp(0.0, 2.0) as f32;
        self.flow_target = snapshot.text("flow.flow_target", "final").to_string();
        self.cluster_tiles_enabled = snapshot.bool_value("clusters.cluster_tiles", false);
        self.cluster_center_count = snapshot.number("clusters.clu_centers", 3.0).round().clamp(1.0, 20.0) as u32;
        self.cluster_spread = snapshot.number("clusters.clu_spread", 80.0).clamp(1.0, 300.0) as f32;
        self.cluster_min_spread = snapshot.number("clusters.clu_min_spread", 0.0).clamp(0.0, 150.0) as f32;
        self.cluster_bias = snapshot.number("clusters.clu_bias", 0.85).clamp(0.0, 1.0) as f32;
        self.cluster_drift = snapshot.number("clusters.clu_drift", 0.0).clamp(0.0, 5.0) as f32;
        self.cluster_speed = snapshot.number("clusters.clu_speed", 0.0).clamp(0.0, 10.0) as f32;
        self.cluster_steer = snapshot.number("clusters.clu_steer", 1.0).clamp(0.0, 10.0) as f32;
        self.cluster_speed_variation = snapshot.number("clusters.clu_speed_var", 0.0).clamp(0.0, 2.0) as f32;
        self.cluster_pulse = snapshot.number("clusters.clu_pulse", 0.0).clamp(0.0, 10.0) as f32;
        self.cluster_inertia = snapshot.number("clusters.clu_inertia", 0.92).clamp(0.01, 0.99) as f32;
        self.cluster_coherence = snapshot.number("clusters.clu_cohere", 0.8).clamp(0.0, 1.0) as f32;
        self.cluster_breathe = snapshot.number("clusters.clu_breathe", 0.0).clamp(0.0, 0.9) as f32;
        self.cluster_bounds = snapshot.text("clusters.clu_bounds", "bounce").to_string();
        self.glitch_seed = snapshot.number("source.seed", 912_831.0).round().max(0.0) as u64;
        if self.glitch_seed != self.p5_noise_seed {
            self.p5_noise_seed = self.glitch_seed;
            self.p5_noise = P5Noise::new(self.glitch_seed as u32);
        }

        self.render_mode = snapshot.text("render.resolution_mode", "match").to_string();
        let recording = self.recording.info();
        let desired = if recording.active || recording.finalizing {
            (self.render_width, self.render_height)
        } else {
            match self.render_mode.as_str() {
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
            }
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
                Ok(RenderCommand::FireFlowPulse) => {
                    self.flow_pulse_until = Some(Instant::now() + Duration::from_millis(220));
                    self.flow_pulse_fires = self.flow_pulse_fires.wrapping_add(1);
                }
                Ok(RenderCommand::CaptureStill {
                    mut config,
                    mut metadata,
                    reply,
                }) => {
                    let max_dimension = self
                        .device
                        .limits()
                        .max_texture_dimension_2d
                        .min(8192);
                    let pixels = u64::from(config.width).saturating_mul(u64::from(config.height));
                    let result = if config.width == 0 || config.height == 0 {
                        Err("still export dimensions must be greater than zero".into())
                    } else if config.width > max_dimension || config.height > max_dimension {
                        Err(format!(
                            "still export exceeds the supported {}×{} maximum",
                            max_dimension, max_dimension
                        ))
                    } else if pixels > 35_000_000 {
                        Err("still export exceeds the bounded 35 megapixel limit".into())
                    } else {
                        config.source_width = self.render_width;
                        config.source_height = self.render_height;
                        metadata.render_width = self.render_width;
                        metadata.render_height = self.render_height;
                        metadata.export_width = config.width;
                        metadata.export_height = config.height;
                        self.export.begin(&config).and_then(|_| {
                            self.still_capture
                                .queue(config, metadata)
                                .map_err(|error| {
                                    self.export.fail(error.clone());
                                    error
                                })
                        })
                    };
                    if let Err(error) = &result {
                        self.last_error = error.clone();
                    }
                    let _ = reply.send(result);
                }
                Ok(RenderCommand::StartSyphon { fps, reply }) => {
                    let result = self.start_syphon_output(fps);
                    if let Err(error) = &result {
                        self.last_error = error.clone();
                    }
                    let _ = reply.send(result);
                }
                Ok(RenderCommand::StopSyphon) => self.stop_syphon_output(),
                Ok(RenderCommand::StartSpout {
                    fps,
                    adapter_index,
                    reply,
                }) => {
                    let result = self.start_spout_output(fps, adapter_index);
                    if let Err(error) = &result {
                        self.last_error = error.clone();
                    }
                    let _ = reply.send(result);
                }
                Ok(RenderCommand::StopSpout) => self.stop_spout_output(),
                Ok(RenderCommand::Shutdown) => {
                    self.stop_syphon_output();
                    self.stop_spout_output();
                    if self.still_capture.busy() || self.export.info().active {
                        self.export.fail("still export interrupted by application shutdown".into());
                    }
                    return false;
                },
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
            self.targets = create_targets(
                &self.device,
                self.render_width,
                self.render_height,
                &self.feedback_layout,
                &self.scan_layout,
                &self.smoosh_layout,
                &self.present_layout,
                &self.sampler,
                &self.crisp_sampler,
                self.history.array_view(),
            );
            self.history_capture_bind = create_present_bind(
                &self.device,
                &self.present_layout,
                &self.targets.composite_view,
                &self.targets.composite_view,
                &self.sampler,
                "huff history capture source bind",
            );
            self.effect_is_a = false;
            self.effect_seeded = false;
            self.reset_cluster_physics();
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
        self.uniforms.effect_state = [
            if self.effect_seeded { 1.0 } else { 0.0 },
            if self.scanlines_enabled { 1.0 } else { 0.0 },
            0.0,
            0.0,
        ];
        self.uniforms.smoosh_state = [
            if self.smoosh_enabled { 1.0 } else { 0.0 },
            self.smoosh_amount,
            if self.smoosh_invert { 1.0 } else { 0.0 },
            blend_mode_code(&self.smoosh_blend),
        ];
        self.uniforms.luma_state = [
            if self.luma_key_enabled { 1.0 } else { 0.0 },
            self.luma_key_threshold,
            self.luma_key_mix,
            if self.luma_key_invert { 1.0 } else { 0.0 },
        ];
        self.uniforms.global_mix_state = [
            if self.global_mix_enabled { 1.0 } else { 0.0 },
            self.global_mix_amount,
            blend_mode_code(&self.global_mix_blend),
            global_mix_position_code(&self.global_mix_position),
        ];
        let now = Instant::now();
        let fire_active = self
            .flow_pulse_until
            .map(|until| now <= until)
            .unwrap_or(false);
        if self.flow_pulse_until.map(|until| now > until).unwrap_or(false) {
            self.flow_pulse_until = None;
        }
        let pulse_active = !self.flow_pulse_triggered || fire_active;
        let pulse_layer = if pulse_active && self.flow_pulse > 0 {
            self.history
                .layer_from_end(self.flow_pulse)
                .map(|layer| layer as f32)
                .unwrap_or(-1.0)
        } else {
            -1.0
        };
        self.uniforms.flow_state0 = [
            if self.flow_enabled && self.flow_strength > 0.0 { 1.0 } else { 0.0 },
            self.flow_strength,
            self.flow_scale,
            self.flow_speed,
        ];
        self.uniforms.flow_state1 = [
            pulse_layer,
            self.flow_implode,
            self.flow_swirl,
            self.flow_turbulence,
        ];
        self.uniforms.flow_state2 = [
            self.flow_spread,
            self.flow_carry,
            flow_target_code(&self.flow_target),
            self.frame_count as f32,
        ];
        self.update_scan_bands();

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

    fn update_scan_bands(&mut self) {
        let generation_started = Instant::now();

        // Scanline motion is independent from glitch speed in the original
        // engine. These are frame-based p5 phases, not elapsed-time velocities.
        self.scan_phase_x += f64::from(self.scan_speed) * 0.008;
        self.scan_phase_y += f64::from(self.scan_speed) * 0.009;

        if self.scan_spin_right {
            self.scan_spin_angle =
                (self.scan_spin_angle + f64::from(self.scan_spin_speed) * 0.5).rem_euclid(360.0);
        } else if self.scan_spin_left {
            self.scan_spin_angle =
                (self.scan_spin_angle - f64::from(self.scan_spin_speed) * 0.5).rem_euclid(360.0);
        } else {
            self.scan_spin_angle = f64::from(self.scan_angle_manual);
        }
        self.scan_effective_angle = self.scan_spin_angle as f32;
        self.scan_bands_cpu.clear();

        let width = f64::from(self.render_width.max(1));
        let height = f64::from(self.render_height.max(1));
        let angle_radians = self.scan_spin_angle.to_radians();
        let absolute_sine = angle_radians.sin().abs();
        let absolute_cosine = angle_radians.cos().abs();
        let span = width * absolute_sine + height * absolute_cosine;
        let cross = width * absolute_cosine + height * absolute_sine;
        let pattern_zoom = if matches!(self.scan_zoom_mode.as_str(), "pattern" | "both") {
            f64::from(self.scan_zoom)
        } else {
            1.0
        };
        let content_zoom = if matches!(self.scan_zoom_mode.as_str(), "content" | "both") {
            f64::from(self.scan_zoom).max(0.05)
        } else {
            1.0
        };
        self.uniforms.scan_transform = [
            angle_radians as f32,
            pattern_zoom as f32,
            self.scan_place_x * self.render_width as f32 * 0.5,
            self.scan_place_y * self.render_height as f32 * 0.5,
        ];
        self.uniforms.scan_dimensions = [span as f32, cross as f32, 0.0, 0.0];

        if !self.scanlines_enabled || self.scan_requested_bands == 0 || self.scan_alpha <= 0.0 {
            self.scan_band_count = 0;
            self.scan_generation_ms = generation_started.elapsed().as_secs_f64() * 1000.0;
            return;
        }

        let band_size = f64::from((self.scan_radius * 3.0).floor().max(4.0));
        let spacing = (band_size + f64::from(self.scan_gap)).max(1.0);
        let focus = f64::from(self.scan_focus);
        let focus_strength = (focus - 0.5).abs() * 1.4;
        let drift = f64::from(self.scan_drift);
        let shift_scale = f64::from(self.scan_shift);
        let skew = f64::from(self.scan_skew);
        let phase_x = self.scan_phase_x;
        let phase_y = self.scan_phase_y;

        for band_index in 0..self.scan_requested_bands.min(MAX_SCAN_BANDS as u32) {
            let n = f64::from(band_index);
            let even_base = (n * spacing).rem_euclid(span.max(1.0));
            let wander = (self.p5_noise.sample1(n * 3.7 + phase_y * 0.25 * drift) - 0.5)
                * band_size
                * drift
                * 0.5
                + (self.p5_noise.sample1(n * 11.3 + phase_y * 1.8 * drift) - 0.5)
                    * band_size
                    * drift
                    * 0.15;
            let mut position = even_base + wander;
            position = position * (1.0 - focus_strength) + (focus * span) * focus_strength;
            let raw_position = position.rem_euclid(span.max(1.0));
            let band_start = raw_position.floor().max(0.0);
            let band_end = span.min(band_start + band_size);
            let band_length = band_end - band_start;
            if band_length <= 0.0 {
                continue;
            }

            let skew_offset = (skew * band_start).floor();
            let shift_noise = self.p5_noise.sample1(n * 2.3 + phase_x * 0.5);
            let shift = (-cross * shift_scale
                + shift_noise * (cross * shift_scale * 2.0))
                .floor()
                + skew_offset;
            let source_offset = if shift < 0.0 { -shift } else { 0.0 };
            let destination_offset = if shift > 0.0 { shift } else { 0.0 };
            let band_cross = cross - shift.abs();
            if band_cross <= 0.0 {
                continue;
            }

            let (source_x, source_y, source_width, source_height) = if (content_zoom - 1.0).abs() > f64::EPSILON {
                let source_width = band_cross / content_zoom;
                let source_height = band_length / content_zoom;
                (
                    source_offset + (band_cross - source_width) * 0.5,
                    band_start + (band_length - source_height) * 0.5,
                    source_width,
                    source_height,
                )
            } else {
                (source_offset, band_start, band_cross, band_length)
            };

            self.scan_bands_cpu.push(GpuScanBand {
                // Destination coordinates are in the original rotated scanline
                // coordinate system. The vertex shader applies PLACE, ANGLE and
                // PATTERN ZOOM in the same order as Canvas2D.
                dest_rect: [
                    destination_offset as f32,
                    band_start as f32,
                    band_cross as f32,
                    band_length as f32,
                ],
                source_rect: [
                    (source_x / width) as f32,
                    (source_y / height) as f32,
                    (source_width / width) as f32,
                    (source_height / height) as f32,
                ],
                alpha_pad: [self.scan_alpha, 0.0, 0.0, 0.0],
            });
        }

        self.scan_band_count = self.scan_bands_cpu.len() as u32;
        if !self.scan_bands_cpu.is_empty() {
            self.queue.write_buffer(
                &self.scan_band_buffer,
                0,
                bytemuck::cast_slice(&self.scan_bands_cpu),
            );
        }
        self.scan_generation_ms = generation_started.elapsed().as_secs_f64() * 1000.0;
    }

    fn glitch_should_be_on_top(&self) -> bool {
        match self.layer_priority.as_str() {
            "glitch" => true,
            "neutral" => (self.frame_count & 1) == 0,
            "pulse" => {
                let pulse_frames =
                    (60.0 / f64::from(self.layer_pulse_speed.max(0.1))).round().max(1.0) as u64;
                ((self.frame_count / pulse_frames) & 1) == 0
            }
            _ => false,
        }
    }

    fn update_cluster_physics(
        &mut self,
        random: &mut P5Random,
        width: f64,
        height: f64,
    ) {
        let desired_count = self.cluster_center_count.max(1) as usize;
        while self.cluster_physics.len() < desired_count {
            self.cluster_physics.push(ClusterCenter {
                x: random.next() * width,
                y: random.next() * height,
                velocity_x: (random.next() - 0.5) * 2.0,
                velocity_y: (random.next() - 0.5) * 2.0,
                noise_offset_x: random.next() * 1000.0,
                noise_offset_y: random.next() * 1000.0,
                speed_multiplier: 1.0
                    + (random.next() - 0.5)
                        * 2.0
                        * f64::from(self.cluster_speed_variation),
                tiles: Vec::new(),
            });
        }
        self.cluster_physics.truncate(desired_count);

        self.cluster_physics_time += f64::from(self.cluster_steer) * 0.004;
        let cluster_travel = (f64::from(self.cluster_speed).max(0.0) / 10.0).powf(1.7) * 7.0;
        let pulse = f64::from(self.cluster_pulse);
        let now_seconds = self.started.elapsed().as_secs_f64();

        if pulse > 0.0 {
            let pulse_interval = (3.0 - pulse * 0.25).max(0.2);
            let should_pulse = match self.cluster_last_pulse_seconds {
                Some(last_pulse) => now_seconds - last_pulse >= pulse_interval,
                None => {
                    self.cluster_last_pulse_seconds = Some(now_seconds);
                    false
                }
            };
            if should_pulse {
                self.cluster_last_pulse_seconds = Some(now_seconds);
                for center in &mut self.cluster_physics {
                    let angle = random.next() * std::f64::consts::TAU;
                    let force = pulse * cluster_travel * 0.6;
                    center.velocity_x += angle.cos() * force;
                    center.velocity_y += angle.sin() * force;
                }
                self.cluster_pulses = self.cluster_pulses.wrapping_add(1);
            }
        } else {
            self.cluster_last_pulse_seconds = None;
        }

        let physics_time = self.cluster_physics_time;
        let inertia = f64::from(self.cluster_inertia);
        let drift = f64::from(self.cluster_drift);
        let bounce = self.cluster_bounds == "bounce";
        let noise = &self.p5_noise;

        for center in &mut self.cluster_physics {
            let effective_speed = cluster_travel * center.speed_multiplier;
            let steering_angle = noise.sample2(
                center.noise_offset_x + physics_time * 0.7,
                center.noise_offset_y + physics_time * 0.5,
            ) * std::f64::consts::TAU
                * 2.0;
            let desired_velocity_x = steering_angle.cos() * effective_speed;
            let desired_velocity_y = steering_angle.sin() * effective_speed;

            center.velocity_x =
                center.velocity_x * inertia + desired_velocity_x * (1.0 - inertia);
            center.velocity_y =
                center.velocity_y * inertia + desired_velocity_y * (1.0 - inertia);

            if drift > 0.0 {
                center.velocity_x += (noise.sample1(
                    center.noise_offset_x * 2.1 + physics_time * 1.3,
                ) - 0.5)
                    * drift
                    * 0.5;
                center.velocity_y += (noise.sample1(
                    center.noise_offset_y * 2.1 + physics_time * 1.1,
                ) - 0.5)
                    * drift
                    * 0.5;
            }

            let next_x = center.x + center.velocity_x;
            let next_y = center.y + center.velocity_y;
            if bounce {
                if next_x < 0.0 {
                    center.x = -next_x;
                    center.velocity_x = -center.velocity_x;
                } else if next_x > width {
                    center.x = 2.0 * width - next_x;
                    center.velocity_x = -center.velocity_x;
                } else {
                    center.x = next_x;
                }
                if next_y < 0.0 {
                    center.y = -next_y;
                    center.velocity_y = -center.velocity_y;
                } else if next_y > height {
                    center.y = 2.0 * height - next_y;
                    center.velocity_y = -center.velocity_y;
                } else {
                    center.y = next_y;
                }
            } else {
                center.x = next_x.rem_euclid(width);
                center.y = next_y.rem_euclid(height);
            }
        }
    }

    fn update_glitch_tiles(&mut self, _delta_seconds: f32, source_sequence: u64) {
        let generation_started = Instant::now();
        self.glitch_tiles_cpu.clear();
        self.glitch_base_tiles = 0;
        self.glitch_instance_count = 0;
        self.cluster_bias_tiles = 0;
        self.cluster_rerolled_offsets = 0;

        // Exact original semantics: SPEED, FINE and MULT only advance the two
        // p5 noise phases. They do not multiply CORRUPT, move every rectangle,
        // or directly set a pixels-per-second velocity.
        let density = f64::from(self.glitch_speed)
            * f64::from(self.glitch_speed_fine)
            * f64::from(self.glitch_speed_mul);
        self.glitch_phase_x += density * 0.01;
        self.glitch_phase_y += density * 0.011;

        if !self.history_preview_enabled
            || self.history.count < 2
            || source_sequence == 0
            || self.history_preview_alpha <= 0.0
        {
            self.glitch_generation_ms = generation_started.elapsed().as_secs_f64() * 1000.0;
            return;
        }

        let width = f64::from(self.render_width.max(1));
        let height = f64::from(self.render_height.max(1));
        let block = f64::from(self.glitch_block).trunc().max(2.0);
        let columns = ((width / block).floor() as u32).max(1);
        let rows = ((height / block).floor() as u32).max(1);
        let total_cells = columns.saturating_mul(rows).max(1);
        let available_back = self.history.count.saturating_sub(1);
        let max_back = ((f64::from(available_back) * f64::from(self.history_preview_depth))
            .floor() as u32)
            .max(1)
            .min(available_back.max(1));

        let phase_x = self.glitch_phase_x;
        let phase_y = self.glitch_phase_y;
        let base_back = (f64::from(max_back)
            * (0.3 + 0.7 * self.p5_noise.sample1(phase_x * 0.1 + phase_y * 0.07)))
            .floor()
            .max(1.0) as u32;
        let drift_mod = if self.glitch_corrupt_drift > 0.0 {
            self.p5_noise.sample2(phase_x * 0.08, phase_y * 0.08) * 2.0 - 1.0
        } else {
            0.0
        };
        let corrupt_multiplier =
            (1.0 + f64::from(self.glitch_corrupt_drift) * drift_mod).max(0.05);

        // CORRUPT controls tile count only. As in the original, enabling the
        // effect with CORRUPT=0 still requests one historical tile.
        let requested_base_tiles = (f64::from(total_cells)
            * f64::from(self.history_preview_mix)
            * corrupt_multiplier)
            .floor()
            .max(1.0) as u32;
        let smear_steps = f64::from(self.glitch_smear)
            .floor()
            .clamp(0.0, 200.0) as u32;
        let instances_per_tile = smear_steps.saturating_add(1).max(1);
        let maximum_base_tiles = (MAX_GLITCH_INSTANCES as u32 / instances_per_tile).max(1);
        let base_tile_limit = requested_base_tiles.min(maximum_base_tiles);

        let raw_tile_extent = block * (f64::from(self.glitch_size).floor() / 20.0);
        let newest = self.history.newest_layer();
        let capacity = self.history.capacity.max(1);
        // Canvas globalAlpha used floor(slider*255), so preserve its 8-bit step.
        let alpha = ((f64::from(self.history_preview_alpha).clamp(0.0, 1.0) * 255.0)
            .floor()
            / 255.0) as f32;

        // p5 frameCount is 1 on the first draw. Native frame_count increments at
        // the end of render(), hence +1 here for matching randomSeed(seed+frameCount).
        let mut random = P5Random::new(
            (self.glitch_seed as u32)
                .wrapping_add(self.frame_count.wrapping_add(1) as u32),
        );

        // Smear direction is shared by every tile in a frame.
        let (smear_dx, smear_dy) = if self.glitch_smear_angle.abs() < f32::EPSILON {
            (
                self.p5_noise.sample1(phase_x) * 2.0 - 1.0,
                self.p5_noise.sample1(phase_y) * 2.0 - 1.0,
            )
        } else {
            let angle = f64::from(self.glitch_smear_angle).to_radians()
                + (self.p5_noise.sample1(phase_x * 0.5) * 2.0 - 1.0)
                    * std::f64::consts::PI
                    / 6.0;
            (angle.cos(), angle.sin())
        };

        // SPATIAL GAP is shared by ordinary and cluster-biased placement.
        // The grid stores accepted points so both modes keep the original
        // minimum-distance behavior without an O(n²) scan.
        let gap = f64::from(self.glitch_spatial_gap).trunc().max(0.0);
        let mut targets = Vec::<[f64; 2]>::with_capacity(base_tile_limit as usize);
        let mut gap_grid = if gap > 0.0 {
            Some(SpatialGapGrid::new(width, gap))
        } else {
            None
        };
        if self.cluster_tiles_enabled && self.cluster_center_count > 0 {
            // This is the original moving-body cluster model: persistent centers
            // carry persistent center-relative tile offsets. COHERENCE controls
            // how often those offsets are re-rolled, while BREATHE only changes
            // the radius used to draw the same constellation.
            self.update_cluster_physics(&mut random, width, height);
            let center_count = self.cluster_physics.len().max(1);
            let bias_count = (f64::from(base_tile_limit) * f64::from(self.cluster_bias))
                .round()
                .clamp(0.0, f64::from(base_tile_limit)) as u32;
            let per_center = ((bias_count as usize) / center_count).max(1);
            let breathe_factor = if self.cluster_breathe > 0.0 {
                1.0
                    + (self.started.elapsed().as_secs_f64() * 0.6).sin()
                        * f64::from(self.cluster_breathe)
            } else {
                1.0
            };
            let effective_spread =
                (f64::from(self.cluster_spread) * breathe_factor).max(1.0);
            let effective_minimum = f64::from(self.cluster_min_spread) * breathe_factor;
            let reroll_probability = 1.0 - f64::from(self.cluster_coherence);
            let mut rerolled_offsets = 0_u32;

            for center in &mut self.cluster_physics {
                for tile_index in 0..per_center {
                    if targets.len() >= bias_count as usize {
                        break;
                    }
                    let needs_offset = tile_index >= center.tiles.len()
                        || random.next() < reroll_probability;
                    if needs_offset {
                        let offset = ClusterTileOffset {
                            angle: random.next() * std::f64::consts::TAU,
                            radius_norm: random.next(),
                        };
                        if tile_index < center.tiles.len() {
                            center.tiles[tile_index] = offset;
                        } else {
                            center.tiles.push(offset);
                        }
                        rerolled_offsets = rerolled_offsets.wrapping_add(1);
                    }

                    let offset = center.tiles[tile_index];
                    let radius = effective_minimum
                        + offset.radius_norm
                            * (effective_spread - effective_minimum).max(1.0);
                    let x = (center.x + offset.angle.cos() * radius).rem_euclid(width);
                    let y = (center.y + offset.angle.sin() * radius).rem_euclid(height);
                    let mut accepted = try_add_glitch_target(
                        &mut targets,
                        &mut gap_grid,
                        x.floor(),
                        y.floor(),
                    );

                    for _ in 0..6 {
                        if accepted {
                            break;
                        }
                        let fallback_angle = random.next() * std::f64::consts::TAU;
                        let fallback_radius = effective_minimum
                            + random.next()
                                * (effective_spread - effective_minimum).max(1.0);
                        accepted = try_add_glitch_target(
                            &mut targets,
                            &mut gap_grid,
                            (center.x + fallback_angle.cos() * fallback_radius)
                                .rem_euclid(width)
                                .floor(),
                            (center.y + fallback_angle.sin() * fallback_radius)
                                .rem_euclid(height)
                                .floor(),
                        );
                    }
                }
                center.tiles.truncate(per_center);
            }

            self.cluster_bias_tiles = targets.len().min(bias_count as usize) as u32;
            self.cluster_rerolled_offsets = rerolled_offsets;

            let mut guard = 0_u32;
            let maximum_guard = base_tile_limit.saturating_mul(4);
            while targets.len() < base_tile_limit as usize && guard < maximum_guard {
                guard = guard.saturating_add(1);
                let x = (random.next() * f64::from(columns)).floor() * block;
                let y = (random.next() * f64::from(rows)).floor() * block;
                try_add_glitch_target(&mut targets, &mut gap_grid, x, y);
            }
        } else {
            let mut attempts = 0_u32;
            let maximum_attempts = base_tile_limit.saturating_mul(8);
            while targets.len() < base_tile_limit as usize && attempts < maximum_attempts {
                attempts = attempts.saturating_add(1);
                let x = (random.next() * f64::from(columns)).floor() * block;
                let y = (random.next() * f64::from(rows)).floor() * block;
                try_add_glitch_target(&mut targets, &mut gap_grid, x, y);
            }
        }

        let actual_base_tiles = targets.len() as u32;
        let missing_base_tiles = requested_base_tiles.saturating_sub(actual_base_tiles);
        let mut dropped_this_frame =
            u64::from(missing_base_tiles).saturating_mul(u64::from(instances_per_tile));

        for (tile_index_usize, target) in targets.into_iter().enumerate() {
            let tile_index = tile_index_usize as u32;
            let mut cx = target[0];
            let mut cy = target[1];

            let ox = (((self
                .p5_noise
                .sample1(phase_x + f64::from(tile_index) * 0.013)
                * 2.0
                - 1.0)
                * block
                * 2.0)
                * f64::from(self.glitch_jitter))
            .floor();
            let oy = (((self
                .p5_noise
                .sample1(phase_y + f64::from(tile_index) * 0.017)
                * 2.0
                - 1.0)
                * block
                * 2.0)
                * f64::from(self.glitch_jitter))
            .floor();
            cx = (cx + ox).rem_euclid(width);
            cy = (cy + oy).rem_euclid(height);

            // PIXEL SIZE defines the selection grid. GLITCH SIZE independently
            // scales the sampled rectangle as block*(size/20). Right/bottom edge
            // tiles crop rather than shifting inward.
            let tile_width = raw_tile_extent.min(width - cx);
            let tile_height = raw_tile_extent.min(height - cy);
            if tile_width <= 0.0 || tile_height <= 0.0 {
                continue;
            }

            let destination_x = (cx + f64::from(self.glitch_base_x).trunc())
                .clamp(0.0, (width - tile_width).max(0.0));
            let destination_y = (cy + f64::from(self.glitch_base_y).trunc())
                .clamp(0.0, (height - tile_height).max(0.0));

            // Stable history selection per decoded source frame, matching _vfc.
            let hash = (source_sequence as u32)
                .wrapping_mul(1_664_525)
                .wrapping_add(tile_index.wrapping_mul(1_013_904_223));
            let random_back = (hash % max_back).saturating_add(1);
            let blended_back = (f64::from(base_back)
                + (f64::from(random_back) - f64::from(base_back))
                    * f64::from(self.glitch_depth_scatter))
            .round() as u32;
            let frames_back = blended_back.clamp(1, max_back);
            let layer = (newest + capacity - (frames_back % capacity)) % capacity;

            let source_rect = [
                (cx / width) as f32,
                (cy / height) as f32,
                (tile_width / width) as f32,
                (tile_height / height) as f32,
            ];
            let mut push_instance =
                |dest_x: f64, dest_y: f64, tiles: &mut Vec<GpuGlitchTile>| {
                    if tiles.len() >= MAX_GLITCH_INSTANCES {
                        dropped_this_frame = dropped_this_frame.wrapping_add(1);
                        return;
                    }
                    let clamped_x = dest_x.clamp(0.0, (width - tile_width).max(0.0));
                    let clamped_y = dest_y.clamp(0.0, (height - tile_height).max(0.0));
                    tiles.push(GpuGlitchTile {
                        dest_rect: [
                            (clamped_x / width) as f32,
                            (clamped_y / height) as f32,
                            (tile_width / width) as f32,
                            (tile_height / height) as f32,
                        ],
                        source_rect,
                        layer_alpha: [layer as f32, alpha, 0.0, 0.0],
                    });
                };

            push_instance(destination_x, destination_y, &mut self.glitch_tiles_cpu);
            for smear_index in 1..=smear_steps {
                let distance = f64::from(smear_index) * block;
                push_instance(
                    destination_x + smear_dx * distance,
                    destination_y + smear_dy * distance,
                    &mut self.glitch_tiles_cpu,
                );
            }
        }

        self.glitch_base_tiles = actual_base_tiles;
        self.glitch_instance_count = self.glitch_tiles_cpu.len() as u32;
        self.glitch_dropped_instances = self
            .glitch_dropped_instances
            .wrapping_add(dropped_this_frame);
        if !self.glitch_tiles_cpu.is_empty() {
            self.queue.write_buffer(
                &self.glitch_tile_buffer,
                0,
                bytemuck::cast_slice(&self.glitch_tiles_cpu),
            );
        }
        self.glitch_generation_ms = generation_started.elapsed().as_secs_f64() * 1000.0;
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

    fn start_syphon_output(&mut self, fps: u32) -> Result<(), String> {
        let fps = fps.clamp(1, 60);
        syphon::start_worker();
        syphon::start(self.render_width, self.render_height, fps)?;
        self.syphon_enabled = true;
        self.syphon_fps = fps;
        self.last_syphon_capture = Instant::now()
            .checked_sub(Duration::from_secs_f64(1.0 / fps as f64))
            .unwrap_or_else(Instant::now);
        Ok(())
    }

    fn stop_syphon_output(&mut self) {
        self.syphon_enabled = false;
        syphon::stop();
    }

    fn start_spout_output(&mut self, fps: u32, adapter_index: i32) -> Result<(), String> {
        let fps = fps.clamp(1, 60);
        spout::start_worker();
        spout::start(
            self.render_width,
            self.render_height,
            fps,
            adapter_index,
        )?;
        self.spout_enabled = true;
        self.spout_fps = fps;
        self.last_spout_capture = Instant::now()
            .checked_sub(Duration::from_secs_f64(1.0 / fps as f64))
            .unwrap_or_else(Instant::now);
        Ok(())
    }

    fn stop_spout_output(&mut self) {
        self.spout_enabled = false;
        spout::stop();
    }

    fn output_capture_targets(&mut self, now: Instant) -> u8 {
        let mut targets = 0_u8;
        if self.syphon_enabled {
            let interval = Duration::from_secs_f64(1.0 / self.syphon_fps.max(1) as f64);
            if now.duration_since(self.last_syphon_capture) >= interval {
                targets |= OUTPUT_TARGET_SYPHON;
                self.last_syphon_capture = now;
            }
        }
        if self.spout_enabled {
            let interval = Duration::from_secs_f64(1.0 / self.spout_fps.max(1) as f64);
            if now.duration_since(self.last_spout_capture) >= interval {
                targets |= OUTPUT_TARGET_SPOUT;
                self.last_spout_capture = now;
            }
        }
        let recording = self.recording.info();
        if recording.active {
            let interval = Duration::from_secs_f64(1.0 / recording.fps.max(1) as f64);
            if now.duration_since(self.last_record_capture) >= interval {
                targets |= OUTPUT_TARGET_RECORDING;
                self.last_record_capture = now;
            }
        }
        targets
    }

    fn render(&mut self) -> Result<RenderOutcome, String> {
        if let Err(error) = self.device.poll(wgpu::PollType::Poll) {
            self.last_error = format!("native output GPU polling failed: {error}");
        }
        self.output_readback.process_completions(&self.recording);
        self.still_capture.process_completion(&self.export);

        let recording = self.recording.info();
        let recording_busy = recording.active || recording.finalizing;
        if self.recording_was_busy && !recording_busy {
            self.recording_was_busy = false;
            self.apply_parameter_state(true);
        } else {
            self.recording_was_busy = recording_busy;
        }

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

        let external_output_active = self.syphon_enabled
            || self.spout_enabled
            || self.recording.info().active
            || self.export.info().active;
        let (surface_frame, reconfigure) = if self.minimized {
            (None, false)
        } else {
            match self.surface.get_current_texture() {
                wgpu::CurrentSurfaceTexture::Success(frame) => (Some(frame), false),
                wgpu::CurrentSurfaceTexture::Suboptimal(frame) => (Some(frame), true),
                wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => {
                    self.surface_skips = self.surface_skips.wrapping_add(1);
                    if self.surface_skips % 120 == 0 {
                        self.recover_surface(false)?;
                    }
                    if external_output_active {
                        (None, false)
                    } else {
                        return Ok(RenderOutcome::SurfaceUnavailable);
                    }
                }
                wgpu::CurrentSurfaceTexture::Outdated => {
                    self.recover_surface(false)?;
                    if external_output_active {
                        (None, false)
                    } else {
                        return Ok(RenderOutcome::Recovered);
                    }
                }
                wgpu::CurrentSurfaceTexture::Lost => {
                    self.recover_surface(true)?;
                    if external_output_active {
                        (None, false)
                    } else {
                        return Ok(RenderOutcome::Recovered);
                    }
                }
                wgpu::CurrentSurfaceTexture::Validation => {
                    return Err("surface validation error".into())
                }
            }
        };
        let surface_view = surface_frame.as_ref().map(|frame| {
            frame
                .texture
                .create_view(&wgpu::TextureViewDescriptor::default())
        });
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

        self.update_glitch_tiles(delta as f32, source_sequence);
        let use_crisp_history = self.history_sampling == "crisp";

        // gBuf parity: carry one persistent effect buffer forward, then place
        // glitch/scan/luma/flow/global-mix stages in the same semantic order as
        // the original Canvas2D engine.
        let previous_is_a = self.effect_is_a;
        let (prepare_view, prepare_bind) = if previous_is_a {
            (
                &self.targets.feedback_b_view,
                if use_crisp_history {
                    &self.targets.feedback_bind_b_crisp
                } else {
                    &self.targets.feedback_bind_b_smooth
                },
            )
        } else {
            (
                &self.targets.feedback_a_view,
                if use_crisp_history {
                    &self.targets.feedback_bind_a_crisp
                } else {
                    &self.targets.feedback_bind_a_smooth
                },
            )
        };
        begin_feedback_pass(
            &mut encoder,
            "huff persistent buffer prepare pass",
            prepare_view,
            &self.effect_prepare_pipeline,
            &self.global_bind,
            prepare_bind,
        );
        let mut current_is_a = !previous_is_a;

        let glitch_history_bind = if use_crisp_history {
            &self.glitch_history_bind_crisp
        } else {
            &self.glitch_history_bind_smooth
        };
        let flow_active = self.flow_enabled && self.flow_strength > 0.0;
        let flow_route = if flow_active && !self.smoosh_enabled {
            self.flow_target.as_str()
        } else {
            "final"
        };
        let mut flow_done = false;

        if self.smoosh_enabled {
            clear_texture_target(
                &mut encoder,
                "clear isolated glitch layer",
                &self.targets.glitch_layer_view,
            );
            clear_texture_target(
                &mut encoder,
                "clear isolated scan layer",
                &self.targets.scan_layer_view,
            );
            if self.glitch_instance_count > 0 {
                begin_glitch_pass(
                    &mut encoder,
                    &self.targets.glitch_layer_view,
                    &self.glitch_pipeline,
                    &self.global_bind,
                    glitch_history_bind,
                    self.glitch_instance_count,
                );
            }
            if self.scan_band_count > 0 {
                begin_scan_pass(
                    &mut encoder,
                    &self.targets.scan_layer_view,
                    &self.scan_pipeline,
                    &self.global_bind,
                    &self.targets.scan_bind,
                    self.scan_band_count,
                );
            }
            current_is_a = begin_smoosh_stage(
                &mut encoder,
                &self.smoosh_pipeline,
                &self.global_bind,
                &self.targets,
                current_is_a,
            );
            if self.luma_key_enabled && self.luma_key_mix > 0.0 {
                current_is_a = begin_ping_pong_stage(
                    &mut encoder,
                    "huff native luma key pass",
                    &self.luma_pipeline,
                    &self.global_bind,
                    &self.targets,
                    current_is_a,
                    use_crisp_history,
                );
            }
        } else if flow_route == "glitch" {
            if self.glitch_instance_count > 0 {
                begin_glitch_pass(
                    &mut encoder,
                    effect_view(&self.targets, current_is_a),
                    &self.glitch_pipeline,
                    &self.global_bind,
                    glitch_history_bind,
                    self.glitch_instance_count,
                );
            }
            current_is_a = begin_ping_pong_stage(
                &mut encoder,
                "huff native flow warp after glitch",
                &self.flow_pipeline,
                &self.global_bind,
                &self.targets,
                current_is_a,
                use_crisp_history,
            );
            flow_done = true;
            if self.global_mix_enabled
                && self.global_mix_amount > 0.0
                && self.global_mix_position == "afterflow"
            {
                current_is_a = begin_ping_pong_stage(
                    &mut encoder,
                    "huff native global mix after flow",
                    &self.global_mix_pipeline,
                    &self.global_bind,
                    &self.targets,
                    current_is_a,
                    use_crisp_history,
                );
            }
            if self.luma_key_enabled && self.luma_key_mix > 0.0 {
                current_is_a = begin_ping_pong_stage(
                    &mut encoder,
                    "huff native luma key pass",
                    &self.luma_pipeline,
                    &self.global_bind,
                    &self.targets,
                    current_is_a,
                    use_crisp_history,
                );
            }
            if self.scan_band_count > 0 {
                begin_scan_pass(
                    &mut encoder,
                    effect_view(&self.targets, current_is_a),
                    &self.scan_pipeline,
                    &self.global_bind,
                    &self.targets.scan_bind,
                    self.scan_band_count,
                );
            }
        } else if flow_route == "scan" {
            if self.scan_band_count > 0 {
                begin_scan_pass(
                    &mut encoder,
                    effect_view(&self.targets, current_is_a),
                    &self.scan_pipeline,
                    &self.global_bind,
                    &self.targets.scan_bind,
                    self.scan_band_count,
                );
            }
            current_is_a = begin_ping_pong_stage(
                &mut encoder,
                "huff native flow warp after scan",
                &self.flow_pipeline,
                &self.global_bind,
                &self.targets,
                current_is_a,
                use_crisp_history,
            );
            flow_done = true;
            if self.global_mix_enabled
                && self.global_mix_amount > 0.0
                && self.global_mix_position == "afterflow"
            {
                current_is_a = begin_ping_pong_stage(
                    &mut encoder,
                    "huff native global mix after flow",
                    &self.global_mix_pipeline,
                    &self.global_bind,
                    &self.targets,
                    current_is_a,
                    use_crisp_history,
                );
            }
            if self.glitch_instance_count > 0 {
                begin_glitch_pass(
                    &mut encoder,
                    effect_view(&self.targets, current_is_a),
                    &self.glitch_pipeline,
                    &self.global_bind,
                    glitch_history_bind,
                    self.glitch_instance_count,
                );
            }
            if self.luma_key_enabled && self.luma_key_mix > 0.0 {
                current_is_a = begin_ping_pong_stage(
                    &mut encoder,
                    "huff native luma key pass",
                    &self.luma_pipeline,
                    &self.global_bind,
                    &self.targets,
                    current_is_a,
                    use_crisp_history,
                );
            }
        } else {
            let glitch_on_top = self.glitch_should_be_on_top();
            if glitch_on_top {
                if self.scan_band_count > 0 {
                    begin_scan_pass(
                        &mut encoder,
                        effect_view(&self.targets, current_is_a),
                        &self.scan_pipeline,
                        &self.global_bind,
                        &self.targets.scan_bind,
                        self.scan_band_count,
                    );
                }
                if self.glitch_instance_count > 0 {
                    begin_glitch_pass(
                        &mut encoder,
                        effect_view(&self.targets, current_is_a),
                        &self.glitch_pipeline,
                        &self.global_bind,
                        glitch_history_bind,
                        self.glitch_instance_count,
                    );
                }
                if self.luma_key_enabled && self.luma_key_mix > 0.0 {
                    current_is_a = begin_ping_pong_stage(
                        &mut encoder,
                        "huff native luma key pass",
                        &self.luma_pipeline,
                        &self.global_bind,
                        &self.targets,
                        current_is_a,
                        use_crisp_history,
                    );
                }
            } else {
                if self.glitch_instance_count > 0 {
                    begin_glitch_pass(
                        &mut encoder,
                        effect_view(&self.targets, current_is_a),
                        &self.glitch_pipeline,
                        &self.global_bind,
                        glitch_history_bind,
                        self.glitch_instance_count,
                    );
                }
                if self.luma_key_enabled && self.luma_key_mix > 0.0 {
                    current_is_a = begin_ping_pong_stage(
                        &mut encoder,
                        "huff native luma key pass",
                        &self.luma_pipeline,
                        &self.global_bind,
                        &self.targets,
                        current_is_a,
                        use_crisp_history,
                    );
                }
                if self.scan_band_count > 0 {
                    begin_scan_pass(
                        &mut encoder,
                        effect_view(&self.targets, current_is_a),
                        &self.scan_pipeline,
                        &self.global_bind,
                        &self.targets.scan_bind,
                        self.scan_band_count,
                    );
                }
            }
        }

        if self.global_mix_enabled
            && self.global_mix_amount > 0.0
            && self.global_mix_position == "before"
        {
            current_is_a = begin_ping_pong_stage(
                &mut encoder,
                "huff native global mix before feedback",
                &self.global_mix_pipeline,
                &self.global_bind,
                &self.targets,
                current_is_a,
                use_crisp_history,
            );
        }

        if self.feedback > 0.0 {
            current_is_a = begin_ping_pong_stage(
                &mut encoder,
                "huff flying frame-buffer transform pass",
                &self.feedback_pipeline,
                &self.global_bind,
                &self.targets,
                current_is_a,
                use_crisp_history,
            );
        }

        if self.global_mix_enabled
            && self.global_mix_amount > 0.0
            && self.global_mix_position == "after"
        {
            current_is_a = begin_ping_pong_stage(
                &mut encoder,
                "huff native global mix after feedback",
                &self.global_mix_pipeline,
                &self.global_bind,
                &self.targets,
                current_is_a,
                use_crisp_history,
            );
        }

        if flow_active && !flow_done {
            current_is_a = begin_ping_pong_stage(
                &mut encoder,
                "huff native final flow warp",
                &self.flow_pipeline,
                &self.global_bind,
                &self.targets,
                current_is_a,
                use_crisp_history,
            );
            flow_done = true;
            if self.global_mix_enabled
                && self.global_mix_amount > 0.0
                && self.global_mix_position == "afterflow"
            {
                current_is_a = begin_ping_pong_stage(
                    &mut encoder,
                    "huff native global mix after flow",
                    &self.global_mix_pipeline,
                    &self.global_bind,
                    &self.targets,
                    current_is_a,
                    use_crisp_history,
                );
            }
        }

        if self.global_mix_enabled
            && self.global_mix_amount > 0.0
            && (self.global_mix_position == "final"
                || (self.global_mix_position == "afterflow" && !flow_done))
        {
            current_is_a = begin_ping_pong_stage(
                &mut encoder,
                "huff native final global mix",
                &self.global_mix_pipeline,
                &self.global_bind,
                &self.targets,
                current_is_a,
                use_crisp_history,
            );
        }

        self.effect_is_a = current_is_a;
        if source_sequence > 0 {
            self.effect_seeded = true;
        }

        let present_bind = if current_is_a {
            &self.targets.present_bind_a
        } else {
            &self.targets.present_bind_b
        };
        begin_fullscreen_pass(
            &mut encoder,
            "huff authoritative native output pass",
            &self.targets.output_view,
            &self.output_pipeline,
            &self.global_bind,
            3,
            present_bind,
            wgpu::Color::BLACK,
        );

        let output_targets = self.output_capture_targets(now);
        let readback_slot = self.output_readback.encode_copy(
            &mut encoder,
            &self.targets.output,
            output_targets,
            now,
        );

        let still_mapping_started = self.still_capture.encode_pending(
            &self.device,
            &mut encoder,
            &self.export_pipeline,
            &self.export_uniform_layout,
            &self.export_source_layout,
            &self.sampler,
            &self.crisp_sampler,
            &self.targets.output_view,
        );

        if let Some(surface_view) = surface_view.as_ref() {
            begin_fullscreen_pass(
                &mut encoder,
                "huff surface presentation pass",
                surface_view,
                &self.present_pipeline,
                &self.global_bind,
                3,
                &self.targets.output_surface_bind,
                wgpu::Color::BLACK,
            );
        }

        self.queue.submit([encoder.finish()]);
        if let Some(index) = readback_slot {
            self.output_readback.begin_mapping(index);
        }
        if still_mapping_started {
            self.still_capture.begin_mapping();
        }
        if let Some(frame) = surface_frame {
            frame.present();
            if reconfigure {
                self.surface.configure(&self.device, &self.config);
            }
        }
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
            if self.minimized
                && !self.syphon_enabled
                && !self.spout_enabled
                && !self.recording.info().active
                && !self.export.info().active
            {
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
        self.stop_syphon_output();
        self.stop_spout_output();
        if self.still_capture.busy() || self.export.info().active {
            self.export.fail("still export interrupted because the renderer stopped".into());
        }
        alive.store(false, Ordering::Relaxed);
    }
}

fn blend_mode_code(value: &str) -> f32 {
    match value {
        "screen" => 0.0,
        "lighter" => 1.0,
        "lighten" => 2.0,
        "color-dodge" => 3.0,
        "multiply" => 4.0,
        "darken" => 5.0,
        "color-burn" => 6.0,
        "overlay" => 7.0,
        "soft-light" => 8.0,
        "hard-light" => 9.0,
        "difference" => 10.0,
        "exclusion" => 11.0,
        "hue" => 12.0,
        "saturation" => 13.0,
        "color" => 14.0,
        "luminosity" => 15.0,
        _ => 16.0,
    }
}

fn global_mix_position_code(value: &str) -> f32 {
    match value {
        "before" => 0.0,
        "after" => 1.0,
        "afterflow" => 2.0,
        "final" => 3.0,
        _ => 1.0,
    }
}

fn flow_target_code(value: &str) -> f32 {
    match value {
        "glitch" => 1.0,
        "scan" => 2.0,
        _ => 0.0,
    }
}

fn create_glitch_history_bind(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    history_view: &wgpu::TextureView,
    sampler: &wgpu::Sampler,
    label: &str,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some(label),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 5,
                resource: wgpu::BindingResource::TextureView(history_view),
            },
            wgpu::BindGroupEntry {
                binding: 6,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
        ],
    })
}

fn create_glitch_pipeline(
    device: &wgpu::Device,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::PipelineLayout,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("huff native glitch tile pipeline"),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vs_glitch"),
            compilation_options: Default::default(),
            buffers: &[],
        },
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some("fs_glitch"),
            compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview_mask: None,
        cache: None,
    })
}

fn create_scan_pipeline(
    device: &wgpu::Device,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::PipelineLayout,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("huff native scanline pipeline"),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vs_scan"),
            compilation_options: Default::default(),
            buffers: &[],
        },
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some("fs_scan"),
            compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview_mask: None,
        cache: None,
    })
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
    clean_source_view: &wgpu::TextureView,
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
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::TextureView(clean_source_view),
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

fn create_output_texture(
    device: &wgpu::Device,
    label: &str,
    width: u32,
    height: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size: wgpu::Extent3d {
            width: width.max(1),
            height: height.max(1),
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: OUTPUT_FORMAT,
        usage: wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::RENDER_ATTACHMENT
            | wgpu::TextureUsages::COPY_SRC,
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
    scan_layout: &wgpu::BindGroupLayout,
    smoosh_layout: &wgpu::BindGroupLayout,
    present_layout: &wgpu::BindGroupLayout,
    sampler: &wgpu::Sampler,
    crisp_sampler: &wgpu::Sampler,
    history_view: &wgpu::TextureView,
) -> OffscreenTargets {
    let (composite, composite_view) = create_hdr_texture(device, "huff native composite target", width, height);
    let (feedback_a, feedback_a_view) = create_hdr_texture(device, "huff native feedback A", width, height);
    let (feedback_b, feedback_b_view) = create_hdr_texture(device, "huff native feedback B", width, height);
    let (glitch_layer, glitch_layer_view) = create_hdr_texture(device, "huff native isolated glitch layer", width, height);
    let (scan_layer, scan_layer_view) = create_hdr_texture(device, "huff native isolated scan layer", width, height);
    let (output, output_view) =
        create_output_texture(device, "huff native authoritative output", width, height);

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

    let scan_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("huff native scanline clean-source bind"),
        layout: scan_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&composite_view),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
        ],
    });

    let create_smoosh_bind = |label: &str, previous_effect: &wgpu::TextureView| {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some(label),
            layout: smoosh_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 7, resource: wgpu::BindingResource::TextureView(previous_effect) },
                wgpu::BindGroupEntry { binding: 8, resource: wgpu::BindingResource::TextureView(&glitch_layer_view) },
                wgpu::BindGroupEntry { binding: 9, resource: wgpu::BindingResource::TextureView(&scan_layer_view) },
                wgpu::BindGroupEntry { binding: 10, resource: wgpu::BindingResource::Sampler(sampler) },
            ],
        })
    };
    let smoosh_bind_a = create_smoosh_bind("smoosh bind reading A", &feedback_a_view);
    let smoosh_bind_b = create_smoosh_bind("smoosh bind reading B", &feedback_b_view);
    let present_bind_a = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("present bind A"), layout: present_layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&feedback_a_view) },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(sampler) },
            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(&composite_view) },
        ],
    });
    let present_bind_b = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("present bind B"), layout: present_layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(&feedback_b_view) },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(sampler) },
            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(&composite_view) },
        ],
    });
    let output_surface_bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("authoritative output surface bind"),
        layout: present_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&output_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::TextureView(&composite_view),
            },
        ],
    });

    OffscreenTargets {
        _composite: composite, composite_view,
        _feedback_a: feedback_a, feedback_a_view,
        _feedback_b: feedback_b, feedback_b_view,
        _glitch_layer: glitch_layer, glitch_layer_view,
        _scan_layer: scan_layer, scan_layer_view,
        output,
        output_view,
        output_surface_bind,
        feedback_bind_a_smooth,
        feedback_bind_b_smooth,
        feedback_bind_a_crisp,
        feedback_bind_b_crisp,
        present_bind_a,
        present_bind_b,
        smoosh_bind_a,
        smoosh_bind_b,
        scan_bind,
    }
}

fn clear_texture_target(
    encoder: &mut wgpu::CommandEncoder,
    label: &str,
    view: &wgpu::TextureView,
) {
    let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some(label),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            depth_slice: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }),
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
}

fn effect_view(targets: &OffscreenTargets, is_a: bool) -> &wgpu::TextureView {
    if is_a { &targets.feedback_a_view } else { &targets.feedback_b_view }
}

fn begin_ping_pong_stage(
    encoder: &mut wgpu::CommandEncoder,
    label: &str,
    pipeline: &wgpu::RenderPipeline,
    global_bind: &wgpu::BindGroup,
    targets: &OffscreenTargets,
    input_is_a: bool,
    crisp_history: bool,
) -> bool {
    let (output_view, input_bind) = if input_is_a {
        (
            &targets.feedback_b_view,
            if crisp_history { &targets.feedback_bind_b_crisp } else { &targets.feedback_bind_b_smooth },
        )
    } else {
        (
            &targets.feedback_a_view,
            if crisp_history { &targets.feedback_bind_a_crisp } else { &targets.feedback_bind_a_smooth },
        )
    };
    begin_feedback_pass(encoder, label, output_view, pipeline, global_bind, input_bind);
    !input_is_a
}

fn begin_smoosh_stage(
    encoder: &mut wgpu::CommandEncoder,
    pipeline: &wgpu::RenderPipeline,
    global_bind: &wgpu::BindGroup,
    targets: &OffscreenTargets,
    input_is_a: bool,
) -> bool {
    let (output_view, input_bind) = if input_is_a {
        (&targets.feedback_b_view, &targets.smoosh_bind_a)
    } else {
        (&targets.feedback_a_view, &targets.smoosh_bind_b)
    };
    begin_feedback_pass(
        encoder,
        "huff native smoosh blend pass",
        output_view,
        pipeline,
        global_bind,
        input_bind,
    );
    !input_is_a
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

fn begin_glitch_pass(
    encoder: &mut wgpu::CommandEncoder,
    view: &wgpu::TextureView,
    pipeline: &wgpu::RenderPipeline,
    global_bind: &wgpu::BindGroup,
    history_bind: &wgpu::BindGroup,
    instance_count: u32,
) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("huff native temporal glitch tile pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            depth_slice: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Load,
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
    pass.set_bind_group(2, history_bind, &[]);
    pass.draw(0..6, 0..instance_count);
}

fn begin_scan_pass(
    encoder: &mut wgpu::CommandEncoder,
    view: &wgpu::TextureView,
    pipeline: &wgpu::RenderPipeline,
    global_bind: &wgpu::BindGroup,
    scan_bind: &wgpu::BindGroup,
    instance_count: u32,
) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("huff native scanline band pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            depth_slice: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Load,
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
    pass.set_bind_group(2, scan_bind, &[]);
    pass.draw(0..6, 0..instance_count);
}

fn begin_feedback_pass(
    encoder: &mut wgpu::CommandEncoder,
    label: &str,
    view: &wgpu::TextureView,
    pipeline: &wgpu::RenderPipeline,
    global_bind: &wgpu::BindGroup,
    feedback_bind: &wgpu::BindGroup,
) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some(label),
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
