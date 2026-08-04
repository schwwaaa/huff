# HUFF Classic Optimization Roadmap — After Pass 18

## Completed and retained

- Passes 1–4: bounded transport, reusable resources, native Syphon/Spout foundations, mandatory framework packaging
- Pass 5: full-frame copy, Flow, Solarize, Luma, and feedback hot paths
- Pass 6: event-driven typed render-state cache
- Pass 7: reusable Glitch placement and cluster-offset workspaces
- Pass 8: consolidated full-resolution Canvas2D scratch buffers
- Pass 9: Flow geometry cache, ring context reuse, receiver-aware mirror
- Pass 10: Scanline typed workspace and geometry cache
- Pass 11: neutral-stage and clean-path bypass
- Pass 12R: restored working Blob URL decoder after rejected Pass 12 migration
- Pass 13S: lifecycle hardening without frame-clock changes
- Pass 14: exact-size canvas copies and explicit temporal-ring backing-store release
- Pass 15: bounded mirror ImageBitmap staging with compatibility fallback
- Pass 16: packed Solarize transform and direct bounded-scratch presentation
- Pass 16S: bootstrap-safe Syphon publication
- Pass 17: one-scratch Pipeline Luma Key patch construction and phase telemetry
- Pass 18: direct Glitch Canvas2D dispatch, versioned ring-reference cache, reusable smear offsets, and draw-call telemetry

## Rejected branches

- Pass 12 direct renderer/window ownership migration: video decode regression
- Pass 13 scheduler consolidation: worse playback and frame pacing

## Next mandatory optimization passes

### Pass 19 — Output capture budget and Syphon optimization

Syphon is working, but output capture remains a major performance path.

Mandatory work:

- retain the one-fps bootstrap and immediate full-rate attachment;
- measure browser capture, Worker readback, WebSocket transfer, Rust upload, and native publish time independently;
- audit simultaneous mirror, Syphon, and Spout staging;
- avoid redundant final-frame capture where safe;
- preserve independent output dimensions and rates;
- verify disconnect/reconnect and no-receiver behavior;
- add dropped-frame, acknowledgment, queue, capture, transfer, upload, and publish diagnostics;
- compare 30 and 60 fps output caps under light and heavy effects.

No output change lands without proving that OBS receives moving frames from startup.

### Pass 20 — Remaining Canvas2D ceiling review

Use Pass 18 profiler data to identify actual limits:

- Glitch `gl draws` versus `applyGlitch` time;
- Scanline band count versus pass time;
- Flow grid count versus pass time;
- combined effects with output capture disabled and enabled;
- 720p and 1080p operating envelopes.

Only exact, isolated optimizations may land. Reducing artistic density or changing output is not an optimization unless exposed as an explicit user-selected quality policy.

### Pass 21 — Cross-platform stabilization

- macOS WKWebView, Syphon, signing, and notarization
- Windows WebView2, Spout, installer, and shutdown
- Linux WebKitGTK/GStreamer codec, audio, camera, packaging, and process cleanup

### Pass 22 — Capability matrix and soak testing

- 720p30, 720p60, 1080p30, and 1080p60 tiers
- light, medium, and worst-case scenes
- long playback and repeated source switching
- resize/fullscreen cycling
- output disconnect/reconnect
- release-blocking fixes only after feature freeze

## Acceptance rule

Every pass must be compared with the last committed stable baseline. Structural reduction alone is insufficient; visual behavior and target-runtime stability must remain equal or improve.

## Held behavioral proposal

Demand-driven or reduced-cadence temporal-history capture could reduce clean-playback bandwidth, but it changes the history immediately available when Glitch or Flow Pulse is enabled. It remains excluded unless explicitly approved.
