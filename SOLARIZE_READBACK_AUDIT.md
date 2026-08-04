# HUFF Classic Pass 16 — Solarize Readback Audit

## Scope

This audit covers only the HUFF Classic Solarize stage in `src/effects.js` and the profiler display in `src/canvas.js`.

It does not cover Pipeline Luma Key, Syphon, Spout, the JPEG mirror, or the native-wgpu HUFF engine.

## Why Solarize is different from most Classic effects

Most HUFF Classic effects remain inside Canvas2D draw operations. Solarize instead needs to inspect and modify individual pixels according to luminance:

```text
luma = 0.299R + 0.587G + 0.114B
```

Pixels above the threshold receive the cached channel transformation. This requires CPU-visible pixel data in the current architecture.

## Existing protection retained

HUFF does not read the full output resolution for Solarize unless the output is already 640 pixels wide or smaller.

```text
output width > 640
  → downscale proportionally to 640px width
  → perform CPU pixel work at the reduced size
  → scale the processed result back to output size
```

Approximate processed pixel counts:

| Output | Solarize scratch | Pixels processed |
|---|---:|---:|
| 1280 × 720 | 640 × 360 | 230,400 |
| 1920 × 1080 | 640 × 360 | 230,400 |
| 2560 × 1440 | 640 × 360 | 230,400 |
| 3840 × 2160 | 640 × 360 | 230,400 |

The CPU transform cost therefore remains bounded by the scratch resolution rather than the output resolution. Output resolution still affects the source downscale and final presentation.

## Previous cost centers

### Readback

```text
copy active buffer into scratch
getImageData from scratch
```

`getImageData()` is synchronous and may wait for prior Canvas2D operations.

### Transform

The previous loop accessed four byte-array positions for every pixel and performed up to three separate channel writes.

### Upload

```text
putImageData into scratch
```

### Full-resolution cache construction

```text
scale scratch into _solOut
```

### Full-resolution presentation

```text
copy _solOut into gBuf
```

## Pass 16 reductions

### Persistent surfaces

```text
Before: 640px scratch + full-resolution Solarize output cache
After:  640px scratch only
```

### Processed-frame presentation

```text
Before: scratch → full-size cache → gBuf
After:  scratch → gBuf
```

### Pixel loop

```text
Before: Uint8ClampedArray byte loop
After:  Uint32Array packed loop on little-endian targets
Fallback: original byte loop
```

### Channel maps

```text
Before: byte maps + per-pixel shifts
After:  byte maps + pre-shifted packed maps
```

### Cache-key allocation

```text
Before: construct one string on each processed frame
After:  compare four retained numeric values
```

## Exactness boundary

The packed path preserves:

- original RGB extraction;
- original Float64 luma contribution tables;
- original addition order;
- strict threshold comparison;
- original Uint8Clamped channel-map values;
- original alpha byte.

The validator compared the packed and previous algorithms byte-for-byte across more than eight million pixels.

## Presentation parity boundary

The removed full-resolution cache previously performed:

```text
scaled draw into _solOut
exact-size copy into gBuf
```

An exact-size copy cannot add another resampling step. Pass 16 therefore performs the scaled draw directly into `gBuf` using the same default scaling state:

- `imageSmoothingEnabled = true`;
- `imageSmoothingQuality = low`;
- `globalCompositeOperation = copy`;
- `globalAlpha = 1`.

WKWebView runtime comparison is still required because Canvas2D implementations can have platform-specific details.

## Profiler interpretation

With Solarize active, open the profiler using the backtick key.

### `sol read`

Includes the source-to-scratch draw and synchronous `getImageData()` call.

A high value indicates the readback/synchronization boundary dominates.

### `sol xform`

Measures the JavaScript pixel loop only.

A lower Pass 16 value compared with Pass 15 indicates the packed path is beneficial on that JavaScript engine.

### `sol upload`

Measures `putImageData()` into the scratch canvas.

### `sol present`

Measures the scaled scratch-to-`gBuf` copy.

### `sol cache`

Reports:

```text
processed frames / reused frames
```

A nonzero reuse count means the existing adaptive guard is active because sustained frame time crossed its threshold.

## Acceptance criteria

Pass 16 should be retained only when:

- Solarize appearance matches Pass 15;
- clean playback without Solarize matches Pass 15;
- Solarize FPS and frame pacing are equal or better;
- audio remains stable;
- resize/fullscreen operations do not produce stale cached output;
- memory does not retain a removed full-resolution Solarize surface;
- Syphon, Spout, and mirror output remain unchanged.

## Rejection criteria

Reject or revise Pass 16 if:

- Solarize sharpness or threshold boundaries differ visibly;
- `sol xform` is consistently slower on the target WKWebView;
- `sol present` offsets the removed-copy benefit and total `applySolarize` time increases;
- adaptive reuse flickers or shows stale dimensions after resize;
- video/audio stability is worse than Pass 15.
