# Milestone 06 static validation

The packaging environment does not include Cargo or rustc. The following static checks were completed:

- JavaScript syntax passed with `node --check`
- All JSON files parsed
- Rust/WGSL/JavaScript delimiter balance passed
- Rust and WGSL `Uniforms` fields match in name and order
- `Renderer` fields are all initialized
- `RendererInfo` fields are all emitted
- No shader bind-group index exceeds 3
- Global uniform visibility includes vertex and fragment stages
- Scan storage binding exists in Rust layout, bind group, and WGSL
- Scan pipeline layout binds groups 0 and 2 only
- Scan instance CPU/WGSL structures both contain three `vec4` values
- All 20 Layer Priority and Scanline registry entries are marked implemented for Milestone 06
- Package, Cargo, Tauri, and lockfile versions are synchronized at 0.6.0

Local compilation and Metal runtime testing remain required.
