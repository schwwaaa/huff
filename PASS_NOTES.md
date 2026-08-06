# HUFF Classic Optimization Pass 30 — Pass Notes

## Name

**Constrained Pipeline Switching Foundation**

## Baseline

HUFF Classic Optimization Pass 29 — Platform Packaging Freeze.

## Purpose

Add a small validated serial recipe selector without turning HUFF Classic into a node graph and without changing any effect algorithm.

## User-facing recipes

### CLASSIC

The exact Pass 22 compatibility route:

```text
source sync
→ persistent decay
→ Glitch / Pipeline Luma Key / Scanlines
→ Global Mix: before
→ Feedback
→ Global Mix: after
→ Flow
→ Global Mix: afterflow
→ Symmetry
→ Solarize
→ Global Mix: final
→ presentation
```

### CRISP FINISH

The same stages and resources, with the existing Glitch/Luma/Scanline ordered group moved into a validated final overlay slot:

```text
source sync
→ persistent decay
→ Global Mix: before
→ Feedback
→ Global Mix: after
→ Flow
→ Global Mix: afterflow
→ Symmetry
→ Solarize
→ Glitch / Pipeline Luma Key / Scanlines
→ Global Mix: final
→ presentation
```

This allows Glitch, Luma Key, and Scanlines to remain visually crisp instead of being transformed by Flow, Symmetry, and Solarize.

## Safety boundary

- Both recipes compile once at startup.
- One immutable recipe is selected before any stage executes for a frame.
- Unknown route IDs recover to `CLASSIC`.
- Both recipes declare exactly three full-resolution buffers.
- Both recipes use only the existing `gScratch` scratch surface.
- No recipe declares a cycle.
- No effect implementation changed.
- Flow remains the exact Pass 22 implementation.
- No native, decoder, FrameRing, mirror, Syphon, Spout, shutdown, or packaging runtime changed.

## Preset behavior

- New presets save `pipelineRecipe`.
- Presets created before Pass 30 load into `CLASSIC` regardless of the route currently selected.
- Unknown imported recipe IDs recover to `CLASSIC` before control events are dispatched.
