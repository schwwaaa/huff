# HUFF Native wgpu — Master Milestone Record

**Current build:** `0.19.0 / HNW-19`  
**Current milestone:** Milestone 19 — Constrained Routing and Named Buses  
**Tracking rule:** This file is the authoritative milestone index. It must be carried forward and updated in every complete project archive and every changed-files archive from Milestone 16 onward.

This record describes the purpose of each milestone rather than serving as a detailed changelog. Corrective sub-milestones are listed with the milestone they stabilize. Runtime status is intentionally honest: a feature may be structurally integrated while still awaiting the larger cross-feature refinement and verification cycle.

---

## Milestone 01 — Native Engine Foundation

Milestone 01 established HUFF as a native Rust and wgpu application while retaining an HTML control surface. It introduced the native render window, GPU device and surface ownership, FFmpeg-backed media foundations, camera and video plumbing, canonical Rust-owned parameters, transport foundations, presets, undo, MIDI, OSC, diagnostics, and the basic division between the control WebView and the authoritative native output. The goal was not visual parity yet; it was to create the stable substrate on which every later render, timing, routing, export, and interoperability feature could be built.

## Milestone 02 — Source Ownership and Runtime Stability

Milestone 02 made media-source ownership explicit and hardened normal application operation. Camera and video were made mutually authoritative, transport state was preserved correctly, hidden decode and audio work was reduced when a source was inactive, and the renderer gained recovery paths for surface timeout, occlusion, focus changes, and source switching. **Milestone 02.1** contains the corrective work that fixed source-transition and recovery behavior discovered during testing.

## Milestone 03 — Native GPU Temporal History

Milestone 03 moved HUFF’s bounded frame history into a native GPU texture-array ring. The renderer could capture, retain, and sample recent frames without the WebView acting as image memory, creating the basis for historical glitch sampling and later deterministic export. **Milestones 03.1 and 03.2** corrected portable bind-group layout issues and module-registration details so the history design remained compatible across wgpu backends.

## Milestone 04 — Historical Glitch and Flying Framebuffer

Milestone 04 added instanced historical glitch tiles and a persistent effect buffer that could be transformed over time. This restored the core HUFF behavior in which regions from prior frames are stamped into an image memory that can drift, rotate, scale, decay, and recursively influence later frames. **Milestone 04.1** is the major parity correction that revised the initial interpretation so the native system behaved more like the original flying framebuffer rather than a generic tile overlay.

## Milestone 05 — Cluster Tile Bodies

Milestone 05 added persistent cluster centers and center-relative glitch constellations. It introduced coherence, spread, minimum spread, spatial gaps, bias, drift, speed, steering, speed variance, pulse, inertia, breathing, and Bounce/Wrap boundary behavior. The milestone changed clusters from a random distribution option into a persistent moving system with its own state and recognizable motion behavior.

## Milestone 06 — Scanlines and Layer Priority

Milestone 06 added native scanline bands and formalized the paint relationship between scanlines and glitch tiles. The original HUFF priority choices—Scan, Glitch, Neutral, and Pulse—became explicit native render ordering rather than accidental draw order. This milestone also established that layer priority, Flow targeting, and later Smoosh processing would need clearly defined precedence rules.

## Milestone 07 — Complete Core Render Graph

Milestone 07 assembled the major native effect families into one ordered render graph. It added Smoosh with sixteen Canvas-style blend modes, Luma Key, Global Mix with selectable insertion positions, Flow with target routing and pulse behavior, and the required interactions among glitch, scanlines, feedback, clean video, and final compositing. **Milestone 07.1** fixed a Metal lockup involving Luma Key and Scanlines, while **Milestone 07.2** added FFmpeg decoder-watchdog recovery after playback and effects could stall during long sessions.

## Milestone 08 — Native Syphon and Spout Output

Milestone 08 made the authoritative native wgpu image available to other applications. It added Syphon publishing on macOS and SpoutDX publishing on Windows through bounded asynchronous readback so external output did not depend on the control window or browser canvas. **Milestone 08.1** hardened the Windows bridge with explicit adapter selection, a dedicated ownership thread, improved diagnostics, receiver compatibility work, and static linking of the bridge.

