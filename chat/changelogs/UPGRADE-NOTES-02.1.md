# Huff Native wgpu Milestone 02.1

This is a corrective update for the runtime findings from Milestone 02.

## Fixed

1. **Camera → video switching**
   Loading or playing a file now selects video immediately and sends a camera stop command. Source selection no longer depends on whichever texture still has a nonzero sequence number.

2. **Video → camera switching**
   Starting camera capture pauses the video decoder and native video-audio path. The loaded file and position are retained, but no hidden transport or audio continues.

3. **Stopping camera**
   The loaded video becomes visible again in a paused state. Press Play to continue from the retained position.

4. **Renderer stall / surface occlusion**
   `Occluded` and `Timeout` surface results are now paced at approximately 60 attempts per second rather than spinning without delay. The renderer continues accepting parameter and source updates, periodically reconfigures the surface, and explicitly recovers when either Huff window regains focus.

5. **Redundant decoder restart**
   File opening already autoplays in Rust. The controls no longer call Play immediately afterward, avoiding two decoder launches during one file selection.

6. **Reset Motion**
   The button now restores the canonical defaults for feedback translation X/Y, scale, and rotation.

7. **Stale source frames**
   Opening a new video clears the previous shared frame before probing and decoding the replacement.

## Active-source behavior

- Application startup: camera, preserving the existing Milestone 02 startup behavior.
- Load video: video becomes authoritative; camera stops.
- Press Play: video becomes authoritative; camera stops.
- Start camera: camera becomes authoritative; video and video audio pause.
- Stop camera: loaded video returns paused; otherwise the output uses the selected background.

## Files changed

- `src/app.js`
- `src-tauri/src/main.rs`
- `src-tauri/src/renderer.rs`
- `src-tauri/src/compositor.wgsl`
- `src-tauri/src/source.rs` (new)
- `src-tauri/src/video.rs`
- `src-tauri/src/camera_avfoundation.rs`
- `src-tauri/src/camera_nokhwa.rs`
- version and documentation files

## Required local test

Run:

```bash
npm install
npm run dev:metal
```

Then perform the source-ownership and surface-recovery sections in `TESTING.md`. Rust compilation was not available in the packaging environment.
