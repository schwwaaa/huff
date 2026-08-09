# Pass Notes — HUFF Classic Pass 39N

## Goal
Fix the Corrupt speed ownership/0x regression without destabilizing the now-solid Corrupt feature set, while replacing hard-to-read neon-green UI text with black.

## Corrupt speed repair
- Visible `SPEED` is now explicitly `RANDOM SPEED` when Clusters are off.
- `CLUSTER SPEED` is shown when Clusters are on.
- The status readout says which clock is active: `RANDOM CLOCK ACTIVE` or `CLUSTER CLOCK ACTIVE`.
- In CONTINUOUS mode, both speed controls now affect visible Corrupt update cadence as well as motion time.
- `0x` establishes one Corrupt state and then holds it.
- Values below `1x` provide progressively slower, evolving Corrupt updates.
- `1x` retains the established Pass 39M cadence.
- Values above `1x` keep every-render application while accelerating autonomous phase/motion.

## Cluster independence
When Clusters are enabled, CLUSTER SPEED owns the active Corrupt time scale. RANDOM SPEED does not continue driving cluster-mode phases in the background. When Clusters are disabled, RANDOM SPEED immediately becomes the active clock.

## Explicit update policies
STROBE and MULTIGRAB retain their existing decoded-frame timing controls. This pass does not reinterpret their interval/hold/live values.

## UI readability
All neon-green text is now black. Light Win95-style fields replace black terminal fields where necessary for contrast. Green remains only as a non-text accent where useful.

## Protected behavior
- Feedback merge from Pass 39M unchanged.
- `src/effects.js` exact Pass 39M file hash.
- Pipeline runtime unchanged.
- Flow frozen.
- Luma unchanged.
- no new readback/upload/buffer.
