# HUFF Native wgpu — Complete Milestone History and Integration Record

**Build covered:** `0.21.0 / HNW-21`  
**Purpose:** Explain every milestone in plain language, record how it changed the architecture, identify current retention status, and link the available raw changelogs.

> A corrective suffix such as `04.1` belongs to the parent milestone. It fixes or hardens the parent objective rather than creating a new roadmap feature.

---

## Milestone 01 — Native Engine Foundation

**Plain-language result:** HUFF stopped being primarily a browser sketch inside a desktop shell and became a real native video engine. The HTML interface remained, but it became the control surface rather than the place where the final image was created.

**Detailed milestone paragraph:** Milestone 01 established HUFF as a native Rust and wgpu application while retaining an HTML control surface. It introduced the native render window, GPU device and surface ownership, FFmpeg-backed media foundations, camera and video plumbing, canonical Rust-owned parameters, transport foundations, presets, undo, MIDI, OSC, diagnostics, and the basic division between the control WebView and the authoritative native output. The goal was not visual parity yet; it was to create the stable substrate on which every later render, timing, routing, export, and interoperability feature could be built.

**Integration impact:** Created the ownership boundary used by every later feature: HTML controls, Rust state/media, and wgpu image authority.

**Current status:** Core foundation — retain

**Preserved changelog files:** No standalone Milestone 01 upgrade note was present in the documentation archive; the authoritative record is the master milestone paragraph and retrospective.

---

## Milestone 02 — Source Ownership and Runtime Stability

**Plain-language result:** HUFF learned which source was truly in control. Starting the camera no longer left a video decoding invisibly, and loading a video no longer depended on stale camera frames.

**Detailed milestone paragraph:** Milestone 02 made media-source ownership explicit and hardened normal application operation. Camera and video were made mutually authoritative, transport state was preserved correctly, hidden decode and audio work was reduced when a source was inactive, and the renderer gained recovery paths for surface timeout, occlusion, focus changes, and source switching. **Milestone 02.1** contains the corrective work that fixed source-transition and recovery behavior discovered during testing.

**Integration impact:** Prevented camera, video, audio, and the renderer from silently competing or spinning during normal use.

**Current status:** Core reliability — retain

**Corrective builds:**
- 02.1 — source switching, hidden decoder/audio work, surface occlusion pacing, reset motion, stale frames

**Preserved changelog files:**
- [`UPGRADE-NOTES-02.1.md`](changelogs/UPGRADE-NOTES-02.1.md)

---

## Milestone 03 — Native GPU Temporal History

**Plain-language result:** Recent frames moved out of JavaScript memory and into a bounded stack of textures on the GPU. This gave HUFF fast access to the past without asking the browser to hold and copy every image.

**Detailed milestone paragraph:** Milestone 03 moved HUFF’s bounded frame history into a native GPU texture-array ring. The renderer could capture, retain, and sample recent frames without the WebView acting as image memory, creating the basis for historical glitch sampling and later deterministic export. **Milestones 03.1 and 03.2** corrected portable bind-group layout issues and module-registration details so the history design remained compatible across wgpu backends.

**Integration impact:** Established bounded GPU access to previous frames, making historical effects and deterministic replay possible.

**Current status:** Core temporal resource — retain

**Corrective builds:**
- 03.1 — portable bind-group layout adjustment (preserved in 03.2)
- 03.2 — registered history module and retained groups 0–3 portability

**Preserved changelog files:**
- [`UPGRADE-NOTES-03.md`](changelogs/UPGRADE-NOTES-03.md)
- [`UPGRADE-NOTES-03.2.md`](changelogs/UPGRADE-NOTES-03.2.md)

---

## Milestone 04 — Historical Glitch and Flying Framebuffer

**Plain-language result:** The defining HUFF image behavior returned: pieces of older frames are stamped into a persistent image that can fly, drift, rotate, scale, fade, and keep influencing what comes next.

**Detailed milestone paragraph:** Milestone 04 added instanced historical glitch tiles and a persistent effect buffer that could be transformed over time. This restored the core HUFF behavior in which regions from prior frames are stamped into an image memory that can drift, rotate, scale, decay, and recursively influence later frames. **Milestone 04.1** is the major parity correction that revised the initial interpretation so the native system behaved more like the original flying framebuffer rather than a generic tile overlay.

