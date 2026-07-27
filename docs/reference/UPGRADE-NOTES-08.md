# Huff Native wgpu — Milestone 08

## Purpose

Milestone 08 moves Syphon and Spout to the native Huff engine. External outputs now consume the authoritative result of the wgpu render graph rather than WebView pixels or a JPEG mirror.

## Core changes

- Added one render-resolution `Rgba8UnormSrgb` output texture.
- Split final rendering from window presentation.
- Added a three-slot asynchronous wgpu readback bridge.
- Added output FPS scheduling and busy-slot dropping.
- Added one shared `Arc<[u8]>` frame for simultaneous Syphon/Spout delivery.
- Added latest-frame native publisher workers.
- Added persistent Metal texture reuse for Syphon.
- Added the SpoutDX bridge and SDK to the native project.
- Added functional Syphon/Spout UI controls and diagnostics.
- Added automatic output restart after render-resolution changes.
- Added continued offscreen rendering while the native output window is minimized when an external output is active.

## Important limitation

This milestone is a bounded GPU readback and platform upload path, not zero-copy texture interoperability. At 1080p and high frame rates, the bridge still moves substantial RGBA data. Use the output FPS setting and watch busy-drop/readback diagnostics.

## Platform requirements

### macOS

- Metal-capable Mac
- `Syphon.framework` included with the project
- A Syphon receiver such as Resolume, VDMX, MadMapper, or Syphon Simple Client

### Windows

- MSVC/CMake build environment
- D3D11-capable system
- Bundled Spout SDK and bridge
- A Spout receiver such as Resolume or Spout for OBS

## No intentional effect changes

Milestone 08 does not alter Huff's glitch, cluster, scanline, Smoosh, luma, Global Mix, Flow, feedback, media timing, or decoder-watchdog behavior.
