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