**Integration impact:** Restored HUFF’s defining persistent image behavior instead of treating glitch as a disposable overlay.

**Current status:** Core visual identity — retain

**Corrective builds:**
- 04.1 — major parity correction restoring the persistent flying-framebuffer model

**Preserved changelog files:**
- [`UPGRADE-NOTES-04.md`](changelogs/UPGRADE-NOTES-04.md)
- [`UPGRADE-NOTES-04.1.md`](changelogs/UPGRADE-NOTES-04.1.md)

---

## Milestone 05 — Cluster Tile Bodies

**Plain-language result:** Glitch tiles gained moving group behavior instead of appearing as unrelated random rectangles. Clusters can travel, steer, breathe, wrap, bounce, spread, and retain momentum.

**Detailed milestone paragraph:** Milestone 05 added persistent cluster centers and center-relative glitch constellations. It introduced coherence, spread, minimum spread, spatial gaps, bias, drift, speed, steering, speed variance, pulse, inertia, breathing, and Bounce/Wrap boundary behavior. The milestone changed clusters from a random distribution option into a persistent moving system with its own state and recognizable motion behavior.

**Integration impact:** Added stateful motion to clustered glitch, giving it recognizable behavior across frames.

**Current status:** Creative module — retain, calibrate

**Preserved changelog files:**
- [`UPGRADE-NOTES-05.md`](changelogs/UPGRADE-NOTES-05.md)

---

## Milestone 06 — Scanlines and Layer Priority

**Plain-language result:** Scanlines returned, and HUFF stopped relying on accidental drawing order to decide whether glitch or scanline material appears on top.

**Detailed milestone paragraph:** Milestone 06 added native scanline bands and formalized the paint relationship between scanlines and glitch tiles. The original HUFF priority choices—Scan, Glitch, Neutral, and Pulse—became explicit native render ordering rather than accidental draw order. This milestone also established that layer priority, Flow targeting, and later Smoosh processing would need clearly defined precedence rules.

**Integration impact:** Made scanline behavior and glitch/scan precedence explicit rather than accidental.

**Current status:** Creative/routing module — retain, calibrate

**Preserved changelog files:**
- [`UPGRADE-NOTES-06.md`](changelogs/UPGRADE-NOTES-06.md)

---

## Milestone 07 — Complete Core Render Graph

**Plain-language result:** The major HUFF effect families were finally connected into one known order. Glitch, scanlines, feedback, clean video, Flow, Smoosh, Luma Key, and Global Mix could interact in the same native renderer.

**Detailed milestone paragraph:** Milestone 07 assembled the major native effect families into one ordered render graph. It added Smoosh with sixteen Canvas-style blend modes, Luma Key, Global Mix with selectable insertion positions, Flow with target routing and pulse behavior, and the required interactions among glitch, scanlines, feedback, clean video, and final compositing. **Milestone 07.1** fixed a Metal lockup involving Luma Key and Scanlines, while **Milestone 07.2** added FFmpeg decoder-watchdog recovery after playback and effects could stall during long sessions.

**Integration impact:** Connected the major effect families into one native render graph and added recovery for two serious runtime failures.

**Current status:** Core creative graph — retain, calibrate

**Corrective builds:**
- 07.1 — Metal lockup correction for Luma Key + Scanlines
- 07.2 — FFmpeg decoder watchdog and stall recovery

**Preserved changelog files:**
- [`UPGRADE-NOTES-07.md`](changelogs/UPGRADE-NOTES-07.md)
- [`UPGRADE-NOTES-07.1.md`](changelogs/UPGRADE-NOTES-07.1.md)
- [`UPGRADE-NOTES-07.2.md`](changelogs/UPGRADE-NOTES-07.2.md)

---

## Milestone 08 — Native Syphon and Spout Output

**Plain-language result:** The native image could be sent to other visual applications. On macOS this means Syphon; on Windows it means Spout.

**Detailed milestone paragraph:** Milestone 08 made the authoritative native wgpu image available to other applications. It added Syphon publishing on macOS and SpoutDX publishing on Windows through bounded asynchronous readback so external output did not depend on the control window or browser canvas. **Milestone 08.1** hardened the Windows bridge with explicit adapter selection, a dedicated ownership thread, improved diagnostics, receiver compatibility work, and static linking of the bridge.

