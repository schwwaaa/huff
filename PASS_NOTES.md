# HUFF Classic — Pass Notes

## Pass 38 — CORRUPT XYZ + Cluster Toggle + Master Speed

**Status:** implementation and deterministic/static validation complete; runtime immediacy/FPS evaluation required.

Pass 38 follows the user's positive Pass 37 test while targeting the one weak area: Clusters. It also adds the missing global CORRUPT speed and explicit X/Y/Z placement/movement.

### New performance controls

- `SPEED`: master multiplier for autonomous CORRUPT movement.
- `POSITION X/Y/Z`: static destination geometry.
- `MOVE X/Y/Z`: direct continuous movement.
- `FIELD RATE`: renamed derived view over the established legacy noise-rate stack.

Explicit STROBE and MULTIGRAB frame timings are not multiplied by SPEED.

### Clusters

Clusters are again an explicit toggle:

```text
OFF = RANDOM
ON  = grouped persistent bodies
```

Cluster-only controls now include:

- DEPTH: per-group Z separation;
- GROUP MOVE X/Y/Z: direct center movement;
- existing Shape controls;
- existing organic dynamics, now visually separated from direct XYZ.

### Historical influence

- Fairlight: semantic timing/movement grouping and immediate operator intent.
- Magic DaVE: structured DVE geometry with position/size/rotation/perspective/zoom.
- INDIGO: explicit 3D Position X/Y/Z vocabulary for transformed keys.

HUFF Classic's Z is a Canvas2D 2.5D adaptation, not true 3D.

### Luma boundary

Pass 38 does not modify the accepted Pass 36 Luma implementation. LIVE Luma remains a bounded 640px cached CPU readback path; STENCIL remains readback-free during normal playback after capture. The new XYZ/Cluster implementation adds no image readback or full-resolution surface.

See `CORRUPT_XYZ_CLUSTER_LUMA_PERFORMANCE_AUDIT.md`.

## Pass 37 — CORRUPT Semantic Controls + Cluster Integration

**Runtime feedback:** broadly positive; user reported loving the changes except the Cluster section. Pass 38 therefore preserves the accepted semantic Corrupt work while refining Cluster identity and movement.

## Pass 36 — Luma Key Stability Rebase

**Runtime feedback:** accepted as a strong checkpoint. LIVE and stored STENCIL behavior remain the Luma baseline for Pass 38.
