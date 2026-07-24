#[cfg(target_os = "macos")]
#[path = "camera_avfoundation.rs"]
mod platform;

#[cfg(not(target_os = "macos"))]
#[path = "camera_nokhwa.rs"]
mod platform;

pub use platform::*;
