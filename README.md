


<p align="center">
  <img width="300px" height="950px" src="https://github.com/schwwaaa/huff/blob/beta/src-tauri/icons/icon.png?raw=true"/>  
</p>

<p align="center">
  <strong>Real-time datamosh &amp; glitch-art for desktop.</strong><br/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.2--beta-ff4444?style=flat-square"/>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square"/>
  <img src="https://img.shields.io/badge/Tauri-v1-blueviolet?style=flat-square"/>
  <img src="https://img.shields.io/badge/license-ISC-green?style=flat-square"/>
</p>

---

## What is huff?

  <em>Tauri · p5.js · Rust · Syphon · Spout · MIDI · OSC</em>
  
huff is a desktop application for creating real-time datamosh, glitch-art, and feedback effects. Load a video file or connect a webcam, then sculpt the image through a live effect chain — datamosh tile displacement, feedback loops, flow warps, symmetry folds, solarise, scanline corruption, and ghost trails.

It ships with a two-window architecture: a **controls panel** and a separate **fullscreen output window** that receives the processed frames over a local WebSocket relay. The output window can be recorded, mirrored to a projector, or shared directly to VJ software via **Syphon** (macOS) or **Spout** (Windows).

huff is built for **performers and artists** who want a tool that behaves predictably under pressure — MIDI-mappable, OSC-receivable, and hot-swappable mid-set.

---

## Table of Contents

