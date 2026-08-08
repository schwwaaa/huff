# huff OSC Map Format

OSC maps are plain JSON files. Load them at runtime via the OSC panel → Load Map.  
The map persists in `localStorage` and reloads automatically on the next launch.

---

## Schema

```json
{
  "name":        "My Layout",
  "description": "Optional note shown in the panel",
  "version":     1,
  "mappings": [
    {
      "param":    "feedback",
      "addr":     "/1/fader1",
      "type":     "range",
      "inputMin": 0,
      "inputMax": 1,
      "enabled":  true,
      "note":     "optional label in the table"
    }
  ]
}
```

### Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Shown in the OSC panel |
| `description` | string | no | Tooltip on the map name chip |
| `version` | number | yes | Always `1` |
| `mappings` | array | yes | List of mapping entries (see below) |

### Mapping entry fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `param` | string | yes | DOM element ID of the target control |
| `addr` | string | yes | Full OSC address e.g. `/1/fader1` or `/huff/feedback` |
| `type` | string | yes | `range` · `toggle` · `trigger` |
| `inputMin` | number | range only | Minimum value the sender can emit (default `0`) |
| `inputMax` | number | range only | Maximum value the sender can emit (default `1`) |
| `enabled` | boolean | no | `false` disables without deleting (default `true`) |
| `note` | string | no | Label in the mapping table |
| `_section` | string | — | Comment header — never dispatched, renders as a row divider |

---

## Types

### `range`
The incoming OSC float is linearly mapped from `inputMin–inputMax` to the parameter's native `min–max` (taken from the DOM element's `min`/`max` attributes).

TouchOSC faders, knobs, and XY pads send `0.0–1.0` — set `inputMin: 0, inputMax: 1`.  
If your sender outputs `0–127` (some MIDI-to-OSC bridges), set `inputMin: 0, inputMax: 127`.

### `toggle`
Value `> 0.5` → checked/ON. Value `≤ 0.5` → unchecked/OFF.  
TouchOSC toggle buttons send `1.0` on press and `0.0` on release.  
TouchOSC momentary buttons: the param will follow the finger (on while held, off on release).  
TouchOSC persistent buttons (latching): set the button to toggle mode in the editor.

### `trigger`
Any value `> 0.5` fires the target button's `.click()` event.  
Use for huff's action buttons: `refreshBtn` (reseed) and `resetMotionBtn` (reset FB motion).

---

## Mappable Parameter IDs

### Ranges