**Integration impact:** Made the native Program image available to other visual applications independently of the WebView.

**Current status:** Platform output — retain as optional per platform

**Corrective builds:**
- 08.1 — Windows Spout bridge, adapter ownership, diagnostics, linking and receiver hardening

**Preserved changelog files:**
- [`UPGRADE-NOTES-08.md`](changelogs/UPGRADE-NOTES-08.md)
- [`UPGRADE-NOTES-08.1.md`](changelogs/UPGRADE-NOTES-08.1.md)

---

## Milestone 09 — Constant-Frame-Rate Live Recording

**Plain-language result:** HUFF gained a dependable “record what is happening now” mode. If rendering misses a moment, the recorder repeats the latest completed frame instead of producing a broken variable-rate file.

**Detailed milestone paragraph:** Milestone 09 added live MP4 recording at a fixed 30 or 60 frames per second. The recorder repeats the most recently completed frame when live rendering falls behind, keeps source-video or microphone audio synchronized, muxes AAC audio, and finalizes output safely. This is still a live recorder: it captures the performance as it occurs and therefore remains distinct from the deterministic offline renderer introduced later.

**Integration impact:** Added practical live performance capture with constant-rate output and synchronized audio.

**Current status:** Production output — retain

**Preserved changelog files:**
- [`UPGRADE-NOTES-09.md`](changelogs/UPGRADE-NOTES-09.md)

---

## Milestone 10 — High-Resolution Still Export

**Plain-language result:** A single HUFF frame could be saved at native size, 1080p, 4K, 8K, or custom dimensions with choices for fitting and pixel sampling.

**Detailed milestone paragraph:** Milestone 10 added PNG still export at Native, 1080p, 4K, 8K, or custom dimensions. Smooth and Crisp sampling and Fit, Crop, and Stretch policies were added, along with reproducibility metadata in a `.huff-export.json` sidecar. At this stage the still system could create large deliverables, but the later video-export work was still needed to guarantee a fixed frame timeline and full high-resolution temporal processing.

**Integration impact:** Established high-resolution still delivery and reproducibility sidecars.

**Current status:** Production output — retain

**Preserved changelog files:**
- [`UPGRADE-NOTES-10.md`](changelogs/UPGRADE-NOTES-10.md)

---

## Milestone 11 — Deterministic Offline Video Export

**Plain-language result:** HUFF learned to render a video frame by frame from a fixed clock rather than recording whatever speed the live loop happened to achieve.

**Detailed milestone paragraph:** Milestone 11 introduced a private frame-driven video exporter that renders from a fixed 24, 30, or 60 FPS timeline instead of recording the timing of the live loop. It freezes canonical state, resets temporal resources, decodes source frames for exact output times, renders every requested frame, optionally retimes source audio, supports cancellation, and writes reproducibility metadata. **Milestone 11.1** is the compile correction that replaced an invalid `ActiveSource` method call without changing behavior.

**Integration impact:** Separated exact frame-by-frame rendering from live performance recording.

**Current status:** Major export architecture — retain, refine

**Corrective builds:**
- 11.1 — compile-only correction to ActiveSource method call

**Preserved changelog files:**
- [`UPGRADE-NOTES-11.md`](changelogs/UPGRADE-NOTES-11.md)
- [`UPGRADE-NOTES-11.1.md`](changelogs/UPGRADE-NOTES-11.1.md)

---

## Milestone 12 — Production Export Profiles and Image Sequences

**Plain-language result:** Offline export stopped being only one MP4 option and became a delivery system for previews, editing masters, archival files, alpha-capable files, and numbered frames.

**Detailed milestone paragraph:** Milestone 12 expanded deterministic export into a production-output system. It added H.264 MP4, ProRes 422 HQ, ProRes 4444, FFV1 lossless, and numbered PNG image sequences, with profile-appropriate audio and optional alpha where the output path supports it. Transaction-safe temporary destinations, completed/cancelled/failed states, durable job manifests, and profile-specific metadata made an export a defined artifact rather than only an FFmpeg command.

**Integration impact:** Turned deterministic export into a profile-driven delivery system with safe transaction and artifact metadata.

**Current status:** Production profiles — retain, simplify UI if needed

