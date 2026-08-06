# HUFF Classic Optimization Pass 30 — Changed Files

## Browser runtime

- `src/pipeline-runtime.js`
  - adds two immutable validated recipe definitions;
  - compiles a recipe registry once at startup;
  - adds atomic recipe switching and `CLASSIC` fallback.
- `src/canvas.js`
  - selects one plan before frame dispatch;
  - uses the selected plan for the complete frame;
  - saves route selection in presets and undo;
  - migrates legacy/unknown preset routes to `CLASSIC`.
- `src/index.html`
  - adds the `PIPELINE / RECIPE` selector with `CLASSIC` and `CRISP FINISH`.

## Source contracts

- `pipeline/stage-contracts.mjs`
  - adds the `final-overlays` zone;
  - permits the existing front overlay members in that zone;
  - declares both recipe skeletons and their fixed resource budgets.

## Validation and metadata

- `scripts/validate-pass30.mjs`
- `package.json`
- `baseline/pass30-src.sha256`
- `baseline/pass30-src-tauri.sha256`

## Documentation

- `PIPELINE_SWITCHING_FOUNDATION_AUDIT.md`
- `HUFF_CLASSIC_OPTIMIZATION_PASS_30.txt`
- complete updated documentation suite

## Explicitly unchanged

```text
src/effects.js
src/capability-instrumentation.js
src/canvas.html
src/presets/**
src-tauri/**
Flow algorithm and controls
all effect algorithms
video decoder and source lifecycle
FrameRing capture and memory policy
render / transport / output clocks
mirror / Syphon / Spout runtime
shutdown behavior
platform packaging definitions
full-resolution buffer count
```
