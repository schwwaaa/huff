# HUFF Classic Optimization Roadmap — After Pass 19

## Completed and retained

- Passes 1–4: bounded transport, reusable resources, native Syphon/Spout foundations, framework packaging
- Pass 5: full-frame copy, Flow, Solarize, Luma, and feedback hot paths
- Pass 6: typed render-state cache
- Pass 7: reusable Glitch placement workspaces
- Pass 8: consolidated full-resolution Canvas2D buffers
- Pass 9: Flow geometry cache, ring context reuse, receiver-aware mirror
- Pass 10: Scanline typed workspace
- Pass 11: neutral-stage and clean-path bypass
- Pass 12R: restored working Blob URL decoder
- Pass 13S: lifecycle hardening without frame-clock changes
- Pass 14: exact-size copies and history backing-store release
- Pass 15: bounded mirror ImageBitmap staging
- Pass 16: Solarize packed transform and direct presentation
- Pass 16S: bootstrap-safe Syphon publication
- Pass 17: one-scratch Pipeline Luma Key
- Pass 18: Glitch direct dispatch, source cache, smear workspace, and telemetry
- Pass 19: Syphon UI/poll/client-query reduction and complete output phase telemetry

## Rejected branches

- Pass 12 renderer-window ownership migration: video decode regression
- Pass 13 scheduler consolidation: worse playback and frame pacing

## Next mandatory pass

### Pass 20 — Remaining Canvas2D ceiling review

Use actual profiler data to rank:

- Glitch draw count versus `applyGlitch` time;
- Scanline band count versus pass time;
- Flow tile/grid count versus pass time;
- Solarize and Luma synchronous readback;
- JPEG mirror capture and encode;
- Syphon capture, Worker readback, total pipeline, Metal upload, and publish;
- output disabled versus mirror, Syphon, and combined-output operation.

Only isolated changes with exact parity and immediate rollback boundaries may land.

## Syphon phase-two candidates — held pending measurements

- Worker-owned WebSocket to remove the full RGBA Worker-to-main transfer;
- shared capture only for genuinely compatible mirror/Syphon dimensions and cadence;
- adaptive 30/60 output capability policy;
- additional native texture-upload strategies.

None should land until Pass 19 identifies the real bottleneck and automatic fallback behavior is designed.

## Later mandatory passes

### Pass 21 — Cross-platform stabilization

- macOS WKWebView, Syphon, signing, notarization
- Windows WebView2, Spout, installer, shutdown
- Linux WebKitGTK/GStreamer codecs, audio, camera, packaging, cleanup

### Pass 22 — Capability matrix and soak testing

- 720p30, 720p60, 1080p30, 1080p60
- light, medium, worst-case scenes
- long playback and repeated source switching
- resize/fullscreen cycling
- output disconnect/reconnect
- release-blocking fixes only after freeze

## Acceptance rule

Every pass is compared with the last committed stable baseline. Structural reduction alone is insufficient; visual behavior, playback, and target-runtime reliability must remain equal or improve.
