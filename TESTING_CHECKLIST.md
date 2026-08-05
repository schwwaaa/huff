# HUFF Classic Optimization Pass 24 — Testing Checklist

## Completed integrity checks

- [x] Package continues directly from the confirmed-working Pass 23 package
- [x] `src/` matches the complete Pass 22 file manifest
- [x] `src-tauri/` matches the complete Pass 22 file manifest
- [x] `src/canvas.js` matches Pass 22 exactly
- [x] `src/effects.js` matches Pass 22 exactly
- [x] `src/index.html` matches Pass 22 exactly
- [x] `package.json` matches Pass 22 exactly
- [x] Flow implementation, controls, presets, and routing remain unchanged
- [x] Rejected Sort-Mosh and Melt code remains absent
- [x] Stage registry is not loaded by the runtime

## Completed contract checks

- [x] 11 unique immutable stage contracts
- [x] 12 existing serial zones
- [x] all resource references are valid
- [x] all legal-zone references are valid
- [x] Flow remains frozen in `primary-transform`
- [x] Flow retains `gBuf + FrameRing -> gScratch -> swap`
- [x] Feedback retains snapshot-before-clear ownership
- [x] Global Mix retains four existing named positions
- [x] front-stage scan/glitch priority orders match Pass 22
- [x] invalid metadata is rejected by the registry validator

## Completed inherited validation

- [x] Pass 9 through Pass 22 validators pass
- [x] Pass 23 integrity validator passes
- [x] Pass 24 registry validator passes
- [x] 27 project-owned JavaScript/ES module/CommonJS files pass `node --check`
- [x] 34 JSON files parse successfully
- [x] 2 TOML files parse successfully
- [x] 6 shell scripts pass `bash -n`
- [x] ZIP integrity check passes

## Runtime testing

Pass 24 introduces no loaded runtime code and therefore does not require a new visual-effect test matrix. The user-confirmed Pass 23 result remains valid because the application runtime is unchanged.

## Not run

- [ ] `cargo check` — Cargo unavailable in the validation environment; native source is unchanged
