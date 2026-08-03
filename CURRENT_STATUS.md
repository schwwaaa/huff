# HUFF Classic Current Status

**Current package:** HUFF Classic Optimization Pass 11  
**Date:** 2026-08-03  
**Authoritative lineage:** user-supplied `huff-08022026.zip` → Pass 4 → Pass 5 → Pass 6 → Pass 7 → Pass 8 → Pass 9 → Pass 10 → Pass 11

## Product definition

HUFF Classic is the free legacy edition intended for public release on macOS, Windows, and Linux. It remains:

- Tauri v1.
- HTML/CSS/JavaScript controls.
- p5.js + Canvas2D rendering.
- Existing HUFF Classic effects and fixed routing.
- Bundled Syphon on macOS and Spout on Windows.

It is not the native-wgpu HUFF edition and does not use native-HUFF milestone numbering.

## Optimization foundation now present

- Canvas-backed bounded temporal history.
- Decode-callback source capture where supported.
- Latest-frame, receiver-aware JPEG mirror transport.
- Receiver-aware, one-frame-in-flight Syphon publication.
- Mandatory Syphon framework build/package verification.
- Reusable native Metal device, queue, server, and texture ring.
- Three-surface full-resolution renderer: `gCur`, `gBuf`, `gScratch`.
- In-place canvas and scratch-surface resizing.
- Event-driven typed render state outside the DOM hot path.
- Reusable glitch placement and cluster workspaces.
- Cached Flow static geometry.
- Reusable Scanline band workspace and cached rotated geometry.
- Cached Solarize channel maps and decoded-frame-aware luma masks.
- Cached FrameRing capacity and retained overwrite contexts.
- Allocation-free effective-stage activity plan.
- True all-neutral bypass and decoded-frame-aware `gBuf` synchronization.

## Current render topology

```text
video/camera → gCur
                 ↓
        effective-stage resolver
          ├─ all neutral → direct main output
          └─ active      → gBuf ↔ gScratch
                              ↓
                       main output canvas
                         ├─ JPEG mirror, only with canvas receiver
                         ├─ Syphon, only with Syphon receiver
                         └─ Spout when enabled on Windows
```

## Pass 11 result

The renderer now bypasses exact neutral states before they acquire scratch storage or perform full-resolution work.

Recognized neutral states include:

- zero-strength Flow;
- invisible/empty Scanlines;
- zero-mix Luma and Global Mix;
- identity Feedback at full/clamped opacity;
- no-region Symmetry boundaries;
- exact-identity Solarize;
- zero Base Mix.

The all-neutral path directly presents `gCur` and updates `gBuf` only when `_vfc` reports a new decoded source frame. Glitch and Scanline phases continue advancing.

The effective-pipeline resolver also corrects Scanline-only and Luma-only accounting.

## Current high-cost areas

### Two-window JPEG mirror

The controls WebView still owns decoding and rendering, then encodes JPEG for the canvas output WebView. This is the largest remaining architectural cost in normal Classic use.

### Canvas2D tile/band draws

Glitch, Scanlines, Flow, smear, and temporal sampling can still issue many `drawImage()` operations. Setup work is cached, but the visual model remains draw-call-heavy.

### CPU pixel processing

Active Solarize and Pipeline Luma Key still use downsampled synchronous readback. Neutral states now skip it, but active states still cross the CPU boundary.

### Native output readback

Syphon and Spout remain:

```text
WebView canvas → CPU RGBA → local WebSocket → native GPU texture
```

The routes are bounded and reusable, not zero-copy.

### Resolution

- 720p remains the safest cross-platform target.
- 1080p requires measured effect-combination and hardware testing.
- 4K should not be promised as dependable for Classic.
- Native HUFF owns the high-resolution expansion path.

## Next mandatory optimization work

### Pass 12 — Canvas-window renderer ownership

Move normal decoding and Canvas2D rendering into the output/canvas WebView.

Current:

```text
controls WebView renders
→ ImageBitmap / JPEG encoding
→ Rust relay
→ JPEG decode
→ canvas output
```

Target:

```text
controls WebView sends state/actions
→ canvas WebView decodes and renders directly
→ local output presentation
```

Mandatory requirements:

- preserve the existing controls UI and fixed effect pipeline;
- keep MIDI, OSC, presets, transport, and source selection synchronized;
- move Syphon/Spout capture with the authoritative renderer;
- retain latest-state control transport;
- provide a compatibility fallback before deleting the JPEG mirror;
- prove visual parity and source/audio behavior before making it default.

### Later mandatory work

- Decode-paced rendering and source lifecycle hardening.
- Real FrameRing memory measurements and release-safe defaults.
- Solarize/Luma Worker or WebGL micro-pass comparison.
- Full Canvas2D draw-call/context-state profiling.
- Shared final-frame output capture across mirror/Syphon/Spout where compatible.
- macOS, Windows, and Linux stabilization.
- Development profiling harness and capability matrix.
- Soak testing, release freeze, signing, packaging, and public documentation.

## Release blockers

- Runtime visual parity for Passes 5–11.
- Extended Syphon packet-loss, latency, and memory results.
- Repeated source-switch and resize soak tests.
- Windows Spout verification.
- Linux playback/codec verification.
- Cross-platform packaging and shutdown testing.
- macOS Developer ID signing and notarization.
- Final version alignment and release documentation.

## Standing development rules

- HUFF Classic remains Tauri v1 + web rendering; no wgpu renderer changes.
- Do not add features during optimization unless explicitly requested.
- Preserve fixed effect order and control semantics.
- Preserve phase/state progression when a stage is neutral unless equivalence is proven.
- `gBuf` and `gScratch` remain distinct.
- Any stage writing `gScratch` must clear or fully replace it before swapping.
- Cache invalidation keys must include every input affecting the cached result.
- `Syphon.framework` remains mandatory in the user-confirmed working layout.
- Every ZIP includes the complete documentation suite and a ready-to-use commit message.
