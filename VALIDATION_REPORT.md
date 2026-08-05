# HUFF Classic Optimization Pass 21 — Validation Report

**Date:** 2026-08-05

## Deterministic Pass 21 validator

Command:

```bash
npm run validate:pass21
```

Result:

```text
Pass 21 validation passed:
32 source/cache-boundary checks
5,000 randomized Flow cases
4,417,878 exact field, noise-coordinate, and draw-rectangle comparisons
```

Coverage includes:

- frequency-cache rebuild and reuse;
- equivalent clamped SPREAD keys;
- SWIRL-cache rebuild and reuse;
- grid-generation invalidation;
- primary noise-coordinate fields;
- turbulence-coordinate fields;
- radial SWIRL cosine/sine fields;
- maximum source clipping bounds;
- exact primary and turbulence noise arguments;
- Float32-equivalent displacement quantization;
- final source and destination draw rectangles.

## Retained deterministic validators

Passed:

- Pass 9 Flow geometry and draw comparison
- Pass 10 Scanline preparation comparison
- Pass 11 neutral-stage validation
- Pass 13S lifecycle-boundary validation
- Pass 14 history/copy/physics validation
- Pass 15 mirror staging validation
- Pass 16 Solarize pixel comparison
- Pass 16S Syphon bootstrap validation
- Pass 17 Pipeline Luma Key pixel comparison
- Pass 18 Glitch ordered draw comparison
- Pass 19 Syphon control-plane validation
- Pass 20 exact hot-path arithmetic comparison

## Static validation

Passed:

- 23 external JavaScript/Worker/module files;
- 25 HTML files and 32 inline scripts;
- 29 JSON files;
- 1 TOML file;
- 6 shell scripts;
- 4 Rust files through lexical/delimiter checks;
- mandatory Syphon framework presence;
- universal `x86_64 + arm64` Syphon binary verification;
- ZIP integrity.

## Native limitation

Cargo and the macOS GUI runtime are unavailable in this environment. The Tauri application, WKWebView frame pacing, audio, and live Syphon/OBS output require the user's target Mac.

## Claims boundary

The report proves deterministic arithmetic and draw-rectangle equivalence for the tested cases. It does not claim a measured FPS increase.
