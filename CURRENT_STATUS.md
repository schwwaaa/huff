# HUFF Classic — Current Status After Optimization Pass 22

## Current candidate baseline

**HUFF Classic Optimization Pass 22** branches directly from the user-confirmed working Pass 21 package.

Pass 22 is a focused Scanline CPU/state-dispatch optimization. It does not change media loading, frame scheduling, canvas-buffer ownership, output transport, or artistic draw count.

## Confirmed inherited foundation

- Blob URL + p5 `createVideo()` decoder
- independent p5, transport, mirror, and profiler clocks
- Pass 13S source lifecycle cleanup
- consolidated full-resolution Canvas2D buffers
- bounded canvas-backed temporal history
- neutral-stage bypasses
- optimized Glitch, Flow, Solarize, Luma, mirror, and Syphon paths
- Pass 16S Syphon bootstrap repair
- Pass 19 Syphon control-plane reduction
- Pass 20 hot-path arithmetic reductions
- Pass 21 Flow field caching
- mandatory universal `Syphon.framework`

## Pass 22 candidate changes

- four Scanline preparation variants selected outside the band loop;
- cached phase and focus scalars;
- direct neutral-shift rectangle preparation;
- local typed-array references during band dispatch;
- exact-horizontal direct Canvas2D path;
- cached transform constants;
- profiler telemetry for geometry, preparation, and dispatch path;
- deterministic Pass 22 validator.

## Rejected architecture remains rejected

- renderer-window video ownership;
- Tauri asset-protocol replacement for Blob URL media;
- render-boundary scheduler consolidation;
- transport, mirror, or profiler work inside `draw()`.

## Remaining optimization boundary

The largest remaining costs are increasingly irreducible or require measured decision gates:

- one Canvas2D draw per visible Scanline band;
- one Canvas2D draw per Flow tile;
- Glitch tile and smear draw volume;
- Solarize/Luma synchronous readback;
- temporal-history full-frame copy bandwidth;
- independent mirror/Syphon/Spout capture paths.

## Release readiness

Not release-frozen. Cross-platform runtime validation, capability tiers, long-session soak testing, packaging, signing/notarization, and process-cleanup testing remain mandatory.
