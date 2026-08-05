# HUFF Classic Optimization Pass 21 — Pass Notes

**Date:** 2026-08-05  
**Baseline:** runtime-confirmed Pass 20  
**Scope:** Flow Warp dynamic-field preparation cache

## Summary

Pass 21 continues from the working Pass 20 baseline. It does not change HUFF Classic's video decoder, frame clocks, Canvas2D buffer topology, effect order, temporal history, mirror transport, Syphon, Spout, or native packaging.

The pass targets CPU preparation inside `applyFlowWarp()`. Pass 9 already cached static grid geometry by render dimensions and Flow SCALE. Pass 21 extends that persistent-workspace model to terms that remain constant across ordinary frames but were still recalculated for every Flow tile:

- SPREAD-dependent primary noise coordinates;
- SPREAD-dependent turbulence noise coordinates;
- SWIRL-dependent radial sine and cosine values;
- per-tile maximum legal source X/Y positions;
- repeated workspace property resolution inside the tile loop.

The artistic Flow draw count is unchanged. Noise sampling, animated angle generation, displacement trigonometry, Float32-equivalent quantization, clipping, source rectangles, destination rectangles, temporal PULSE selection, and tile paint order remain intact.

## Runtime changes

### 1. Flow grid generations

`FlowGridWorkspace` now increments a generation counter whenever render width, render height, or Flow SCALE rebuilds the static tile grid.

Dependent caches use this generation to invalidate themselves deterministically.

### 2. Persistent frequency workspace

A new `FlowFieldWorkspace` retains four `Float64Array` fields:

```text
noise X / Y
TURBULENCE noise X / Y
```

They rebuild only when:

- the Flow grid generation changes; or
- the effective SPREAD frequency changes.

During ordinary frames with a stable SCALE and SPREAD, the per-tile loop no longer repeats the normalized-coordinate frequency multiplications.

### 3. Persistent SWIRL workspace

The workspace also retains one cosine and one sine per Flow tile.

They rebuild only when:

- the Flow grid generation changes; or
- SWIRL changes.

With nonzero, stable SWIRL, this removes two radial trigonometric calls per tile per rendered frame. The animated flow-vector cosine and sine remain because their angle changes continuously.

### 4. Cached source clipping bounds

The static grid now records:

```text
maximum source X = render width  - tile width
maximum source Y = render height - tile height
```

The clipping result is unchanged, but the two subtractions no longer occur inside every Flow tile draw.

### 5. Local typed-array references

`applyFlowWarp()` resolves grid and field arrays once per pass. The inner loop no longer repeatedly performs object-property walks for X/Y positions, tile sizes, inward vectors, noise coordinates, SWIRL values, and clipping bounds.

### 6. Profiler cache telemetry

The backtick profiler adds:

```text
flow freq    frequency-cache rebuild/reuse count
flow swirl   SWIRL-cache rebuild/reuse count
```

The existing Flow tile, draw, and grid readings remain.

## Structural reduction

For `N` Flow tiles during a stable frame:

```text
SPREAD coordinate multiplication:
  without TURBULENCE: 2 × N per frame → 0
  with TURBULENCE:    6 × N per frame → 0

SWIRL radial trigonometry when SWIRL != 0:
  2 × N calls per frame → 0

source clipping-bound subtraction:
  2 × N per frame → 0
```

The cache work moves to explicit control/geometry invalidation rather than recurring every render frame.

## Memory cost

The new retained fields use approximately 56 bytes per Flow tile:

```text
6 Float64 fields = 48 bytes
2 Int32 bounds   =  8 bytes
```

Representative raw workspace sizes:

- 1080p at SCALE 80: roughly 336 tiles, about 18.4 KiB;
- 1080p at minimum SCALE 8: roughly 32,400 tiles, about 1.73 MiB.

This is bounded, reusable memory traded for lower repeated CPU work. No full-resolution image surface was added.

## Junkpile influence

Pass 21 applies Junkpile's persistent-resource model to the Classic web renderer:

- retain typed workspaces;
- rebuild only on explicit dimension or parameter invalidation;
- keep ordinary frames allocation-free;
- expose cache behavior through diagnostics;
- preserve the instrument's visible behavior.

No WebGL or wgpu renderer was imported.

## Deliberately unchanged

- File → Blob URL → p5 `createVideo()` decoding
- p5 render clock
- independent transport, mirror, and profiler clocks
- source lifecycle from Pass 13S
- Flow noise calls and animated time coordinates
- Flow animated vector cosine/sine
- Flow PULSE history selection
- Flow tile count and `drawImage()` count
- Float32 displacement quantization
- source/destination clipping and tile paint order
- all other effects
- canvas mirror transport
- Pass 16S Syphon bootstrap repair
- Pass 19 Syphon control-plane behavior
- Spout
- Rust/Tauri source
- bundled `Syphon.framework`

## Expected benefit

The largest benefit should appear when Flow uses:

- a small SCALE, producing many tiles;
- nonzero SWIRL;
- nonzero TURBULENCE;
- stable SCALE, SPREAD, and SWIRL controls over multiple frames.

No target-platform FPS claim is made. The irreducible Flow tile draws and animated noise/trigonometry remain.
