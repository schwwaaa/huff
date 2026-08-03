# Git Commit Message — HUFF Classic Optimization Pass 8

## Recommended commit

```text
perf: consolidate HUFF Classic canvas buffers

Reuse one full-resolution ping-pong surface for feedback, flow, and symmetry.
Reduce the persistent p5 Graphics set from four surfaces to three and remove the separate feedback snapshot canvas.
Resize p5 Graphics and pixel-processing scratch canvases in place to reduce transient allocation during window changes.
Move main output presentation and symmetry transforms to direct Canvas2D operations.
Cache mirror canvas lookup and quality-derived JPEG/FPS tuning outside the animation-frame pump.
Preserve effect order, controls, temporal history, Syphon transport, Spout, and mandatory framework packaging.
Update technical documentation and add a current canvas/buffer audit.
```

## Ready-to-run command

```bash
git add . && git commit \
  -m "perf: consolidate HUFF Classic canvas buffers" \
  -m "Reuse one full-resolution ping-pong surface for feedback, flow, and symmetry." \
  -m "Reduce the persistent p5 Graphics set from four surfaces to three and remove the separate feedback snapshot canvas." \
  -m "Resize p5 Graphics and pixel-processing scratch canvases in place to reduce transient allocation during window changes." \
  -m "Move main output presentation and symmetry transforms to direct Canvas2D operations." \
  -m "Cache mirror canvas lookup and quality-derived JPEG/FPS tuning outside the animation-frame pump." \
  -m "Preserve effect order, controls, temporal history, Syphon transport, Spout, and mandatory framework packaging." \
  -m "Update technical documentation and add a current canvas/buffer audit."
```

## Commit only after

- Feedback, Flow, and Symmetry combinations pass visual testing.
- Rapid resize/fullscreen tests do not reveal stale frames or growing memory.
- Mirror output remains correct.
- A Syphon receiver confirms the main output canvas still publishes correctly.
