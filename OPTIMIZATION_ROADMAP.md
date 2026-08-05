# HUFF Classic Optimization Roadmap — After Pass 22

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
- Pass 22: Scanline preparation specialization and exact-horizontal dispatch

## Rejected branches

- Pass 12 renderer-window ownership migration: video decode regression
- Pass 13 scheduler consolidation: worse playback and frame pacing

## Next safe decision gate — Pass 23

### Candidate A — Flow branch specialization

Proceed when Flow time remains high while `flow draws` are moderate.

Safe scope:

- select TURBULENCE/SWIRL/IMPLODE loop variants outside the tile loop;
- retain exact p5 noise call count and order;
- preserve animated vector trigonometry and `Math.fround` quantization;
- preserve source/destination rectangles and tile paint order;
- keep a deterministic old/new draw-operation validator.

### Candidate B — output-capture phase two

Proceed only from measured mirror/Syphon timing.

Potential work behind strict fallbacks:

- Worker-owned Syphon WebSocket to avoid Worker → main-thread RGBA transfer;
- compatible capture sharing only when dimensions and cadence match exactly;
- adaptive output tiers based on measured target capability.

Mandatory boundaries:

- retain one-fps moving-frame bootstrap;
- retain one frame in flight;
- never reintroduce a discoverable-but-black Syphon source.

### Candidate C — temporal history bandwidth

Requires explicit behavior approval because reducing capture while temporal effects are inactive changes immediate PULSE/history response.

Potential investigations:

- resolution-dependent history tiers;
- optional reduced-rate history capture;
- delayed allocation with an explicit warm-up state;
- cross-platform real-memory measurement.

### Candidate D — stabilization and capability matrix

Begin when remaining code-path gains become smaller than runtime variance.

Measure:

- 720p30
- 720p60
- 1080p30
- 1080p60

For each:

- light scene
- moderate scene
- worst-case scene
- mirror off/on
- Syphon or Spout off/on

## Mandatory platform stabilization

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

## Acceptance rule

Every pass is compared against the last committed stable baseline. A structural reduction is retained only when playback, frame pacing, visual output, and output reliability remain equal or improve.