**Preserved changelog files:**
- [`UPGRADE-NOTES-12.md`](changelogs/UPGRADE-NOTES-12.md)

---

## Milestone 13 — Durable Export Queue

**Plain-language result:** HUFF can remember several export jobs, run them one after another, recover unfinished jobs after a restart, and retry or repeat a job.

**Detailed milestone paragraph:** Milestone 13 added persistent sequential export jobs, frozen job descriptions, pause/resume dispatch, reordering, cancellation, retry, repeat, crash recovery, destination conflict checks, and completed/failed/cancelled history. This feature is **provisional** because the normal HUFF workflow may not require a visible batch queue; it remains integrated so it can be tested during the larger cycle, simplified or hidden as an advanced feature, or removed later without discarding deterministic export itself.

**Integration impact:** Added durable batch-job infrastructure around export without changing the deterministic renderer itself.

**Current status:** Provisional — evaluate, hide, simplify, or remove

**Preserved changelog files:**
- [`UPGRADE-NOTES-13.md`](changelogs/UPGRADE-NOTES-13.md)

---

## Milestone 14 — Deterministic Automation Replay

**Plain-language result:** Movements and actions can be recorded, then replayed by the offline exporter using its exact frame clock.

**Detailed milestone paragraph:** Milestone 14 added recording of canonical parameter changes and discrete actions such as preset recall, reset, buffer clear, and Flow pulse. Clips support Step, Linear, Smooth, Ease In, and Ease Out interpolation, can be imported or exported as JSON, and can be frozen into an offline-export job. During deterministic export the automation runs from export time rather than wall-clock time, allowing the same recorded performance to be rendered repeatedly even though a full live automation transport and preview interface has not yet been added.

**Integration impact:** Connected canonical state changes and actions to the fixed offline timeline.

**Current status:** Integrated model, incomplete live UI — retain model, evaluate interface

**Preserved changelog files:**
- [`UPGRADE-NOTES-14.md`](changelogs/UPGRADE-NOTES-14.md)

---

## Milestone 15 — True Export-Resolution Render Graph

**Plain-language result:** A 4K or 8K export now asks the whole HUFF effect system to work at that size instead of merely enlarging the final live-resolution picture.

**Detailed milestone paragraph:** Milestone 15 replaced final-frame enlargement with a private render graph allocated at the requested export resolution. History, glitch, cluster bodies, scanlines, Smoosh, feedback, Luma Key, Global Mix, Flow, and final compositing now execute at 1080p, 4K, 8K, or custom dimensions before direct readback. Resource estimates, bounded history allocation, source mapping, and restoration of the live graph were added. Initial local tests have produced both successful and unsuccessful cases; the architecture remains integrated while detailed failure analysis is deferred to the larger refinement cycle.

**Integration impact:** Moved the entire effect graph—not only final scaling—to the requested export resolution.

**Current status:** Integrated, refinement pending — focused testing required

**Preserved changelog files:**
- [`UPGRADE-NOTES-15.md`](changelogs/UPGRADE-NOTES-15.md)

---

## Milestone 16 — Parameter Contract and Parity Lab

**Plain-language result:** HUFF gained a reference sheet inside the code that says what every original control was called and how it was supposed to range and default.

**Detailed milestone paragraph:** Milestone 16 embeds the exact legacy HUFF control contract extracted from the supplied web/Tauri baseline and verifies the native registry against it. The current native build matches all **87 mapped legacy controls** for identifier, kind, default, range, step, and select options, while separately identifying eleven native-only render, color, and history controls. A compact Parity Lab adds reproducible Legacy Defaults, Glitch, Cluster, Scanline, Feedback, and Flow reference profiles, clears persistent buffers when a profile is applied, reports current deviations from legacy defaults, and exports a machine-readable parity report. This milestone deliberately creates the calibration framework and reproducible test states; subjective visual tuning remains part of the later hands-on refinement cycle.

**Integration impact:** Protected the original control semantics and created repeatable calibration states without pretending visual parity was finished.

**Current status:** Calibration scaffold — retain validator/contract; UI optional

**Preserved changelog files:**
- [`UPGRADE-NOTES-16.md`](changelogs/UPGRADE-NOTES-16.md)

---

## Milestone 17 — MIDI and OSC Mapping Workflows

**Plain-language result:** Physical controllers and network control messages can be learned and assigned directly to real HUFF controls and actions.

