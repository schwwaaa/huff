# Huff Native wgpu · Milestone 04.1 parity correction

Milestone 04 compiled and rendered, but it did not reproduce Huff's defining visual model. It treated the clean source as a full-frame composite every cycle and added a transformed previous texture to it. Original Huff instead carries one persistent `gBuf`, stamps historical regions into that buffer, and then spatially transforms the buffer itself.

Milestone 04.1 corrects the architecture before any more effects are ported.

## Restored flying frame-buffer model

```text
Clean source ───────────────→ GPU history ring

Persistent effect buffer from previous render
        ↓ destination-out persistence decay
Historical glitch rectangles stamped into buffer
        ↓
Optional FB X/Y/Z/θ transform of that same buffer
        ↓
Effect buffer composited over optional clean base
        ↓
Output
```

The clean source is no longer added to the feedback recursion every frame. This removes the brightness blowout and allows the buffer to fly, drift, rotate, zoom, fade, and be repopulated by temporal tiles as in the Canvas2D engine.

## Parameter parity corrections

- **Speed/Fine/Mult** now advance the two original p5 noise phases by `density × 0.01` and `density × 0.011` per rendered frame. Speed no longer directly moves every rectangle.
- **Corrupt %** only determines requested tile count. It is not a full-frame mix control. As in original Huff, Glitch ON still emits at least one tile at Corrupt 0.
- **Pixel Size** defines the placement grid.
- **Glitch Size** independently sets sampled extent as `pixelSize × floor(glitchSize) / 20`.
- Large rectangles crop at the right and bottom edges rather than being shifted inward.
- Jitter uses the original p5 Perlin-noise coordinates.
- Smear direction is shared across a frame and uses the original noise/angle behavior.
- Historical frame choice uses the original decoded-frame hash and DEPTH/SCATTER relationship.
- Random tile placement uses p5's Numerical Recipes LCG seeded with `sourceSeed + frameCount`.
- p5 random/noise calculations and phase accumulation use 64-bit floats, matching JavaScript Number behavior and preventing long-running SPEED drift.
- The p5 Perlin table is rebuilt from Source Seed.
- **Spatial Gap** is restored for ordinary glitch placement, even when cluster tiling is off—the original engine used that control in both modes.
- Glitch opacity preserves the original 8-bit `floor(alpha × 255)` quantization.

## Feedback parity corrections

- Persistence now emulates the original `destination-out` decay curve.
- Feedback snapshots and transforms the just-assembled effect buffer once.
- Feedback is no longer additive.
- Feedback amount is clamped to Canvas global-alpha behavior.
- FB Z is constrained to Huff's original 0.98–1.03 range.
- Base video is composited beneath the effect buffer at presentation time rather than being captured into temporal history.

## Scope

This correction targets the core Glitch + Feedback instrument behavior. Clusters, scanlines, flow, luma key, smoosh, layer ordering, and global mix remain later milestones.
