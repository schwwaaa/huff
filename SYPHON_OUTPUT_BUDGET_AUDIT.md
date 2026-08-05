# HUFF Classic Pass 19 — Syphon Output Budget Audit

## Current frame path

```text
HUFF Canvas2D output
  → createImageBitmap capture, optionally resized
  → ImageBitmap transfer to Worker
  → Worker OffscreenCanvas draw
  → Worker getImageData RGBA readback
  → ArrayBuffer transfer to controls WebView
  → dedicated WebSocket send
  → Rust tungstenite receive
  → Metal texture replaceRegion
  → Syphon publishFrameTexture + command-buffer commit
  → OBS / Syphon receiver
  → acknowledgement to browser
```

The path remains intentionally bounded to one frame in flight. It cannot accumulate an output latency queue.

## Work removed by Pass 19

### Per-frame status DOM writes

The frame count previously caused status text construction and DOM assignments on every acknowledgement. Pass 19 limits this to four updates per second and avoids assignments when the final text/class is unchanged.

### Per-frame Objective-C receiver queries

`hasClients` is no longer queried at 30/60 fps after a receiver is attached. It remains fully sampled during the one-fps bootstrap state so startup discovery cannot deadlock.

### Healthy-stream command polling

Per-frame acknowledgements already include the cached native receiver state and published frame count. The separate Tauri state command is now a startup/recovery mechanism rather than permanent parallel traffic.

### Repeated FPS parsing

The selected output rate is cached until the selector changes.

## Work that remains unavoidable in the Classic architecture

The WebView/Canvas2D design still requires:

1. capture of the final canvas;
2. a CPU-readable RGBA frame;
3. transfer of that RGBA frame to Rust;
4. CPU-to-Metal texture upload.

At 1280×720 RGBA, each raw frame is approximately 3.52 MiB. At 30 fps this represents approximately 105.5 MiB/s of raw payload before protocol overhead; at 60 fps it represents approximately 210.9 MiB/s.

These are structural byte rates, not measured memory-bandwidth results.

## Why Pass 19 does not move WebSocket ownership into the Worker

A Worker-owned WebSocket could remove the full RGBA transfer from Worker back to the controls thread. It is a promising later optimization, but it changes transport ownership, reconnect behavior, acknowledgement routing, and WKWebView compatibility.

Because Syphon recently experienced a black-frame startup regression, Pass 19 first adds measurements and removes low-risk control overhead. A Worker-owned transport should only be attempted behind an automatic fallback after the new telemetry identifies the Worker-to-main transfer as a meaningful bottleneck.

## Simultaneous mirror and Syphon

The JPEG mirror and Syphon still capture independently because they require different:

- output dimensions;
- rates;
- formats;
- backpressure states;
- receiver lifecycles.

A shared capture broker may be useful only when both outputs request compatible dimensions and timing. It is not safe to assume that one capture can satisfy both without adding latency or changing output cadence.

## Profiler interpretation

### `sy cap`

High values indicate the final canvas snapshot or resize is expensive on the main WebView thread.

### `sy draw`

High values indicate Worker scaling/presentation into OffscreenCanvas is expensive.

### `sy read`

High values identify synchronous RGBA readback as the dominant browser-side cost.

### `sy pipe`

This is total time from capture scheduling to native acknowledgement. It includes capture, Worker work, message transfer, WebSocket transfer, Rust receive, Metal upload, publication, and acknowledgement.

### `sy upload`

Sampled time spent copying raw RGBA into the persistent shared Metal texture.

### `sy publish`

Sampled command-buffer creation, Syphon publication call, and commit time.

### `sy skips`

The first value counts scheduler ticks blocked by the one-frame-in-flight gate. The second counts ticks blocked by WebSocket buffered data. These are expected under load and prove the sender is dropping timing opportunities instead of building a latency queue.

## Acceptance boundary

Pass 19 succeeds only if:

- OBS receives moving frames from startup;
- the source never returns to black during connect/reconnect;
- 30 and 60 fps modes remain selectable;
- playback is equal to or better than Pass 18;
- status UI remains responsive;
- connected receiver detection and disconnect fallback remain reliable.
