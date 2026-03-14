<p align="center">
  <img width="300px" height="950px" src="https://github.com/schwwaaa/huff/blob/beta/src-tauri/icons/icon.png?raw=true"/>  
</p>

<p align="center"><em>A real-time datamosh / glitch-art desktop application built with Tauri + p5.js.</em></p>

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
  - [All Platforms](#all-platforms)
  - [macOS](#macos-extra)
  - [Windows](#windows-extra)
  - [Linux](#linux-extra)
- [Development Build](#development-build)
- [Production Build](#production-build)
  - [macOS – Universal DMG](#macos--universal-dmg)
  - [Windows – EXE / MSI / NSIS](#windows--exe--msi--nsis)
  - [Linux – AppImage / deb](#linux--appimage--deb)
- [Project Structure](#project-structure)
- [Effect Controls Reference](#effect-controls-reference)
- [WebSocket Relay](#websocket-relay)
- [Performance Notes](#performance-notes)
- [Troubleshooting](#troubleshooting)

---

Load a video file or plug in a webcam, then sculpt live datamoshing, feedback loops, flow warps, symmetry, solarise, scanline corruption, and more — all streamed in real time to a separate fullscreen canvas window via an embedded WebSocket relay.

## Features

- **Datamosh / glitch tiles** — temporal tile displacement sampled from a frame ring buffer
- **Feedback loop** — zoom/rotate/translate the buffer back onto itself each frame
- **Flow warp** — noise-driven optical-flow distortion with pulse and implosion modes
- **Symmetry** — vertical, horizontal, or both, with adjustable axis position
- **Solarise** — luminance-threshold inversion with per-channel RGB tinting
- **Scanline bands** — drifting horizontal displacement bands sampled from past frames
- **Trail accordion** — stacked ghost frames for motion-smear effects
- **Camera input** — live webcam feed alongside or instead of video files
- **Canvas mirror** — second window (or popup) that receives the composited frame over WebSocket at up to 30 fps
- **Keyboard shortcuts** — `P` toggles the control panel; `F` toggles fullscreen

---

## Architecture

```
┌─────────────────────────────────────┐
│  Tauri shell (Rust)                 │
│  ┌──────────────────────────────┐   │
│  │  Embedded WS relay (port 8787│   │
│  │  Tokio + tokio-tungstenite   │   │
│  └───────────┬──────────────────┘   │
│              │ binary frames        │
│  ┌───────────▼──────────────────┐   │
│  │  index.html (controls + p5)  │◄──┼─ video file / webcam
│  │  canvas.js  effects.js       │   │
│  └───────────┬──────────────────┘   │
│              │ JPEG frames over WS  │
│  ┌───────────▼──────────────────┐   │
│  │  canvas.html (mirror viewer) │   │
│  │  drawImage + fullscreen      │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

The Rust backend spawns two Tokio listeners (`127.0.0.1:8787` and `[::1]:8787`). Clients register as `index` (sender) or `canvas` (receiver) via a `{"type":"hello","role":"..."}` handshake. Binary frames are forwarded only to `canvas` clients; text messages are broadcast to all others.

---

## Prerequisites

### All Platforms

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | ≥ 18 LTS | [nodejs.org](https://nodejs.org) |
| **Rust + Cargo** | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Tauri CLI** | 1.x (installed via npm) | `npm install` in project root |

After cloning, install Node dependencies from the project root:

```bash
npm install
```

---

### macOS extra

Xcode Command Line Tools are required for the linker and `lipo`:

```bash
xcode-select --install
```

Camera access requires the entitlements already present in `src-tauri/entitlements.plist`. No extra steps are needed for dev builds; codesigning is required for distribution.

---

### Windows extra

Install the **Microsoft C++ Build Tools** (MSVC toolchain):

1. Download [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. Select **Desktop development with C++**

Install **WebView2** (required at runtime on Windows < 11):

- Download [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
- Or ship the bootstrapper — the Windows build script's `README.txt` reminds end-users.

Add the MSVC target for Rust:

```powershell
rustup target add x86_64-pc-windows-msvc
```

---

### Linux extra

Install system libraries required by Tauri/WebKitGTK:

**Ubuntu / Debian:**

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.0-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

**Arch Linux:**

```bash
sudo pacman -S --needed \
  webkit2gtk \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  gtk3 \
  libappindicator-gtk3 \
  librsvg \
  libvips
```

**Fedora:**

```bash
sudo dnf install \
  webkit2gtk4.0-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3 \
  librsvg2-devel
```

---

## Development Build

Runs the app with hot-reload (Rust side requires a full recompile on change):

```bash
npm run dev
# or equivalently:
npx tauri dev
```

The WebSocket relay starts automatically on port **8787**. Open `canvas.html` in a browser (or via the in-app button) to connect the mirror window.

---

## Production Build

### macOS – Universal DMG

Use the all-in-one script in `platform/macOS/`:

```bash
cd platform/macOS
bash dmg_creation.sh
```

This script:
1. Adds both Rust targets (`aarch64-apple-darwin`, `x86_64-apple-darwin`)
2. Builds ARM64 and x64 app bundles via `tauri build --bundles app`
3. Stitches them into a Universal binary with `lipo`
4. Creates a DMG using `hdiutil`

Output files land in `artifacts/`:

```
artifacts/
  universal-app/datamosh-desktop.app   ← drag-to-Applications bundle
  datamosh-desktop-universal.dmg       ← distributable disk image
```

> **Codesigning & Notarisation:** The script does not sign or notarise. To distribute outside the Mac App Store, wrap the script with `codesign --deep --force --options runtime` and `xcrun notarytool`. See [Apple's documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution).

#### Manual single-arch build

```bash
# Apple Silicon
npm run tauri -- build -- --target aarch64-apple-darwin

# Intel
npm run tauri -- build -- --target x86_64-apple-darwin
```

---

### Windows – EXE / MSI / NSIS

Run the batch script from the project root (or the `platform/windows/` folder):

```cmd
platform\windows\Build-Artifacts.cmd
```

Configurable variables at the top of the script:

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET` | `x86_64-pc-windows-msvc` | Rust target triple |
| `KEEP` | `5` | Number of timestamped artifact folders to retain |
| `CLEAN_ARTIFACTS` | `0` | Set to `1` to wipe `artifacts\` before building |
| `DEEP_NPM_CLEAN` | `0` | Set to `1` to delete `node_modules` and reinstall |

Output files land in `artifacts\<timestamp>\`:

```
artifacts\20250101-120000\
  huff-v2_0.1.0_x64.exe          ← portable binary
  huff-v2_0.1.0_x64-setup.exe    ← NSIS installer
  huff-v2_0.1.0_x64_en-US.msi    ← MSI installer
  portable-20250101-120000.zip    ← zipped portable EXE
  SHA256SUMS.txt                  ← checksums for all artifacts
```

#### Manual build

```powershell
npx tauri build --target x86_64-pc-windows-msvc
```

> **SmartScreen:** Unsigned builds will trigger a Windows SmartScreen warning. Click *More info → Run anyway*, or sign the binary with a code-signing certificate.

---

### Linux – AppImage / deb

```bash
npm run tauri build
# or
npx tauri build
```

Tauri will produce an **AppImage** and a **.deb** package under:

```
src-tauri/target/release/bundle/
  appimage/huff-v2_0.1.0_amd64.AppImage
  deb/huff-v2_0.1.0_amd64.deb
```

To run the AppImage directly:

```bash
chmod +x huff-v2_0.1.0_amd64.AppImage
./huff-v2_0.1.0_amd64.AppImage
```

> **Camera permissions on Linux:** Grant camera access through your desktop environment's privacy settings, or ensure the running user is in the `video` group (`sudo usermod -aG video $USER`).

---

## Project Structure

```
huff/
├── src/                        # Frontend (HTML + JS, no bundler)
│   ├── index.html              # Main controls window
│   ├── canvas.html             # Mirror/receiver window
│   ├── canvas.js               # p5 setup, draw loop, UI wiring, WS sender
│   ├── effects.js              # applyGlitch, applyFlowWarp, applySolarize, applySymmetry
│   ├── ws-server.js            # Standalone Node.js relay (dev/testing only)
│   ├── ws-mirror.js            # Standalone WS sender (unused; logic is inlined in canvas.js)
│   └── p5.js                   # p5.js library (bundled locally)
│
├── src-tauri/
│   ├── src/
│   │   └── main.rs             # Rust entry point + embedded WS relay
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # App config: windows, bundle, identifiers
│   ├── entitlements.plist      # macOS entitlements (camera, network)
│   ├── Info.plist              # macOS Info.plist overrides
│   ├── capabilities/
│   │   ├── network.json        # Tauri capability: WebSocket access
│   │   └── recording-save.json # Tauri capability: file save
│   └── icons/                  # App icons for all platforms
│
├── platform/
│   ├── macOS/
│   │   └── dmg_creation.sh     # Universal binary + DMG build script
│   └── windows/
│       └── Build-Artifacts.cmd # Windows build + artifact collection script
│
├── scripts/
│   ├── create_mac_builds.sh    # Build both macOS arch targets
│   ├── create_universal.sh     # lipo universal binary
│   ├── create_universal_dmg.sh # Package DMG
│   └── remove_artifacts.sh     # Clean artifacts directory
│
├── package.json
└── README.md
```

---

## Effect Controls Reference

| Control | Description |
|---------|-------------|
| **SYSTEM** | Master on/off for the glitch engine |
| **BASE VIDEO** | Show the raw source video underneath the effect |
| **BASE MIX** | Opacity of the base video layer (0–1) |
| **BASE BG** | Background colour when no tile covers a pixel (Black / Green / Blue / White) |
| **FEEDBACK** | How much of the previous frame feeds back into the next (0–3) |
| **PERSISTENCE** | How quickly the buffer decays between frames (0–10) |
| **SYMM / MODE / SYM POS** | Mirror the buffer vertically, horizontally, or both, around a moveable axis |
| **DEPTH** | How far back in the frame ring tiles are sampled |
| **DEPTH SCATTER** | Randomness of per-tile temporal offset (0 = all tiles same frame, 1 = full scatter) |
| **CORRUPT %** | Fraction of grid tiles displaced per frame |
| **CORRUPT DRIFT** | Noise-driven breathing of the corruption density |
| **PIXEL SIZE** | Block/tile size in pixels |
| **GLITCH SPEED / FINE SPEED** | Noise phase velocity (coarse × fine = overall density) |
| **GLITCH SIZE** | Spatial size of each displaced tile |
| **SMEAR** | Number of duplicate stamps trailed behind each tile |
| **SMEAR ANGLE** | Direction of smear trail (0 = noise-driven) |
| **TRAIL LAYERS / TRAIL DEPTH** | Ghost frames stacked behind each tile for motion-smear |
| **GLITCH MULT** | Global speed multiplier |
| **GLITCH X / Y** | Base offset applied to all tile destinations |
| **TILE OPACITY** | Alpha of each blit tile |
| **JITTER** | Magnitude of per-tile position noise |
| **SEED** | Random seed (deterministic output for the same seed + frame) |
| **FB X / Y / Z / θ** | Feedback translation, zoom, and rotation per frame |
| **SCANLINES** | Enable drifting horizontal band displacement |
| **BANDS / BAND HEIGHT / SHIFT / DRIFT / SCAN OPACITY** | Scanline band parameters |
| **CLUSTER TILES** | Place tiles in radial clusters rather than uniform scatter |
| **CENTERS / SPREAD / SPATIAL GAP** | Cluster geometry |
| **SOLARIZE** | Luminance-threshold colour inversion |
| **THRESH / AMOUNT / SOL R/G/B** | Solarise parameters |
| **FLOW** | Enable noise-field optical-flow warp |
| **STRENGTH / SCALE / QUALITY / PULSE / IMPLODE** | Flow warp parameters |
| **Seed on load** | Seed the buffer with the first video frame on file load |

---

## WebSocket Relay

The relay runs embedded in the Tauri process on `ws://127.0.0.1:8787` (IPv4) and `ws://[::1]:8787` (IPv6).

**Handshake:**
```json
{ "type": "hello", "role": "index" }   // sender
{ "type": "hello", "role": "canvas" }  // receiver
```

**Routing rules:**
- Text messages → broadcast to all other connected clients
- Binary messages (JPEG frames) → forwarded only to clients with `role == "canvas"`

A standalone Node.js relay (`src/ws-server.js`) is included for testing outside of Tauri:

```bash
node src/ws-server.js
```

---

## Performance Notes

- **Frame ring** stores `ImageData` objects rather than p5 `Graphics` instances. This avoids the `Graphics.get()` copy-on-read overhead and keeps GPU memory pressure low.
- **Ring buffer drawRingRegion** uses a single reused offscreen `<canvas>` with `putImageData` + native `drawImage` cropping — no per-tile allocation.
- **WS sender** uses a single reused offscreen canvas for JPEG encoding; it only resizes the canvas when the output dimensions change.
- **Label updates** fire on `input` events only — not during the draw loop.
- **p5 Graphics** buffers are disposed (`remove()`) before reallocation on window resize.
- Tune the **QUALITY** slider to reduce the frame-ring depth and skip flow-warp frames (`everyN`), trading temporal richness for frame rate on slower machines.
- The 256 MB ring-buffer memory cap is enforced regardless of the quality setting.

---

## Troubleshooting

**Blank canvas on Windows:**
Install [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

**Camera not appearing (macOS):**
The app must be codesigned with the `NSCameraUsageDescription` entitlement for the permission dialog to appear. In dev mode (`tauri dev`) the entitlement is injected automatically. For distribution builds, sign with `--entitlements src-tauri/entitlements.plist`.

**`WS: disconnected` in the status pill:**
The relay starts in the Tauri process; if you open `index.html` directly in a browser (outside Tauri) you need to run `node src/ws-server.js` separately.

**Port 8787 already in use:**
Change `const PORT: u16 = 8787;` in `src-tauri/src/main.rs` and update the `__getWSURL__` call in `src/index.html` to match.

**High memory usage:**
Lower the **QUALITY** slider or reduce **DEPTH** to shrink the frame ring. The ring is capped at 256 MB but can still grow large at high resolutions.

**SmartScreen warning (Windows):**
Expected for unsigned binaries. Click *More info → Run anyway*, or codesign the executable.

**`tauri build` fails on Linux with missing library:**
Re-run the dependency install commands for your distro in the [Linux extra](#linux-extra) section.
