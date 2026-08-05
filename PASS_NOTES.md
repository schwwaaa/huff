# HUFF Classic Optimization Pass 22 — Pass Notes

**Date:** 2026-08-05  
**Baseline:** runtime-confirmed Pass 21  
**Scope:** Scanline preparation and Canvas2D dispatch reduction

## Summary

Pass 22 continues directly from the working Pass 21 baseline. It does not alter HUFF Classic's media decoder, independent frame clocks, canvas-buffer topology, temporal history, effect order, mirror transport, Syphon bootstrap/control behavior, Spout, or native packaging.

The pass targets the remaining JavaScript and Canvas2D state overhead around Scanlines. The actual artistic cost—one `drawImage()` for every visible Scanline band—remains unchanged.

## Runtime changes

### 1. Scanline preparation variants selected once per pass

The previous prepared-band loop re-tested two stable conditions for every requested band:

```text
DRIFT == 0?
SHIFT == 0 and SKEW == 0?
```

Pass 22 selects one of four preparation paths before entering the band loop:

```text
neutral drift + neutral shift
neutral drift + active shift/skew
active drift + neutral shift
active drift + active shift/skew
```

This preserves the exact number and order of p5 `noise()` calls for each state while removing repeated state tests from the inner loop.

### 2. Neutral shift path avoids unnecessary offset work

When both SHIFT and SKEW are neutral, each band is known to use:

```text
source X      = 0
destination X = 0
cross length  = full rotated cross span
```

Pass 22 writes those values directly. It no longer calculates zero shift, two offset clamps, and an absolute-value subtraction for every band.

### 3. Phase and focus terms are prepared once

The following terms were identical for every band in one Scanline pass and are now calculated once:

- slow-drift phase;
- fast-jitter phase;
- shift-noise phase;
- focus bias;
- slow-drift focus scale;
- focus offset.

The original floating-point association is preserved and validated with exact comparisons.

### 4. Typed arrays are resolved once per pass

The prepared start, length, source-offset, destination-offset, and cross-length arrays are assigned to local references before drawing. The draw loop no longer repeatedly walks the workspace object for each field.

### 5. Direct horizontal dispatch

At an exact Scanline angle of `0`, the old transform sequence was:

```text
save
translate(+width/2, +height/2)
translate(-width/2, -height/2)
draw bands
restore
```

The two translations cancel exactly and rotation is skipped. Pass 22 therefore draws horizontal bands directly, preserving and restoring only `globalAlpha`.

This removes from each active exact-horizontal Scanline frame:

- one Canvas2D `save()`;
- two Canvas2D `translate()` calls;
- one Canvas2D `restore()`.

Nonzero-angle Scanlines retain the proven save/translate/rotate/translate/restore path.

### 6. Geometry constants retained in the workspace

Half-width, half-height, negative half-width, negative half-dimension, rotation-state, and direct-horizontal-state are calculated only when render dimensions or Scanline angle change.

### 7. Profiler telemetry

The backtick profiler adds:

```text
scan geom   geometry rebuild / reuse
scan prep   prepared-band rebuild / reuse
scan path   direct-horizontal / transformed frames
```

The existing band and draw counts remain.

## Structural reduction

For `N` requested bands, Pass 22 moves stable phase/focus preparation outside the loop and removes drift/shift state tests from ordinary band iterations.

In the common neutral SHIFT/SKEW state, it also removes per-band offset clamps and `Math.abs()` work.

At exact horizontal angle, the renderer avoids four Canvas2D state-stack/transform calls per active Scanline frame.

These are structural reductions, not claimed target-platform FPS measurements.

## Visual and timing behavior preserved

- Slow drift and fast jitter noise coordinates
- Noise call count and order
- Focus bias
- Roll position
- Gap snapping
- Shift and skew calculation
- Band clipping
- Source and destination rectangles
- Band draw count
- Band paint order
- Alpha and Scanline priority
- Static prepared-band caching
- Scanline phase progression
- Glitch/Scanline priority routing

## Junkpile influence

Pass 22 continues the resource discipline demonstrated by Junkpile's render examples:

- decide pipeline variants before the hot loop;
- keep stable geometry and state in persistent workspaces;
- avoid repeated general-purpose state setup;
- retain explicit telemetry for rebuild and dispatch behavior;
- do not replace a stable renderer merely to gain a theoretical optimization.

No WebGL or wgpu renderer was imported into HUFF Classic.

## Deliberately unchanged

- File → Blob URL → p5 `createVideo()` decoding
- p5 render clock
- independent transport, mirror, and profiler clocks
- Pass 13S lifecycle cleanup
- canvas buffer allocation and resize behavior
- temporal history capture and sampling
- all non-Scanline effects
- JPEG mirror transport
- Pass 16S Syphon bootstrap repair
- Pass 19 Syphon control-plane behavior
- Spout
- Rust/Tauri source
- bundled universal `Syphon.framework`

## Expected benefit

The strongest benefit should appear with:

- horizontal Scanlines;
- high band counts;
- neutral SHIFT/SKEW;
- stable Scanline controls that reuse prepared bands.

The irreducible cost remains one Canvas2D `drawImage()` per visible band.
