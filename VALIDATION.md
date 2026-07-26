# HUFF Native Milestone 19 validation

## Packaging-environment checks

- JavaScript syntax passes `node --check src/app.js`.
- JSON configuration files parse successfully.
- `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, the root package in `Cargo.lock`, and `tauri.conf.json` identify version `0.19.0`.
- Current runtime, parity, state, queue, and export metadata use `HNW-19`.
- `MILESTONES.md` contains completed Milestones 01–19 and planned Milestones 20–21.
- `npm run validate:parity` preserves the 87/87 legacy parameter-contract match.
- `npm run validate:control-maps` validates both factory controller maps.
- `npm run validate:state-model` confirms 100 classified canonical parameters and the four `huff-state/v1` document types.
- `npm run validate:routing` confirms the `huff-routing/v1` model, seven named buses, constrained recipes, Program/Monitor canonical parameters, renderer pipelines, route UI, command registration, and Routing state-domain classification.
- HTML element IDs are unique.
- Tauri routing commands are present in the invoke handler and called by the frontend.
- Rust and WGSL source files pass the repository lexical delimiter audit.
- Complete and changed-files ZIP archives pass integrity checks.

## Runtime boundary

Cargo, rustc, Metal, DX12, physical output clients, and a native Tauri runtime are unavailable in the packaging environment. Therefore the package is structurally validated but cannot be marked as compiled or runtime-verified here. Use `TESTING.md` locally.
