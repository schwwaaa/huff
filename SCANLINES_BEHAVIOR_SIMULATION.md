# Pass 40T — Scanlines Panel-Zoom Simulation

Run:

```bash
npm run simulate:pass40t
```

The simulation models representative band rectangles at 0.5x, 1x, 1.5x and 2x and writes:

- `SCANLINES_PANEL_ZOOM_SIMULATION.svg`
- `SCANLINES_PANEL_ZOOM_SIMULATION.png`

Contracts checked:

- 1x preserves the exact flat-band rectangle.
- 1.5x smoothly interpolates from a strip toward a panel.
- 2x escapes the original band-height lane and reaches source-video aspect.
- 0.5x becomes a smaller free panel rather than merely a thinner constrained strip.

The simulation validates geometry only. It does not claim runtime artistic acceptance or FPS performance.
