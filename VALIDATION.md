# HUFF Native Milestone 20 validation

## Packaging-environment checks

- JavaScript syntax passes `node --check src/app.js`.
- Production scripts pass `node --check`.
- JSON configuration files parse successfully.
- `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, the root package in `Cargo.lock`, and `tauri.conf.json` identify version `0.20.0`.
- Current runtime, parity, state, routing, queue, and export metadata use `HNW-20`.
- `MILESTONES.md` contains completed Milestones 01–20 and planned Milestone 21.
- `npm run validate:parity` preserves the 87/87 legacy parameter-contract match.
- `npm run validate:control-maps` validates both factory controller maps.
- `npm run validate:state-model` confirms 100 classified canonical parameters and four `huff-state/v1` document types.
- `npm run validate:routing` confirms the `huff-routing/v1` model and seven named buses.
- `npm run validate:production` confirms production module, frontend wiring, platform assets, documentation, synchronized versions, writable repository storage, and reports optional external-tool availability.
- HTML element IDs are unique.
- Tauri production commands are present in the invoke handler and called by the frontend.
- Rust and WGSL source files pass the repository lexical delimiter audit.
- Complete and changed-files ZIP archives pass integrity checks.

## Runtime boundary

The packaging environment may not include Cargo, rustc, Metal, DX12, physical output clients, or a native Tauri runtime. Therefore static validation does not certify cross-platform behavior. Run `TESTING.md`, `npm run validate:production:strict`, in-app **VERIFY**, real Syphon/Spout receivers, and packaged builds on each target machine.
