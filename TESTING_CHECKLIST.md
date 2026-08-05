# HUFF Classic Optimization Pass 22 — Testing Checklist

Compare Pass 22 directly against the committed Pass 21 baseline using the same source, canvas size, controls, window layout, mirror state, and Syphon state.

## 1. Baseline playback

- [ ] Load the same known-good video used for Pass 21.
- [ ] Confirm decoding begins normally.
- [ ] Confirm audio remains stable.
- [ ] Confirm playback FPS and frame pacing are at least as stable as Pass 21 with Scanlines disabled.
- [ ] Confirm repeated play/pause/seek behavior is unchanged.

## 2. Horizontal Scanline path

Set ANGLE to exactly `0`.

- [ ] Confirm horizontal band position matches Pass 21.
- [ ] Test low, medium, and maximum band counts.
- [ ] Test ALPHA from low to full.
- [ ] Test GAP at zero and nonzero values.
- [ ] Test FOCUS at top, center, and bottom.
- [ ] Test ROLL in both directions.
- [ ] Confirm profiler `scan path` reports direct frames.

## 3. Drift/shift specialization matrix

Test all four combinations:

### Neutral DRIFT + neutral SHIFT/SKEW

- [ ] DRIFT = 0
- [ ] SHIFT = 0
- [ ] SKEW = 0
- [ ] Confirm output parity and stable motion/position.

### Neutral DRIFT + active SHIFT or SKEW

- [ ] DRIFT = 0
- [ ] Enable SHIFT.
- [ ] Repeat with SKEW.
- [ ] Confirm source clipping and displacement parity.

### Active DRIFT + neutral SHIFT/SKEW

- [ ] Enable DRIFT.
- [ ] SHIFT = 0
- [ ] SKEW = 0
- [ ] Confirm slow/fast noise motion parity.

### Active DRIFT + active SHIFT/SKEW

- [ ] Enable DRIFT and SHIFT.
- [ ] Add SKEW.
- [ ] Confirm combined motion and clipping parity.

## 4. Rotated paths

- [ ] Test ANGLE = 45.
- [ ] Test ANGLE = -45.
- [ ] Test ANGLE = 90.
- [ ] Test a very small nonzero angle.
- [ ] Confirm profiler `scan path` reports transformed frames.
- [ ] Confirm no clipping, offset, or alpha regression.

## 5. Static prepared-band cache

Use a state where Scanline phase does not advance.

- [ ] Confirm `scan prep` shows reuse.
- [ ] Change one Scanline parameter and confirm one rebuild.
- [ ] Leave the control stable and confirm reuse resumes.
- [ ] Change angle or render size and confirm `scan geom` rebuilds.

## 6. Combined effect parity

- [ ] Scanlines + Glitch, Scanline priority first.
- [ ] Scanlines + Glitch, Glitch priority first.
- [ ] Scanlines + Pipeline Luma Key.
- [ ] Scanlines + Feedback.
- [ ] Scanlines + Flow.
- [ ] Scanlines + Solarize.
- [ ] Heavy combined scene with the same preset used for Pass 21.

## 7. Output regression

- [ ] Mirror output remains active and moving.
- [ ] Syphon starts with moving bootstrap frames.
- [ ] OBS receives moving frames, not black.
- [ ] Syphon remains stable while changing Scanline angle and count.
- [ ] Spout code path remains unaffected on Windows when available.

## 8. Resize and lifecycle

- [ ] Resize repeatedly with Scanlines active.
- [ ] Enter and leave fullscreen repeatedly.
- [ ] Replace the video source while Scanlines are active.
- [ ] Close the application and confirm no process buildup.

## Acceptance rule

Commit Pass 22 only when:

- baseline playback remains at least as stable as Pass 21;
- all four Scanline preparation combinations match visually;
- horizontal and rotated paths remain correct;
- Syphon continues to publish moving frames;
- no new shutdown or source-replacement regression appears.
