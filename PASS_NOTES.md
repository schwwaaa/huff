# Pass Notes

## Pass 42 — Solarize Luma Quantize

- Built from accepted Pass 41A.
- Existing Solarize is retained as MODE = THRESHOLD and remains the default.
- Added MODE = LUMA QUANTIZE with LEVEL / SOFT / INVERT.
- New algorithm shares the existing bounded Solarize readback/scratch path.
- Flow remains frozen/protected.
- Runtime acceptance pending.

## Pass 41A — Playback Fidelity / 1080p Classic boundary

Pass 41A follows the decision that HUFF Classic may top out at **1920×1080** while
HUFF HD owns 4K+ processing. The pass repairs media-path ambiguity rather than
replacing the proven WebView decoder architecture.

Key changes:
- explicit `AUTO / 720P / 1080P` processing resolution;
- explicit `STRETCH / FIT / FILL / 1:1` source mapping;
- public `HISTORY` control instead of misleading `QUALITY`;
- strict 192 MiB FrameRing ceiling with the unsafe four-frame floor removed;
- mirror preview fully decoupled from temporal history;
- requestVideoFrameCallback / dropped-frame playback diagnostics;
- fast seek while dragging + exact seek on release;
- clearer MP4/MOV/WebM container messaging.

Pass 40W front-stage behavior is protected exactly outside `src/canvas.js` and the
source-control UI. No decoder backend, Flow, Luma, Scan FIELD, Corrupt, Feedback,
or native output architecture is redesigned here.
