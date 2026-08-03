# HUFF Classic Optimization Pass 7

**Date:** 2026-08-03  
**Scope:** Glitch tile-placement allocation and spatial-index reuse  
**Baseline:** HUFF Classic Optimization Pass 6  
**Feature policy:** No new features, effects, controls, routing changes, or native-renderer migration

## Purpose

Pass 7 reduces garbage-collection pressure inside `applyGlitch()`. The previous implementation rebuilt several temporary JavaScript structures every rendered frame:

- a `targets` array;
- one `[x, y]` array for every accepted tile;
- a `Map` for spatial-gap enforcement;
- one array for every occupied spatial cell;
- one `[x, y]` array inside each occupied cell;
- cluster-offset objects whenever coherence allowed a tile to reroll.

Those allocations were short-lived and repeated at render frequency. Pass 7 replaces them with reusable typed buffers while preserving the existing seeded-random call order, target insertion order, gap test, cluster motion, coherence behavior, and tile blit sequence.

## Exact code changes

### `src/effects.js`

- Added `GlitchPlacementWorkspace`, a reusable placement workspace containing:
  - `Int32Array` target X coordinates;
  - `Int32Array` target Y coordinates;
  - `Int32Array` linked-list indices;
  - a reusable `Int32Array` cell-head table.
- Replaced the per-frame `targets` array and `Map`-of-arrays spatial index.
- Kept the same 3×3 neighboring-cell distance test and strict `< gap²` rejection rule.
- Added geometric capacity growth. Buffers grow only when a larger render size or target count requires it; ordinary frames reuse existing storage.
- Replaced destructuring of `[x, y]` target pairs with direct typed-buffer access.
- Replaced persistent cluster offset objects with reusable `Float64Array` angle and normalized-radius buffers.
- Preserved double-precision offset values and the prior short-circuit random-call sequence for new, retained, rerolled, shrunk, and regrown cluster constellations.
- Preserved the existing cluster physics array, seeded p5 random source, temporal frame selection, and Canvas2D draw calls.

### `README.md`

- Added the Pass 7 optimization summary.

### Root documentation suite

- Updated cumulative changelog, testing checklist, current status, documentation index, and Git commit message.

## Static allocation reduction

The active glitch placement path changes from:

```text
Per render frame:
- 1 new targets Array
- 1 new Map when Spatial Gap > 0
- up to 1 new target pair Array per accepted tile
- up to 1 new cell Array per occupied cell
- up to 1 additional coordinate pair Array per accepted spatial-index entry
- up to 1 new cluster-offset object per rerolled clustered tile
```

To:

```text
Normal render frames:
- reusable Int32 target buffers
- reusable linked-cell Int32 spatial index
- reusable Float64 cluster-offset buffers
- no target-pair, cell-array, Map, or rerolled-offset object creation
```

Typed arrays may allocate when capacity must grow. That is intentionally infrequent and replaces continuous frame-by-frame allocation.

## Behavioral-equivalence validation

A deterministic Node test compared the old Map/array spatial-gap algorithm with the new typed-buffer algorithm across:

- multiple canvas dimensions;
- gap values from zero through values larger than the canvas;
- 50 candidate runs per dimension/gap combination;
- 1,000 candidate coordinates per run.

The accepted coordinate sequences matched exactly.

A second deterministic test compared the previous object-based cluster-offset state with the new Float64-buffer state across:

- initial creation;
- full reroll;
- partial coherence;
- shrink and regrow operations;
- fixed constellations;
- repeated rerolls.

Random-call order and stored angle/radius values matched exactly.

These tests validate the bookkeeping algorithms, not complete visual parity on a target WebView.

## Behavioral invariants

Pass 7 is intended to preserve:

- all control names, ranges, defaults, and labels;
- glitch tile count and candidate-attempt limits;
- Spatial Gap acceptance behavior;
- cluster center physics, speed, steering, inertia, pulse, bounce/wrap, and breathe behavior;
- cluster coherence randomization semantics;
- seeded random ordering used by glitch placement;
- tile history selection and draw order;
- feedback, flow, symmetry, Solarize, luma key, and Global Mix behavior;
- Pass 4–6 Syphon transport and mandatory framework packaging;
- Spout and Linux code paths.

## Files changed relative to Pass 6

- `src/effects.js`
- `README.md`
- root documentation suite
- `HUFF_CLASSIC_OPTIMIZATION_PASS_7.txt`

No Rust, Tauri configuration, native Syphon bridge, bundled framework, Spout bridge, UI layout, preset, MIDI, OSC, or build-script code was changed.
