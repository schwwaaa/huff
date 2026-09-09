# HUFF Windows Spout Optimization — Pass 1

**Date:** 2026-09-09  
**Branch target:** `beta-windows`  
**Baseline:** Windows v5 checkpoint that builds correctly and was validated by the user at stable 60 FPS  
**Status:** Implemented; static validation complete; **Windows/OBS runtime validation required**

---

## 1. Problem statement

The validated Windows HUFF renderer can hold 60 FPS, but the previous Spout path performed full-frame Canvas2D staging, `getImageData()`, and WebSocket sending on the controls/WebView thread. It also had no acknowledgement from the native Spout upload, so browser socket state was the only backpressure signal.

At 1280×720 RGBA, one frame is 3,686,400 bytes. At 60 FPS this is approximately 210.9 MiB/s of raw frame payload before transport/runtime overhead.

The objective of this pass is to improve frame cadence and latency without modifying the validated playback/effects/rendering pipeline or the working Windows build architecture.

---

## 2. Inputs / outputs

### Input

- The current final HUFF HTML canvas.
- User-selected Spout output size.
- User-selected Spout FPS; Windows now defaults to 60 FPS.

### Output

- Raw RGBA frames delivered to the existing Rust WebSocket receiver.
- The existing dynamic `spout_bridge.dll` continues to call official `SpoutDX::SendImage()`.
- Spout publishes the resulting D3D11 shared texture as sender `huff`.
- OBS remains the primary receiver under test, but the sender remains generic Spout2.

---

## 3. Architecture implemented

### Preferred path

```text
HUFF final canvas
      |
      | createImageBitmap()
      v
Spout Worker
      |
      +-- OffscreenCanvas scale/draw
      +-- getImageData() off controls thread
      +-- Worker-owned loopback WebSocket
      |
      | max 2 native outstanding frames
      v
Rust WebSocket receiver
      |
      | spout-ack emitted only AFTER SendImage returns
      v
spout_bridge.dll
      |
      v
SpoutDX::SendImage()
      |
      v
shared D3D11 Spout texture
      |
      +--> OBS
      +--> any compatible Spout receiver
```

### Fallback path

If Worker/OffscreenCanvas or Worker-owned WebSocket transport fails:

```text
Worker readback -> controls-owned WebSocket -> Rust -> Spout
```

If the Worker itself is unavailable or crashes:

```text
main-thread Canvas2D readback -> controls-owned WebSocket -> Rust -> Spout
```

Fallback is capped at **30 FPS** to protect the established 60 FPS HUFF renderer.

---

## 4. Code changes

### `src/spout-stream-worker.js` — new

Adds a dedicated Spout output Worker based on the already-proven HUFF Syphon transport design.

Features:

- `OffscreenCanvas` staging;
- Worker-side `getImageData()`;
- Worker-owned local WebSocket;
- two-credit native pipeline;
- ACK timeout recovery;
- stale-frame dropping rather than queue growth;
- Worker draw/read/send telemetry;
- end-to-end acknowledgement telemetry.

### `src/index.html`

The Spout engine was replaced with an isolated Worker-first transport controller.

Changes:

- 60 FPS is now the default Spout target;
- old controls-thread readback becomes fallback rather than primary;
- Worker-direct is the preferred transport;
- deadline-based output pacing replaces `ts - lastTs < period`;
- frame pacing is capped correctly on 60/120/144/165 Hz displays;
- one-frame-in-flight fallback protection;
- two-credit Worker capacity awareness;
- adapter and sender-FPS status display;
- multi-GPU warning when more than one adapter exists;
- `window.__huffSpoutTelemetry` expanded with transport/native metrics.

### `src-tauri/src/main.rs`

For dedicated Spout binary frames:

1. call `spout::push_pixels_profiled()`;
2. wait for `SpoutDX::SendImage()` to return;
3. only then emit `spout-ack` to the sender connection.

This acknowledgement is the native credit release signal.

A new `spout_runtime_state` Tauri command exposes read-only diagnostics.

### `src-tauri/src/spout.rs`

Adds:

- `SpoutPushResult`;
- sampled native `SendImage()` duration;
- `SpoutRuntimeSnapshot`;
- adapter index/count/name;
- Spout sender FPS;
- profiled/native-ACK send path.

The ordinary `push_pixels()` path remains available for legacy callers.

### `src-tauri/native/spout_bridge/spout_bridge.cpp/.h`

The sender and frame-transfer algorithm remain `SpoutDX::SendImage()`.

Only read-only diagnostic ABI calls were added:

```text
spoutdx_get_adapter_index
spoutdx_get_adapter_count
spoutdx_get_adapter_name
spoutdx_get_sender_fps
```

No adapter is changed automatically in this pass.

### `scripts/validate-spout-pass1.mjs` — new

Validates the Spout Pass 1 contracts and simulates output cadence across common display refresh rates.

---

## 5. Protected baseline

The following known-good Windows/runtime files remain byte-for-byte identical to the v5 Windows baseline:

