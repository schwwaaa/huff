// src-tauri/src/syphon.rs
// macOS only — bundled Syphon output via SyphonMetalServer ObjC FFI.
//
// Required project layout:
//   src-tauri/frameworks/Syphon.framework
//
// Production bundle layout:
//   <app>.app/Contents/Frameworks/Syphon.framework
//
// Pipeline:
//   controls WebView → dedicated raw-RGBA WebSocket → push_pixels()
//   → persistent shared MTLTexture → SyphonMetalServer
//
// HUFF Classic remains a WebView/Canvas2D renderer, so one GPU→CPU readback in
// JavaScript and one CPU→GPU upload here remain unavoidable. The surrounding
// path is bounded, client-aware, allocation-conscious, and latest-frame-only.

use objc::runtime::{Class, Object, YES};
use once_cell::sync::Lazy;
use std::ffi::CString;
use std::os::raw::c_void;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

#[link(name = "Metal", kind = "framework")]
extern "C" {
    fn MTLCreateSystemDefaultDevice() -> *mut Object;
}

#[link(name = "Foundation", kind = "framework")]
extern "C" {}

const MTL_PIXEL_FORMAT_RGBA8_UNORM: u64 = 70;
const MTL_STORAGE_MODE_SHARED: u64 = 0;
const MTL_TEXTURE_USAGE_RENDER_TARGET: u64 = 0x0004;
const MTL_TEXTURE_USAGE_SHADER_READ: u64 = 0x0001;

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

const TEXTURE_COUNT: usize = 3;

struct SyphonState {
    device: *mut Object,
    queue: *mut Object,
    server: *mut Object,
    textures: [*mut Object; TEXTURE_COUNT],
    next_texture: usize,
    width: u32,
    height: u32,
}

unsafe impl Send for SyphonState {}

static SYPHON: Lazy<Mutex<Option<SyphonState>>> = Lazy::new(|| Mutex::new(None));

pub static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);

/// Tokio's worker threads do not automatically own a Cocoa autorelease pool.
/// Syphon and Metal return autoreleased Objective-C objects (notably command
/// buffers), so each native interaction is wrapped in a short-lived pool.
unsafe fn with_autorelease_pool<T>(f: impl FnOnce() -> T) -> T {
    let pool = Class::get("NSAutoreleasePool").map(|cls| {
        let allocated: *mut Object = msg_send![cls, alloc];
        let initialized: *mut Object = msg_send![allocated, init];
        initialized
    });

    let result = f();

    if let Some(pool) = pool {
        if !pool.is_null() {
            let _: () = msg_send![pool, drain];
        }
    }
    result
}

unsafe fn make_texture(
    device: *mut Object,
    width: u32,
    height: u32,
) -> Result<*mut Object, String> {
    let desc_cls = Class::get("MTLTextureDescriptor")
        .ok_or("MTLTextureDescriptor not available")?;

    let desc: *mut Object = msg_send![
        desc_cls,
        texture2DDescriptorWithPixelFormat: MTL_PIXEL_FORMAT_RGBA8_UNORM
        width: width as u64
        height: height as u64
        mipmapped: objc::runtime::NO
    ];
    if desc.is_null() {
        return Err("MTLTextureDescriptor creation failed".into());
    }

    let _: () = msg_send![desc, setStorageMode: MTL_STORAGE_MODE_SHARED];
    let _: () = msg_send![
        desc,
        setUsage: MTL_TEXTURE_USAGE_RENDER_TARGET | MTL_TEXTURE_USAGE_SHADER_READ
    ];

    let texture: *mut Object = msg_send![device, newTextureWithDescriptor: desc];
    if texture.is_null() {
        return Err("newTextureWithDescriptor returned nil".into());
    }
    Ok(texture)
}

unsafe fn release_state(state: SyphonState) {
    with_autorelease_pool(|| {
        if !state.server.is_null() {
            let _: () = msg_send![state.server, stop];
        }
        for texture in state.textures {
            if !texture.is_null() {
                let _: () = msg_send![texture, release];
            }
        }
        if !state.server.is_null() {
            let _: () = msg_send![state.server, release];
        }
        if !state.queue.is_null() {
            let _: () = msg_send![state.queue, release];
        }
        if !state.device.is_null() {
            let _: () = msg_send![state.device, release];
        }
    });
}

