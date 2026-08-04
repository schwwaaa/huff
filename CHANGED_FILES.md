# HUFF Classic Pass 18 — Changed Files

## Runtime

### `src/effects.js`

- Removed the per-blit `drawRingRegion()` helper.
- Added reusable `GlitchBlitWorkspace`.
- Added versioned temporal-ring source-reference caching.
- Added reusable typed smear-offset buffers.
- Cached the constant tile span per Glitch invocation.
- Dispatched Glitch draws directly through the cached Canvas2D context.
- Added profiler-gated Glitch tile, draw-call, and ring-cache telemetry.

### `src/canvas.js`

- Added a `FrameRing.version` mutation counter.
- Incremented the version after successful capture, resize, and clear.
- Added Glitch telemetry rows to the existing profiler.
- Updated a stale profiler comment after helper removal.

## Validation

### `scripts/validate-pass18.mjs`

- Enforces stable decoder, scheduler, and Syphon boundaries.
- Verifies the new Glitch workspace and direct-blit structure.
- Compares old and new blit operation sequences exactly.
- Verifies temporal-ring cache reuse and invalidation.

### `package.json`

- Added `npm run validate:pass18`.

## Documentation

- `PASS_NOTES.md`
- `GLITCH_DRAW_CALL_AUDIT.md`
- `CHANGED_FILES.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `CURRENT_STATUS.md`
- `CHANGELOG.md`
- `OPTIMIZATION_ROADMAP.md`
- `GIT_COMMIT_MESSAGE.md`
- `DOCUMENTATION_INDEX.md`
- `HUFF_CLASSIC_OPTIMIZATION_PASS_18.txt`
