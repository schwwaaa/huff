# Upgrade Notes — Milestone 21

**Version:** `0.21.0 / HNW-21`  
**Base:** clean Milestone 20 tree

Milestone 21 adds a lower-copy interoperability research harness without enabling unsafe zero-copy output.

## Added

- `huff-interop-report/v1` runtime analysis;
- INTEROP window in the control surface;
- current GPU→CPU→platform-output copy-path visualization;
- per-stage bandwidth estimates at the current render size and output rate;
- bounded host-memory copy probe;
- Metal/Syphon, IOSurface, D3D12/Spout, D3D11On12, and Vulkan candidate analysis;
- JSON and text report export;
- interoperability files in the Milestone 20 diagnostics folder;
- typed `ExternalOutputFrame` boundary used by Syphon and Spout;
- explicit Syphon/Spout transport metadata;
- `npm run validate:interop`.

## Production behavior

The active Syphon and Spout implementations still use:

```text
wgpu texture → bounded MAP_READ → shared CPU RGBA → platform texture upload
```

No native texture sharing is enabled. Existing output, recording, routing, and recovery behavior should remain unchanged.

## Why the typed boundary matters

Syphon and Spout no longer accept a raw assumption that every output submission must always be CPU pixels. They accept `ExternalOutputFrame`, whose only current variant is `CpuRgba`. A later feature-gated backend token can be added without redesigning the worker command surface.

## Test focus

1. Confirm normal Syphon or Spout output still works.
2. Open INTEROP and verify the current backend, adapter, dimensions, and copy path.
3. Run the CPU Copy Probe and confirm the interface remains responsive.
4. Export the report.
5. Export a normal diagnostics folder and confirm it contains `interop-report.json` and `interop-report.txt`.
6. Confirm VERIFY and recovery behavior remain unchanged.

## Status

This milestone completes the research and architectural preparation phase. A direct Metal or Direct3D sharing implementation remains future optional work and must be feature-gated, synchronized, adapter-safe, receiver-tested, and automatically reversible to bounded readback.