fn ensure_framework_loaded() -> Result<(), String> {
    if Class::get("SyphonMetalServer").is_some() {
        return Ok(());
    }

    let home = std::env::var("HOME").unwrap_or_default();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    let app_bundled = exe_dir
        .parent()
        .map(|p| p.join("Frameworks/Syphon.framework"))
        .unwrap_or_default();

    // target/debug/huff → src-tauri/frameworks/Syphon.framework
    let dev_bundled = exe_dir
        .ancestors()
        .nth(3)
        .map(|p| p.join("src-tauri/frameworks/Syphon.framework"))
        .unwrap_or_default();

    let candidates = [
        app_bundled.to_string_lossy().into_owned(),
        dev_bundled.to_string_lossy().into_owned(),
        format!("{home}/Library/Frameworks/Syphon.framework"),
        "/Library/Frameworks/Syphon.framework".to_string(),
    ];

    for path in &candidates {
        if !std::path::Path::new(path).exists() {
            continue;
        }

        let loaded = unsafe {
            with_autorelease_pool(|| {
                let Some(str_cls) = Class::get("NSString") else {
                    return false;
                };
                let Ok(cpath) = CString::new(path.as_str()) else {
                    return false;
                };
                let ns_path: *mut Object = msg_send![
                    str_cls,
                    stringWithUTF8String: cpath.as_ptr()
                ];

                let Some(bundle_cls) = Class::get("NSBundle") else {
                    return false;
                };
                let bundle: *mut Object = msg_send![bundle_cls, bundleWithPath: ns_path];
                if bundle.is_null() {
                    return false;
                }

                let ok: bool = msg_send![bundle, load];
                ok
            })
        };

        if loaded && Class::get("SyphonMetalServer").is_some() {
            println!("[syphon] loaded Syphon.framework from {path}");
            return Ok(());
        }
    }

    Err(
        "Syphon.framework could not be loaded.\n\
         Expected locations:\n\
         • <app>.app/Contents/Frameworks/Syphon.framework (production)\n\
         • src-tauri/frameworks/Syphon.framework (development)\n\
         HUFF Classic requires the framework to be bundled on macOS."
            .into(),
    )
}

pub fn start(width: u32, height: u32) -> Result<(), String> {
    if width == 0 || height == 0 {
        return Err("Syphon dimensions must be greater than zero".into());
    }

    ensure_framework_loaded()?;

    let mut guard = SYPHON.lock().unwrap();
    if let Some(old) = guard.take() {
        unsafe { release_state(old) };
    }

    let state = unsafe {
        with_autorelease_pool(|| -> Result<SyphonState, String> {
            let device = MTLCreateSystemDefaultDevice();
            if device.is_null() {
                return Err(
                    "MTLCreateSystemDefaultDevice returned nil — Metal is unavailable".into(),
                );
            }

            let queue: *mut Object = msg_send![device, newCommandQueue];
            if queue.is_null() {
                let _: () = msg_send![device, release];
                return Err("newCommandQueue failed".into());
            }

            let cls = Class::get("SyphonMetalServer")
                .ok_or("SyphonMetalServer class missing after framework load")?;
            let str_cls = Class::get("NSString").ok_or("NSString missing")?;
            let cname = CString::new("huff").unwrap();
            let ns_name: *mut Object = msg_send![
                str_cls,
                stringWithUTF8String: cname.as_ptr()
            ];

            let alloc: *mut Object = msg_send![cls, alloc];
            let server: *mut Object = msg_send![
                alloc,
                initWithName: ns_name
                device: device
                options: std::ptr::null_mut::<Object>()
            ];

            if server.is_null() {
                let _: () = msg_send![queue, release];
                let _: () = msg_send![device, release];
                return Err(
                    "SyphonMetalServer initWithName:device:options: returned nil".into(),
                );
            }

            let mut textures = [std::ptr::null_mut(); TEXTURE_COUNT];
            for i in 0..TEXTURE_COUNT {
                match make_texture(device, width, height) {
                    Ok(texture) => textures[i] = texture,
                    Err(error) => {
                        for allocated in textures.iter().take(i) {
                            if !allocated.is_null() {
                                let _: () = msg_send![*allocated, release];
                            }
                        }
                        let _: () = msg_send![server, stop];
                        let _: () = msg_send![server, release];
                        let _: () = msg_send![queue, release];
                        let _: () = msg_send![device, release];
                        return Err(error);
                    }
                }
            }

            Ok(SyphonState {
                device,
                queue,
                server,
                textures,
                next_texture: 0,
                width,
                height,
            })
        })
    }?;

    FRAME_COUNT.store(0, Ordering::Relaxed);
    println!(
        "[syphon] server started — {width}×{height} — source name 'huff'"
    );
    *guard = Some(state);
    Ok(())
}

