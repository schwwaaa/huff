# HUFF Classic Optimization Pass 8

**Date:** 2026-08-03  
**Scope:** Canvas2D surface topology, buffer reuse, resize allocation, and final-composite overhead  
**Baseline:** HUFF Classic Optimization Pass 7  
**Feature policy:** No new effects, controls, routes, output protocols, or native-renderer migration

## Purpose

Pass 8 begins the deeper canvas-and-buffer optimization phase requested for HUFF Classic. The goal is to reduce full-resolution surface count, avoid temporary resize peaks, and remove p5 wrapper overhead from large full-frame operations while preserving the existing Classic render order and visual formulas.

The most important architectural change is that Feedback, Flow Warp, and Symmetry now share one full-resolution ping-pong surface. These stages are sequential and each completely overwrites its destination before references swap, so separate Flow and Symmetry targets were not necessary.

## Exact code changes

### `src/canvas.js`

- Reduced full-resolution p5 Graphics surfaces from four to three:
  - `gCur` — clean decoded/camera frame;
  - `gBuf` — active persistent/effect composite;
  - `gScratch` — shared ping-pong target.
- Removed the separate `gWarp` and `gTemp` surface roles.
- Removed the separate full-resolution feedback snapshot canvas.
- Feedback now copies `gBuf` into `gScratch`, transforms that snapshot back into `gBuf`, and leaves `gScratch` available for later Flow/Symmetry reuse.
- Flow Warp now writes to `gScratch` and swaps `gBuf`/`gScratch`.
- Symmetry now writes to the same `gScratch` and swaps the same references.
- Added in-place p5 Graphics resize reuse through `resizeCanvas()` rather than constructing four replacement Graphics objects and then deleting the old set.
- Retained a one-buffer-at-a-time replacement fallback if a WebView/p5 implementation rejects in-place resize.
- Moved `pixelDensity(1)` before main-canvas creation so Retina systems do not first allocate a device-pixel-ratio backing store and immediately resize it.
- Configured each p5 Graphics density once rather than potentially re-running `pixelDensity()` after every resize.
- Replaced full-frame p5 `clear()`/`image()` copies used by source seeding and no-effect synchronization with native Canvas2D copy compositing.
- Replaced the main output background, base mix, and final buffer presentation with direct Canvas2D operations on a cached context.
- Kept the prior p5 presentation path as a compatibility fallback if the native main context cannot be acquired.
- Cached the mirror render canvas after first resolution.
- Cached mirror JPEG quality and frame period on QUALITY control events instead of parsing the DOM and recalculating them on every animation-frame pump.

### `src/effects.js`

- Replaced Flow Warp's p5 `dst.clear()` call with one explicit native Canvas2D clear under a known identity transform and composite state.
- Preserved the blank-output behavior if a Flow source is unexpectedly unavailable.
- Reimplemented Symmetry's full copy, clipping, translation, scaling, and mirrored draws directly through Canvas2D rather than p5 `push()`, `pop()`, `translate()`, `scale()`, and `image()` wrappers.
- Reused Solarize canvases and contexts across render-size changes by resizing their backing stores in place.
- Reused Pipeline Luma Key canvases and contexts across render-size changes by resizing their backing stores in place.
- Preserved the existing Solarize adaptive-load guard, cached result, channel maps, and luma formulas.
- Preserved the existing decoded-frame-aware Pipeline Luma Key cache.

### Documentation

- Updated both documentation trees to describe:
  - the event-driven typed render-state cache;
  - canvas-backed temporal history;
  - the new `gCur` / `gBuf` / `gScratch` topology;
  - the shared ping-pong behavior.
- Updated the interface documentation so CLR BUF no longer references removed `gWarp`/`gTemp` names.
- Added the Pass 8 summary to `README.md`.
- Added `CANVAS_BUFFER_AUDIT.md` for current surface ownership and remaining headroom.

## Full-resolution surface reduction

Pass 7 retained these p5/scratch surfaces at render resolution:

