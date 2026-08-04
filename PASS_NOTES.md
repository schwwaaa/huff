# HUFF Classic Optimization Pass 18 — Glitch Blit Hot Path

**Date:** 2026-08-04  
**Baseline:** committed Pass 17  
**Scope:** Canvas2D Glitch tile and smear dispatch only

## Goal

Reduce JavaScript work surrounding HUFF Classic's unavoidable Canvas2D Glitch `drawImage()` calls without changing:

- tile placement;
- cluster physics;
- seeded random and noise order;
- temporal-frame selection;
- source and destination rectangles;
- smear geometry;
- alpha, paint order, or compositing;
- video decoding, frame scheduling, Syphon, Spout, or mirror behavior.

## Runtime changes

### 1. Direct Canvas2D blits

The Glitch hot loop previously called a helper for every base tile and every smear copy. That helper repeatedly resolved `gBuf.drawingContext` before calling `drawImage()`.

Pass 18 removes the helper and calls the already-cached Canvas2D context directly:

```text
previous
per draw → helper call → target.drawingContext lookup → drawImage

Pass 18
per draw → cached ctx.drawImage
```

The `drawImage()` arguments and ordering are unchanged.

### 2. Versioned temporal-ring source cache

Every Glitch tile previously called `frameRing.fromEnd(idx)` independently. Pass 18 adds a mutation version to `FrameRing` and resolves the required temporal source slots once per ring generation and DEPTH-derived `maxBack` value.

The cache invalidates after:

- every successful decoded-frame capture;
- temporal-ring resize;
- temporal-ring clear or disposal;
- a change in the requested maximum history depth.

Repeated renderer frames sharing the same decoded frame reuse the source-reference table.

### 3. Reusable smear-offset workspace

The previous smear loop recalculated and rounded X/Y offsets for every tile and every smear step:

```text
2 × tile count × smear length round operations per Glitch frame
```

Pass 18 calculates each smear step once using the exact original multiplication order:

```text
2 × smear length round operations per Glitch frame
```

The rounded values are stored in reusable `Int32Array` buffers that grow only when a larger SMEAR value is requested.

### 4. Constant tile-span calculation

`block × (size / 20)` is now calculated once per Glitch invocation rather than once for width and once for height on every tile.

### 5. Profiler-only draw-call telemetry

Following Junkpile's explicit draw-call diagnostics, the existing backtick profiler now reports:

```text
gl tiles    average accepted Glitch tiles per active frame
gl draws    average Canvas2D Glitch drawImage calls per active frame
gl ring     temporal source-cache rebuild/reuse count
```

Telemetry accumulation is skipped while the profiler is hidden.

## Important limitation

Pass 18 does **not** reduce the artistic tile or smear count. The actual Canvas2D `drawImage()` operations remain the same so visual output and paint order remain intact.

This pass reduces the JavaScript overhead around those calls and exposes the actual call pressure. The profiler readings establish whether further Classic optimization is possible without changing the effect or migrating Glitch to a GPU implementation.

## Junkpile influence

The implementation follows proven patterns from the supplied Junkpile examples:

- persistent ping-pong and feedback resources rather than per-frame construction;
- resize and rebuild only when dimensions or resource generations change;
- explicit draw-call accounting in the multipass compositor;
- persistent typed or GPU resource ownership around the inner render loop.

No WebGL, wgpu, shader, or renderer migration was imported into HUFF Classic.

## Files changed

- `src/effects.js`
- `src/canvas.js`
- `scripts/validate-pass18.mjs`
- `package.json`
- optimization documentation in the project root

## Explicitly unchanged

- File → Blob URL → p5 `createVideo()` decoder path
- independent p5, transport, mirror, and profiler clocks
- Glitch placement and cluster algorithms
- Flow, Scanlines, Feedback, Symmetry, Solarize, and Luma Key
- temporal capture rate and history capacity
- Canvas mirror transport
- Pass 16S Syphon bootstrap behavior
- native Syphon and Spout implementations
- entire `src-tauri` tree
- bundled `Syphon.framework`
