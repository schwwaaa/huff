# HUFF Classic Optimization Pass 10 — Documentation Index

## Pass-specific documents

- [`PASS_NOTES.md`](PASS_NOTES.md) — exact implementation changes, invariants, files changed, and validation status.
- [`SCANLINE_ENGINE_AUDIT.md`](SCANLINE_ENGINE_AUDIT.md) — current signal path, workspace design, Junkpile influence, and remaining ceiling.
- [`TESTING_CHECKLIST.md`](TESTING_CHECKLIST.md) — visual parity, static-cache, angle/spin, Syphon, resize, and platform tests.
- [`GIT_COMMIT_MESSAGE.md`](GIT_COMMIT_MESSAGE.md) — ready-to-use commit title, body, and command.

## Cumulative documents

- [`CHANGELOG.md`](CHANGELOG.md) — optimization history from Pass 1 through Pass 10.
- [`CURRENT_STATUS.md`](CURRENT_STATUS.md) — current topology, completed work, ceilings, next pass, and release blockers.
- [`CANVAS_BUFFER_AUDIT.md`](CANVAS_BUFFER_AUDIT.md) — cumulative full-resolution surface and memory audit retained from Pass 9.
- [`CANVAS_PIPELINE_AUDIT.md`](CANVAS_PIPELINE_AUDIT.md) — Flow, FrameRing, and mirror audit retained from Pass 9.
- [`README.md`](README.md) — public project, output, and performance documentation.

## Validation

Run:

```bash
npm run validate:pass10
```

The validator compares the previous and optimized Scanline band calculations across 2,400 cases and 28,342 exact band records, then verifies static-state reuse and invalidation.

## Pass marker

- [`HUFF_CLASSIC_OPTIMIZATION_PASS_10.txt`](HUFF_CLASSIC_OPTIMIZATION_PASS_10.txt)

## Scope reminder

This package is **HUFF Classic**: Tauri v1 + HTML/JavaScript + p5.js/Canvas2D. It does not contain the native-wgpu HUFF renderer or native-HUFF milestone numbering.
