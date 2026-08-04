# HUFF Classic Pass 17 — Validation Report

## Deterministic validator

Command:

```bash
npm run validate:pass17
```

Result:

```text
Pass 17 validation passed: 1,293 checks, 17,715,200 exact pixel comparisons
```

The validator covers:

- stable Blob URL + p5 decoder ownership;
- independent render, transport, mirror, and profiler clocks;
- continued Pass 16S Syphon bootstrap behavior;
- removal of the second Luma Key scratch canvas;
- removal of the separate `destination-in` pass;
- decoded-frame, threshold, and invert cache keys;
- packed and byte-oriented transform paths;
- exact RGB preservation;
- opaque and partial-alpha behavior;
- all public threshold steps for grayscale boundary samples;
- both invert states;
- profiler-only phase instrumentation.

## Precision correction discovered during validation

An initial implementation simplified the inverted clean-alpha expression algebraically. The boundary tests found a one-byte mismatch at an exact threshold due to floating-point cancellation. The implementation was corrected to retain the original operation order before packaging.

## Additional validation

The complete retained validator suite was rerun:

- Pass 9 Flow equivalence
- Pass 10 Scanline equivalence
- Pass 11 neutral-stage logic
- Pass 13S lifecycle boundaries
- Pass 14 history/copy/cluster behavior
- Pass 15 mirror staging
- Pass 16 Solarize pixel equivalence
- Pass 16S Syphon bootstrap policy
- Pass 17 Pipeline Luma Key equivalence

Also checked:

- 19 external JavaScript/module files passed syntax validation;
- 32 inline HTML scripts passed syntax validation;
- 29 JSON files parsed successfully;
- 1 TOML file parsed successfully;
- 6 shell scripts passed `bash -n`;
- ZIP integrity passed;
- the entire `src-tauri` tree is byte-for-byte unchanged from Pass 16S;
- the Syphon framework binary is unchanged with SHA-256 `6e2a8c948824da62b24eb2139ec28ba635a0a70f31d6b0480adcfb890710d7eb`;
- the framework remains a universal Mach-O binary containing `x86_64` and `arm64`.

## Environment limitation

Cargo and the macOS Tauri/OBS runtime are unavailable in this environment. Native compilation, WKWebView timing, visual parity, audio behavior, and live Syphon output require target-machine testing.
