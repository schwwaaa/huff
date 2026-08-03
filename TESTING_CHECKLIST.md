# HUFF Classic Pass 6 Testing Checklist

**Package:** HUFF Classic Optimization Pass 6  
**Testing state:** Source validation completed; target-machine runtime testing required

## 1. Startup and baseline

- [ ] `npm install` completes.
- [ ] `npm run dev` opens both controls and canvas windows.
- [ ] No JavaScript errors appear before a source is loaded.
- [ ] Loading a video begins playback with synchronized audio.
- [ ] Camera start, stop, refresh, and device switching still work.

## 2. Control-cache parity

Test each category while video is running. A visible control change must affect the image immediately.

- [ ] Glitch ON/OFF and all glitch ranges.
- [ ] History depth, scatter, corrupt drift, pixel size, and smear.
- [ ] Cluster tiles, centers, spread, speed, steer, inertia, coherence, bounds, pulse, and breathe.
- [ ] Scanline ON/OFF, count, radius, alpha, shift, drift, angle, spin, gap, skew, focus, and roll.
- [ ] Feedback amount, persistence, X, Y, zoom, and rotation.
- [ ] Flow enable, strength, scale, pulse, pull, speed, turbulence, swirl, and spread.
- [ ] Symmetry enable, mode, and position.
- [ ] Solarize enable, threshold, amount, and RGB controls.
- [ ] Pipeline luma key enable, threshold, mix, and inversion.
- [ ] Global Mix enable, blend mode, amount, and insertion position.
- [ ] Base-video enable and amount.
- [ ] Background mode and layer-priority modes.

## 3. Programmatic control paths

These paths are especially important because Pass 6 synchronizes through control events.

- [ ] Load a named preset and confirm every recalled parameter affects rendering.
- [ ] Import a preset JSON file and recall it.
- [ ] Use Reset All and confirm the renderer returns to HTML defaults.
- [ ] Use Reset Feedback Motion and confirm all four motion values update visually.
- [ ] Use scan-angle snap buttons and confirm immediate angle changes.
- [ ] Move several mapped controls over MIDI.
- [ ] Toggle several mapped controls over MIDI.
- [ ] Move several mapped controls over OSC.
- [ ] Toggle several mapped controls over OSC.
- [ ] Undo a parameter change with Ctrl/Cmd+Z and confirm rendered state follows the UI.

## 4. Integer-control parity

Pass 6 preserves previous `parseInt()` behavior with explicit truncation. Test MIDI/OSC intermediate values on these controls:

- [ ] Glitch base X/Y.
- [ ] Pixel/block size and smear length.
- [ ] Scan count, radius, and gap.
- [ ] Spatial gap and cluster counts/spreads.
- [ ] Flow strength, scale, and pulse.

The result should remain discrete rather than producing fractional tile dimensions or counts.

## 5. Visual parity against Pass 5

Using the same clip, seed, resolution, and preset:

- [ ] Glitch tile locations and temporal history feel unchanged.
- [ ] Layer Priority modes retain the same paint order.
- [ ] Scanline placement and spin are unchanged.
- [ ] Cluster movement and coherence are unchanged.
- [ ] Feedback transform is unchanged.
- [ ] Flow Warp is unchanged.
- [ ] Solarize and luma-key results are unchanged.
- [ ] Global Mix insertion positions are unchanged.

## 6. Performance observation

- [ ] Toggle the built-in profiler with the backtick key.
- [ ] Record idle FPS with a video loaded and effects disabled.
- [ ] Record FPS with the normal working preset.
- [ ] Record FPS with glitch + clusters + flow + Solarize.
- [ ] Compare control responsiveness during sustained rendering.
- [ ] Observe CPU and memory for at least 20–30 minutes.
- [ ] Confirm latency does not increase over time.

## 7. Syphon regression

No Syphon code changed in Pass 6, but render-thread changes must not destabilize it.

- [ ] Start Syphon with no receiver; publishing remains paused while source stays discoverable.
- [ ] Connect a receiver; publishing starts.
- [ ] Disconnect and reconnect repeatedly.
- [ ] Test 1280×720 at 30 and 60 fps.
- [ ] Test 1920×1080 at 30 fps.
- [ ] Test with a heavy effect preset active.
- [ ] Check receiver drops, HUFF skipped/published counters, latency, and memory.
- [ ] Close HUFF and confirm the source and process disappear.

## 8. Cross-platform regression queue

- [ ] macOS Apple Silicon development build.
- [ ] macOS Intel or universal build.
- [ ] Windows 10/11 playback and Spout.
- [ ] Linux playback, audio, camera, mirror window, and package prerequisites.

## Validation completed in the build environment

- External JavaScript syntax checks.
- Inline HTML script syntax checks.
- JSON parsing.
- Shell-script syntax checks.
- Render-state key coverage: every state property used by draw/glitch/scanlines is registered in `hookUI()`.
- Static hot-path comparison confirmed removal of direct DOM reads/parsing from the active draw/effect path.
- Syphon framework file and canonical bundle directory presence checked.
- ZIP integrity checked after packaging.

## Not validated in the build environment

- Rust/Tauri compilation: Cargo is unavailable here.
- Actual macOS Syphon publication.
- Windows Spout output.
- Linux WebKitGTK runtime behavior.
- Visual parity on target hardware.
