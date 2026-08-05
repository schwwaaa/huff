# HUFF Classic — Current Status After Optimization Pass 20

## Current baseline

**HUFF Classic Optimization Pass 20** is the current candidate baseline.

It branches directly from the runtime-confirmed Pass 19 package. Pass 20 must still be compared against Pass 19 on the target Mac before it becomes the next committed stable baseline.

## Confirmed stable foundation inherited from Pass 19

- working Blob URL + p5 `createVideo()` decode path;
- independent p5, transport, mirror, and profiler schedules;
- source-generation and shutdown cleanup from Pass 13S;
- consolidated `gCur`, `gBuf`, and shared `gScratch` topology;
- canvas-backed bounded temporal history;
- optimized Flow, Scanline, Glitch, Solarize, and Pipeline Luma paths;
- neutral-stage and clean-frame bypass;
- receiver-aware JPEG mirror;
- working Pass 16S Syphon bootstrap;
- Pass 19 Syphon control-plane reduction and phase telemetry;
- mandatory bundled universal Syphon framework.

## Pass 20 candidate changes

- direct unit-range arithmetic replaces p5 `map()` in active persistence, Scanline shift, Glitch smear, and Glitch tile-jitter paths;
- exact old/new arithmetic validated over 2,500,000 comparisons;
- profiler-only Scanline band/draw telemetry;
- profiler-only Flow tile/draw/grid-cache telemetry.

## Rejected architecture remains rejected

- Pass 12 renderer-window decode ownership;
- Tauri asset-protocol replacement for Blob URL video loading;
- Pass 13 render-boundary scheduler consolidation;
- transport, mirror, or profiler work inside `draw()`.

## Remaining performance boundary

The dominant remaining work is increasingly the artistic Canvas2D workload itself:

- Glitch base and smear draws;
- Scanline band draws;
- Flow tile draws and per-tile noise/trigonometry;
- synchronous Solarize and Luma readback;
- mirror/Syphon/Spout capture and upload.

The new profiler fields are intended to identify which of these dominates on the actual target system.

## Release readiness

Not release-frozen yet. Cross-platform runtime validation, capability tiers, long-session soak testing, packaging, signing, and shutdown testing remain mandatory.
