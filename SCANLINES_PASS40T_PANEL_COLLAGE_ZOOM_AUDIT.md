# Pass 40T — Scanlines Panel-Collage Zoom Audit

## What the supplied references clarify

The supplied prior-version screenshots do not show one globally scaled strip field. They show repeated rectangular video surfaces at different apparent depths and positions, overlapping into a collage while the persistent/Flow background continues to deform around them.

The key characteristics are:

- multiple video rectangles can coexist at different scales;
- a slice is able to become a substantial video panel instead of remaining a thin band;
- panels overlap and visually escape their original strip lanes;
- recursive/persistent processing can leave earlier panel sizes behind, creating cascades/tunnels;
- returning the spatial control to neutral should restore the original flat 2D Scanlines behavior.

Pass 40S failed this because its `ctx.scale(zoom, zoom)` wrapped the complete Scanlines field. Every band was still one member of a single constrained strip coordinate system.

## Pass 40T model

Pass 40T changes only the optional zoom geometry.

At `ZOOM = 1.00x`:

- source rectangle = original Pass 39N source rectangle;
- destination rectangle = original Pass 39N destination rectangle;
- the optimized direct-horizontal path remains available;
- the visual effect is the original flat 2D Scanlines compositor.

When ZOOM moves away from 1x:

1. Each band computes its own center.
2. The source window expands vertically toward the source video aspect ratio.
3. The destination band expands toward the same panel aspect.
4. The resulting panel receives the ZOOM scale around its own center.
5. Other bands do the same independently.

This is intentionally different from scaling the whole canvas coordinate system.

## Why this supports collage behavior

The panel transformation occurs before later persistent recursion and Flow/Feedback processing. Therefore a changing MOVE Z can write panels at different sizes over time into the persistent image. Feedback or Flow can then transform those existing layers further.

This does not attempt to recreate a full 3D renderer. It gives Classic a reversible 2D-band <-> floating-panel vocabulary using the existing Canvas2D pipeline.

## ZOOM curve

`ZOOM = 1` is the flat plane.

Distance from 1 is measured with `abs(log2(zoom))`, so reciprocal scales behave symmetrically:

- `0.5x` and `2x` are equally far from the flat plane;
- `0.25x` and `4x` are equally far from the flat plane.

A smoothstep curve turns that distance into `panelMix`.

- at 1x: `panelMix = 0` exactly;
- around 1.5x: partial panelization;
- at 0.5x / 2x and beyond: full source-aspect panel geometry.

The final destination panel is then scaled by the actual zoom value, so 0.5x produces a receding panel and 2x produces an advancing panel.

## What is not added

- no separate panel mode toggle;
- no depth-spread control;
- no per-panel random Z;
- no new historical source selector;
- no new FrameRing read;
- no new render target;
- no CPU pixel analysis.

Those may be reviewed later only if runtime use shows they are necessary. The current goal is to recover the flexibility already implied by the existing persistent buffer / Flow interaction with one ZOOM control.
