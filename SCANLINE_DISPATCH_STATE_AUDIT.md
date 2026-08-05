# HUFF Classic Pass 22 — Scanline Dispatch and State Audit

## Baseline path

Pass 21 already retained reusable Scanline band arrays and cached complete prepared-band results when phase and parameters did not change. Remaining recurring work existed in two areas:

1. stable per-pass values and state branches inside the band-preparation loop;
2. general Canvas2D transform-stack setup even for an exact horizontal pattern.

## Preparation path before Pass 22

For every requested band, the loop could perform:

```text
slow phase multiplication
DRIFT state test
optional fast phase multiplication
focus scalar calculations
GAP state test
SHIFT/SKEW state test
optional shift phase multiplication
zero/nonzero offset clamps
cross-span absolute-value subtraction
```

Some of those operations are artistically necessary. Others are identical for every band during one pass.

## Preparation ownership after Pass 22

### Per-pass state

```text
slow phase
fast phase
shift phase
focus bias
focus scale
focus offset
gap-enabled state
neutral-drift state
neutral-shift state
```

### Per-band state

```text
noise samples required by the selected variant
biased position
roll and modulo placement
gap snap when enabled
band start/end clipping
shift/skew only when enabled
prepared draw rectangle
```

## Four preparation variants

| DRIFT | SHIFT/SKEW | Noise order | Shift rectangle work |
|---|---|---|---|
| Neutral | Neutral | slow | direct full-cross rectangle |
| Neutral | Active | slow → shift | calculated |
| Active | Neutral | slow → fast | direct full-cross rectangle |
| Active | Active | slow → fast → shift | calculated |

The variant is selected once before iteration. The validator confirms that noise-call count, order, and prepared fields remain identical.

## Direct horizontal path

With an exact zero angle:

```text
sin(0) = 0
cos(0) = 1
dimension = canvas height
```

The prior relative transform was:

```text
translate(width/2, height/2)
translate(-width/2, -height/2)
```

which is identity. Pass 22 therefore keeps the incoming transform untouched and changes only `globalAlpha`, restoring it in a `finally` block.

### Removed at exact zero angle

```text
ctx.save()
ctx.translate(...)
ctx.translate(...)
ctx.restore()
```

### Retained for nonzero angle

```text
ctx.save()
ctx.translate(center)
optional ctx.rotate(angle)
ctx.translate(rotated origin)
draw bands
ctx.restore()
```

Angles near zero but not exactly zero retain the old transformed path. This avoids changing the established rotated-dimension and threshold behavior.

## Draw-loop ownership

Pass 22 resolves these once:

```text
start array
length array
source-offset array
destination-offset array
cross-length array
Canvas2D context
source canvas
```

One artistic `drawImage()` remains for every visible band.

## Memory impact

No new image surface is introduced.

The workspace gains only scalar geometry and diagnostic fields. Existing typed band arrays are reused.

## Profiler interpretation

```text
scan bands
```

Number of accepted visible bands per profiled Scanline frame.

```text
scan draws
```

Canvas2D `drawImage()` calls per profiled Scanline frame. This remains equal to accepted band count.

```text
scan geom
```

Render-size/angle geometry rebuilds versus reuse.

```text
scan prep
```

Prepared-band rebuilds versus reuse. Moving phases normally cause rebuilds; static phases should show reuse.

```text
scan path
```

Exact-horizontal direct frames versus transformed frames.

## Remaining Scanline ceiling

After Pass 22, the dominant remaining costs are increasingly fundamental to the effect:

- p5 noise samples required by active drift and shift;
- modulo and clipping for moving bands;
- one Canvas2D draw call per visible band;
- rotated Canvas2D sampling for nonzero angles.

Reducing draw count would change the image and is outside a parity-preserving optimization pass.