## Milestone 09 — Constant-Frame-Rate Live Recording

Milestone 09 added live MP4 recording at a fixed 30 or 60 frames per second. The recorder repeats the most recently completed frame when live rendering falls behind, keeps source-video or microphone audio synchronized, muxes AAC audio, and finalizes output safely. This is still a live recorder: it captures the performance as it occurs and therefore remains distinct from the deterministic offline renderer introduced later.

## Milestone 10 — High-Resolution Still Export

Milestone 10 added PNG still export at Native, 1080p, 4K, 8K, or custom dimensions. Smooth and Crisp sampling and Fit, Crop, and Stretch policies were added, along with reproducibility metadata in a `.huff-export.json` sidecar. At this stage the still system could create large deliverables, but the later video-export work was still needed to guarantee a fixed frame timeline and full high-resolution temporal processing.

## Milestone 11 — Deterministic Offline Video Export

Milestone 11 introduced a private frame-driven video exporter that renders from a fixed 24, 30, or 60 FPS timeline instead of recording the timing of the live loop. It freezes canonical state, resets temporal resources, decodes source frames for exact output times, renders every requested frame, optionally retimes source audio, supports cancellation, and writes reproducibility metadata. **Milestone 11.1** is the compile correction that replaced an invalid `ActiveSource` method call without changing behavior.

## Milestone 12 — Production Export Profiles and Image Sequences

Milestone 12 expanded deterministic export into a production-output system. It added H.264 MP4, ProRes 422 HQ, ProRes 4444, FFV1 lossless, and numbered PNG image sequences, with profile-appropriate audio and optional alpha where the output path supports it. Transaction-safe temporary destinations, completed/cancelled/failed states, durable job manifests, and profile-specific metadata made an export a defined artifact rather than only an FFmpeg command.

## Milestone 13 — Durable Export Queue

Milestone 13 added persistent sequential export jobs, frozen job descriptions, pause/resume dispatch, reordering, cancellation, retry, repeat, crash recovery, destination conflict checks, and completed/failed/cancelled history. This feature is **provisional** because the normal HUFF workflow may not require a visible batch queue; it remains integrated so it can be tested during the larger cycle, simplified or hidden as an advanced feature, or removed later without discarding deterministic export itself.

## Milestone 14 — Deterministic Automation Replay

Milestone 14 added recording of canonical parameter changes and discrete actions such as preset recall, reset, buffer clear, and Flow pulse. Clips support Step, Linear, Smooth, Ease In, and Ease Out interpolation, can be imported or exported as JSON, and can be frozen into an offline-export job. During deterministic export the automation runs from export time rather than wall-clock time, allowing the same recorded performance to be rendered repeatedly even though a full live automation transport and preview interface has not yet been added.

## Milestone 15 — True Export-Resolution Render Graph

Milestone 15 replaced final-frame enlargement with a private render graph allocated at the requested export resolution. History, glitch, cluster bodies, scanlines, Smoosh, feedback, Luma Key, Global Mix, Flow, and final compositing now execute at 1080p, 4K, 8K, or custom dimensions before direct readback. Resource estimates, bounded history allocation, source mapping, and restoration of the live graph were added. Initial local tests have produced both successful and unsuccessful cases; the architecture remains integrated while detailed failure analysis is deferred to the larger refinement cycle.

## Milestone 16 — Parameter Contract and Parity Lab

Milestone 16 embeds the exact legacy HUFF control contract extracted from the supplied web/Tauri baseline and verifies the native registry against it. The current native build matches all **87 mapped legacy controls** for identifier, kind, default, range, step, and select options, while separately identifying eleven native-only render, color, and history controls. A compact Parity Lab adds reproducible Legacy Defaults, Glitch, Cluster, Scanline, Feedback, and Flow reference profiles, clears persistent buffers when a profile is applied, reports current deviations from legacy defaults, and exports a machine-readable parity report. This milestone deliberately creates the calibration framework and reproducible test states; subjective visual tuning remains part of the later hands-on refinement cycle.

