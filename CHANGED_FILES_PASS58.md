# HUFF Classic — Changed Files — Pass 58

Baseline: Pass 57 / Git `1049d8c`

## Runtime/UI

### `src/pipeline-runtime.js`
- Adds five constrained serial recipes.
- Preserves CLASSIC and CRISP FINISH.
- Adds recipe-owned operator diagram metadata.
- Expands legal serial zones without adding branches/cycles/resources.
- Validates diagram order against executable order.
- Keeps exactly three full-resolution buffers and `gScratch` as the only declared scratch resource.

### `src/canvas.js`
- Accepts recipe IDs directly from the runtime registry for preset loading.
- Renders the selected recipe's mini routing diagram.
- Preserves existing quick-route text and image-feed awareness.
- Carries the selected recipe ID on the current pipeline frame.
- Restricts the old Global Mix/Solarize fusion proof to CLASSIC and CRISP FINISH.
- Does not modify Feedback, Flow, Symmetry, Solarize, or Presentation handler implementations.

### `src/index.html`
- Adds the five new recipe choices.
- Adds the minimal dynamic routing-diagram container/styling below Pipeline.
- Keeps existing three-source feed awareness.

## Validation

### `scripts/validate-pass58.mjs`
- Validates exact seven-recipe registry and execution order.
- Executes compiled recipes with mock handlers.
- Validates three-buffer/no-cycle declarations.
- Validates diagram/execution agreement.
- Protects accepted effect implementations and unchanged native/output files.
- Validates preset registry compatibility and diagram UI wiring.

### `scripts/run-pass58-regression.mjs`
- Current Pass 58 regression runner.

### `package.json`
- Adds `validate:pass58`.
- Adds `regress:pass58`.

### `baseline/pass57-pass58-protected.sha256`
- Records exact Pass 57 hashes for protected effect/native-output files that must remain byte-identical through Pass 58.

## Documentation

- `HUFF_CLASSIC_PIPELINE_RECIPE_PASS_58.txt`
- `PIPELINE_RECIPE_EXPANSION_AUDIT.md`
- `CHANGED_FILES_PASS58.md`
- `CURRENT_STATUS.md`
- `VALIDATION_REPORT.md`
- `TESTING_CHECKLIST.md`
- `RELEASE_KNOWN_ISSUES.md`
- `OPTIMIZATION_ROADMAP.md`
- `PASS_NOTES.md`
- `CHANGELOG.md`
- `DOCUMENTATION_INDEX.md`
- `CHANGED_FILES.md`
- `GIT_COMMIT_MESSAGE.md`

## Explicitly unchanged

- `src/effects.js`
- `src/syphon-stream-worker.js`
- `src-tauri/src/main.rs`
- `src-tauri/src/syphon.rs`
- Flow effect math
- Feedback effect math
- Symmetry effect math
- Solarize effect math
- preset native file I/O
- Syphon / Spout architecture
