# Huff Native wgpu — Milestone 11.1

## Compile correction

Milestone 11's offline-render uniform setup attempted to call `shader_code()` on `ActiveSource::Video`.

`shader_code()` is implemented by `SourceSelector`, while `ActiveSource` exposes `code()`. The offline path now converts the enum code directly:

```rust
ActiveSource::Video.code() as f32
```

This changes no live-render, export, shader, timing, audio, Syphon, Spout, recording, or effect behavior.
