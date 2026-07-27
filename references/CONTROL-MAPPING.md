# HUFF canonical control maps

## File container

```json
{
  "schema": "huff-control-map/v1",
  "name": "My controller",
  "notes": "Optional human-readable notes",
  "mappings": []
}
```

MIDI and OSC files share the container schema but have different mapping objects.

## Canonical targets

A target is either a parameter ID from the native registry, such as:

```text
feedback.amount
flow.flow_strength
scanlines.scan_on
cluster.cluster_tiles
```

or an action ID:

```text
clear_buffers
flow_pulse
reset_parameters
```

The UI displays the human label and the stable canonical ID together.

## MIDI mapping example

```json
{
  "id": 1,
  "target": "feedback.amount",
  "sourceKind": "cc",
  "channel": 1,
  "number": 1,
  "min": 0.0,
  "max": 1.0,
  "invert": false,
  "smoothing": 0.18,
  "enabled": true,
  "behavior": "absolute",
  "curve": "linear",
  "threshold": 0.5,
  "note": "Mod wheel"
}
```

Channel `0` means any channel. Supported sources are `cc`, `note_on`, `pitch_bend`, `channel_pressure`, `poly_aftertouch`, and `program_change`.

## OSC mapping example

```json
{
  "id": 1,
  "target": "feedback.amount",
  "address": "/huff/feedback",
  "argumentIndex": 0,
  "inputMin": 0.0,
  "inputMax": 1.0,
  "outputMin": 0.0,
  "outputMax": 1.0,
  "invert": false,
  "smoothing": 0.18,
  "enabled": true,
  "behavior": "absolute",
  "curve": "linear",
  "threshold": 0.5,
  "note": "Main feedback fader"
}
```

OSC learn captures the first numeric argument and records its argument index. Integer, float, long, double, Boolean, and character arguments can be mapped.

## Curves

- `linear` — direct response
- `smooth` — smoothstep response
- `square` — finer control near zero
- `cube` — stronger low-end precision
- `sqrt` — faster rise near zero

## Output ranges

Output ranges are normalized fractions of the target's canonical range. For example, `0.25–0.75` on a `0–2` parameter produces an actual range of `0.5–1.5`.
