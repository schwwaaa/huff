# HUFF Classic Optimization Pass 29 — Platform Packaging Freeze Audit

## Scope

Pass 29 freezes packaging infrastructure without changing the browser renderer, effects, Flow, presets, pipeline order, media lifecycle, or native runtime commands.

The pass establishes one release identity and one version across JavaScript, Rust, Tauri, installers, and generated manifests:

```text
Public product: HUFF Classic
Executable/product name: huff
Version: 1.0.3
Bundle identifier: com.schwwaaa.huff
Publisher: schwwaaa
```

## Runtime preservation

The complete Pass 28 `src/` tree is byte-identical.

The following native runtime files are also byte-identical:

```text
src-tauri/src/main.rs
src-tauri/src/syphon.rs
src-tauri/src/spout.rs
```

Only packaging metadata, the Rust build script, platform assets, release scripts, and documentation changed.

## Platform bundles

### macOS

```text
Universal arm64 + x86_64 app
DMG
Bundled universal Syphon.framework
Camera entitlement and usage description
Explicit nested-framework and app signing
Optional notarytool submission and stapling
```

The universal build remains a two-architecture build followed by a controlled lipo assembly. Both the app executable and Syphon framework are verified as arm64 + x86_64 before release checksums are written.

### Windows

```text
x86_64 MSVC
MSI installer
Portable ZIP containing huff.exe + spout_bridge.dll
Restored build-required Spout2 SDK source set
Release builds fail instead of silently omitting Spout
```

The Windows release target is intentionally MSI-only for the installer freeze. The current Tauri v1 WiX path includes release-directory DLLs, while NSIS handling of adjacent runtime DLLs has not been proven for this project. A portable ZIP is generated as a second explicit distribution format.

### Linux

```text
x86_64 native build
DEB
AppImage
Canvas mirror output
No Syphon or Spout
```

Ubuntu 22.04 is the reference build host because HUFF Classic remains on Tauri v1 / WebKitGTK 4.0. Linux packaging is defined, but media codec, camera, and long-session runtime validation remain release-blocking target-machine tests.

## Native-only packaging rule

Pass 29 removes the previous suggestion that production installers should be cross-compiled from another operating system.

```text
macOS artifacts are built on macOS
Windows artifacts are built on Windows
Linux artifacts are built on Linux
```

Cross-platform CI may orchestrate these native jobs, but each bundle must be produced by its native host and validated there.

## Release utilities

```text
scripts/release-preflight.mjs
scripts/set-release-version.mjs
scripts/verify-release-artifacts.mjs
scripts/package-windows.ps1
scripts/check-linux-deps.sh
scripts/macos-notarize.sh
release/release-config.json
```

These utilities provide:

- version and identifier consistency checks;
- icon and platform-asset verification;
- Syphon architecture verification;
- Spout SDK completeness checks;
- native toolchain checks;
- target artifact verification;
- SHA-256 release manifests;
- Windows portable packaging;
- macOS notarization and stapling.

## Freeze boundary

The infrastructure sequence is complete after Pass 29. New work must not casually change:

- release identifier;
- artifact naming;
- platform bundle targets;
- version synchronization process;
- Syphon or Spout package ownership;
- platform-native build rule;
- release checksum format.

Changes to those items require a dedicated packaging pass and target-platform validation.
