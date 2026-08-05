# HUFF Classic — Current Status After Optimization Pass 21

## Current candidate baseline

**HUFF Classic Optimization Pass 21** branches directly from the user-confirmed working Pass 20 package.

Pass 21 is a focused Flow CPU-preparation optimization. It does not change media loading, frame scheduling, native output behavior, or artistic draw count.

## Confirmed stable inherited foundation

- Blob URL + p5 `createVideo()` decoder
- independent p5, transport, mirror, and profiler clocks
- Pass 13S source lifecycle cleanup
- consolidated full-resolution Canvas2D buffers
- bounded canvas-backed temporal history
- neutral-stage bypasses
- optimized Scanline, Glitch, Solarize, Luma, mirror, and Syphon paths
- Pass 16S Syphon bootstrap repair
- Pass 19 Syphon control-plane reduction
- Pass 20 hot-path arithmetic reductions
- mandatory universal `Syphon.framework`

## Pass 21 candidate changes

- persistent SPREAD-dependent Flow noise-coordinate fields;
- persistent TURBULENCE-coordinate fields;
- persistent SWIRL sine/cosine fields;
- cached source clipping bounds;
- local typed-array references in the Flow tile loop;
- frequency and SWIRL cache telemetry;
- deterministic Pass 21 validator.

## Rejected architecture remains rejected

- renderer-window video ownership;
- Tauri asset-protocol replacement for Blob URL media;
- render-boundary scheduler consolidation;
- transport, mirror, or profiler work inside `draw()`.

## Remaining optimization boundary

The major remaining costs are now increasingly irreducible Canvas2D work:

- one or two p5 noise samples per Flow tile;
- animated Flow vector trigonometry;
- one Flow `drawImage()` per tile;
- Glitch and Scanline artistic draw volume;
- Solarize/Luma synchronous readback;
- independent mirror/Syphon/Spout capture and upload.

## Release readiness

Not release-frozen. Cross-platform runtime validation, capability tiers, long-session soak testing, packaging, signing/notarization, and process-cleanup testing remain mandatory.
