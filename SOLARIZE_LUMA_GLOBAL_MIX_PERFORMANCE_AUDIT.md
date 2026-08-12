# Solarize / Luma / Global Mix Performance Audit — Pass 44

## Reported runtime problem

The expensive combination is Solarize + Pipeline Luma Key + Global Mix,
especially in recursive Feedback/Persistence states. The primary structural
reason is not the quantization math itself: both Luma and Solarize cross the
Canvas2D GPU/CPU boundary with bounded `getImageData()` operations, and Solarize
runs late enough that its readback can force preceding drawing work to complete.

## Pass 43 hot path before this repair

For LIVE / COMPOSITE Luma plus Global Mix plus Solarize, a new decoded frame can
involve roughly:

```text
Luma:
  downsample clean source
  getImageData
  extract luminance
  build alpha mask
  putImageData mask
  downsample clean source again
  destination-in mask draw
  present key patch to gBuf

Global Mix:
  full-resolution clean-source blend into gBuf

Solarize:
  downsample gBuf
  getImageData
  pixel transform
  putImageData
  present to gBuf
```

## Pass 44 changes

### 1. Luma LIVE / COMPOSITE patch reuse

The first Luma readback already contains the color pixels needed by the clean
key patch. Pass 44 retains those bytes, extracts luminance and source alpha in
the same traversal, then writes the shaped key directly into the retained alpha
channel. This removes three pieces of redundant work from the common live path:

- the second clean-source downsample copy;
- the separate mask-canvas upload;
- the `destination-in` mask draw.

STENCIL is intentionally unchanged because its luma is stored while its RGB
must remain live.

### 2. Safe Global Mix fusion

Solarize immediately reduces its input to at most 640px before readback. If no
active transform exists between Global Mix and Solarize, doing a full-resolution
Global Mix immediately before that downsample is unnecessary work. Pass 44 can
therefore perform that mix inside the already-existing Solarize scratch.

Fusion eligibility preserves recipe semantics:

```text
BEFORE FB   -> only if Feedback, Flow and Symmetry are inactive
AFTER FB    -> only if Flow and Symmetry are inactive
AFTER FLOW  -> only if Symmetry is inactive
FINAL       -> never fused; it belongs after Solarize
```

This specifically covers the common heavy-feedback setup where Global Mix is
`AFTER FB`, Flow is off, Symmetry is off, and Solarize is on.

### 3. No temporal load shedding

Pass 44 removes Solarize's older adaptive every-2nd/every-3rd-render reuse
behavior. Every Solarize render call now performs the current image transform.
The optimization strategy is work elimination and bounded-domain fusion, not
frame cadence reduction.

## Instrumentation

The existing backtick profiler now exposes:

- `sol gm fuse` — frames where Global Mix was safely fused into Solarize;
- `luma patch` — LIVE/COMPOSITE direct patch builds/reuses;
- normal Solarize read/xform/upload/present timings;
- normal Luma read/xform/upload/present timings.

## Runtime acceptance target

Compare Pass 43 and Pass 44 with the same source and control state. Focus on:

- Solarize + Luma Key COMPOSITE / KEY SRC LIVE;
- Global Mix `AFTER FB`;
- heavy Feedback/Persistence;
- Flow OFF and Symmetry OFF for the expected Global Mix fusion path.

Reject the pass if the visual identity changes materially, if Solarize cadence
steps/holds, or if Feedback/Flow behavior changes.
