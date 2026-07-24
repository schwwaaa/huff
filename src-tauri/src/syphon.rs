// src-tauri/src/syphon.rs
// macOS only — Syphon output via SyphonMetalServer ObjC FFI
//
// REQUIRES: Syphon.framework installed at either:
//   ~/Library/Frameworks/Syphon.framework
//   /Library/Frameworks/Syphon.framework
//
// Download: https://github.com/Syphon/Syphon-Framework/releases
//
// Pipeline:
//   canvas.js getImageData() → "HUFFSYPH" binary WS frame
//       → relay intercepts → syphon::push_frame()
//       → MTLTexture (CPU upload) → SyphonMetalServer.publishFrameTexture()
//       → Syphon clients (Resolume, VDMX, MadMapper, CoGe, etc.)
//
// Note: GPU→CPU readback happens in JS (getImageData), then CPU→GPU re-upload
// happens here. This is a round-trip but is acceptable for localhost Syphon output.
// Frame rate is throttled to 30fps on the JS side to limit readback cost.

use objc::runtime::{Class, Object, YES};
use once_cell::sync::Lazy;
use std::ffi::CString;
use std::os::raw::c_void;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Condvar, Mutex, Once};
use std::thread;
use std::time::Instant;

// ── Metal framework link ──────────────────────────────────────────────────────

#[link(name = "Metal", kind = "framework")]
extern "C" {
    fn MTLCreateSystemDefaultDevice() -> *mut Object;
}

#[link(name = "Foundation", kind = "framework")]
extern "C" {}

// ── Metal constants ───────────────────────────────────────────────────────────

const MTL_PIXEL_FORMAT_RGBA8_UNORM: u64 = 70;
const MTL_STORAGE_MODE_SHARED:      u64 = 0;  // CPU + GPU accessible
const MTL_TEXTURE_USAGE_RENDER_TARGET: u64 = 0x0004;
const MTL_TEXTURE_USAGE_SHADER_READ:   u64 = 0x0001;

// ── C-compatible structs for ObjC method arguments ───────────────────────────

#[repr(C)]
#[derive(Copy, Clone)]
struct MTLOrigin {
    x: u64, y: u64, z: u64,
}

#[repr(C)]
#[derive(Copy, Clone)]
struct MTLSize {
    width: u64, height: u64, depth: u64,
}

#[repr(C)]
#[derive(Copy, Clone)]
struct MTLRegion {
    origin: MTLOrigin,
    size:   MTLSize,
}

#[repr(C)]
#[derive(Copy, Clone)]
struct NSPoint {
    x: f64, y: f64,
}

#[repr(C)]
#[derive(Copy, Clone)]
struct NSSize {
    width: f64, height: f64,
}

#[repr(C)]
#[derive(Copy, Clone)]
struct NSRect {
    origin: NSPoint,
    size:   NSSize,
}

// ── State ─────────────────────────────────────────────────────────────────────

struct SyphonState {
    device:  *mut Object,  // id<MTLDevice>
    queue:   *mut Object,  // id<MTLCommandQueue>
    server:  *mut Object,  // SyphonMetalServer *
    texture: *mut Object,  // persistent id<MTLTexture>
    width:   u32,
    height:  u32,
}

// Raw ObjC pointers are not Send by default.
// Safe here: we always access them exclusively through the Mutex.
unsafe impl Send for SyphonState {}

static SYPHON: Lazy<Mutex<Option<SyphonState>>> =
    Lazy::new(|| Mutex::new(None));

// Latest-frame boundary copied from the newer Junkpile media examples.
// The WebSocket task only replaces this slot; Metal/Syphon work runs on a
// dedicated native thread. Slow publication can therefore drop/rewrite a
// pending frame, but it can never build an unbounded queue.
static PENDING_FRAME: Lazy<(Mutex<Option<Vec<u8>>>, Condvar)> =
    Lazy::new(|| (Mutex::new(None), Condvar::new()));
static WORKER_START: Once = Once::new();

pub static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);
pub static FRAME_RECEIVED: AtomicU64 = AtomicU64::new(0);
pub static FRAME_REPLACED: AtomicU64 = AtomicU64::new(0);
pub static FRAME_REJECTED: AtomicU64 = AtomicU64::new(0);
pub static LAST_UPLOAD_US: AtomicU64 = AtomicU64::new(0);

const MAX_FRAME_WIDTH: u32 = 8192;
const MAX_FRAME_HEIGHT: u32 = 8192;

// ── Framework loader ──────────────────────────────────────────────────────────

