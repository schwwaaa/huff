# HUFF Classic Pass 9 — Canvas Pipeline Audit

**Current code:** Optimization Pass 9  
**Renderer:** p5.js + Canvas2D inside Tauri v1 WebViews

## What Pass 9 moves out of the frame loop

### Flow Warp static geometry

Before Pass 9, every Flow frame recalculated for every tile:

```text
x / y position
edge tile width / height
normalized noise coordinates
distance and normalized direction to canvas center
radial atan2 angle for swirl
```

Pass 9 retains these values in `FlowGridWorkspace`. The cache key is `(width, height, cell)`, where `cell` is Flow SCALE after the existing minimum clamp.

### Work that remains per Flow frame

The cache does not remove the behavior-producing work:

```text
noise sampling
TURB secondary noise sampling
sin/cos displacement
animated time
PULL strength
SWIRL rotation strength
Math.fround displacement quantization
source bounds and drawImage blits
```

This is deliberate. The pass reduces repeated geometry bookkeeping without approximating the visual field.

## Temporal-ring write path

Each FrameRing slot owns a dedicated 2D context used only to overwrite that slot. The context now remains in `copy` mode between captures.

```text
new decoded frame
  → dedicated slot context already in copy mode
  → one drawImage overwrite
  → advance ring head
```

The ring capacity is still calculated from QUALITY and a 192 MiB raw RGBA estimate. Width, height, and QUALITY are cached, so the capacity formula and `resize()` check run only after one of those values changes.

No history frames are skipped and no lower-resolution ring was introduced.

## Canvas mirror transport

### Without a canvas receiver

```text
index WebSocket remains connected
Rust reports receivers = 0
no createImageBitmap
no worker JPEG encode
no fallback toBlob
no JPEG WebSocket upload
```

The output server remains ready, so reopening the canvas window does not require restarting HUFF.

### With a canvas receiver

```text
Rust reports receivers > 0
capture final canvas
worker/fallback JPEG encode
send one frame
wait for mirror-ack
allow next frame
```

The acknowledgement is emitted after Rust has placed the JPEG into each canvas receiver's latest-frame slot. Each receiver still owns only one replaceable pending frame, and `canvas.html` still decodes only the newest pending image.

### What this does not change

- JPEG remains the mirror codec.
- The mirror remains capped at 30 fps.
- Maximum mirror encode dimensions remain 1280×1280.
- The viewer keeps its backing canvas at encoded-frame dimensions.
- Syphon and Spout remain independent raw-RGBA routes.

## Remaining Canvas2D headroom

### Still worthwhile

- Profile scanline geometry/noise work and reduce repeated calculations without changing placement.
- Profile no-op/neutral paths that still touch full-frame canvases.
- Measure actual history-canvas memory on WebKit and WebView2 against the raw budget estimate.
- Measure whether Flow's remaining noise/trigonometry or its `drawImage()` count is dominant at common SCALE values.
- Continue long-duration source switch, resize, mirror, and Syphon tests.

### Near the Classic ceiling

- One Canvas2D draw call per active Flow tile.
- Many glitch/scanline/history tile blits.
- CPU pixel loops and synchronous readback for Solarize and luma key.
- WebView canvas readback for Syphon/Spout.
- JPEG encode/decode between WebViews while the mirror is open.
- 4K full-resolution feedback and temporal history.

These are framework boundaries rather than hidden release promises. HUFF Classic can become faster and firmer, but native HUFF remains the path for high-resolution GPU-owned output.

## Pass 11 update — effective-stage dispatch

Before entering the fixed Classic pipeline, the renderer now distinguishes enabled controls from stages that can actually contribute pixels. The resolver is stored in one sealed reusable object and does not allocate per frame.

The clean bypass path avoids the JPEG/Syphon/Spout architecture changes planned for later passes; it only reduces work inside the current authoritative controls-window renderer. Output transports continue to capture the same main output canvas.
