# Changed Files — Pass 42

## Runtime
- `src/index.html`
  - adds Solarize MODE, LEVEL, SOFT and INVERT controls;
  - THRESHOLD remains selected by default;
  - irrelevant controls are disabled per mode for legibility.
- `src/canvas.js`
  - adds new Solarize fields to render state, presets and undo;
  - migrates old presets explicitly to THRESHOLD;
  - adds mode-aware no-op detection;
  - dispatches the selected Solarize algorithm.
- `src/effects.js`
  - retains the existing THRESHOLD implementation;
  - adds bounded LUMA QUANTIZE lookup/transform inside the same Solarize readback pass;
  - preserves alpha and chroma channel differences before gamut clipping.

## Control / public reference docs
- `src/midi/FORMAT.md`
- `src/osc/FORMAT.md`
- `README.md`
- `docs/docs/parameter-reference.html`
- `docs-v1/docs/parameter-reference.html`
- `docs/docs/interface.html`
- `docs-v1/docs/interface.html`

## Validation
- `package.json`
- `scripts/validate-pass42.mjs`
- `baseline/pass41a-pass42-protected.sha256`

## Pass documentation
- `HUFF_CLASSIC_EFFECT_AUGMENTATION_PASS_42.txt`
- `SOLARIZE_LUMA_QUANTIZE_AUDIT.md`
- `DOCUMENTATION_INDEX.md`
- `PASS_NOTES.md`
- `CHANGELOG.md`
- `CHANGED_FILES.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `CURRENT_STATUS.md`
- `OPTIMIZATION_ROADMAP.md`
- `GIT_COMMIT_MESSAGE.md`

## Explicitly unchanged / protected runtime
- `src/pipeline-runtime.js`
- `src/capability-instrumentation.js`
- `src/presets/*.json`
- `src-tauri/**`
- Flow implementation and controls
- Feedback / Corrupt / Scan / Luma algorithms
