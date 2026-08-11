# HUFF Classic Pass 42 — Solarize Luma Quantize Audit

## Source concept

The Snell & Wilcox Magic DaVE manual describes **Solarise** as luminance
quantisation (a special bit reduction). Its documented controls are LEVEL,
SOFT, and INVERT. High LEVEL settings are coarser; the penultimate setting
reduces the picture to two luminance levels; the extreme setting removes luma;
SOFT changes abrupt quantisation transitions into subtler ones; INVERT reverses
luminance while chroma is unaffected.

The manual does not expose the original DSP transfer curve. Pass 42 therefore
implements the documented control semantics rather than claiming hardware
emulation.

## HUFF mapping

```text
MODE = LUMA QUANTIZE
source RGB
  -> source luma Y
  -> optional luma inversion
  -> LEVEL quantisation
  -> SOFT blend toward unquantized working luma
  -> AMOUNT wet/dry blend against original luma
  -> add resulting luma delta equally to R/G/B
  -> clamp RGB; preserve alpha
```

Adding the same luminance delta to R/G/B keeps RGB channel differences intact
before clipping. This is the Classic implementation's low-cost chroma-preserving
model and avoids an additional RGB↔YCbCr conversion in the 230,400-pixel scratch
loop.

## LEVEL mapping

- 0 = unquantized luminance.
- 1..99 = exponential mapping from 256 levels toward 2 levels.
- 99 = two luma levels.
- 100 = target luma 0 (luma removed), leaving chroma residual subject to RGB
  gamut clipping.

The exponential law is a HUFF design choice because the manual does not state
DaVE's internal mapping.

## SOFT mapping

SOFT linearly blends the hard quantized luminance toward the unquantized working
luminance:

- 0 = hard contours;
- 100 = no quantisation contouring;
- with INVERT active, 100 retains the unquantized inverted-luma result.

## Performance

Pass 42 deliberately extends the existing Pass 16 Solarize CPU boundary instead
of creating a second effect pass:

```text
gBuf
 -> bounded 640px scratch draw
 -> ONE getImageData()
 -> THRESHOLD or LUMA QUANTIZE transform
 -> ONE putImageData()
 -> scratch scaled directly back to gBuf
```

No additional full-resolution p5.Graphics surface, canvas, history store,
readback, or upload is introduced.

## Acceptance criteria

- THRESHOLD matches Pass 41A visually.
- Switching to LUMA QUANTIZE immediately gives visible contouring at default
  LEVEL 75 / SOFT 0 / AMOUNT 1.
- LEVEL 99 clearly produces a two-level luma structure.
- LEVEL 100 removes brightness structure while retaining visible chroma where
  gamut permits.
- SOFT progressively suppresses contour boundaries.
- INVERT swaps dark/light luminance behavior without hue remapping by design.
- AMOUNT 0 is a true no-op.
- Alpha remains unchanged.
- Solarize profiler phase costs remain within the existing bounded-readback
  envelope; no new readback row appears.
- Feedback, Corrupt, Scanlines, Luma Key, Flow, transport, history, Syphon and
  Spout remain operational.

## Rejection criteria

Reject/revise Pass 42 if THRESHOLD changes appearance, LUMA QUANTIZE adds a
second synchronous readback, frame pacing regresses materially compared with
THRESHOLD under similar load, or any protected stage changes unexpectedly.
