# HUFF Classic Optimization Pass 26 — Changed Files

## Runtime files

```text
src/pipeline-runtime.js
src/canvas.js
```

### `src/pipeline-runtime.js`

- advanced the constrained pipeline runtime to version 2;
- added the immutable front-stage group and mode contract;
- added exact Pass 22 priority-contract validation;
- added the allocation-free priority-order resolver;
- added the one-time front-stage group compiler;
- attached the validated priority contract to the existing front-overlays recipe step.

### `src/canvas.js`

- split the existing front-stage renderer into stable Glitch/Luma and Scanline group handlers;
- compiled those handlers once through `compileFrontStagePriority()`;
- replaced the inline `glitchOnTop` calculation with the validated plan;
- retained the existing priority inputs, contribution values, and render-frame timing.

## Contract, validation, and package metadata

```text
pipeline/stage-contracts.mjs
baseline/pass25-src.sha256
scripts/validate-pass25.mjs
scripts/validate-pass26.mjs
package.json
```

- the source contract now records the existing fallback and pulse constants;
- the Pass 25 validator accepts later compatible pipeline-runtime versions while retaining its original serial-foundation checks;
- the new Pass 26 validator proves priority parity and constrained file integrity;
- `package.json` exposes `npm run validate:pass26`.

## Documentation

```text
DOCUMENTATION_INDEX.md
PASS_NOTES.md
CHANGELOG.md
CHANGED_FILES.md
TESTING_CHECKLIST.md
VALIDATION_REPORT.md
CURRENT_STATUS.md
OPTIMIZATION_ROADMAP.md
GIT_COMMIT_MESSAGE.md
BASELINE_INTEGRITY_MANIFEST.md
STAGE_CONTRACT_REGISTRY.md
FRONT_STAGE_PRIORITY_FORMALIZATION_AUDIT.md
HUFF_CLASSIC_OPTIMIZATION_PASS_26.txt
README.md
```

## Explicitly unchanged

```text
src/effects.js
src/index.html
src/canvas.html
src/presets/**
src/midi/**
src/osc/**
src-tauri/**
```

Flow, every effect algorithm, every control, every preset, media loading, clocks, FrameRing capture, mirror, Syphon, Spout, and native packaging remain unchanged.
