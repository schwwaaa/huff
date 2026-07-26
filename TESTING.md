# Huff Native Milestone 11 test checklist

## Build and launch

```bash
npm install
npm run dev:metal
```

Confirm FFmpeg is available:

```bash
ffmpeg -version
```

## First deterministic export

1. Load a video with visible motion and audio.
2. Enable a recognizable combination of Glitch, Feedback, Clusters, Scanlines, and Flow.
3. Choose `30 FPS`, `START CURRENT`, `10` seconds, `NATIVE`, `SMOOTH`, `FIT`, and `SOURCE AUDIO`.
4. Press `Export MP4` and select a destination.
5. Confirm the live video/audio pause and `OFFLINE:` begins advancing.
6. Wait until `OFFLINE: … ✓`.
7. Confirm live playback returns to its pre-export position and resumes only if it was previously playing.
8. Open the MP4 and verify image orientation, brightness, duration, and audio.
9. Confirm the `.huff-offline.json` sidecar exists.

## Frame-count and CFR validation

For a 10-second 30 FPS export:

```bash
ffprobe -v error \
  -count_frames \
  -select_streams v:0 \
  -show_entries stream=avg_frame_rate,r_frame_rate,nb_read_frames,duration,width,height \
  -of default=nw=1 exported.mp4
```

Expected essentials:

```text
avg_frame_rate=30/1
nb_read_frames=300
duration approximately 10 seconds
```

Repeat at 24 FPS and 60 FPS with a short duration.

## Repeatability comparison

1. Pause the live source at a known position.
2. Select `START CUSTOM` with a fixed start and duration.
3. Use the same preset, seed, FPS, size, sampling, fit, and audio mode.
4. Export twice without changing parameters.
5. Compare representative frames from both outputs.

A practical frame extraction command:

```bash
mkdir -p compare-a compare-b
ffmpeg -i first.mp4  -vf "select='eq(n,0)+eq(n,30)+eq(n,90)'" -vsync 0 compare-a/frame-%02d.png
ffmpeg -i second.mp4 -vf "select='eq(n,0)+eq(n,30)+eq(n,90)'" -vsync 0 compare-b/frame-%02d.png
shasum -a 256 compare-a/*.png compare-b/*.png
```

Matching decoded frames are expected on the same build/backend/input. Bit-identical MP4 files are not required because container metadata and encoder behavior may differ.

## Playback-rate and audio tests

Test the same source at:

- 0.5×
- 1×
- 2×
- 4×

Verify:

- output duration remains the requested duration;
- source motion changes speed;
- source audio follows the video rate;
- no-loop requests that exceed the remaining source duration are rejected;
- looping requests can cross the source endpoint.

## Resolution and aspect tests

Export the same interval at:

- Native
- 1920×1080
- 3840×2160
- 7680×4320
- 2048×2048 custom

Test `FIT`, `CROP`, and `STRETCH`. Custom MP4 dimensions should resolve to even values. Compare `SMOOTH` with `CRISP` using large glitch blocks or scanlines.

8K may be substantially slower than real time and consumes a large synchronous readback per frame; begin with one or two seconds.

## Frozen-state test

During an active export, attempt to:

- move effect sliders;
- fire Flow Pulse;
- clear feedback;
- resize the output window;
- play/pause/seek;
- load a source;
- apply render resolution;
- recall a preset.

The in-progress export should remain on its frozen state. UI actions that threaten the deterministic render target should be disabled or ignored. After export, the latest canonical parameter values may become active again.

## Exclusion tests

- Start recording, then request offline export: request must be rejected.
- Start PNG export, then request offline export: request must be rejected.
- Start offline export, then request recording or PNG: requests must be rejected.
- Existing Syphon/Spout output should hold its latest live frame and resume after export.

## Cancellation

1. Begin a longer 4K export.
2. Press `Cancel` after several frames.
3. Confirm phase changes to cancelling/cancelled.
4. Confirm partial MP4 and temporary encoder files are removed.
5. Confirm live source position/play state is restored.
6. Start a fresh export and confirm it succeeds.

## Shutdown safety

Begin an export and close Huff. Confirm the process exits and no FFmpeg decoder/encoder remains running.

## Metadata inspection

Confirm the sidecar contains:

- `engineBuild: HNW-11`
- source path and codec
- start, duration, FPS, and playback rate
- render and output dimensions
- sampling and fit mode
- source-audio and loop flags
- parameter revision and complete parameter values
- deterministic seed
