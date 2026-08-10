# Changed Files — Pass 40W

## Runtime
- `src/canvas.js` — separates CONTINUOUS Corrupt layer presence from Random/Cluster evolution speed; adds decoded-frame source-age clock.
- `src/effects.js` — historical AGE selection now hashes the speed-scaled Corrupt source serial instead of live `_vfc` directly.
- `src/index.html` — clarifies Random/Cluster Speed and CONTINUOUS vs STROBE/MULTIGRAB semantics.

## Compatibility/reference docs
- `src/midi/FORMAT.md`
- `src/osc/FORMAT.md`
- `docs/docs/parameter-reference.html`
- `docs-v1/docs/parameter-reference.html`

## Validation
- `package.json`
- `scripts/validate-pass40w.mjs`
- `scripts/simulate-pass40w-layer-handoff.mjs`

## Pass documentation
- `HUFF_CLASSIC_OPTIMIZATION_PASS_40W.txt`
- `CORRUPT_SCAN_LAYER_PRESENCE_AUDIT.md`
- `DOCUMENTATION_INDEX.md`
- `PASS_NOTES.md`
- `CHANGELOG.md`
- `CHANGED_FILES.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `CURRENT_STATUS.md`
- `OPTIMIZATION_ROADMAP.md`
- `GIT_COMMIT_MESSAGE.md`

## Integrity manifests
- `baseline/pass40w-src.sha256`
- `baseline/pass40w-src-tauri.sha256`
