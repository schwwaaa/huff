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
use std::sync::Mutex;

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
    width:   u32,
    height:  u32,
}

// Raw ObjC pointers are not Send by default.
// Safe here: we always access them exclusively through the Mutex.
unsafe impl Send for SyphonState {}

static SYPHON: Lazy<Mutex<Option<SyphonState>>> =
    Lazy::new(|| Mutex::new(None));

pub static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);

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

// ── Public API ────────────────────────────────────────────────────────────────

/// Start a SyphonMetalServer named "huff".
/// Creates a MTLDevice and MTLCommandQueue that persist until stop() is called.
pub fn start(width: u32, height: u32) -> Result<(), String> {
    ensure_framework_loaded()?;

    // Drop any existing server
    let mut guard = SYPHON.lock().unwrap();
    if let Some(old) = guard.take() {
        unsafe {
            let _: () = msg_send![old.server, stop];
        }
    }

    unsafe {
        // 1. Default Metal device (the GPU)
        let device = MTLCreateSystemDefaultDevice();
        if device.is_null() {
            return Err("MTLCreateSystemDefaultDevice returned nil — Metal not supported on this machine".into());
        }

        // 2. Command queue for submitting work each frame
        let queue: *mut Object = msg_send![device, newCommandQueue];
        if queue.is_null() {
            return Err("newCommandQueue failed".into());
        }

        // 3. SyphonMetalServer alloc+init
        let cls = Class::get("SyphonMetalServer")
            .ok_or("SyphonMetalServer class missing after framework load")?;

        let str_cls = Class::get("NSString").ok_or("NSString missing")?;
        let cname   = CString::new("huff").unwrap();
        let ns_name: *mut Object = msg_send![
            str_cls, stringWithUTF8String: cname.as_ptr()
        ];

        let alloc: *mut Object = msg_send![cls, alloc];
        let server: *mut Object = msg_send![
            alloc,
            initWithName:   ns_name
            device:         device
            options:        std::ptr::null_mut::<Object>()
        ];

        if server.is_null() {
            return Err("SyphonMetalServer initWithName:device:options: returned nil".into());
        }

        println!("[syphon] server started — {}×{} — visible as 'huff' in Syphon clients", width, height);
        FRAME_COUNT.store(0, Ordering::Relaxed);

        *guard = Some(SyphonState { device, queue, server, width, height });
        Ok(())
    }
}

/// Stop the Syphon server and release Metal resources.
pub fn stop() {
    let mut guard = SYPHON.lock().unwrap();
    if let Some(state) = guard.take() {
        unsafe {
            let _: () = msg_send![state.server, stop];
        }
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
        Some(s) => {
            let n = FRAME_COUNT.load(Ordering::Relaxed);
            format!("active — {}×{} — {} frames published", s.width, s.height, n)
        }
    }
}

/// Upload a raw RGBA frame to a MTLTexture and publish it via Syphon.
/// Called from the WS relay when a binary message starts with "HUFFSYPH".
///
/// Frame binary layout (produced by canvas.js):
///   Bytes  0– 7 : b"HUFFSYPH" magic
///   Bytes  8–11 : width  as u32 LE
///   Bytes 12–15 : height as u32 LE
///   Bytes 16+   : raw RGBA8 pixels (width × height × 4 bytes)
pub fn push_frame(data: &[u8]) {
    // Minimum: 16-byte header + at least one pixel
    if data.len() < 17 {
        return;
    }

    // Parse header
    let width  = u32::from_le_bytes([data[8], data[9],  data[10], data[11]]);
    let height = u32::from_le_bytes([data[12], data[13], data[14], data[15]]);
    let pixels = &data[16..];

    let expected = (width as usize) * (height as usize) * 4;
    if pixels.len() < expected || width == 0 || height == 0 {
        eprintln!("[syphon] bad frame: {}×{} needs {} bytes, got {}", width, height, expected, pixels.len());
        return;
    }

    let guard = SYPHON.lock().unwrap();
    let state = match &*guard {
        Some(s) => s,
        None    => return, // server not started
    };

    unsafe {
        // 1. Texture descriptor — shared storage so CPU can write directly
        let desc_cls = match Class::get("MTLTextureDescriptor") {
            Some(c) => c,
            None    => { eprintln!("[syphon] MTLTextureDescriptor not available"); return; }
        };

        let desc: *mut Object = msg_send![
            desc_cls,
            texture2DDescriptorWithPixelFormat: MTL_PIXEL_FORMAT_RGBA8_UNORM
            width:    width  as u64
            height:   height as u64
            mipmapped: objc::runtime::NO
        ];

        let _: () = msg_send![desc, setStorageMode: MTL_STORAGE_MODE_SHARED];
        let _: () = msg_send![desc, setUsage:
            MTL_TEXTURE_USAGE_RENDER_TARGET | MTL_TEXTURE_USAGE_SHADER_READ
        ];

        // 2. Create texture and upload pixels (CPU → GPU, shared memory — no DMA copy)
        let texture: *mut Object = msg_send![state.device, newTextureWithDescriptor: desc];
        if texture.is_null() {
            eprintln!("[syphon] newTextureWithDescriptor returned nil");
            return;
        }

        let region = MTLRegion {
            origin: MTLOrigin { x: 0, y: 0, z: 0 },
            size:   MTLSize   { width: width as u64, height: height as u64, depth: 1 },
        };

        let _: () = msg_send![
            texture,
            replaceRegion: region
            mipmapLevel:   0usize
            withBytes:     pixels.as_ptr() as *const c_void
            bytesPerRow:   (width * 4) as u64
        ];

        // 3. Command buffer for Syphon's Metal synchronisation
        let cmd_buf: *mut Object = msg_send![state.queue, commandBuffer];
        if cmd_buf.is_null() {
            eprintln!("[syphon] commandBuffer returned nil");
            let _: () = msg_send![texture, release];
            return;
        }

        // 4. Publish — flipped:YES because Canvas 2D pixel origin is top-left,
        //    but Metal/Syphon expects bottom-left origin
        let rect = NSRect {
            origin: NSPoint { x: 0.0, y: 0.0 },
            size:   NSSize  { width: width as f64, height: height as f64 },
        };

        let _: () = msg_send![
            state.server,
            publishFrameTexture: texture
            onCommandBuffer:     cmd_buf
            imageRegion:         rect
            flipped:             YES
        ];

        let _: () = msg_send![cmd_buf, commit];

        // Release per-frame texture (device and queue are long-lived)
        let _: () = msg_send![texture, release];

        FRAME_COUNT.fetch_add(1, Ordering::Relaxed);
    }
}
