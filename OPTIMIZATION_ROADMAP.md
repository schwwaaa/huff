# HUFF Classic Optimization Roadmap — After Pass 21

## Completed and retained

- Passes 1–4: bounded transport, reusable resources, native output foundations, framework packaging
- Pass 5: full-frame copy, Flow, Solarize, Luma, and Feedback hot paths
- Pass 6: typed render-state cache
- Pass 7: reusable Glitch placement workspaces
- Pass 8: consolidated full-resolution Canvas2D buffers
- Pass 9: Flow static geometry cache, ring context reuse, receiver-aware mirror
- Pass 10: Scanline typed workspace
- Pass 11: neutral-stage and clean-path bypass
- Pass 12R: restored working Blob URL decoder
- Pass 13S: lifecycle hardening without frame-clock changes
- Pass 14: exact-size copies and history backing-store release
- Pass 15: bounded mirror ImageBitmap staging
- Pass 16/16S: Solarize optimization and bootstrap-safe Syphon publication
- Pass 17: one-scratch Pipeline Luma Key
- Pass 18: Glitch dispatch/source/smear optimization
- Pass 19: Syphon control-plane reduction and phase telemetry
- Pass 20: direct hot-path range arithmetic and draw-count telemetry
- Pass 21: Flow frequency, SWIRL, clipping-bound, and typed-field caching

## Rejected branches

- Pass 12 renderer-window ownership migration: video decode regression
- Pass 13 scheduler consolidation: worse playback and frame pacing

## Next safe decision gate — Pass 22

Use the Pass 21 profiler to rank the remaining costs.

### Candidate A — Scanline dispatch/state reduction

Proceed when Scanline remains expensive relative to `scan draws`.

Safe scope:

- remove redundant context-state restoration where ownership is already known;
- cache source/destination clipping constants;
- reduce repeated branch/property work;
- preserve one draw per visible band, noise order, and paint order.

### Candidate B — Flow branch specialization

Proceed when Flow CPU time remains high after Pass 21 while `flow draws` are moderate.

Safe scope:

- select specialized loops for TURBULENCE/SWIRL/IMPLODE combinations outside the tile loop;
- preserve exact formulas, noise calls, Float32 quantization, and draw rectangles;
- retain the generic path as a fallback during validation.

### Candidate C — output-capture phase two

Proceed only from measured mirror/Syphon timings.

Potential work behind strict fallbacks:

- Worker-owned Syphon WebSocket to avoid Worker → main RGBA transfer;
- compatible capture sharing when dimensions and cadence match exactly;
- adaptive output capability tiers.

The one-fps Syphon bootstrap and moving-frame startup repair are mandatory.

### Candidate D — temporal history bandwidth

Investigate only with explicit behavior approval because reducing inactive history capture can change immediate PULSE/temporal-effect response.

## Mandatory stabilization passes

### macOS

- WKWebView soak tests
- Syphon reconnect and endurance
- universal bundle verification
- signing and notarization

### Windows

- WebView2 playback and Canvas2D parity
- Spout validation
- installer and shutdown testing

### Linux

- WebKitGTK/GStreamer codec matrix
- camera and audio validation
- AppImage/deb packaging
- process cleanup

## Capability matrix

Measure, do not assume:

- 720p30
- 720p60
- 1080p30
- 1080p60

For each:

- light scene
- moderate scene
- worst-case scene
- mirror disabled/enabled
- Syphon or Spout disabled/enabled

## Acceptance rule

Every pass is compared with the last committed stable baseline. A structural reduction is not sufficient: playback, visual output, frame pacing, and output reliability must remain equal or improve.
