# HUFF Classic Optimization Pass 25 — Changed Files

## Runtime files

```text
src/pipeline-runtime.js
```

New browser-side immutable recipe validation and one-time stage-handler compilation.

```text
src/canvas.js
```

Existing stage implementations are now declared as stable handlers and dispatched through the compiled Pass 22 recipe. Effect algorithms and controls are unchanged.

```text
src/index.html
```

Loads `pipeline-runtime.js` before `effects.js` and `canvas.js`.

## Validation and package metadata

```text
scripts/validate-pass25.mjs
package.json
baseline/pass24-src.sha256
```

## Documentation

```text
DOCUMENTATION_INDEX.md
PASS_NOTES.md
SERIAL_RECIPE_FOUNDATION_AUDIT.md
CHANGELOG.md
CHANGED_FILES.md
TESTING_CHECKLIST.md
VALIDATION_REPORT.md
CURRENT_STATUS.md
OPTIMIZATION_ROADMAP.md
GIT_COMMIT_MESSAGE.md
HUFF_CLASSIC_OPTIMIZATION_PASS_25.txt
README.md
```

## Explicitly unchanged

```text
src/effects.js
src/presets/*
complete src-tauri/ tree
Flow controls and implementation
media loading and lifecycle
FrameRing capture behavior
render / transport / mirror / profiler clocks
mirror / Syphon / Spout implementations
```
