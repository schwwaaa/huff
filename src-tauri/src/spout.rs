// src-tauri/src/spout.rs
// Windows-only Spout2 output via SpoutDX (D3D11 path).
//
// SpoutDX::SendImage uses D3D11 UpdateSubresource to upload pixels into a
// shared DXGI texture. Spout receivers grab it via shared handle — no
// OpenGL context needed, no round-trip through the GL pipeline.
//
// Current transport: raw RGBA bytes on a dedicated WebSocket. The sender role
// and fixed dimensions are declared once in the hello message. Legacy
// HUFFSPOUT-prefixed packets are still accepted for compatibility.

#[cfg(target_os = "windows")]
mod win {
    use once_cell::sync::Lazy;
    use std::ffi::CString;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Mutex;

    // ── C ABI from spout_bridge.dll (SpoutDX path) ────────────────────────────
    #[link(name = "spout_bridge")]
    extern "C" {
        fn spoutdx_init_sender(name: *const i8, width: i32, height: i32) -> i32;
        fn spoutdx_send_image(pixels: *const u8, width: i32, height: i32) -> i32;
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

    pub fn status() -> String {
        let guard = SPOUT.lock().unwrap();
        match &*guard {
            None    => "stopped".into(),
            Some(s) => format!("active — {}×{} — {} frames sent",
                s.width, s.height, FRAME_COUNT.load(Ordering::Relaxed)),
        }
    }

    /// Push raw RGBA pixels received over the dedicated Spout WebSocket.
    /// Width/height are declared once in the hello message, so JavaScript does
    /// not need to prepend and copy an additional packet header every frame.
    pub fn push_pixels(width: u32, height: u32, pixels: &[u8]) {
        let expected = (width as usize) * (height as usize) * 4;
        if pixels.len() < expected || width == 0 || height == 0 { return; }

        // Check active and fixed dimensions under lock, then release before the
        // D3D11 upload so status/stop calls are not held behind the GPU call.
        {
            let guard = SPOUT.lock().unwrap();
            let state = match &*guard {
                Some(s) => s,
                None => return,
            };
            if state.width != width || state.height != height { return; }
        }

        let ok = unsafe {
            spoutdx_send_image(pixels.as_ptr(), width as i32, height as i32)
        };
        if ok != 1 {
            eprintln!("[spout] spoutdx_send_image failed");
            return;
        }

        FRAME_COUNT.fetch_add(1, Ordering::Relaxed);
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
    use std::sync::atomic::AtomicU64;
    pub static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);
    pub fn start(_w: u32, _h: u32) -> Result<(), String> { Err("Spout is Windows-only".into()) }
    pub fn stop() {}
    pub fn status() -> String { "unavailable (Windows only)".into() }
    pub fn push_pixels(_: u32, _: u32, _: &[u8]) {}
    pub fn push_frame(_: &[u8]) {}
}

pub use win::{start, stop, status, push_pixels, push_frame, FRAME_COUNT};