**Detailed milestone paragraph:** Milestone 17 replaces the original eight demonstration input targets with mappings that write directly into HUFF’s canonical native parameter store and action system. MIDI and OSC mappings can now be learned, added, edited, enabled or disabled, validated for conflicting sources, scaled through normalized output ranges, shaped with selectable curves, and assigned Absolute, Gate, Toggle, or Trigger behavior. Portable `huff-control-map/v1` JSON files can be opened and saved through native dialogs, compact factory maps remain available, OSC listener controls are exposed in the interface, and mapped changes are recorded by the automation system when recording is active. Clear Buffers, Flow Pulse, and Reset Parameters are available as canonical action targets. The feature is integrated for the later controller-specific test cycle; individual devices and unusual MIDI/OSC senders may still require refinement.

**Integration impact:** Connected MIDI and OSC to real canonical parameters/actions instead of demonstration-only targets.

**Current status:** Integrated — test with real devices

**Preserved changelog files:**
- [`UPGRADE-NOTES-17.md`](changelogs/UPGRADE-NOTES-17.md)

---

## Milestone 18 — Presets, Snapshots, Sequences, and Projects

**Plain-language result:** HUFF stopped treating every saved state as the same thing. A look, a complete machine state, a timed performance, and a project are now different documents.

**Detailed milestone paragraph:** Milestone 18 formalizes HUFF state through the `huff-state/v1` document model. Presets are reusable scoped artistic conditions, snapshots are broad machine-state captures, sequences are source-independent automation clips, and projects can collect selected parameters, source/transport references, automation, and MIDI/OSC maps. Recall uses the intersection of the document’s captured scope and the operator’s selected load scope, preventing a look from silently changing transport, render allocation, automation, or mappings. All 98 canonical parameters now have state-domain, preset, snapshot, sequenceability, interpolation, project-scope, and live-safety metadata. Persistent GPU history, flying-buffer, feedback, and Flow pixels are identified but intentionally not embedded, keeping image stores separate from process-state recall.

**Integration impact:** Separated reusable looks, full snapshots, timed performances, and projects into explicit document types and scopes.

**Current status:** Integrated state vocabulary — retain model; UI may be simplified

**Preserved changelog files:**
- [`UPGRADE-NOTES-18.md`](changelogs/UPGRADE-NOTES-18.md)

---

## Milestone 19 — Constrained Routing and Named Buses

**Plain-language result:** The hidden effect chain gained names and safe switches. HUFF can describe Clean, History, Process, Field Store, Mask, Program, and Monitor, and can apply pipeline recipes without becoming an unrestricted node editor.

**Detailed milestone paragraph:** Milestone 19 formalizes the fixed HUFF recipe as a constrained `huff-routing/v1` topology with explicit Clean, History, Process, Field Store, Mask, Program, and Monitor responsibilities. The stable render graph still executes as one known instrument recipe rather than an unrestricted node graph. Program can commit the normal clean/effect composite, direct Clean source, or raw Field Store, while the local native window can independently monitor Program, Clean, or Field Store without changing Syphon, Spout, recording, or export. Existing layer priority, Flow target, Global Mix placement, and Smoosh decisions are now presented as routing controls, validated recipes can be applied as canonical parameter batches, legal cycles are limited to explicit temporal resources, route plans can be exported as JSON, and Routing scope in presets, snapshots, and projects now includes the two new Program and Monitor parameters. The canonical registry increases from 98 to 100 parameters while the legacy 87-control contract remains unchanged.

**Integration impact:** Named the hidden signal responsibilities and created safe pipeline recipes that can expand with new features.

**Current status:** Core expansion point — retain

**Preserved changelog files:**
- [`UPGRADE-NOTES-19.md`](changelogs/UPGRADE-NOTES-19.md)

---

## Milestone 20 — Production Verification Harness and Recovery Hardening

**Plain-language result:** HUFF gained a transparent self-check and a set of recovery buttons so a problem can be observed and repaired without resetting the creative setup.

