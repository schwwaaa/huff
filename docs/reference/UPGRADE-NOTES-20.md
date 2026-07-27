# Upgrade Notes — Milestone 20

**Version:** `0.20.0 / HNW-20`  
**Base:** clean Milestone 19 tree

Milestone 20 adds a production-verification harness and bounded recovery controls without altering the Milestone 19 routing recipe or the visual effect graph.

## New runtime workflow

The top bar now includes **VERIFY**. The Production Verification window can:

- inspect the active GPU/backend, frame progression, media tools, codecs, sources, audio, output bridges, export ownership, controller services, and temporary storage;
- show PASS, WARNING, FAIL, and INFO results through `huff-production-report/v1`;
- request surface recovery;
- restart the active source at its current position/device;
- restart active Syphon or Spout output bridges;
- export a diagnostics folder containing runtime, parameter, routing, and state-model information.

## Recovery boundaries

Recovery does not clear feedback/history, reset parameters, change recipes, load presets, or modify automation. Source restart is blocked while live recording or deterministic export owns the pipeline.

## Build and repository tools

New commands:

```bash
npm run validate:production
npm run validate:production:strict
npm run build:production
npm run build:metal
npm run build:dx12
npm run build:vulkan
```

The build wrappers run strict production validation before invoking `tauri build`.

## Status

This milestone makes cross-platform verification repeatable; it does not falsely certify platforms that were not available during packaging. Actual Metal, DX12/MSVC, Syphon-client, Spout-receiver, multi-GPU, installer, long-session, and device-loss observations remain local test results to be collected with the new report and diagnostics workflow.
