# huff MIDI Map Format

Maps are plain JSON files. Load any `.json` file from the MIDI panel in huff.  
Factory maps live in `src/midi/`. User maps can live anywhere.

---

## Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Display name shown in the MIDI panel |
| `description` | string | — | Human-readable note about the map |
| `version` | integer | ✓ | Map format version. Currently `1`. |
| `channel` | integer | ✓ | MIDI channel filter. `-1` = accept all channels. `0`–`15` = specific channel. |
| `mappings` | array | ✓ | Array of mapping entries (see below). |

---

## Mapping entry fields

Each entry in `mappings` is an object. Entries with only a `_section` key are
treated as comments and ignored by the engine.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `param` | string | ✓ | huff element ID (see Parameter Reference below) |
| `cc` | integer | ✓ | MIDI CC number `0`–`127` |
| `type` | string | ✓ | `"range"`, `"toggle"`, or `"trigger"` |
| `enabled` | boolean | — | `false` disables the entry without deleting it. Default: `true` |
| `note` | string | — | Author comment — never parsed |

### type: range
CC value `0`–`127` is scaled linearly to the parameter's `min`–`max`.

### type: toggle
CC value `> 63` → checked / ON.  CC value `≤ 63` → unchecked / OFF.  
Works for checkboxes. Many controllers hold the last value sent, so toggling
a button sends alternating 127 / 0 — that works correctly here.

### type: trigger
Any CC value `> 0` fires the target button's click event.  
Use for `refreshBtn`, `resetMotionBtn`, etc.

---

## Parameter Reference

### Range inputs
| ID | Label | Min | Max |
|----|-------|-----|-----|
| `baseMix` | BASE MIX | 0 | 1 |
| `quality` | QUALITY | 0 | 3 |
| `feedback` | FEEDBACK | 0 | 3 |
| `persistence` | PERSISTENCE | 0 | 10 |
| `fbX` | FB X | -1 | 1 |
| `fbY` | FB Y | -1 | 1 |
| `fbZ` | FB Z | 0.98 | 1.03 |
| `fbTheta` | FB θ | -2 | 2 |
| `depth` | DEPTH | 0 | 0.5 |
| `depthScatter` | SCATTER | 0 | 1 |
| `corrupt` | CORRUPT % | 0 | 7 |
| `corruptDrift` | DRIFT | 0 | 1 |
| `block` | PIXEL SIZE | 150 | 2000 |
| `glitchSize` | GLITCH SIZE | 1 | 60 |
| `glitchAlpha` | OPACITY | 0 | 1 |
| `glitchJitter` | JITTER | 0 | 1 |
| `glitchSmear` | SMEAR | 0 | 200 |
| `glitchSmearAngle` | SMEAR ANGLE | 0 | 360 |
| `glitchSpeed` | SPEED | 0 | 10 |
| `glitchSpeedFine` | FINE SPEED | 0 | 5 |
| `glitchSpeedMul` | MULT | 0 | 5 |
| `glitchBaseX` | GLITCH X | -1 | 1 |
| `glitchBaseY` | GLITCH Y | -1 | 1 |
| `trailLayers` | TRAIL LAYERS | 0 | 10 |
| `trailDepth` | TRAIL DEPTH | 0 | 1 |
| `symPos` | SYM POS | 0 | 1 |
| `scanShift` | SHIFT | 0 | 0.5 |
| `scanDrift` | DRIFT | 0 | 3 |
| `scanSpeed` | SPEED | 0 | 5 |
| `scanGap` | GAP | 0 | 200 |
| `scanSkew` | SKEW | -1 | 1 |
| `scanAlpha` | OPACITY | 0 | 1 |
| `clusterCount` | BANDS | 0 | 30 |
| `clusterRadius` | BAND HEIGHT | 0 | 1 |
| `cluCenters` | CENTERS | 1 | 20 |
| `cluSpread` | SPREAD | 1 | 300 |
| `cluMinSpread` | MIN RAD | 0 | 150 |
| `spatialGap` | SPATIAL GAP | 0 | 200 |
| `cluBias` | BIAS | 0 | 1 |
| `cluDrift` | DRIFT | 0 | 5 |
| `cluSpeed` | SPEED | 0 | 15 |
| `cluInertia` | INERTIA | 0.01 | 0.99 |
| `solarizeThresh` | THRESH | 0 | 1 |
| `solarizeAmt` | AMOUNT | 0 | 1 |
| `solarizeR` | SOL R | 0 | 2 |
| `solarizeG` | SOL G | 0 | 2 |
| `solarizeB` | SOL B | 0 | 2 |
| `flowStrength` | STRENGTH | 0 | 20 |
| `flowScale` | SCALE | 40 | 200 |
| `flowPulse` | PULSE | 0 | 200 |
| `flowImpl` | IMPLODE | 0 | 1 |

### Toggles (checkboxes)
| ID | Label |
|----|-------|
| `corruptOn` | ON (Glitch) |
| `baseOn` | BASE VIDEO |
| `seedOnLoad` | SEED ON LOAD |
| `symOn` | SYMM |
| `clusters` | ON (Scanlines) |
| `scanRandSize` | RAND SIZE |
| `clusterTiles` | ON (Clusters) |
| `solarizeOn` | ON (Solarize) |
| `flowOn` | ON (Flow) |
| `trailOn` | ON (Trails) |

### Triggers (buttons)
| ID | Label |
|----|-------|
| `refreshBtn` | ↻ Refresh |
| `resetMotionBtn` | ↺ Reset Motion |
| `resetBtn` | ↺ Reset (all params) |

---

## Example custom map

```json
{
  "name": "My APC mini",
  "description": "APC mini faders + clip launch buttons",
  "version": 1,
  "channel": 0,
  "mappings": [
    { "param": "feedback",    "cc": 48, "type": "range",   "enabled": true },
    { "param": "corrupt",     "cc": 49, "type": "range",   "enabled": true },
    { "param": "corruptOn",   "cc": 64, "type": "toggle",  "enabled": true },
    { "param": "refreshBtn",  "cc": 82, "type": "trigger", "enabled": true }
  ]
}
```

---

## Tips

- **Duplicate CCs are fine.** If two entries share a CC, both params update simultaneously.
- **`enabled: false`** lets you save a mapping for reference without it being active.
- **`channel: -1`** is almost always what you want — most controllers send on channel 1 (index 0) by default but some send on "any".
- **Virtual MIDI ports** — On macOS enable the IAC Driver in Audio MIDI Setup. On Windows install loopMIDI. Start the huff MIDI Bridge after creating the virtual port. Max/MSP and Pure Data can then send MIDI to that port and huff will receive it.
- **The bridge polls for new ports every 2 seconds.** You can connect/disconnect hardware controllers while both huff and the bridge are running.
