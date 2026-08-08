# Git Commit Message — Pass 36

```bash
git add . && git commit \
  -m "fix: rebase HUFF Classic luma key for stability" \
  -m "Restore LIVE Luma to the proven decoded-frame cached clean-patch architecture and remove the Pass 35 wall-clock analysis gate and split live CUT/FILL path that changed Glitch interaction." \
  -m "Fix stored-stencil alpha corruption by rebuilding mask alpha directly from captured luminance instead of multiplying against prior mask state, and make uncaptured STENCIL explicit rather than silently falling back to LIVE." \
  -m "Retain Gain, Cleanup, Density, X-Fade, Soft Add, Glitch Strobe and both constrained pipeline recipes while leaving Flow, FrameRing, decoder, outputs, presets and native Tauri runtime unchanged." \
  -m "Add deterministic stencil-rebuild regression validation, runtime freeze tests and the complete Pass 36 documentation suite."
```
