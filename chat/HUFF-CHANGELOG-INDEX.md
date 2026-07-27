# HUFF Native wgpu — Preserved Changelog Index

The `changelogs/` directory contains the raw milestone upgrade notes and authoritative supporting records available at the chat freeze. These are retained even when later production branches remove or hide features.

## Raw milestone and corrective notes

### [UPGRADE-NOTES-02.1.md](changelogs/UPGRADE-NOTES-02.1.md)
Sections: `Fixed` · `Active-source behavior` · `Files changed` · `Required local test`

### [UPGRADE-NOTES-03.2.md](changelogs/UPGRADE-NOTES-03.2.md)
Sections: `Fixes` · `Files included in the changed-files package` · `Run`

### [UPGRADE-NOTES-03.md](changelogs/UPGRADE-NOTES-03.md)
Sections: `Purpose` · `Changed source files` · `Compatibility`

### [UPGRADE-NOTES-04.1.md](changelogs/UPGRADE-NOTES-04.1.md)
Sections: `Restored flying frame-buffer model` · `Parameter parity corrections` · `Feedback parity corrections` · `Scope`

### [UPGRADE-NOTES-04.md](changelogs/UPGRADE-NOTES-04.md)
Sections: `Core implementation` · `Newly enabled controls` · `Safety limits`

### [UPGRADE-NOTES-05.md](changelogs/UPGRADE-NOTES-05.md)
Sections: `Added` · `State behavior` · `Resource behavior` · `Apply`

### [UPGRADE-NOTES-06.md](changelogs/UPGRADE-NOTES-06.md)
Sections: `Changed source files` · `GPU resources` · `Behavioral scope`

### [UPGRADE-NOTES-07.1.md](changelogs/UPGRADE-NOTES-07.1.md)
Sections: `Root risk found` · `Correction` · `Test focus`

### [UPGRADE-NOTES-07.2.md](changelogs/UPGRADE-NOTES-07.2.md)
Sections: `Decoder stall recovery` · `Changes` · `Scope` · `Expected recovery behavior`

### [UPGRADE-NOTES-07.md](changelogs/UPGRADE-NOTES-07.md)
Sections: `Added` · `Render-order rules preserved` · `Known parity note`

### [UPGRADE-NOTES-08.1.md](changelogs/UPGRADE-NOTES-08.1.md)
Sections: `What changed` · `Build behavior` · `Receiver behavior` · `Unchanged`

### [UPGRADE-NOTES-08.md](changelogs/UPGRADE-NOTES-08.md)
Sections: `Purpose` · `Core changes` · `Important limitation` · `Platform requirements` · `macOS` · `Windows` · `No intentional effect changes`

### [UPGRADE-NOTES-09.md](changelogs/UPGRADE-NOTES-09.md)
Sections: `Recording architecture` · `Controls` · `Output format` · `Synchronization` · `Safety and diagnostics` · `Not included yet`

### [UPGRADE-NOTES-10.md](changelogs/UPGRADE-NOTES-10.md)
Sections: `Export architecture` · `Resolution profiles` · `Aspect policies` · `Sampling` · `Reproducibility sidecar` · `Important scope boundary`

### [UPGRADE-NOTES-11.1.md](changelogs/UPGRADE-NOTES-11.1.md)
Sections: `Compile correction`

### [UPGRADE-NOTES-11.md](changelogs/UPGRADE-NOTES-11.md)
Sections: `Why this is different from recording` · `Deterministic state boundary` · `Exact source-frame decoding` · `Output scaling` · `Audio` · `Live-engine handoff` · `Cancellation and cleanup` · `Current scope boundaries`

### [UPGRADE-NOTES-12.md](changelogs/UPGRADE-NOTES-12.md)
Sections: `New export profiles` · `Profile-specific encoding` · `H.264 MP4` · `ProRes 422 HQ` · `ProRes 4444` · `FFV1 Lossless` · `PNG sequence` · `Alpha-preserving export pass` · `Output transaction model` · `Export-job manifests`

