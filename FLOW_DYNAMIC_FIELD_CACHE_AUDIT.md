# HUFF Classic Pass 21 — Flow Dynamic-Field Cache Audit

## Baseline

Pass 20 already retained static Flow geometry by render width, render height, and SCALE:

- tile X/Y;
- edge tile dimensions;
- normalized noise coordinates;
- inward vectors;
- radial angles.

However, ordinary Flow frames still recalculated values derived from that static geometry.

## Previous per-tile preparation

For each tile, every rendered frame performed:

```text
nx × frequency
ny × frequency

when TURBULENCE > 0:
  nx × frequency × 4
  ny × frequency × 4

when SWIRL != 0:
  cos(radial angle × SWIRL)
  sin(radial angle × SWIRL)

source clipping:
  render width  - tile width
  render height - tile height
```

These values change only after specific controls or dimensions change.

## Pass 21 ownership model

```text
FlowGridWorkspace
  key: render width + render height + SCALE
  owns:
    tile geometry
    normalized coordinates
    inward vectors
    radial angles
    maximum source bounds
    generation number

FlowFieldWorkspace frequency cache
  key: grid generation + effective SPREAD frequency
  owns:
    primary noise X/Y
    turbulence noise X/Y

FlowFieldWorkspace swirl cache
  key: grid generation + SWIRL
  owns:
    radial cosine/sine
```

## Invalidation matrix

| Change | Grid | Frequency fields | SWIRL fields |
|---|---:|---:|---:|
| Render width/height | rebuild | rebuild | rebuild |
| SCALE | rebuild | rebuild | rebuild |
| SPREAD | reuse | rebuild | reuse |
| SWIRL | reuse | reuse | rebuild |
| SPEED | reuse | reuse | reuse |
| STRENGTH | reuse | reuse | reuse |
| TURBULENCE | reuse | reuse | reuse |
| IMPLODE | reuse | reuse | reuse |
| PULSE | reuse | reuse | reuse |

## Floating-point preservation

The cache preserves the previous JavaScript operation order.

Primary coordinates remain:

```javascript
nx * frequency
ny * frequency
```

Turbulence coordinates remain left-associated:

```javascript
nx * frequency * 4
ny * frequency * 4
```

The animated X coordinate remains:

```javascript
cachedTurbulenceX + t * 1.3 + 100
```

The `+ 100` term was intentionally not grouped into the time term because regrouping floating-point additions can change boundary results.

SWIRL cache values remain:

```javascript
Math.cos(radialAngle * swirl)
Math.sin(radialAngle * swirl)
```

Displacement still passes through `Math.fround()` before flooring and clipping.

## Remaining Flow cost

Pass 21 does not reduce:

- one primary p5 noise sample per tile;
- the second noise sample when TURBULENCE is active;
- animated flow-vector cosine and sine;
- one Canvas2D `drawImage()` per tile;
- full destination clear;
- optional temporal-ring source selection.

Those costs increasingly define the Canvas2D Flow ceiling.

## Risk controls

- No new image buffers.
- No Worker handoff.
- No frame latency.
- No scheduler changes.
- No approximate trigonometric lookup table.
- No batching or reduced tile count.
- No changes to p5 noise.
