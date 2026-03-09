<p align="center">
  <img width="300px" height="950px" src="https://github.com/schwwaaa/huff/blob/beta/src-tauri/icons/icon.png?raw=true"/>  
</p>

<p align="center"><em>A real-time datamosh / glitch-art desktop application built with Tauri + p5.js.</em></p>

huff is a desktop application built with [Tauri v1](https://tauri.app) and [p5.js](https://p5js.org). It applies a configurable stack of live visual effects — feedback loops, scanlines, pixel corruption, flow warping, solarization, and symmetry — to a video source. Every parameter is controllable in real time via a built-in panel, MIDI hardware, or OSC over UDP.

---

## Features

- **Feedback loop** — continuously re-processes the previous frame with zoom, pan, and rotation transforms
- **Glitch / corruption** — tile-based pixel displacement with cluster physics, jitter, smear, and alpha
- **Scanlines** — animated horizontal band pass with drift, shift, skew, and gap quantization
- **Flow warp** — Perlin noise-driven displacement field
- **Solarization** — per-channel luminance inversion with threshold control
- **Symmetry** — vertical, horizontal, or quad mirror modes
- **Trails** — luma-keyed frame blending with configurable depth
- **Preset system** — save and restore full parameter states by name
- **MIDI** — connect any USB or virtual MIDI controller; map CCs to parameters via JSON
- **OSC** — receive Open Sound Control over UDP from TouchOSC, Max/MSP, Pure Data, SuperCollider, TouchDesigner, or any OSC-capable software

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v1 (Rust) |
| Frontend | p5.js + vanilla JS + HTML/CSS |
| Canvas ↔ controls IPC | WebSocket relay (Rust, port 8787) |
| MIDI input | `midir` crate (CoreMIDI / ALSA / WinMM) |
| OSC input | `rosc` crate + Tokio UDP socket (port 9000) |
| Build | `@tauri-apps/cli` via npm |

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18 or later | |
| Rust | stable (1.70+) | install via [rustup](https://rustup.rs) |
| Tauri CLI | 1.x | installed automatically via npm |
| Xcode CLT | latest | macOS only — `xcode-select --install` |

---

## Getting started

```bash
# 1. Clone
git clone https://github.com/schwwaaa/huff.git
cd huff

# 2. Install JS dependencies
npm install

# 3. Run in dev mode (hot-reload frontend, Rust recompiles on change)
npm run dev

# 4. Production build
npm run build
```

The first `npm run dev` after a fresh clone will take several minutes — Cargo needs to fetch and compile Rust crates including `tokio`, `midir`, and `rosc`. Subsequent builds are cached.

---

## Project structure

```
huff/
├── src/                        # Frontend (loaded by Tauri WebView)
│   ├── index.html              # Control panel — all parameters, MIDI modal, OSC modal
│   ├── canvas.html             # Render window — p5 canvas only
│   ├── canvas.js               # p5 lifecycle, UI wiring, WebSocket client
│   ├── effects.js              # All rendering passes (no DOM, no WS — pure canvas)
│   ├── p5.js                   # p5.js local copy
│   ├── midi/                   # MIDI map files
│   │   ├── FORMAT.md           # Map authoring reference
│   │   ├── nanokontrol2.json   # Korg nanoKONTROL2 factory map
│   │   ├── nanokontrol1.json   # Korg nanoKONTROL mk1 factory map
│   │   └── generic.json        # 16-CC starter map
│   └── osc/                    # OSC map files
│       ├── FORMAT.md           # Map authoring reference
│       ├── touchosc-mix.json   # TouchOSC Mix template — primary surface
│       ├── touchosc-effects.json # TouchOSC — texture and physics
│       ├── generic-16.json     # 16 /huff/ addresses for any sender
│       └── osc-validate.json   # 3-address smoke test
│
├── src-tauri/
│   ├── src/main.rs             # Rust: WS relay + MIDI commands + OSC listener
│   ├── Cargo.toml
│   └── tauri.conf.json
│
└── package.json
```

---

## Architecture

### Two-window model

huff opens two windows at startup. The **control panel** (`index.html`) runs in the primary window and contains all sliders, checkboxes, and buttons. The **canvas** (`canvas.html`) runs in a second window and renders the p5.js output. They communicate via a Rust-hosted WebSocket relay on `ws://127.0.0.1:8787`.

```
index.html  ──WS text──►  main.rs relay  ──WS text──►  canvas.js
                          ◄──WS binary──              ──WS binary──►
```

Text messages carry parameter JSON. Binary messages carry raw pixel data when needed. The relay is role-aware — each client identifies itself on connection with `{"type":"hello","role":"index|canvas"}` and the relay routes accordingly.

### Graphics pipeline

All rendering lives in `effects.js`. Functions are standalone passes called in sequence by `canvas.js`:

```
video frame
    │
    ▼
applyTrails()       — luma-keyed frame blending
    │
    ▼
applyGlitch()       — tile displacement + cluster physics
    │
    ▼
applyScanlines()    — animated band pass
    │
    ▼
applyFlowWarp()     — Perlin noise displacement
    │
    ▼
applySolarize()     — luminance inversion
    │
    ▼
applySymmetry()     — mirror transform
    │
    ▼
feedback loop       — transformed composite → next frame input
```

> **Note for contributors:** `effects.js` must not be coupled to DOM elements or the WebSocket. All parameters enter as function arguments. This separation is intentional — the canvas window has no access to the control panel's DOM.

### Cluster physics

`applyGlitch()` places displacement tiles using either a static noise distribution (`cluSpeed === 0`) or a full velocity-integrated physics simulation (`cluSpeed > 0`). Physics state (`_cluPhysics[]`, `_cluPhysT`) is module-level and persists across frames to carry momentum.

### MIDI

MIDI runs entirely in Rust via `midir`. There is no Web MIDI API usage — `navigator.requestMIDIAccess` does not function inside Tauri's WebView because `tauri://` is not a secure context.

```
USB/virtual MIDI device
    │
    ▼
midir (Rust, CoreMIDI/ALSA/WinMM)
    │  parse_midi() → MidiEvent
    ▼
window.emit("midi-event")          Tauri IPC
    │
    ▼
tauriEvent.listen("midi-event")    index.html
    │  ccLookup[cc] → { paramId, type }
    ▼
DOM element  →  input/change/click event  →  canvas.js draw loop
```

**Tauri commands exposed:**

| Command | Description |
|---|---|
| `list_midi_ports()` | Returns all OS-visible port names. Creates a fresh `MidiInput` each call so virtual ports appear without restart. |
| `connect_midi_port_by_name({ portName })` | Exact match first, then case-insensitive substring. Drops any existing connection first. |
| `connect_midi_port({ portIndex })` | Legacy index-based connect. |
| `disconnect_midi()` | Releases the active port. |
| `debug_midi_ports()` | Prints all visible ports to stdout. Returns the same string. |

### OSC

OSC runs over UDP. Rust binds `0.0.0.0:9000` at startup so any device on the local network can send to it. Packets are decoded with `rosc` and bundles are handled recursively.

```
TouchOSC / Max / Pd / SuperCollider
    │  UDP packet → 0.0.0.0:9000
    ▼
rosc::decoder::decode_udp()
    │  OscPacket → OscEvent { addr, value, args }
    ▼
app.emit_all("osc-message")        Tauri IPC (all windows)
    │
    ▼
tauriEvent.listen("osc-message")   index.html
    │  addrLookup[addr] → { paramId, type, inputMin, inputMax }
    ▼
DOM element  →  input/change/click event  →  canvas.js draw loop
```

**Tauri commands exposed:**

| Command | Description |
|---|---|
| `get_osc_port()` | Returns `9000`. Lets the frontend display the active port. |

---

## MIDI maps

MIDI maps are JSON files loaded at runtime via the MIDI panel. The loaded map persists in `localStorage` and reloads automatically on the next launch.

```json
{
  "name": "My Controller",
  "description": "optional",
  "version": 1,
  "channel": -1,
  "mappings": [
    { "param": "feedback",  "cc": 0,  "type": "range",   "enabled": true },
    { "param": "corruptOn", "cc": 32, "type": "toggle",  "enabled": true },
    { "param": "refreshBtn","cc": 41, "type": "trigger", "enabled": true },
    { "_section": "comments are ignored by the engine" }
  ]
}
```

`channel: -1` accepts any channel. `0`–`15` filters to a specific channel.

| `type` | Behaviour |
|---|---|
| `range` | CC 0–127 scaled linearly to the element's `min`–`max` |
| `toggle` | CC > 63 → checked · CC ≤ 63 → unchecked |
| `trigger` | Any CC value > 0 fires `.click()` |

Full parameter reference: `src/midi/FORMAT.md`

Factory maps in `src/midi/`: `nanokontrol2.json`, `nanokontrol1.json`, `generic.json`

---

## OSC maps

OSC maps follow the same load/persist pattern as MIDI maps.

```json
{
  "name": "My Layout",
  "version": 1,
  "mappings": [
    { "param": "feedback",  "addr": "/1/fader1", "type": "range",   "inputMin": 0, "inputMax": 1 },
    { "param": "corruptOn", "addr": "/1/toggle1","type": "toggle",  "inputMin": 0, "inputMax": 1 },
    { "param": "refreshBtn","addr": "/1/push1",  "type": "trigger", "inputMin": 0, "inputMax": 1 }
  ]
}
```

`inputMin`/`inputMax` define the range the sender emits. The engine normalises this to 0–1 before scaling to the parameter's native range. Use `inputMax: 127` for MIDI-to-OSC bridges.

| `type` | Behaviour |
|---|---|
| `range` | Incoming value normalised from `inputMin–inputMax` → element `min`–`max` |
| `toggle` | Value > 0.5 → checked · value ≤ 0.5 → unchecked |
| `trigger` | Value > 0.5 fires `.click()` |

Full parameter reference: `src/osc/FORMAT.md`

Factory maps in `src/osc/`: `touchosc-mix.json`, `touchosc-effects.json`, `generic-16.json`

**TouchOSC setup:** Settings → OSC → Host = your computer's LAN IP → Port (outgoing) = `9000` → enable OSC.

**Soft OSC (same machine):**
- Max/MSP: `[udpsend 127.0.0.1 9000]`
- Pure Data: `[netsend -u -b 127.0.0.1 9000]`
- SuperCollider: `NetAddr("127.0.0.1", 9000).sendMsg("/huff/feedback", 0.75)`

---

## Adding a new effect parameter

1. Add the control element to `index.html` with a unique `id`.
2. Register the `id` in the `hookUI()` element map in `canvas.js`.
3. Add it to `PRESET_PARAM_IDS` in `index.html` if it should be saved with presets.
4. Read the value in `canvas.js` and pass it to the relevant `effects.js` function.
5. Add a `_section` comment and entry to any relevant map files in `src/midi/` and `src/osc/`.

Do not modify `effects.js` to read from the DOM directly. All parameters must flow through function arguments.

---

## Contributing

Issues and pull requests are welcome at [github.com/schwwaaa/huff](https://github.com/schwwaaa/huff).

When contributing to the graphics pipeline, please run a before/after visual comparison — small regressions in `effects.js` are easy to introduce and hard to catch in code review alone.

---

## License

ISC
