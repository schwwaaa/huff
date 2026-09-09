// src-tauri/src/spout.rs
// Windows-only Spout2 output via SpoutDX (D3D11 path).
//
// SpoutDX::SendImage uses D3D11 UpdateSubresource to upload pixels into a
// shared DXGI texture. Spout receivers grab it via shared handle — no
// OpenGL context needed and no receiver-side CPU copy.
//
// Transport: raw RGBA bytes on a dedicated loopback WebSocket. The sender role
// and fixed dimensions are declared once in the hello message. Windows Spout
// optimization pass 1 adds native completion acknowledgements, sampled upload
// timing, and read-only graphics-adapter diagnostics without changing the
// validated dynamic Spout bridge architecture.

#[derive(Clone, Debug)]
pub struct SpoutPushResult {
    pub published: bool,
    pub native_sample: bool,
    pub upload_micros: u64,
}

#[derive(Clone, Debug)]
pub struct SpoutRuntimeSnapshot {
    pub active: bool,
    pub width: u32,
    pub height: u32,
    pub frames: u64,
    pub adapter_index: i32,
    pub adapter_count: i32,
    pub adapter_name: String,
    pub sender_fps: f64,
}

#[cfg(target_os = "windows")]
mod win {
    use super::{SpoutPushResult, SpoutRuntimeSnapshot};
    use once_cell::sync::Lazy;
    use std::ffi::{CStr, CString};
    use std::os::raw::c_char;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Mutex;
    use std::time::Instant;

    // ── C ABI from spout_bridge.dll (SpoutDX path) ────────────────────────────
    #[link(name = "spout_bridge")]
    extern "C" {
        fn spoutdx_init_sender(name: *const i8, width: i32, height: i32) -> i32;
        fn spoutdx_send_image(pixels: *const u8, width: i32, height: i32) -> i32;
        fn spoutdx_get_adapter_index() -> i32;
        fn spoutdx_get_adapter_count() -> i32;
        fn spoutdx_get_adapter_name(buffer: *mut c_char, maxchars: i32) -> i32;
        fn spoutdx_get_sender_fps() -> f64;
        fn spoutdx_shutdown();
    }

    // ── State ─────────────────────────────────────────────────────────────────

    struct SpoutState { width: u32, height: u32 }

