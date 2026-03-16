---
layout: page
title: OSC
permalink: /osc/
nav_order: 6
---

huff listens for UDP OSC on port **9000** at `0.0.0.0` — any device on the same local network can send to it. The listener starts automatically when the app launches.

---

## Setup

1. Click the **OSC** button in the top bar.
2. The status area confirms the listener is active and shows the port.
3. Load a map file via **📂 Load Map…**
4. Move a control on your sender. The OSC pill in the top bar flashes the incoming address.

The loaded map persists in `localStorage` and reloads on the next launch automatically.

<div class="img-placeholder">
  <span class="ph-label">📸 SCREENSHOT PLACEHOLDER</span>
  <span>OSC panel with an active map loaded showing the mapping table<br/>
  <em>Replace with: screenshot of the OSC overlay with a loaded touchosc-effects.json map</em></span>
</div>

---

## OSC Map Format

```json
{
  "name": "My TouchOSC Layout",
  "description": "Main effects page",
  "version": 1,
  "mappings": [
    {
      "param":    "feedback",
      "addr":     "/1/fader1",
      "type":     "range",
      "inputMin": 0,
      "inputMax": 1,
      "enabled":  true,
      "note":     "Main feedback fader"
    },
    {
      "param":    "corruptOn",
      "addr":     "/1/toggle1",
      "type":     "toggle",
      "enabled":  true
    },
    {
      "param":    "refreshBtn",
      "addr":     "/1/push1",
      "type":     "trigger",
      "enabled":  true,
      "note":     "Reseed"
    },
    {
      "_section": "Flow Warp"
    },
    {
      "param":    "flowStrength",
      "addr":     "/2/fader1",
      "type":     "range",
      "inputMin": 0,
      "inputMax": 1,
      "enabled":  true
    }
  ]
}
```

### Top-Level Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Shown in the OSC panel |
| `description` | string | no | Tooltip on the map name |
| `version` | number | yes | Always `1` |
| `mappings` | array | yes | Mapping entries (see below) |

### Mapping Entry Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `param` | string | yes | DOM element ID (see [Parameter Reference](parameter-reference)) |
| `addr` | string | yes | Full OSC address e.g. `/1/fader1` |
| `type` | string | yes | `range`, `toggle`, or `trigger` |
| `inputMin` | number | range only | Minimum value the sender emits. Default: `0` |
| `inputMax` | number | range only | Maximum value the sender emits. Default: `1` |
| `enabled` | boolean | no | `false` disables without deleting. Default: `true` |
| `note` | string | no | Label shown in the mapping table |
| `_section` | string | — | Comment row — renders as a divider header, never dispatched |

### Type Behaviour

**`range`** — incoming float linearly mapped from `inputMin–inputMax` to the parameter's native min–max.

Set `inputMin: 0, inputMax: 1` for TouchOSC faders (0.0–1.0 range).  
Set `inputMin: 0, inputMax: 127` for MIDI-to-OSC bridges that send integer values.

**`toggle`** — value > 0.5 → ON. value ≤ 0.5 → OFF.  
TouchOSC toggle buttons: 1.0 on press, 0.0 on release.  
For latching behaviour, set the button to **toggle mode** in the TouchOSC editor.

**`trigger`** — value > 0.5 fires the button click. Use for `refreshBtn`, `resetMotionBtn`, `resetBtn`.

---

## Sending from Software

| Software | Code / Setting |
|----------|---------------|
| **Max/MSP** | `[udpsend 127.0.0.1 9000]` |
| **Pure Data** | `[netsend -u -b 127.0.0.1 9000]` then `[oscformat]` |
| **SuperCollider** | `NetAddr("127.0.0.1", 9000).sendMsg("/1/fader1", 0.75)` |
| **TouchDesigner** | OSC Out DAT, host `127.0.0.1`, port `9000` |
| **Python (pythonosc)** | `SimpleUDPClient("127.0.0.1", 9000).send_message("/1/fader1", 0.75)` |
| **Protokol / OSCQuery** | Any app supporting OSC output |

---

## TouchOSC

<div class="img-placeholder">
  <span class="ph-label">📸 SCREENSHOT PLACEHOLDER</span>
  <span>TouchOSC editor showing the effects layout mapped to huff<br/>
  <em>Replace with: screenshot of TouchOSC app on iPad with the bundled layout loaded</em></span>
</div>

1. In TouchOSC go to **Settings → OSC**.
2. Set **Host** to your computer's local IP (e.g. `192.168.1.42`). Find this in System Preferences → Network (macOS) or Settings → Network (Windows).
3. Set **Port (outgoing)** to `9000`.
4. Enable **OSC**.
5. In huff's OSC panel, load `src/osc/touchosc-effects.json` or `touchosc-mix.json`.

### Bundled TouchOSC Layouts

| File | Contents |
|------|---------|
| `src/osc/touchosc-effects.json` | Main effects — Glitch, Feedback, Flow Warp, Symmetry |
| `src/osc/touchosc-mix.json` | Mix layer — Base Mix, Scanlines, Solarize, Trails |
| `src/osc/generic-16.json` | 16-parameter generic template using `/huff/` prefix |

### Address Conventions

TouchOSC built-in templates use `/page/control` format:

```
/1/fader1   → page 1, first fader
/2/rotary3  → page 2, third rotary
/1/toggle1  → page 1, first toggle button
```

The `/huff/` prefix used in `generic-16.json` is a convention — huff's OSC listener accepts any address.

---

## Soft OSC (same machine)

To send OSC from software running on the same machine as huff, use `127.0.0.1` as the host:

```supercollider
// SuperCollider
NetAddr("127.0.0.1", 9000).sendMsg("/1/fader1", 0.75);
```

```python
# Python
from pythonosc.udp_client import SimpleUDPClient
client = SimpleUDPClient("127.0.0.1", 9000)
client.send_message("/1/fader1", 0.75)
```

```maxmsp
// Max/MSP
[prepend /1/fader1] → [pack f] → [udpsend 127.0.0.1 9000]
```
