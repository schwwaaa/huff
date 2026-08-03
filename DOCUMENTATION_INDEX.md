# HUFF Classic Optimization Pass 11 — Documentation Index

## Pass-specific documents

- [`PASS_NOTES.md`](PASS_NOTES.md) — exact implementation changes, preserved behavior, files changed, and validation status.
- [`NO_OP_DIRTY_STATE_AUDIT.md`](NO_OP_DIRTY_STATE_AUDIT.md) — stage contribution rules, bypass topology, state-progression constraints, and remaining costs.
- [`TESTING_CHECKLIST.md`](TESTING_CHECKLIST.md) — neutral/active transition, bypass, output, resize, endurance, and platform tests.
- [`GIT_COMMIT_MESSAGE.md`](GIT_COMMIT_MESSAGE.md) — ready-to-use commit title, body, and command.

## Cumulative documents

- [`CHANGELOG.md`](CHANGELOG.md) — optimization history from Pass 1 through Pass 11.
- [`CURRENT_STATUS.md`](CURRENT_STATUS.md) — current topology, completed work, ceilings, next pass, and release blockers.
- [`CANVAS_BUFFER_AUDIT.md`](CANVAS_BUFFER_AUDIT.md) — full-resolution surface and memory audit retained from Pass 9.
- [`CANVAS_PIPELINE_AUDIT.md`](CANVAS_PIPELINE_AUDIT.md) — Flow, FrameRing, and mirror audit retained from Pass 9.
- [`SCANLINE_ENGINE_AUDIT.md`](SCANLINE_ENGINE_AUDIT.md) — Scanline workspace audit retained from Pass 10.
- [`README.md`](README.md) — public project, output, and performance documentation.

## Validation

Run:

```bash
npm run validate:pass9
npm run validate:pass10
npm run validate:pass11
```

Pass 11 validates activity predicates, exact identity states, decoded-frame bypass synchronization, source markers, and removal of the legacy aggregate predicate.

## Pass marker

- [`HUFF_CLASSIC_OPTIMIZATION_PASS_11.txt`](HUFF_CLASSIC_OPTIMIZATION_PASS_11.txt)

## Scope reminder

This package is **HUFF Classic**: Tauri v1 + HTML/JavaScript + p5.js/Canvas2D. It does not contain the native-wgpu HUFF renderer or native-HUFF milestone numbering.
