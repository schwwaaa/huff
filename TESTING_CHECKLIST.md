# HUFF Classic Optimization Pass 8 — Testing Checklist

**Tester:** ____________________  
**Machine / OS:** ____________________  
**Build mode:** `npm run dev` / packaged app  
**Date:** ____________________

Pass 8 changes full-resolution buffer ownership and final Canvas2D presentation. Static tests passed, but visual/runtime confirmation is required before this pass is considered stabilized.

## 1. Launch and basic source behavior

- [ ] `npm install` completes.
- [ ] `npm run dev` launches both HUFF windows.
- [ ] File video loads.
- [ ] Audio plays without immediate breakup.
- [ ] Play, pause, scrub, refresh, and loop behavior match Pass 7.
- [ ] Camera starts/stops and can switch back to file playback.
- [ ] Closing either window leaves no HUFF process behind.

Notes:

```text

```

## 2. No-effect output and base presentation

- [ ] Disable Corrupt, Scanlines/Clusters, Feedback, Flow, Symmetry, Solarize, and Global Mix.
- [ ] Clean video fills the output exactly as before.
- [ ] Black, white, green, and blue background modes remain correct where visible.
- [ ] BASE ON/OFF and BASE MIX match Pass 7 when effects create transparent regions.
- [ ] Canvas mirror framing/aspect behavior is unchanged.

## 3. Feedback parity

Test Feedback before combining it with other passes.

- [ ] Feedback amount only.
- [ ] X translation positive and negative.
- [ ] Y translation positive and negative.
- [ ] Scale below 1, at 1, and above 1.
- [ ] Rotation in both directions.
- [ ] Persistence near 0, near 1, and above 1 using existing Classic semantics.
- [ ] Clear Buffer immediately removes accumulated feedback.
- [ ] Feedback activation does not create a one-frame flash or stale scratch image.

## 4. Flow Warp parity

- [ ] Flow on with low strength / large scale.
- [ ] Flow on with high strength / small scale.
- [ ] Pulse/history sampling.
- [ ] Implode/explode range.
- [ ] Speed at 0, 1, and high values.
- [ ] Turbulence, swirl, and spread extremes.
- [ ] No blank tiles or stale regions appear after repeated toggling.

## 5. Symmetry parity

- [ ] Vertical mode at positions 0, 0.5, and 1.
- [ ] Horizontal mode at positions 0, 0.5, and 1.
- [ ] Horizontal + vertical mode at positions 0, 0.5, and 1.
- [ ] Rapid mode switching does not leave stale quadrants.
- [ ] Symmetry edges and clipping match Pass 7.

## 6. Shared-scratch combinations

These combinations specifically validate the new ping-pong ownership.

- [ ] Feedback + Flow.
- [ ] Feedback + Symmetry.
- [ ] Flow + Symmetry.
- [ ] Feedback + Flow + Symmetry.
- [ ] Add Glitch and Scanlines to all three.
- [ ] Add Solarize.
- [ ] Add Pipeline Luma Key.
- [ ] Toggle Flow and Symmetry on/off rapidly while Feedback remains active.
- [ ] Change Global Mix insertion point through before / after / afterflow / final.

Expected: no one-frame stale content, incorrect stage order, or reference aliasing.

## 7. Resize and fullscreen allocation behavior

Record Activity Monitor memory before and after.

- [ ] Resize the controls/render window slowly across multiple dimensions.
- [ ] Drag-resize rapidly for 15 seconds.
- [ ] Enter and leave fullscreen 10 times.
- [ ] Resize while Feedback is active.
- [ ] Resize while Flow + Symmetry are active.
- [ ] Resize while Solarize and luma key are active.
- [ ] The frame ring clears after a resolution change as designed.
- [ ] Memory settles instead of increasing after every resize cycle.
- [ ] No disposed-canvas or `drawImage` exceptions appear in the console.

Memory before: __________  
Peak during resize: __________  
Settled after resize: __________

## 8. Mirror transport

- [ ] QUALITY changes still update mirror JPEG quality/FPS behavior.
- [ ] Mirror remains capped at 30 fps.
- [ ] No growing mirror latency.
- [ ] Disconnect/reopen the canvas window.
- [ ] Mirror resumes without restarting HUFF.

## 9. Syphon regression and endurance

Pass 8 does not intentionally change Syphon, but the main output canvas is now presented through direct Canvas2D calls.

- [ ] Start Syphon with no receiver: source remains discoverable and publishing pauses.
- [ ] Connect receiver: stream begins automatically.
- [ ] Disconnect receiver: capture/readback/publish pauses.
- [ ] Reconnect receiver at least five times.
- [ ] Test 1280×720 at 30 fps.
- [ ] Test 1280×720 at 60 fps if the receiver/system can sustain it.
- [ ] Test 1920×1080 at 30 fps.
- [ ] Run Feedback + Flow + Symmetry during Syphon output.
- [ ] Observe receiver dropped-frame/packet-loss indicator.
- [ ] Confirm latency does not grow over 30 minutes.
- [ ] Confirm memory does not climb continuously over 30 minutes.

Published FPS: __________  
Receiver drops: __________  
Start memory: __________  
30-minute memory: __________

## 10. Control-path regression

- [ ] Mouse/touch sliders update effects.
- [ ] MIDI updates effects.
- [ ] OSC updates effects.
- [ ] Preset load updates effects.
- [ ] Reset updates effects.
- [ ] Undo updates effects.
- [ ] Programmatic control changes still dispatch `input` or `change`.

## 11. Platform checks

### macOS

- [ ] Development build.
- [ ] Packaged ARM app.
- [ ] Packaged Intel app if available.
- [ ] Universal app.
- [ ] `Syphon.framework` exists inside `Contents/Frameworks`.
- [ ] App signing verification passes.

### Windows

- [ ] WebView2 render parity.
- [ ] Spout sender starts and publishes.
- [ ] Resize behavior and memory settle.

### Linux

- [ ] WebKitGTK video playback.
- [ ] Supported test codec plays with audio.
- [ ] Resize behavior and memory settle.
- [ ] Mirror window works.

## 12. Pass/fail summary

- [ ] PASS — safe to commit and continue.
- [ ] CONDITIONAL PASS — issues documented but optimization can continue.
- [ ] FAIL — revert to Pass 7 and report exact failing combination.

Summary:

```text

```
