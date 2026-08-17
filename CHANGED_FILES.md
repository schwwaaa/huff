# HUFF Classic Pass 51 — Changed Files

## Runtime / UI

- `src/index.html`
  - removes 1080p from Classic Syphon;
  - makes 1280×720/60 the default and 1280×720/30 the safe mode;
  - separates requested rate from effective fallback rate;
  - decouples worker-direct browser capture from native ACK release;
  - retains one-frame-in-flight behavior for Pass 49 fallback;
  - adds Worker credit/capacity handling.
- `src/syphon-stream-worker.js`
  - owns a strict two-credit native pipeline;
  - consumes native ACKs directly;
  - drops third output opportunities rather than queueing;
  - bounds WebSocket buffering;
  - owns direct-path ACK timeout recovery;
  - aggregates compact controls-side status/profiling reports;
  - retains full-pixel Pass 49 fallback mode.
- `src/canvas.js`
  - adds Syphon credit-pressure / outstanding-depth profiler diagnostics.

## Validation

- `scripts/validate-pass49.mjs` — updates retained stability checks for the Pass 51 720p-only product boundary.
- `scripts/simulate-pass50-syphon-worker.mjs` — adds timer mocks required by the Pass 51 Worker while retaining the Pass 50 direct/fallback test.
- `scripts/validate-pass51.mjs`
- `scripts/simulate-pass51-syphon-pipeline.mjs`
- `package.json`
- `baseline/pass48-pass51-protected.sha256`

## Documentation

- `HUFF_CLASSIC_OPTIMIZATION_PASS_51.txt`
- `SYPHON_720P60_PIPELINE_AUDIT.md`
- `CURRENT_STATUS.md`
- `PASS_NOTES.md`
- `CHANGELOG.md`
- `OPTIMIZATION_ROADMAP.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `DOCUMENTATION_INDEX.md`
- `GIT_COMMIT_MESSAGE.md`
- `README.md`
- `docs/docs/output.html`, `docs-v1/docs/output.html`
- `docs/docs/how-it-works.html`, `docs-v1/docs/how-it-works.html`
- `docs/docs/caveats.html`, `docs-v1/docs/caveats.html`

## Deliberately unchanged

- `src-tauri/src/main.rs`
- `src-tauri/src/syphon.rs`
- `src/effects.js`
- `src/pipeline-runtime.js`
- Spout runtime