```text
scripts/build-windows.ps1
src/canvas.js
src/effects.js
src/pipeline-runtime.js
src/syphon-stream-worker.js
src-tauri/build.rs
src-tauri/Cargo.toml
src-tauri/tauri.conf.json
src-tauri/tauri.windows.conf.json
```

The Windows build architecture remains the validated **dynamic `spout_bridge.dll`** design.

No changes were made to:

- video playback;
- camera ingest;
- effect implementations;
- pipeline recipes;
- HUFF render FPS policy;
- Syphon;
- Windows MSI build orchestration.

---

## 6. Assumptions

- Windows WebView2 supports `Worker`, `OffscreenCanvas`, and `createImageBitmap` on the test system. If not, the existing-style fallback remains available.
- The local HUFF WebSocket listener remains at its existing loopback endpoint.
- Spout sender and OBS should use the same physical GPU on multi-GPU systems.
- OBS is configured for a 60 FPS video output when evaluating a 60 FPS Spout source.
- 1280×720@60 is the primary current target. Higher-resolution output is not considered proven by this pass.

---

## 7. Edge cases / failure modes

### Worker WebSocket fails to open

After 1.8 seconds, HUFF switches to bounded main-socket fallback.

### Worker/native ACK stalls

After 2.5 seconds without completion of the oldest native frame, the Worker transport fails closed and HUFF falls back instead of building latency.

### Native output becomes slower than HUFF

At most two frames may be outstanding. New Spout opportunities are dropped until native capacity returns.

### Main fallback becomes slow

Exactly one frame may be in flight. Additional opportunities are skipped until its native ACK returns.

### Multi-GPU system

HUFF reports the Spout-selected adapter. The application does **not** silently switch GPUs. The user can ensure OBS is assigned to the same adapter during testing.

### Worker/ImageBitmap unavailable

The system retains the main-thread capture fallback at 30 FPS.

### Historical Pass 58 exact-byte validator

`validate-pass58.mjs` intentionally asserts historical exact bytes for `src-tauri/src/main.rs`. It will now fail because this Spout pass intentionally modifies that file. This is **not** a playback regression signal. The new Spout validator is the authoritative validator for these intended post-Pass-58 Windows changes.

---

## 8. Validation executed in this environment

### PASS

- `node --check src/spout-stream-worker.js`
- all inline `<script>` blocks in `src/index.html` parse with Node syntax checking;
- release static preflight: **23 pass / 0 warnings / 0 blockers**;
- Pass 51 Syphon two-credit simulation still passes;
- Pass 41A playback simulation still passes;
- Spout Pass 1 validator passes all contracts;
- pacing simulation:
  - 60 Hz rAF -> ~60 FPS target;
  - 120 Hz rAF -> ~60 FPS target;
  - 144 Hz rAF -> ~60 FPS target;
  - 165 Hz rAF -> ~60 FPS target;
  - 60 Hz rAF / 30 FPS fallback -> 30 FPS target;
- protected baseline files listed above are byte-identical to v5.

### Not executable in this environment

The current container does not have the Windows MSVC toolchain or Cargo installed, so this pass cannot be compiled against the Windows Spout DLL here.

**Required real gate:** `npm run dev` and `npm run build:windows` on the Windows test machine.

---

## 9. Windows + OBS test procedure

### Gate A — development compile

```powershell
npm run dev
```

Confirm the application opens and normal playback remains at the existing 60 FPS baseline before enabling Spout.

### Gate B — Spout Worker-direct

In HUFF:

```text
Resolution: 1280 x 720
FPS cap:    60
Start Spout
```

Expected Spout status should eventually identify:

```text
worker-direct
GPU <index>: <adapter name>
Spout <approximately 60> fps
```

### Gate C — OBS

Use an OBS Spout source receiving sender:

```text
huff
```

OBS video settings should be 60 FPS for the primary test.

Observe:

- HUFF application FPS;
- Spout sender FPS shown by HUFF;
- visible motion cadence in OBS;
- tearing/corruption;
- long-session latency growth;
- whether HUFF reports `worker-direct` or a fallback.

### Gate D — telemetry

In HUFF devtools:

```javascript
window.__huffSpoutTelemetry
```

Important fields:

```text
captureMs / captureSamples
workerDrawMs / workerSamples
workerReadMs
workerSendMs
endToEndMs / endToEndSamples
nativeUploadMs / nativeSamples
capacitySkips
bufferedSkips
workerOutstanding
workerPeakOutstanding
workerTransportFallbacks
adapterIndex
adapterCount
adapterName
senderFps
```

### Gate E — release build

After dev/OBS validation:

```powershell
npm run build:windows
```

The existing v5 Windows build/packaging process is unchanged.

---

## 10. Success criteria for this pass

Pass 1 is accepted when Windows testing demonstrates:

- HUFF continues to run at the existing stable 60 FPS baseline;
- Spout remains on `worker-direct` during normal operation;
- native outstanding frames never exceed 2;
- no progressive latency buildup;
- HUFF reports a Spout sender rate near the 60 FPS target;
- OBS motion is visibly smooth at 60 FPS;
- output survives an extended run without transport fallback;
- development and MSI builds both continue to succeed.

If these pass, the next optimization should be driven by measured telemetry rather than by another architectural rewrite.
