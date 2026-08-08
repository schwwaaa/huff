# HUFF Classic Pass 38 — Changed Files

## Browser runtime

### `src/index.html`
- adds master CORRUPT SPEED;
- makes Clusters a visible ON/OFF toggle;
- adds Patch POSITION/MOVE Z and direct X/Y/Z movement controls;
- adds Group Z SPREAD and Group MOVE X/Y/Z;
- separates direct Group XYZ from organic Group Dynamics;
- renames derived RATE display to FIELD RATE.

### `src/canvas.js`
- adds event-cached state and preset scope for new controls;
- adds bounded CORRUPT motion clock/state;
- master SPEED scales autonomous motion without altering STROBE/MULTIGRAB decoded-frame timing;
- adds general X/Y wrapping and Z near/far movement;
- adds Reset XYZ;
- preserves hidden distribution compatibility alias and legacy preset migration.

### `src/effects.js`
- extends reusable Corrupt target workspace with typed Float32 Z;
- adds per-cluster base depth and direct Z travel state;
- adds direct Group X/Y/Z movement;
- adds bounded Canvas2D 2.5D destination projection;
- preserves neutral XYZ legacy draw path;
- does not add readbacks, pixel uploads, full-resolution buffers, or extra draw passes.

## Compatibility docs

- `src/midi/FORMAT.md`
- `src/osc/FORMAT.md`

Cluster toggle and SPEED/FIELD RATE semantics updated; stable legacy IDs remain valid.

## Public/reference docs

- `docs/docs/parameter-reference.html`
- `docs-v1/docs/parameter-reference.html`

New Pass 38 parameters/units documented.

## Validation/build metadata

- `scripts/validate-pass38.mjs`
- `package.json`
- `baseline/pass38-src.sha256`
- `baseline/pass38-src-tauri.sha256`

## Pass documentation

- `HUFF_CLASSIC_OPTIMIZATION_PASS_38.txt`
- `CORRUPT_XYZ_CLUSTER_LUMA_PERFORMANCE_AUDIT.md`
- `PASS_NOTES.md`
- `CHANGELOG.md`
- `CHANGED_FILES.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `CURRENT_STATUS.md`
- `OPTIMIZATION_ROADMAP.md`
- `DOCUMENTATION_INDEX.md`
- `GIT_COMMIT_MESSAGE.md`
