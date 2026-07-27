# Milestone 06 upgrade notes

Milestone 06 is based on Milestone 05 and adds the native scanline-band compositor plus the original binary layer-order model.

## Changed source files

- `src-tauri/src/renderer.rs`
- `src-tauri/src/compositor.wgsl`
- `src-tauri/src/parameters.rs`
- `src/app.js`
- Version and documentation files

## GPU resources

- One persistent storage buffer for up to 128 scan bands
- One instanced scanline render pipeline
- No new bind group index; the global group remains group 0
- Existing clean composite is sampled through group 2
- Existing persistent feedback targets are reused

## Behavioral scope

This milestone intentionally implements Scanlines and Layer Priority only. Smoosh, Luma Key, Global Mix, and Flow remain disabled so each remaining render-graph stage can be validated without hiding ordering defects behind several new passes at once.
