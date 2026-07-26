# HUFF Native Milestone 16 validation

## Environment limitation

The packaging environment contains Node.js but does not contain Cargo, rustc, Metal, DX12, a native Tauri runtime, or FFmpeg device access. Rust type checking, Tauri command macro expansion, wgpu pipeline creation, native file dialogs, real GPU execution, and cross-platform runtime behavior therefore require local validation.

Milestone 15’s previously observed successful and unsuccessful export cases were not reinterpreted or hidden during this packaging pass.

## Checks completed

### JavaScript

- `node --check src/app.js`
- `node --check scripts/run-backend.mjs`
- `node --check scripts/validate-parity.mjs`

All passed.

### Embedded parity contract

`npm run validate:parity` passed with:

```text
HUFF parity contract exact: 87/87
Native registry parameters: 98
Native-only parameters: 11
```

The validator checks mapped legacy identifiers, kinds, defaults, minima, maxima, steps, and select options against `parameters.rs`.

### JSON and version synchronization

- Every JSON file in the project parsed successfully.
- `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, the project entry in `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` identify version `0.16.0`.
- Current source build identifiers use `HNW-16`.
- Newly generated export, queue, and automation identifiers use the `hnw16` prefix; previously persisted identifiers remain readable because their prefix is not used as a parser or schema version.

### Frontend structure

- 312 HTML IDs were scanned with no duplicates.
- All Parity Lab elements are present.
- All four new Tauri command names are present in Rust, registered in `generate_handler!`, and invoked from the frontend.
- `src/app.js` passed syntax validation after the new debounce, profile, compare, apply, and report-export paths were added.

### Calibration-profile references

All canonical IDs referenced by the native calibration profiles exist in the 98-parameter registry. The embedded contract contains exactly 87 entries and reports exactly eleven native-only controls.

### Rust lexical structure

A comment/string-aware delimiter scan was run across all 24 Rust source files. Parentheses, brackets, and braces were balanced, including the new `parity.rs` module and command additions in `main.rs`.

This is not a substitute for `cargo check`.

### Milestone tracking

`MILESTONES.md` contains the current Milestone 16 record, titles and explanatory paragraphs for completed and planned milestones, and the rule requiring it in every future complete and changed-files archive.

## Required local checks

Run locally:

```bash
npm install
npm run validate:parity
npm run dev:metal
```

or on Windows:

```powershell
npm install
npm run validate:parity
npm run dev:dx12
```

Then verify:

1. Parity Lab loads its six profiles.
2. Compare reports `87/87` with zero contract mismatch fields.
3. Applying Legacy Defaults preserves native render/history settings.
4. Applying a profile clears feedback/history state.
5. Export Report opens a native save dialog and writes valid JSON.
6. Applying a profile while recording automation produces a parameter batch and clear-buffers action.
7. Existing playback, effects, still export, automation, and currently working deterministic export paths remain operational.

## Packaging status

Static source and archive validation can mark Milestone 16 as structurally packaged. It cannot mark the Rust/Tauri/wgpu runtime as compiled or the visual calibration as complete.
