# Apply Huff Native Milestone 15

The complete archive is the preferred upgrade path.

For a changed-files application, copy the supplied files over a clean Milestone 14 tree while preserving paths.

New file:

```text
UPGRADE-NOTES-15.md
```

Major changed files:

```text
src-tauri/src/renderer.rs
src-tauri/src/compositor.wgsl
src-tauri/src/offline_export.rs
src-tauri/src/main.rs
src-tauri/src/export_queue.rs
src-tauri/src/automation.rs
src/app.js
src/index.html
src-tauri/Cargo.toml
src-tauri/Cargo.lock
src-tauri/tauri.conf.json
package.json
package-lock.json
README.md
TESTING.md
MIGRATION-STATUS.md
VALIDATION.md
```

Run:

```bash
npm install
npm run dev:metal
```

FFmpeg must remain available on `PATH`. No new Rust crate dependency was added.

Begin with a short NATIVE or 1080p H.264 job before attempting 4K or 8K. The full local checklist is in `TESTING.md`.

The changed-files archive includes `MILESTONE-15-SHA256SUMS.txt`. The older Milestone 14 checksum file describes only the prior baseline and may be removed after the upgrade.
