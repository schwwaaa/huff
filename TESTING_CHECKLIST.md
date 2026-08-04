# HUFF Classic Pass 14 Testing Checklist

## A. Baseline stability

- [ ] Launch the application and load the same video used to validate Pass 13S.
- [ ] Confirm normal playback feels identical to committed Pass 13S.
- [ ] Confirm audio remains stable.
- [ ] Confirm transport, seeking, looping, and speed controls work.
- [ ] Confirm the working Blob URL + p5 `createVideo()` path remains intact.

## B. Clean playback and copy path

- [ ] Test a source whose dimensions match the render canvas.
- [ ] Test a source whose dimensions differ from the render canvas.
- [ ] Compare clean-playback FPS against Pass 13S with the same footage and window size.
- [ ] Confirm aspect handling and scaling are visually unchanged.
- [ ] Toggle the profiler and record `_pushToRing`, frame time, and render FPS.

## C. Temporal history

- [ ] Let a video play until the ring reaches capacity.
- [ ] Enable Glitch and verify historical tile selection is unchanged.
- [ ] Test low, medium, and maximum DEPTH.
- [ ] Enable Flow Pulse and test several frame offsets.
- [ ] Seek while temporal effects are active.
- [ ] Replace the source and confirm old history does not leak into the new source.
- [ ] Confirm history remains captured at decoded-frame cadence.

## D. Ring allocation and release

- [ ] Open the backtick profiler.
- [ ] Observe `ring mem` while the history fills.
- [ ] Observe `ring MiB` at 720p and 1080p.
- [ ] Lower QUALITY and confirm allocated slots fall to the new capacity.
- [ ] Raise QUALITY and confirm slots grow lazily as new frames arrive.
- [ ] Resize the window repeatedly between small and large dimensions.
- [ ] Confirm old-resolution slots are released after each size change.
- [ ] Run at least twenty resize/fullscreen cycles and watch WebView memory.

## E. Clustered glitch

- [ ] Test one and many cluster centers.
- [ ] Test bounce and wrap boundaries.
- [ ] Test STEER, SPEED, INERTIA, DRIFT, PULSE, BREATHE, and COHERENCE.
- [ ] Compare seeded output against Pass 13S using the same source and controls.
- [ ] Confirm no new cluster jump, reset, or random-order change.
- [ ] Run a heavy clustered-glitch scene for at least twenty minutes.

## F. Other effects and outputs

- [ ] Scanlines
- [ ] Luma Key
- [ ] Feedback
- [ ] Flow
- [ ] Symmetry
- [ ] Solarize
- [ ] Global Mix
- [ ] Canvas mirror connected and disconnected
- [ ] Syphon connected and disconnected
- [ ] Spout on Windows when available

## G. Shutdown

- [ ] Exit with a full temporal ring.
- [ ] Exit while video is playing.
- [ ] Exit while camera is active.
- [ ] Exit with mirror and Syphon active.
- [ ] Confirm the HUFF process exits completely.
- [ ] Confirm no camera, audio, worker, or output resource remains.

## Static validation completed

- [x] JavaScript syntax validation.
- [x] Inline HTML script syntax validation.
- [x] JSON parsing.
- [x] TOML parsing.
- [x] Shell syntax validation.
- [x] Pass 9 Flow validator.
- [x] Pass 10 Scanline validator.
- [x] Pass 11 neutral-path validator.
- [x] Pass 13S lifecycle validator.
- [x] Pass 14 ring/copy/physics validator.
- [x] `src-tauri` unchanged from Pass 13S.
- [x] bundled Syphon framework unchanged and present.
- [x] ZIP integrity validation.
