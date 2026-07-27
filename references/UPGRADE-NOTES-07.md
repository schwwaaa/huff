# Milestone 07 upgrade notes

Milestone 07 is based on the working Milestone 06 project and adds the remaining core native render-graph layers.

## Added

- Native Smoosh compositor with isolated glitch and scanline targets
- Original Smoosh base/over inversion and Amount behavior
- Sixteen WGSL blend modes
- Native Luma Key using clean-source luminance
- Native Global Mix with Before FB, After FB, After Flow, and Final placement
- Native Flow warp with Strength, Scale, Speed, Implode/Explode, Swirl, Turbulence, Spread, Pulse, Carry, and Target routing
- Flow Pulse Fire Tauri command and control wiring
- Expanded native renderer diagnostics

## Render-order rules preserved

- Smoosh supersedes Layer Priority.
- Smoosh forces Flow to Final.
- Flow Target Glitch/Scan overrides Layer Priority while Flow is active.
- Luma Key remains immediately after the glitch contribution.
- After Flow Global Mix follows Flow wherever the Flow target places it.
- Final Global Mix runs after all remaining processing.

## Known parity note

Carry is implemented as a bounded GPU accumulation approximation in this milestone. It is functional and monotonic, but it does not yet keep the exact original per-cell CPU accumulator state. This belongs in the later parity/tuning pass.
