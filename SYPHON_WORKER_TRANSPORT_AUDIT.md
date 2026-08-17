# HUFF Classic Pass 50 — Syphon Worker-Owned Transport Audit

## Problem addressed

Before Pass 50, the Worker already performed the expensive output scaling and `getImageData()` readback. However, the resulting raw RGBA `ArrayBuffer` was then transferred back to the controls WebView so the controls page could call `WebSocket.send()`. At 720p that message is ~3.5 MiB per output frame; at 1080p it is ~7.9 MiB.

That Worker -> controls transfer does not add useful image work. It exists only because the controls page owned the socket.

## Preferred Pass 50 path

```text
HUFF final canvas
  -> createImageBitmap() on controls page
  -> transferable ImageBitmap to Syphon Worker
  -> Worker OffscreenCanvas scale/draw
  -> Worker getImageData() RGBA readback
  -> Worker WebSocket.send(raw RGBA)
  -> Rust syphon-sender socket role
  -> syphon::push_pixels_profiled()
  -> reusable shared MTLTexture
  -> SyphonMetalServer
```

The controls WebView receives only small messages such as:
- transport opened/failed;
- receiver state;
- native acknowledgement;
- sampled timing metadata.

## Pass 49 fallback path remains intact

When Worker socket ownership is unavailable or unhealthy:

```text
Worker readback
  -> transferable RGBA ArrayBuffer to controls
  -> controls-owned WebSocket
  -> unchanged Rust / Metal / Syphon path
```

If the Worker itself is unavailable, the older bounded main-thread Canvas2D readback fallback remains available.

## Fallback policy

Pass 50 intentionally does not keep retrying an unstable Worker socket in the same Syphon session. A Worker transport failure immediately returns ownership to the accepted main-socket path. This favors live stability over repeatedly switching transport ownership. Stopping and starting Syphon creates a fresh Worker and attempts worker-direct again.

## Backpressure

The same one-frame gate remains authoritative. In worker-direct mode, the Worker checks its own `WebSocket.bufferedAmount` before readback/send. A busy socket rejects that output opportunity and releases the main gate. No additional queue exists in either browser thread.

## ACK path

Rust still sends the established compact `syphon-ack`. The Worker forwards that metadata to the controls page as `transport-ack`. This releases `frameInFlight`, updates receiver state/frame count, and feeds existing profiler data.

## Telemetry added

Backtick profiler additions:

- `sy send` — synchronous Worker `WebSocket.send()` call time on sampled frames;
- `sy route` — sampled acknowledged frames as `worker/main`;
- `sy fall` — Worker-direct transport fallbacks.

Existing `sy cap`, `sy draw`, `sy read`, `sy pipe`, `sy upload`, `sy publish` and `sy skips` remain.

`sy send` is not network completion time; `sy pipe` remains the useful end-to-end metric.

## Native boundary

`src-tauri/src/main.rs` and `src-tauri/src/syphon.rs` are byte-identical to Pass 48. No Metal texture, Syphon server, raw RGBA payload, acknowledgement or receiver-detection behavior changed in Pass 50.

## Remaining structural cost

Pass 50 does **not** make Classic Syphon zero-copy. The Worker still performs CPU pixel readback and Rust still uploads CPU RGBA into Metal. The optimization removes one large JavaScript-thread handoff; it does not remove the WebView -> CPU -> native -> GPU architecture.
