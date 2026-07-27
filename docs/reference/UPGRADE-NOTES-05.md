# Milestone 05 upgrade notes

Milestone 05 is based on Milestone 04.1. It does not replace the corrected flying-frame-buffer architecture.

## Added

- Persistent native cluster-center state
- Persistent center-relative tile constellations
- Original cluster travel calibration
- Steering independent from travel speed
- Per-center speed variation assigned when centers are created
- Velocity inertia
- Noise drift
- Timed pulse kicks
- Coherence-controlled offset regeneration
- Breathing-controlled cluster radius
- Bounce and Wrap bounds behavior
- Cluster bias, spread, minimum spread, and center count
- Shared Spatial Gap enforcement for clustered and ordinary targets
- Native cluster diagnostics in the NATIVE and H pill tooltips

## State behavior

Cluster momentum and constellations persist while Cluster Tiles is disabled, but do not advance until it is enabled again. They are cleared by:

- Clear
- Global Reset
- Source changes
- Internal render-resolution changes

This mirrors Huff's explicit reset model while avoiding stale centers after source or coordinate-space changes.

## Resource behavior

Milestone 05 does not add another GPU pipeline or unbounded allocation. Cluster physics produces positions for the Milestone 04.1 glitch instance buffer. The same 32,768-instance limit remains in effect.

## Apply

Use the complete Milestone 05 project or copy the changed files over Milestone 04.1.