**Detailed milestone paragraph:** Milestone 20 turns the final cross-platform test cycle into a repeatable workflow rather than claiming that static packaging checks can certify unavailable hardware. HUFF now produces `huff-production-report/v1` reports covering platform, build identity, wgpu backend and adapter, renderer and surface health, readback pressure, FFmpeg/FFprobe and required encoders, video/camera/audio status, Syphon/Spout state, recording/export ownership, queue recovery state, MIDI/OSC services, and writable temporary storage. A dedicated VERIFY window exposes bounded recovery for the surface, active media source, and active output bridges without clearing parameters or temporal pixels. Diagnostics export writes runtime, parameter, routing, and state-model files into one reviewable folder, while repository and production-build scripts provide normal and strict validation modes for Metal, DX12, and Vulkan targets. Actual receiver compatibility, installer behavior, long-session stability, multi-GPU behavior, and device-loss results remain observations to be collected on every target machine with this common harness.

**Integration impact:** Made runtime truth, diagnostics, and bounded recovery part of the application instead of undocumented troubleshooting.

**Current status:** Operationally valuable — retain, possibly under Diagnostics

**Preserved changelog files:**
- [`UPGRADE-NOTES-20.md`](changelogs/UPGRADE-NOTES-20.md)

---

## Milestone 21 — Lower-Copy Platform Interoperability Research

**Plain-language result:** HUFF now clearly shows how frames reach Syphon or Spout, how much data is being moved, and what would be required to remove some copies in the future.

**Detailed milestone paragraph:** Milestone 21 makes HUFF’s current GPU-to-CPU-to-platform-output path explicit rather than presenting “zero copy” as an unverified promise. The new `huff-interop-report/v1` analysis records backend, adapter, frame size, active output rate, per-stage bandwidth estimates, current bounded readback status, and candidate Metal/Syphon, IOSurface, D3D12/Spout, D3D11On12, and Vulkan external-memory paths with requirements, blockers, risk, and fallback rules. A bounded host-memory copy probe supplies a local baseline while clearly excluding GPU map, driver synchronization, platform upload, and receiver latency. Syphon and Spout now receive a typed `ExternalOutputFrame` submission whose only production variant remains CPU RGBA, creating a controlled seam for future feature-gated native texture tokens without changing the output-worker API. No unsafe direct texture sharing is enabled; bounded asynchronous readback remains authoritative until a platform-specific proof of concept passes frame-identity, synchronization, adapter, receiver, recovery, and automatic-fallback tests.

**Integration impact:** Documented the real copy path and created a safe seam for future platform-specific lower-copy transports.

**Current status:** Research — retain knowledge and typed boundary; UI optional

**Preserved changelog files:**
- [`UPGRADE-NOTES-21.md`](changelogs/UPGRADE-NOTES-21.md)

---

## Cross-milestone integration phases

### Phase A — Native ownership and temporal foundation (01–04)

These milestones moved authority out of the browser canvas, made source ownership explicit, created bounded GPU history, and restored the persistent flying framebuffer. Without this phase, later effects and export systems would have remained fragile or browser-dependent.

### Phase B — Rebuild the recognizable HUFF instrument (05–07)

Clusters, scanlines, layer priority, Smoosh, Luma Key, Global Mix, Flow, and feedback were assembled into the native graph. Corrective builds during this phase were especially important because they addressed visual interpretation, Metal locking, and decoder stalls.

### Phase C — Live production outputs (08–10)

The authoritative Program texture gained external sharing, live recording, and high-resolution still export. This established that HUFF was no longer dependent on a browser canvas for delivery.

### Phase D — Deterministic production rendering (11–15)

The application gained an exact frame clock, private decoding, production profiles, a provisional durable queue, automation replay, and a true export-resolution render graph. This phase is architecturally complete but contains the most important deferred testing, especially Milestone 15.

### Phase E — State, control, and routing language (16–19)

The legacy control contract, controller mapping, document types, recall scopes, named buses, and pipeline recipes turned HUFF from a large collection of controls into a system whose state and signal behavior can be described, saved, validated, and expanded.

### Phase F — Operational transparency and future interop (20–21)

Verification, diagnostics, bounded recovery, and lower-copy research made the application honest about runtime state and technical limitations. These milestones support testing and future optimization rather than adding a new artistic effect.

---

## Current interpretation

The roadmap is complete, but “complete” means the architecture is integrated—not that every workflow is final or every effect has finished artistic calibration. The next stage must separate core instrument behavior from provisional infrastructure and research surfaces while retaining the design knowledge recorded here.