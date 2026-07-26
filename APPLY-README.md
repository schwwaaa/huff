# Apply Huff Native Milestone 11

The complete archive is the preferred upgrade path.

For a changed-files application, copy the provided files over a committed Milestone 10 tree while preserving paths.

New files:

```text
src-tauri/src/offline_export.rs
UPGRADE-NOTES-11.md
```

Major changed files:

```text
src-tauri/src/main.rs
src-tauri/src/renderer.rs
src-tauri/src/history.rs
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
