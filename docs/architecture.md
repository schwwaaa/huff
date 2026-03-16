---
layout: page
title: Architecture
permalink: /architecture/
nav_order: 9
---

## Project Structure

```
huff/
├── src/                          # Frontend (HTML + JS, no bundler)
│   ├── index.html                # Controls window — all UI, p5 draw loop, effect chain
│   ├── canvas.html               # Output mirror window — receives WS frames
│   ├── canvas.js                 # p5 setup, draw loop, video handling, WS sender
│   ├── effects.js                # applyGlitch · applyTrails · applyScanlines
│   │                             #   applyFlowWarp · applySolarize · applySymmetry
│   ├── p5.js                     # p5.js library (bundled locally, no CDN)
│   ├── midi/                     # Bundled MIDI map files
│   ├── osc/                      # Bundled OSC map files
│   └── presets/                  # Factory preset JSON files
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs               # Rust: WS relay · MIDI Tauri commands · OSC listener
│   │   │                         #       Syphon command handlers · Spout command handlers
│   │   ├── syphon.rs             # macOS Syphon via ObjC FFI (Metal texture upload)
│   │   └── spout.rs              # Windows Spout2 via SpoutDX C-ABI bridge
│   ├── native/
│   │   └── spout_bridge/         # C++ SpoutDX bridge compiled by build.rs via CMake
│   │       ├── spout_bridge.cpp
│   │       ├── spout_bridge.h
│   │       └── CMakeLists.txt
│   ├── frameworks/
│   │   └── Syphon.framework      # Bundled macOS Syphon framework (Metal + OGL server)
│   ├── Cargo.toml
│   ├── build.rs                  # CMake invocation for Spout (Windows only)
│   ├── tauri.conf.json
│   └── capabilities/
│       └── network.json          # Tauri v1 capability: WS relay access
│
├── scripts/
│   ├── create_universal_dmg.sh   # macOS: lipo ARM64 + x64 → Universal DMG
│   └── tauri-build.cjs           # Windows: EXE + MSI + ZIP + SHA256SUMS
│
└── package.json
```

---

## WebSocket Relay

The relay runs inside the Tauri Rust process — not in Node.js or the browser.

- Binds on `127.0.0.1:8787` (IPv4) and `[::1]:8787` (IPv6) via `tokio` + `tokio-tungstenite`
- Clients register via a JSON hello: `{"type":"hello","role":"index"}` or `"canvas"`
- Text messages → broadcast to all other clients
- Binary messages → inspected for magic prefix:
  - `b"HUFFSYPH"` → routed to `syphon::push_frame()` (macOS), not relayed
  - `b"HUFFSPOUT"` → routed to `spout::push_frame()` (Windows), not relayed
  - All other binary → forwarded only to `canvas` role clients

---

## Rust Crates

| Crate | Version | Purpose |
|-------|---------|---------|
| `tauri` | 1.x | App shell, two-window management, Tauri IPC |
| `tokio` | 1.x | Async runtime (relay + OSC listener) |
| `tokio-tungstenite` | 0.21 | WebSocket server |
| `midir` | 0.9 | Native MIDI input (USB + virtual) |
| `rosc` | 0.10 | OSC UDP packet decoder |
| `once_cell` | 1.x | Lazy static initialisation for global client map |
| `serde / serde_json` | 1.x | JSON IPC serialisation |
| `objc / objc-foundation` | 0.2 / 0.1 | macOS Syphon ObjC FFI *(macOS only)* |
| `cmake` | 0.1 | Spout bridge CMake build *(Windows only)* |

---

## Syphon Implementation

The Syphon path uses direct ObjC FFI via the `objc` crate — no bridging header, no Swift, no XCFramework.

```rust
// src-tauri/src/syphon.rs (simplified)
#[link(name = "Syphon", kind = "framework")]
extern {
    // SyphonMetalServer ObjC calls via objc::msg_send! macro
}

pub fn push_frame(data: &[u8]) {
    // 1. Parse HUFFSYPH header
    // 2. Create MTLTexture at declared resolution
    // 3. CPU-upload RGBA pixels via replaceRegion:mipmapLevel:withBytes:bytesPerRow:
    // 4. Call SyphonMetalServer publishFrameTexture:onCommandBuffer:
}
```

The Syphon.framework is declared in `tauri.conf.json` under `bundle.macOS.frameworks`. Tauri copies it into `huff.app/Contents/Frameworks/` during the build, and the linker sets the rpath accordingly.

---

## Spout Implementation

Spout on Windows uses a thin C++ DLL (`spout_bridge.dll`) compiled from `native/spout_bridge/` via CMake in `build.rs`. The DLL exposes three C-ABI functions:

```c
// spout_bridge.h
int  spoutdx_init_sender(const char* name, int width, int height);
int  spoutdx_send_image (const uint8_t* pixels, int width, int height);
void spoutdx_shutdown   ();
```

These are called from `src-tauri/src/spout.rs` via Rust FFI. The DLL is copied to the target directory during the build so `cargo run` works without installation.

The DLL wraps **SpoutDX** — the DirectX 11 path of the Spout2 SDK. It uses `UpdateSubresource` to upload the CPU pixel buffer into a shared DXGI texture, which Spout receivers can access via the shared handle.

---

## Build System

### macOS Universal Binary

```
scripts/create_universal_dmg.sh
  ↓
tauri build --target aarch64-apple-darwin  →  huff_arm64.app
tauri build --target x86_64-apple-darwin   →  huff_x64.app
  ↓
lipo -create huff_arm64.app/Contents/MacOS/huff
           huff_x64.app/Contents/MacOS/huff
     -output huff_universal.app/Contents/MacOS/huff
  ↓
hdiutil create → huff-universal.dmg
```

### Windows Artifacts

`scripts/tauri-build.cjs` runs `npx tauri build --target x86_64-pc-windows-msvc` and then collects the artifacts from `src-tauri/target/release/bundle/` into a timestamped folder under `artifacts/`, generating `SHA256SUMS.txt` for all files.

---

## Frontend Architecture

The frontend intentionally has no build step and no bundler. Everything is plain ES6 loaded via `<script>` tags. This keeps the dev cycle fast — edit a JS file, reload the WebView, see the change immediately.

`index.html` is large (~2300 lines) because the entire controls UI, all JS logic for MIDI/OSC/Syphon/Spout, and the p5 draw loop all live in one file. This is intentional for the same reason — a single file is trivially auditable and has no dependency graph to maintain.

`effects.js` is the one module that is separate, because its functions are called from `canvas.js` as well as `index.html`. The only shared interface between the two is the `frameRing` array and `gBuf` p5 Graphics object.
