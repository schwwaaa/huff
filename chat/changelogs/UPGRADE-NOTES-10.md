# Huff Native wgpu — Milestone 10

Milestone 10 adds an independent native still-export path to the working Milestone 09 engine. Live effects, recording, decoder recovery, Syphon, and Spout behavior are unchanged.

## Export architecture

```text
Authoritative RGBA8 wgpu output texture
        ↓
Independent export scaling pass
        ├── Smooth or Crisp sampling
        └── Fit, Crop, or Stretch aspect policy
        ↓
One bounded GPU readback
        ↓
FFmpeg PNG encoder
        ↓
PNG + .huff-export.json sidecar
```

The export pass samples the completed native output. It does not resize the live renderer, rebuild history, clear feedback, alter Syphon/Spout dimensions, or change the recording path.

## Resolution profiles

- Native render size
- 1920×1080
- 3840×2160
- 7680×4320
- Custom, within the adapter and bounded memory limits

The export path is capped at 8192 pixels per dimension and 35 megapixels per still. This includes 8K UHD while preventing accidental allocations substantially larger than the intended export scope.

## Aspect policies

- **Fit** preserves the complete image and letterboxes where necessary.
- **Crop** preserves aspect ratio and fills the target by cropping edges.
- **Stretch** fills the target without preserving aspect ratio.

## Sampling

- **Smooth** uses linear GPU filtering.
- **Crisp** uses nearest-neighbor GPU sampling.

## Reproducibility sidecar

Each PNG is accompanied by a `.huff-export.json` file containing:

- HUFF engine build
- capture timestamp
- active source
- source file and transport position
- playback rate
- live render size
- export size
- sampling and aspect policy
- canonical parameter revision
- complete canonical parameter values

The sidecar records process state, not temporal texture contents. A feedback or history image therefore remains a captured visual state rather than a fully reconstructable simulation checkpoint.

## Important scope boundary

High-resolution still export is a GPU-resampled capture of Huff's authoritative current output. It is not yet a separate 8K re-execution of every effect pass. Frame-driven deterministic video rendering and independent video-export codec profiles remain the next export milestone.
