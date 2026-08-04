# HUFF Classic Optimization Roadmap — After Pass 16S

## Completed and retained

- Passes 1–4: bounded transport, reusable resources, native Syphon/Spout foundations, mandatory framework packaging
- Pass 5: full-frame copy, Flow, Solarize, Luma, and feedback hot paths
- Pass 6: event-driven typed render-state cache
- Pass 7: reusable glitch placement and cluster-offset workspaces
- Pass 8: consolidated full-resolution Canvas2D scratch buffers
- Pass 9: Flow geometry cache, ring context reuse, receiver-aware mirror
- Pass 10: Scanline typed workspace and geometry cache
- Pass 11: neutral-stage and clean-path bypass
- Pass 12R: restored working Blob URL decoder after rejected Pass 12 migration
- Pass 13S: lifecycle hardening without frame-clock changes
- Pass 14: exact-size canvas copies and explicit temporal-ring backing-store release
- Pass 15: bounded mirror ImageBitmap staging with automatic compatibility fallback
- Pass 16: packed Solarize pixel transform, direct bounded-scratch presentation, and phase telemetry
- Pass 16S: bounded Syphon bootstrap publication to prevent discoverable black/zero-frame startup

## Rejected branches

- Pass 12 direct renderer/window ownership migration: rejected due video decode failure
- Pass 13 scheduler consolidation: rejected due worse playback and frame pacing

## Immediate acceptance gate

Pass 16S must first show live frames in OBS, advance the native published-frame counter, reconnect cleanly, and retain Pass 16 playback performance. Do not begin another renderer optimization until this output regression is closed.

## Next mandatory optimization passes

### Pass 17 — Pipeline Luma Key acceleration

- Measure clean-source downscale/readback, mask transform, cached patch construction, and final composite separately.
- Preserve decoded-frame serial invalidation.
- Preserve threshold, inversion, mix, and current effect position exactly.
- Remove redundant full-resolution or low-resolution copies where target-runtime parity permits.
- Retain the existing Canvas2D implementation as the stable fallback.

### Pass 18 — Glitch draw-call ceiling

- Profile tile count, smear length, spatial gap, and cluster modes.
- Reduce context/property work without changing insertion or paint order.
- Establish the Canvas2D draw-call ceiling for 720p and 1080p.

### Pass 19 — Output capture budget

- Audit simultaneous mirror, Syphon, and Spout capture.
- Prevent unbounded or redundant staging.
- Preserve independent output rates and dimensions.
- Add readback, dropped-frame, and receiver diagnostics.

### Pass 20 — Cross-platform stabilization

- macOS WKWebView, Syphon, signing, and notarization
- Windows WebView2, Spout, installer, and shutdown
- Linux WebKitGTK/GStreamer codec, audio, camera, packaging, and process cleanup

### Pass 21 — Capability matrix and soak testing

- 720p30, 720p60, 1080p30, and 1080p60 tiers
- light, medium, and worst-case scenes
- long playback, repeated source switching, resize cycling, and output reconnects
- release-blocking fixes only after feature freeze

## Runtime acceptance rule

Every remaining optimization must be compared against the last accepted stable pass. Structural reductions are not sufficient evidence by themselves. A pass is retained only when it preserves visual behavior and provides equal or better target-runtime stability.

## Solarize boundary after Pass 16

Solarize still uses synchronous `getImageData()` and `putImageData()` on a bounded 640px-wide scratch canvas. Pass 16 reduces work around that boundary and exposes its phase costs. A Worker or WebGL replacement is not approved without measured evidence and exact visual-parity testing.

## Behavioral proposal held for explicit approval

Demand-driven or reduced-cadence temporal-history capture could lower clean-playback bandwidth, but it changes the history available immediately after enabling Glitch or Flow Pulse. It will not be introduced silently.
