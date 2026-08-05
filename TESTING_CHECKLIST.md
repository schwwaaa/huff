# HUFF Classic Optimization Pass 19 — Testing Checklist

## A. Baseline playback

- [ ] Launch Pass 19 with Syphon stopped.
- [ ] Load the same video used for Pass 18 acceptance.
- [ ] Confirm playback, audio, seeking, loop, speed, and effects remain equal to Pass 18.
- [ ] Confirm no FPS regression with Syphon stopped.

## B. Black-frame startup protection

- [ ] Start Syphon before adding/selecting the source in OBS.
- [ ] Confirm OBS discovers `huff`.
- [ ] Confirm the first moving frame appears; the source must not remain black.
- [ ] Confirm the HUFF panel reports one-fps bootstrap frames while no receiver is attached.
- [ ] Confirm HUFF switches to the selected rate after OBS attaches.

## C. Receiver reconnect

- [ ] Remove or deactivate the OBS Syphon source.
- [ ] Confirm HUFF returns to waiting/bootstrap mode within approximately one second.
- [ ] Re-enable or recreate the OBS source.
- [ ] Confirm moving frames resume without restarting HUFF or Syphon.
- [ ] Repeat at least ten times.

## D. Output-rate comparison

Run the same scene at:

- [ ] 1280×720 at 30 fps
- [ ] 1280×720 at 60 fps
- [ ] 1920×1080 at 30 fps
- [ ] 1920×1080 at 60 fps, when the machine can sustain it

For each:

- [ ] record HUFF render FPS;
- [ ] observe OBS motion continuity;
- [ ] record `sy cap`, `sy draw`, `sy read`, and `sy pipe`;
- [ ] record `sy upload` and `sy publish` after several samples;
- [ ] record `sy skips`;
- [ ] compare light effects with the same heavy Glitch/Flow/Luma scene.

## E. UI/control-plane behavior

- [ ] Confirm the Syphon frame count still advances visibly.
- [ ] Confirm receiver-connected/waiting text changes immediately enough for operation.
- [ ] Confirm changing 30 ↔ 60 fps while active changes output pacing.
- [ ] Confirm Start/Stop remains reliable.
- [ ] Confirm no accumulating console errors.

## F. Simultaneous outputs

- [ ] Run Syphon alone.
- [ ] Run the JPEG canvas mirror alone.
- [ ] Run both simultaneously.
- [ ] Compare render FPS and profiler timings.
- [ ] Confirm neither output creates growing latency.

## G. Long-session stability

- [ ] Run Syphon with OBS attached for at least 30 minutes.
- [ ] Switch files repeatedly.
- [ ] Seek repeatedly.
- [ ] Resize/fullscreen the HUFF window.
- [ ] Stop and restart Syphon repeatedly.
- [ ] Confirm frame counters continue advancing.
- [ ] Confirm memory and latency do not grow continuously.

## H. Shutdown

- [ ] Close HUFF while Syphon is active.
- [ ] Confirm OBS loses the source cleanly.
- [ ] Confirm no HUFF process remains.
- [ ] Relaunch and confirm Syphon can start again.
