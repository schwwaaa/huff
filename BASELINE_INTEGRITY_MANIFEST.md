# HUFF Classic Pass 33 — Baseline Integrity Manifest

## Behavioral authority

The authoritative visual/effect lineage remains the user-confirmed Pass 22 runtime. Pass 31 is the committed working augmentation baseline; Pass 32 added Luma `GAIN` and the now-superseded every-render `SELF KEY` experiment. Pass 33 branches directly from Pass 32 and preserves every protected runtime system outside the declared Luma-key changes.

## Current protected boundaries

Pass 33 permits browser-runtime changes only to:

```text
src/effects.js
src/canvas.js
src/index.html
```

The complete native tree remains byte-identical to Pass 32.

The following remain unchanged from Pass 32:

```text
src/pipeline-runtime.js
src/capability-instrumentation.js
src/canvas.html
src/presets/**
src-tauri/**
```

Flow remains the accepted Pass 22 implementation.

## Complete manifests

```text
baseline/pass32-src.sha256
baseline/pass32-src-tauri.sha256
baseline/pass33-src.sha256
baseline/pass33-src-tauri.sha256
```

`baseline/pass33-src.sha256` and `baseline/pass33-src-tauri.sha256` record the complete delivered Pass 33 source trees.

## Validation rule

`scripts/validate-pass33.mjs` compares the active tree against the accepted Pass 32 manifests and rejects undeclared runtime changes, native changes, factory-preset changes, additional full-resolution `createGraphics()` surfaces, or reintroduction of the Pass 32 every-render Self Key path.
