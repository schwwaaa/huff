# Huff → Native wgpu Migration Map

## Target architecture

```text
Controls WebView
  ├── existing Huff layout
  ├── presets / mapping editor
  └── operator feedback
          ↓ commands
Canonical Rust parameter registry
          ↓ evaluated snapshots
Native sources and routing
  ├── video decoder + audio clock
  ├── camera
  ├── MIDI / OSC / automation
  └── media buses
          ↓
wgpu render graph
  ├── source ingest
  ├── temporal texture history
  ├── tile / cluster compositor
  ├── feedback
  ├── flow / displacement
  ├── luma / layer composition
  └── presentation
          ↓
Native output sinks
  ├── output window
  ├── Syphon
  ├── Spout
  ├── recorder
  └── tiled high-resolution export
```

## Conversion stages

### Milestone 01 — Native playback foundation

Status: included in this project.

- FFmpeg video decode
- FFmpeg + CPAL audio playback
- wgpu output surface
- playback transport
- camera, FFT, MIDI, OSC, gestures
- basic HDR feedback compositor

Exit condition: the problem videos display and play natively without relying on WKWebView media playback.

### Milestone 02 — Huff control compatibility

- Import the existing Huff controls layout
- Define one canonical Rust parameter registry
- Map current DOM IDs to canonical parameter IDs
- Move preset serialization to the registry
- Route MIDI and OSC through the same registry
- Preserve the current application as a side-by-side reference

### Milestone 03 — Source fitting and base image parity

- Huff render resolution modes
- Contain / cover / stretch
- Base video on/off and base mix
- Background color
- Brightness and contrast
- Exact color and alpha comparison against Upgrade 04

### Milestone 04 — GPU temporal history

- Persistent texture-history ring
- Full, 75%, 50%, 25%, and custom history resolution
- Every-frame / 30 / 24 / 15 / 10 FPS capture policies
- Crisp and smooth sampling
- Sequence/timestamp metadata
- No full-frame `getImageData()`

### Milestone 05 — Feedback parity

- Ping-pong HDR targets
- Persistence
- X/Y translation
- Z scale
- Rotation
- Correct order relative to base video, history, and flow

### Milestone 06 — Glitch tiles

Keep CPU procedural behavior but move pixel sampling to the GPU:

```text
Rust tile command generation
        ↓ storage/vertex buffer
Instanced GPU rectangles
        ↓
Sample selected history texture and source rectangle
```

Port:

- Density/corruption
- Block and tile size
- Historical depth and scatter
- Jitter and drift
- Smear distance and angle
- Alpha
- X/Y offsets
- deterministic seed

### Milestone 07 — Cluster system

- Cluster centers
- Spread/minimum radius
- Bias
- Drift, speed, steer, inertia
- Bounce/wrap
- Coherence
- Breathing
- Spatial-gap enforcement

The current JavaScript physics can first be translated to Rust nearly line-for-line, with only tile drawing moved to the GPU.

### Milestone 08 — Flow, scan, luma, and layer routing

- Flow field and displacement textures
- Pulse/source replacement
- Flow target semantics
- Luma key and inversion
- Scanline geometry and source displacement
- Smoosh and global mixing
- Exact layer-priority behavior

This should be an explicit render graph rather than conditional drawing into one shared Canvas2D buffer.

### Milestone 09 — Native outputs

- Publish the authoritative wgpu texture to Syphon on macOS
- Publish to Spout on Windows
- Remove browser canvas readbacks from both output paths
- Preserve latest-frame semantics and diagnostics from Upgrade 01

### Milestone 10 — Recording and export

- GPU texture readback through a bounded staging-buffer pool
- FFmpeg encoder process or linked encoder
- Audio muxing
- 60 FPS CFR recording
- 1080p/4K presets
- Tiled high-resolution still export

## Can the HTML UI also be converted to native?

Yes, but it is not recommended as the first goal. A native GUI rewrite would add a second large migration without improving the media engine. Huff's HTML interface is a strength; the bottleneck was WebView media/rendering, not HTML controls.

Recommended division:

| Layer | Technology |
|---|---|
| Controls and editors | HTML/CSS/JavaScript |
| Application state | Rust |
| Media decoding and audio | Rust + FFmpeg/CPAL |
| Rendering and history | Rust + wgpu/WGSL |
| MIDI/OSC | Rust |
| Syphon/Spout/recording | Rust/native APIs |

## Rollback rule

The original Upgrade 04 application remains the reference implementation until the native engine matches its output closely enough for the user to approve each migrated subsystem. Do not delete the Canvas2D renderer during migration.
