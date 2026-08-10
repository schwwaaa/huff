# Pass 40S — Scanlines Recovery and Spatial Audit

## Decision
Pass 40 and 40R are rejected experiments. Pass 40S is rebased directly on Pass 39N.

The existing effect is not redefined. It remains the established HUFF current-frame band compositor writing into the persistent image. The working UI name remains **Scanlines** until runtime testing gives a better name.

## What was removed from the rejected direction

- no `RASTER SCAN` rename
- no `FIELD RATE` control for Scanlines
- no `scanMasterSpeed`
- no `ZOOM TARGET`
- no FIELD / CONTENT / BOTH modes
- no sample/hold write cadence
- no historical FrameRing sampling
- no new pseudo-3D scan model

## One speed clock

The existing `scanSpeed` ID remains canonical and visible as **SPEED**.

At `1.0x`:
- phase X increment is exactly `0.008` per render, as in Pass 39N
- phase Y increment is exactly `0.009` per render, as in Pass 39N
- with Spin Speed 1, spin increment is exactly `0.5 degrees` per render, as in Pass 39N

Pass 40S also scales spin and new XYZ movement by the same SPEED. This gives a true stable zero state:

`SPEED = 0x` freezes automatic geometry/motion while the live source remains current and is still painted into the held band geometry.

## General zoom

`scanZoom` is one centered transform around the complete existing Scanlines draw. It does not alter source crop logic and does not create multiple zoom semantics.

Neutral state:
- POS X = 0
- POS Y = 0
- ZOOM = 1x
- MOVE X/Y/Z = 0

At the neutral state the exact Pass 39N direct-horizontal draw path remains available.

## XYZ interpretation

Classic remains Canvas2D:
- X = translation
- Y = translation
- Z = general zoom

The added motion controls are explicit velocities:
- MOVE X: px/s
- MOVE Y: px/s
- MOVE Z: zoom-units/s

MOVE Z reflects at the existing safe zoom boundaries 0.25x and 4x rather than running to zero or infinity.

## Performance boundary

The Scanlines pass adds only Canvas2D transform state around the existing draw calls. It does not allocate a new video-sized buffer or introduce synchronous pixel readback.
