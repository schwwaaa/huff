# Apply Huff Native Milestone 09

This update is based on **Huff Native Milestone 08.1**.

Copy the changed-files package over the root of the 08.1 project while preserving its directory structure.

Major changed paths:

```text
src/app.js
src/index.html
src-tauri/src/main.rs
src-tauri/src/renderer.rs
src-tauri/src/audio.rs
src-tauri/src/video_audio.rs
src-tauri/src/recording.rs
package.json
package-lock.json
src-tauri/Cargo.toml
src-tauri/Cargo.lock
src-tauri/Info.plist
src-tauri/tauri.conf.json
```

Run:

```bash
npm install
npm run dev:metal
```

FFmpeg must be available on `PATH`. Milestone 09 does not require a new Rust crate dependency.
