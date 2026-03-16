---
layout: page
title: huff
permalink: /
---

<div style="text-align:center;margin:2rem 0 1rem">
  <img src="https://github.com/schwwaaa/huff/blob/beta/src-tauri/icons/icon.png?raw=true" width="90" alt="huff icon" style="border-radius:16px"/>
</div>

<div style="text-align:center;margin-bottom:2rem">
  <strong style="font-size:1.4rem">Real-time datamosh &amp; glitch-art for desktop.</strong><br/>
  <span style="opacity:0.6;font-size:0.95rem">Tauri · p5.js · Rust · Syphon · Spout · MIDI · OSC</span>
</div>

<div class="badge-strip" style="justify-content:center">
  <img src="https://img.shields.io/badge/version-1.0.2--beta-ff4444?style=flat-square" alt="version"/>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square" alt="platform"/>
  <img src="https://img.shields.io/badge/Tauri-v1-blueviolet?style=flat-square" alt="tauri"/>
  <img src="https://img.shields.io/badge/license-ISC-green?style=flat-square" alt="license"/>
</div>

---

huff is a desktop application for creating real-time datamosh, glitch-art, and feedback effects. Load a video file or connect a webcam, then sculpt the image through a live effect chain — datamosh tile displacement, feedback loops, flow warps, symmetry folds, solarise, scanline corruption, and ghost trails.

It ships with a **two-window architecture**: a controls panel and a separate fullscreen output window that receives the processed frames over a local WebSocket relay. The output window can be recorded, mirrored to a projector, or shared directly to VJ software via **Syphon** (macOS) or **Spout** (Windows).

huff is built for **performers and artists** who want a tool that behaves predictably under pressure — MIDI-mappable, OSC-receivable, and hot-swappable mid-set.

<div class="img-placeholder">
  <span class="ph-label">📸 SCREENSHOT PLACEHOLDER</span>
  <span>huff controls window + output window side by side<br/>
  <em>Replace with: screenshot of the full app in use, ideally during a live performance</em></span>
</div>

---

## Features

- **Datamosh / glitch tiles** — temporal tile displacement sampled from a 60-frame ring buffer with cluster physics, spatial gap, smear, and depth scatter
- **Feedback loop** — zoom, translate X/Y, and rotate the buffer back onto itself each frame
- **Flow warp** — noise-field optical-flow UV distortion with pulse and implosion modes
- **Symmetry** — vertical, horizontal, or both axes with a moveable split position
- **Solarise** — luminance-threshold colour inversion with per-channel R/G/B tinting
- **Scanline bands** — drifting horizontal displacement bands sampled from past frames with gap quantisation and skew
- **Trails** — stacked ghost frames with luma keying for motion-smear
- **Camera input** — live webcam feed alongside or instead of video files
- **Syphon (macOS)** — zero-install Metal texture sharing to Resolume, VDMX, MadMapper, CoGe, and any Syphon receiver
- **Spout (Windows)** — D3D11 texture sharing to Resolume Arena, TouchDesigner, MadMapper, and any Spout2 receiver
- **MIDI** — full CC/note input via native Rust `midir`; JSON map files; hardware + virtual ports
- **OSC** — UDP listener on port 9000; JSON map files; TouchOSC, Max/MSP, Pure Data, SuperCollider, TouchDesigner
- **Presets** — save/recall named parameter snapshots; 7 factory presets included
- **Keyboard shortcuts** — `P` toggles controls panel, `F` toggles output fullscreen

---

## Quick Start

```bash
# 1. Download from Releases, or build from source:
git clone https://github.com/your-org/huff.git
cd huff && npm install && npm run dev

# 2. Load a video file or start your webcam in the Source group
# 3. Enable Glitch — move CORRUPT % above 0
# 4. Open canvas.html in a second monitor window → press F for fullscreen
```

---

## Documentation

| Section | What's covered |
|---------|---------------|
| [How it Works](how-it-works) | Effect pipeline, data flow diagrams, frame output architecture |
| [Installation](installation) | macOS DMG, Windows installer, build from source |
| [The Interface](interface) | Every control group, every parameter explained |
| [MIDI](midi) | Connecting devices, map format, virtual ports |
| [OSC](osc) | Setup, map format, TouchOSC, Max/MSP, TouchDesigner |
| [Video Output](output) | Syphon, Spout, canvas mirror window |
| [Parameter Reference](parameter-reference) | Complete ID/range table for MIDI + OSC maps |
| [Architecture](architecture) | File structure, Rust internals, WebSocket relay |
| [Caveats](caveats) | Known limitations, platform notes, edge cases |
| [Troubleshooting](troubleshooting) | Common problems and fixes |
