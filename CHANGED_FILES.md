# HUFF Classic Pass 21 — Changed Files

## Runtime

### `src/effects.js`

- Added Flow grid generation tracking.
- Added cached maximum source X/Y bounds.
- Added reusable `FlowFieldWorkspace` typed arrays.
- Cached SPREAD-derived primary and turbulence noise coordinates.
- Cached SWIRL-derived radial sine/cosine values.
- Resolved Flow typed-array references once per pass.
- Added profiler-gated frequency and SWIRL cache counters.

### `src/canvas.js`

- Added Flow frequency/SWIRL cache telemetry snapshots.
- Added profiler rows for cache rebuild/reuse counts.

## Validation and metadata

### `scripts/validate-pass21.mjs`

- Added cache-key, invalidation, floating-point field, noise-coordinate, clipping, and ordered draw-rectangle equivalence tests.

### `package.json`

- Added `npm run validate:pass21`.

### `README.md`

- Added the Pass 21 optimization summary.

## Documentation

- `PASS_NOTES.md`
- `FLOW_DYNAMIC_FIELD_CACHE_AUDIT.md`
- `CHANGED_FILES.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `CURRENT_STATUS.md`
- `CHANGELOG.md`
- `OPTIMIZATION_ROADMAP.md`
- `GIT_COMMIT_MESSAGE.md`
- `DOCUMENTATION_INDEX.md`
- `HUFF_CLASSIC_OPTIMIZATION_PASS_21.txt`
