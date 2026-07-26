# Huff Native Milestone 13 test checklist

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

## Basic queue sequence

1. Load a video with motion and audio.
2. Queue three short jobs with different profiles or visual states and unique destinations.
3. Confirm the first job becomes `starting` and then `running`.
4. Confirm the other two remain `queued`.
5. Confirm progress, rendered frames, estimated time, and attempt count update.
6. Confirm each next job starts only after the prior job completes.
7. Confirm each output has `.huff-queue-job.json`, `.huff-export-job.json`, and reproducibility metadata.
8. Confirm `queueJobId` in the lifecycle manifest matches the frozen queue descriptor.

## Frozen-state test

1. Establish visual state A and queue an H.264 job.
2. Change multiple parameters to state B before A begins or while another job is running.
3. Queue a second job.
4. Confirm the first output uses state A and the second uses state B.
5. Inspect each queue descriptor's parameter snapshot.

## Pause and resume

1. Queue at least two jobs.
2. Pause the queue while the first job is running.
3. Confirm the active job continues to completion.
4. Confirm the next job does not start.
5. Resume the queue and confirm dispatch continues.
6. Pause while no job is active and confirm all waiting jobs remain queued.

## Reorder

1. Pause the queue.
2. Add three jobs.
3. Move the third job upward twice.
4. Resume and confirm execution follows the displayed order.
5. Confirm running and terminal entries cannot be reordered.

## Cancellation

### Waiting job

1. Pause the queue and add a job.
2. Cancel the waiting entry.
3. Confirm it becomes `cancelled` without starting FFmpeg.
4. Confirm it remains available for retry or repeat.

### Active job

1. Start a longer export.
2. Cancel it from the job row or the global Cancel button.
3. Confirm the private decoder and encoder stop.
4. Confirm temporary output is removed.
5. Confirm the queue entry and lifecycle manifest become `cancelled`.
6. Confirm the next queued job starts when the queue is not paused.

## Retry

1. Cancel or deliberately fail a job.
2. Press Retry.
3. Confirm the same queue job ID remains and the attempt count increases.
4. Confirm the job starts from frame zero with the original frozen parameters and original destination.
5. Confirm retry is rejected when the final destination already exists or the source is missing.

## Repeat

1. Complete a short job.
2. Press Repeat and select a new destination.
3. Confirm a new queue job ID is created.
4. Confirm the cloned job keeps its source interval, profile, dimensions, parameters, and deterministic seed.
5. Confirm the repeated decoded frames match the original when the same output profile is used.

## Crash/interruption recovery

1. Queue two jobs and begin the first.
2. Close the application while the first is rendering.
3. Relaunch Huff.
4. Confirm the unfinished job becomes `interrupted` and the queue is paused.
5. Confirm the waiting job remains queued.
6. Retry the interrupted job and resume the queue.
7. Confirm restart begins from frame zero.

Also test closing immediately after final output commit. A committed destination should recover as completed rather than interrupted.

## Recording and still-export coordination

1. Start live recording and queue a deterministic job.
2. Confirm the job remains queued with a waiting reason until recording stops and finalizes.
3. Repeat while a PNG still export is active.
4. Confirm deterministic dispatch begins only after the still export finishes.
5. Confirm recording and still export remain disabled while a deterministic job is actively rendering.

## Missing source and destination conflict

1. Pause the queue and add a job.
2. Move or delete its source file.
3. Resume and confirm the job fails with a source-missing message while later valid jobs continue.
4. Repeat with a file manually created at the queued destination.
5. Confirm the job fails rather than overwriting the unexpected destination.

## Queue persistence and history

1. Queue several jobs and close Huff before they start.
2. Relaunch and confirm queued descriptions and order survive.
3. Complete, cancel, and fail jobs.
4. Remove one history entry and use Clear Finished.
5. Confirm queued and active entries are retained.
6. Inspect the application-data `huff-export-queue.json` for valid JSON.

## Existing profile regression

Run one short export for each Milestone 12 profile:

- H.264 MP4 with AAC;
- ProRes 422 HQ with PCM;
- ProRes 4444 with alpha;
- FFV1 with FLAC and optional alpha;
- PNG sequence with optional `audio.wav`.

Verify exact frame counts with `ffprobe` or numbered-file counts and confirm the queue does not change codec behavior.
