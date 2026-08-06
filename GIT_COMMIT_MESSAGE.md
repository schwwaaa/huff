# Ready-to-use Git commit

```bash
git add . && git commit \
  -m "feat: add Glitch-only strobe to HUFF Classic" \
  -m "Gate only applyGlitch on decoded-frame intervals while keeping Pipeline Luma Key, Scanlines, Feedback, Flow, Symmetry, Solarize, Global Mix, media decode, and outputs live." \
  -m "Add STROBE and EVERY controls inside the Glitch group, persist them in new presets, and migrate legacy presets to strobe off." \
  -m "Preserve Pass 30 pipeline recipes, Pass 22 Flow and effects, the three-buffer topology, FrameRing policy, decoder, clocks, outputs, native runtime, and platform packaging." \
  -m "Add deterministic scheduling validation and the complete Pass 31 documentation suite."
```
