use std::{sync::Arc, time::Instant};

/// One dense RGBA8 frame copied from Huff's authoritative native output texture.
/// Pixel memory is reference-counted so Syphon and Spout can consume the same
/// readback without duplicating an entire frame.
#[derive(Clone)]
pub struct OutputFrame {
    pub width: u32,
    pub height: u32,
    pub pixels: Arc<[u8]>,
    pub captured_at: Instant,
}

impl OutputFrame {
    pub fn new(width: u32, height: u32, pixels: Vec<u8>) -> Self {
        Self {
            width,
            height,
            pixels: Arc::from(pixels.into_boxed_slice()),
            captured_at: Instant::now(),
        }
    }

    pub fn expected_len(&self) -> Option<usize> {
        (self.width as usize)
            .checked_mul(self.height as usize)?
            .checked_mul(4)
    }

    pub fn is_valid(&self) -> bool {
        self.width > 0
            && self.height > 0
            && self.expected_len() == Some(self.pixels.len())
    }
}

/// Typed submission boundary for external GPU-sharing systems.
///
/// Milestone 21 keeps CPU RGBA readback as the only production transport, but
/// Syphon and Spout now receive this enum rather than assuming that every future
/// submission must be CPU pixels. A feature-gated Metal, D3D, or Vulkan token can
/// be added here later without changing the control surface or output-worker API.
#[derive(Clone)]
pub enum ExternalOutputFrame {
    CpuRgba(OutputFrame),
}

impl ExternalOutputFrame {
    pub fn cpu_rgba(frame: OutputFrame) -> Self {
        Self::CpuRgba(frame)
    }

    pub fn transport_id(&self) -> &'static str {
        match self {
            Self::CpuRgba(_) => "cpu-readback-upload",
        }
    }

    pub fn into_cpu_rgba(self) -> Result<OutputFrame, &'static str> {
        match self {
            Self::CpuRgba(frame) => Ok(frame),
        }
    }
}