- [Features](#features)
- [How it Works](#how-it-works)
  - [Effect Pipeline Diagram](#effect-pipeline-diagram)
  - [UI → Effect Flow](#ui--effect-flow)
  - [Frame Output Pipeline](#frame-output-pipeline)
- [Installation](#installation)
  - [macOS](#macos)
  - [Windows](#windows)
- [Building from Source](#building-from-source)
- [The Interface](#the-interface)
  - [Source Group](#source-group)
  - [Glitch Group](#glitch-group)
  - [Feedback Group](#feedback-group)
  - [Scanlines Group](#scanlines-group)
  - [Clusters Group](#clusters-group)
  - [Solarize Group](#solarize-group)
  - [Flow Warp Group](#flow-warp-group)
  - [Symmetry Group](#symmetry-group)
  - [Trails Group](#trails-group)
  - [Presets](#presets)
  - [Keyboard Shortcuts](#keyboard-shortcuts)
- [MIDI](#midi)
  - [Connecting a Device](#connecting-a-device)
  - [MIDI Map Format](#midi-map-format)
  - [Bundled Maps](#bundled-maps)
  - [Virtual MIDI (IAC / loopMIDI)](#virtual-midi)
- [OSC](#osc)
  - [Setup](#osc-setup)
  - [OSC Map Format](#osc-map-format)
  - [Sending from Software](#sending-from-software)
  - [TouchOSC](#touchosc)
- [Video Output](#video-output)
  - [Syphon (macOS)](#syphon-macos)
  - [Spout (Windows)](#spout-windows)
  - [Canvas Mirror Window](#canvas-mirror-window)
- [Parameter Reference](#parameter-reference)
- [Presets Reference](#presets-reference)
- [Architecture](#architecture)
- [Performance Notes](#performance-notes)
- [Caveats and Known Limitations](#caveats-and-known-limitations)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Datamosh / glitch tiles** — temporal tile displacement sampled from a 60-frame ring buffer with cluster physics, spatial gap, smear, and depth scatter
- **Feedback loop** — zoom, translate X/Y, and rotate the buffer back onto itself each frame
- **Flow warp** — noise-field optical-flow UV distortion with pulse (sample from N frames back) and implosion modes
- **Symmetry** — vertical, horizontal, or both axes with a moveable split position
- **Solarise** — luminance-threshold colour inversion with per-channel R/G/B tinting
- **Scanline bands** — drifting horizontal displacement bands sampled from past frames, with gap quantisation and skew
- **Trails** — stacked ghost frames with luma keying for motion-smear
- **Camera input** — live webcam feed alongside or instead of video files
- **Syphon output (macOS)** — zero-install Metal texture sharing to Resolume, VDMX, MadMapper, CoGe, Millumin, and any Syphon receiver
- **Spout output (Windows)** — D3D11 texture sharing to Resolume Arena, TouchDesigner, MadMapper, and any Spout2 receiver
- **MIDI** — full CC/note input via native Rust `midir`; JSON-format map files; supports hardware controllers and virtual ports
- **OSC** — UDP listener on port 9000; JSON-format map files; works with TouchOSC, Max/MSP, Pure Data, SuperCollider, TouchDesigner
- **Presets** — save and recall named snapshots of all parameters; 7 factory presets included
- **Two-window output** — controls panel + separate fullscreen canvas window via embedded WebSocket relay
- **Hot-key control** — `P` toggles the control panel; `F` toggles fullscreen on the output window

---

## How it Works

### Effect Pipeline Diagram

Each frame, huff runs the source material through up to eight independent effect passes. Each pass is optional and independently toggleable. The order is fixed — the output of one pass feeds the next.

```
┌──────────────────────────────────────────────────────────────────┐
│                         SOURCE                                   │
│          video file  ·  webcam  ·  frame ring seed               │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      FRAME RING BUFFER                           │
│   Stores last N frames as ImageData (capped at 192 MB)          │
│   N = quality × 60, max 60 frames at quality=1                  │
└────┬──────┬──────┬──────┬──────┬──────┬──────┬──────────────────┘
     │      │      │      │      │      │      │
     ▼      ▼      ▼      ▼      ▼      ▼      ▼
  [t-1]  [t-2]  [t-3]  ...  [t-N]
     │
     ▼  (each pass reads the ring; writes to gBuf)
┌─────────────────────────────────────────────────────────────────┐
│  PASS 1  TRAILS        ghost frames composited under current    │
│  PASS 2  FEEDBACK      zoom/translate/rotate feedback blit      │
│  PASS 3  GLITCH        tile displacement from ring frames       │
│  PASS 4  SCANLINES     drifting horizontal band displacement    │
│  PASS 5  FLOW WARP     noise UV distortion                      │
│  PASS 6  SOLARIZE      luma-threshold colour inversion          │
│  PASS 7  SYMMETRY      mirror fold at axis                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                       OUTPUT FRAME                               │
├──────────────────────────────────────────────────────────────────┤
│  → Canvas window (WebSocket JPEG relay, port 8787)              │
│  → Syphon server  (macOS — Metal texture upload)                │
│  → Spout sender   (Windows — D3D11 texture upload)              │
│  → Screen (controls window preview)                             │
└──────────────────────────────────────────────────────────────────┘
```

### UI → Effect Flow

The controls window (`index.html`) runs inside the Tauri WebView. Every slider, checkbox, and input reads its value through the `els` object (a DOM lookup cache). The p5.js draw loop runs at the browser's frame rate and queries `els` directly — there is no intermediate state synchronisation layer.

```
┌──────────────────────────────────────────┐
│          Controls Panel (WebView)        │
│                                          │
│  slider → input event                   │
│       ↓                                  │
│  els.corrupt.value  (live DOM read)     │
│       ↓                                  │
│  p5 draw() loop  (requestAnimationFrame) │
│       ↓                                  │
│  applyGlitch(density, baseDX, baseDY)   │
│       ↓                                  │
│  drawRingRegion() per tile              │
└──────────────────────────────────────────┘

  MIDI CC received → midir (Rust)
       ↓
  Tauri "midi-event" event emitted
       ↓
  canvas.js onmessage handler
       ↓
  DOM element value updated
       ↓
  Next draw() frame picks it up (no delay)

  OSC UDP packet → rosc (Rust)
       ↓
  Tauri "osc-message" event emitted
       ↓
  canvas.js onmessage handler
       ↓
  DOM element value updated  ──→  same path as MIDI
```

MIDI and OSC both write to the same DOM elements as the sliders. There is intentionally no difference between moving a slider manually and receiving a CC or OSC message — they all converge on the same element value, and the draw loop reads that value on the next frame.

### Frame Output Pipeline

huff uses a single shared canvas as the source of truth for all output routes. The output pass happens at the end of each `draw()` call.

```
  p5 gBuf (effect chain output)
          │
          ├──→  Canvas window preview (drawn directly to screen)
          │
          ├──→  WebSocket mirror (canvas.html)
          │       JPEG-encoded at quality × 0.82
          │       sent as binary WS message to port 8787
          │       canvas.html drawImage() from blob URL
          │
          ├──→  Syphon (macOS only, when enabled)
          │       getImageData() → raw RGBA bytes
          │       prepend "HUFFSYPH" + width + height header
          │       binary WS to port 8787
          │       Rust relay intercepts on b"HUFFSYPH"
          │       syphon::push_frame() → MTLTexture upload
          │       SyphonMetalServer.publishFrameTexture()
          │
          └──→  Spout (Windows only, when enabled)
                  getImageData() → raw RGBA bytes
                  prepend "HUFFSPOUT" + width + height header
                  binary WS to port 8787
                  Rust relay intercepts on b"HUFFSPOUT"
                  spout::push_frame() → spoutdx_send_image()
                  SpoutDX D3D11 UpdateSubresource
```

The "HUFFSYPH" and "HUFFSPOUT" magic byte prefixes allow the Rust relay to distinguish platform output frames from normal canvas mirror frames on the same WebSocket connection, without requiring a separate port or connection.

---

## Installation

### macOS

1. Download `huff-1.0.2-universal.dmg` from the [Releases](../../releases) page.
2. Open the DMG and drag **huff** to your Applications folder.
3. On first launch, macOS may show a Gatekeeper warning because the app is not notarised. Right-click the app icon → **Open** → **Open** to bypass this once.
4. Grant camera access when prompted (required for webcam input).

No additional software is needed for Syphon — the framework is bundled inside the app.

### Windows

1. Download `huff-1.0.2-x64-setup.exe` or the MSI from the [Releases](../../releases) page.
2. Run the installer. Windows SmartScreen may warn about an unsigned binary — click **More info → Run anyway**.
3. If you plan to use Spout output, install the [Spout2 runtime](https://spout.zeal.co/) from the Spout website.
4. [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) is required on Windows 10 (pre-installed on Windows 11).

---

## Building from Source

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 18 LTS | [nodejs.org](https://nodejs.org) |
| Rust + Cargo | stable | `rustup` |
| Tauri CLI | 1.x | installed via `npm install` |

**macOS:** Xcode Command Line Tools (`xcode-select --install`)

**Windows:** [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **Desktop development with C++**. Add the MSVC Rust target: `rustup target add x86_64-pc-windows-msvc`.

**Linux:** WebKitGTK development libraries. See [Tauri Linux prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites/#setting-up-linux).

```bash
# Clone and install
git clone https://github.com/your-org/huff.git
cd huff
npm install

# Development (hot-reload)
npm run dev

# Production build
npm run build         # macOS: Universal DMG
npx tauri build       # Windows/Linux: native installer
```

### macOS Universal Binary

```bash
# Build ARM64 + Intel, lipo them together, package as DMG
bash scripts/create_universal_dmg.sh
# Output: artifacts/huff-universal.dmg
```

### Windows Artifacts

```cmd
REM Builds EXE + NSIS installer + MSI + portable ZIP + SHA256SUMS
scripts\tauri-build.cjs
REM Output: artifacts\<timestamp>\
```

---

## The Interface

The controls window is divided into collapsible groups. Each group can be collapsed by clicking its label. Groups are independent — collapsing one has no effect on the others or on active effects.

### Source Group

Controls the input material fed into the effect chain.

| Control | Description |
|---------|-------------|
| **File** | Load a video file. Drag-and-drop also works on the controls window. |
| **Camera** | Select and start a webcam. Refresh scans for newly connected devices. |
| **Play / Pause** | Toggle video playback. |
| **BASE VIDEO** | Show the raw source frame underneath the glitch output. |
| **BASE MIX** | Opacity of the base video layer (0 = fully glitched, 1 = full base). |
| **BASE BG** | Background fill colour when no tile covers a pixel: Black, Green (chroma), Blue, White. |
| **SEED ON LOAD** | Prime the frame ring buffer with the first video frame immediately on file load, rather than waiting for the ring to fill naturally. |
| **QUALITY** | Scales the frame ring depth (0→4 frames, 1→60 frames) and affects the temporal richness of all time-based effects. Also controls Solarize frame-skip frequency. |

### Glitch Group

The core datamosh engine. Reads tiles from past frames and blits them onto the current frame at noise-driven positions.

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable/disable the glitch pass. |
| **CORRUPT %** | 0–7 | Fraction of grid tiles displaced per frame. 0 = no tiles move. 7 = all tiles replaced. |
| **CORRUPT DRIFT** | 0–1 | Noise-driven breathing of the corruption density — the percentage oscillates slowly when > 0. |
| **PIXEL SIZE** | 150–2000 | Size of each grid tile in pixels. Larger = blockier, more visible datamosh. Smaller = fine grain. |
| **DEPTH** | 0–0.5 | How far back in the frame ring tiles are sampled. 0 = only the most recent frame. 0.5 = up to half the ring depth. |
| **DEPTH SCATTER** | 0–1 | Per-tile randomisation of the time offset. 0 = all tiles from the same frame. 1 = each tile picks its own depth independently. |
| **GLITCH SIZE** | 1–60 | Spatial scaling of each tile relative to PIXEL SIZE. |
| **OPACITY** | 0–1 | Alpha of each blit tile. Lower values ghost the displaced content. |
| **JITTER** | 0–1 | Magnitude of per-tile position noise. Adds organic displacement on top of the regular grid. |
| **SMEAR** | 0–200 | Number of duplicate stamps trailed behind each displaced tile. |
| **SMEAR ANGLE** | 0–360 | Direction of smear trail in degrees. 0 = noise-driven (random per frame). |
| **SPEED** | 0–10 | Phase velocity of the noise field that drives tile selection and positioning. |
| **FINE SPEED** | 0–5 | Secondary noise phase — multiplied with SPEED for finer control. |
| **MULT** | 0–5 | Global speed multiplier applied on top of SPEED × FINE SPEED. |
| **GLITCH X / Y** | -1–1 | Base offset applied to all tile destination positions. |
| **SEED** | — | Randomisation seed. Same seed + same parameters = same output. Use to lock a particular glitch pattern. |

### Feedback Group

Composites the previous output frame back onto itself with a spatial transform. Enables infinite zoom, drift, and rotation effects.

| Control | Range | Description |
|---------|-------|-------------|
| **FEEDBACK** | 0–3 | How strongly the previous frame contributes to the next. 0 = no feedback. Values > 1 over-expose. |
| **PERSISTENCE** | 0–10 | Decay rate of the feedback buffer between frames. Higher = trails linger longer. |
| **FB X** | -1–1 | Horizontal translation per frame. Creates lateral drift. |
| **FB Y** | -1–1 | Vertical translation per frame. Creates vertical drift. |
| **FB Z** | 0.98–1.03 | Zoom per frame. < 1 = implode, > 1 = explode. |
| **FB θ** | -2–2 | Rotation in degrees per frame. Creates spinning feedback. |
| **Reset Motion** | button | Returns FB X, FB Y, FB Z, FB θ to neutral (0, 0, 1.0, 0). |

### Scanlines Group

Displaces horizontal bands of the image by sampling from past frames. Creates a horizontal scan corruption aesthetic.

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable/disable the scanline pass. |
| **BANDS** | 0–30 | Number of active displacement bands per frame. |
| **BAND HEIGHT** | 0–1 | Relative height of each band. |
| **RAND SIZE** | toggle | Randomise band height per band rather than using a fixed value. |
| **SHIFT** | 0–0.5 | Maximum horizontal displacement magnitude as a fraction of canvas width. |
| **SKEW** | -1–1 | Adds a position-based horizontal offset so bands angle across the frame. |
| **DRIFT** | 0–3 | Vertical drift speed of band positions over time. |
| **SPEED** | 0–5 | Overall speed multiplier for band drift. |
| **GAP** | 0–200 | Snaps band positions to a regular grid with this spacing, creating rhythmic rather than random placement. |
| **OPACITY** | 0–1 | Alpha of displaced band content. |

### Clusters Group

When enabled, tile placement is biased toward radial clusters rather than uniform scatter. Creates concentrated glitch zones that can drift, spin, and pulse.

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable cluster-biased tile placement (Glitch must also be ON). |
| **CENTERS** | 1–20 | Number of cluster centres. |
| **SPREAD** | 1–300 | Radius around each centre that tiles are distributed within. |
| **MIN RAD** | 0–150 | Minimum distance from cluster centre — creates a hollow core. |
| **SPATIAL GAP** | 0–200 | Minimum pixel distance between any two tiles, preventing overlap. |
| **BIAS** | 0–1 | Fraction of tiles forced into clusters. Remainder are placed randomly. |
| **DRIFT** | 0–5 | Adds noise-driven movement to cluster centre positions. |
| **SPEED** | 0–15 | Speed of cluster centre physics simulation. 0 = static positions. |
| **INERTIA** | 0.01–0.99 | How much cluster centres carry momentum between frames. High inertia = smooth slow movement. Low = jittery. |

### Solarize Group

Per-pixel luminance-threshold colour inversion. Pixels above the threshold have their channel values inverted by the amount, with independent RGB scaling.

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable/disable solarize. |
| **THRESH** | 0–1 | Luminance threshold. Pixels with luma above this are inverted. |
| **AMOUNT** | 0–1 | Inversion strength. 0 = no effect, 1 = full inversion. |
| **SOL R / G / B** | 0–2 | Per-channel multiplier applied after inversion. Use to tint the solarised regions. Values > 1 over-expose that channel. |

### Flow Warp Group

Distorts UV coordinates using a noise field, creating a liquid or heat-haze displacement.

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable/disable flow warp. |
| **STRENGTH** | 0–20 | Maximum pixel displacement applied by the warp. |
| **SCALE** | 40–200 | Spatial scale of the noise field. Lower = finer warp cells, higher = broader sweeping motion. |
| **PULSE** | 0–200 | Number of frames back in the ring to sample during warp. Creates temporal smearing as the warped source comes from the past. |
| **IMPLODE** | 0–1 | Adds a centripetal pull toward the canvas centre on top of the noise warp. |

### Symmetry Group

Mirrors the current frame about one or both axes.

| Control | Options / Range | Description |
|---------|-----------------|-------------|
| **SYMM** | toggle | Enable/disable symmetry. |
| **MODE** | V / H / HV | Vertical mirror, horizontal mirror, or both simultaneously. |
| **SYM POS** | 0–1 | Position of the mirror axis as a fraction of canvas width (V) or height (H). 0.5 = centred. |

### Trails Group

Blends multiple past frames as translucent ghost layers underneath the current frame.

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable/disable trails. |
| **TRAIL LAYERS** | 0–10 | Number of ghost frames composited. More layers = denser trail. |
| **TRAIL DEPTH** | 0–1 | How far back in the ring to pull trail frames from. |
| **LUMA KEY** | 0–1 | Below-threshold luminance pixels in trail frames are dropped. Creates a luma-keyed ghost effect where only bright areas trail. |

### Presets

Presets save and recall a complete snapshot of all parameter values. They are stored in `localStorage` and persist across sessions.

- **Save** — type a name and click Save. If the name already exists it is overwritten.
- **Load** — select a preset from the dropdown and click Load.
- **Delete** — select and click Delete.

**Factory presets** (read-only, always available):

| Preset | Character |
|--------|-----------|
| `clean` | All effects off — raw source passthrough |
| `chaos` | High corruption, deep ring, fast clusters |
| `melt` | Slow feedback zoom with deep scanlines |
| `mirror` | Symmetry-forward with light solarise |
| `pulse` | Rhythmic cluster glitch with trails |
| `solar` | Solarise dominant, flow warp texture |
| `vapor` | Soft trails, slow feedback rotation |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `P` | Toggle the controls panel visibility |
| `F` | Toggle fullscreen on the output canvas window |

---

## MIDI

huff's MIDI system runs natively in Rust via `midir`. USB controllers, USB-MIDI interfaces, and virtual ports (IAC Bus on macOS, loopMIDI on Windows) are all supported. MIDI does not go through the browser — there is no Web MIDI API dependency.

### Connecting a Device

1. Click the **MIDI** button in the top bar.
2. Click **↻ Refresh** to scan for available ports.
3. Select your device from the dropdown.
4. Click **Connect**.

The status area confirms the connected port name. To change devices, disconnect first, then select and connect again.

### MIDI Map Format

Maps are plain JSON files loaded at runtime. The `param` field is the DOM element ID of the control you want to drive.

```json
{
  "name": "My Controller",
  "description": "Optional note",
  "version": 1,
  "channel": -1,
  "mappings": [
    { "param": "feedback",   "cc": 14, "type": "range",   "enabled": true },
    { "param": "corrupt",    "cc": 15, "type": "range",   "enabled": true },
    { "param": "corruptOn",  "cc": 64, "type": "toggle",  "enabled": true },
    { "param": "refreshBtn", "cc": 82, "type": "trigger", "enabled": true }
  ]
}
```

**`type` values:**

- `range` — CC 0–127 is scaled linearly to the parameter's min–max
- `toggle` — CC > 63 → ON, CC ≤ 63 → OFF
- `trigger` — any CC > 0 fires the button's click event

**`channel`:** `-1` accepts all channels. `0`–`15` filters to a specific channel (0-indexed, so channel 1 = `0`).

**`enabled: false`** disables an entry without deleting it — useful for temporarily silencing a mapping.

### Bundled Maps

| File | Controller |
|------|-----------|
| `src/midi/nanokontrol2.json` | Korg nanoKONTROL2 |
| `src/midi/nanokontrol1.json` | Korg nanoKONTROL (original) |
| `src/midi/generic.json` | Generic 16-CC template (CC 14–29) |

### Virtual MIDI

**macOS — IAC Driver:**
1. Open **Audio MIDI Setup** (in Applications/Utilities).
2. Open the MIDI Studio (⌘2).
3. Double-click **IAC Driver**.
4. Enable **Device is online**, add a port (e.g. "Bus 1").
5. The IAC port appears immediately in huff's MIDI port list.

**Windows — loopMIDI:**
1. Download and install [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html).
2. Create a virtual port.
3. The port appears in huff's MIDI port list.

Once a virtual port exists, Max/MSP, Pure Data, Ableton, and other software can send MIDI to huff through it.

---

## OSC

huff listens for UDP OSC on port `9000` on all interfaces (`0.0.0.0:9000`). Any device on the same local network can send to it.

### OSC Setup

1. Click the **OSC** button in the top bar.
2. The status area confirms the listener is active and shows the port.
3. Load a map file via **Load Map…**. The map persists in `localStorage` and reloads automatically on next launch.
4. The OSC pill in the top bar flashes the address of each received message.

### OSC Map Format

```json
{
  "name": "My TouchOSC Layout",
  "version": 1,
  "mappings": [
    {
      "param":    "feedback",
      "addr":     "/1/fader1",
      "type":     "range",
      "inputMin": 0,
      "inputMax": 1,
      "enabled":  true,
      "note":     "Main feedback fader"
    },
    {
      "param":    "corruptOn",
      "addr":     "/1/toggle1",
      "type":     "toggle",
      "enabled":  true
    }
  ]
}
```

**`type` values:**

- `range` — incoming float mapped from `inputMin–inputMax` to the parameter's native min–max
- `toggle` — value > 0.5 → ON, value ≤ 0.5 → OFF
- `trigger` — value > 0.5 fires the button click

**`inputMin` / `inputMax`:** Set these to match your sender's output range. TouchOSC faders send `0.0–1.0` so use `0, 1`. Some MIDI-to-OSC bridges send `0–127` — use `0, 127`.

### Sending from Software

| Software | Method |
|----------|--------|
| Max/MSP | `[udpsend 127.0.0.1 9000]` |
| Pure Data | `[netsend -u -b 127.0.0.1 9000]` |
| SuperCollider | `NetAddr("127.0.0.1", 9000).sendMsg("/huff/feedback", 0.75)` |
| TouchDesigner | OSC Out DAT, host `127.0.0.1`, port `9000` |
| Python (pythonosc) | `SimpleUDPClient("127.0.0.1", 9000)` |
| Protokol / OSCQuery | Any app supporting OSC output |

### TouchOSC

1. In TouchOSC go to **Settings → OSC**.
2. Set **Host** to your computer's local IP (e.g. `192.168.1.42`).
3. Set **Port (outgoing)** to `9000`.
4. Enable **OSC**.
5. Load one of the bundled map files (`src/osc/touchosc-effects.json` or `touchosc-mix.json`) in huff's OSC panel.

Bundled maps reference the standard TouchOSC `/1/faderN` and `/1/toggleN` address scheme used by the built-in Simple layout.

---

## Video Output

### Syphon (macOS)

Syphon lets huff share its canvas as a named texture that any Syphon-enabled application can receive in real time — without capture cards, screen recording, or NDI.

**Compatible receivers:** Resolume Avenue/Arena, VDMX, MadMapper, CoGe, Millumin, Modul8, Processing (Syphon library), Max/MSP (Jitter), and anything that supports the Syphon protocol.

**Usage:**
1. Click the **SYPHON** button in the top bar.
2. Set the output resolution (default: 1280×720).
3. Set the FPS cap (default: 30).
4. Click **▶ Start**. The sender appears as `huff` in any Syphon receiver.
5. Click **■ Stop** to close the server.

**Technical notes:**
- The Syphon.framework is bundled inside the huff app bundle — no separate installation is needed.
- The pipeline is: worker-assisted canvas scaling/readback → raw RGBA bytes on a dedicated `syphon-sender` WebSocket → Rust `syphon::push_pixels()` → reusable `MTLTexture` upload → `SyphonMetalServer.publishFrameTexture()`.
- Width and height are declared once in the socket hello message; normal frames contain raw RGBA only. Legacy `HUFFSYPH` packets remain accepted for compatibility.
- Capture and Metal upload pause while no Syphon receiver is attached, and one publish acknowledgement permits the next frame.
- This still uses a CPU round-trip (JS pixel readback). Frame rate is throttled to the configured FPS cap to limit the readback cost.

### Spout (Windows)

Spout is the Windows equivalent of Syphon. huff shares its canvas as a named D3D11 texture that any Spout2-enabled application can receive.

**Compatible receivers:** Resolume Arena, TouchDesigner, MadMapper, Notch, and anything that supports the Spout2 protocol.

**Usage:**
1. Install the [Spout2 runtime](https://spout.zeal.co/) if not already installed.
2. Click the **SPOUT** button in the top bar.
3. Set the output resolution and FPS cap.
4. Click **▶ Start**. The sender appears as `huff` in Spout receivers.

**Technical notes:**
- The Spout bridge DLL (`spout_bridge.dll`) is compiled from source and bundled next to the huff executable.
- The pipeline is: canvas scaling/readback → raw RGBA bytes on a dedicated `spout-sender` WebSocket → Rust `spout::push_pixels()` → `spoutdx_send_image()` → D3D11 `UpdateSubresource`.
- Width and height are declared once in the socket hello message; normal frames contain raw RGBA only. Legacy `HUFFSPOUT` packets remain accepted for compatibility.
- Same CPU round-trip as Syphon. GPU-direct zero-copy is not implemented in this release.

### Canvas Mirror Window

The separate output canvas window (`canvas.html`) connects to the embedded WebSocket relay on port `8787` and receives JPEG-encoded frames. The controls WebView now encodes only while at least one canvas receiver is attached, and the sender waits for a relay acknowledgement before submitting another JPEG. This window can be:

- Moved to a second monitor and made fullscreen (`F` key)
- Opened in a browser by navigating to `file:///path/to/huff/src/canvas.html` while the app is running
- Used as an OBS window-capture source

The canvas window does not apply any additional effects — it displays exactly what the controls window output is.

---

## Parameter Reference

Complete list of all mappable parameter IDs, ranges, and descriptions for use in MIDI and OSC map files.

### Range Parameters

| ID | Label | Min | Max |
|----|-------|-----|-----|
| `baseMix` | Base Mix | 0 | 1 |
| `quality` | Quality | 0 | 3 |
| `feedback` | Feedback | 0 | 3 |
| `persistence` | Persistence | 0 | 10 |
| `fbX` | FB X | -1 | 1 |
| `fbY` | FB Y | -1 | 1 |
| `fbZ` | FB Z | 0.98 | 1.03 |
| `fbTheta` | FB θ | -2 | 2 |
| `depth` | Depth | 0 | 0.5 |
| `depthScatter` | Scatter | 0 | 1 |
| `corrupt` | Corrupt % | 0 | 7 |
| `corruptDrift` | Corrupt Drift | 0 | 1 |
| `block` | Pixel Size | 150 | 2000 |
| `glitchSize` | Glitch Size | 1 | 60 |
| `glitchAlpha` | Tile Opacity | 0 | 1 |
| `glitchJitter` | Jitter | 0 | 1 |
| `glitchSmear` | Smear | 0 | 200 |
| `glitchSmearAngle` | Smear Angle | 0 | 360 |
| `glitchSpeed` | Glitch Speed | 0 | 10 |
| `glitchSpeedFine` | Fine Speed | 0 | 5 |
| `glitchSpeedMul` | Speed Mult | 0 | 5 |
| `glitchBaseX` | Glitch X | -1 | 1 |
| `glitchBaseY` | Glitch Y | -1 | 1 |
| `trailLayers` | Trail Layers | 0 | 10 |
| `trailDepth` | Trail Depth | 0 | 1 |
| `trailLumaKey` | Luma Key | 0 | 1 |
| `symPos` | Sym Position | 0 | 1 |
| `scanShift` | Scan Shift | 0 | 0.5 |
| `scanDrift` | Scan Drift | 0 | 3 |
| `scanSpeed` | Scan Speed | 0 | 5 |
| `scanGap` | Scan Gap | 0 | 200 |
| `scanSkew` | Scan Skew | -1 | 1 |
| `scanAlpha` | Scan Opacity | 0 | 1 |
| `clusterCount` | Scan Bands | 0 | 30 |
| `clusterRadius` | Band Height | 0 | 1 |
| `cluCenters` | Clu Centers | 1 | 20 |
| `cluSpread` | Clu Spread | 1 | 300 |
| `cluMinSpread` | Clu Min Rad | 0 | 150 |
| `spatialGap` | Spatial Gap | 0 | 200 |
| `cluBias` | Clu Bias | 0 | 1 |
| `cluDrift` | Clu Drift | 0 | 5 |
| `cluSpeed` | Clu Speed | 0 | 15 |
| `cluInertia` | Clu Inertia | 0.01 | 0.99 |
| `solarizeThresh` | Sol Thresh | 0 | 1 |
| `solarizeAmt` | Sol Amount | 0 | 1 |
| `solarizeR` | Sol R | 0 | 2 |
| `solarizeG` | Sol G | 0 | 2 |
| `solarizeB` | Sol B | 0 | 2 |
| `flowStrength` | Flow Strength | 0 | 20 |
| `flowScale` | Flow Scale | 40 | 200 |
| `flowPulse` | Flow Pulse | 0 | 200 |
| `flowImpl` | Flow Implode | 0 | 1 |

### Toggle Parameters (checkboxes)

| ID | Label |
|----|-------|
| `corruptOn` | Glitch On |
| `baseOn` | Base Video |
| `seedOnLoad` | Seed on Load |
| `symOn` | Symmetry On |
| `clusters` | Scanlines On |
| `scanRandSize` | Rand Band Size |
| `clusterTiles` | Cluster Tiles On |
| `solarizeOn` | Solarize On |
| `flowOn` | Flow Warp On |
| `trailOn` | Trails On |

### Trigger Parameters (buttons)

| ID | Action |
|----|--------|
| `refreshBtn` | Re-seed glitch randomisation |
| `resetMotionBtn` | Reset FB X/Y/Z/θ to defaults |
| `resetBtn` | Reset all parameters to defaults |

---

## Architecture

```
huff/
├── src/                          # Frontend (HTML + JS, no bundler)
│   ├── index.html                # Controls window — all UI, p5 draw loop, effect chain
│   ├── canvas.html               # Output mirror window — receives WS frames
│   ├── canvas.js                 # p5 setup, draw loop, video handling, WS sender
│   ├── effects.js                # applyGlitch, applyTrails, applyScanlines,
│   │                             #   applyFlowWarp, applySolarize, applySymmetry
│   ├── p5.js                     # p5.js library (bundled locally, no CDN)
│   ├── midi/                     # Bundled MIDI map files
│   ├── osc/                      # Bundled OSC map files
│   └── presets/                  # Factory preset JSON files
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs               # Rust entry: WS relay, MIDI commands, OSC listener,
│   │   │                         #   Syphon + Spout command handlers
│   │   ├── syphon.rs             # macOS Syphon ObjC FFI (Metal texture upload)
│   │   └── spout.rs              # Windows Spout2 D3D11 bridge
│   ├── native/
│   │   └── spout_bridge/         # C++ SpoutDX bridge (compiled by build.rs via CMake)
│   │       ├── spout_bridge.cpp
│   │       ├── spout_bridge.h
│   │       └── CMakeLists.txt
│   ├── frameworks/
│   │   └── Syphon.framework      # Bundled macOS Syphon framework
│   ├── Cargo.toml
│   ├── build.rs                  # CMake invocation for Spout (Windows only)
│   ├── tauri.conf.json
│   └── capabilities/
│       └── network.json          # Tauri capability: WS relay access
│
├── scripts/
│   ├── create_universal_dmg.sh   # macOS: lipo + DMG packaging
│   └── tauri-build.cjs           # Windows: EXE + MSI + ZIP + checksums
│
└── package.json
```

**WebSocket relay** runs inside the Tauri Rust process. It binds on `127.0.0.1:8787` (IPv4) and `[::1]:8787` (IPv6). Clients register as `index` (sender) or `canvas` (receiver) via a JSON handshake. Binary frames are forwarded only to `canvas` clients unless they carry a `HUFFSYPH` or `HUFFSPOUT` magic prefix, in which case Rust intercepts and routes them to the platform output subsystem.

**Rust crates used:**

| Crate | Purpose |
|-------|---------|
| `tauri 1.x` | App shell, two-window management, IPC |
| `tokio 1.x` | Async runtime for WS relay and OSC listener |
| `tokio-tungstenite 0.21` | WebSocket server |
| `midir 0.9` | Native MIDI input |
| `rosc 0.10` | OSC UDP packet decoder |
| `objc / objc-foundation` | macOS Syphon ObjC FFI (macOS only) |
| `cmake 0.1` | Spout bridge CMake build (Windows only) |

---

## Performance Notes

- **Frame ring** stores reusable canvas-backed snapshots rather than raw `ImageData` arrays or p5 `Graphics` instances. Decoded frames are copied once into owned canvas slots and sampled directly by temporal effects without a later `putImageData()` reconstruction. Dedicated ring contexts remain in `copy` mode, and capacity math only runs when resolution or QUALITY changes.
- **192 MB ring cap** — the ring depth is capped regardless of the quality setting. At 1080p (≈8 MB per frame) this gives roughly 24 frames maximum. At 720p (≈3.7 MB) you get the full 60 frames at quality=1.
- **`drawRingRegion`** samples the reusable history canvases directly with native `drawImage` cropping. It performs no per-tile pixel upload or allocation.
- **Solarize** downsamples to a 640px-wide scratch canvas before the pixel pass, then scales back up. This is 4–16× faster on large canvases and makes a large practical difference on Windows/DirectX WebView.
- **Flow warp** renders in tiles rather than per-pixel — the tile size is set by the SCALE parameter. Static tile geometry, normalized coordinates, radial vectors, and swirl angles are cached until render size or SCALE changes. Larger tiles = faster but coarser warp.
- **QUALITY slider** controls temporal-ring depth. Solarize uses an independent adaptive load guard that reuses its cached result only when sustained frame time exceeds the healthy range.
- **Feedback** uses `drawingContext.drawImage` directly rather than `p5.get()`, eliminating one full-canvas copy per frame.
- **Full-resolution surfaces** are limited to `gCur`, `gBuf`, and one shared `gScratch` ping-pong target. Feedback, Flow Warp, and Symmetry reuse `gScratch` instead of retaining separate full-size buffers.
- **Resize behavior** resizes existing p5 Graphics objects in place and reuses Solarize/Luma scratch canvases, avoiding a temporary old-plus-new buffer set during window resizing.
- **Final presentation** uses the cached native Canvas2D context for background fill, base mix, and final composite instead of routing full-frame blits through p5 wrappers.
- **Canvas mirror** is receiver-aware and one-frame-in-flight. With no output window attached, HUFF performs no mirror `ImageBitmap` capture, JPEG encode, or relay upload.
- If the app stutters, try: lower QUALITY → reduce canvas resolution → increase PIXEL SIZE → disable Flow Warp (the most expensive pass).

---

## Caveats and Known Limitations

**CPU pixel readback for Syphon and Spout.**
Both output routes use `getImageData()` to read pixels from the canvas back to the CPU, then send them over the local WebSocket to Rust, which uploads them to a GPU texture. This is a full GPU→CPU→GPU round trip per frame. It works well at 720p/30fps but is not zero-copy. GPU-direct sharing (sharing the WebGL texture handle directly with Syphon/Spout) is not feasible in the Tauri WebView context in this release.

**Frame rate is throttled for Syphon/Spout.**
The FPS cap in the Syphon/Spout panels defaults to 30 fps and should not be set higher than your actual canvas frame rate. Sending faster than the canvas draws produces duplicate frames and wastes CPU.

**Memory grows with resolution.**
The 192 MB ring cap is enforced by frame count, not pixel size. At 4K resolution, the ring effectively holds only a few frames regardless of the quality setting, and the datamosh effect loses temporal depth. 720p or 1080p is the practical sweet spot.

**Syphon is macOS-only. Spout is Windows-only.**
These are platform protocols with no cross-platform equivalent in this release. If you need cross-platform texture sharing, use OBS window capture or NDI (not currently implemented).

**Camera permissions require codesigning for distribution.**
In development (`npm run dev`) the camera entitlement is injected by Tauri automatically. In distribution builds on macOS, the app must be codesigned with the `NSCameraUsageDescription` entitlement for the permission dialog to appear. Unsigned builds will silently fail the camera permission request on macOS 12+.

**SmartScreen warning on Windows.**
Unsigned Windows builds trigger a SmartScreen warning. This is expected — click **More info → Run anyway**. For signed distribution, sign the EXE with a code-signing certificate before publishing.

**Port 8787 must be free.**
The WS relay binds to `127.0.0.1:8787` and `[::1]:8787` at startup. If another application is already using this port, the relay will fail silently and the canvas mirror window will not receive frames. Change `const PORT: u16 = 8787` in `src-tauri/src/main.rs` and update the `__getWSURL__` call in `src/index.html` to match.

**Linux is untested.**
The Tauri scaffolding supports Linux and the build instructions include Linux prerequisites, but no binary has been tested against a Linux runtime in this release. Syphon and Spout are not available on Linux. Community contributions welcome.

**OSC map persists in `localStorage` per-origin.**
The OSC map is stored in the WebView's `localStorage`. If you clear browser data for the app origin or uninstall and reinstall, the map will be lost. Export maps as JSON files and keep them alongside your project files.

**No multi-instance support.**
Running two instances of huff simultaneously will cause a port conflict on 8787. If you need parallel instances, build separate copies with different port constants.

---

## Troubleshooting

**Blank canvas window / "WS: disconnected"**
The canvas window connects to the relay in the Tauri process. If you opened `canvas.html` directly in a browser outside of the app, run `node src/ws-server.js` in the project directory to start a standalone relay.

**Camera not appearing**
Click **↻ Refresh** in the Source group after connecting your camera. On macOS, the first time the app requests camera access a system dialog appears — grant access and refresh again. If no dialog appears and the camera still doesn't show, the app may not be codesigned correctly for the permission to be requested.

**MIDI device not appearing**
Click **↻ Refresh** in the MIDI panel. The port list is read fresh on each refresh — devices plugged in after the panel was opened do not appear automatically.

**Syphon not visible to receivers**
Confirm the Syphon server shows **active** status in the Syphon panel. In your receiver (e.g. Resolume), trigger a re-scan of Syphon sources. If the app was just launched, wait 1–2 seconds before scanning — the server registers asynchronously.

**Spout init failed**
Install the [Spout2 runtime](https://spout.zeal.co/). The `spoutdx_send_image` function in the bridge DLL requires the Spout2 runtime DLLs to be present on the system.

**High memory usage**
Lower the QUALITY slider. At quality=1 and 1080p the ring can hold up to 192 MB. At quality=0 it holds only 4 frames.

**Port 8787 already in use**
Find which process is using the port:
```bash
# macOS/Linux
lsof -i :8787
# Windows
netstat -ano | findstr :8787
```
Change `PORT` in `src-tauri/src/main.rs` and `WS_MIRROR_URL` in `src/index.html` to an unused port, then rebuild.

**`tauri build` fails on Linux with missing library**
Re-run the WebKitGTK/libssl dependency install for your distribution from the [Building from Source](#building-from-source) section.

---

<p align="center">
  <sub>huff v1.0.2 beta · built with Tauri, p5.js, Rust, Syphon, Spout2 · ISC licence</sub>
</p>


## HUFF Classic Optimization Pass 5

This build reduces full-frame canvas clears, combines the Flow Warp grid into one traversal, caches Solarize channel maps, and reuses Pipeline Luma Key masks between identical decoded frames. The Pass 4 bounded, client-aware Syphon transport remains included.


## HUFF Classic Optimization Pass 6

This build mirrors render controls into an event-driven typed state cache, removing repeated DOM lookups and number parsing from the 60 fps draw/effect path. Glitch, scanline, feedback, flow, symmetry, solarize, global-mix, and temporal-ring settings now read the cached state while normal UI input, MIDI, OSC, presets, and reset operations keep it synchronized through their existing input/change events. Per-frame effect closures were also moved to reusable helpers, and an unreachable static-cluster helper was removed. No effect, control, routing, Syphon, or packaging behavior was intentionally changed.


## HUFF Classic Optimization Pass 7

This build reuses typed glitch-placement buffers instead of creating target arrays, coordinate pairs, a Map-of-arrays spatial index, and cluster-offset objects on every rendered frame. The existing seeded-random order, Spatial Gap rule, cluster coherence, target order, temporal history selection, and Canvas2D blit sequence are preserved. No Syphon, Spout, routing, control, or packaging behavior was intentionally changed.

## HUFF Classic Optimization Pass 8

This build concentrates on the Canvas2D surface topology. It consolidates the former Flow, Symmetry, and feedback scratch surfaces into one shared ping-pong buffer, reducing the always-resident p5 Graphics set from four full-resolution surfaces to three and removing the separate feedback snapshot canvas. Existing p5 Graphics objects and CPU-pixel scratch canvases are resized in place, the main output composite and symmetry pass use direct Canvas2D operations, and mirror quality/FPS math is cached on control events. Effect order, control behavior, temporal history, Syphon transport, Spout, and mandatory Syphon framework packaging remain unchanged.

## HUFF Classic Optimization Pass 9

This build reduces repeated geometry work in Flow Warp by retaining a reusable typed grid workspace keyed by render size and SCALE. It also keeps dedicated frame-ring contexts in overwrite mode, caches ring-capacity calculations until resolution or QUALITY changes, and makes the JPEG canvas mirror receiver-aware with one relay frame in flight. Closing the canvas window now stops mirror capture and encoding while the controls renderer, Syphon, and Spout remain independent. Effect order, Flow formulas, Float32 displacement quantization, temporal sampling, controls, presets, and mandatory Syphon framework packaging are preserved.

## HUFF Classic Optimization Pass 10

This build optimizes the Scanline engine with a reusable typed band workspace. Per-band noise seed constants and static rotated-span geometry are retained across frames, identical static scanline states reuse prepared band coordinates, invisible scanline states exit before Canvas2D setup, and the shared alpha state is applied once per pass instead of once per band. Drift, focus, roll, gap quantization, skew, shift, spin, clipping, source sampling, and draw order remain unchanged. This follows the same Junkpile-derived resource discipline already applied to Flow: persistent workspaces, geometry invalidation only when its inputs change, and no per-frame resource construction.


## HUFF Classic Optimization Pass 11

This build adds a reusable render-activity plan and bypasses full-frame work when a stage cannot visibly change the image. Zero-strength Flow, invisible Scanlines, zero-mix Luma Key and Global Mix, identity Feedback, edge-position Symmetry, and exact-identity Solarize settings no longer dispatch their expensive paths. The clean bypass path presents `gCur` directly without a background fill and synchronizes `gBuf` only once per genuinely decoded source frame instead of once per render tick. Scanline and glitch phase progression remains continuous, and Scanlines/Luma Key are now included in the effective-pipeline predicate so those stages are not accidentally discarded when used without another effect. Syphon, Spout, the Rust relay, framework packaging, and the fixed Classic routing order remain unchanged.

## HUFF Classic Optimization Pass 13S

This build branches from the stable Pass 12R / Pass 11 runtime. It preserves Blob URL loading through p5 `createVideo()` and keeps the p5 renderer, transport display, canvas mirror, and profiler on their existing independent schedules. Source-generation guards now prevent late file, autoplay, seek, error, and camera callbacks from reactivating replaced media. Readiness intervals, autoplay listeners, camera tracks, Blob URLs, Web Audio links, mirror Workers, and WebSockets receive explicit replacement and shutdown cleanup. The rejected Pass 13 render-boundary scheduler consolidation is not included.
