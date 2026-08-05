# HUFF Classic Pass 20 — Runtime Testing Checklist

Compare Pass 20 directly against the committed Pass 19 baseline using the same source, render size, control state, and output configuration.

## Required baseline check

- [ ] Load the same video used to validate Pass 19.
- [ ] Confirm playback and audio are as stable as Pass 19 with all effects disabled.
- [ ] Confirm no video decode error.
- [ ] Confirm seeking, looping, pause, resume, and file replacement.

## Glitch parity

- [ ] Test low and high tile counts.
- [ ] Test JITTER at 0, middle, and maximum.
- [ ] Test SMEAR with angle 0.
- [ ] Test SMEAR with a fixed nonzero angle.
- [ ] Test temporal DEPTH and DEPTH SCATTER.
- [ ] Test cluster tiles, coherence, bounce/wrap, and movement.
- [ ] Confirm tile positions and temporal behavior match Pass 19.

## Scanline parity

- [ ] Test static Scanlines with SPEED 0.
- [ ] Test moving Scanlines with SHIFT enabled.
- [ ] Test positive and negative SKEW if available in the control range.
- [ ] Test SPIN LEFT and SPIN RIGHT.
- [ ] Confirm band positions, clipping, and motion match Pass 19.

## Persistence parity

- [ ] Test PERSISTENCE near 0, middle, near 1, and exactly 1.
- [ ] Confirm decay appearance matches Pass 19.
- [ ] Combine persistence with Glitch, Feedback, and Scanlines.

## Flow parity and telemetry

- [ ] Test several SCALE values.
- [ ] Confirm Flow output matches Pass 19.
- [ ] Open the backtick profiler.
- [ ] Confirm `flow tiles` equals `flow draws` for ordinary active Flow frames.
- [ ] Confirm `flow grid` shows reuse during a stable SCALE/resolution state.
- [ ] Change SCALE and confirm a grid rebuild is reported.

## Scanline telemetry

- [ ] Confirm `scan bands` and `scan draws` appear only when Scanlines are active.
- [ ] Confirm the two values match for an ordinary frame.
- [ ] Confirm profiler hidden/visible state does not change the visual output.

## Output regression

- [ ] Start Syphon before attaching OBS.
- [ ] Confirm the one-fps bootstrap produces a moving current frame after attachment.
- [ ] Confirm Pass 19's Syphon status and timing telemetry remains functional.
- [ ] Test 30 fps and 60 fps Syphon output.
- [ ] Test the JPEG canvas mirror.
- [ ] On Windows, test Spout when available.

## Performance comparison

Record profiler values for Pass 19 and Pass 20 under identical states:

- [ ] Glitch only: `applyGlitch`, `gl tiles`, `gl draws`.
- [ ] Scanlines only: `applyScanlines`, `scan bands`, `scan draws`.
- [ ] Flow only: `applyFlowWarp`, `flow tiles`, `flow draws`.
- [ ] Glitch + Scanlines + Flow.
- [ ] Outputs disabled.
- [ ] Syphon connected.
- [ ] Mirror connected.
- [ ] Syphon + mirror connected.

## Soak and shutdown

- [ ] Run for at least 20 minutes with video and active effects.
- [ ] Change files repeatedly.
- [ ] Resize and toggle fullscreen repeatedly.
- [ ] Disconnect and reconnect Syphon/OBS.
- [ ] Close HUFF and confirm no lingering process, camera track, or output server.

## Rejection criteria

Reject Pass 20 if any of the following occurs:

- playback is less stable than Pass 19;
- Glitch, Scanline, persistence, or Flow output visibly changes;
- Syphon returns to black/no-frame behavior;
- profiler telemetry changes output or pacing when hidden;
- repeated source changes or shutdown regress.
