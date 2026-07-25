# Milestone 08.1 static validation

The packaging environment does not include Cargo/rustc or a Windows SDK/MSVC runtime. Native Windows compilation and receiver testing remain local validation requirements.

## Completed static checks

- Package, npm lockfile, Cargo manifest, Cargo lockfile project entry, and Tauri configuration are synchronized at `0.8.1`.
- JavaScript syntax passes `node --check`.
- JSON files parse successfully.
- Tauri command registration includes Spout start, stop, and adapter enumeration.
- Rust renderer commands carry the selected adapter index through to the Spout worker.
- The Spout worker owns all bridge calls on one thread.
- Frame submission retains a single latest pending frame.
- The bridge validates dimensions, row pitch, D3D11 device, and D3D11 context.
- The bridge exports sender metadata and detailed error text.
- CMake builds one static bridge from the bundled SpoutDX/SpoutGL sources using the dynamic MSVC runtime (`/MD`).
- `build.rs` links the static bridge and the Windows libraries listed by the bundled Spout SDK.
- No `spout_bridge.dll` copy or Tauri resource dependency remains.
- The UI includes adapter enumeration, adapter persistence, initialization state, resolved sender name, sender FPS, and frame diagnostics.
- macOS/non-Windows stubs preserve cross-platform compilation boundaries.

## Still requires Windows validation

- MSVC compilation and static-library linkage.
- DXGI adapter enumeration on real hardware.
- Spout sender registration and frame publication.
- Color and orientation in receivers.
- Integrated/discrete GPU interoperability.
- 30/60 FPS behavior at 720p and 1080p.
- Release, MSI, and NSIS packaged behavior.

## Tooling checks completed here

- CMake 3.31 successfully configured the static bridge project against the bundled Spout SDK.
- JavaScript syntax and all project JSON files passed local parsing.
- Modified Rust/C++ source passed delimiter, command-wiring, UI-ID, and stale-DLL-reference audits.
