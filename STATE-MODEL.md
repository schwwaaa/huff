# HUFF State Model · `huff-state/v1`

## Purpose

HUFF previously had several state-like systems that could be mistaken for one another: local presets, complete parameter snapshots, automation clips, export job snapshots, source state, controller maps, and persistent GPU image memory. Milestone 18 gives those systems explicit identities and recall boundaries.

## Four document kinds

### Preset

A preset is a reusable artistic condition. It is intentionally narrower than the entire application. The default preset scope includes Look, Temporal, and Routing parameters and excludes source references, transport, render allocation, automation, controller maps, and persistent GPU pixels.

### Snapshot

A snapshot is a broad capture of current machine state. It may retain all parameter domains, a source reference, transport values, and the active automation clip. It still does not imply that every captured domain must be recalled.

### Sequence

A sequence contains one canonical automation clip. It stores parameter events, parameter batches, actions, timestamps, duration, and interpolation choices. It does not store decoded frames or rendered video and can therefore be replayed against another compatible source.

### Project

A project is the broad portable container. According to selected scope it can include parameters, video-file and transport references, active automation, and MIDI/OSC maps. Project loading does not silently reconnect a camera because device identity and availability are environment-specific.

## Recall domains

| Domain | Typical contents | Default preset | Default snapshot | Default project |
|---|---|---:|---:|---:|
| Look | color, glitch, clusters, scanlines, Smoosh, Luma, Flow appearance | Yes | Yes | Yes |
| Source | base-source behavior, background, seed | No | Yes | Yes |
| Temporal | history configuration and feedback behavior | Yes | Yes | Yes |
| Routing | layer priority, Global Mix position, Flow target, Luma A/B | Yes | Yes | Yes |
| Render | live render dimensions and quality | No | Yes | Yes |
| Transport | video path, position, rate, loop, play/pause state | No | Yes | Yes |
| Automation | active canonical automation clip | No | Yes | Yes |
| Control maps | MIDI and OSC map names and mapping tables | No | No | Yes |
| Persistent pixels | GPU history, feedback, flying buffer, Flow state | Never embedded | Never embedded | Never embedded |

Recall uses an intersection rule. A document cannot restore a domain that it did not capture, and a checked recall option cannot broaden the saved document after the fact.

## Parameter metadata

Each canonical parameter is classified with:

```text
stable ID
display label
group
state domain
presettable?
snapshot scoped?
sequenceable?
interpolation policy
project scoped?
live-safety classification
```

Live-safety classes are:

- `safe`
- `clears_temporal_state`
- `rebuilds_render_graph`
- `trigger_only`
- `not_implemented`

Interpolation policies are:

- `continuous`
- `step`
- `trigger_only`
- `not_sequenceable`

The full machine-readable catalog is available through **Export State Model**.

## Milestone 19 routing extension

The current registry contains **100 canonical parameters**. Milestone 19 adds `routing.program_bus` and `routing.monitor_bus`; both use the existing Routing recall domain and therefore remain compatible with the `huff-state/v1` model. Older documents omit them and receive safe Program defaults.

## File shape

A state document contains:

```json
{
  "schema": "huff-state/v1",
  "modelVersion": 1,
  "kind": "preset",
  "name": "Example",
  "createdUnixMs": 0,
  "engineBuild": "HNW-21",
  "recallScope": {},
  "parameterValues": {},
  "sourceState": null,
  "automationClip": null,
  "midiMap": null,
  "oscMap": null,
  "persistentImages": {
    "embedded": false,
    "policy": "not_embedded_clear_on_recall_when_temporal_or_render_state_changes",
    "resources": []
  },
  "notes": []
}
```

Suggested filenames are:

```text
name.huff-preset.json
name.huff-snapshot.json
name.huff-sequence.json
name.huff-project.json
```

## Source and transport recall

When Source recall is enabled and the document references an existing video file, HUFF opens that file and selects video as the active source. If the file is missing, the state load continues and reports a warning.

When Transport recall is enabled, HUFF restores decode mode, looping, playback rate, position, and play/pause state. Camera selection is deliberately manual because device lists, permissions, and stable identifiers differ by machine.

## Temporal behavior

Changing Temporal or Render state can invalidate existing history and feedback contents. HUFF therefore clears persistent buffers when the loaded parameters require it. Pixel memory is not embedded in this schema.

A later field-store instrument may define an explicit `.instrument-store` or related resource format. That should remain a separate typed object rather than being hidden inside every preset.
