# Apply Huff Native Milestone 13

The complete archive is the preferred upgrade path.

For a changed-files application, copy the supplied files over a clean Milestone 12 tree while preserving paths.

New files:

```text
UPGRADE-NOTES-13.md
src-tauri/src/export_queue.rs
```

Major changed files:

```text
src-tauri/src/offline_export.rs
src-tauri/src/parameters.rs
src-tauri/src/main.rs
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

The changed-files archive also includes `MILESTONE-13-SHA256SUMS.txt`. The older `MILESTONE-12-SHA256SUMS.txt` may be deleted after the upgrade; it describes only the prior baseline.
