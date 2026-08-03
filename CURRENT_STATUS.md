# HUFF Classic Current Status

**Current package:** HUFF Classic Optimization Pass 10  
**Date:** 2026-08-03  
**Authoritative lineage:** user-supplied `huff-08022026.zip` → Pass 4 → Pass 5 → Pass 6 → Pass 7 → Pass 8 → Pass 9 → Pass 10

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

## Current render topology

```text
video/camera → gCur
                 ↓
              gBuf ↔ gScratch
                 ↓
          main output canvas
                 ├─ JPEG mirror, only with canvas receiver
                 ├─ Syphon, only with Syphon receiver
                 └─ Spout when enabled on Windows
```

Scanlines read `gCur` and paint bands directly into `gBuf`; they do not allocate another full-resolution surface.

## Pass 10 result

The Scanline engine now retains:

- typed band rectangle storage;
- per-band noise seed constants;
- angle/trigonometric coverage geometry;
- prepared bands for identical static states;
- explicit cache invalidation when the p5 noise seed changes.

Animated Scanline math still runs when SPEED, SPIN, phases, or controls change. One Canvas2D `drawImage()` remains required per accepted visible band.

## Current high-cost areas

### Canvas2D tile/band draws

Glitch, Scanlines, Flow, smear, and temporal sampling can still issue many `drawImage()` operations. Static setup work has been reduced, but the visual model itself remains draw-call-heavy.

### Neutral paths

Some effects and composite stages may still touch full-resolution surfaces when their effective output is visually neutral. Pass 11 will audit these cases.

### CPU pixel processing

Solarize and Pipeline Luma Key still use downsampled synchronous readback. Caching reduces frequency but does not remove the CPU boundary.

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

### Pass 11 — No-op and dirty-state elimination

Audit and bypass stages whose current settings cannot visibly change the frame:

- zero-strength Flow;
- invisible Scanlines;
- inactive or zero-contribution Global Mix;
- neutral base mix;
- zero-effect Feedback states;
- inactive Solarize and Luma paths;
- redundant background/presentation operations;
- inaccurate `anyFxActive` conditions.

Every shortcut must preserve state progression and become active again immediately when controls change.

### Later mandatory work

- Move renderer ownership into the canvas window.
- Decode-paced rendering and source lifecycle hardening.
- Real FrameRing memory measurements and release-safe defaults.
- Solarize/Luma Worker or WebGL micro-pass comparison.
- Full Canvas2D draw-call/context-state profiling.
- Shared final-frame output capture across mirror/Syphon/Spout where compatible.
- macOS, Windows, and Linux stabilization.
- Development profiling harness and capability matrix.
- Soak testing, release freeze, signing, packaging, and public documentation.

## Release blockers

- Runtime visual parity for Passes 5–10.
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
- Do not eliminate an effect update merely because its current pixels are invisible if its internal state must continue progressing.
- `gBuf` and `gScratch` remain distinct.
- Any stage writing `gScratch` must clear or fully replace it before swapping.
- Cache invalidation keys must include every input affecting the cached result.
- `Syphon.framework` remains mandatory in the user-confirmed working layout.
- Every ZIP includes the complete documentation suite and a ready-to-use commit message.
