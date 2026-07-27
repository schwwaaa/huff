# Huff Native wgpu · Milestone 15 upgrade notes

Milestone 15 changes deterministic export from a final-resampling workflow into a private export-resolution render graph.

## Architectural change

Milestone 14 rendered each deterministic frame through the existing live topology. `OfflineFrameCapture` then used the export shader to resize the completed authoritative output into a separate export texture before readback.

Milestone 15 instead:

1. freezes the queued parameter and automation state;
2. calculates export-relative history dimensions and bounded history capacity;
3. records the current live render/history topology;
4. replaces the live working resources with a private export-sized graph;
5. renders every deterministic frame through the full graph;
6. copies the authoritative RGBA8 output directly into a padded readback buffer;
7. restores the original live graph after the job ends.

## Full-resolution resources

The temporary graph rebuild includes:

- five RGBA16F working targets;
- one RGBA8 authoritative output;
- one bounded RGBA8 history texture array;
- history and effect bind groups;
- direct output readback storage.

The live Syphon/Spout readback path is not rebuilt at export size and is not used while deterministic export is active.

## Automation topology guard

Automation clips can evaluate a complete parameter snapshot on every output frame. Those snapshots still contain render/history settings even though resource-topology controls are not recordable.

Milestone 15 therefore makes graph ownership explicit:

- outside offline export, parameter snapshots may rebuild live render/history topology;
- while offline export is active, snapshots may update artistic state but cannot rebuild graph dimensions or history allocation.

This prevents a recorded automation clip from silently returning a 4K or 8K export to the live window size.

## Source mapping moved upstream

FIT, CROP, and STRETCH are now implemented in the source-composite shader during deterministic export. The mapped source enters history and all downstream effects at export dimensions.

The source bind group uses:

- the normal linear sampler for SMOOTH;
- the nearest-neighbor sampler for CRISP.

Live rendering retains its established stretch behavior and smooth source sampler.

## Direct 1:1 capture

`OfflineFrameCapture` no longer owns an export render texture or export bind groups. It now owns only:

- the output dimensions;
- row-aligned readback storage;
- a dense RGBA pixel vector.

It copies the authoritative output texture directly to the buffer. The existing export shader remains in the project because still-image export continues to use it.

## History allocation

History dimensions are calculated from the queued snapshot using the export dimensions as the reference:

```text
FULL   = output width × output height
75%    = output dimensions × 0.75
50%    = output dimensions × 0.50
25%    = output dimensions × 0.25
CUSTOM = explicit history dimensions
```

Capacity remains bounded by:

- the 192 MiB history budget;
- the selected quality amount;
- the adapter's maximum texture-array layer count.

At very high resolutions, the bounded capacity may be small. This is surfaced rather than hidden.

## Resource preflight

The minimum graph estimate includes:

```text
5 × RGBA16F working textures
1 × RGBA8 output texture
1 × RGBA8 readback buffer
RGBA8 history array
```

Exports above the current 3 GiB bounded estimate are rejected. This is not an available-VRAM query and does not guarantee allocation success on every adapter.

## Metadata additions

Deterministic metadata now records:

```text
graphMode
liveReferenceWidth
liveReferenceHeight
graphHistoryWidth
graphHistoryHeight
graphHistoryCapacity
graphEstimatedGpuBytes
```

The offline status API exposes graph mode, history topology, and estimated graph bytes for diagnostics.

## Restoration behavior

Completion, cancellation, and failure all return through one restoration path. That path reinstates the previous live graph or applies a deferred surface resize, then reapplies current live parameters and clears the reconstructed temporal resources.

Video transport is returned to its pre-export position and play/pause condition.

## Compatibility

- Existing Milestone 12 output profiles are retained.
- Existing Milestone 13 queue descriptions deserialize because all new metadata fields have defaults.
- Existing Milestone 14 automation clips remain valid.
- Still export behavior is unchanged.
- No new Rust crate dependency was added.

## Versions

```text
Application: 0.15.0
Native build: HNW-15
```
