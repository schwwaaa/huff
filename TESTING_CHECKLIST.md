# HUFF Classic Pass 13S Testing Checklist

## Release decision

Pass 13S is accepted only if it matches Pass 12R frame pacing and improves source/camera/shutdown behavior. Any repeatable FPS regression means the pass must be rejected or reduced further.

## A. Baseline frame pacing

- [ ] Load the same test video used to validate Pass 12R.
- [ ] Run with all effects neutral for at least five minutes.
- [ ] Compare visible FPS and playback smoothness with Pass 12R.
- [ ] Confirm audio remains stable.
- [ ] Confirm the profiler being hidden produces normal performance.
- [ ] Open the profiler and record render FPS, decode FPS, and ring FPS.
- [ ] Close the profiler and confirm performance returns to baseline.

## B. File replacement

- [ ] Load file A, then file B after A is fully playing.
- [ ] Replace files rapidly ten times.
- [ ] Replace a file before it reaches `canplay`.
- [ ] Replace a file while autoplay is waiting for a gesture.
- [ ] Confirm no old source begins playing after replacement.
- [ ] Confirm one active frame pump remains.
- [ ] Confirm the previous Blob URL is released.
- [ ] Confirm seeking, loop, rate, volume, pause, and resume still work.

## C. Camera lifecycle

- [ ] Start the default camera.
- [ ] Stop it and confirm the camera indicator turns off.
- [ ] Start camera, then immediately load a file.
- [ ] Start one camera, then quickly select another.
- [ ] Deny camera permission and confirm clean recovery.
- [ ] Confirm no stale camera becomes active later.
- [ ] Confirm camera tracks stop after switching to a file.
- [ ] Repeat camera/file switching at least twenty times.

## D. Mirror transport

- [ ] Run with no canvas receiver and confirm mirror capture remains idle.
- [ ] Open the canvas receiver and confirm frames resume.
- [ ] Close and reopen the receiver repeatedly.
- [ ] Use the profiler to observe mirror sent/drop values.
- [ ] Confirm Syphon remains independent while the canvas receiver is closed.
- [ ] Close the application while the mirror is reconnecting.
- [ ] Confirm no reconnect activity or process remains after exit.

## E. Effects regression

- [ ] Glitch
- [ ] Scanlines
- [ ] Luma Key
- [ ] Feedback
- [ ] Flow
- [ ] Symmetry
- [ ] Solarize
- [ ] Global Mix
- [ ] Base Mix
- [ ] Combined heavy-effect scene
- [ ] Temporal history selection after seeking

## F. Shutdown

- [ ] Exit while a file is playing.
- [ ] Exit while paused.
- [ ] Exit while a camera is active.
- [ ] Exit while waiting for autoplay unlock.
- [ ] Exit while a readiness poll is active.
- [ ] Exit with mirror receiver connected.
- [ ] Exit with Syphon active.
- [ ] Confirm no HUFF process accumulation.
- [ ] Confirm camera and audio resources release immediately.

## Static validation completed

- [x] Working Blob URL + p5 `createVideo()` path retained.
- [x] Independent transport, mirror, and profiler schedulers retained.
- [x] Rejected `_afterRenderFrame()` path absent.
- [x] Aggressive `removeAttribute('src')` and cleanup `load()` absent.
- [x] Source-generation guards present.
- [x] Stale-camera track shutdown present.
- [x] Pagehide/beforeunload cleanup present.
- [x] Existing Pass 9, Pass 10, and Pass 11 validators pass.
- [x] Pass 13S lifecycle-boundary validator passes.
