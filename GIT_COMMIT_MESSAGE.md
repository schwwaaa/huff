# Ready-to-use Git commit

```bash
git add . && git commit \
  -m "chore: freeze HUFF Classic platform packaging" \
  -m "Synchronize release version 1.0.3 and replace the placeholder bundle identity with com.schwwaaa.huff while preserving the complete Pass 28 browser and native runtime." \
  -m "Add native macOS universal DMG, Windows MSI plus portable ZIP, and Linux DEB/AppImage build paths with platform-specific Tauri configurations, release preflight, artifact verification, checksums, and signing/notarization preparation." \
  -m "Restore the build-required Spout2 SDK sources used by the existing Windows bridge, prevent release builds from silently omitting Spout, and correct explicit-target DLL placement." \
  -m "Document the platform matrix, capability test matrix, release blockers, known issues, and the transition to constrained pipeline switching and paired-down effect augmentation."
```
