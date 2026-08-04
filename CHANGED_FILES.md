# HUFF Classic Pass 17 — Changed Files

## Runtime changes

### `src/effects.js`

- Replaced the two-canvas Pipeline Luma Key rebuild with one bounded readback/patch canvas.
- Added packed and byte-fallback alpha transforms.
- Added profiler-gated Luma Key phase telemetry.

### `src/canvas.js`

- Added profiler display rows for Luma Key readback, transform, upload, presentation, and cache reuse.
- No render scheduling, media loading, mirror scheduling, or source lifecycle code changed.

## Validation/tooling changes

### `scripts/validate-pass17.mjs`

- Added structural boundary checks.
- Added two-canvas-reference versus direct-patch pixel comparisons.
- Added opaque, partial-alpha, threshold-boundary, and invert coverage.

### `package.json`

- Added `npm run validate:pass17`.

## Documentation changes

- `PASS_NOTES.md`
- `PIPELINE_LUMA_KEY_AUDIT.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `CURRENT_STATUS.md`
- `CHANGELOG.md`
- `OPTIMIZATION_ROADMAP.md`
- `GIT_COMMIT_MESSAGE.md`
- `DOCUMENTATION_INDEX.md`
- `HUFF_CLASSIC_OPTIMIZATION_PASS_17.txt`

## Verified unchanged from Pass 16S

- Entire `src-tauri` tree
- `src/index.html` Syphon sender
- `src/syphon-stream-worker.js`
- Spout implementation
- `Syphon.framework` binary
- Blob URL + p5 `createVideo()` decoder path
- Independent p5, transport, mirror, and profiler clocks
