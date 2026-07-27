# Huff Native wgpu · Milestone 14 upgrade notes

Milestone 14 adds canonical automation recording and frame-exact replay to the Milestone 13 deterministic export path.

## New module

```text
src-tauri/src/automation.rs
```

The module owns:

- the versioned automation clip schema;
- recording state;
- validation and canonicalization;
- interpolation;
- action scheduling;
- deterministic offline playback.

## Clip schema

An automation clip contains:

```text
schemaVersion
id
name
createdUnixMs
durationSeconds
events[]
```

Events are ordered by `timeSeconds` and a monotonic `sequence` value. Supported event types are:

```text
parameter
parameter_batch
action
```

A parameter event stores the canonical parameter ID, validated value, and interpolation policy. A parameter batch applies a preset/reset-sized state change atomically. Actions currently support `clear_buffers` and `flow_pulse`.

## Recording boundary

Recording begins by storing a complete initial batch of all automation-safe canonical parameters at time zero. Subsequent direct parameter changes are recorded, with same-parameter events occurring within eight milliseconds coalesced to limit drag-event noise.

Preset recalls and resets enter the clip as single parameter-batch events. Buffer clears and Flow pulses enter as actions.

The recorder is bounded to 100,000 events and 24 hours.

## Deterministic playback

The offline renderer constructs an `OfflineAutomationPlayer` from the queued static parameter snapshot and the frozen clip. Before each frame's GPU state is uploaded, the player evaluates the clip at the exact simulation timestamp:

```text
frame_index / export_fps
```

Numeric interpolation is evaluated in Rust. Boolean and select parameters are always stepped. Actions are emitted once when the fixed timeline crosses their timestamp.

Flow-pulse duration is measured against simulation time rather than `Instant`, so offline performance speed cannot alter its visual duration.

## Looping

When looping is enabled, parameter evaluation wraps by clip duration. Actions are expanded across every crossed loop and sorted by absolute event time and sequence.

Without looping, parameters hold their final state after the clip ends and no actions repeat. Looping does not implicitly clear persistent feedback/history state; an explicit recorded `clear_buffers` action is required when temporal memory must restart with the clip.

The export queue also waits while automation recording is active so a waiting job cannot begin and interrupt clip authoring.

## Resource safety

The following parameters are not sequenceable in Milestone 14:

```text
render.*
history.*
source.seed_on_load
```

These can trigger GPU allocation, history-ring reconstruction, or source initialization. They remain part of the static job description rather than changing mid-render.

A recorded `clear_buffers` action intentionally rebuilds persistent render targets and then rebuilds the offline export capture binding so export continues from the new target views.

## Export and queue integration

`OfflineExportConfig` and `OfflineExportMetadata` now include:

```text
automationClip
automationLoop
automationEnabled
automationName
automationDurationSeconds
automationEventCount
```

Every queued job stores its own immutable clip copy. Retry and repeat preserve that copy. The queue persistence schema advances to version 2 while accepting version 1 files through serde defaults.

## Control surface

The new AUTOMATION strip provides:

- clip name;
- interpolation selection;
- Record and Stop;
- JSON Export and Import;
- Clear;
- active status.

The deterministic export strip adds STATIC STATE / ACTIVE AUTOMATION and optional loop selection. The current active clip is retained in browser local storage and is revalidated by Rust on restoration.

## Version

```text
Application: 0.14.0
Native build: HNW-14
Queue schema: 2
Automation schema: 1
```

No Rust crate dependency was added.
