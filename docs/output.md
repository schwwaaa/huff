---
layout: page
title: Video Output
permalink: /output/
nav_order: 7
---

huff has three ways to send its output outside the app window: **Syphon** (macOS), **Spout** (Windows), and the **canvas mirror window** (all platforms via WebSocket).

---

## Syphon (macOS)

Syphon lets huff share its canvas as a named texture that any Syphon-enabled application can receive in real time — without capture cards or screen recording.

**Compatible receivers:** Resolume Avenue/Arena, VDMX, MadMapper, CoGe, Millumin, Modul8, VDMX5, Max/MSP (Jitter), Processing (Syphon library), and anything supporting the Syphon protocol.

### Usage

1. Click the **SYPHON** button in the top bar.
2. Set the output **resolution** (default: 1280×720).
3. Set the **FPS cap** (default: 30fps — do not set higher than your canvas frame rate).
4. Click **▶ Start**. The sender appears as `huff` in any Syphon receiver.
5. Click **■ Stop** to close the server.

<div class="img-placeholder">
  <span class="ph-label">📸 SCREENSHOT PLACEHOLDER</span>
  <span>huff Syphon panel with active server + Resolume showing the huff source in its source browser<br/>
  <em>Suggested AI prompt: "macOS screen showing Syphon texture sharing between two apps, neon colour palette, glitch art aesthetic"</em></span>
</div>

### How It Works

```
canvas.getImageData()
  → raw RGBA bytes
  → "HUFFSYPH" prefix + width (u32 LE) + height (u32 LE) + pixels
  → binary WebSocket to port 8787
  → Rust relay intercepts on b"HUFFSYPH"
  → syphon::push_frame()
  → MTLTexture CPU upload
  → SyphonMetalServer.publishFrameTexture()
  → Syphon clients
```

<div class="callout warning">
  <strong>CPU round-trip:</strong> The pipeline reads pixels back from the WebView canvas via <code>getImageData()</code>, then re-uploads them to a Metal texture in Rust. This is not zero-copy. It works well at 720p/30fps. See <a href="/caveats">Caveats</a> for details.
</div>

### Installation Notes

The Syphon.framework is **bundled inside the huff app bundle** — no separate installation is required. The framework is declared in `tauri.conf.json` under `bundle.macOS.frameworks` and Tauri copies it into the bundle automatically.

---

## Spout (Windows)

Spout is the Windows equivalent of Syphon. huff shares its canvas as a named D3D11 texture via the SpoutDX bridge.

**Compatible receivers:** Resolume Arena, TouchDesigner, MadMapper, Notch, and anything supporting the Spout2 protocol.

### Usage

1. Install the [Spout2 runtime](https://spout.zeal.co/) if not already present.
2. Click the **SPOUT** button in the top bar.
3. Set resolution and FPS cap.
4. Click **▶ Start**. The sender appears as `huff` in Spout receivers.

<div class="img-placeholder">
  <span class="ph-label">📸 SCREENSHOT PLACEHOLDER</span>
  <span>huff Spout panel active + TouchDesigner receiving the huff Spout source<br/>
  <em>Replace with: screenshot of SpoutReceiver or TouchDesigner showing the huff feed</em></span>
</div>

### How It Works

```
canvas.getImageData()
  → raw RGBA bytes
  → "HUFFSPOUT" prefix + width (u32 LE) + height (u32 LE) + pixels
  → binary WebSocket to port 8787
  → Rust relay intercepts on b"HUFFSPOUT"
  → spout::push_frame()
  → spoutdx_send_image()
  → SpoutDX D3D11 UpdateSubresource
  → Spout2 receivers
```

### Binary Layout

The magic-byte protocol that huff uses over the WebSocket:

```
Syphon frame:
  Bytes  0–7   : b"HUFFSYPH"  (8 bytes)
  Bytes  8–11  : width  u32 little-endian
  Bytes  12–15 : height u32 little-endian
  Bytes  16+   : raw RGBA8 pixels (width × height × 4 bytes)

Spout frame:
  Bytes  0–8   : b"HUFFSPOUT"  (9 bytes)
  Bytes  9–12  : width  u32 little-endian
  Bytes  13–16 : height u32 little-endian
  Bytes  17+   : raw RGBA8 pixels (width × height × 4 bytes)
```

The Rust relay inspects the first bytes of every binary WebSocket message. If neither prefix matches, the message is forwarded to `canvas` role clients as normal.

---

## Canvas Mirror Window

The canvas window (`canvas.html`) connects to the embedded WebSocket relay on port `8787` and renders frames as they arrive.

**Usage:**
- The window opens automatically with the app (it is declared as a second Tauri window in `tauri.conf.json`).
- Press **F** in the canvas window to toggle fullscreen.
- Move it to a second monitor or projector.

**Independent use:** You can also open `canvas.html` directly in a browser while the app is running — navigate to `file:///path/to/huff/src/canvas.html`. The browser connects to the same relay.

**OBS capture:** The canvas window is a clean output with no UI chrome. Use OBS **Window Capture** source pointed at the canvas window for recording or streaming.

<div class="callout note">
  <strong>Frame rate:</strong> The canvas window receives JPEG-encoded frames. The encode quality is proportional to the QUALITY slider. At quality=1 frames arrive at roughly the p5 draw rate. Reducing quality also reduces WS bandwidth.
</div>
