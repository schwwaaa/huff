# Huff Native wgpu · Milestone 15

Milestone 15 adds **true independent high-resolution deterministic rendering**.

Deterministic exports no longer render Huff at the live window resolution and enlarge the finished frame. For every export job, Huff now creates a private render graph at the requested output size and executes the complete native image pipeline there:

- source mapping and sampling;
- clean-source composition;
- GPU temporal history;
- historical glitch tiles and clusters;
- scanline bands;
- Smoosh and layer priority;
- persistent feedback;
- Luma Key and Global Mix;
- Flow and pulse routing;
- final output composition.

A 4K export therefore performs the image-memory and effect work at 3840×2160. An 8K export performs it at 7680×4320, subject to the GPU's texture limits and available memory.

## Included systems

The application now includes:

- native FFmpeg video and synchronized audio playback;
- native camera capture;
- Rust + wgpu rendering on Metal, Vulkan, and DX12;
- independent live render and history resolutions;
- native history, feedback, glitch, clusters, scanlines, Smoosh, Luma Key, Global Mix, and Flow;
- Syphon output on macOS and SpoutDX output on Windows;
- synchronized 30/60 FPS live MP4 recording;
- native through custom-size PNG still export;
- deterministic 24/30/60 FPS offline export;
- H.264, ProRes, FFV1, and PNG-sequence profiles;
- canonical automation recording and frame-exact replay;
- the provisional durable export queue from Milestone 13;
- full-resolution offline graph execution from Milestone 15.

## Run

```bash
npm install
npm run dev:metal
```

Automatic backend selection:

```bash
npm run dev
```

Windows DX12:

```powershell
npm run dev:dx12
```

FFmpeg must be available on `PATH`.

## What changed in export

### Before Milestone 15

```text
live-sized render graph
        ↓
completed RGBA frame
        ↓
final resize to export dimensions
        ↓
encoder
```

### Milestone 15

```text
source frame
        ↓
fit / crop / stretch at export dimensions
        ↓
complete export-sized render graph
        ↓
1:1 RGBA readback
        ↓
encoder
```

The last export-only scaling pass has been removed from deterministic video export. Still-image export retains its independent scaler.

## Source aspect and sampling

The deterministic export controls now affect the source before temporal processing:

- **FIT** places the entire source inside the export frame and creates black letterbox regions;
- **CROP** fills the export frame and crops the source around its center;
- **STRETCH** maps the source directly to the output dimensions;
- **SMOOTH** uses linear source sampling;
- **CRISP** uses nearest-neighbor source sampling.

Because this happens before history, feedback, glitch, and Flow, those systems operate on the correctly mapped image rather than on a later resized composite.

## History behavior

History resolution is derived from the queued parameter snapshot relative to the export graph:

- Full history follows the output dimensions;
- 75%, 50%, and 25% scale from the output dimensions;
- Custom history retains its explicit dimensions.

The existing 192 MiB history budget remains active. Large exports can therefore contain fewer retained history frames. The current history dimensions and capacity are shown in the offline-export status tooltip and written to deterministic metadata.

## GPU resource boundary

Huff estimates the minimum graph allocation before starting the job. Exports requiring more than the current 3 GiB bounded graph limit are rejected with an explicit error instead of starting an obviously unsafe allocation.

This estimate is a lower bound, not a guarantee that a GPU has enough practical free memory. Driver allocations, source textures, command resources, and platform overhead also consume memory.

## Live-state restoration

The export graph is temporary. On completion, cancellation, or failure, Huff restores:

- the prior live render dimensions;
- the prior live history dimensions and capacity;
- normal live source sampling;
- live video position and play/pause state;
- current UI parameter state;
- normal output readback for recording, Syphon, and Spout.

Parameter and automation updates during an export cannot collapse the private graph back to live resolution.

## Queue status

Milestone 13's export queue remains provisional infrastructure. A single queued job still behaves as the normal deterministic-export workflow. The queue can be simplified, hidden, or removed after the larger product testing cycle without removing the Milestone 15 graph architecture.

## Documentation

- `UPGRADE-NOTES-15.md` — full-resolution graph architecture and compatibility notes
- `TESTING.md` — focused local runtime tests
- `MIGRATION-STATUS.md` — completed and remaining systems
- `VALIDATION.md` — checks possible in the packaging environment

## Next milestone

Milestone 16 is the parameter-by-parameter visual and motion calibration pass. The structural render and export systems are now in place; the next phase can compare native behavior against the intended Huff response and tune ranges, timing, motion, compositing, and effect relationships.
