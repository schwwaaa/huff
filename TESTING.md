# Huff Native Milestone 12 test checklist

## Build and launch

```bash
npm install
npm run dev:metal
```

Confirm FFmpeg and required encoders:

```bash
ffmpeg -version
ffmpeg -hide_banner -encoders | grep -E 'libx264|prores_ks|ffv1| png '
```

## Baseline deterministic test

1. Load a video with visible motion and audio.
2. Enable a recognizable combination of Glitch, Feedback, Clusters, Scanlines, and Flow.
3. Choose `H.264 MP4`, `30 FPS`, `START CURRENT`, `5` seconds, `NATIVE`, `SMOOTH`, `FIT`, and `SOURCE AUDIO`.
4. Export and confirm live playback pauses.
5. Confirm progress reaches the exact requested frame count.
6. Confirm playback returns to the prior position and resumes only if it was previously playing.
7. Confirm the output, `.huff-offline.json`, and `.huff-export-job.json` exist.
8. Confirm the manifest status is `complete`.

## H.264 MP4

Probe a five-second 30 FPS export:

```bash
ffprobe -v error \
  -count_frames \
  -select_streams v:0 \
  -show_entries stream=codec_name,pix_fmt,avg_frame_rate,nb_read_frames,duration,width,height \
  -of default=nw=1 exported.mp4
```

Expected essentials:

```text
codec_name=h264 when libx264 is available
pix_fmt=yuv420p
avg_frame_rate=30/1
nb_read_frames=150
```

Confirm odd custom dimensions are normalized by the UI or rejected by native validation.

## ProRes 422 HQ

1. Select `PRORES 422 HQ` with source audio.
2. Export a short native-size interval.
3. Probe:

```bash
ffprobe -v error -show_entries stream=codec_name,profile,pix_fmt,codec_type -of default=nw=1 exported.mov
```

Expected:

```text
video codec_name=prores
video pix_fmt=yuv422p10le
audio codec_name=pcm_s24le
```

Confirm ALPHA is disabled for this profile.

## ProRes 4444 and alpha

1. Select `PRORES 4444`.
2. Confirm ALPHA becomes available and defaults on when entering this profile.
3. Export with `FIT` into a target aspect ratio different from the render.
4. Probe the video stream:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,pix_fmt -of default=nw=1 exported.mov
```

Expected alpha-capable output commonly reports `yuva444p12le` after ProRes decoding, even though encoding requests `yuva444p10le`.

Import the result into an application that displays alpha and confirm FIT bars are transparent. Remember that opaque rendered pixels remain opaque.

## FFV1 lossless

1. Select `FFV1 LOSSLESS`.
2. Test once without alpha and once with alpha.
3. Probe:

```bash
ffprobe -v error -show_entries stream=codec_name,pix_fmt,codec_type -of default=nw=1 exported.mkv
```

Expected:

```text
video codec_name=ffv1
video pix_fmt=bgr0 or bgra
audio codec_name=flac when source audio is enabled
```

## PNG sequence

1. Select `PNG SEQUENCE`.
2. Choose a destination name that does not already exist.
3. Export three seconds at 24 FPS.
4. Confirm the final directory contains exactly 72 numbered PNG files:

```text
frame_000000.png
...
frame_000071.png
```

5. With source audio enabled, confirm `audio.wav` exists and is approximately three seconds long.
6. Confirm `huff-offline.json` and `huff-export-job.json` exist inside the directory.
7. Confirm the adjacent `<folder>.huff-export-job.json` also exists.
8. Repeat with ALPHA enabled and inspect a PNG with a transparency-aware viewer.

Count frames:

```bash
find sequence-folder -name 'frame_*.png' | wc -l
```

## Manifest lifecycle

### Complete

Confirm:

```text
status = complete
renderedFrames = totalFrames
finishedUnixMs is populated
artifacts lists the video or PNG pattern
error is empty
```

### Cancelled

1. Begin a longer 4K or PNG-sequence export.
2. Cancel after several frames.
3. Confirm the final destination file/folder was not created.
4. Confirm hidden temporary output was removed.
5. Confirm the adjacent job manifest remains with `status = cancelled` and the partial rendered-frame count.

### Failed

Temporarily remove access to an encoder or use an invalid destination permission in a controlled test. Confirm the manifest records `status = failed` and a useful error message without replacing an existing destination.

## Repeatability comparison

Export the same interval twice using the same profile, state, source, start, duration, FPS, size, fit, sampling, and alpha policy.

For video profiles, compare decoded representative frames rather than container bytes:

```bash
mkdir -p compare-a compare-b
ffmpeg -i first.mov  -vf "select='eq(n,0)+eq(n,30)+eq(n,90)'" -vsync 0 compare-a/frame-%02d.png
ffmpeg -i second.mov -vf "select='eq(n,0)+eq(n,30)+eq(n,90)'" -vsync 0 compare-b/frame-%02d.png
shasum -a 256 compare-a/*.png compare-b/*.png
```

For PNG sequences, compare the numbered PNG hashes directly.

## Playback rate and audio

Test 0.5×, 1×, 2×, and 4× for every profile that carries audio.

Verify:

- output duration remains the requested duration;
- source motion changes speed;
- audio follows the selected playback rate;
- H.264 audio is AAC;
- ProRes audio is PCM;
- FFV1 audio is FLAC;
- PNG-sequence audio is a separate PCM WAV;
- non-looping requests beyond the remaining source duration are rejected.

## Exclusion and frozen-state tests

During active deterministic export:

- recording and still export requests must be rejected;
- source loading, transport, render-target changes, reset, and feedback clear must be disabled or ignored;
- parameter/UI changes must not alter the frozen job;
- Syphon and Spout hold their latest live frame and resume afterward.

## Shutdown safety

Begin each output kind and close Huff. Confirm no decoder or encoder process remains and temporary outputs are removed on the next controlled cleanup pass. Verify the job manifest is not falsely marked complete.
