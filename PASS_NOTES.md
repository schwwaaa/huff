# HUFF Classic Optimization Pass 19 — Syphon Control-Plane Budget

**Date:** 2026-08-04  
**Baseline:** committed Pass 18  
**Scope:** working Syphon output control plane, receiver-state sampling, status UI, and stage diagnostics

## Goal

Reduce avoidable main-thread and native control work around the already-working Pass 16S Syphon path without changing:

- the one-frame-per-second bootstrap that prevents black startup;
- immediate transition to the selected 30/60 fps rate after attachment;
- one-frame-in-flight acknowledgements;
- Worker-assisted Canvas2D readback;
- raw RGBA WebSocket transport;
- persistent Metal textures;
- output dimensions, image orientation, or receiver behavior;
- video decoding, effect rendering, frame scheduling, mirror output, or Spout.

Pass 19 is deliberately conservative. It does not move the WebSocket into the Worker or attempt to share one readback between mirror and Syphon. Those changes would be larger architectural risks and require the measurements added here first.

## Runtime changes

### 1. Syphon status UI is no longer rewritten for every output frame

Before Pass 19, every `syphon-ack` at 30 or 60 fps rewrote the status and frame-count DOM nodes.

Pass 19 keeps acknowledgements per frame, but coalesces visible status refreshes to at most four per second and writes only when the displayed text or class changed.

```text
30 fps output: up to 30 UI refresh attempts/s → at most 4/s
60 fps output: up to 60 UI refresh attempts/s → at most 4/s
```

This removes unrelated DOM work from the controls WebView while preserving current frame acknowledgements and receiver state.

### 2. Native `hasClients` checks are bounded while connected

Before Pass 19, the Rust relay called Syphon's Objective-C `hasClients` method after every published frame.

Pass 19 now:

- checks on every one-fps bootstrap frame while disconnected;
- caches the positive receiver state;
- samples receiver presence at four hertz while connected;
- changes back to bootstrap pacing within approximately 250 ms after disconnect.

This preserves the black-frame repair because disconnected mode still checks every bootstrap publication.

### 3. Redundant runtime polling is suspended during healthy acknowledgements

The Tauri `syphon_runtime_state` command previously ran every 500 ms even while the dedicated WebSocket was returning a current acknowledgement for every frame.

Pass 19:

- polls once per second only as a recovery path;
- skips the command while a recent WebSocket acknowledgement is available;
- forces one state read during startup;
- clears the interval during shutdown.

### 4. Output FPS is cached

The selected 30/60 fps value is parsed when Syphon starts and when the selector changes instead of being reparsed during every animation-frame scheduler tick.

### 5. Main-thread fallback sends the raw `ArrayBuffer`

The fallback readback path now passes `imageData.data.buffer` directly to WebSocket instead of passing the typed-array view. Dimensions and byte order are unchanged.

### 6. End-to-end Syphon phase telemetry

The existing backtick profiler now exposes the complete output budget:

```text
sy cap      main-thread ImageBitmap or fallback capture
sy draw     Worker OffscreenCanvas draw/scale
sy read     Worker synchronous getImageData readback
sy pipe     capture start through native acknowledgement
sy upload   sampled Metal replaceRegion upload
sy publish  sampled Syphon publish + command-buffer commit
sy skips    one-frame-in-flight / WebSocket-buffer skips
sy ui       coalesced status UI updates
```

Browser and Worker timing is collected only while the profiler is visible. Native upload/publish timing is sampled every 30 published frames, approximately once per second at 30 fps and twice per second at 60 fps. Ordinary acknowledgements retain the compact Pass 16S shape; timing fields are attached only to sampled acknowledgements.

## Junkpile influence

Pass 19 continues the output discipline used throughout the supplied Junkpile experiments:

- measure individual staging boundaries instead of treating output as one opaque cost;
- keep receiver state and backpressure explicit;
- retain persistent native resources;
- sample diagnostics rather than instrumenting every operation continuously;
- optimize the control plane before replacing a working transport.

No wgpu renderer or native decoder was imported into HUFF Classic.

## Files changed

- `src/index.html`
- `src/canvas.js`
- `src/syphon-stream-worker.js`
- `src-tauri/src/main.rs`
- `src-tauri/src/syphon.rs`
- `scripts/validate-pass19.mjs`
- `package.json`
- optimization documentation in the project root

## Explicitly unchanged

- File → Blob URL → p5 `createVideo()` decoder path
- independent p5, transport, mirror, profiler, and Syphon clocks
- Canvas2D effects and effect order
- temporal history
- JPEG mirror path
- one-fps Syphon bootstrap
- full-rate receiver attachment
- one-frame acknowledgements and WebSocket backpressure
- persistent Metal texture ring
- bundled `Syphon.framework`
- Spout implementation
