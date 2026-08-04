# HUFF Classic Optimization Roadmap — After Pass 14

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

## Rejected branches

- Pass 12 direct renderer/window ownership migration: rejected due video decode failure
- Pass 13 scheduler consolidation: rejected due worse playback and frame pacing

## Next mandatory optimization passes

### Pass 15 — Mirror capture staging audit

- Measure full-canvas `createImageBitmap()` cost with the canvas receiver attached.
- Compare full-resolution capture against bounded pre-scaled staging.
- Keep mirror scheduling independent from `draw()`.
- Preserve one-frame-in-flight backpressure and receiver-aware suspension.
- Land only the path that improves target-runtime frame pacing.

### Pass 16 — Solarize readback acceleration

- Measure synchronous `getImageData()` and `putImageData()` cost.
- Evaluate tighter CPU loops, worker feasibility, and a narrowly scoped WebGL fallback.
- Require exact threshold/channel parity.
- Keep Canvas2D fallback available on all platforms.

### Pass 17 — Pipeline Luma Key acceleration

- Measure mask rebuild, clean-source copy, and composite cost separately.
- Preserve decoded-frame cache invalidation.
- Investigate reusable single-channel workspaces or a scoped shader path.
- Preserve threshold, inversion, and mix behavior exactly.

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

## Behavioral proposal held for explicit approval

Demand-driven or reduced-cadence temporal-history capture could lower clean-playback bandwidth, but it changes the history available immediately after enabling Glitch or Flow Pulse. It is not part of Pass 14 and will not be introduced silently.
