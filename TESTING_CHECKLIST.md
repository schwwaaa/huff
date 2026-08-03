# HUFF Classic Optimization Pass 10 — Testing Checklist

**Tester:** ____________________  
**Machine / OS:** ____________________  
**Build mode:** `npm run dev` / packaged app  
**Date:** ____________________

## 1. Build and launch

- [ ] `npm install` completes.
- [ ] `npm run validate:pass10` passes.
- [ ] `npm run dev` compiles and launches both windows.
- [ ] File playback, audio, transport, camera, and shutdown work.
- [ ] No new console errors appear.

## 2. Basic Scanline parity

Compare with Pass 9 where possible.

- [ ] Scanlines OFF produces the same output.
- [ ] Scanlines ON at defaults matches Pass 9.
- [ ] ALPHA at 0, middle, and 1.
- [ ] Band count at minimum, middle, and maximum.
- [ ] Radius/band size at minimum, middle, and maximum.
- [ ] No missing corners, blank strips, or changed band order.

Notes:

```text

```

## 3. Angle and spin

- [ ] ANGLE = 0°.
- [ ] ANGLE = 90°.
- [ ] ANGLE = -90°.
- [ ] ANGLE = 45° and -45°.
- [ ] ANGLE at arbitrary values such as 17.5° and 133°.
- [ ] SPIN L only.
- [ ] SPIN R only.
- [ ] Both spin toggles active; existing right-wins behavior remains.
- [ ] SPIN SPEED minimum and maximum.
- [ ] Rotated bands still cover all four corners.

## 4. Static prepared-band reuse

Set:

```text
SPEED = 0
SPIN L = off
SPIN R = off
```

- [ ] Video continues playing through fixed band positions.
- [ ] No frozen source image appears.
- [ ] Moving any Scanline control updates immediately.
- [ ] Changing SEED updates the fixed band positions immediately.
- [ ] Changing ANGLE invalidates and rebuilds correctly.
- [ ] Resizing invalidates and rebuilds correctly.
- [ ] Returning to static settings remains stable.

## 5. Drift, shift, skew, focus, roll, and gap

- [ ] DRIFT = 0 matches Pass 9.
- [ ] DRIFT at maximum remains animated and stable.
- [ ] SHIFT = 0 and SKEW = 0 matches Pass 9.
- [ ] SHIFT maximum with SKEW negative and positive extremes.
- [ ] FOCUS = 0, 0.5, and 1.
- [ ] ROLL negative, zero, and positive extremes.
- [ ] GAP = 0, small, and maximum.
- [ ] SPEED = 0, default, and maximum.

## 6. Layer-priority regression

- [ ] SCAN TOP.
- [ ] GLITCH TOP.
- [ ] NEUTRAL alternating mode.
- [ ] PULSE layer mode at slow and fast speeds.
- [ ] Pipeline Luma Key still travels with Glitch rather than Scanlines.
- [ ] Global Mix insertion positions remain unchanged.

## 7. Heavy Canvas2D combinations

- [ ] Scanlines + dense Glitch.
- [ ] Scanlines + Feedback.
- [ ] Scanlines + Flow.
- [ ] Scanlines + Feedback + Flow + Symmetry.
- [ ] Scanlines + Solarize.
- [ ] Scanlines + Pipeline Luma Key.
- [ ] Controls remain responsive at high band count.

Observed render FPS / responsiveness:

```text

```

## 8. Resize and fullscreen

- [ ] Resize continuously with Scanlines active.
- [ ] Enter/leave fullscreen 20 times.
- [ ] Test horizontal, diagonal, and spinning angles during resize.
- [ ] No stale span geometry or clipped corners appear.
- [ ] Memory settles after resizing stops.

Start memory: __________  
Peak memory: __________  
Settled memory: __________

## 9. Syphon regression

Pass 10 does not modify Syphon code or framework packaging.

- [ ] Start Syphon and connect a receiver.
- [ ] Run high-band Scanlines at 720p30/60.
- [ ] Run high-band Scanlines at 1080p30.
- [ ] Test static SPEED = 0 and active SPIN.
- [ ] Observe receiver drops, latency, and HUFF responsiveness.
- [ ] Disconnect/reconnect the receiver.
- [ ] Close HUFF and confirm the Syphon source disappears.

Syphon FPS: __________  
Receiver drops: __________  
Start memory: __________  
30-minute memory: __________

## 10. Platform checks

### macOS

- [ ] WKWebView development run.
- [ ] Packaged ARM application.
- [ ] Universal application if available.
- [ ] Bundled `Syphon.framework` remains in `Contents/Frameworks`.

### Windows

- [ ] WebView2 Scanline visual parity.
- [ ] Spout regression.

### Linux

- [ ] WebKitGTK Scanline visual parity.
- [ ] Playback/audio regression with supported codecs.

## 11. Pass/fail summary

- [ ] PASS — safe to commit and continue.
- [ ] CONDITIONAL PASS — issue recorded; optimization may continue.
- [ ] FAIL — revert to Pass 9 and report the exact angle/control combination.

Summary:

```text

```
