# Changelog

## Pass 36 — Luma Key Stability Rebase

### Fixed
- Fixed persistent stencil alpha being multiplied by alpha from previous stencil-mask rebuilds.
- Removed silent fallback from an uncaptured STENCIL source to LIVE keying.
- Restored LIVE Luma's proven decoded-frame cache behavior after Pass 35 changed its timing/compositing model.
- Added guarded failure handling for bounded LIVE Luma readback and stencil capture.
- Added explicit cache invalidation when Invert and key-shaping controls change.

### Changed
- Stencil status now reads `STENCIL STORED WxH` after capture.
- Pass 35's wall-clock 15 Hz Luma analysis gate is removed.

### Preserved
- Gain, Cleanup, Density, X-Fade, Soft Add, LIVE/STENCIL, Glitch Strobe and both constrained pipeline recipes.
