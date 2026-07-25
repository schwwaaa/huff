# Apply Huff Native Milestone 08.1

This update is based on **Huff Native Milestone 08**.

For the smallest update, copy the changed-files package over the root of the Milestone 08 project and preserve its directory structure.

Major changed paths:

```text
src/app.js
src/index.html
src-tauri/build.rs
src-tauri/src/main.rs
src-tauri/src/renderer.rs
src-tauri/src/spout.rs
src-tauri/native/spout_bridge/CMakeLists.txt
src-tauri/native/spout_bridge/spout_bridge.cpp
src-tauri/native/spout_bridge/spout_bridge.h
```

The package also includes updated manifests and documentation.

On Windows:

```powershell
npm install
npm run dev:dx12
```

CMake and the Visual Studio 2022 C++ workload are required. The bridge is statically linked, so no `spout_bridge.dll` should be copied manually.
