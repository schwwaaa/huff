use crate::output_frame::ExternalOutputFrame;
use serde::Serialize;

#[cfg(target_os = "macos")]
mod imp {
    use super::{ExternalOutputFrame, Serialize};
    use objc::runtime::{Class, Object, NO, YES};
    use once_cell::sync::Lazy;
    use std::{
        ffi::CString,
        os::raw::c_void,
        sync::{
            atomic::{AtomicU64, Ordering},
            Condvar, Mutex, Once,
        },
        thread,
        time::Instant,
    };

    #[link(name = "Metal", kind = "framework")]
    extern "C" {
        fn MTLCreateSystemDefaultDevice() -> *mut Object;
    }

    #[link(name = "Foundation", kind = "framework")]
    extern "C" {}

    const MTL_PIXEL_FORMAT_RGBA8_UNORM: u64 = 70;
    const MTL_STORAGE_MODE_SHARED: u64 = 0;
    const MTL_TEXTURE_USAGE_SHADER_READ: u64 = 0x0001;
    const MTL_TEXTURE_USAGE_RENDER_TARGET: u64 = 0x0004;
    const MAX_FRAME_WIDTH: u32 = 8192;
    const MAX_FRAME_HEIGHT: u32 = 8192;

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct MTLOrigin {
        x: u64,
        y: u64,
        z: u64,
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct MTLSize {
        width: u64,
        height: u64,
        depth: u64,
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct MTLRegion {
        origin: MTLOrigin,
        size: MTLSize,
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct NSPoint {
        x: f64,
        y: f64,
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct NSSize {
        width: f64,
        height: f64,
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct NSRect {
        origin: NSPoint,
        size: NSSize,
    }

    struct SyphonState {
        device: *mut Object,
        queue: *mut Object,
        server: *mut Object,
        texture: *mut Object,
        width: u32,
        height: u32,
        fps: u32,
    }

    unsafe impl Send for SyphonState {}

    static STATE: Lazy<Mutex<Option<SyphonState>>> = Lazy::new(|| Mutex::new(None));
    static PENDING: Lazy<(Mutex<Option<ExternalOutputFrame>>, Condvar)> =
        Lazy::new(|| (Mutex::new(None), Condvar::new()));
    static WORKER: Once = Once::new();
    static LAST_ERROR: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new(String::new()));

    static RECEIVED: AtomicU64 = AtomicU64::new(0);
    static PUBLISHED: AtomicU64 = AtomicU64::new(0);
    static REPLACED: AtomicU64 = AtomicU64::new(0);
    static REJECTED: AtomicU64 = AtomicU64::new(0);
    static LAST_UPLOAD_US: AtomicU64 = AtomicU64::new(0);
    static LAST_FRAME_AGE_US: AtomicU64 = AtomicU64::new(0);

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SyphonInfo {
        pub available: bool,
        pub active: bool,
        pub width: u32,
        pub height: u32,
        pub fps: u32,
        pub received_frames: u64,
        pub published_frames: u64,
        pub replaced_frames: u64,
        pub rejected_frames: u64,
        pub last_upload_us: u64,
        pub last_frame_age_ms: f64,
        pub transport: String,
        pub native_texture_sharing: bool,
        pub last_error: String,
    }

    fn set_error(error: impl Into<String>) {
        *LAST_ERROR.lock().expect("Syphon error lock poisoned") = error.into();
    }

    fn clear_pending() {
        PENDING.0.lock().expect("Syphon pending lock poisoned").take();
    }

    fn valid_dimensions(width: u32, height: u32) -> bool {
        width > 0
            && height > 0
            && width <= MAX_FRAME_WIDTH
            && height <= MAX_FRAME_HEIGHT
            && (width as usize)
                .checked_mul(height as usize)
                .and_then(|value| value.checked_mul(4))
                .is_some()
    }

    fn ensure_framework_loaded() -> Result<(), String> {
        if Class::get("SyphonMetalServer").is_some() {
            return Ok(());
        }
        let home = std::env::var("HOME").unwrap_or_default();
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(|path| path.to_path_buf()))
            .unwrap_or_default();
        let app_bundled = exe_dir
            .parent()
            .map(|path| path.join("Frameworks/Syphon.framework"))
            .unwrap_or_default();
        let dev_bundled = exe_dir
            .ancestors()
            .nth(3)
            .map(|path| path.join("src-tauri/frameworks/Syphon.framework"))
            .unwrap_or_default();
        let candidates = [
            app_bundled.to_string_lossy().into_owned(),
            dev_bundled.to_string_lossy().into_owned(),
            format!("{home}/Library/Frameworks/Syphon.framework"),
            "/Library/Frameworks/Syphon.framework".to_string(),
        ];

        for path in candidates {
            if !std::path::Path::new(&path).exists() {
                continue;
            }
            unsafe {
                let string_class = Class::get("NSString").ok_or("NSString unavailable")?;
                let c_path = CString::new(path.as_str()).map_err(|error| error.to_string())?;
                let ns_path: *mut Object =
                    msg_send![string_class, stringWithUTF8String: c_path.as_ptr()];
                let bundle_class = Class::get("NSBundle").ok_or("NSBundle unavailable")?;
                let bundle: *mut Object = msg_send![bundle_class, bundleWithPath: ns_path];
                if bundle.is_null() {
                    continue;
                }
                let loaded: bool = msg_send![bundle, load];
                if loaded {
                    println!("[syphon] loaded framework from {path}");
                    return Ok(());
                }
            }
        }
        Err("Syphon.framework was not found in the application bundle, src-tauri/frameworks, ~/Library/Frameworks, or /Library/Frameworks".into())
    }

    unsafe fn create_texture(
        device: *mut Object,
        width: u32,
        height: u32,
    ) -> Result<*mut Object, String> {
        let descriptor_class =
            Class::get("MTLTextureDescriptor").ok_or("MTLTextureDescriptor unavailable")?;
        let descriptor: *mut Object = msg_send![
            descriptor_class,
            texture2DDescriptorWithPixelFormat: MTL_PIXEL_FORMAT_RGBA8_UNORM
            width: width as u64
            height: height as u64
            mipmapped: NO
        ];
        let _: () = msg_send![descriptor, setStorageMode: MTL_STORAGE_MODE_SHARED];
        let _: () = msg_send![descriptor, setUsage: MTL_TEXTURE_USAGE_SHADER_READ | MTL_TEXTURE_USAGE_RENDER_TARGET];
        let texture: *mut Object = msg_send![device, newTextureWithDescriptor: descriptor];
        if texture.is_null() {
            Err("Metal texture creation failed".into())
        } else {
            Ok(texture)
        }
    }

    unsafe fn release_state(state: SyphonState) {
        let _: () = msg_send![state.server, stop];
        let _: () = msg_send![state.texture, release];
        let _: () = msg_send![state.server, release];
        let _: () = msg_send![state.queue, release];
        let _: () = msg_send![state.device, release];
    }

    fn publish(submission: ExternalOutputFrame) {
        let transport = submission.transport_id();
        let Ok(frame) = submission.into_cpu_rgba() else {
            REJECTED.fetch_add(1, Ordering::Relaxed);
            set_error(format!("unsupported Syphon transport: {transport}"));
            return;
        };
        if !frame.is_valid() {
            REJECTED.fetch_add(1, Ordering::Relaxed);
            return;
        }
        let guard = STATE.lock().expect("Syphon state lock poisoned");
        let state = match guard.as_ref() {
            Some(state) if state.width == frame.width && state.height == frame.height => state,
            Some(state) => {
                REJECTED.fetch_add(1, Ordering::Relaxed);
                set_error(format!(
                    "readback {}×{} does not match active Syphon {}×{}",
                    frame.width, frame.height, state.width, state.height
                ));
                return;
            }
            None => return,
        };

        let started = Instant::now();
        unsafe {
            let pool: *mut Object = match Class::get("NSAutoreleasePool") {
                Some(class) => msg_send![class, new],
                None => std::ptr::null_mut(),
            };
            let region = MTLRegion {
                origin: MTLOrigin { x: 0, y: 0, z: 0 },
                size: MTLSize {
                    width: frame.width as u64,
                    height: frame.height as u64,
                    depth: 1,
                },
            };
            let _: () = msg_send![
                state.texture,
                replaceRegion: region
                mipmapLevel: 0usize
                withBytes: frame.pixels.as_ptr() as *const c_void
                bytesPerRow: (frame.width * 4) as u64
            ];
            let command_buffer: *mut Object = msg_send![state.queue, commandBuffer];
            if command_buffer.is_null() {
                REJECTED.fetch_add(1, Ordering::Relaxed);
                set_error("Syphon Metal command buffer creation failed");
                if !pool.is_null() {
                    let _: () = msg_send![pool, drain];
                }
                return;
            }
            let rect = NSRect {
                origin: NSPoint { x: 0.0, y: 0.0 },
                size: NSSize {
                    width: frame.width as f64,
                    height: frame.height as f64,
                },
            };
            let _: () = msg_send![
                state.server,
                publishFrameTexture: state.texture
                onCommandBuffer: command_buffer
                imageRegion: rect
                flipped: YES
            ];
            let _: () = msg_send![command_buffer, commit];
            let _: () = msg_send![command_buffer, waitUntilCompleted];
            if !pool.is_null() {
                let _: () = msg_send![pool, drain];
            }
        }
        LAST_UPLOAD_US.store(started.elapsed().as_micros() as u64, Ordering::Relaxed);
        LAST_FRAME_AGE_US.store(frame.captured_at.elapsed().as_micros() as u64, Ordering::Relaxed);
        PUBLISHED.fetch_add(1, Ordering::Relaxed);
    }

    pub fn start_worker() {
        WORKER.call_once(|| {
            thread::Builder::new()
                .name("huff-native-syphon".into())
                .spawn(|| loop {
                    let frame = {
                        let mut pending = PENDING.0.lock().expect("Syphon pending lock poisoned");
                        while pending.is_none() {
                            pending = PENDING.1.wait(pending).expect("Syphon pending wait poisoned");
                        }
                        pending.take().expect("Syphon frame vanished")
                    };
                    publish(frame);
                })
                .expect("could not start Syphon worker");
        });
    }

    pub fn start(width: u32, height: u32, fps: u32) -> Result<(), String> {
        if !valid_dimensions(width, height) {
            return Err(format!("invalid Syphon dimensions: {width}×{height}"));
        }
        if let Err(error) = ensure_framework_loaded() {
            set_error(error.clone());
            return Err(error);
        }
        let mut guard = STATE.lock().expect("Syphon state lock poisoned");
        if let Some(previous) = guard.take() {
            unsafe { release_state(previous) };
        }
        clear_pending();
        unsafe {
            let device = MTLCreateSystemDefaultDevice();
            if device.is_null() {
                return Err("Metal device unavailable".into());
            }
            let queue: *mut Object = msg_send![device, newCommandQueue];
            if queue.is_null() {
                let _: () = msg_send![device, release];
                return Err("Metal command queue creation failed".into());
            }
            let server_class =
                Class::get("SyphonMetalServer").ok_or("SyphonMetalServer unavailable")?;
            let string_class = Class::get("NSString").ok_or("NSString unavailable")?;
            let name = CString::new("huff").map_err(|error| error.to_string())?;
            let ns_name: *mut Object =
                msg_send![string_class, stringWithUTF8String: name.as_ptr()];
            let allocation: *mut Object = msg_send![server_class, alloc];
            let server: *mut Object = msg_send![
                allocation,
                initWithName: ns_name
                device: device
                options: std::ptr::null_mut::<Object>()
            ];
            if server.is_null() {
                let _: () = msg_send![queue, release];
                let _: () = msg_send![device, release];
                return Err("SyphonMetalServer initialization failed".into());
            }
            let texture = create_texture(device, width, height)?;
            *guard = Some(SyphonState {
                device,
                queue,
                server,
                texture,
                width,
                height,
                fps: fps.clamp(1, 60),
            });
        }
        RECEIVED.store(0, Ordering::Relaxed);
        PUBLISHED.store(0, Ordering::Relaxed);
        REPLACED.store(0, Ordering::Relaxed);
        REJECTED.store(0, Ordering::Relaxed);
        LAST_UPLOAD_US.store(0, Ordering::Relaxed);
        LAST_FRAME_AGE_US.store(0, Ordering::Relaxed);
        set_error("");
        println!("[syphon] native output started — {width}×{height} @ {} fps", fps.clamp(1, 60));
        Ok(())
    }

    pub fn stop() {
        clear_pending();
        if let Some(state) = STATE.lock().expect("Syphon state lock poisoned").take() {
            unsafe { release_state(state) };
            println!("[syphon] native output stopped");
        }
    }

    pub fn submit(frame: ExternalOutputFrame) {
        RECEIVED.fetch_add(1, Ordering::Relaxed);
        let mut pending = PENDING.0.lock().expect("Syphon pending lock poisoned");
        if pending.replace(frame).is_some() {
            REPLACED.fetch_add(1, Ordering::Relaxed);
        }
        PENDING.1.notify_one();
    }

    pub fn info() -> SyphonInfo {
        let guard = STATE.lock().expect("Syphon state lock poisoned");
        let (active, width, height, fps) = guard
            .as_ref()
            .map(|state| (true, state.width, state.height, state.fps))
            .unwrap_or((false, 0, 0, 0));
        SyphonInfo {
            available: true,
            active,
            width,
            height,
            fps,
            received_frames: RECEIVED.load(Ordering::Relaxed),
            published_frames: PUBLISHED.load(Ordering::Relaxed),
            replaced_frames: REPLACED.load(Ordering::Relaxed),
            rejected_frames: REJECTED.load(Ordering::Relaxed),
            last_upload_us: LAST_UPLOAD_US.load(Ordering::Relaxed),
            last_frame_age_ms: LAST_FRAME_AGE_US.load(Ordering::Relaxed) as f64 / 1000.0,
            transport: "cpu-readback-upload".into(),
            native_texture_sharing: false,
            last_error: LAST_ERROR.lock().expect("Syphon error lock poisoned").clone(),
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::{ExternalOutputFrame, Serialize};

    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SyphonInfo {
        pub available: bool,
        pub active: bool,
        pub width: u32,
        pub height: u32,
        pub fps: u32,
        pub received_frames: u64,
        pub published_frames: u64,
        pub replaced_frames: u64,
        pub rejected_frames: u64,
        pub last_upload_us: u64,
        pub last_frame_age_ms: f64,
        pub transport: String,
        pub native_texture_sharing: bool,
        pub last_error: String,
    }

    pub fn start_worker() {}
    pub fn start(_width: u32, _height: u32, _fps: u32) -> Result<(), String> {
        Err("Syphon is available only on macOS".into())
    }
    pub fn stop() {}
    pub fn submit(_frame: ExternalOutputFrame) {}
    pub fn info() -> SyphonInfo {
        SyphonInfo {
            available: false,
            active: false,
            width: 0,
            height: 0,
            fps: 0,
            received_frames: 0,
            published_frames: 0,
            replaced_frames: 0,
            rejected_frames: 0,
            last_upload_us: 0,
            last_frame_age_ms: 0.0,
            transport: "unavailable".into(),
            native_texture_sharing: false,
            last_error: "Syphon is available only on macOS".into(),
        }
    }
}

pub use imp::{info, start, start_worker, stop, submit, SyphonInfo};
