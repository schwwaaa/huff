# HUFF Classic Pass 22 — Changed Files

## Runtime files

### `src/effects.js`

- Added Scanline drift/shift preparation variants selected before the band loop.
- Cached phase and focus scalars per Scanline pass.
- Used direct zero-offset rectangles for neutral SHIFT/SKEW.
- Resolved prepared typed arrays once before dispatch.
- Added exact-horizontal Canvas2D dispatch without transform-stack operations.
- Cached Scanline transform constants by geometry.
- Added profiler-gated Scanline geometry, preparation, and path telemetry.

### `src/canvas.js`

- Added profiler snapshot/delta/display support for the new Scanline telemetry.
- No rendering, decoder, scheduler, mirror, or output clock was changed.

### `package.json`

- Added `npm run validate:pass22`.

### `scripts/validate-pass22.mjs`

- Added deterministic equivalence validation for all four preparation variants.
- Added exact noise-call-count validation.
- Added exact prepared-band field comparison.
- Added zero-angle transform-cancellation validation.
- Added source-boundary assertions for the stable decoder and profiler additions.

## Documentation files

- `PASS_NOTES.md`
- `SCANLINE_DISPATCH_STATE_AUDIT.md`
- `CHANGED_FILES.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `CURRENT_STATUS.md`
- `CHANGELOG.md`
- `OPTIMIZATION_ROADMAP.md`
- `GIT_COMMIT_MESSAGE.md`
- `DOCUMENTATION_INDEX.md`
- `HUFF_CLASSIC_OPTIMIZATION_PASS_22.txt`
- `README.md`

## Confirmed unchanged runtime areas

- stable Blob URL decoder path;
- frame scheduling;
- media lifecycle;
- canvas buffer topology;
- temporal ring;
- Glitch, Flow, Feedback, Symmetry, Solarize, and Luma algorithms;
- mirror transport;
- Syphon bootstrap and native publication;
- Spout;
- bundled framework binary.
