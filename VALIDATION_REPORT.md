# HUFF Classic Pass 51 — Validation Report

## Scope

Pass 51 changes only the browser-side Syphon output contract/scheduler and its documentation/validation. It does **not** change the native Syphon Metal publisher, native raw-RGBA WebSocket protocol, HUFF effects, serial pipeline, Luma, Solarize, Feedback/Persistence, Flow, or Spout.

## Static / regression validation

Executed from the Pass 51 working tree:

```text
npm run validate:pass48
HUFF Classic Pass 48 validation: 69 checks PASS

npm run validate:pass49
HUFF Classic Pass 49 validation: 33 checks PASS

npm run validate:pass50
HUFF Classic Pass 50 validation: 33 checks PASS

npm run simulate:pass50
HUFF Classic Pass 50 Syphon Worker simulation PASS

npm run validate:pass51
HUFF Classic Pass 51 validation: 39 checks PASS

npm run simulate:pass51
HUFF Classic Pass 51 Syphon two-credit pipeline simulation PASS

npm run simulate:pass40w
PASS 40W Scan/Luma/Corrupt layer-handoff simulation PASS

npm run simulate:pass41a
PASS playback simulation

npm run release:preflight
Release preflight: 38 passed, 0 warnings, 0 blockers
```

## Pass 51 simulation coverage

The Pass 51 Worker simulation executes the real `src/syphon-stream-worker.js` with mocked `OffscreenCanvas` and `WebSocket` objects. It verifies:

1. worker-direct opens with exactly two native credits;
2. frame A is sent and leaves one credit available;
3. frame B is sent **before native ACK A** and fills the second credit;
4. frame C is rejected while both credits are occupied;
5. the rejected frame does not enter the socket queue;
6. native ACK A releases one credit and emits a capacity signal;
7. frame C can then enter the pipeline;
8. the accepted Pass 49 full-pixel return fallback still works.

## Protected hash boundary

`baseline/pass48-pass51-protected.sha256` records exact hashes for:

- `src-tauri/src/main.rs`
- `src-tauri/src/syphon.rs`
- `src/effects.js`
- `src/pipeline-runtime.js`

The Pass 51 validator also enforces those exact hashes.

## Syntax checks

The modified Syphon inline JavaScript was extracted from `src/index.html` and passed `node --check`. `src/syphon-stream-worker.js` and `src/canvas.js` also passed `node --check`.

## Native-build limitation

Cargo/Rust is not installed in this build environment, so a fresh `tauri dev`/native compile cannot be certified here. This pass deliberately leaves the native Rust/Syphon files byte-identical to the already-running lineage, but the target Mac remains the authoritative runtime gate.

## Runtime acceptance required

Static validation cannot prove WKWebView/OffscreenCanvas readback throughput or actual 720p60 receiver cadence. The target machine must confirm:

- stable 1280×720/60 worker-direct output;
- bounded `sy credit` depth (never above 2);
- no increasing output latency during saturation;
- receiver disconnect/reconnect and Start/Stop/Start stability;
- forced worker-direct failure continues at effective 1280×720/30 through the accepted fallback;
- long-duration stability under heavy HUFF effects.