    static SPOUT: Lazy<Mutex<Option<SpoutState>>> = Lazy::new(|| Mutex::new(None));
    pub static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);

    // ── Public API ────────────────────────────────────────────────────────────

    pub fn start(width: u32, height: u32) -> Result<(), String> {
        let mut guard = SPOUT.lock().unwrap();
        if guard.is_some() { unsafe { spoutdx_shutdown(); } }

        let name = CString::new("huff").unwrap();
        let ok = unsafe { spoutdx_init_sender(name.as_ptr(), width as i32, height as i32) };
        if ok != 1 {
            return Err(
                "SpoutDX init failed.\n\
                 Make sure the Spout2 runtime is installed.\n\
                 Download: https://spout.zeal.co/".into()
            );
        }

        println!("[spout] SpoutDX sender started — {}×{} — visible as 'huff'", width, height);
        FRAME_COUNT.store(0, Ordering::Relaxed);
        *guard = Some(SpoutState { width, height });
        Ok(())
    }

    pub fn stop() {
        let mut guard = SPOUT.lock().unwrap();
        if guard.take().is_some() {
            unsafe { spoutdx_shutdown(); }
            println!("[spout] sender stopped");
        }
    }

    pub fn runtime_snapshot() -> SpoutRuntimeSnapshot {
        let (active, width, height) = {
            let guard = SPOUT.lock().unwrap();
            match &*guard {
                Some(s) => (true, s.width, s.height),
                None => (false, 0, 0),
            }
        };

        let frames = FRAME_COUNT.load(Ordering::Relaxed);
        if !active {
            return SpoutRuntimeSnapshot {
                active,
                width,
                height,
                frames,
                adapter_index: -1,
                adapter_count: 0,
                adapter_name: String::new(),
                sender_fps: 0.0,
            };
        }

        let adapter_index = unsafe { spoutdx_get_adapter_index() };
        let adapter_count = unsafe { spoutdx_get_adapter_count() };
        let sender_fps = unsafe { spoutdx_get_sender_fps() };
        let mut name_buffer = [0 as c_char; 256];
        let adapter_name = if unsafe {
            spoutdx_get_adapter_name(name_buffer.as_mut_ptr(), name_buffer.len() as i32)
        } == 1 {
            unsafe { CStr::from_ptr(name_buffer.as_ptr()) }
                .to_string_lossy()
                .into_owned()
        } else {
            String::new()
        };

        SpoutRuntimeSnapshot {
            active,
            width,
            height,
            frames,
            adapter_index,
            adapter_count,
            adapter_name,
            sender_fps,
        }
    }

    pub fn status() -> String {
        let snapshot = runtime_snapshot();
        if !snapshot.active {
            return "stopped".into();
        }
        let adapter = if snapshot.adapter_name.is_empty() {
            String::new()
        } else {
            format!(" — GPU {}: {}", snapshot.adapter_index, snapshot.adapter_name)
        };
        format!(
            "active — {}×{} — {} frames sent{}",
            snapshot.width, snapshot.height, snapshot.frames, adapter
        )
    }

    /// Push raw RGBA pixels received over the dedicated Spout WebSocket.
    /// Width/height are declared once in the hello message, so JavaScript does
    /// not need to prepend and copy an additional packet header every frame.
    ///
    /// `measure_native` is intentionally sampled at low frequency by main.rs.
    /// The timing covers the complete `SpoutDX::SendImage()` call, including its
    /// D3D11 UpdateSubresource/Flush work, without adding a timer to every frame.
    pub fn push_pixels_profiled(
        width: u32,
        height: u32,
        pixels: &[u8],
        measure_native: bool,
    ) -> SpoutPushResult {
        let expected = (width as usize) * (height as usize) * 4;
        if pixels.len() < expected || width == 0 || height == 0 {
            return SpoutPushResult {
                published: false,
                native_sample: false,
                upload_micros: 0,
            };
        }

        // Check active and fixed dimensions under lock, then release before the
        // D3D11 upload so status/stop calls are not held behind the GPU call.
        {
            let guard = SPOUT.lock().unwrap();
            let state = match &*guard {
                Some(s) => s,
                None => {
                    return SpoutPushResult {
                        published: false,
                        native_sample: false,
                        upload_micros: 0,
                    }
                }
            };
            if state.width != width || state.height != height {
                return SpoutPushResult {
                    published: false,
                    native_sample: false,
                    upload_micros: 0,
                };
            }
        }

        let started = if measure_native { Some(Instant::now()) } else { None };
        let ok = unsafe {
            spoutdx_send_image(pixels.as_ptr(), width as i32, height as i32)
        };
        let upload_micros = started
            .map(|instant| instant.elapsed().as_micros().min(u64::MAX as u128) as u64)
            .unwrap_or(0);

        if ok != 1 {
            eprintln!("[spout] spoutdx_send_image failed");
            return SpoutPushResult {
                published: false,
                native_sample: measure_native,
                upload_micros,
            };
        }

        FRAME_COUNT.fetch_add(1, Ordering::Relaxed);
        SpoutPushResult {
            published: true,
            native_sample: measure_native,
            upload_micros,
        }
    }

    pub fn push_pixels(width: u32, height: u32, pixels: &[u8]) {
        let _ = push_pixels_profiled(width, height, pixels, false);
    }

    /// Legacy HUFFSPOUT packet support for older HUFF Classic frontends.
    pub fn push_frame(data: &[u8]) {
        if data.len() < 18 || !data.starts_with(b"HUFFSPOUT") { return; }
        let width  = u32::from_le_bytes([data[9],  data[10], data[11], data[12]]);
        let height = u32::from_le_bytes([data[13], data[14], data[15], data[16]]);
        push_pixels(width, height, &data[17..]);
    }
}

// ── Platform stubs (macOS / Linux) ────────────────────────────────────────────

#[cfg(not(target_os = "windows"))]
mod win {
    use super::{SpoutPushResult, SpoutRuntimeSnapshot};
    use std::sync::atomic::AtomicU64;

    pub static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);
    pub fn start(_w: u32, _h: u32) -> Result<(), String> { Err("Spout is Windows-only".into()) }
    pub fn stop() {}
    pub fn status() -> String { "unavailable (Windows only)".into() }
    pub fn runtime_snapshot() -> SpoutRuntimeSnapshot {
        SpoutRuntimeSnapshot {
            active: false,
            width: 0,
            height: 0,
            frames: 0,
            adapter_index: -1,
            adapter_count: 0,
            adapter_name: String::new(),
            sender_fps: 0.0,
        }
    }
    pub fn push_pixels_profiled(_: u32, _: u32, _: &[u8], _: bool) -> SpoutPushResult {
        SpoutPushResult { published: false, native_sample: false, upload_micros: 0 }
    }
    pub fn push_pixels(_: u32, _: u32, _: &[u8]) {}
    pub fn push_frame(_: &[u8]) {}
}

pub use win::{
    start,
    stop,
    status,
    runtime_snapshot,
    push_pixels_profiled,
    push_pixels,
    push_frame,
    FRAME_COUNT,
};