| ID | Min | Max | Description |
|---|---|---|---|
| `feedback` | 0 | 1 | Feedback amount |
| `depth` | 0 | 1 | Scanline depth |
| `corrupt` | 0 | 1 | Corrupt % |
| `baseMix` | 0 | 1 | Base video mix |
| `glitchSpeed` | 0 | 5 | Legacy Corrupt rate base |
| `glitchSpeedMul` | 0 | 10 | Legacy Corrupt rate multiplier |
| `flowStrength` | 0 | 1 | Flow warp strength |
| `fbZ` | 0 | 2 | Feedback zoom |
| `fbX` | 0 | 2 | Feedback X offset |
| `fbY` | 0 | 2 | Feedback Y offset |
| `fbTheta` | -1 | 1 | Feedback rotation |
| `persistence` | 0 | 1 | Trail persistence |
| `block` | 1 | 64 | Pixel block size |
| `glitchSize` | 1 | 60 | Corrupt patch size |
| `glitchSmear` | 0 | 200 | Corrupt repeats |
| `glitchAlpha` | 0 | 1 | Corrupt mix |
| `glitchJitter` | 0 | 1 | Positional jitter |
| `corruptDrift` | 0 | 1 | Corrupt amount drift |
| `corruptSpeed` | 0 | 4 | Master Corrupt motion speed |
| `depthScatter` | 0 | 1 | Corrupt age spread |
| `glitchBaseX` | -1000 | 1000 | Corrupt position X |
| `glitchBaseY` | -1000 | 1000 | Corrupt position Y |
| `glitchBaseZ` | -1 | 1 | Corrupt position Z (2.5D) |
| `corruptMoveX` | -1200 | 1200 | Corrupt move X px/s |
| `corruptMoveY` | -1200 | 1200 | Corrupt move Y px/s |
| `corruptMoveZ` | -1.5 | 1.5 | Corrupt move Z units/s |
| `scanShift` | -200 | 200 | Scanline horizontal shift |
| `scanDrift` | 0 | 5 | Scanline drift speed |
| `scanAlpha` | 0 | 1 | Scanline band opacity |
| `scanSpeed` | 0 | 5 | Scanline global speed |
| `scanGap` | 0 | 200 | Scanline gap quantise |
| `scanSkew` | -1 | 1 | Scanline skew |
| `cluSpread` | 1 | 300 | Corrupt group size |
| `cluDepth` | 0 | 1 | Corrupt group Z spread |
| `cluMoveX` | -600 | 600 | Group move X px/s |
| `cluMoveY` | -600 | 600 | Group move Y px/s |
| `cluMoveZ` | -1.5 | 1.5 | Group move Z units/s |
| `cluMinSpread` | 0 | 150 | Corrupt hollow radius |
| `cluBias` | 0 | 1 | Corrupt group amount |
| `cluSpeed` | 0 | 10 | Corrupt group organic speed |
| `cluInertia` | 0.01 | 0.99 | Corrupt group momentum |
| `cluDrift` | 0 | 5 | Corrupt group wander |
| `symPos` | 0 | 1 | Symmetry axis position |
| `solarizeThresh` | 0 | 1 | Solarize threshold |
| `trailDepth` | 0 | 1 | Trail depth |
| `quality` | 0 | 1 | Render quality |

> **Pass 38 Corrupt note:** HUFF presents **FIELD RATE** for the legacy `speed × fine × mult²` field contract and a separate **SPEED** (`corruptSpeed`) for autonomous Corrupt/XYZ/Cluster motion. Existing OSC mappings to the legacy speed IDs remain valid.

### Toggles (checked = ON)

| ID | Description |
|---|---|
| `corruptOn` | Corrupt system |
| `clusters` | Scanlines |
| `clusterTiles` | Clusters On (Corrupt) |
| `flowOn` | Flow warp |
| `symOn` | Symmetry |
| `solarizeOn` | Solarize |
| `trailOn` | Trails |
| `baseOn` | Base video |
| `seedOnLoad` | Seed on load |

### Triggers (fires on value > 0.5)

| ID | Description |
|---|---|
| `refreshBtn` | Re-seed Corrupt |
| `resetMotionBtn` | Reset FB motion to defaults |

---

## TouchOSC Setup

1. Open TouchOSC on your phone or tablet.
2. Go to **Settings → OSC**.
3. Set **Host** to your computer's local IP address (e.g. `192.168.1.42`).
4. Set **Port (outgoing)** to `9000`.
5. Enable **OSC**.
6. In huff, open the OSC panel — the status line shows the port and confirms the listener is active.
7. Load a map file. Move a control. The OSC pill in the topbar flashes the address on every message.

huff listens on `0.0.0.0:9000` — any device on the same network can send to it.

### Address naming conventions

TouchOSC built-in templates use `/page/control` format:  
`/1/fader1` — page 1, first fader.  
`/2/rotary3` — page 2, third rotary knob.

For custom layouts you can use any address. The `/huff/` prefix used in `generic-16.json` is a convention — there is nothing special about it.

---

## Soft OSC (same machine)

To send OSC from software running on the same machine as huff:

**Max/MSP:** `[udpsend 127.0.0.1 9000]`  
**Pure Data:** `[netsend -u -b 127.0.0.1 9000]` or `[oscformat] → [udpsend]`  
**SuperCollider:** `NetAddr("127.0.0.1", 9000).sendMsg("/huff/feedback", 0.75)`  
**TouchDesigner:** CHOP → OSC Out DAT, host `127.0.0.1`, port `9000`  
**Python (pythonosc):** `udp_client.SimpleUDPClient("127.0.0.1", 9000)`
