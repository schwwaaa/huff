# Huff Native Milestone 14 test checklist

## Build and launch

```bash
npm install
npm run dev:metal
```

Confirm FFmpeg:

```bash
ffmpeg -version
ffmpeg -hide_banner -encoders | grep -E 'libx264|prores_ks|ffv1| png '
```

## Basic automation recording

1. Load a short video with obvious motion.
2. Set a simple initial Huff state.
3. Name the clip `M14 Basic` and choose **LINEAR**.
4. Press **Record**.
5. Over approximately five seconds, move Feedback, Brightness, Glitch Alpha, and Flow Strength.
6. Press **Stop**.
7. Confirm the automation strip reports the name, duration, and nonzero event count.
8. Export the clip as JSON and confirm it contains `schemaVersion`, `durationSeconds`, and ordered `events`.

## Frame-exact deterministic replay

1. Choose **ACTIVE AUTOMATION** in deterministic export.
2. Export a short native-resolution H.264 file at 30 FPS.
3. Repeat to a second destination without recording again.
4. Compare the two files or decoded frame hashes.
5. Confirm the visual parameter changes occur at the same frames.
6. Confirm the `.huff-offline.json`, `.huff-export-job.json`, and `.huff-queue-job.json` files identify the same automation name, duration, event count, loop state, and clip contents.

For a strict visual comparison:

```bash
mkdir -p /tmp/huff-a /tmp/huff-b
ffmpeg -i first.mp4 -vsync 0 /tmp/huff-a/%06d.png
ffmpeg -i second.mp4 -vsync 0 /tmp/huff-b/%06d.png
shasum -a 256 /tmp/huff-a/*.png | awk '{print $1}' > /tmp/huff-a.txt
shasum -a 256 /tmp/huff-b/*.png | awk '{print $1}' > /tmp/huff-b.txt
diff /tmp/huff-a.txt /tmp/huff-b.txt
```

Codec metadata can differ between files; decoded frame identity is the important test.

## Interpolation modes

For each numeric interpolation mode—LINEAR, SMOOTH, EASE IN, EASE OUT, and STEP:

1. Record one slow move from a low Feedback value to a high value.
2. Export the same interval.
3. Confirm the transition shape matches the selected mode.
4. Confirm Boolean toggles and select menus always switch discretely rather than blending.

## Preset recall and reset

1. Save two visibly different presets.
2. Begin recording.
3. Recall preset A, wait, recall preset B, then press Reset.
4. Stop and export.
5. Confirm each preset applies atomically on one timeline boundary.
6. Confirm Reset restores default parameters and clears temporal state at the recorded point.

## Action replay

### Clear buffers

1. Build visible feedback/history content.
2. Start recording and press **Clear** once.
3. Continue moving controls and stop.
4. Export with active automation.
5. Confirm feedback, history, tile state, clusters, scan phases, and persistent effects reset on the recorded frame.

### Flow pulse

1. Enable Flow and configure a visible pulse amount.
2. Record two Flow pulses several seconds apart.
3. Export.
4. Confirm each pulse begins on a deterministic frame and remains active for the fixed 220 ms simulation interval.
5. Repeat at 24, 30, and 60 FPS and confirm pulse timing remains time-based while frame count changes appropriately.

## Looping

1. Record a two-second automation clip with one parameter sweep and one Flow pulse.
2. Export six seconds with **LOOP AUTO** enabled.
3. Confirm the state returns to the clip beginning at each two-second boundary.
4. Confirm the Flow pulse fires once per loop.
5. Export without looping and confirm the final keyframed state is held after clip completion.
6. Repeat the looping test with strong feedback but no recorded Clear action and confirm temporal memory continues across loops.
7. Add a Clear action at the loop start and confirm each cycle begins from cleared persistent state.

## Queue coordination while recording

1. Queue a job and pause the queue.
2. Start automation recording.
3. Resume the queue.
4. Confirm the job remains waiting with an automation-recording reason.
5. Stop recording and confirm the queued job may dispatch.

## Frozen queue copy

1. Record clip A and queue an automated export.
2. Import or record clip B before job A begins.
3. Queue another automated export.
4. Confirm the first output uses clip A and the second uses clip B.
5. Inspect the queue descriptors and confirm each contains its own frozen automation clip.
6. Retry or repeat a job and confirm it retains the original frozen clip.

## JSON import and validation

1. Export a valid automation clip.
2. Clear the active clip and re-import the file.
3. Confirm its summary and deterministic output match the original.
4. Test invalid files:
   - unknown parameter ID;
   - out-of-range parameter value;
   - unsupported action;
   - event time below zero;
   - event time above 24 hours;
   - unsupported future schema version.
5. Confirm Rust rejects each invalid clip without replacing the current active clip.

## Allocation-safety boundary

Inspect an exported clip and confirm it does not contain:

```text
render.*
history.*
source.seed_on_load
```

Change those controls during recording and confirm the export job still uses the static render/history/source-init settings captured when queued.

## Existing export regression

1. Export with **STATIC STATE** and confirm Milestone 12 behavior is unchanged.
2. Run one short export for each profile:
   - H.264 MP4 with AAC;
   - ProRes 422 HQ with PCM;
   - ProRes 4444 with alpha;
   - FFV1 with FLAC and optional alpha;
   - PNG sequence with optional `audio.wav`.
3. Verify frame counts and metadata.
4. Exercise cancellation and confirm no partial destination is committed.

## Queue regression

Because Milestone 13 remains provisional, perform only a focused regression initially:

1. Queue one static and one automated job.
2. Confirm sequential dispatch.
3. Cancel one waiting automated job and retry it.
4. Restart the application with an interrupted automated job.
5. Confirm its frozen clip survives recovery and retry from frame zero.
