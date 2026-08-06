# HUFF Classic Optimization Pass 29 — Testing Checklist

## Completed static validation

- [x] Pass 28 `src/` tree is byte-identical.
- [x] Pass 28 native runtime source files are byte-identical.
- [x] Flow and effect code are byte-identical.
- [x] Pipeline runtime is byte-identical.
- [x] npm, Cargo, Tauri, lockfile, and release versions agree on `1.0.3`.
- [x] Bundle identifier is `com.schwwaaa.huff`.
- [x] All required icon sizes are present.
- [x] Camera usage description and entitlement are present.
- [x] Syphon.framework contains arm64 and x86_64.
- [x] Build-required Spout2 SDK source files are present.
- [x] Platform-specific Tauri configurations parse and merge against the Tauri v1 schema.
- [x] Release preflight reports zero static blockers.
- [x] Shell and JavaScript release scripts pass syntax checks.
- [x] Applicable Pass 9–22 behavioral validators pass.
- [x] Pass 29 manifest validation confirms the complete accepted Pass 28 runtime lineage is preserved.
- [x] Final documented ZIP passes archive integrity testing and packaged-copy validation.

## macOS release candidate

- [ ] Build arm64 app.
- [ ] Build x86_64 app.
- [ ] Assemble universal app.
- [ ] Verify app and Syphon framework architectures.
- [ ] Sign with Developer ID Application certificate.
- [ ] Notarize and staple DMG.
- [ ] Install DMG on a clean Apple Silicon Mac.
- [ ] Install DMG on an Intel Mac.
- [ ] Confirm camera permission under `com.schwwaaa.huff`.
- [ ] Confirm Syphon start, receiver attach, detach, reconnect, stop, and shutdown.
- [ ] Complete 60-minute soak.

## Windows release candidate

- [ ] Build natively with x86_64-pc-windows-msvc.
- [ ] Confirm CMake compiles the restored Spout bridge.
- [ ] Confirm `spout_bridge.dll` is adjacent to `huff.exe`.
- [ ] Inspect MSI installation contents.
- [ ] Test portable ZIP on a clean Windows 10 machine.
- [ ] Test MSI on Windows 10 and Windows 11.
- [ ] Confirm WebView2 bootstrap behavior.
- [ ] Confirm Spout receiver output and reconnect.
- [ ] Confirm shutdown leaves no process or occupied port.
- [ ] Complete 60-minute soak.

## Linux release candidate

- [ ] Build on Ubuntu 22.04 reference host.
- [ ] Install DEB on a clean compatible system.
- [ ] Launch AppImage.
- [ ] Test H.264/AAC and representative user codecs.
- [ ] Test file/camera switching.
- [ ] Test MIDI and OSC.
- [ ] Test canvas mirror reconnect and shutdown.
- [ ] Confirm no orphan process or occupied port.
- [ ] Complete 60-minute soak.
