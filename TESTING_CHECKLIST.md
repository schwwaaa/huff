# HUFF Classic Optimization Pass 25 — Testing Checklist

## Completed deterministic validation

- [x] Pass 9 validator
- [x] Pass 10 validator
- [x] Pass 11 validator
- [x] Pass 13S validator
- [x] Pass 14 validator
- [x] Pass 15 validator
- [x] Pass 16 validator
- [x] Pass 16S validator
- [x] Pass 17 validator
- [x] Pass 18 validator
- [x] Pass 19 validator
- [x] Pass 20 validator
- [x] Pass 21 validator
- [x] Pass 22 validator
- [x] Pass 25 recipe validator

## Completed Pass 25 checks

- [x] runtime recipe matches the Pass 24 12-zone route skeleton
- [x] runtime legal-zone and resource rules match stage contracts
- [x] immutable recipe validates at startup
- [x] exact compiled dispatch order matches Pass 22
- [x] reordered recipe is rejected
- [x] unknown stage is rejected
- [x] incorrect Global Mix position is rejected
- [x] missing stage handler is rejected
- [x] `pipeline-runtime.js` loads before `effects.js` and `canvas.js`
- [x] Flow/effects source remains exact Pass 22
- [x] native tree remains exact Pass 22
- [x] undeclared source changes are rejected against the Pass 24 manifest
- [x] Feedback snapshot occurs before clear
- [x] Flow and Symmetry swaps remain present
- [x] p5 `createGraphics()` count remains unchanged
- [x] no per-frame closure was added inside `draw()`
- [x] rejected Melt/Sort-Mosh code remains absent

## Completed static/package checks

- [x] 80 project-owned JavaScript, ES module, and CommonJS files pass `node --check`
- [x] 32 inline HTML scripts pass `node --check`
- [x] 34 JSON files parse successfully
- [x] 2 TOML files parse successfully
- [x] 6 shell scripts pass `bash -n`
- [x] ZIP archive passes integrity testing

## Superseded historical validators

- [x] Pass 23 and Pass 24 validators remain in the archive for their original packages
- [x] They are intentionally not expected to pass against Pass 25 because they require the runtime to remain byte-for-byte Pass 22 and require the contract registry to stay detached
- [x] Pass 25 replaces those assumptions with constrained-change and runtime-recipe validation

## Required application runtime testing

- [ ] launch controls and canvas windows
- [ ] load the same known-good Pass 22 video
- [ ] confirm clean bypass
- [ ] confirm active-pipeline entry and re-entry
- [ ] compare Glitch
- [ ] compare Pipeline Luma Key
- [ ] compare Scanlines
- [ ] compare `scan`, `glitch`, `neutral`, and `pulse` layer-priority modes
- [ ] compare all four Global Mix positions
- [ ] compare Feedback
- [ ] compare Flow exactly against Pass 22
- [ ] compare Symmetry
- [ ] compare Solarize
- [ ] test combined worst-case scene
- [ ] test resize and fullscreen cycling
- [ ] test source replacement
- [ ] test Syphon receiver attachment and moving frames
- [ ] test sustained playback and frame pacing

## Not available in this environment

- [ ] `cargo check` — Cargo is not installed; native source is unchanged
- [ ] target Tauri WebView runtime
- [ ] macOS Syphon receiver
- [ ] Windows Spout receiver
