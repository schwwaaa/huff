# HUFF Classic Optimization Pass 29 — Changed Files

## Browser and native runtime

```text
No changes to src/**
No changes to src-tauri/src/**
```

## Tauri / Rust packaging

- `src-tauri/tauri.conf.json`
- `src-tauri/tauri.macos.conf.json`
- `src-tauri/tauri.windows.conf.json`
- `src-tauri/tauri.linux.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/build.rs`
- `src-tauri/native/spout2/SPOUTSDK/**` — restored required upstream SDK assets

## Build and release utilities

- `build.sh`
- `scripts/tauri-build.cjs`
- `scripts/release-preflight.mjs`
- `scripts/set-release-version.mjs`
- `scripts/verify-release-artifacts.mjs`
- `scripts/package-windows.ps1`
- `scripts/check-linux-deps.sh`
- `scripts/macos-notarize.sh`
- `release/release-config.json`
- `LICENSE`
- `package.json`
- `package-lock.json`

## Validation

- `scripts/validate-pass29.mjs`
- `baseline/pass28-src.sha256`
- `baseline/pass28-src-tauri.sha256`
- `baseline/pass29-src.sha256`
- `baseline/pass29-src-tauri.sha256`

## Documentation

- `PLATFORM_PACKAGING_FREEZE_AUDIT.md`
- `PLATFORM_PACKAGE_MATRIX.md`
- `RELEASE_SIGNING_NOTARIZATION.md`
- `RELEASE_KNOWN_ISSUES.md`
- `CAPABILITY_MATRIX.md`
- complete updated documentation suite
- README and installation-version corrections
