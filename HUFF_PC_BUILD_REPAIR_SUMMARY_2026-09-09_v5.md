# HUFF PC Build Repair Summary — v5

**Date:** 2026-09-09  
**Baseline:** original user-provided `huff-beta (3).zip` runtime / Spout implementation  
**Scope:** Windows release-build orchestration only

## Confirmed state before this repair

- `npm run dev` works on the Windows test PC.
- The application itself works.
- The original dynamic Spout integration works in development.
- v4 successfully passed the release compilation stage and failed only when the Windows build wrapper invoked Tauri MSI bundling.

## v4 failure

The failing line was the Tauri CLI config merge:

```text
==> Bundle HUFF MSI with Spout DLL resource
Error failed to parse config to merge: key must be a string at line 1 column 2
```

This was not a Rust, CMake, Spout, playback, or linker error. The v4 script passed a JSON object directly as a PowerShell argument to `tauri.cmd`. Through the Windows PowerShell -> `.cmd` invocation chain, the JSON quoting could be altered before the Tauri CLI parsed the value.

## v5 repair

v5 removes inline JSON from the command line completely.

The wrapper now:

1. performs the same known-good release compilation;
2. confirms `huff.exe` and the original dynamic `spout_bridge.dll` exist;
3. stages that exact DLL;
4. generates `artifacts/tauri-windows-bundle-overlay.json` as a real UTF-8 JSON file with no BOM;
5. validates that file with Node before Tauri is called;
6. passes the **file path** to `tauri build --config`;
7. builds the MSI;
8. inspects the MSI File table for `spout_bridge.dll`;
9. builds the portable ZIP;
10. runs release-artifact validation.

Tauri v1 explicitly supports `--config <CONFIG>` where CONFIG can be a JSON string **or a path to a JSON file**. Using a file avoids Windows command-line quote mangling.

The resource map uses the exact staged DLL path as its source and `.` as the target resource directory, so `spout_bridge.dll` is bundled at the root of the Windows resource/install directory rather than under a `windows-runtime` subdirectory.

## Runtime code integrity

v5 does not alter:

- `src/`
- `src-tauri/src/`
- `src-tauri/build.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/tauri.windows.conf.json`
- `src-tauri/native/spout_bridge/`
- `src-tauri/native/spout2/`

The repair is isolated to Windows build orchestration and the release packaging helpers already introduced in v4.

## Test command

From the project root on Windows:

```powershell
npm run build:windows
```

If it fails again, use:

```text
artifacts\windows-build.log
```

The script now prints and validates the generated overlay before entering the bundler, so a subsequent failure should be a later, specific MSI/bundler error rather than another malformed `--config` argument.
