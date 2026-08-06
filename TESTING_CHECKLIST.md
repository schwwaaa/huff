# HUFF Classic Optimization Pass 30 — Testing Checklist

## Completed deterministic/static validation

- [x] CLASSIC route exactly matches the Pass 22 route skeleton.
- [x] CRISP FINISH moves only the existing front overlay group.
- [x] Both recipes contain each required stage exactly once.
- [x] Both recipes retain all four legal Global Mix positions.
- [x] Both recipes declare three full-resolution buffers, `gScratch`, and zero cycles.
- [x] Both recipes compile once.
- [x] Atomic switch occurs before source synchronization.
- [x] Invalid route ID recovers to CLASSIC.
- [x] Legacy and unknown preset route IDs recover to CLASSIC.
- [x] Flow/effects are byte-identical to Pass 29 / Pass 22.
- [x] Complete `src-tauri/` tree is byte-identical to Pass 29.
- [x] Applicable Pass 9–22 behavioral validators pass.
- [x] Pass 30 validator passes.
- [x] Release preflight remains 38 checks with zero blockers.
- [x] JavaScript, inline scripts, JSON, TOML, and shell syntax pass.

## Required application test

### 1. CLASSIC parity

- [ ] Launch Pass 29 and Pass 30 with the same known-good video and settings.
- [ ] Leave `PIPELINE / RECIPE` on `CLASSIC`.
- [ ] Confirm Flow, Scanlines, Glitch, Feedback, Symmetry, Solarize, Layer Priority, and Global Mix behave the same.
- [ ] Confirm playback pacing and output behavior remain the same.

### 2. CRISP FINISH distinction

Use a clearly visible combination:

```text
Glitch ON
Scanlines ON
Flow ON
Symmetry or Solarize ON
```

- [ ] Switch from `CLASSIC` to `CRISP FINISH` while video is playing.
- [ ] Confirm the switch happens in one frame without a blank frame or exception.
- [ ] Confirm Glitch and Scanlines appear after Flow/Symmetry/Solarize and remain visibly sharper.
- [ ] Confirm Layer Priority still changes Glitch-versus-Scanline paint order.
- [ ] Test all four Global Mix positions.

### 3. Repeated live switching

- [ ] Switch CLASSIC ↔ CRISP FINISH at least 50 times during playback.
- [ ] Confirm no buffer growth, frozen output, accumulating delay, or console error.
- [ ] Confirm the persistent image continues rather than being silently cleared on every switch.

### 4. Presets and undo

- [ ] Save a preset in CRISP FINISH and confirm recall restores CRISP FINISH.
- [ ] Save a preset in CLASSIC and confirm recall restores CLASSIC.
- [ ] Load a pre-Pass-30 preset while CRISP FINISH is active; confirm it loads CLASSIC.
- [ ] Change the recipe and use Cmd/Ctrl+Z; confirm undo restores the prior recipe.

### 5. Output smoke test

- [ ] Start the platform output in use: Syphon, Spout, or canvas mirror.
- [ ] Switch recipes repeatedly.
- [ ] Confirm output remains connected and presents the selected recipe.
- [ ] Close and relaunch HUFF; confirm no orphan process or occupied port.

## Platform release testing still pending

The native installer, signing/notarization, Windows Spout, Linux codec/camera, and platform soak tests from Pass 29 remain release requirements.
