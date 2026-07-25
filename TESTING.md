# Huff Native Milestone 08 test checklist

## Run on macOS

```bash
npm install
npm run dev:metal
```

Use a moving video and a recognizable effect state.

## Baseline regression

- Video playback and audio remain synchronized.
- Camera and file video still switch exclusively.
- Decoder watchdog recovery remains available.
- Glitch, clusters, scanlines, Smoosh, Luma Key, Global Mix, Flow, and feedback still work.
- Clear and Global Reset still clear the native buffers.
- The output window still follows Match Window and fixed render modes correctly.

## Authoritative output

1. Set `R:` to 1280×720 and press Apply.
2. Verify the native output window shows the expected image with correct aspect ratio.
3. Resize the native output window.
4. Confirm the image letterboxes/crops correctly without changing `R:`.
5. Hover `NATIVE:` and confirm the readback counters remain at zero while Syphon/Spout are off.

## Syphon test · macOS

1. Open the Syphon modal.
2. Set 30 FPS and press Start.
3. Open a Syphon receiver and select **huff**.
4. Confirm output dimensions match `R:`.
5. Confirm orientation is correct.
6. Compare the native output window and Syphon image for brightness, color, luma-key behavior, and feedback.
7. Minimize or cover the native output window and confirm Syphon continues.
8. Increase to 60 FPS and inspect:
   - published frames;
   - replaced frames;
   - frame age;
   - upload time;
   - readback busy drops.
9. Stop and restart Syphon repeatedly.
10. Change `R:` while Syphon is active and verify it restarts at the new dimensions or reports a clear error.
11. Build the `.app` and confirm `Syphon.framework` is present under `Contents/Frameworks` and publishing works outside `tauri dev`.

## Spout test · Windows

1. Install the normal MSVC/CMake prerequisites.
2. Run `npm install` and `npm run dev:dx12`.
3. Confirm the Spout bridge compiles and `spout_bridge.dll` is beside the development executable.
4. Open the Spout modal, choose 30 FPS, and press Start.
5. Select **huff** in a Spout receiver.
6. Confirm dimensions, orientation, colors, and frame continuity.
7. Test 60 FPS and inspect replaced/readback-drop counts.
8. Minimize the native output window and confirm Spout continues.
9. Change render resolution while Spout is active.
10. Build an installer and verify the DLL is included beside the packaged executable.

## Simultaneous-output bridge test

On a platform/build where both publishers can be exercised or mocked:

- Confirm one completed readback is shared rather than duplicated.
- Confirm each output can use a different FPS schedule.
- Stop one output and verify the other continues.
- Confirm no unbounded memory growth during a 30-minute run.

## Stress test

1. Use 1920×1080 render resolution.
2. Enable a heavy Glitch + Clusters + Scanlines + Flow + Feedback state.
3. Start the native output at 60 FPS.
4. Run for at least 30 minutes.
5. Continue changing parameters and switching sources.
6. Verify:
   - controls remain responsive;
   - audio/video continue;
   - decoder recoveries still work if needed;
   - readback pending slots never exceed 3;
   - busy drops may rise under load but latency does not accumulate;
   - memory does not grow continuously;
   - Stop releases the external publisher.

## Failure reporting

For a failure, capture:

- terminal output;
- platform and GPU;
- backend (`metal`, `vulkan`, or `dx12`);
- render resolution and output FPS;
- `NATIVE:` tooltip diagnostics;
- Syphon/Spout modal status;
- whether the native window, external receiver, audio, or decoder stopped independently.