pub fn stop() {
    let mut guard = SYPHON.lock().unwrap();
    if let Some(state) = guard.take() {
        unsafe { release_state(state) };
        println!("[syphon] server stopped");
    }
}

pub fn is_active() -> bool {
    SYPHON.lock().unwrap().is_some()
}

pub fn has_clients() -> bool {
    let guard = SYPHON.lock().unwrap();
    let Some(state) = guard.as_ref() else {
        return false;
    };

    unsafe {
        with_autorelease_pool(|| {
            let value: bool = msg_send![state.server, hasClients];
            value
        })
    }
}

pub fn status() -> String {
    let guard = SYPHON.lock().unwrap();
    match &*guard {
        None => "stopped".into(),
        Some(state) => {
            let frames = FRAME_COUNT.load(Ordering::Relaxed);
            let clients = unsafe {
                with_autorelease_pool(|| {
                    let value: bool = msg_send![state.server, hasClients];
                    value
                })
            };
            format!(
                "active — {}×{} — {} — {} frames published",
                state.width,
                state.height,
                if clients {
                    "receiver connected"
                } else {
                    "waiting for receiver"
                },
                frames
            )
        }
    }
}

/// Uploads one fixed-size raw RGBA frame. Returns true only when a receiver was
/// attached and the frame was published. No Metal upload or command buffer is
/// created while the server has no clients.
pub fn push_pixels(width: u32, height: u32, pixels: &[u8]) -> bool {
    let expected = (width as usize)
        .saturating_mul(height as usize)
        .saturating_mul(4);
    if width == 0 || height == 0 || pixels.len() < expected {
        eprintln!(
            "[syphon] bad frame: {width}×{height} needs {expected} bytes, got {}",
            pixels.len()
        );
        return false;
    }

    let mut guard = SYPHON.lock().unwrap();
    let Some(state) = guard.as_mut() else {
        return false;
    };

    if width != state.width || height != state.height {
        return false;
    }

    unsafe {
        with_autorelease_pool(|| {
            let clients: bool = msg_send![state.server, hasClients];
            if !clients {
                return false;
            }

            let texture = state.textures[state.next_texture];
            state.next_texture = (state.next_texture + 1) % TEXTURE_COUNT;

            let region = MTLRegion {
                origin: MTLOrigin { x: 0, y: 0, z: 0 },
                size: MTLSize {
                    width: width as u64,
                    height: height as u64,
                    depth: 1,
                },
            };

            let _: () = msg_send![
                texture,
                replaceRegion: region
                mipmapLevel: 0usize
                withBytes: pixels.as_ptr() as *const c_void
                bytesPerRow: (width * 4) as u64
            ];

            let command_buffer: *mut Object = msg_send![state.queue, commandBuffer];
            if command_buffer.is_null() {
                eprintln!("[syphon] commandBuffer returned nil");
                return false;
            }

            let rect = NSRect {
                origin: NSPoint { x: 0.0, y: 0.0 },
                size: NSSize {
                    width: width as f64,
                    height: height as f64,
                },
            };

            let _: () = msg_send![
                state.server,
                publishFrameTexture: texture
                onCommandBuffer: command_buffer
                imageRegion: rect
                flipped: YES
            ];
            let _: () = msg_send![command_buffer, commit];

            FRAME_COUNT.fetch_add(1, Ordering::Relaxed);
            true
        })
    }
}

pub fn push_frame(data: &[u8]) -> bool {
    if data.len() < 17 || !data.starts_with(b"HUFFSYPH") {
        return false;
    }
    let width = u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    let height = u32::from_le_bytes([data[12], data[13], data[14], data[15]]);
    push_pixels(width, height, &data[16..])
}
