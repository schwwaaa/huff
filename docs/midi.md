---
layout: page
title: MIDI
permalink: /midi/
nav_order: 5
---

huff's MIDI system runs natively in Rust via `midir`. USB controllers, USB-MIDI interfaces, and virtual ports (IAC Bus on macOS, loopMIDI on Windows) are all supported. There is no Web MIDI API involved — MIDI does not go through the browser.

<div class="callout note">
  <strong>Hot connection:</strong> The MIDI port list is refreshed on demand. Click <strong>↻ Refresh</strong> after connecting a device. Ports connected after the app launched will not appear until you refresh.
</div>

---

## Connecting a Device

1. Click the **MIDI** button in the top bar to open the MIDI panel.
2. Click **↻ Refresh** to scan available ports.
3. Select your device from the dropdown.
4. Click **Connect**. The status area confirms the port name.

To switch devices: click **Disconnect**, then select and connect a different port.

<div class="img-placeholder">
  <span class="ph-label">📸 SCREENSHOT PLACEHOLDER</span>
  <span>MIDI panel open showing a connected nanoKONTROL2<br/>
  <em>Replace with: screenshot of the MIDI overlay with an active connection</em></span>
</div>

---

## MIDI Map Format

Maps are plain JSON files that you load at runtime via **📂 Load Map…**. They persist in `localStorage` and reload automatically on next launch.

The `param` field is the DOM element ID of the control to drive. See [Parameter Reference](parameter-reference) for the full ID list.

```json
{
  "name": "My APC mini",
  "description": "Faders 1–8 + clip launch buttons",
  "version": 1,
  "channel": -1,
  "mappings": [
    { "param": "feedback",    "cc": 48, "type": "range",   "enabled": true },
    { "param": "corrupt",     "cc": 49, "type": "range",   "enabled": true },
    { "param": "depth",       "cc": 50, "type": "range",   "enabled": true },
    { "param": "flowStrength","cc": 51, "type": "range",   "enabled": true },
    { "param": "corruptOn",   "cc": 64, "type": "toggle",  "enabled": true },
    { "param": "flowOn",      "cc": 65, "type": "toggle",  "enabled": true },
    { "param": "refreshBtn",  "cc": 82, "type": "trigger", "enabled": true }
  ]
}
```

### Field Reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Shown in the MIDI panel |
| `version` | integer | yes | Always `1` |
| `channel` | integer | yes | `-1` = all channels. `0`–`15` = specific channel (0-indexed). |
| `mappings` | array | yes | Array of mapping entries |

### Mapping Entry Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `param` | string | yes | DOM element ID (see [Parameter Reference](parameter-reference)) |
| `cc` | integer | yes | CC number 0–127 |
| `type` | string | yes | `range`, `toggle`, or `trigger` |
| `enabled` | boolean | no | `false` disables without deleting. Default: `true` |
| `note` | string | no | Author comment, never parsed |

### Type Behaviour

**`range`** — CC 0–127 scaled linearly to the parameter's min–max.

**`toggle`** — CC > 63 → checked/ON. CC ≤ 63 → unchecked/OFF. Works for any checkbox parameter.

**`trigger`** — Any CC > 0 fires the button's click event. Use for `refreshBtn` (reseed), `resetMotionBtn` (reset FB motion), `resetBtn` (reset all).

---

## Bundled Maps

| File | Controller |
|------|-----------|
| `src/midi/nanokontrol2.json` | Korg nanoKONTROL2 — full fader + knob + transport mapping |
| `src/midi/nanokontrol1.json` | Korg nanoKONTROL (original) |
| `src/midi/generic.json` | Generic template using CC 14–29 |

---

## Virtual MIDI

### macOS — IAC Driver

1. Open **Audio MIDI Setup** (Applications → Utilities).
2. Open **MIDI Studio** (⌘2).
3. Double-click **IAC Driver**.
4. Enable **Device is online**, add a port (e.g. "Bus 1").
5. The IAC port appears in huff's MIDI port list after a refresh.

### Windows — loopMIDI

1. Download and install [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html) by Tobias Erichsen.
2. Create a virtual port.
3. The port appears in huff's MIDI port list after a refresh.

Once a virtual port exists, Max/MSP, Pure Data, Ableton Live, and any other MIDI-capable software can send to huff through it.

---

## Tips

- **Duplicate CCs are fine.** Two entries sharing a CC update both parameters simultaneously — useful for driving related controls with one physical knob.
- **`enabled: false`** lets you keep a mapping in the file for reference without it being active. Toggle it back on without reloading the file.
- **`channel: -1`** is almost always correct. Most controllers default to channel 1 (index 0) but some advertise "all channels" — `-1` handles both cases.
- **The MIDI bridge polls for new ports every 2 seconds** when the MIDI panel is open. You can plug/unplug hardware controllers while huff is running and use ↻ Refresh to see them.
