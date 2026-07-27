# HUFF Native wgpu — Chat Freeze and Testing Handoff

**Freeze date:** 2026-07-26  
**Application baseline:** `0.21.0 / HNW-21`  
**Documentation baseline:** revised native documentation package `0.21.1`  
**Purpose:** Carry the complete architectural and product context into a new testing-focused chat without relying on the full prior conversation.

> **Source-of-truth rule:** In the next chat, use the exact Milestone 21 project tree that was actually run locally. Do not reconstruct the codebase from individual changed-files packages or assume that the earlier separate “updated HUFF codebase” is identical. The tested local tree is authoritative.

---

## 1. Executive summary

This chat completed the planned native HUFF roadmap. The work began with a separately supplied Milestone 11.1 deterministic-export package and proceeded cumulatively through Milestone 21. The resulting application is no longer merely a browser-rendered video sketch inside a desktop wrapper. It is a Rust-owned, wgpu-rendered video instrument with explicit source ownership, GPU temporal memory, persistent image buffers, recording, deterministic export, MIDI/OSC control, state documents, constrained routing recipes, diagnostics, recovery, and platform-output research.

The next chat is **not** a continuation of feature milestones. Its job is to test the completed system, understand which features are genuinely useful, and decide what belongs in a streamlined production branch versus a full observational/study branch.

---

## 2. What happened in this chat

1. The conversation resumed after the prior development chat reached its length limit.
2. Milestone 11.1 and a separate updated HUFF codebase were identified as different trees. The exact Milestone 11 implementation was preserved rather than guessed.
3. The milestone roadmap was reconstructed, and development continued from deterministic offline export through the final interoperability-research milestone.
4. Milestones 12–21 were delivered cumulatively, and the user reported that the application launched and the major new windows/features behaved as described.
5. Several features were explicitly marked provisional or research-oriented rather than falsely declared essential.
6. A full retrospective, milestone history, diagrams, feature documentation, and a revised static documentation site were created.
7. The public documentation was revised to match the earlier HUFF visual language more closely, add a media carousel and an updated native pipeline diagram, remove milestone history from primary public navigation, and explain HUFF for readers who never saw the previous version.

---

## 3. Current freeze point

### Application

- Native Rust + wgpu renderer is the image authority.
- Current build identity is `0.21.0 / HNW-21`.
- All 21 planned milestones are integrated in the cumulative build.
- Corrective builds are included in their parent milestones.
- The application has been launched locally through the final milestone.
- Some export/high-resolution combinations have succeeded and some have not; those failures were intentionally deferred to the testing cycle.

### Documentation

- Revised documentation package is `huff-native-documentation-0.21.1.zip`.
- The site retains the prior teal/red/gray Windows-style visual language.
- A media carousel and updated native effect-pipeline diagram are included.
- Milestones are preserved in internal/reference documents but removed from primary public website navigation.
- A Visual Guide identifies which pages need real UI screenshots, output examples, or diagrams.
- More real screenshots and finished-output media still need to be captured.

---

## 4. Decisions already made

- Preserve the complete build before removing anything.
- Do not treat every integrated feature as automatically essential to the production application.
- Keep architecture, state schemas, rationale, and changelogs even when a UI or feature is later removed.
- Pipeline recipes are a core expansion concept: new registered modules and legal insertion points can unlock new recipes without turning HUFF into an unrestricted node graph.
- The export queue remains provisional.
- The Parity Lab is primarily a calibration scaffold, not completed visual parity.
- The Interop Lab is research and measurement, not a zero-copy implementation.
- The next development phase is consolidation/testing, not Milestone 22.

---

## 5. Features to evaluate in the next chat

### Likely core / strong retention candidates

- Native renderer and canonical parameter ownership
- Explicit video/camera source ownership and decoder recovery
- GPU history ring and persistent flying framebuffer
- Glitch, clusters, scanlines, Smoosh, Luma Key, Global Mix, Flow, and feedback
- Native output window, Syphon/Spout boundary, live recording, still export
- Deterministic exporter and full-resolution export graph
- MIDI/OSC canonical mapping model
- Named buses and constrained pipeline recipes
- Production verification, diagnostics export, and bounded recovery

### Evaluate, simplify, hide, or remove

- Durable Export Queue
- Parity Lab user interface
- Interop Lab user interface
- The amount of state-document complexity exposed in normal use
- Automation UI and lack of a polished live transport
- Advanced export profiles that may be excessive for the primary audience
- The visibility and placement of diagnostics/research controls

