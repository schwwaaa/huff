# HUFF Classic Optimization Pass 31 — Changed Files

## Browser runtime

- `src/index.html` — adds Glitch `STROBE` and `EVERY` controls inside the Glitch group.
- `src/canvas.js` — adds decoded-frame scheduling around `applyGlitch()` only; preserves real-time Pipeline Luma Key; adds preset/undo/UI and lifecycle reset plumbing.

## Documentation

- `docs/docs/parameter-reference.html`
- `docs-v1/docs/parameter-reference.html`
- `GLITCH_STROBE_ISOLATION_AUDIT.md`
- complete Pass 31 documentation suite

## Validation and metadata

- `scripts/validate-pass31.mjs`
- `package.json`
- `baseline/pass31-src.sha256`
- `baseline/pass31-src-tauri.sha256`

## Explicitly unchanged

```text
src/effects.js
src/pipeline-runtime.js
src/capability-instrumentation.js
src/canvas.html
src/presets/**
src-tauri/**
Flow and all effect algorithms
full-resolution buffer count
```
