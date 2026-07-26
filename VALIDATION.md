# Huff Native Milestone 15 validation

## Environment boundary

The packaging environment provides Node.js 22.16.0 and FFmpeg 7.1.3. It does not provide Cargo, rustc, rustfmt, Metal, DX12, Vulkan presentation, or a native Tauri runtime.

Rust type/borrow checking, WGSL pipeline creation, real GPU allocation, video decoding into the export graph, and application-level 4K/8K execution must therefore be validated locally before Milestone 15 is considered runtime-proven.

## Completed static checks

- `src/app.js` passes `node --check`.
- `package.json`, `package-lock.json`, and `src-tauri/tauri.conf.json` parse as JSON.
- Package, npm lockfile, Cargo manifest, Cargo lockfile project entry, and Tauri configuration identify application version `0.15.0`.
- Current application, still-export, deterministic-export, queue, repeat, lifecycle, and automation build identifiers use `HNW-15` / `hnw15`.
- The HTML contains 306 unique IDs with no duplicates.
- All 120 statically discoverable `byId(...)` frontend references resolve to HTML elements.
- Every Rust source file passes a lexical delimiter and comment/string termination audit.
- `compositor.wgsl` and `export.wgsl` pass delimiter/comment termination audits.
- The Rust and WGSL `Uniforms` structures contain the same 21 `vec4` fields in identical order, including `source_mapping`.
- The Cargo dependency set is unchanged from Milestone 14; only the project version changed.

## Full-resolution graph inspection

Source inspection confirms that deterministic export now:

- calculates output-relative history dimensions before starting;
- allocates a new bounded `GpuHistoryRing` for the export topology;
- recreates the complete offscreen target set at output dimensions;
- protects graph topology from automation snapshot application;
- selects the requested source sampler for the offline session;
- maps FIT/CROP/STRETCH in the source-composite shader before history/effects;
- performs a direct output-texture-to-buffer copy;
- does not invoke the export scaling pipeline for deterministic video frames;
- retains the export scaling pipeline for still-image export;
- reports graph mode, history dimensions/capacity, and estimated graph bytes;
- restores live topology after completion, cancellation, and failure.

The render loop skips live output readback targets while offline export is active, so the old Syphon/Spout/recording readback allocation is not used against the temporary export-sized texture.

## Restoration-path inspection

All deterministic terminal paths call `restore_after_offline_export()` after removing the active session:

- cancellation;
- rendering/decoder/encoder failure;
- successful finalization or finalization failure.

The restoration path:

1. releases offline capture and frozen input/automation state;
2. restores the prior graph or applies a deferred surface resize;
3. rebuilds the normal live source sampler bind;
4. reapplies current canonical UI state;
5. clears reconstructed temporal resources;
6. restores source position and play/pause state.

## Metadata inspection

`OfflineExportMetadata` includes backward-compatible defaulted fields for:

```text
graphMode
liveReferenceWidth
liveReferenceHeight
graphHistoryWidth
graphHistoryHeight
graphHistoryCapacity
graphEstimatedGpuBytes
```

The active offline status object exposes graph diagnostics to the frontend tooltip.

## FFmpeg synthetic profile checks

Four synthetic 64×64 RGBA frames were encoded successfully with the available FFmpeg installation through:

- libx264 / H.264 MP4;
- prores_ks / ProRes 422 HQ;
- prores_ks / ProRes 4444 alpha;
- FFV1 / Matroska;
- PNG image sequence.

These checks validate local encoder availability only. They do not validate Rust process management, muxing with real source audio, transactional commit, or GPU readback.

## Required local validation

Run the checklist in `TESTING.md`, with particular attention to:

- Cargo compilation and WGSL validation;
- native-resolution regression;
- proof that 4K/8K effect geometry is independently evaluated;
- history capacity at large dimensions;
- automation topology preservation;
- completion/cancel/failure restoration;
- deferred surface resizing;
- Syphon/Spout recovery;
- GPU allocation behavior across adapters.
