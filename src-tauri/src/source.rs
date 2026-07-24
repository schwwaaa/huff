use serde::Serialize;
use std::sync::{
    atomic::{AtomicU8, Ordering},
    Arc,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ActiveSource {
    Automatic = 0,
    Video = 1,
    Camera = 2,
    None = 3,
}

impl ActiveSource {
    pub fn from_code(code: u8) -> Self {
        match code {
            1 => Self::Video,
            2 => Self::Camera,
            3 => Self::None,
            _ => Self::Automatic,
        }
    }

    pub fn code(self) -> u8 {
        self as u8
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Automatic => "automatic",
            Self::Video => "video",
            Self::Camera => "camera",
            Self::None => "none",
        }
    }
}

#[derive(Clone)]
pub struct SourceSelector {
    active: Arc<AtomicU8>,
}

impl SourceSelector {
    pub fn new(initial: ActiveSource) -> Self {
        Self {
            active: Arc::new(AtomicU8::new(initial.code())),
        }
    }

    pub fn get(&self) -> ActiveSource {
        ActiveSource::from_code(self.active.load(Ordering::Acquire))
    }

    pub fn set(&self, source: ActiveSource) {
        self.active.store(source.code(), Ordering::Release);
    }

    pub fn shader_code(&self) -> f32 {
        self.get().code() as f32
    }
}
