# Huff Native wgpu · Milestone 13 upgrade notes

Milestone 13 places Milestone 12's deterministic production exporter behind a durable sequential job queue.

## Queue model

Selecting an output destination now captures an immutable job description containing:

- source path and decoded source dimensions;
- source start, duration, playback rate, and loop policy;
- output profile, size, FPS, sampling, fit, audio, and alpha policy;
- complete canonical parameter snapshot and deterministic seed;
- reproducibility metadata;
- stable queue job ID.

The live controls may change after a job is queued without changing that queued job.

## Automatic dispatch

The coordinator executes one deterministic export at a time. It waits while:

- the queue is paused;
- live recording is active or finalizing;
- a still export is active;
- another deterministic export is active.

After a job reaches a terminal state, the next queued job starts automatically unless the queue is paused.

## Durable state

The queue is stored in the application's platform data directory as:

```text
huff-export-queue.json
```

Each job also writes an adjacent frozen job description:

```text
<output-name>.huff-queue-job.json
```

Milestone 12's per-attempt lifecycle manifest remains:

```text
<output-name>.huff-export-job.json
```

The lifecycle manifest now includes the stable `queueJobId`, connecting an encoding attempt to its queue entry.

Queue writes use a temporary file followed by replacement. Progress is persisted approximately once per second and terminal state is persisted immediately.

## Job states

```text
queued
starting
running
completed
failed
cancelled
interrupted
```

The queue keeps terminal jobs as history until they are removed or **Clear Finished** is used.

## Queue operations

- Pause or resume automatic dispatch without interrupting the active export.
- Move queued jobs earlier or later.
- Cancel a waiting job before it starts.
- Cancel the active job through the existing deterministic-export cancellation path.
- Retry failed, cancelled, or interrupted jobs using the exact frozen state and original destination.
- Repeat a completed or retryable job to a newly selected destination.
- Remove individual history entries.
- Clear terminal history in one action.

## Recovery behavior

If Huff starts with a persisted `starting` or `running` job:

- a committed final destination is recovered as completed;
- otherwise the job becomes interrupted;
- the queue pauses so the user can inspect and restart it.

An interrupted job restarts deterministically from frame zero. Milestone 13 does **not** append into a partial codec stream or resume from an arbitrary encoded frame.

Malformed or unsupported queue state is preserved beside the original queue file with an `unreadable-<timestamp>` suffix, and Huff starts with a paused empty queue rather than failing application startup.

## Destination safety

A new or repeated job must target a destination that does not already exist. Pending jobs may not share the same destination. The existing transactional temporary-output behavior remains unchanged.

## Scope boundaries

- One job executes at a time.
- Retry means deterministic restart from frame zero, not frame-level encoding continuation.
- Queue entries are not editable after capture; repeat the job or create a new job.
- Automation/keyframe replay is still deferred to Milestone 14.
- Full independent high-resolution graph execution remains deferred.
