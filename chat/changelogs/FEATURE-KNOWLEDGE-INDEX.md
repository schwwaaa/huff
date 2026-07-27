# HUFF Feature Knowledge Index

**Build:** 0.21.0 / HNW-21

This file is the non-HTML preservation map for every major feature.

| Feature | Milestone | Status | Documentation | Retention rule |
|---|---:|---|---|---|
| Native renderer | 01 | Integrated | `docs/how-it-works.html` | Foundation; cannot be removed without returning to the legacy architecture. |
| Source ownership | 02 | Integrated | `docs/sources.html` | Core reliability layer. |
| GPU history ring | 03 | Integrated | `docs/temporal-memory.html` | Core to historical effects and deterministic export. |
| Flying framebuffer / Field Store | 04 | Integrated | `docs/temporal-memory.html` | Defines the HUFF visual identity. |
| Cluster motion bodies | 05 | Integrated | `docs/effects.html` | Creative module; can be disabled but should remain documented. |
| Scanlines and priority | 06 | Integrated | `docs/effects.html` | Creative module and routing primitive. |
| Smoosh, Luma Key, Global Mix, Flow | 07 | Integrated | `docs/effects.html` | Core creative engine; requires calibration. |
| Syphon / Spout | 08 | Integrated | `docs/output.html` | Can be optional by platform; output boundary should remain. |
| Live recording | 09 | Integrated | `docs/recording.html` | Useful standalone capability. |
| Still export | 10 | Integrated | `docs/export.html` | Independent output feature. |
| Deterministic export | 11 | Integrated, refine | `docs/export.html` | Major architectural capability; keep even if UI changes. |
| Production export profiles | 12 | Integrated | `docs/export.html` | Preserve encoder/profile knowledge. |
| Export queue | 13 | Provisional | `docs/export-queue.html` | Can be hidden or removed without deleting deterministic export. |
| Automation replay | 14 | Integrated, limited UI | `docs/automation.html` | State/event model should remain even if UI is replaced. |
| True high-resolution graph | 15 | Integrated, refine | `docs/export.html` | Important but resource-intensive. |
| Parity Lab | 16 | Provisional scaffold | `docs/caveats.html` | Validator and historical contract are more valuable than the UI. |
| MIDI / OSC mapping | 17 | Integrated, test hardware | `docs/midi.html` | Control schema is reusable across future instruments. |
| Presets / snapshots / sequences / projects | 18 | Integrated | `docs/state.html` | State vocabulary should survive any UI pruning. |
| Routing recipes and buses | 19 | Integrated | `docs/routing.html` | Expansion point for future effects and instruments. |
| Verification and recovery | 20 | Integrated | `docs/verification.html` | Operationally valuable; may move to Advanced view. |
| Interop Lab | 21 | Research | `docs/interop.html` | Safe to omit from production UI; preserve reports and typed boundary. |
