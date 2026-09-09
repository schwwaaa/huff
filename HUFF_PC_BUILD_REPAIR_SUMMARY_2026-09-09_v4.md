# HUFF PC Build Repair Summary — v4

**Date:** 2026-09-09  
**Baseline:** original user-provided `huff-beta (3).zip`  
**Runtime status supplied by tester:** `npm run dev` works; application works; release build fails.  
**Scope:** Windows build and packaging only.

## What the latest error establishes

The supplied terminal excerpt is the *outer* Tauri/PowerShell failure:

```text
warning: build failed, waiting for other jobs to finish...
Error failed to build app: failed to build app
Build HUFF MSI with original dynamic Spout bridge failed with exit code 1
```

That excerpt proves the failure occurs inside the Tauri build subprocess, but it does not include the earlier compiler/linker line that caused Cargo to return exit code 1. The v3 wrapper therefore still combined too many stages into one opaque operation.

## Key architectural correction

The working development command builds natively to:

```text
src-tauri/target/debug
```

The previous Windows release paths forced:

```text
--target x86_64-pc-windows-msvc
```

which changes Cargo output to:

```text
src-tauri/target/x86_64-pc-windows-msvc/release
```

For a native 64-bit Windows/MSVC machine, this target override is unnecessary. v4 validates that the Rust host is already `x86_64-pc-windows-msvc` and deliberately uses the native release path:

```text
src-tauri/target/release
```

This keeps release compilation structurally aligned with the already-working dev configuration instead of forcing a second target layout.

## What remains unchanged

v4 is rebased from the original ZIP again. It does **not** modify:

- `src/` playback/render/UI code;
- `src-tauri/src/spout.rs`;
- `src-tauri/build.rs`;
- `src-tauri/native/spout_bridge/CMakeLists.txt`;
- `spout_bridge.cpp` / `spout_bridge.h`;
- the bundled Spout2 SDK;
- effect code;
- FPS/timing code;
- camera/video playback code.

The original dynamic `spout_bridge.dll` architecture remains intact.

## New build pipeline

`npm run build:windows` now performs distinct gates:

1. Load the Visual Studio 2022 x64 development environment.
2. Confirm the native Rust host is exactly `x86_64-pc-windows-msvc`.
3. Run the existing Windows release preflight.
4. Compile the release application first with Cargo:

   ```powershell
   cargo build --locked --release --features custom-protocol --manifest-path src-tauri\Cargo.toml
   ```

5. Require both:

   ```text
   src-tauri/target/release/huff.exe
   src-tauri/target/release/spout_bridge.dll
   ```

6. Copy that exact generated DLL to a temporary staging directory.
7. Run Tauri MSI bundling **without `--target`**.
8. Supply a temporary Tauri config overlay that marks the staged DLL as a Windows bundle resource at the installer root, next to `huff.exe`.
9. Open the MSI File table and confirm `spout_bridge.dll` is actually present.
10. Create the portable ZIP from `huff.exe` + `spout_bridge.dll`.
11. Run artifact verification.

## Diagnostic improvement

Every build writes:

```text
artifacts/windows-build.log
```

The release compile and MSI bundling are now separate named steps. If either fails, the error message states the precise stage and points to the complete log.

## Why the DLL bundle overlay is used

Tauri v1 supports an additional resource map during `tauri build`. On Windows, application resources resolve to the executable directory. The overlay used for the MSI build maps:

```text
windows-runtime/spout_bridge.dll -> installer resource root
```

The staging DLL is copied from the DLL produced by the original `build.rs`; no alternate Spout binary is substituted.

## Files intentionally changed from the original baseline

```text
package.json
build.sh
scripts/tauri-build.cjs
scripts/build-windows.ps1             (new)
scripts/package-windows.ps1
scripts/verify-release-artifacts.mjs
HUFF_PC_BUILD_REPAIR_SUMMARY_2026-09-09_v4.md (new)
```

No application/runtime source file is changed.

## Test commands

First preserve the validated development gate:

```powershell
npm run dev
```

Then test release:

```powershell
npm run build:windows
```

If release fails, the complete diagnostic is also stored at:

```text
artifacts\windows-build.log
```

## Success gate

The build is not considered successful unless all of the following exist and validate:

```text
src-tauri\target\release\huff.exe
src-tauri\target\release\spout_bridge.dll
src-tauri\target\release\bundle\msi\*.msi
artifacts\huff-1.0.3-windows-x64-portable.zip
```

and the MSI File table contains `spout_bridge.dll`.
