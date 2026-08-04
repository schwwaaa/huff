# HUFF Classic Optimization Pass 17

**Date:** 2026-08-03  
**Status:** implementation and deterministic validation complete; target-runtime Luma Key comparison pending  
**Baseline:** committed HUFF Classic Optimization Pass 16S  
**Scope:** isolate and reduce Pipeline Luma Key Canvas2D work without changing the stable decoder, frame clocks, effect order, Syphon repair, Spout, or native packaging.

## Goal

Pass 17 optimizes the Pipeline Luma Key stage that restores clean-source pixels over the active glitch buffer. The stage remains bounded to a 640-pixel-wide scratch and remains cached by decoded-frame serial, threshold, inversion, and dimensions.

## Previous path

```text
clean source
→ bounded readback canvas
→ getImageData
→ generate white alpha mask
→ putImageData mask
→ second bounded canvas receives another clean-source copy
→ destination-in applies mask to second canvas
→ masked clean patch composites over gBuf
```

## Pass 17 path

```text
clean source
→ one bounded readback/patch canvas
→ getImageData
→ replace only each clean pixel's alpha byte
→ putImageData completed clean patch
→ cached clean patch composites over gBuf
```

## Changes

- Removed the second Pipeline Luma Key scratch canvas and context.
- Removed the second clean-source copy performed during each mask rebuild.
- Removed the separate `destination-in` Canvas2D composition pass.
- Preserved the clean source RGB and changed only its alpha byte.
- Added a packed little-endian `Uint32Array` path that processes one RGBA pixel per loop iteration.
- Retained a byte-oriented fallback for non-little-endian targets.
- Preserved the exact original floating-point operation order for inverted keys; the validator caught that algebraic simplification could otherwise change a boundary alpha byte by one.
- Preserved source alpha multiplication for any partially transparent input while retaining the fast opaque-video path.
- Added an exact-size presentation path when the bounded patch already matches the render dimensions.
- Added profiler-only Luma Key phase telemetry.

## Profiler rows

Open the backtick profiler while Pipeline Luma Key is active:

```text
luma read    clean-source copy + synchronous getImageData
luma xform   alpha-mask calculation and packed pixel transform
luma upload  putImageData of the completed clean patch
luma pres    cached patch presentation into gBuf
luma cache   rebuilt/reused frames during the report interval
```

## Preserved behavior

- Luma threshold formula and 64-level rolloff
- Invert behavior and original floating-point operation order
- Luma mix behavior
- Decoded-frame cache invalidation
- Effect position between Glitch and Scanlines
- Glitch trails and feedback beneath the clean patch
- 640-pixel maximum scratch width
- File → Blob URL → p5 `createVideo()` media path
- Independent p5, transport, mirror, and profiler clocks
- Pass 16S Syphon bootstrap repair
- Spout and all native packaging

## Runtime files changed

- `src/effects.js`
- `src/canvas.js` — profiler display only
- `package.json`
- `package-lock.json`
- `scripts/validate-pass17.mjs`

## Runtime acceptance priority

Compare Pass 17 directly against committed Pass 16S with:

1. Luma Key enabled alone.
2. Glitch + Luma Key.
3. Glitch + Luma Key + Scanlines.
4. Threshold swept through the full range.
5. Invert toggled repeatedly.
6. Mix swept from zero to full.
7. Syphon connected in OBS while the key is active.
8. Solarize and Luma Key active together.

Pass 17 should be retained only if playback remains at least as stable as Pass 16S and the key boundary remains visually identical.
