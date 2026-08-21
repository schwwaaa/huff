# HUFF Classic — Current Status

## Current candidate

**Pass 58 — Constrained Pipeline Recipe Expansion**, built directly from the committed Pass 57 release-candidate baseline.

Pass 58 is an explicitly authorized creative/modularity pass. It reuses the existing validated serial-recipe infrastructure and does not add effects, parallel routing, cycles, full-resolution buffers, or native-output changes.

### Pipeline recipes

```text
CLASSIC
IMAGE FEED → FEEDBACK → FLOW → SYMMETRY → SOLARIZE

CRISP FINISH
FEEDBACK → FLOW → SYMMETRY → SOLARIZE → IMAGE FEED

TEMPORAL UNDERLAY
FEEDBACK → FLOW → IMAGE FEED → SYMMETRY → SOLARIZE

SYMMETRY MEMORY
IMAGE FEED → SYMMETRY → FEEDBACK → FLOW → SOLARIZE

COLOR MEMORY
IMAGE FEED → SOLARIZE → FEEDBACK → FLOW → SYMMETRY

FLOW FINISH
IMAGE FEED → FEEDBACK → SYMMETRY → SOLARIZE → FLOW

FEEDBACK FINISH · EXP
IMAGE FEED → FLOW → SYMMETRY → SOLARIZE → FEEDBACK
```

The Pipeline panel includes a minimal routing diagram that changes immediately with the selected recipe.

### Protected product contracts

- Three primary image feeds remain **Corrupt / Scanlines / Luma Key COMPOSITE**.
- Flow's accepted implementation is unchanged.
- Feedback's accepted implementation is unchanged.
- Symmetry and Solarize implementations are unchanged.
- Layer Priority remains SCAN TOP / CORRUPT TOP.
- Global Mix retains BEFORE FB / AFTER FB / AFTER FLOW / FINAL.
- No effect-level frame skipping is introduced.
- Syphon remains **1280×720 60 fps primary / 30 fps fallback**.
- User preset JSON/session workflow is unchanged.
- HUFF Classic remains Tauri v1 + WebView + p5.js/Canvas2D/WebGL helpers; no wgpu code is introduced.

### Automated gate

Run:

```bash
npm run regress:pass58
```

### Manual gate

Use the Pass 58 section at the top of `TESTING_CHECKLIST.md`.

Static validation does **not** decide which new recipes belong. The target-machine creative review should keep only routes that are stable, visually distinct, and useful.

`FEEDBACK FINISH` is explicitly experimental.

### Next decision

Test the new recipes before expanding any other part of HUFF Classic. Remove redundant/unstable routes rather than growing the menu automatically.