### Preserve even if the visible feature is removed

- Deterministic clock and private exact-frame decoder
- Immutable export-job specification and transaction-safe output model
- Legacy parameter contract and validation profiles
- Canonical mapping and state schemas
- Routing schema and typed bus responsibilities
- `ExternalOutputFrame` transport boundary and interoperability reports
- All upgrade notes and design rationale

---

## 6. Recommended next-chat workflow

1. Confirm the exact local Milestone 21 tree and create a permanent tag.
2. Create or confirm three branches:
   - `huff-native-full-study` — every milestone and research feature retained.
   - `huff-native-production` — streamlined application for actual use and release.
   - `huff-native-effects-lab` — new Field Store, stencil, trail, keying, and recipe experiments.
3. Test one subsystem at a time before evaluating combinations.
4. Log findings as `KEEP`, `HIDE`, `SIMPLIFY`, `REMOVE`, `BROKEN`, or `NEEDS CALIBRATION`.
5. Fix crashes, stalls, leaks, state loss, and broken output before adding major effects.
6. Perform effect calibration after runtime reliability is understood.
7. Only then begin new complex effects and additional recipe families.

---

## 7. Testing priorities

### Reliability

- 30-minute, 2-hour, and eventually 6–8-hour sessions
- Memory growth and GPU-resource stability
- Video/audio stalls with transport still advancing
- Repeated source switching
- Surface occlusion, focus changes, display changes, and recovery
- Syphon/Spout consumer disconnect and reconnect

### Creative graph

- Every effect independently
- Glitch + Feedback
- Glitch + Flow
- Scanlines + Luma Key
- Flow + Feedback
- Glitch + Scanlines + Flow
- All effects enabled
- Each routing recipe with matching Program/Monitor selection

### State and control

- Presets, snapshots, sequences, and projects
- Scope-limited recall
- MIDI and OSC learn/edit/load/save
- Automation capture and deterministic replay
- Restart persistence and missing-source behavior

### Output

- Native window
- Syphon on macOS
- Spout on Windows
- Live MP4 recording at 30 and 60 FPS
- Still export at several sizes
- H.264, ProRes, FFV1, and PNG sequence
- Cancellation, failure, cleanup, and destination safety
- 4K/8K resource preflight and the previously mixed Milestone 15 results

---

## 8. Documentation/media work still pending

The revised documentation now identifies where visuals are needed. The highest-priority captures are:

- Full control-window screenshot
- Native output-window screenshot
- Routing/recipe controls
- VERIFY overlay
- INTEROP overlay
- Export controls
- MIDI and OSC mapping windows
- Four to eight strong HUFF output stills or loop thumbnails

These should be added after the UI is stable enough that screenshots will not immediately become obsolete.

---

## 9. Current artifacts

- `huff-native-wgpu-engine-21.zip` — final milestone project package
- `huff-native-wgpu-engine-21-with-retrospective.zip` — final project with retrospective integrated
- `HUFF-NATIVE-WGPU-FULL-RETROSPECTIVE.zip` — retrospective and development graphs
- `huff-native-documentation-0.21.1.zip` — revised static documentation site
- `MILESTONES.md` — authoritative milestone paragraphs
- `MIGRATION-STATUS.md` — current technical status and refinement boundaries
- `FEATURE-KNOWLEDGE-INDEX.md` — feature retention/removal guidance
- `UPGRADE-NOTES-*.md` — detailed milestone and corrective changelogs

---

## 10. Starter prompt for the next chat

Copy this into the next project chat:

```text
I am beginning the HUFF Native 1.0 testing and feature-retention cycle. The source of truth is my locally tested HUFF Native wgpu 0.21.0 / HNW-21 project. The 21-milestone roadmap is complete. Do not add a new milestone by default.

I will test subsystems and decide whether each feature should be kept, hidden, simplified, removed, fixed, or calibrated. Preserve the full-study architecture and changelog knowledge even when production features are removed. Prioritize crashes, stalls, leaks, state loss, output failures, and usability problems before new effects.

Use the attached HUFF Native Chat Freeze and Testing Handoff plus the raw milestone changelogs as project context. Provide only specifically changed files/projects unless a repository-wide package is necessary.```

---

## 11. Final handoff statement

The conversion roadmap is complete. The current build should now be treated as an architectural study baseline and a candidate production foundation. The next chat should determine what HUFF actually needs to be in daily use, while preserving the complete design knowledge that made the conversion possible.