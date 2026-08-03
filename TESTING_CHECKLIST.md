# HUFF Classic Optimization Pass 11 — Testing Checklist

**Tester:** ____________________  
**Machine / OS:** ____________________  
**Build mode:** `npm run dev` / packaged app  
**Date:** ____________________

## 1. Build and validation

- [ ] `npm install` completes.
- [ ] `npm run validate:pass9` passes.
- [ ] `npm run validate:pass10` passes.
- [ ] `npm run validate:pass11` passes.
- [ ] `npm run dev` launches the controls and canvas windows.
- [ ] No new console or Rust errors appear.

## 2. True bypass behavior

Turn every effect OFF.

- [ ] Moving video displays normally.
- [ ] Audio remains continuous.
- [ ] Background selector does not leak around or replace the full video frame.
- [ ] Pausing and resuming works.
- [ ] Seeking works.
- [ ] Changing files works.
- [ ] Starting/stopping camera works.
- [ ] Re-enabling an effect starts immediately from the current source frame.

Observe clean-state CPU and memory against Pass 10:

```text
Pass 10 CPU: __________
Pass 11 CPU: __________
Pass 10 memory: _______
Pass 11 memory: _______
```

## 3. Flow neutral transition

- [ ] Flow OFF matches Pass 10.
- [ ] Flow ON with STRENGTH `0` remains clean.
- [ ] Flow ON with STRENGTH below `1` remains clean because integer strength is zero.
- [ ] Moving STRENGTH to `1` starts Flow immediately.
- [ ] Returning STRENGTH to `0` returns to clean output without stale `gBuf` pixels.
- [ ] Flow PULSE/history selection still works at positive strength.

## 4. Scanline neutral transition

- [ ] Scanlines ON with ALPHA `0` remains visually clean.
- [ ] Increasing ALPHA starts at the continuously advanced phase/spin position.
- [ ] Band count `0` is neutral.
- [ ] Increasing band count starts immediately.
- [ ] Scanline-only output remains visible with Glitch, Flow, Symmetry, Solarize, Global Mix, and Feedback OFF.
- [ ] Left/right spin continues across alpha-zero periods without resetting.

## 5. Pipeline Luma transition

- [ ] Luma ON with MIX `0` remains neutral.
- [ ] Increasing MIX activates immediately.
- [ ] Luma-only output is not discarded by the clean fallback.
- [ ] Threshold and invert controls remain unchanged.
- [ ] Decoded-frame luma cache continues to update with moving video.

## 6. Global Mix and Base Mix

- [ ] Global Mix ON with AMOUNT `0` is neutral at every insertion position.
- [ ] Increasing AMOUNT activates immediately at BEFORE, AFTER, AFTER FLOW, and FINAL.
- [ ] Base ON with MIX `0` performs no visible blend.
- [ ] Base Mix remains correct when an effect is active.
- [ ] Base ON by itself does not force stale-buffer output.

## 7. Feedback identity and active states

Set:

```text
FB X = 0
FB Y = 0
FB Z = 1
FB θ = 0
```

- [ ] FEEDBACK `0` is neutral.
- [ ] FEEDBACK `1` is visually identical to bypass.
- [ ] FEEDBACK `2` and `3` remain visually identical at the identity transform, matching the prior alpha clamp.
- [ ] FEEDBACK below `1` still changes opacity/persistence.
- [ ] Moving X or Y activates Feedback immediately.
- [ ] Changing Z activates Feedback immediately.
- [ ] Rotating θ activates Feedback immediately.
- [ ] Returning all transform controls to identity removes the redundant pass without a jump.

## 8. Symmetry no-op boundary

- [ ] Vertical Symmetry at POS `1` is neutral.
- [ ] Horizontal Symmetry at POS `1` is neutral.
- [ ] HV Symmetry at POS `1` is neutral.
- [ ] Moving POS inward activates immediately.
- [ ] POS `0`, `0.5`, and arbitrary values match Pass 10.
- [ ] Resize/fullscreen recalculates the edge condition correctly.

## 9. Solarize identity transitions

- [ ] Solarize OFF is neutral.
- [ ] THRESHOLD `1` is neutral even with non-default amount/channels.
- [ ] AMOUNT `0` with R/G/B all `1` is neutral.
- [ ] Changing any one channel multiplier activates immediately.
- [ ] Lowering THRESHOLD activates immediately.
- [ ] Non-neutral Solarize matches Pass 10.
- [ ] Audio remains stable while repeatedly entering/leaving Solarize identity states.

## 10. Layer and persistence regression

- [ ] Glitch top.
- [ ] Scanlines top.
- [ ] Neutral alternating order.
- [ ] Pulse order.
- [ ] Persistence below one works when an effect is active.
- [ ] Turning all effects off returns to current clean video.
- [ ] Turning effects back on seeds from the current frame rather than an old frame.
- [ ] Refresh and CLR BUF reset correctly.

## 11. Syphon regression

Pass 11 does not change Syphon, its worker, native code, or framework packaging.

- [ ] Start Syphon without a receiver; waiting state remains correct.
- [ ] Connect a receiver and select `huff`.
- [ ] Run all-neutral playback for 20 minutes.
- [ ] Toggle Flow/Scanline/Luma/Feedback/Solarize neutral and active states.
- [ ] No growing latency appears.
- [ ] Receiver reconnect works.
- [ ] Closing HUFF removes the Syphon source.

```text
Syphon FPS: __________
Receiver drops: ______
Start memory: ________
20-minute memory: ____
```

## 12. Canvas mirror regression

- [ ] Canvas window receives clean bypass frames.
- [ ] Canvas window receives active-effect frames.
- [ ] Closing canvas window pauses mirror encoding.
- [ ] Reopening/relaunching reconnects.
- [ ] Syphon continues independently while canvas mirror is disconnected.

## 13. Resize and long-session test

- [ ] Resize continuously in bypass.
- [ ] Resize continuously with effects active.
- [ ] Enter/leave fullscreen 20 times.
- [ ] Switch bypass ↔ active at least 100 times.
- [ ] Run moving video for at least 30 minutes.
- [ ] Memory settles after transitions and resize.

```text
Start memory: __________
Peak memory: ___________
30-minute memory: ______
```

## 14. Platform checks

### macOS

- [ ] WKWebView development run.
- [ ] Packaged ARM build.
- [ ] Universal build if available.
- [ ] Bundled `Syphon.framework` remains in `Contents/Frameworks`.

### Windows

- [ ] WebView2 neutral-path parity.
- [ ] Spout regression.

### Linux

- [ ] WebKitGTK neutral-path parity.
- [ ] Playback/audio with supported codecs.
- [ ] Shutdown leaves no process behind.

## 15. Pass/fail summary

- [ ] PASS — safe to commit and continue to renderer-ownership work.
- [ ] CONDITIONAL PASS — issue recorded; continue only if unrelated.
- [ ] FAIL — return to Pass 10 and report exact control values.

Summary:

```text

```
