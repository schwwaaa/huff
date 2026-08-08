# Changed Files — Pass 36

## Runtime

```text
src/effects.js
src/canvas.js
```

### `src/effects.js`
- rebased LIVE Luma implementation;
- fixed stencil alpha rebuild semantics;
- separated STENCIL mask cache from LIVE patch cache;
- added explicit cache invalidation API;
- added guarded capture/readback failure behavior.

### `src/canvas.js`
- removed Pass 35 Luma analysis gate and its lifecycle resets;
- restored decoded-frame `_vfc` serial for LIVE Luma;
- added explicit Luma cache invalidation hooks;
- clarified Stencil stored-state label;
- included Luma Invert in undo snapshots.

## Validation / metadata / documentation

```text
scripts/validate-pass36.mjs
package.json
HUFF_CLASSIC_OPTIMIZATION_PASS_36.txt
LUMA_KEY_STABILITY_REBASE_AUDIT.md
DOCUMENTATION_INDEX.md
PASS_NOTES.md
CHANGELOG.md
CHANGED_FILES.md
TESTING_CHECKLIST.md
VALIDATION_REPORT.md
CURRENT_STATUS.md
OPTIMIZATION_ROADMAP.md
GIT_COMMIT_MESSAGE.md
baseline/pass36-src.sha256
baseline/pass36-src-tauri.sha256
```

## Explicitly unchanged runtime areas

- `src/index.html`
- `src/pipeline-runtime.js`
- `src/capability-instrumentation.js`
- `src/canvas.html`
- `src/presets/**`
- `src-tauri/**`
