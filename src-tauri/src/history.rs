pub const HISTORY_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;
pub const HISTORY_MEMORY_BUDGET_BYTES: u64 = 192 * 1024 * 1024;

pub struct GpuHistoryRing {
    _texture: wgpu::Texture,
    array_view: wgpu::TextureView,
    layer_views: Vec<wgpu::TextureView>,
    pub width: u32,
    pub height: u32,
    pub capacity: u32,
    pub count: u32,
    pub write_index: u32,
    pub captured_frames: u64,
    pub rate_skips: u64,
    pub rebuilds: u64,
    last_capture_seconds: Option<f64>,
    last_evaluated_sequence: u64,
}

impl GpuHistoryRing {
    pub fn capacity_for(
        width: u32,
        height: u32,
        quality: f32,
        max_array_layers: u32,
    ) -> u32 {
        let bytes_per_frame = u64::from(width.max(1))
            .saturating_mul(u64::from(height.max(1)))
            .saturating_mul(4);
        let memory_cap = if bytes_per_frame == 0 {
            4
        } else {
            (HISTORY_MEMORY_BUDGET_BYTES / bytes_per_frame).max(1) as u32
        };
        let desired = (60.0 * (quality.clamp(0.0, 3.0) * 2.0))
            .round()
            .max(4.0) as u32;
        desired.min(memory_cap).min(max_array_layers.max(1)).max(1)
    }

    pub fn new(
        device: &wgpu::Device,
        width: u32,
        height: u32,
        capacity: u32,
        rebuilds: u64,
    ) -> Self {
        let width = width.max(1);
        let height = height.max(1);
        let capacity = capacity.max(1);
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("huff GPU temporal history array"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: capacity,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: HISTORY_FORMAT,
            usage: wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let array_view = texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("huff GPU temporal history array view"),
            dimension: Some(wgpu::TextureViewDimension::D2Array),
            base_array_layer: 0,
            array_layer_count: Some(capacity),
            ..Default::default()
        });
        let layer_views = (0..capacity)
            .map(|layer| {
                texture.create_view(&wgpu::TextureViewDescriptor {
                    label: Some("huff GPU temporal history layer"),
                    dimension: Some(wgpu::TextureViewDimension::D2),
                    base_array_layer: layer,
                    array_layer_count: Some(1),
                    ..Default::default()
                })
            })
            .collect::<Vec<_>>();
        Self {
            _texture: texture,
            array_view,
            layer_views,
            width,
            height,
            capacity,
            count: 0,
            write_index: 0,
            captured_frames: 0,
            rate_skips: 0,
            rebuilds,
            last_capture_seconds: None,
            last_evaluated_sequence: 0,
        }
    }

    pub fn newest_layer(&self) -> u32 {
        if self.count == 0 {
            0
        } else {
            (self.write_index + self.capacity - 1) % self.capacity
        }
    }

    pub fn layer_view(&self, index: u32) -> &wgpu::TextureView {
        &self.layer_views[index.min(self.capacity - 1) as usize]
    }

    pub fn layer_from_end(&self, offset: u32) -> Option<u32> {
        if self.count == 0 || offset >= self.count {
            return None;
        }
        Some((self.write_index + self.capacity - 1 - offset) % self.capacity)
    }

    pub fn reserve_capture(
        &mut self,
        source_sequence: u64,
        capture_rate: &str,
        now_seconds: f64,
    ) -> Option<u32> {
        if source_sequence == 0 || source_sequence == self.last_evaluated_sequence {
            return None;
        }
        self.last_evaluated_sequence = source_sequence;
        if let Some(interval_seconds) = capture_interval_seconds(capture_rate) {
            if self
                .last_capture_seconds
                .map(|last| now_seconds - last + 1.0e-9 < interval_seconds)
                .unwrap_or(false)
            {
                self.rate_skips = self.rate_skips.wrapping_add(1);
                return None;
            }
        }
        let layer = self.write_index;
        self.write_index = (self.write_index + 1) % self.capacity;
        self.count = (self.count + 1).min(self.capacity);
        self.captured_frames = self.captured_frames.wrapping_add(1);
        self.last_capture_seconds = Some(now_seconds);
        Some(layer)
    }

    pub fn clear(&mut self) {
        self.count = 0;
        self.write_index = 0;
        self.last_capture_seconds = None;
        self.last_evaluated_sequence = 0;
    }

    pub fn estimated_bytes(&self) -> u64 {
        u64::from(self.width)
            .saturating_mul(u64::from(self.height))
            .saturating_mul(u64::from(self.capacity))
            .saturating_mul(4)
    }

    pub fn array_view(&self) -> &wgpu::TextureView {
        &self.array_view
    }
}

fn capture_interval_seconds(rate: &str) -> Option<f64> {
    let fps = match rate {
        "30" => 30.0,
        "24" => 24.0,
        "15" => 15.0,
        "10" => 10.0,
        _ => return None,
    };
    Some(1.0 / fps)
}
