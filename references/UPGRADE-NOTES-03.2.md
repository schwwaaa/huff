# Huff Native wgpu — Milestone 03.2 correction

This correction is cumulative and can be applied over Milestone 02.1, 03, or 03.1.

## Fixes

1. Registers the GPU history module in the Rust crate root:

```rust
mod history;
```

Without this declaration, `renderer.rs` cannot import `crate::history` even when `history.rs` exists.

2. Keeps the Milestone 03.1 bind-group portability fix. History resources are merged into bind group 2, so the shader uses only groups 0–3 and remains within `max_bind_groups = 4`.

## Files included in the changed-files package

- `src-tauri/src/main.rs`
- `src-tauri/src/renderer.rs`
- `src-tauri/src/history.rs`
- `src-tauri/src/compositor.wgsl`

## Run

```bash
npm run dev:metal
```

The three compiler warnings shown before this error are unrelated and do not prevent the build.