fn ensure_framework_loaded() -> Result<(), String> {
    // Fast path: already loaded
    if Class::get("SyphonMetalServer").is_some() {
        return Ok(());
    }

    let home = std::env::var("HOME").unwrap_or_default();

    // Candidate paths in priority order:
    //
    // 1. Bundled inside the .app — Tauri copies src-tauri/frameworks/* to
    //    <app>/Contents/Frameworks/ at bundle time.
    //    During `npm run dev` the binary is at
    //    src-tauri/target/debug/huff, so we walk up to find the frameworks folder.
    //
    // 2. User's ~/Library/Frameworks  (developer convenience)
    // 3. System /Library/Frameworks   (system-wide install)

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    // In a built .app: exe is at Contents/MacOS/huff,
    // frameworks land at Contents/Frameworks/Syphon.framework
    let app_bundled = exe_dir
        .parent()                             // Contents/
        .map(|p| p.join("Frameworks/Syphon.framework"))
        .unwrap_or_default();

    // During dev: exe is at target/debug/huff,
    // framework is at src-tauri/frameworks/Syphon.framework (3 levels up)
    let dev_bundled = exe_dir
        .ancestors()
        .nth(3)
        .map(|p| p.join("src-tauri/frameworks/Syphon.framework"))
        .unwrap_or_default();

    let candidates = [
        app_bundled.to_string_lossy().into_owned(),
        dev_bundled.to_string_lossy().into_owned(),
        format!("{}/Library/Frameworks/Syphon.framework", home),
        "/Library/Frameworks/Syphon.framework".to_string(),
    ];

    for path in &candidates {
        if !std::path::Path::new(path).exists() {
            continue;
        }
        unsafe {
            let str_cls = Class::get("NSString").ok_or("NSString missing")?;
            let cpath   = CString::new(path.as_str()).unwrap();
            let ns_path: *mut Object = msg_send![
                str_cls, stringWithUTF8String: cpath.as_ptr()
            ];

            let bndl_cls = Class::get("NSBundle").ok_or("NSBundle missing")?;
            let bundle: *mut Object = msg_send![bndl_cls, bundleWithPath: ns_path];
            if bundle.is_null() {
                continue;
            }

            let ok: bool = msg_send![bundle, load];
            if ok {
                println!("[syphon] loaded Syphon.framework from {}", path);
                return Ok(());
            }
        }
    }

    Err(
        "Syphon.framework not found in bundle or system paths.\n\
         Expected locations:\n\
         • <app>.app/Contents/Frameworks/Syphon.framework  (production)\n\
         • src-tauri/frameworks/Syphon.framework            (dev)\n\
         • ~/Library/Frameworks/Syphon.framework            (system)\n\
         Download: https://github.com/Syphon/Syphon-Framework/releases"
            .into(),
    )
}

// ── Frame validation and persistent Metal resource helpers ───────────────────

fn frame_byte_len(width: u32, height: u32) -> Option<usize> {
    if width == 0 || height == 0 || width > MAX_FRAME_WIDTH || height > MAX_FRAME_HEIGHT {
        return None;
    }
    (width as usize)
        .checked_mul(height as usize)?
        .checked_mul(4)
}

fn clear_pending_frame() {
    let (lock, _) = &*PENDING_FRAME;
    lock.lock().unwrap().take();
}

