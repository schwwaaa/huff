# Huff Native Milestone 09 test checklist

## Build and launch

```bash
npm install
npm run dev:metal
```

Confirm FFmpeg is available:

```bash
ffmpeg -version
```

## Basic video recording

1. Load a video with audio.
2. Select `REC 30` and `AUDIO AUTO`.
3. Start recording and choose an MP4 destination.
4. Run Glitch, Clusters, Scanlines, Luma, Flow, Smoosh, and Feedback.
5. Record for at least 60 seconds.
6. Stop and wait for `REC: OFF`.
7. Open the file in QuickTime, VLC, or ffplay.
8. Verify image orientation, color, duration, audio, and seeking.

Expected:

- The output is CFR 30 FPS.
- The recording matches the native output, not the controls window.
- Audio remains synchronized.
- No incomplete hidden temporary files remain after successful muxing.

## 60 FPS recording

Repeat at `REC 60` with 1280×720, then 1920×1080.

Watch the `REC:` tooltip:

- `duplicatedFrames` may increase under load;
- `videoSubmissionDrops` may increase if the encoder/readback is busy;
- queue depth must remain bounded;
- duration must continue advancing normally.

A duplicated frame is preferable to A/V drift or an unbounded backlog.

## Audio modes

### Video audio

1. Select `VIDEO AUDIO`.
2. Record a file containing audio.
3. Move the live volume slider during recording.
4. Confirm the recorded level follows live volume.
5. Set volume to zero and confirm the recording becomes silent.

### Video without audio

1. Load a video with no audio track.
2. Select `AUDIO AUTO`.
3. Record and confirm a valid silent MP4 is created.
4. Select `VIDEO AUDIO` explicitly and confirm Huff reports that no recordable audio stream exists.

### Camera microphone

1. Start the camera.
2. Select `AUDIO AUTO` or `MIC`.
3. Start recording.
4. Grant microphone permission if macOS asks.
5. Speak and confirm recorded microphone audio.

### Silent

Select `SILENT` and verify the MP4 has no audio stream.

## Transport and recovery

While recording video audio:

1. Pause and resume.
2. Seek.
3. Change playback rate.
4. Cross a loop boundary.
5. Leave the decoder watchdog active during a long recording.

Expected:

- Pauses produce held video plus silence.
- The output file remains valid CFR.
- Decoder recovery does not terminate recording.

## Output coexistence

1. Start Syphon at 30 FPS.
2. Start recording at 30 FPS.
3. Verify both outputs continue.
4. Repeat with Spout later on Windows.
5. Minimize the native output window and confirm recording continues.

## Resolution protection

1. Start a recording.
2. Confirm Render Resolution Apply is disabled.
3. Stop recording.
4. Confirm Apply becomes available again.

## Long-duration test

Record for 20–30 minutes at 1080p30 with heavy feedback and temporal effects.

Check:

- memory does not grow continuously;
- audio queue depth returns toward zero;
- temporary files grow normally;
- Stop finalizes successfully;
- final duration matches the recording timer;
- A/V drift is not perceptible at the end.

## Application-close finalization

1. Start a short recording.
2. Close Huff without pressing Stop.
3. Relaunch and inspect the chosen output.

Huff should finalize before exiting. A slow encoder may delay application closure while FFmpeg finishes.

## Failure reporting

Include:

- platform and GPU;
- render resolution and recording FPS;
- audio mode;
- source file/container/codec;
- `REC:` tooltip values;
- `NATIVE:` tooltip values;
- terminal output;
- whether the final MP4 is missing, truncated, silent, drifting, upside down, or unplayable;
- whether hidden `.huff-video.mp4` or `.huff-audio.wav` files remain beside the destination.
