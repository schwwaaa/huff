# HUFF Classic Pass 20 — Changed Files

## Runtime source

### `src/effects.js`

- Replaced p5 `map()` calls in active Scanline and Glitch paths with exact direct arithmetic.
- Prepared Scanline shift span outside the band loop.
- Prepared Glitch jitter range outside the tile loop.
- Added profiler-gated Scanline band/draw counters.
- Added profiler-gated Flow tile/draw/grid-cache counters.
- Made Flow grid configuration return whether geometry was rebuilt for telemetry.

### `src/canvas.js`

- Replaced persistence-decay p5 `map()` with exact direct arithmetic.
- Added Scanline and Flow profiler snapshot/delta/display handling.

## Validation

### `scripts/validate-pass20.mjs`

- Enforces removal of the legacy hot-path p5 `map()` calls.
- Checks required Pass 20 telemetry boundaries.
- Performs 2,500,000 exact arithmetic comparisons.

### `package.json`

- Added `npm run validate:pass20`.

## Documentation

- `PASS_NOTES.md`
- `HOT_PATH_MATH_AND_CEILING_AUDIT.md`
- `CHANGED_FILES.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `CURRENT_STATUS.md`
- `CHANGELOG.md`
- `OPTIMIZATION_ROADMAP.md`
- `GIT_COMMIT_MESSAGE.md`
- `DOCUMENTATION_INDEX.md`
- `HUFF_CLASSIC_OPTIMIZATION_PASS_20.txt`
- `README.md`

## Explicitly unchanged

- complete `src-tauri` tree;
- `src/syphon-stream-worker.js`;
- native Syphon and Spout implementation;
- bundled `Syphon.framework` binary;
- media-loading and source-lifecycle code;
- frame scheduling;
- effect order and controls;
- presets, MIDI, and OSC.
