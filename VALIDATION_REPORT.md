# HUFF Classic Optimization Pass 19 — Validation Report

## Deterministic Pass 19 validator

Command:

```bash
npm run validate:pass19
```

Result:

```text
56 checks passed
```

The validator verifies:

- stable Blob URL + p5 `createVideo()` decoder ownership;
- independent p5, transport, mirror, and profiler clocks;
- retained one-fps Syphon bootstrap;
- retained full-rate attachment behavior;
- absence of the duplicate native receiver publication gate;
- four-hertz UI coalescing structure;
- healthy-ACK suppression of redundant Tauri polling;
- cached FPS parsing;
- Worker draw/readback phase timing;
- sampled native upload/publish timing;
- connected receiver-state sampling near four hertz at both 30 and 60 fps;
- disconnected receiver checks on every bootstrap frame.

## Retained deterministic validators

All retained validators passed:

- Pass 9 Flow: 1,728 cases; 4,385,502 exact tile comparisons
- Pass 10 Scanlines: 2,400 cases; 28,342 exact band comparisons
- Pass 11 neutral-stage validation
- Pass 13S lifecycle validation: 27 checks
- Pass 14 ring/copy/physics validation: 31,497 checks
- Pass 15 mirror validation: 38 checks
- Pass 16 Solarize: 644 checks; 8,391,032 exact pixel comparisons
- Pass 16S Syphon bootstrap: 22 checks
- Pass 17 Luma Key: 1,293 checks; 17,715,200 exact pixel comparisons
- Pass 18 Glitch: 4,832 checks; 3,474,837 exact ordered draw operations
- Pass 19 output control-plane validation: 56 checks

## Static validation

Completed after implementation:

- 21 external JavaScript/module files passed syntax checks;
- 25 HTML files were scanned and 32 inline scripts passed syntax checks;
- 29 JSON files parsed successfully;
- 1 TOML file parsed successfully;
- 6 shell scripts passed `bash -n`;
- 4 Rust files passed lexical delimiter checks;
- mandatory Syphon framework presence and architecture checks;
- ZIP integrity verification.

## Native boundary

Pass 19 intentionally changes the macOS Rust relay and native Syphon publisher to reduce receiver-query frequency and add sampled timings.

Cargo, Rust compilation, and a macOS GUI runtime are unavailable in this environment. Therefore the following require the user's Mac:

- Tauri/Rust compilation;
- real Objective-C/Syphon receiver-state behavior;
- actual Metal timing validity;
- OBS moving-frame startup;
- disconnect/reconnect behavior;
- measured FPS and latency.

## Claim boundary

The validation proves the intended scheduling and sampling structure. It does not claim a measured FPS increase. The expected gain is reduced control-plane overhead while Syphon is active; actual impact depends on whether Canvas readback, WebSocket transfer, or Metal upload remains the dominant cost on the target machine.
