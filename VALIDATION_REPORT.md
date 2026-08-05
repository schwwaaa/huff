# HUFF Classic Optimization Pass 22 — Validation Report

## Deterministic validator

Command:

```bash
npm run validate:pass22
```

Completed:

```text
12,000 Scanline parameter/resolution cases
760,519 prepared bands
3,802,595 exact prepared-band field comparisons
```

The validator covered all four combinations of:

```text
neutral / active DRIFT
neutral / active SHIFT-SKEW
```

It confirmed:

- identical angle, rotated dimension, and cross span;
- identical accepted band count;
- identical band start and length;
- identical source and destination offsets;
- identical cross length;
- identical p5 noise-call count for every case;
- exact zero-angle transform cancellation.

## Retained validators

The following inherited validators also passed:

- Pass 9 Flow geometry
- Pass 10 Scanline workspace
- Pass 11 neutral-stage behavior
- Pass 13S lifecycle boundaries
- Pass 14 history/copy/physics behavior
- Pass 15 mirror staging
- Pass 16 Solarize pixels
- Pass 16S Syphon bootstrap
- Pass 17 Pipeline Luma Key pixels
- Pass 18 Glitch draw sequence
- Pass 19 Syphon control plane
- Pass 20 hot-path arithmetic
- Pass 21 Flow field cache

## Static validation

Completed:

- 24 external JavaScript and Worker files passed syntax checks;
- 32 inline HTML scripts passed syntax checks;
- 29 project JSON files parsed successfully;
- 1 TOML file parsed successfully;
- 6 shell scripts passed `bash -n`;
- Rust delimiter/lexical checks;
- native-tree comparison against Pass 21;
- Syphon framework presence and architecture verification;
- ZIP integrity test.

## Environment limitation

Cargo and the macOS GUI runtime were not available in this environment. No claim is made for measured target-platform FPS, WKWebView timing, audio behavior, or native Syphon performance. Those require the runtime checklist on the user's Mac.