### [UPGRADE-NOTES-13.md](changelogs/UPGRADE-NOTES-13.md)
Sections: `Queue model` · `Automatic dispatch` · `Durable state` · `Job states` · `Queue operations` · `Recovery behavior` · `Destination safety` · `Scope boundaries`

### [UPGRADE-NOTES-14.md](changelogs/UPGRADE-NOTES-14.md)
Sections: `New module` · `Clip schema` · `Recording boundary` · `Deterministic playback` · `Looping` · `Resource safety` · `Export and queue integration` · `Control surface` · `Version`

### [UPGRADE-NOTES-15.md](changelogs/UPGRADE-NOTES-15.md)
Sections: `Architectural change` · `Full-resolution resources` · `Automation topology guard` · `Source mapping moved upstream` · `Direct 1:1 capture` · `History allocation` · `Resource preflight` · `Metadata additions` · `Restoration behavior` · `Compatibility`

### [UPGRADE-NOTES-16.md](changelogs/UPGRADE-NOTES-16.md)
Sections: `Purpose` · `Exact legacy contract` · `Native parity module` · `Calibration profiles` · `Legacy Defaults` · `Glitch Isolation` · `Cluster Isolation` · `Scanline Isolation` · `Feedback Reference` · `Flow Reference`

### [UPGRADE-NOTES-17.md](changelogs/UPGRADE-NOTES-17.md)
Sections: `Purpose` · `Architecture` · `Mapping behaviors` · `Portable files` · `Correctness boundaries` · `Version`

### [UPGRADE-NOTES-18.md](changelogs/UPGRADE-NOTES-18.md)
Sections: `Summary` · `Native additions` · `Frontend additions` · `Compatibility` · `Version`

### [UPGRADE-NOTES-19.md](changelogs/UPGRADE-NOTES-19.md)
Sections: `Constrained Routing and Named Buses` · `Added` · `Renderer changes` · `Compatibility` · `Deferred`

### [UPGRADE-NOTES-20.md](changelogs/UPGRADE-NOTES-20.md)
Sections: `New runtime workflow` · `Recovery boundaries` · `Build and repository tools` · `Status`

### [UPGRADE-NOTES-21.md](changelogs/UPGRADE-NOTES-21.md)
Sections: `Added` · `Production behavior` · `Why the typed boundary matters` · `Test focus` · `Status`

## Authoritative supporting records

- [`MILESTONES.md`](changelogs/MILESTONES.md) — master milestone paragraphs and status language.
- [`MILESTONE-QUICK-REFERENCE.md`](changelogs/MILESTONE-QUICK-REFERENCE.md) — layman summary table.
- [`MIGRATION-STATUS.md`](changelogs/MIGRATION-STATUS.md) — final native integration status and deferred work.
- [`FULL-RETROSPECTIVE.md`](changelogs/FULL-RETROSPECTIVE.md) — complete migration retrospective.
- [`FEATURE-KNOWLEDGE-INDEX.md`](changelogs/FEATURE-KNOWLEDGE-INDEX.md) — per-feature retention guidance.
- [`DOCUMENTATION-CHANGELOG.md`](changelogs/DOCUMENTATION-CHANGELOG.md) — documentation freeze changes.
- [`STATE-MODEL.md`](changelogs/STATE-MODEL.md) — state-document definitions and recall behavior.
- [`ROUTING-MODEL.md`](changelogs/ROUTING-MODEL.md) — buses, recipes, legal edges, and cycles.
- [`CONTROL-MAPPING.md`](changelogs/CONTROL-MAPPING.md) — MIDI/OSC mapping design.
- [`PRODUCTION-VERIFICATION.md`](changelogs/PRODUCTION-VERIFICATION.md) — verification and recovery plan.
- [`INTEROP-RESEARCH.md`](changelogs/INTEROP-RESEARCH.md) — lower-copy platform research.
- [`TESTING.md`](changelogs/TESTING.md) — focused local testing instructions.
- [`VALIDATION.md`](changelogs/VALIDATION.md) — static validation record.