# HUFF Native Milestone 21 validation

## Packaging-environment checks

- JavaScript syntax passes `node --check src/app.js`.
- Interop and production scripts pass `node --check`.
- JSON configuration files parse successfully.
- package, Cargo, lock, and Tauri metadata identify version `0.21.0`.
- Current runtime, parity, state, routing, queue, export, production, and interop metadata use `HNW-21`.
- `MILESTONES.md` contains completed Milestones 01–21.
- `npm run validate:interop` confirms:
  - `huff-interop-report/v1`;
  - Metal, IOSurface, D3D12, D3D11On12, and Vulkan candidate records;
  - `ExternalOutputFrame` typed seam;
  - Syphon/Spout external submission wiring;
  - native/frontend command wiring;
  - INTEROP interface identifiers;
  - no claim that native texture sharing is enabled.
- `npm run validate:parity` preserves the 87/87 legacy parameter-contract match.
- `npm run validate:control-maps` validates factory controller maps.
- `npm run validate:state-model` confirms all canonical parameters and four state document types.
- `npm run validate:routing` confirms seven named buses and constrained recipes.
- `npm run validate:production` confirms production diagnostics, assets, and current version wiring.
- HTML IDs are unique.
- Rust and WGSL files pass lexical delimiter checks.
- Complete and changed-files ZIP archives pass integrity verification.

## Runtime boundary

The packaging environment does not include Cargo, rustc, Metal, DX12, physical receivers, or a native Tauri runtime. Static validation therefore does not certify:

- Rust compilation;
- Syphon/Spout runtime regression;
- raw Metal or Direct3D handle access;
- GPU fence correctness;
- multi-GPU behavior;
- receiver compatibility;
- end-to-end latency.

Run `TESTING.md` locally. Native texture sharing remains disabled, so Milestone 21 should not be interpreted as a completed zero-copy implementation.
