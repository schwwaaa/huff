# HUFF Classic Canvas and Buffer Audit

**Current code:** Optimization Pass 8  
**Renderer:** p5.js + Canvas2D inside Tauri v1 WebViews

## Current render-resolution surfaces

| Surface | Lifetime | Purpose | Notes |
|---|---|---|---|
| Main p5 canvas | Always | Canonical frame presented to mirror/Syphon capture | Pixel density fixed to 1 before allocation |
| `gCur` | Always | Clean current decoded/camera frame | Updated by `requestVideoFrameCallback` where supported |
| `gBuf` | Always | Active persistent/effect composite | Glitch, scanlines, feedback, luma, global mix, and final effects operate here |
| `gScratch` | Always | Shared full-frame ping-pong target | Reused by Feedback snapshot, Flow Warp, and Symmetry |

Pass 8 removes one always-resident full-resolution p5 Graphics surface and the Feedback-only full-resolution snapshot canvas.

## Temporal history

`FrameRing` contains reusable canvas-backed snapshots. Capacity is controlled by QUALITY and capped by an estimated 192 MiB raw RGBA budget.

This remains the largest scalable memory owner at ordinary 720p/1080p settings. Canvas-backed history avoids `getImageData()` capture and later `putImageData()` reconstruction, but each retained history slot still requires a full frame backing store.

### Remaining opportunities

- Validate whether the practical WebView memory cost per history canvas materially exceeds the current four-bytes-per-pixel estimate.
- Consider a stricter platform-specific budget after macOS, Windows, and Linux soak measurements.
- Consider reduced-resolution history only as an explicit quality policy; it would alter effect appearance and is not part of Pass 8.

## Feedback

Feedback now uses `gScratch` as its snapshot source:

```text
gBuf → copy into gScratch → transform gScratch back into gBuf
```

The snapshot is overwritten later if Flow or Symmetry runs. There is no separate feedback canvas.

## Flow Warp and Symmetry

Both effects use the same ping-pong target:

```text
current gBuf → effect writes gScratch → swap references
```

When both are active:

```text
gBuf → Flow writes gScratch → swap
gBuf → Symmetry writes gScratch → swap
```

Each effect clears or completely replaces the destination before drawing, so stale scratch content is not visible.

## Pixel-processing scratch surfaces

### Solarize

- one downsampled `willReadFrequently` canvas, maximum 640 pixels wide;
- one full-resolution cached output canvas, allocated only after Solarize is used.

The full-resolution Solarize cache is necessary for the adaptive load guard to replay the last processed result on skipped processing frames. Removing it would change behavior or require another full-resolution read/write path.

### Pipeline Luma Key

- one downsampled source/mask canvas, maximum 640 pixels wide;
- one downsampled clean-patch canvas.

Both are resized in place and cached across identical decoded source frames and unchanged key parameters.

## Mirror surfaces

- Worker path: transferred `ImageBitmap` + Worker-owned `OffscreenCanvas` capped at 1280×1280.
- Fallback path: one reusable DOM canvas capped at 1280×1280.
- Mirror transmission is capped at 30 fps and latest-frame-wins.

Pass 8 caches QUALITY-derived JPEG/FPS values on control events but does not alter the encoded image or transport protocol.

## Syphon surfaces

The Classic Syphon path remains:

```text
main WebView canvas
  → worker/fallback scale and RGBA readback
  → bounded WebSocket frame
  → Rust
  → one of three reusable Metal textures
  → Syphon publish
```

The JavaScript stream is one-frame-in-flight and pauses expensive capture/readback when no Syphon client is attached. The native Metal texture ring remains unchanged in Pass 8.

The unavoidable Classic ceiling is the WebView canvas readback and browser/native transfer. True zero-copy Syphon requires a renderer that owns a shareable native GPU texture, which belongs to the native HUFF architecture rather than HUFF Classic.

## Raw full-frame memory reference

| Resolution | RGBA bytes | Approximate MiB per surface |
|---|---:|---:|
| 1280×720 | 3,686,400 | 3.52 |
| 1920×1080 | 8,294,400 | 7.91 |
| 2560×1440 | 14,745,600 | 14.06 |
| 3840×2160 | 33,177,600 | 31.64 |

These values exclude browser-internal texture duplication, row alignment, compositing surfaces, encoded mirror frames, Metal textures, decoded-video surfaces, and JavaScript/runtime overhead.

## Current Canvas2D headroom

### Still worthwhile

- Profiler-guided reduction of tile draw calls and repeated noise/math work.
- Avoiding full-frame operations when a stage is visually neutral.
- Measuring history-ring memory against actual WebView process memory.
- Long-duration resize and source-switch cleanup tests.
- Platform-specific output-rate defaults based on measured throughput.

### Approaching the Classic ceiling

- CPU pixel loops for Solarize and luma key.
- Full-frame WebView readback for Syphon/Spout.
- Hundreds or thousands of Canvas2D tile blits per frame.
- 4K temporal history and feedback.
- JPEG mirror encode/decode between separate WebViews.

Those ceilings should be documented rather than hidden. HUFF Classic can be made substantially firmer, but it should not be advertised with the same high-resolution guarantees as native HUFF.
