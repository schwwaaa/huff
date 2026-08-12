# HUFF Classic Pass 47 — Changed Files

## Runtime

- `src/effects.js`
  - self-calibrating bounded WebGL1 LIVE/COMPOSITE Luma accelerator;
  - lazy alternate alpha-context probe;
  - bounded GPU keyed-patch cache;
  - final 256-entry CPU key LUT;
  - long-edge + pixel-budget Luma workspace sizing.
- `src/canvas.js`
  - profiler telemetry for GPU Luma calibration/path and patch caching.

## Validation

- `scripts/validate-pass47.mjs`
- `package.json` (`validate:pass47`)
- `baseline/pass46-pass47-protected.sha256`

## Documentation

- `HUFF_CLASSIC_EFFECT_AUGMENTATION_PASS_47.txt`
- `LUMA_LIVE_GPU_ACCELERATION_AUDIT.md`
- `CURRENT_STATUS.md`
- `PASS_NOTES.md`
- `CHANGELOG.md`
- `CHANGED_FILES.md`
- `VALIDATION_REPORT.md`
- `TESTING_CHECKLIST.md`
- `OPTIMIZATION_ROADMAP.md`
- `DOCUMENTATION_INDEX.md`
- `README.md`
- `GIT_COMMIT_MESSAGE.md`
