# Milestone 04 Upgrade Notes

Milestone 04 is based on the corrected Milestone 03.2 project.

## Core implementation

- Adds a `GpuGlitchTile` storage-buffer structure shared by Rust and WGSL.
- Adds a fixed 32,768-instance persistent GPU buffer.
- Adds a dedicated history-sampling tile pipeline within portable bind groups 0–3.
- Adds a Rust procedural tile generator with deterministic splitmix-style hashing.
- Captures clean source frames before applying tile corruption.
- Replaces the full-frame Milestone 03 preview with instanced historical rectangles.
- Reuses the selected Smooth/Crisp history sampler.

## Newly enabled controls

`seed`, `depthScatter`, `corruptDrift`, `block`, `glitchSize`, `glitchJitter`, `glitchSmear`, `glitchSmearAngle`, `glitchSpeed`, `glitchSpeedFine`, `glitchSpeedMul`, `glitchBaseX`, and `glitchBaseY`.

Cluster controls intentionally remain pending.

## Safety limits

Extreme Corrupt and Smear settings can request more geometry than is useful. Huff does not resize the storage buffer while rendering. It keeps the first 32,768 instances and records all omitted requests in the diagnostics counter.
