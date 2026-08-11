# Validation Report — HUFF Classic Pass 42

## Baseline

- Source: accepted `huff-08102026.zip` / Pass 41A.
- Product: HUFF Classic only (Tauri v1 + p5.js / Canvas2D).
- Runtime acceptance of Pass 41A was already confirmed on the development machine before this pass.

## Pass 42 deterministic validator

Command:

```bash
npm run validate:pass42
```

Result:

```text
PASS 42 validation: 196,893 checks PASS
196,608 LUMA QUANTIZE pixels byte/word compared
```

The validator checks:

- new UI IDs and compatibility defaults;
- old-preset migration to MODE=THRESHOLD;
- mode-aware activity/no-op behavior;
- exact SHA-256 identity of the four accepted THRESHOLD Solarize helper functions from Pass 41A;
- LUMA QUANTIZE LEVEL/SOFT/INVERT structure;
- LEVEL 99 = two grayscale luma levels;
- LEVEL 100 = grayscale luma removal;
- SOFT 100 no-invert restoration;
- AMOUNT 0 no-op;
- INVERT grayscale reversal;
- alpha preservation;
- exact byte-loop / Uint32-loop parity for 196,608 generated pixels;
- one runtime Solarize `getImageData()` and one `putImageData()` only;
- no second Solarize canvas or new p5 full-resolution surface;
- 640px scratch ceiling and adaptive stride retained;
- exact SHA-256 identity of 220 protected Pass 41A/native files, including pipeline runtime, capability instrumentation, factory presets, and the native Tauri tree (excluding pre-existing `.DS_Store`).

## Inherited Solarize regression validator

Command:

```bash
npm run validate:pass16
```

Result:

```text
Pass 16 validation passed: 644 checks, 8,391,032 exact pixel comparisons
```

This independently reconfirms the packed/byte THRESHOLD Solarize behavior and the Pass 16 readback/presentation optimization boundary after the Pass 42 augmentation.

## Playback-boundary simulation

Command:

```bash
npm run simulate:pass41a
```

Result: **PASS**. The accepted 1080p-class processing ceiling, source-fit calculations, and history-capacity model remain intact.

## Syntax / data checks

- 61 JavaScript/MJS/CJS files: `node --check` PASS.
- 33 JSON files: parse PASS.
- 8 shell scripts: `bash -n` PASS.

## Static release preflight

Command:

```bash
npm run release:preflight
```

Result: **38 passed, 0 warnings, 0 blockers.** The preflight confirms the Tauri v1 release/version configuration, macOS/Syphon assets, Windows/Spout assets, Linux platform configuration, Node/npm availability, and pinned Tauri CLI metadata.

## Native compile status

Cargo/Rust are not installed in this execution environment, so a Tauri native compile was not performed here. Pass 42 does not modify `src-tauri/**`; the protected manifest confirms those native files are byte-identical to the accepted Pass 41A archive.

## Historical Pass 41A validator note

`validate:pass41a` intentionally freezes `src/effects.js` to the Pass 40W hash because Pass 41A was a playback-only change. Pass 42 legitimately modifies the Solarize section of `src/effects.js`, so that historical exact-file validator is no longer the acceptance validator for the current tree. Pass 42 replaces that condition with function-level SHA checks for the original THRESHOLD implementation plus broader protected-file hashing.

## Remaining runtime gate

Static validation cannot certify Canvas2D/WebView appearance or frame pacing. Runtime-test the checklist in `TESTING_CHECKLIST.md` before committing Pass 42 as the next authoritative HUFF Classic baseline.
