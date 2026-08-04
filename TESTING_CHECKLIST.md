# HUFF Classic Pass 17 — Testing Checklist

## Baseline comparison

- [ ] Confirm ordinary playback matches committed Pass 16S with Luma Key disabled.
- [ ] Confirm FPS and audio stability are unchanged with all effects disabled.
- [ ] Confirm the canvas mirror remains stable.

## Pipeline Luma Key parity

- [ ] Enable Luma Key without Glitch and verify clean-region behavior.
- [ ] Enable Glitch + Luma Key and compare the boundary against Pass 16S.
- [ ] Sweep threshold from 0 to 1 slowly.
- [ ] Test threshold endpoints 0 and 1.
- [ ] Toggle Invert at several threshold values.
- [ ] Sweep Mix from 0 to 1.
- [ ] Confirm Mix 0 remains a true no-op.
- [ ] Test bright footage, dark footage, and high-contrast footage.
- [ ] Confirm glitch trails remain visible only in the intended regions.
- [ ] Confirm the cached patch updates on every new decoded frame.
- [ ] Pause video and verify the cached key remains stable.
- [ ] Seek and verify the patch updates after the decoded frame changes.

## Combined effects

- [ ] Glitch + Luma Key + Scanlines.
- [ ] Luma Key + Feedback.
- [ ] Luma Key + Flow.
- [ ] Luma Key + Solarize.
- [ ] Luma Key + Solarize + Feedback under sustained load.

## Profiler

- [ ] Open the backtick profiler.
- [ ] Record `applyPipelineLumaKey` average time on Pass 16S.
- [ ] Record the same scene on Pass 17.
- [ ] Observe `luma read`, `luma xform`, `luma upload`, and `luma pres`.
- [ ] Confirm `luma cache` shows reuse when render FPS exceeds decode FPS.
- [ ] Close the profiler and confirm normal performance returns.

## Syphon regression

- [ ] Start Syphon before opening OBS.
- [ ] Confirm the one-fps bootstrap publishes while no receiver is attached.
- [ ] Select `huff` in OBS and confirm live frames appear.
- [ ] Confirm the selected 30/60 fps rate resumes after attachment.
- [ ] Run Luma Key while Syphon is connected.
- [ ] Confirm no black-frame or zero-frame regression.
- [ ] Disconnect and reconnect OBS.

## Long-session stability

- [ ] Run video for at least 30 minutes with Luma Key active.
- [ ] Repeat threshold and invert changes.
- [ ] Replace the video source several times.
- [ ] Watch CPU, memory, audio, and frame pacing.
- [ ] Confirm the application closes without process buildup.

## Acceptance rule

Retain Pass 17 only when visual behavior is unchanged and target-runtime stability is equal to or better than committed Pass 16S.
