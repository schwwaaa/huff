# HUFF Classic Optimization Pass 25 — Validation Report

## Scope

Pass 25 integrates the exact Pass 22 route into a validated serial recipe runtime without adding user-facing routing, changing effect algorithms, or allocating another full-resolution buffer.

## Deterministic recipe validation

`node scripts/validate-pass25.mjs` confirms:

- the browser recipe matches the Pass 24 12-zone route skeleton;
- stage legal-zone rules match the contract registry;
- scratch and swap rules match the contract registry;
- the recipe and registries are immutable;
- compiled dispatch order is exact;
- source synchronization, persistence, effects, and presentation execute in the expected order;
- reordered routes are rejected;
- unknown stages are rejected;
- invalid Global Mix conditional positions are rejected;
- missing handlers are rejected before use.

## Runtime preservation checks

- `src/effects.js` remains exact Pass 22:

```text
2b352fa279c728ba292485fe22a0e580c6a3f36d669bd9741f79d5af4454dd44
```

- the complete `src-tauri/` tree matches the Pass 22 manifest;
- all Pass 24 source files except the declared `canvas.js` and `index.html` changes remain exact;
- `src/pipeline-runtime.js` is the only added runtime file;
- Flow dispatch parameters remain unchanged;
- Feedback still copies to `gScratch` before clearing `gBuf`;
- Flow and Symmetry still swap `gBuf` and `gScratch`;
- the count of full-resolution p5 Graphics allocations remains unchanged;
- rejected Melt and Sort-Mosh code remains absent.

## Inherited validators completed

The following validators pass against Pass 25:

```text
Pass 9
Pass 10
Pass 11
Pass 13S
Pass 14
Pass 15
Pass 16
Pass 16S
Pass 17
Pass 18
Pass 19
Pass 20
Pass 21
Pass 22
Pass 25
```

Pass 23 and Pass 24 validators are intentionally superseded. Their purpose was to prove that the runtime stayed byte-for-byte Pass 22 and that the registry was not loaded. Pass 25 deliberately changes those two conditions while validating a tightly constrained set of runtime files.

## Static checks

The final package was checked for:

- 80 project-owned JavaScript/ESM/CommonJS files with `node --check`;
- 32 inline HTML scripts with `node --check`;
- 34 JSON files parsed successfully;
- 2 TOML files parsed successfully;
- 6 shell scripts with `bash -n`;
- ZIP integrity.

## Browser smoke-test limitation

A local Chromium smoke test was attempted, but this execution environment blocks local `file:` and localhost navigation by policy. No browser-runtime success claim is made from that attempt.

## Native validation

`cargo check` was not run because Cargo is not installed. The native tree is unchanged and verified against the Pass 22 manifest.

## Runtime claims

No FPS improvement is claimed. No visual change is intended. Actual Pass 22 parity, media playback, Syphon, Spout, and long-session behavior require application testing on the target platforms.
