# HUFF Classic Pass 10 — Scanline Engine Audit

## Current signal path

```text
gCur clean source
  ↓
scanline band preparation
  ↓
rotated Canvas2D coordinate system
  ↓
one drawImage() per accepted band into gBuf
```

Scanlines do not own a full-resolution buffer. They read from `gCur` and paint directly into the persistent effect surface `gBuf` according to the current Glitch/Scanline layer order.

## Before Pass 10

Every active Scanline frame recalculated:

- angle radians;
- sine and cosine;
- rotated coverage span;
- cross-axis span;
- three band-index constants per band;
- focus-distance terms;
- grid step;
- alpha state for every accepted band.

Even when SPEED was zero and every control was unchanged, the band positions were recalculated every render frame.

The old loop did not allocate arrays per frame, but it repeated invariant math and Canvas2D state assignment in the most frequently executed path.

## After Pass 10

### Persistent workspace

One `ScanlineBandWorkspace` survives for the application lifetime. Capacity grows only when a larger band count is requested.

```text
Float64: slowSeed, fastSeed, shiftSeed
Int32:   band start, source offset, destination offset
Float64: band length, drawable cross length
```

Float64 storage is required for band lengths and cross-axis lengths because rotated coverage can end on fractional coordinates. Using integer storage there would change edge sampling.

### Geometry invalidation

Rotated geometry is rebuilt only when one of these changes:

```text
render width
render height
scanline angle
```

With a static angle, trigonometric work is removed from ordinary frames. During SPIN, angle changes still force the correct rebuild.

### Full prepared-band cache

A prepared band list is reused only when every input affecting band rectangles is identical. This includes both scanline phases, so animated Scanlines never reuse stale geometry.

The strongest reuse case is:

```text
SPEED = 0
SPIN L = off
SPIN R = off
controls unchanged
```

The source image may still change every decoded frame; only the band rectangles are reused. `setSeedFromUI()` invalidates the workspace so a new p5 noise seed cannot reuse coordinates prepared under the previous seed.

### Neutral controls

```text
Effective ALPHA = 0
→ no context save/transform
→ no noise calls
→ no draw calls

DRIFT = 0
→ slow drift remains
→ zero-contribution fast jitter noise is skipped

SHIFT = 0 and SKEW = 0
→ zero displacement is used directly
→ zero-contribution shift noise is skipped
```

## Junkpile-derived design influence

The optimization follows patterns visible in the Junkpile Tauri v1 examples:

- the multipass compositor keeps render targets alive and only rebuilds them when size changes;
- its ping-pong work/history resources have explicit ownership and deterministic reuse;
- the image texture processor resizes its preview only when actual dimensions change;
- render-time work is separated from resource-construction work.

Pass 10 applies those same principles to a Canvas2D effect rather than a WebGL framebuffer: retain the workspace, key static geometry to real invalidation inputs, and keep per-frame work limited to animated calculations and required draws.

## Remaining cost ceiling

For each accepted band, Canvas2D still performs a source-region blit:

```text
drawImage(gCur, source rectangle, destination rectangle)
```

This is the correct Classic behavior and cannot be removed without changing how overlapping bands, alpha, source sampling, and paint order work.

Future draw-call profiling in Pass 16 will determine whether Scanlines are limited primarily by:

- p5 noise evaluation;
- Canvas2D transformed `drawImage()` calls;
- source texture upload/sampling inside the WebView;
- interaction with other high-draw-count effects.

## Headroom interpretation

Pass 10 should help most when:

- angle is static;
- SPEED is low or zero;
- DRIFT is zero;
- SHIFT and SKEW are neutral;
- band count is high;
- Scanlines run beside Glitch, Flow, or Syphon output.

It will help less when SPIN and SPEED are both active because geometry and band placement legitimately change every render frame. In that case the main remaining cost is the required noise and band blits.
