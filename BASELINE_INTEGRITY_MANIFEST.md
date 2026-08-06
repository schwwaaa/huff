# HUFF Classic Pass 27 — Baseline Integrity Manifest

## Behavioral authority

The authoritative behavioral runtime remains the user-supplied Pass 22 archive. Pass 26 is the immediate user-confirmed working predecessor for Pass 27.

## Exact frozen effect and pipeline hashes

```text
src/effects.js
2b352fa279c728ba292485fe22a0e580c6a3f36d669bd9741f79d5af4454dd44

src/pipeline-runtime.js
5124aa948fcf556ce5b00c8da1bfef8a86da850d278e680cc9a4e0a8ea3634b9
```

## Complete manifests

```text
baseline/pass22-src.sha256
baseline/pass22-src-tauri.sha256
baseline/pass24-src.sha256
baseline/pass25-src.sha256
baseline/pass26-src.sha256
baseline/pass26-src-tauri.sha256
```

`baseline/pass26-src.sha256` records every file under the user-confirmed working Pass 26 `src/` tree before Pass 27 changes.

## Pass 27 constrained-change rule

Pass 27 permits runtime changes only to:

```text
src/capability-instrumentation.js
src/canvas.js
src/index.html
```

All other source files must match the Pass 26 manifest. The complete native tree must match the Pass 26 native manifest.

## Validation

`scripts/validate-pass27.mjs` enforces these boundaries and rejects undeclared runtime files, missing files, effect changes, pipeline-runtime changes, additional render surfaces, or added instrumentation clocks.
