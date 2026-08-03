# HUFF Classic Pass 7 Testing Checklist

**Package:** HUFF Classic Optimization Pass 7  
**Testing state:** Source and deterministic algorithm validation completed; target-machine runtime testing required

## 1. Startup and baseline

- [ ] `npm install` completes.
- [ ] `npm run dev` opens both controls and canvas windows.
- [ ] No JavaScript errors appear before a source is loaded.
- [ ] Loading a video begins playback with synchronized audio.
- [ ] Camera start, stop, refresh, and device switching still work.

## 2. Glitch placement parity

Use the same clip, seed, render size, and preset in Pass 6 and Pass 7.

- [ ] Glitch target positions match when Spatial Gap is `0`.
- [ ] Glitch target positions match with Spatial Gap enabled.
- [ ] Low, medium, and maximum Corrupt values behave identically.
- [ ] Block size and Pixel Size produce the same tile dimensions.
- [ ] Jitter produces the same displaced positions.
- [ ] Smear length and angle produce the same trails.
- [ ] Depth and Depth Scatter select the same temporal material.
- [ ] Layer Priority modes retain the same paint order.

## 3. Cluster parity

- [ ] Cluster Tiles disabled behaves exactly as Pass 6.
- [ ] Cluster Tiles enabled with Coherence `0` retains the prior boil.
- [ ] Coherence `1` retains fixed constellations moving with their centers.
- [ ] Intermediate Coherence values morph at the same apparent rate.
- [ ] Increasing and decreasing Centers preserves expected center state.
- [ ] Changing Bias changes clustered/free distribution as before.
- [ ] Changing Spread and Minimum Spread produces the same region sizes.
- [ ] Breathe expands/contracts the same constellation.
- [ ] Speed, Speed Variation, Steer, Drift, Inertia, Pulse, Bounce, and Wrap remain unchanged.
- [ ] Reducing cluster tile demand and raising it again produces no stale or duplicated offsets.

## 4. Spatial-gap stress

- [ ] Gap `0` permits unconstrained placement.
- [ ] Small gaps produce dense placement without errors.
- [ ] Large gaps reject nearby candidates as before.
- [ ] Gap values near or larger than the canvas dimension do not crash.
- [ ] High Corrupt + large Gap terminates normally at the existing attempt limits.
- [ ] Resizing the output larger causes no stale-index errors.
- [ ] Resizing smaller after a large render remains stable.

## 5. Control and preset regression

- [ ] Named presets recall correctly.
- [ ] Imported preset JSON recalls correctly.
- [ ] Reset All clears cluster physics and renders defaults.
- [ ] MIDI control of glitch and cluster parameters remains immediate.
- [ ] OSC control of glitch and cluster parameters remains immediate.
- [ ] Undo follows visible and rendered control state.

## 6. Performance and memory observation

- [ ] Toggle the built-in profiler with the backtick key.
- [ ] Record `applyGlitch` time with clusters disabled.
- [ ] Record `applyGlitch` time with clusters enabled and Coherence `0`.
- [ ] Record `applyGlitch` time with a large Spatial Gap.
- [ ] Compare control responsiveness against Pass 6.
- [ ] Observe memory for at least 20–30 minutes with a glitch-heavy preset.
- [ ] Look for reduced sawtooth memory growth or garbage-collection pauses.
- [ ] Confirm latency does not increase over time.

## 7. Syphon regression

No Syphon code changed in Pass 7, but heavy glitch output must remain stable.

- [ ] Start Syphon with no receiver; publishing remains paused while discoverable.
- [ ] Connect a receiver; publishing starts.
- [ ] Test a glitch-heavy preset at 1280×720, 30 and 60 fps.
- [ ] Test 1920×1080 at 30 fps.
- [ ] Disconnect and reconnect repeatedly.
- [ ] Check receiver drops, HUFF skipped/published counters, latency, and memory.
- [ ] Close HUFF and confirm the source and process disappear.

## 8. Remaining Pass 5/6 regression queue

- [ ] Flow Warp visual parity.
- [ ] Solarize visual parity and adaptive cadence.
- [ ] Pipeline Luma Key threshold, mix, invert, and decoded-frame caching.
- [ ] Event-driven render-state synchronization across UI, MIDI, OSC, presets, reset, and undo.
- [ ] Feedback, symmetry, Global Mix, and base-video behavior.

## 9. Cross-platform regression queue

- [ ] macOS Apple Silicon development build.
- [ ] macOS Intel or universal build.
- [ ] Windows 10/11 playback and Spout.
- [ ] Linux playback, audio, camera, mirror window, and package prerequisites.

## Validation completed in the build environment

- External JavaScript syntax checks.
- Inline HTML script syntax checks.
- JSON parsing.
- Shell-script syntax checks.
- Old/new spatial-gap acceptance equivalence across multiple dimensions, gap values, and candidate sequences.
- Old/new cluster-offset random-call and value equivalence across creation, reroll, shrink, and regrow transitions.
- Static confirmation that the active placement path no longer creates `targets` arrays, placement `Map`s, coordinate-pair arrays, cell arrays, or rerolled offset objects.
- Syphon framework file and canonical bundle directory presence checked.
- ZIP integrity checked after packaging.

## Not validated in the build environment

- Rust/Tauri compilation: Cargo is unavailable here.
- Actual macOS Syphon publication.
- Windows Spout output.
- Linux WebKitGTK runtime behavior.
- Complete visual parity on target hardware.
- Measured garbage-collection reduction on the target WebView.
