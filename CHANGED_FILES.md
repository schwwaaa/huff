# HUFF Classic Optimization Pass 28 — Changed Files

## Runtime

### `src/canvas.js`

- Owns and clears the mirror reconnect timer.
- Owns and cancels the mirror requestAnimationFrame pump.
- Detaches stream-tuning listeners during shutdown.
- Releases Worker handlers, WebSocket handlers, cached canvas references, and staging backing store.

### `src/canvas.html`

- Adds socket-generation validation.
- Owns reconnect and fullscreen timers.
- Prevents stale ImageBitmap decode completion after socket replacement or shutdown.
- Adds deterministic pagehide/beforeunload cleanup.

### `src/index.html`

- Adds Syphon and Spout generation guards.
- Prevents duplicate pending Start/Stop operations.
- Adds shared transport-release functions.
- Clears RAFs, polling intervals, sockets, Workers, staging surfaces, and cached references.
- Adds pagehide cleanup in addition to beforeunload cleanup.

### `src-tauri/src/main.rs`

- Adds idempotent native runtime shutdown.
- Releases MIDI connection.
- Makes OSC shutdown sender consumable and stops the UDP listener.
- Stops Syphon/Spout once before complete process exit.

## Validation and metadata

- `scripts/validate-pass28.mjs`
- `baseline/pass27-src.sha256`
- `baseline/pass27-src-tauri.sha256`
- `package.json`
- `package-lock.json`

## Documentation

- `OUTPUT_ENDURANCE_SHUTDOWN_AUDIT.md`
- `PASS_NOTES.md`
- `CHANGELOG.md`
- `CHANGED_FILES.md`
- `TESTING_CHECKLIST.md`
- `VALIDATION_REPORT.md`
- `CURRENT_STATUS.md`
- `OPTIMIZATION_ROADMAP.md`
- `DOCUMENTATION_INDEX.md`
- `GIT_COMMIT_MESSAGE.md`
- `HUFF_CLASSIC_OPTIMIZATION_PASS_28.txt`
