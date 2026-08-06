# HUFF Classic Pass 26 — Baseline Integrity Manifest

## Behavioral authority

The authoritative behavioral runtime remains the user-supplied Pass 22 archive. Pass 25 is the immediate user-confirmed working predecessor for Pass 26.

## Exact frozen effects hash

```text
src/effects.js
2b352fa279c728ba292485fe22a0e580c6a3f36d669bd9741f79d5af4454dd44
```

This proves the complete effect implementation, including Flow, remains Pass 22.

## Complete manifests

```text
baseline/pass22-src.sha256
baseline/pass22-src-tauri.sha256
baseline/pass24-src.sha256
baseline/pass25-src.sha256
```

`baseline/pass25-src.sha256` records every file under the user-confirmed working Pass 25 `src/` tree before Pass 26 changes.

## Pass 26 constrained-change rule

Pass 26 permits changes only to:

```text
src/pipeline-runtime.js
src/canvas.js
```

All other `src/` files must match `baseline/pass25-src.sha256`. The complete native tree must match `baseline/pass22-src-tauri.sha256`.

## Validation

`scripts/validate-pass26.mjs` enforces these manifests and rejects undeclared runtime files, missing files, or changes outside the declared scope.
