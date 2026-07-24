# Huff Native wgpu Milestone 03

## Purpose

Move Huff's temporal frame storage out of CPU/JavaScript memory and into a bounded native GPU texture array before porting the full glitch tile engine.

## Changed source files

- `src-tauri/src/history.rs` — GPU texture-array ring, capacity calculation, frame-rate gating, and diagnostics
- `src-tauri/src/renderer.rs` — history allocation, source-frame capture pass, history bind group, depth selection state, and diagnostics
- `src-tauri/src/compositor.wgsl` — history capture shader and first temporal-depth sampling path
- `src-tauri/src/parameters.rs` — activates Quality and the four controls used to validate history
- `src-tauri/src/main.rs` — Milestone 03 module/build identity
- `src/app.js` — active-history UI status and diagnostics
- `src/index.html` — updated About information

## Compatibility

Milestone 03 is based on Milestone 02.1 and includes its camera/video ownership and surface-recovery fixes.

The temporal preview is intentionally not the final Glitch engine. It samples one selected historical layer over the full frame. Milestone 04 will replace that validation path with per-tile instanced history sampling while retaining the same GPU ring.
