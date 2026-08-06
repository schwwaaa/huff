# HUFF Classic Optimization Pass 26 — Testing Checklist

## Completed deterministic validation

- [x] stage-contract registry validates
- [x] exact 12-zone Pass 22 serial recipe validates
- [x] browser and source front-stage contracts match
- [x] SCAN TOP order matches Pass 22
- [x] GLITCH TOP order matches Pass 22
- [x] NEUTRAL even/odd alternation matches Pass 22
- [x] PULSE timing and phase match Pass 22
- [x] empty and unknown modes preserve SCAN TOP fallback
- [x] 46,880 resolver parity cases passed
- [x] group-handler compilation rejects missing handlers
- [x] changed priority contracts are rejected
- [x] no per-frame closure added inside `draw()`
- [x] no additional full-resolution p5 Graphics surface added
- [x] `src/effects.js` remains exact Pass 22
- [x] complete `src-tauri/` tree remains exact Pass 22
- [x] controls, presets, MIDI maps, and OSC maps remain unchanged
- [x] rejected Melt and Sort-Mosh code remains absent
- [x] inherited Pass 9–22 and Pass 25 validators passed

## Required target-runtime checks

- [ ] compare SCAN TOP against Pass 25
- [ ] compare GLITCH TOP against Pass 25
- [ ] confirm NEUTRAL alternates every rendered frame
- [ ] confirm PULSE timing at minimum, default, and maximum speed
- [ ] confirm Pipeline Luma Key remains in the Glitch ordering group
- [ ] test Glitch only
- [ ] test Scanlines only
- [ ] test Glitch + Scanlines
- [ ] test Glitch + Luma + Scanlines
- [ ] test front stages combined with Feedback
- [ ] test front stages combined with Flow without changing Flow character
- [ ] test front stages combined with Symmetry and Solarize
- [ ] test all four Global Mix positions
- [ ] test clean bypass and active-pipeline re-entry
- [ ] test source replacement
- [ ] test resize and fullscreen cycling
- [ ] test sustained video playback and frame pacing
- [ ] test Syphon receiver attachment and moving frames

## Not available in this environment

- [ ] `cargo check` — Cargo/Rust are not installed; native source is unchanged
- [ ] target Tauri v1 WebView runtime
- [ ] macOS Syphon receiver
- [ ] Windows Spout receiver
