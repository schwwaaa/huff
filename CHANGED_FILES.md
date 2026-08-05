# HUFF Classic Pass 19 — Changed Files

## Runtime

### `src/index.html`

- Coalesces Syphon status UI updates to four hertz.
- Avoids DOM assignments when the displayed values are unchanged.
- Caches the selected Syphon FPS.
- Suspends redundant Tauri runtime-state polling while acknowledgements are healthy.
- Removes duplicate runtime-state application.
- Sends the fallback RGBA `ArrayBuffer` directly.
- Adds profiler-gated capture, pipeline, skip, and UI counters.
- Receives sampled native upload/publish timings.

### `src/syphon-stream-worker.js`

- Adds profiler-gated OffscreenCanvas draw and `getImageData` phase timing.
- Returns only small timing fields alongside the existing transferable RGBA buffer.

### `src/canvas.js`

- Adds Syphon output telemetry to the existing backtick profiler.
- Reports capture, Worker draw/readback, end-to-end pipeline, native upload/publish, backpressure skips, and UI update counts.

### `src-tauri/src/main.rs`

- Caches positive Syphon receiver state per dedicated sender connection.
- Samples `hasClients` at four hertz while connected and every bootstrap frame while disconnected.
- Samples native timing every 30 published frames.
- Keeps ordinary acknowledgements compact and adds timing fields only to sampled acknowledgements.

### `src-tauri/src/syphon.rs`

- Adds a profiled push result containing publication state and sampled native timing.
- Measures Metal upload and publish phases only when requested by the relay.
- Retains the original `push_pixels()` API for legacy packet support.

## Validation

### `scripts/validate-pass19.mjs`

- Enforces the stable decoder, independent clocks, bootstrap, and publication boundaries.
- Verifies browser UI/polling reductions.
- Verifies Worker and native phase telemetry.
- Models connected receiver queries and status UI writes at 30 and 60 fps.
- Verifies disconnected bootstrap frames continue checking receiver state.

### `package.json`

- Adds `npm run validate:pass19`.

## Documentation

- `PASS_NOTES.md`
- `SYPHON_OUTPUT_BUDGET_AUDIT.md`
- `CHANGED_FILES.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `CURRENT_STATUS.md`
- `CHANGELOG.md`
- `OPTIMIZATION_ROADMAP.md`
- `GIT_COMMIT_MESSAGE.md`
- `DOCUMENTATION_INDEX.md`
- `HUFF_CLASSIC_OPTIMIZATION_PASS_19.txt`
