# HUFF Native Milestone 17 validation

## Packaging-environment checks

- JavaScript syntax passes `node --check src/app.js`.
- `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, the root package in `Cargo.lock`, and `tauri.conf.json` identify version `0.17.0`.
- Current runtime metadata uses `HNW-17`.
- `MILESTONES.md` contains completed Milestones 01–17 and planned Milestones 18–21.
- `npm run validate:control-maps` verifies both example documents, their schema, targets, behaviors, curves, smoothing, and thresholds.
- MIDI and OSC map examples parse as JSON and use `huff-control-map/v1`.
- Every mapping target in the factory files exists as a canonical parameter or action.
- HTML mapping-control IDs are unique and referenced by the frontend.
- Tauri command names used by the frontend are present in the invoke handler.
- Rust files pass the repository lexical delimiter audit.
- Complete and changed-files ZIP archives pass integrity checks.

## Runtime boundary

Cargo, rustc, Metal, DX12, physical MIDI hardware, and external OSC applications are unavailable in the packaging environment. Therefore this package is structurally validated but cannot be marked as compiled or controller-verified here. The application should be tested locally using `TESTING.md`.
