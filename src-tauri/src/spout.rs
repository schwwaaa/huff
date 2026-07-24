// src-tauri/src/spout.rs
// Windows-only Spout2 output via SpoutDX (D3D11 path).
//
// SpoutDX::SendImage uses D3D11 UpdateSubresource to upload pixels into a
// shared DXGI texture. Spout receivers grab it via shared handle — no
// OpenGL context needed, no round-trip through the GL pipeline.
//
// Frame binary layout (sent by index.html over WS):
//   Bytes  0– 8 : b"HUFFSPOUT" magic (9 bytes)
//   Bytes  9–12 : width  u32 LE
//   Bytes 13–16 : height u32 LE
//   Bytes 17+   : raw RGBA8 pixels (width × height × 4)

#[cfg(target_os = "windows")]
mod win {
    use once_cell::sync::Lazy;
    use std::ffi::CString;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Condvar, Mutex, Once};
    use std::thread;
    use std::time::Instant;

    // ── C ABI from spout_bridge.dll (SpoutDX path) ────────────────────────────
    #[link(name = "spout_bridge")]
    extern "C" {
        fn spoutdx_init_sender(name: *const i8, width: i32, height: i32) -> i32;
        fn spoutdx_send_image(pixels: *const u8, width: i32, height: i32) -> i32;
        fn spoutdx_shutdown();
    }

    // ── State ─────────────────────────────────────────────────────────────────

    struct SpoutState {
        width: u32,
        height: u32,
    }

    static SPOUT: Lazy<Mutex<Option<SpoutState>>> = Lazy::new(|| Mutex::new(None));

    // Latest-frame boundary: the WebSocket receiver replaces this single slot,
    // while a dedicated worker performs the D3D11 upload. Publication can fall
    // behind, but frames cannot accumulate without limit.
    static PENDING_FRAME: Lazy<(Mutex<Option<Vec<u8>>>, Condvar)> =
        Lazy::new(|| (Mutex::new(None), Condvar::new()));
    static WORKER_START: Once = Once::new();

    pub static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);
    static FRAME_RECEIVED: AtomicU64 = AtomicU64::new(0);
    static FRAME_REPLACED: AtomicU64 = AtomicU64::new(0);
    static FRAME_REJECTED: AtomicU64 = AtomicU64::new(0);
    static LAST_UPLOAD_US: AtomicU64 = AtomicU64::new(0);

    const MAX_FRAME_WIDTH: u32 = 8192;
    const MAX_FRAME_HEIGHT: u32 = 8192;

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

    // ── Latest-frame worker ───────────────────────────────────────────────────

    pub fn start_worker() {
        WORKER_START.call_once(|| {
            thread::Builder::new()
                .name("huff-spout-output".into())
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
                .expect("failed to start Spout output worker");
        });
    }

    pub fn submit_frame(data: Vec<u8>) {
        FRAME_RECEIVED.fetch_add(1, Ordering::Relaxed);
        let (lock, ready) = &*PENDING_FRAME;
        let mut pending = lock.lock().unwrap();
        if pending.replace(data).is_some() {
            FRAME_REPLACED.fetch_add(1, Ordering::Relaxed);
        }
        ready.notify_one();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    pub fn start(width: u32, height: u32) -> Result<(), String> {
        frame_byte_len(width, height)
            .ok_or_else(|| format!("invalid Spout dimensions: {width}×{height}"))?;

        let mut guard = SPOUT.lock().unwrap();
        if guard.is_some() {
            unsafe { spoutdx_shutdown(); }
        }
        clear_pending_frame();

        let name = CString::new("huff").unwrap();
        let ok = unsafe { spoutdx_init_sender(name.as_ptr(), width as i32, height as i32) };
        if ok != 1 {
            return Err(
                "SpoutDX init failed.\n\
                 Make sure the Spout2 runtime is installed.\n\
                 Download: https://spout.zeal.co/"
                    .into(),
            );
        }

        println!(
            "[spout] SpoutDX sender started — {}×{} — latest-frame worker — visible as 'huff'",
            width, height
        );
        FRAME_COUNT.store(0, Ordering::Relaxed);
        FRAME_RECEIVED.store(0, Ordering::Relaxed);
        FRAME_REPLACED.store(0, Ordering::Relaxed);
        FRAME_REJECTED.store(0, Ordering::Relaxed);
        LAST_UPLOAD_US.store(0, Ordering::Relaxed);
        *guard = Some(SpoutState { width, height });
        Ok(())
    }

    pub fn stop() {
        clear_pending_frame();
        let mut guard = SPOUT.lock().unwrap();
        if guard.take().is_some() {
            unsafe { spoutdx_shutdown(); }
            println!("[spout] sender stopped");
        }
    }

    pub fn status() -> String {
        let guard = SPOUT.lock().unwrap();
        match &*guard {
            None => "stopped".into(),
            Some(s) => format!(
                "active — {}×{} — sent {} — received {} — replaced {} — rejected {} — upload {} µs",
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

    /// Upload one validated raw RGBA frame to SpoutDX.
    fn push_frame(data: &[u8]) {
        if data.len() < 18 || !data.starts_with(b"HUFFSPOUT") {
            FRAME_REJECTED.fetch_add(1, Ordering::Relaxed);
            return;
        }

        let width = u32::from_le_bytes([data[9], data[10], data[11], data[12]]);
        let height = u32::from_le_bytes([data[13], data[14], data[15], data[16]]);
        let expected = match frame_byte_len(width, height) {
            Some(size) => size,
            None => {
                FRAME_REJECTED.fetch_add(1, Ordering::Relaxed);
                return;
            }
        };
        let pixels = &data[17..];
        if pixels.len() != expected {
            FRAME_REJECTED.fetch_add(1, Ordering::Relaxed);
            eprintln!(
                "[spout] bad frame: {}×{} needs exactly {} bytes, got {}",
                width,
                height,
                expected,
                pixels.len()
            );
            return;
        }

        // Serialize send and shutdown through the state lock. The expensive work
        // is already isolated on the dedicated worker, so this cannot block the
        // WebSocket receiver or the JavaScript render loop.
        let guard = SPOUT.lock().unwrap();
        let state = match &*guard {
            Some(state) if state.width == width && state.height == height => state,
            Some(state) => {
                FRAME_REJECTED.fetch_add(1, Ordering::Relaxed);
                eprintln!(
                    "[spout] rejected {}×{} frame; active output is {}×{}",
                    width, height, state.width, state.height
                );
                return;
            }
            None => return,
        };

        let started = Instant::now();
        let ok = unsafe { spoutdx_send_image(pixels.as_ptr(), width as i32, height as i32) };
        LAST_UPLOAD_US.store(started.elapsed().as_micros() as u64, Ordering::Relaxed);

        if ok != 1 {
            FRAME_REJECTED.fetch_add(1, Ordering::Relaxed);
            eprintln!("[spout] spoutdx_send_image failed");
            return;
        }

        FRAME_COUNT.fetch_add(1, Ordering::Relaxed);
    }
}

// ── Platform stubs (macOS / Linux) ────────────────────────────────────────────

#[cfg(not(target_os = "windows"))]
mod win {
    use std::sync::atomic::AtomicU64;

    pub static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);
    pub fn start(_w: u32, _h: u32) -> Result<(), String> {
        Err("Spout is Windows-only".into())
    }
    pub fn stop() {}
    pub fn status() -> String {
        "unavailable (Windows only)".into()
    }
    pub fn start_worker() {}
    pub fn submit_frame(_: Vec<u8>) {}
}

pub use win::{start, start_worker, status, stop, submit_frame, FRAME_COUNT};
