# HUFF Native Milestone 18 validation

## Packaging-environment checks

- JavaScript syntax passes `node --check src/app.js`.
- `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, the root package in `Cargo.lock`, and `tauri.conf.json` identify version `0.18.0`.
- Current runtime and export metadata use `HNW-18`.
- `MILESTONES.md` contains completed Milestones 01–18 and planned Milestones 19–21.
- `npm run validate:parity` reports the existing 87/87 legacy parameter contract match.
- `npm run validate:control-maps` validates both factory controller maps.
- `npm run validate:state-model` confirms the `huff-state/v1` schema, four document kinds, five parameter domains, 98 classified parameters, Tauri command registration, UI wiring, sequenceability metadata, interpolation metadata, and explicit persistent-image separation.
- HTML element IDs are unique.
- Tauri command names used by the State Library are present in the invoke handler.
- Rust source files pass the repository lexical delimiter audit.
- Complete and changed-files ZIP archives pass integrity checks.

## Runtime boundary

Cargo, rustc, Metal, DX12, physical controllers, and a native Tauri runtime are unavailable in the packaging environment. Therefore this package is structurally validated but cannot be marked as compiled or runtime-verified here. Use `TESTING.md` locally.
