---
layout: page
title: How it Works
permalink: /how-it-works/
nav_order: 2
---

huff processes video through a sequential chain of effect passes each frame. Understanding the architecture helps you predict how parameter changes interact and why certain combinations produce the results they do.

---

## Effect Pipeline

Each frame, source material passes through up to eight independent effect passes. Each pass is independently toggleable. When a pass is disabled it is completely skipped — there is no bleed-through. The order is fixed.

<div class="diagram-wrap">
{% include diagrams/pipeline.svg %}
</div>

**Reading the diagram:**
The frame ring sits at the centre. Every time-based effect (Trails, Glitch, Scanlines, Flow Warp) reads from it. The ring is updated at the end of each frame — passes always read the *previous* frame's ring state, never the current one being assembled.

---

## UI → Effect Data Flow

All parameter control — sliders, MIDI CC, OSC messages — converges on the same DOM element values. The p5.js draw loop reads these values directly on every frame. There is no debounce, no interpolation layer, and no intermediate state object.

<div class="diagram-wrap">
{% include diagrams/dataflow.svg %}
</div>

**What this means in practice:**
- Moving a slider and receiving a MIDI CC produce identical results — both write the same DOM element
- There is no latency between receiving a MIDI CC and it affecting the output; the next `draw()` frame picks it up
- Smoothing/interpolation of parameter changes is not built in — if you need it, do it in your MIDI controller or OSC sender

---

## Frame Output Pipeline

At the end of each `draw()` call, huff routes the composited output frame to one or more destinations. Syphon and Spout use a magic-byte prefix on the same WebSocket connection as the canvas mirror — Rust inspects the first bytes and routes accordingly.

<div class="diagram-wrap">
{% include diagrams/output.svg %}
</div>

**The CPU round-trip note:**
Both Syphon and Spout currently use `getImageData()` to read pixels from the WebView canvas back to CPU, send them over localhost WebSocket, then re-upload to GPU in Rust. This is a full GPU→CPU→GPU trip per frame. It works reliably at 720p/30fps but is not zero-copy. See [Caveats](caveats#cpu-pixel-readback-for-syphon-and-spout) for details.

---

## Frame Ring Buffer

The ring buffer is the shared memory between passes. It stores raw `ImageData` objects — RGBA pixel arrays at canvas resolution.

<div class="diagram-wrap">
{% include diagrams/ring.svg %}
</div>

| Parameter | Effect on ring |
|-----------|---------------|
| **QUALITY** | Controls ring depth: 0→4 frames, 1→60 frames |
| **DEPTH** | How far back effects sample into the ring (0–50% of ring depth) |
| **DEPTH SCATTER** | Per-tile randomisation of the back index |
| **192 MB cap** | Ring depth is also capped by pixel budget: at 1080p (~8 MB/frame) max ≈ 24 frames regardless of quality |

