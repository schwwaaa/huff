# HUFF Classic Optimization Pass 29 — Pass Notes

## Name

**Platform Packaging Freeze**

## Purpose

Freeze the release identity, native platform bundle targets, required native-output assets, build-host rules, signing preparation, artifact verification, capability matrix, and known-issues process before effect augmentation resumes.

## Runtime boundary

```text
src/**                         unchanged from Pass 28
src-tauri/src/main.rs          unchanged from Pass 28
src-tauri/src/syphon.rs        unchanged from Pass 28
src-tauri/src/spout.rs         unchanged from Pass 28
Flow                           unchanged
pipeline route                 unchanged
controls and presets           unchanged
```

## Packaging changes

- Synchronized version `1.0.3` across npm, Cargo, Tauri, and release metadata.
- Replaced placeholder identifier with `com.schwwaaa.huff`.
- Added publisher, category, descriptions, copyright, and ISC license.
- Added platform-specific Tauri bundle configurations.
- Restored the build-required Spout2 SDK source set used by the existing Windows bridge.
- Changed Windows release behavior from silently optional Spout to mandatory Spout assets.
- Fixed explicit-target DLL placement using Cargo `OUT_DIR`.
- Added native-only macOS, Windows, and Linux release builders.
- Added signing, notarization, artifact verification, checksums, and release manifests.
- Defined MSI + portable ZIP for Windows and DEB + AppImage for Linux.

## Validation boundary

Static package validation is complete. Native compilation and release-candidate runtime testing remain platform-specific work.
