# HUFF Classic Optimization Roadmap — After Pass 20

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
- Pass 20: direct hot-path range arithmetic and Scanline/Flow draw-count telemetry

## Rejected branches

- Pass 12 renderer-window ownership migration: video decode regression
- Pass 13 scheduler consolidation: worse playback and frame pacing

## Next decision gate — profiler-guided Pass 21

Pass 20 completes the minimum measurement set needed to compare:

- effect duration versus Glitch artistic draw count;
- effect duration versus Scanline band count;
- effect duration versus Flow tile count;
- synchronous Solarize/Luma phase costs;
- mirror capture/encode costs;
- Syphon capture/readback/upload/publish costs.

The next optimization must target the highest measured cost from the user's Pass 20 runtime test. It must not be chosen solely from static inspection.

### Candidate A — Flow CPU preparation

Proceed only if `applyFlowWarp` remains high after accounting for `flow draws`.

Possible isolated work:

- cache dynamic noise-coordinate bases;
- remove remaining general p5 helper dispatch;
- reduce repeated optional-branch work;
- preserve all noise samples, Float32 quantization, and draw rectangles.

### Candidate B — Scanline Canvas2D dispatch

Proceed only if Scanline time scales strongly with `scan draws`.

Possible isolated work:

- reduce context-state work around the pass;
- investigate safe batching only where source/destination order remains exact;
- retain one draw per visible band unless exact visual equivalence is proven.

### Candidate C — Glitch artistic draw ceiling

Proceed only if `applyGlitch` time is dominated by `gl draws` rather than placement math.

Any reduction in artistic draws would change the image and is therefore outside ordinary optimization. Safe work is limited to dispatch, source lookup, clipping math, and telemetry unless a mathematically exact batching method is demonstrated.

### Candidate D — Syphon phase two

Proceed only from actual Pass 19/20 telemetry.

Candidates held behind a fallback boundary:

- Worker-owned WebSocket to remove Worker → main RGBA transfer;
- adaptive 30/60 output capability policy;
- additional native upload strategies;
- shared capture only when output dimensions and cadence are genuinely compatible.

The one-fps bootstrap and moving-frame startup repair are mandatory and may not regress.

## Later mandatory passes

### Cross-platform stabilization

- macOS WKWebView, Syphon, signing, notarization
- Windows WebView2, Spout, installer, shutdown
- Linux WebKitGTK/GStreamer codecs, audio, camera, packaging, cleanup

### Capability matrix and soak testing

- 720p30, 720p60, 1080p30, 1080p60
- light, medium, worst-case scenes
- long playback and repeated source switching
- resize/fullscreen cycling
- output disconnect/reconnect
- release-blocking fixes only after freeze

## Acceptance rule

Every pass is compared with the last committed stable baseline. Structural reduction alone is insufficient; visual behavior, playback, and target-runtime reliability must remain equal or improve.