---

## Milestone 17 — MIDI and OSC Mapping Workflows

Milestone 17 replaces the original eight demonstration input targets with mappings that write directly into HUFF’s canonical native parameter store and action system. MIDI and OSC mappings can now be learned, added, edited, enabled or disabled, validated for conflicting sources, scaled through normalized output ranges, shaped with selectable curves, and assigned Absolute, Gate, Toggle, or Trigger behavior. Portable `huff-control-map/v1` JSON files can be opened and saved through native dialogs, compact factory maps remain available, OSC listener controls are exposed in the interface, and mapped changes are recorded by the automation system when recording is active. Clear Buffers, Flow Pulse, and Reset Parameters are available as canonical action targets. The feature is integrated for the later controller-specific test cycle; individual devices and unusual MIDI/OSC senders may still require refinement.

---

## Milestone 18 — Presets, Snapshots, Sequences, and Projects

Milestone 18 formalizes HUFF state through the `huff-state/v1` document model. Presets are reusable scoped artistic conditions, snapshots are broad machine-state captures, sequences are source-independent automation clips, and projects can collect selected parameters, source/transport references, automation, and MIDI/OSC maps. Recall uses the intersection of the document’s captured scope and the operator’s selected load scope, preventing a look from silently changing transport, render allocation, automation, or mappings. All 98 canonical parameters now have state-domain, preset, snapshot, sequenceability, interpolation, project-scope, and live-safety metadata. Persistent GPU history, flying-buffer, feedback, and Flow pixels are identified but intentionally not embedded, keeping image stores separate from process-state recall.

---

## Milestone 19 — Constrained Routing and Named Buses

Milestone 19 formalizes the fixed HUFF recipe as a constrained `huff-routing/v1` topology with explicit Clean, History, Process, Field Store, Mask, Program, and Monitor responsibilities. The stable render graph still executes as one known instrument recipe rather than an unrestricted node graph. Program can commit the normal clean/effect composite, direct Clean source, or raw Field Store, while the local native window can independently monitor Program, Clean, or Field Store without changing Syphon, Spout, recording, or export. Existing layer priority, Flow target, Global Mix placement, and Smoosh decisions are now presented as routing controls, validated recipes can be applied as canonical parameter batches, legal cycles are limited to explicit temporal resources, route plans can be exported as JSON, and Routing scope in presets, snapshots, and projects now includes the two new Program and Monitor parameters. The canonical registry increases from 98 to 100 parameters while the legacy 87-control contract remains unchanged.

---

# Planned Milestones

## Milestone 20 — Cross-Platform Production Verification

Milestone 20 will perform the broad validation that cannot be completed through static packaging checks alone. It will cover macOS Metal, Windows DX12/MSVC, Spout receiver testing, Syphon clients, multi-GPU adapter behavior, long playback and export sessions, installer generation, restart recovery, codec availability, device-loss paths, and the interaction of recording, output sharing, automation, and deterministic export under real production conditions.

## Milestone 21 — Lower-Copy Platform Interoperability Research

Milestone 21 will investigate direct or lower-copy texture-sharing paths for Metal, Direct3D 11/12, and Vulkan-compatible environments. The current bounded readback bridges prioritize correctness and portability, but they incur GPU-to-CPU and CPU-to-GPU transfers. This research milestone will determine whether safe shared-texture or external-memory paths can reduce latency and bandwidth without making the core HUFF engine fragile or backend-specific.

---

## Corrective-build naming

A decimal suffix such as `02.1`, `04.1`, `07.2`, `08.1`, or `11.1` identifies a corrective build within the parent milestone. It does not create a new roadmap objective. Corrective builds should be recorded in the parent milestone’s paragraph and retain the same architectural purpose.

## Status vocabulary

- **Completed:** integrated and accepted as the current architectural baseline.
- **Integrated, refinement pending:** present in the codebase, but visual, performance, or cross-platform behavior still needs the larger test cycle.
- **Provisional:** intentionally retained for real-world evaluation and may later be simplified, hidden, or removed.
- **Planned:** ordered roadmap work that has not yet been implemented.
