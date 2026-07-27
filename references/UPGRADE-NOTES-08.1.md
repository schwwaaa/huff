# Huff Native wgpu — Milestone 08.1

Milestone 08.1 completes and hardens the Windows Spout path introduced in Milestone 08. Syphon behavior is unchanged.

## What changed

- The Spout C++ bridge is now linked **statically into the Huff executable**.
  - No `spout_bridge.dll` is required in development or packaged builds.
  - Target-triple builds, MSI, and NSIS builds use the same bridge path.
- Every SpoutDX call now occurs on one dedicated owner thread.
  - Adapter enumeration, sender creation, frame publication, metadata reads, and shutdown no longer jump between Tauri/render/output threads.
- Added Windows graphics-adapter enumeration and selection.
  - `Automatic / Windows default` remains available.
  - Multi-GPU systems can select the adapter used by Resolume, OBS, MadMapper, or another receiver.
- Added explicit D3D11 device/context validation.
- Added dense RGBA8 row-pitch validation.
- Added resolved sender name, adapter, sender FPS, sender frame number, initialization state, and worker state diagnostics.
- The sender is reported as **armed** until SpoutDX receives and registers its first frame.
- Start, stop, resize restart, and application shutdown are serialized through the Spout worker.
- The latest-frame boundary remains bounded to one pending frame.

## Build behavior

`build.rs` invokes CMake on Windows and links one static `spout_bridge.lib` into the Rust binary. The static bridge uses the dynamic MSVC runtime (`/MD`) in every configuration to match the Rust MSVC executable and links the Windows libraries required by the bundled Spout SDK.

No additional Huff-specific DLL needs to be copied beside the executable or added to a Tauri resource list.

## Receiver behavior

The sender is named `huff`. If another sender already owns that name, Spout may resolve an incremented name; Huff displays the resolved name in the Spout modal.

On computers with integrated and discrete GPUs, sender and receiver generally need the same adapter. Choose the receiver's adapter from the new dropdown before starting Spout.

## Unchanged

The render graph, video/audio decoders, history ring, glitch, clusters, scanlines, Smoosh, luma key, Global Mix, Flow, feedback, Syphon, and recording roadmap are unchanged.
