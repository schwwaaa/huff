# HUFF Classic Optimization Pass 18 — Validation Report

## Deterministic Pass 18 validator

Command:

```bash
npm run validate:pass18
```

Result:

```text
4,832 checks
3,474,837 exact draw operations compared
```

The validator compares the previous and optimized Glitch blit preparation paths across randomized:

- ring capacities and fill levels;
- history indices;
- render dimensions;
- BLOCK and SIZE values;
- SMEAR lengths and directions;
- base offsets;
- tile positions.

It compares the complete ordered Canvas2D draw argument sequence:

```text
source reference
source x/y/width/height
destination x/y/width/height
base and smear draw order
```

It also verifies:

- zero ring lookups when a cached generation is reused;
- cache rebuild after every new ring push;
- stable decoder and scheduler boundaries;
- retained Pass 16S Syphon bootstrap structure.

## Retained deterministic validators

- Pass 9 Flow: 1,728 cases; 4,385,502 exact tile comparisons
- Pass 10 Scanlines: 2,400 cases; 28,342 exact band comparisons
- Pass 11 neutral-stage validation: passed
- Pass 13S lifecycle validation: 27 checks passed
- Pass 14 ring/copy/physics validation: 31,497 checks passed
- Pass 15 mirror validation: 38 checks passed
- Pass 16 Solarize validation: 644 checks; 8,391,032 exact pixel comparisons
- Pass 16S Syphon bootstrap validation: 22 checks passed
- Pass 17 Luma Key validation: 1,293 checks; 17,715,200 exact pixel comparisons

## Static validation

Completed:

- 20 external JavaScript/module files passed syntax validation;
- 25 HTML files were scanned and 32 inline scripts passed syntax validation;
- 29 JSON files parsed successfully;
- 2 TOML files parsed successfully;
- 6 shell scripts passed `bash -n`;
- 4 Rust files passed lexical delimiter validation;
- mandatory Syphon framework presence verified;
- the framework binary remains universal `x86_64 + arm64`;
- ZIP integrity verification is performed after packaging.

## Native boundary

The complete `src-tauri` tree is byte-for-byte unchanged from Pass 17.

Cargo and a macOS GUI runtime are unavailable in this environment, so the following were not performed here:

- Tauri/Rust compilation;
- real WKWebView frame-time measurement;
- visual output comparison;
- OBS/Syphon runtime testing;
- Windows Spout testing;
- Linux media testing.

## Claim boundary

The report proves ordered-operation equivalence for the modeled Glitch hot-path changes. It does not claim a measured FPS improvement on target hardware. Runtime performance must be compared against committed Pass 17 with the profiler hidden and visible.
