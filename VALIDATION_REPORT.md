# HUFF Classic Pass 20 — Validation Report

## Pass-specific deterministic validation

Command:

```bash
npm run validate:pass20
```

Result:

```text
Pass 20 validation passed: 27 checks, 2,500,000 exact arithmetic comparisons
```

Covered:

- persistence-decay range conversion;
- Scanline shift conversion with positive and negative ranges;
- Glitch smear X/Y conversion;
- Glitch smear-angle jitter;
- Glitch per-tile jitter for block sizes 1–512;
- source tokens enforcing removal of the old p5 `map()` calls;
- profiler gating and Scanline/Flow telemetry presence.

## Retained deterministic validators

Passed:

- Pass 9 Flow geometry and displacement equivalence: 4,385,502 comparisons
- Pass 10 Scanline band equivalence: 28,342 comparisons
- Pass 11 neutral-stage and bypass validation
- Pass 13S lifecycle-boundary validation
- Pass 14 ring/copy/cluster validation: 31,497 checks
- Pass 15 mirror staging validation: 38 checks
- Pass 16 Solarize validation: 8,391,032 pixel comparisons
- Pass 16S Syphon bootstrap validation: 22 checks
- Pass 17 Pipeline Luma Key validation: 17,715,200 pixel comparisons
- Pass 18 Glitch ordered-draw validation: 3,474,837 comparisons
- Pass 19 Syphon control-plane validation: 56 checks

## Static source validation

Completed:

- all project JavaScript and Worker files passed `node --check`;
- all inline HTML scripts passed JavaScript syntax validation;
- all project JSON files parsed;
- TOML files parsed with Python `tomllib`;
- shell scripts passed `bash -n`;
- ZIP integrity passed;
- bundled `Syphon.framework` executable remains present;
- native source was not modified from Pass 19.

## Environment limitation

Cargo and the target macOS Tauri/WKWebView runtime are unavailable in this environment. No claim is made that static validation substitutes for application runtime testing.

Required runtime evidence is listed in `TESTING_CHECKLIST.md`.
