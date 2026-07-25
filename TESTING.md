# Huff Native Milestone 08.1 test checklist

## Regression baseline

1. Run video and camera sources.
2. Confirm transport, feedback, temporal history, glitch, clusters, scanlines, Smoosh, luma key, Global Mix, and Flow still work.
3. Confirm Syphon still works on macOS.
4. With external outputs off, hover `NATIVE:` and confirm native-output readback counters remain idle.

## Windows build

Prerequisites:

- Windows 10 or 11
- Visual Studio 2022 with **Desktop development with C++**
- CMake available to Cargo
- Rust MSVC target
- Node/npm
- FFmpeg on PATH

Run:

```powershell
npm install
npm run dev:dx12
```

Expected build behavior:

- CMake builds `spout_bridge.lib`.
- Cargo links the bridge statically.
- No `spout_bridge.dll` is required beside the executable.
- The controls and native renderer windows open.

## Spout adapter enumeration

1. Open the Spout modal.
2. Confirm the adapter dropdown contains `Automatic / Windows default`.
3. Press Refresh.
4. Confirm the installed DXGI adapters appear by index and name.
5. On a single-GPU system, Automatic should normally be sufficient.
6. On a multi-GPU system, identify the adapter used by the receiver application.

## Basic sender test

1. Load a moving video and create a recognizable Huff effect state.
2. Set Spout to 30 FPS.
3. Choose the receiver GPU adapter.
4. Press Start.
5. The status may briefly show **Armed — waiting for first frame**.
6. Open Resolume, MadMapper, Spout for OBS, or another receiver.
7. Select `huff` or the resolved incremented Huff sender name.
8. Verify:
   - correct orientation;
   - correct red/blue channels;
   - alpha is opaque and stable;
   - brightness matches the native Huff output;
   - feedback and temporal effects update continuously.

## Lifecycle tests

1. Stop and restart Spout five times.
2. Change the internal `R:` resolution while Spout is active.
3. Confirm the sender restarts at the new dimensions on the same adapter.
4. Minimize the native output window and confirm Spout continues.
5. Cover or background both Huff windows and confirm the sender continues.
6. Close Huff while Spout is active and confirm the sender disappears from the receiver.
7. Relaunch Huff and confirm the sender can be created again.

## Performance tests

Test 1280×720 and 1920×1080 at 30 and 60 FPS.

Watch the Spout diagnostics for:

- `publishedFrames` increasing;
- bounded `replacedFrames` under load;
- no persistent `rejectedFrames` growth;
- low frame age;
- stable D3D sender FPS;
- no readback map-error growth.

A rising replacement count under GPU/CPU load is preferable to building latency.

## Multi-GPU failure test

1. Deliberately choose the wrong adapter.
2. Note whether the receiver cannot see or open the sender.
3. Stop Spout.
4. Select the receiver's adapter.
5. Restart and confirm reception.

## Release build

```powershell
npm run build
```

Test both the unpacked release executable and the generated installer. Confirm that Spout works on a clean Windows account without manually copying a Huff bridge DLL.

## Report with any failure

Include:

- Windows version;
- GPU model(s);
- selected adapter index/name;
- receiver application and version;
- render resolution and FPS cap;
- complete Cargo/CMake/linker output;
- Spout modal status and counters;
- whether the sender appears but is black, incorrectly colored, upside down, frozen, or absent.