```text
main output canvas
gCur
gBuf
gWarp
gTemp
feedback snapshot canvas (only after Feedback is used)
```

Pass 8 uses:

```text
main output canvas
gCur
gBuf
gScratch
```

Solarize, luma key, temporal history, mirror encoding, and Syphon have their own specialized/on-demand surfaces and are documented separately in `CANVAS_BUFFER_AUDIT.md`.

## Approximate raw backing-store reduction

One RGBA surface requires `width × height × 4` bytes before browser-internal overhead.

| Render size | Always saved | Additional saved while Feedback is active | Total Feedback-active reduction |
|---|---:|---:|---:|
| 1280×720 | 3.52 MiB | 3.52 MiB | 7.03 MiB |
| 1920×1080 | 7.91 MiB | 7.91 MiB | 15.82 MiB |
| 2560×1440 | 14.06 MiB | 14.06 MiB | 28.13 MiB |
| 3840×2160 | 31.64 MiB | 31.64 MiB | 63.28 MiB |

Actual process-memory reduction may be larger or smaller because WebKit, Chromium/WebView2, and Canvas2D implementations can retain staging textures, tiled backing stores, and recycled allocations.

## Resize behavior improvement

The prior allocator built four new full-resolution p5 Graphics objects before removing the old four. At 1080p, raw RGBA storage for those eight temporary Graphics backing stores alone could approach 63 MiB, excluding the main canvas, history ring, browser staging, and other scratch surfaces.

Pass 8 resizes the three retained p5 Graphics objects in place. It also resizes Solarize and luma-key scratch canvases rather than replacing their JavaScript canvas/context objects.

## Behavioral invariants

Pass 8 is intended to preserve:

- all controls, defaults, labels, ranges, and preset values;
- the fixed HUFF Classic effect order;
- glitch/scanline layer-priority behavior;
- Feedback translation, rotation, scale, alpha, and persistence behavior;
- Flow Warp formulas, history pulse selection, tile traversal, and quantization;
- Symmetry modes and position behavior;
- Solarize and Pipeline Luma Key pixel formulas;
- base-video mix and background modes;
- temporal frame-ring behavior;
- MIDI, OSC, preset, reset, and undo synchronization;
- mirror framing and maximum 30 fps operator-preview cap;
- Pass 4–7 Syphon backpressure, receiver awareness, worker path, Metal texture reuse, and mandatory framework packaging;
- Spout and Linux code paths.

## Static equivalence validation

A symbolic pipeline test exercised 800 sequential frame/stage combinations across Feedback, Flow Warp, and Symmetry. The former three-target state machine and the new single-scratch ping-pong state machine produced the same final symbolic output for every combination, and the active/scratch references never aliased.

This proves the sequential buffer-ownership logic under the assumption that Flow and Symmetry completely overwrite their destinations. The code explicitly clears/copies those destinations before use.

## Files changed relative to Pass 7

- `src/canvas.js`
- `src/effects.js`
- `README.md`
- `docs/docs/architecture.html`
- `docs/docs/how-it-works.html`
- `docs/docs/interface.html`
- `docs-v1/docs/architecture.html`
- `docs-v1/docs/how-it-works.html`
- `docs-v1/docs/interface.html`
- root documentation suite
- `CANVAS_BUFFER_AUDIT.md`
- `HUFF_CLASSIC_OPTIMIZATION_PASS_8.txt`

No Rust, Tauri configuration, native Syphon bridge, bundled Syphon framework, Spout bridge, MIDI maps, OSC maps, presets, or build scripts were changed.

## Runtime validation still required

- Visual parity for Feedback alone and with Flow/Symmetry.
- Visual parity for vertical, horizontal, and combined symmetry.
- Rapid resize/fullscreen cycles and memory settling.
- Mirror output framing and QUALITY response.
- Syphon endurance with Feedback + Flow + Symmetry combinations.
- Windows WebView2 and Linux WebKitGTK behavior.
