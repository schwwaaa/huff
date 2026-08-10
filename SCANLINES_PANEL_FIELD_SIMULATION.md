# Scanlines Panel Field Simulation

`SCANLINES_PANEL_FIELD_SIMULATION.png` is a **geometry illustration, not an app
screenshot**. It uses one of the supplied prior-version screenshots as panel
texture so the difference between organizations is easier to read.

The four frames illustrate:

1. **BANDS** — existing organized slice/panel lanes.
2. **FIELD** — the same conceptual panels distributed by X/Y/apparent-Z.
3. **FIELD drift** — same seeded panel identities after motion phase advances.
4. **FIELD zeroed** — FIELD parameters at zero collapse to the original geometry
   contract rather than invoking a different temporal effect.

Run the numeric deterministic model with:

```bash
npm run simulate:pass40u
```

The simulator checks that FIELD anchors are deterministic, zeroed FIELD returns
to neutral geometry, and phase changes do not move FIELD panels when both drift
controls are zero.
