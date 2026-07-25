# Huff Native wgpu · Milestone 08.1

Milestone 08.1 completes **native Syphon and Spout output** on top of the working Milestone 07.2 engine. Huff now renders one authoritative, fixed-resolution RGBA output texture and uses that same result for the native window and external video outputs.

The HTML/CSS interface remains the control surface. Video/audio decoding, camera input, GPU history, Huff's flying-frame-buffer effects, compositing, feedback, presentation, and external output are native Rust + wgpu.

## Native output architecture

```text
Native video or camera
        ↓
GPU temporal history
        ↓
Huff native effect graph
        ↓
Authoritative RGBA8 output texture at R: resolution
        ├── Native output window (letterboxed independently)
        ├── Syphon on macOS
        └── Spout on Windows
```

The external outputs do not depend on the size or visibility of the native output window. If Syphon or Spout is active, Huff continues rendering the authoritative output while the presentation surface is minimized or temporarily unavailable.

## Bounded GPU readback bridge

The first native Syphon/Spout implementation uses a controlled GPU-to-CPU bridge:

- Three persistent wgpu staging buffers
- Asynchronous `map_async` completion
- Nonblocking device polling
- Output-specific FPS limits
- Busy-frame dropping instead of queue growth
- One reference-counted RGBA frame shared between Syphon and Spout
- Latest-frame worker queues for both outputs

This is not claimed to be zero-copy. It is a bounded and measurable bridge designed to preserve responsiveness and prevent output latency from accumulating.

## Syphon

On macOS, Huff:

1. Reads the authoritative RGBA output.
2. Uploads it into one persistent shared Metal texture.
3. Publishes that texture through `SyphonMetalServer` as **huff**.

`Syphon.framework` is included under `src-tauri/frameworks` and configured for application bundling.

## Spout

On Windows, Huff:

1. Reads the same authoritative RGBA output.
2. Sends the newest complete frame to the bundled SpoutDX bridge.
3. Publishes a D3D11 shared texture as **huff**.

The C++ bridge and Spout SDK are included under `src-tauri/native`. On Windows, the build script compiles one static bridge library and links it directly into Huff. There is no project-specific runtime DLL to copy or package.

The Spout modal enumerates DirectX adapters. On multi-GPU systems, choose the same adapter used by the receiving application before starting the sender.

## Output controls

The existing Syphon and Spout modals are now functional:

- Start / Stop
- Output FPS
- Current render dimensions
- Published frames
- Replaced pending frames
- Upload time
- Frame age
- Error state

Output dimensions follow Huff's current internal `R:` render size. Change Render Resolution first, press Apply, then start the output. If the render resolution changes while an output is active, Huff rebuilds the bridge and attempts to restart it at the new dimensions.

Hover `NATIVE:` for shared readback diagnostics:

- Completed readbacks
- Busy-slot drops
- Mapping errors
- Readback latency
- Pending staging slots

## Retained systems

- Native FFmpeg video and audio with decoder watchdog recovery
- Exclusive video/camera source ownership
- GPU temporal texture-array history
- Corrected p5-compatible flying-frame-buffer behavior
- Glitch and smear instances
- Persistent cluster physics
- Scanline compositor and layer priority
- Smoosh
- Luma Key
- Global Mix
- Flow and pulse routing
- Non-additive feedback
- Independent render and history resolutions
- Native presets, undo, MIDI, OSC, and diagnostics foundations

## Remaining major work

1. Native recording with synchronized audio
2. High-resolution still and offline export
3. Parameter-by-parameter calibration against original Huff
4. Complete MIDI/OSC mapping editors
5. Expanded routing, automation, and project-state support
6. Optional lower-copy platform-specific texture interop research

## Run on macOS

```bash
npm install
npm run dev:metal
```

Automatic backend selection:

```bash
npm run dev
```

## Build

```bash
npm run build
```

Use `TESTING.md` for the runtime checklist. Windows MSVC compilation, receiver interoperability, multi-GPU selection, and packaged runtime behavior must still be verified on a Windows machine.
