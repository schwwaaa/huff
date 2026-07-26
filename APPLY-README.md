# Apply Huff Native Milestone 14

The complete archive is the preferred upgrade path.

For a changed-files application, copy the supplied files over a clean Milestone 13 tree while preserving paths.

New files:

```text
UPGRADE-NOTES-14.md
src-tauri/src/automation.rs
```

Major changed files:

```text
src-tauri/src/main.rs
src-tauri/src/renderer.rs
src-tauri/src/offline_export.rs
src-tauri/src/export_queue.rs
src-tauri/src/parameters.rs
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

The changed-files archive includes `MILESTONE-14-SHA256SUMS.txt`. The older Milestone 13 checksum file describes only the prior baseline and may be removed after the upgrade.
