# Cluster Master Speed Audit — Pass 39M

## Why
Pass 38 gave Clusters direct XYZ movement and organic dynamics, but there was no independent single control for the overall time scale of the Cluster subsystem. The earlier general-speed wording was ambiguous, and the visible Corrupt layer could still refresh at full cadence even when a speed control reached 0. Pass 39N makes the clocks explicit: RANDOM SPEED owns RANDOM mode and CLUSTER SPEED owns CLUSTER mode.

## New contract
`clusterMasterSpeed` is 0..4, default 1.

- 0 = freeze cluster evolution
- 0.05..0.50 = slow / evolving
- 1 = Pass 38 cluster cadence
- 2..4 = increasingly fast / chaotic

The value advances an independent cluster clock. Cluster physics consumes this clock/speed rather than `corruptSpeed`.

## What it scales
- group center XYZ travel
- organic travel
- steering field progression
- visible wander movement
- kick cadence
- pulse-size breathing phase
- Shape Hold reroll/boil cadence

## What it does not scale
- decoded video playback
- Corrupt STROBE / MULTIGRAB frame timing
- RANDOM Corrupt field speed
- Luma Key
- Feedback
- Flow

## Performance
No new render pass, buffer, image readback, or pixel upload is introduced. Cluster Speed changes arithmetic/time scaling only.
