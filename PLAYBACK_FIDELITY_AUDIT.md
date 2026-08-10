# Playback Fidelity Audit — Pass 41A

## Product boundary

HUFF Classic is now explicitly a **1080p-class** instrument. HUFF HD remains the
future 4K+ product. Classic may open higher-resolution source files, but its visual
processing pipeline never intentionally exceeds ~2.07 megapixels / a 1920-pixel
long edge in AUTO, and the explicit maximum-fidelity mode is **1920×1080**.

## Playback path preserved

```text
local File
  -> Blob URL
  -> p5 createVideo()
  -> HTMLVideoElement / operating-system WebView decoder
  -> requestVideoFrameCallback when available
  -> gCur Canvas2D processing surface
  -> FrameRing + HUFF effects
```

No FFmpeg/native decoder was added. Codec decoding remains delegated to the
operating-system WebView, preserving the stable Classic architecture.

## Processing modes

- `AUTO` — follows the window but is capped to the 1080p-class limit.
- `720P` — fixed 1280×720.
- `1080P` — fixed 1920×1080 and the maximum-fidelity Classic processing path.

A fixed processing mode does not change when the UI window changes size. This
separates operator-window dimensions from the actual effect/history/output size.

## Source mapping

`SOURCE FIT` now makes aspect handling explicit:

- `STRETCH` — historical Classic behavior, fastest path.
- `FIT` — preserve aspect ratio, show the complete source, black unused region.
- `FILL` — preserve aspect ratio, fill the processing canvas, center-crop excess.
- `1:1` — no scaling; center native source pixels and crop/border as required.

Example: a 1440×1080 4:3 source into 1920×1080 processing:

```text
STRETCH -> 1920×1080 distorted to 16:9
FIT     -> 1440×1080 centered with 240px side pillars
FILL    -> center crop 1440×810, then fill 1920×1080
1:1     -> 1440×1080 centered with 240px side pillars
```

## Temporal history / memory

The old public `QUALITY` slider mixed unrelated responsibilities. It is now hidden
as a compatibility alias. The visible control is `HISTORY`.

FrameRing budget:

```text
192 MiB maximum raw RGBA backing stores
```

Approximate maxima:

| Processing | Bytes/frame | Max history |
|---|---:|---:|
| 1280×720 | 3.52 MiB | 54 frames |
| 1920×1080 | 7.91 MiB | 24 frames |

The previous `Math.max(4, ...)` FrameRing floor could theoretically violate the
budget at very large resolutions. FrameRing capacity may now drop below four when
necessary, so the byte budget remains authoritative even if a future path bypasses
the Classic resolution ceiling.

## Preview decoupling

Mirror preview no longer changes when HISTORY changes.

Current mirror tuning is independently fixed at:

```text
up to 30 fps
JPEG quality 0.97
bounded preview dimensions remain unchanged
```

This fixes the old semantic bug where a temporal-history knob also changed an
unrelated preview encoder.

## Decode / presentation telemetry

The backtick profiler now includes:

```text
source       decoded source dimensions
process      actual HUFF processing dimensions
src fit      STRETCH / FIT / FILL / 1:1
src scale    process/source X and Y scale
rvfc         requestVideoFrameCallback or fallback
presented    latest presentedFrames counter
rvfc gaps    skipped callback-count gaps, not automatically classified as drops
video drop   browser getVideoPlaybackQuality dropped/total frames
dec proc     requestVideoFrameCallback processingDuration avg/max
media time   source mediaTime
```

This separates decoder/presentation evidence from effect-render FPS.

## Seeking

While dragging the transport, HUFF still uses `fastSeek()` where available to
avoid expensive exact decoding on every pointer event. On release it now assigns
`currentTime` to the exact target so the final landing is not permanently limited
to a nearby keyframe.

## Container / codec policy

The picker explicitly surfaces MP4/M4V/MOV/WebM and still permits `video/*`.
The recommended cross-platform Classic delivery target is **H.264/AAC MP4**.
MOV/WebM and other codecs remain platform-decoder dependent; HUFF does not claim
that container extension alone guarantees a codec.

## Color fidelity boundary

Pass 41A does not change the existing Canvas2D color architecture. Classic remains
an SDR Canvas2D instrument rather than a 10/12-bit HDR professional intermediate
pipeline. The paid HUFF HD path is the appropriate place for 4K+, high-bit-depth,
and wider-gamut processing work.
