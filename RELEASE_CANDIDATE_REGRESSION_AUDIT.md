# HUFF Classic Pass 57 — Release Candidate Regression Audit

## Decision

Pass 57 is a **regression/freeze pass**, not a feature pass.

The committed Pass 56 runtime is treated as the candidate instrument. Pass 57 changes only validation, documentation, and release-test orchestration. The purpose is to answer a different question from the optimization and augmentation cycles:

> Can the current HUFF Classic build survive a deliberate end-to-end release-candidate test without reopening already accepted systems?

## Why this is the correct next step

Recent work closed the major active design issues:

- three-source image-entry model is visible in the interface;
- Symmetry and Solarize are disclosed as downstream processors rather than falsely presented as standalone starters;
- Luma performance and compositing vocabulary were expanded;
- Solarize gained Threshold, Luma Quantize, and Chroma Posterize modes;
- Layer Priority was simplified;
- Global Mix received a restrained extension;
- Syphon has a stable lifecycle plus 720p60 worker-direct transport and 720p30 fallback;
- preset files are user-owned JSON documents;
- saved and loaded JSON presets populate a temporary performance-session bank;
- global keyboard shortcuts no longer steal ordinary preset-name typing.

The highest-value activity is therefore integrated verification rather than another creative subsystem.

## Pass 56 runtime freeze

Pass 57 validates exact SHA-256 hashes for:

- `src/canvas.js`
- `src/effects.js`
- `src/pipeline-runtime.js`
- `src/syphon-stream-worker.js`
- `src/index.html`
- `src-tauri/src/main.rs`
- `src-tauri/src/syphon.rs`

The corresponding manifest is:

`baseline/pass56-pass57-runtime-protected.sha256`

This intentionally prevents the regression pass itself from becoming an untracked runtime change.

## Current authoritative automated suite

Run:

```bash
npm run regress:pass57
```

The suite executes:

1. JavaScript syntax checks for the principal runtime files.
2. Pass 56 preset-save/session-recall validation.
3. Pass 55 keyboard-focus validation.
4. Pass 52D three-source pipeline-awareness validation.
5. Pass 51 Syphon two-credit transport simulation.
6. Pass 40W layer-handoff simulation.
7. Pass 41A playback/history simulation.
8. Pass 57 release-contract validation.
9. Static release preflight for macOS, Windows, and Linux packaging configuration.

Historical validators that pin intentionally superseded UI labels or whole-file hashes are **not** treated as current release gates. For example, Pass 54 expects the older `SESSION — LOADED FILES` wording, while Pass 56 intentionally changes the group to `SESSION — SAVED / LOADED`.

## Pass 57 contract checks

The Pass 57 validator additionally confirms:

- no runtime file drift from Pass 56;
- SAVE FILE writes through the native command before session registration;
- the exact serialized preset snapshot is registered for session recall;
- saved session presets are selected immediately;
- user presets are not newly persisted through localStorage/sessionStorage;
- native preset read/write commands and dialog permissions remain present;
- the global `P` shortcut remains removed;
- editable-focus keyboard ownership remains present;
- the three primary image feeds remain Corrupt, Scanlines, and Luma/Composite;
- downstream no-feed messaging remains present;
- CLASSIC and CRISP FINISH quick-route descriptions remain explicit;
- Syphon exposes only 720p60 and 720p30 profiles;
- the worker-direct Syphon route remains two-credit bounded;
- `index.html` contains no duplicate element IDs.

## Manual gates remain authoritative

Static validation cannot prove creative behavior or platform runtime behavior. Release-candidate acceptance still requires target-machine testing for:

- actual image behavior;
- FPS under representative patches;
- media load/play/scrub/change;
- preset native dialogs and file ownership;
- session-bank lifecycle;
- Syphon startup, reconnect, stop/restart, and endurance;
- Windows Spout behavior;
- Linux startup/output behavior;
- sleep/wake and shutdown cleanup.

See `RELEASE_CANDIDATE_TEST_MATRIX.md`.

## Orthogonal development opportunity: preset curation

The regression session can create future release content without changing Pass 57.

When a state proves visually strong and stable during regression:

```text
regression patch
    ↓
SAVE FILE…
    ↓
portable JSON
    ↓
continue stress-testing it
    ↓
keep as future factory-preset candidate
```

This uses the exact user-facing preset path as the future content-authoring path. Candidate JSON files stay external during Pass 57. Factory-preset promotion is a later, deliberate release-content step.

## Freeze discipline

If regression finds a bug:

1. reproduce it from Pass 56/57;
2. isolate the smallest responsible subsystem;
3. make one corrective pass;
4. add a regression test for that failure;
5. rerun the full Pass 57 suite;
6. avoid opportunistic feature work in the corrective pass.

The objective is a boring, predictable release candidate.
