# HUFF Classic Pass 20 — Hot-Path Math and Remaining Canvas2D Ceiling Audit

## Why p5 `map()` mattered here

The bundled p5 implementation evaluates `map()` as:

```javascript
(n - start1) / (stop1 - start1) * (stop2 - start2) + start2
```

Before that arithmetic, p5 calls its parameter-validation machinery. That cost is reasonable for ordinary sketch code, but it is unnecessary inside HUFF's per-band and per-tile render loops where all ranges and value types are already controlled.

## Removed active-path calls

| Path | Previous call frequency | Pass 20 replacement |
|---|---:|---|
| Persistence decay | once per active persistent frame | direct arithmetic |
| Scanline shift | up to once per prepared band | precomputed range span + direct arithmetic |
| Glitch smear X/Y | two calls per active frame at zero angle | direct unit-range conversion |
| Glitch angle jitter | one call per active frame | direct bounded-angle conversion |
| Glitch tile jitter | two calls per accepted tile | precomputed range + direct arithmetic |

A 250-tile Glitch frame previously invoked p5 `map()` roughly 500 times for tile jitter alone.

## Exactness boundary

Pass 20 does not use algebraic approximations that alter operation order. The replacement for every unit-range mapping follows:

```javascript
noiseValue * (maximum - minimum) + minimum
```

This is the same p5 operation sequence after the exact `(noiseValue - 0) / (1 - 0)` terms are removed.

The validator compared:

- persistence values inside and outside the normal UI range;
- positive and negative Scanline shift ranges;
- Glitch smear unit conversion;
- Glitch angle jitter;
- Glitch block sizes from 1 through 512;
- 500,000 deterministic noise-like values;
- 2,500,000 exact old/new results total.

All comparisons passed with `Object.is()`.

## Remaining Canvas2D ceiling

After Pass 20, the largest remaining costs are expected to be actual image operations rather than framework numeric helpers:

### Glitch

- one base `drawImage()` per accepted tile;
- additional `drawImage()` calls per smear copy;
- two noise samples per tile for jitter;
- cluster-placement and collision work when enabled.

### Scanlines

- one `drawImage()` per prepared visible band;
- noise calculation for moving bands;
- one transform stack around the pass.

### Flow

- one `drawImage()` per tile;
- one or two p5 noise samples per tile;
- trigonometric displacement per tile;
- optional implode and swirl math.

### CPU pixel paths

- synchronous `getImageData()` for Solarize;
- synchronous `getImageData()` for Pipeline Luma Key.

### Outputs

- JPEG mirror bitmap capture and encode;
- Syphon ImageBitmap capture, Worker draw/readback, RGBA transport, Metal upload, and publish;
- Spout CPU readback and upload on Windows.

## New evidence available in the profiler

The profiler already reports effect duration and Glitch draw counts. Pass 20 completes the draw-count side for Scanlines and Flow:

```text
applyGlitch    ms/frame   + gl draws
applyScanlines ms/frame   + scan draws
applyFlowWarp  ms/frame   + flow draws
```

This allows direct calculation of rough time per artistic draw and identifies whether the dominant cost is JavaScript preparation or Canvas2D dispatch.

## Acceptance rule for later passes

A later optimization should not reduce draw counts by changing the image. It may land only when it:

1. preserves exact source/destination rectangles and paint order;
2. preserves random and noise call order where those affect the instrument;
3. preserves current decoder and frame-clock ownership;
4. has an immediate rollback boundary;
5. improves target-runtime measurements or solves a demonstrated stability problem.
