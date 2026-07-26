# Huff Native Milestone 14 validation

The packaging environment provides Node.js 22 and FFmpeg 7.1.3, but it does not provide Cargo, rustc, rustfmt, Metal, DX12, or a native Tauri runtime. Rust type/borrow checking and real GPU automation export therefore remain required on the target machine before Milestone 14 is considered fully runtime-proven.

## Passed static checks

- `src/app.js` passes `node --check` under Node.js 22.
- `package.json`, `package-lock.json`, and `src-tauri/tauri.conf.json` parse as JSON.
- Package, npm lockfile, Cargo manifest, Cargo lockfile project entry, and Tauri configuration are synchronized at `0.14.0`.
- Native build identifiers are synchronized at `HNW-14` for application info, still metadata, deterministic metadata, queue jobs, repeat jobs, and lifecycle manifests.
- All 306 HTML IDs are unique.
- All 120 static JavaScript `byId()` references resolve to existing HTML IDs.
- All 45 JavaScript Tauri command calls resolve to commands registered among the 63 `generate_handler!` entries.
- All five automation commands are registered and connected to controls.
- A 51-check integration audit passed for versioning, UI wiring, command registration, automation schema markers, renderer integration, queue integration, metadata fields, safety exclusions, and build identifiers.
- Modified Rust files pass a lexical comment/string/delimiter balance audit.
- Cargo and npm dependency sets are unchanged from Milestone 13.

## Automation architecture checks

Source inspection confirms that Milestone 14 provides:

- a versioned `AutomationClip` schema;
- parameter, parameter-batch, and action events;
- initial canonical state capture at time zero;
- canonical value validation through the parameter registry;
- numeric linear, smooth, ease-in, ease-out, and step interpolation;
- forced step behavior for Boolean and select parameters;
- stable event ordering and canonical sequence renumbering;
- an event bound of 100,000 and duration bound of 24 hours;
- exclusion of `render.*`, `history.*`, and `source.seed_on_load` from automation;
- deterministic action support for buffer clear and Flow pulse;
- exact evaluation from offline simulation time;
- optional looping with action expansion across crossed loops;
- immutable clip copies in queue configuration and export metadata;
- queue dispatch waiting while automation recording is active;
- JSON import/export and Rust-side revalidation;
- local active-clip restoration in the control surface.

## Renderer integration checks

Source inspection confirms:

- the automation player is created from the queued parameter snapshot and frozen clip;
- automation is evaluated after exact-frame decoding and before GPU state upload;
- Flow pulse uses fixed simulation time during offline export rather than wall-clock `Instant`;
- a recorded clear action resets persistent renderer state;
- offline capture bindings are rebuilt after clear replaces persistent target textures;
- automation state is removed and normal live state is restored on completion, cancellation, or failure.

## Included Rust unit tests

`src-tauri/src/automation.rs` includes tests for:

- exact numeric interpolation at a timeline midpoint;
- forced step behavior for discrete values;
- one action firing per crossed automation loop;
- action firing at frame time zero without duplicate firing.

These tests could not be executed in this environment because Cargo is unavailable.

## Existing exporter regression boundary

Milestone 14 does not change the Milestone 12 codec pipelines or transactional commit behavior. H.264, ProRes, FFV1, and PNG-sequence encoding still require local runtime regression because the renderer-to-encoder path now optionally receives time-varying state.

## Scope not runtime-validated here

- Rust compilation, type checking, and borrow checking
- Tauri state injection and command deserialization
- automation recording under real high-frequency control input
- exact GPU frame output for interpolation and action boundaries
- clear-buffer capture rebinding on Metal, Vulkan, and DX12
- long clips and the 100,000-event bound
- local-storage behavior in packaged WebViews
- queue crash recovery with frozen automation clips
- macOS and Windows packaging

## Required local validation

Run:

```bash
npm install
npm run dev:metal
```

Follow `TESTING.md`. Begin with a five-second linear control recording and two repeated native-size H.264 exports. Compare decoded frame hashes, then test preset recall, buffer clear, Flow pulse, looping, JSON import, and queue recovery before long 4K/8K exports.
