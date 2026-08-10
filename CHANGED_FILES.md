# Changed Files — Pass 41A

## Runtime
- `src/index.html`
  - adds PROCESS, SOURCE FIT, HISTORY, source-status UI;
  - keeps hidden `quality` compatibility alias;
  - clarifies common media-container picker hints.
- `src/canvas.js`
  - 1080p-class processing ceiling and fixed 720P/1080P modes;
  - source FIT/FILL/STRETCH/1:1 blit path;
  - strict FrameRing byte-budget/history control;
  - mirror/history decoupling;
  - rVFC and browser dropped-frame diagnostics;
  - exact seek-on-release;
  - legacy QUALITY/HISTORY synchronization.

## Compatibility/reference docs
- `src/midi/FORMAT.md`
- `src/osc/FORMAT.md`
- `docs/docs/parameter-reference.html`
- `docs-v1/docs/parameter-reference.html`

## Validation / simulation
- `package.json`
- `scripts/validate-pass41a.mjs`
- `scripts/simulate-pass41a-playback.mjs`
- `baseline/pass40w-protected.sha256`

## Pass documentation
- `HUFF_CLASSIC_OPTIMIZATION_PASS_41A.txt`
- `PLAYBACK_FIDELITY_AUDIT.md`
- `DOCUMENTATION_INDEX.md`
- `PASS_NOTES.md`
- `CHANGELOG.md`
- `CHANGED_FILES.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `CURRENT_STATUS.md`
- `OPTIMIZATION_ROADMAP.md`
- `GIT_COMMIT_MESSAGE.md`

## Explicitly unchanged runtime files
- `src/effects.js`
- `src/pipeline-runtime.js`
- `src/capability-instrumentation.js`
- `src-tauri/**`
