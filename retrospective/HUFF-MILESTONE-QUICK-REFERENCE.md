# HUFF Native wgpu — Milestone Quick Reference

**Current build:** `0.21.0 / HNW-21`  
**Use:** Fast orientation before reading the full retrospective.

| Milestone | Title | Plain-language result |
|---:|---|---|
| 01 | Native Engine Foundation | HUFF stopped being primarily a browser sketch inside a desktop shell and became a real native video engine. The HTML interface remained, but it became the control surface rather than the place where the final image was created. |
| 02 | Source Ownership and Runtime Stability | HUFF learned which source was truly in control. Starting the camera no longer left a video decoding invisibly, and loading a video no longer depended on stale camera frames. |
| 03 | Native GPU Temporal History | Recent frames moved out of JavaScript memory and into a bounded stack of textures on the GPU. This gave HUFF fast access to the past without asking the browser to hold and copy every image. |
| 04 | Historical Glitch and Flying Framebuffer | The defining HUFF image behavior returned: pieces of older frames are stamped into a persistent image that can fly, drift, rotate, scale, fade, and keep influencing what comes next. |
| 05 | Cluster Tile Bodies | Glitch tiles gained moving group behavior instead of appearing as unrelated random rectangles. Clusters can travel, steer, breathe, wrap, bounce, spread, and retain momentum. |
| 06 | Scanlines and Layer Priority | Scanlines returned, and HUFF stopped relying on accidental drawing order to decide whether glitch or scanline material appears on top. |
| 07 | Complete Core Render Graph | The major HUFF effect families were finally connected into one known order. Glitch, scanlines, feedback, clean video, Flow, Smoosh, Luma Key, and Global Mix could interact in the same native renderer. |
| 08 | Native Syphon and Spout Output | The native image could be sent to other visual applications. On macOS this means Syphon; on Windows it means Spout. |
| 09 | Constant-Frame-Rate Live Recording | HUFF gained a dependable “record what is happening now” mode. If rendering misses a moment, the recorder repeats the latest completed frame instead of producing a broken variable-rate file. |
| 10 | High-Resolution Still Export | A single HUFF frame could be saved at native size, 1080p, 4K, 8K, or custom dimensions with choices for fitting and pixel sampling. |
| 11 | Deterministic Offline Video Export | HUFF learned to render a video frame by frame from a fixed clock rather than recording whatever speed the live loop happened to achieve. |
| 12 | Production Export Profiles and Image Sequences | Offline export stopped being only one MP4 option and became a delivery system for previews, editing masters, archival files, alpha-capable files, and numbered frames. |
| 13 | Durable Export Queue | HUFF can remember several export jobs, run them one after another, recover unfinished jobs after a restart, and retry or repeat a job. |
| 14 | Deterministic Automation Replay | Movements and actions can be recorded, then replayed by the offline exporter using its exact frame clock. |
| 15 | True Export-Resolution Render Graph | A 4K or 8K export now asks the whole HUFF effect system to work at that size instead of merely enlarging the final live-resolution picture. |
| 16 | Legacy Parameter Contract and Parity Lab | HUFF gained a reference sheet inside the code that says what every original control was called and how it was supposed to range and default. |
| 17 | MIDI and OSC Mapping Workflows | Physical controllers and network control messages can be learned and assigned directly to real HUFF controls and actions. |
| 18 | Presets, Snapshots, Sequences, and Projects | HUFF stopped treating every saved state as the same thing. A look, a complete machine state, a timed performance, and a project are now different documents. |
| 19 | Constrained Routing and Named Buses | The hidden effect chain gained names and safe switches. HUFF can describe Clean, History, Process, Field Store, Mask, Program, and Monitor, and can apply pipeline recipes without becoming an unrestricted node editor. |
| 20 | Production Verification and Recovery Hardening | HUFF gained a transparent self-check and a set of recovery buttons so a problem can be observed and repaired without resetting the creative setup. |
| 21 | Lower-Copy Platform Interoperability Research | HUFF now clearly shows how frames reach Syphon or Spout, how much data is being moved, and what would be required to remove some copies in the future. |

## Status reminders

- **Milestone 13:** provisional queue; evaluate after real batch use.
- **Milestone 14:** deterministic automation exists; complete live transport does not.
- **Milestone 15:** true high-resolution graph is integrated but needs focused failure analysis.
- **Milestone 16:** parameter contract is exact; visual parity still requires human calibration.
- **Milestone 19:** recipes choose supported pipeline routes; they are not arbitrary graphs.
- **Milestone 20:** verification reports system state; real hardware and long sessions still matter.
- **Milestone 21:** lower-copy transport is research only; bounded CPU readback remains production.

![Development graph](assets/HUFF-DEVELOPMENT-GRAPH.png)
