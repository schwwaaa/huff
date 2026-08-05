# HUFF Classic Optimization Pass 21 — Testing Checklist

## Required baseline comparison

Compare Pass 21 directly with committed Pass 20 using the same source, render dimensions, controls, output state, and window size.

## Video and audio

- [ ] Video loads through the existing file picker.
- [ ] Playback begins normally.
- [ ] Audio remains clean and synchronized.
- [ ] Play, pause, loop, speed, and seek remain unchanged.
- [ ] Replacing the source remains stable.

## Flow visual parity

Test each control independently and in combination:

- [ ] STRENGTH
- [ ] SCALE
- [ ] SPEED
- [ ] TURBULENCE
- [ ] SWIRL
- [ ] IMPLODE
- [ ] SPREAD
- [ ] PULSE

Specific parity tests:

- [ ] SWIRL = 0 produces the same image as Pass 20.
- [ ] Positive and negative SWIRL match Pass 20.
- [ ] TURBULENCE = 0 and TURBULENCE > 0 match Pass 20.
- [ ] Positive and negative IMPLODE match Pass 20.
- [ ] Minimum and maximum SCALE match Pass 20.
- [ ] Low and high SPREAD match Pass 20.
- [ ] PULSE uses the same historical frames.
- [ ] Edge tiles do not show clipping or stale pixels.
- [ ] Changing SCALE while running rebuilds correctly.
- [ ] Resizing/fullscreen while Flow is active rebuilds correctly.

## Cache telemetry

Open the profiler with backtick:

- [ ] `flow grid` mostly reports reuse while size/SCALE remain stable.
- [ ] `flow freq` mostly reports reuse while size/SCALE/SPREAD remain stable.
- [ ] Changing SPREAD causes a frequency rebuild.
- [ ] `flow swirl` mostly reports reuse while size/SCALE/SWIRL remain stable.
- [ ] Changing SWIRL causes a SWIRL rebuild.
- [ ] Changing SPEED, STRENGTH, TURBULENCE, IMPLODE, or PULSE does not unnecessarily rebuild frequency/SWIRL fields.

## Combined effects

- [ ] Flow + Glitch
- [ ] Flow + Scanlines
- [ ] Flow + Feedback
- [ ] Flow + Solarize
- [ ] Flow + Pipeline Luma Key
- [ ] Flow + Glitch + Scanlines + Feedback

## Outputs

- [ ] Canvas mirror remains active and visually correct.
- [ ] Syphon starts with moving frames; no black-source regression.
- [ ] Syphon survives enabling/disabling Flow.
- [ ] Syphon disconnect/reconnect remains functional.
- [ ] Spout source path remains unchanged for later Windows validation.

## Stability

- [ ] Run Flow continuously for at least 30 minutes.
- [ ] Sweep SCALE, SPREAD, and SWIRL repeatedly.
- [ ] Repeat window resize/fullscreen cycles.
- [ ] Watch WebView memory for unbounded growth.
- [ ] Close the application and confirm no HUFF process remains.

## Acceptance rule

Commit Pass 21 only when normal playback is at least as stable as Pass 20 and Flow output remains visually equivalent across the tests above.