unsafe fn create_texture(
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

    let _: () = msg_send![desc, setStorageMode: MTL_STORAGE_MODE_SHARED];
    let _: () = msg_send![desc, setUsage:
        MTL_TEXTURE_USAGE_RENDER_TARGET | MTL_TEXTURE_USAGE_SHADER_READ
    ];

    let texture: *mut Object = msg_send![device, newTextureWithDescriptor: desc];
    if texture.is_null() {
        Err("newTextureWithDescriptor returned nil".into())
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

/// Start the dedicated latest-frame publisher thread once for the process.
pub fn start_worker() {
    WORKER_START.call_once(|| {
        thread::Builder::new()
            .name("huff-syphon-output".into())
            .spawn(|| loop {
                let frame = {
                    let (lock, ready) = &*PENDING_FRAME;
                    let mut pending = lock.lock().unwrap();
                    while pending.is_none() {
                        pending = ready.wait(pending).unwrap();
                    }
                    pending.take().unwrap()
                };
                push_frame(&frame);
            })
            .expect("failed to start Syphon output worker");
    });
}

/// Replace the currently pending frame instead of queueing behind it.
pub fn submit_frame(data: Vec<u8>) {
    FRAME_RECEIVED.fetch_add(1, Ordering::Relaxed);
    let (lock, ready) = &*PENDING_FRAME;
    let mut pending = lock.lock().unwrap();
    if pending.replace(data).is_some() {
        FRAME_REPLACED.fetch_add(1, Ordering::Relaxed);
    }
    ready.notify_one();
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Start a SyphonMetalServer named "huff".
/// Creates a MTLDevice and MTLCommandQueue that persist until stop() is called.
pub fn start(width: u32, height: u32) -> Result<(), String> {
    ensure_framework_loaded()?;
    frame_byte_len(width, height)
        .ok_or_else(|| format!("invalid Syphon dimensions: {width}×{height}"))?;

    // Drop any existing server and pending stale frame.
    let mut guard = SYPHON.lock().unwrap();
    if let Some(old) = guard.take() {
        unsafe { release_state(old); }
    }
    clear_pending_frame();

    unsafe {
        let device = MTLCreateSystemDefaultDevice();
        if device.is_null() {
            return Err("MTLCreateSystemDefaultDevice returned nil — Metal not supported on this machine".into());
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
            str_cls, stringWithUTF8String: cname.as_ptr()
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
            return Err("SyphonMetalServer initWithName:device:options: returned nil".into());
        }

        let texture = match create_texture(device, width, height) {
            Ok(texture) => texture,
            Err(error) => {
                let _: () = msg_send![server, stop];
                let _: () = msg_send![server, release];
                let _: () = msg_send![queue, release];
                let _: () = msg_send![device, release];
                return Err(error);
            }
        };

        println!(
            "[syphon] server started — {}×{} — persistent Metal texture — visible as 'huff'",
            width, height
        );
        FRAME_COUNT.store(0, Ordering::Relaxed);
        FRAME_RECEIVED.store(0, Ordering::Relaxed);
        FRAME_REPLACED.store(0, Ordering::Relaxed);
        FRAME_REJECTED.store(0, Ordering::Relaxed);
        LAST_UPLOAD_US.store(0, Ordering::Relaxed);

        *guard = Some(SyphonState {
            device,
            queue,
            server,
            texture,
            width,
            height,
        });
        Ok(())
    }
}

/// Stop the Syphon server and release persistent Metal resources.
pub fn stop() {
    clear_pending_frame();
    let mut guard = SYPHON.lock().unwrap();
    if let Some(state) = guard.take() {
        unsafe { release_state(state); }
        println!("[syphon] server stopped");
    }
}

pub fn is_active() -> bool {
    SYPHON.lock().unwrap().is_some()
}

pub fn status() -> String {
    let guard = SYPHON.lock().unwrap();
    match &*guard {
        None => "stopped".into(),
        Some(s) => format!(
            "active — {}×{} — published {} — received {} — replaced {} — rejected {} — upload {} µs",
            s.width,
            s.height,
            FRAME_COUNT.load(Ordering::Relaxed),
            FRAME_RECEIVED.load(Ordering::Relaxed),
            FRAME_REPLACED.load(Ordering::Relaxed),
            FRAME_REJECTED.load(Ordering::Relaxed),
            LAST_UPLOAD_US.load(Ordering::Relaxed),
        ),
    }
}

/// Upload one validated raw RGBA frame into the persistent Metal texture.
fn push_frame(data: &[u8]) {
    if data.len() < 17 || !data.starts_with(b"HUFFSYPH") {
        FRAME_REJECTED.fetch_add(1, Ordering::Relaxed);
        return;
    }

    let width = u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    let height = u32::from_le_bytes([data[12], data[13], data[14], data[15]]);
    let expected = match frame_byte_len(width, height) {
        Some(size) => size,
        None => {
            FRAME_REJECTED.fetch_add(1, Ordering::Relaxed);
            return;
        }
    };
    let pixels = &data[16..];
    if pixels.len() != expected {
        FRAME_REJECTED.fetch_add(1, Ordering::Relaxed);
        eprintln!(
            "[syphon] bad frame: {}×{} needs exactly {} bytes, got {}",
            width,
            height,
            expected,
            pixels.len()
        );
        return;
    }

    let guard = SYPHON.lock().unwrap();
    let state = match &*guard {
        Some(state) if state.width == width && state.height == height => state,
        Some(state) => {
            FRAME_REJECTED.fetch_add(1, Ordering::Relaxed);
            eprintln!(
                "[syphon] rejected {}×{} frame; active output is {}×{}",
                width, height, state.width, state.height
            );
            return;
        }
        None => return,
    };

    let started = Instant::now();
    unsafe {
        // The publisher runs on a plain Rust thread. Drain autoreleased Metal
        // objects each frame instead of letting them accumulate indefinitely.
        let pool: *mut Object = match Class::get("NSAutoreleasePool") {
            Some(pool_cls) => msg_send![pool_cls, new],
            None => std::ptr::null_mut(),
        };

        let region = MTLRegion {
            origin: MTLOrigin { x: 0, y: 0, z: 0 },
            size: MTLSize {
                width: width as u64,
                height: height as u64,
                depth: 1,
            },
        };

        let _: () = msg_send![
            state.texture,
            replaceRegion: region
            mipmapLevel: 0usize
            withBytes: pixels.as_ptr() as *const c_void
            bytesPerRow: (width * 4) as u64
        ];

        let cmd_buf: *mut Object = msg_send![state.queue, commandBuffer];
        if cmd_buf.is_null() {
            FRAME_REJECTED.fetch_add(1, Ordering::Relaxed);
            eprintln!("[syphon] commandBuffer returned nil");
            if !pool.is_null() {
                let _: () = msg_send![pool, drain];
            }
            return;
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
            publishFrameTexture: state.texture
            onCommandBuffer: cmd_buf
            imageRegion: rect
            flipped: YES
        ];
        let _: () = msg_send![cmd_buf, commit];
        let _: () = msg_send![cmd_buf, waitUntilCompleted];
        if !pool.is_null() {
            let _: () = msg_send![pool, drain];
        }
    }

    LAST_UPLOAD_US.store(started.elapsed().as_micros() as u64, Ordering::Relaxed);
    FRAME_COUNT.fetch_add(1, Ordering::Relaxed);
}
