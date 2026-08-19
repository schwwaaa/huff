# Pass 56 — Preset Save + Session Recall

- Successful SAVE FILE… now performs the intended double action: local JSON persistence + temporary in-app recall slot.
- The exact state serialized to disk is used for the session entry.
- Newly saved entries are selected immediately and can be recalled after further edits.
- Same-path resaves refresh the existing session slot.
- Session entries remain nonpersistent and disappear on quit.
- Factory-preset curation remains future work.

---

# Pass Notes

## Pass 55 — Keyboard Focus Safety

- Built directly from accepted Pass 54.
- Removes `P` as a global hide/show-controls shortcut.
- Prevents application-wide keyboard shortcuts from consuming keys while editable controls own focus.
- Preserves `F` fullscreen and Ctrl/Cmd+Z HUFF undo outside editing.
- Preserves Pass 54 preset/session behavior, Pass 52D pipeline behavior, and Pass 51 Syphon.

## Pass 54 — Session Preset Bank

- Builds directly on accepted Pass 53 portable preset file I/O.
- Adds each loaded single-preset JSON to `SESSION — LOADED FILES` in the preset dropdown.
- Multiple loaded files accumulate for the current performance session.
- Loaded presets still apply immediately on file selection.
- Dropdown RECALL can switch among built-ins, legacy migration entries, and session-loaded files.
- Reloading the same file path refreshes its existing session slot.
- Same-named presets from different files remain separate with display-only numeric suffixes.
- Legacy exported banks add all entries to the temporary session group instead of replacing prior loads.
- Session slots live only in memory and disappear when HUFF closes.
- User JSON files remain the durable local copies.
- No localStorage/sessionStorage persistence is introduced.
- No render/effect/native/Syphon behavior is changed.

## Pass 53 — Preset File Workflow Repair

- Replaces new localStorage preset persistence with explicit portable files.
- `SAVE FILE…` opens the native Tauri Save dialog and writes one versioned JSON preset.
- `LOAD FILE…` opens the native Tauri Open dialog and applies the selected file.
- Separates `BUILT-IN` preset recall from user-file Save/Load semantics.
- Adds `Classic Default` as the first immutable built-in state.
- Keeps old localStorage presets read-only for migration.
- Keeps old single-preset JSON and exported preset-bank JSON compatible.
- Removes the duplicate hidden preset file-input ID and obsolete Save/Delete/Export/Import local-bank controls.
- Adds narrow native JSON read/write commands with a 1 MiB safety ceiling.
- Changes no render-stage or effect behavior.

## Pass 52D — Three-Source Pipeline Awareness

- Built directly from Pass 52B; Pass 52C remains rejected.
- Preserves Corrupt, Scanlines, and Luma/Composite as HUFF Classic's three primary image feeds.
- Marks Symmetry and Solarize as downstream processors instead of promising standalone behavior.
- Adds live feed indicators and a recipe-aware quick pipeline route to the Pipeline group.
- Warns `NEEDS IMAGE FEED` when Symmetry or Solarize is enabled with no primary feed.
- Luma counts as a primary feed only when ON, TARGET = COMPOSITE, and MIX > 0.
- CRISP FINISH explicitly reports Symmetry/Solarize as pre-feed relative to the front image layers.
- No auto-enable, no CLEAN fourth feed, no effect math change, no render-stage change, no Syphon change.
- Pass 52B standalone-source experiments remain historical implementation attempts, not the product contract.

## Pass 52B — Standalone Symmetry / Solarize Source Ownership

- Supersedes the incomplete Pass 52A solo-Solarize ownership predicate.
- Distinguishes `activity.feedback` from an actually enabled Feedback transform.
- Gives Symmetry direct `gCur` ownership when no enabled upstream image stage owns `gBuf`.
- Gives Solarize direct `gCur` ownership under the same condition when Symmetry is inactive.
- Symmetry + Solarize now resolves as `gCur -> Symmetry -> Solarize`.
- Preserves real Feedback, Flow, Global Mix, Luma, Glitch and Scanline combinations.
- Changes dispatcher/source selection only; the Symmetry and Solarize algorithms are unchanged.
- No frame skipping, full-resolution source seed, Flow change, Syphon change, or native change.

## Pass 52 — Chroma Posterize

- Built on runtime-accepted Pass 51.
- Adds CHROMA POSTERIZE to the existing Solarize-family bounded colour slot.
- Preserves luminance while quantizing two chroma axes.
- Adds LEVEL, SOFT, and PHASE; reuses AMOUNT and FLUIDITY.
- Adds a bounded WebGL1 path plus bounded CPU fallback.
- Adds no extra full-resolution stage, framebuffer, frame gate, or playback change.
- Preserves Pass 51 Syphon, Luma, Feedback, frozen Flow, and native output behavior.

## Pass 51 — Syphon 720p60 Bounded Pipeline

- Makes HUFF Classic Syphon 1280×720-only.
- Makes 720p60 the default worker-direct target and retains 720p30 as safe mode/fallback.
- Removes 1080p from the Classic Syphon UI.
- Moves direct native ACK credit ownership into the Worker.
- Allows at most two native frames outstanding so next-frame browser readback can overlap native publication.
- Drops excess output opportunities instead of building a latency queue.
- Automatically caps a failed 60 fps worker-direct session to the accepted 720p30 main-socket fallback.
- Preserves bootstrap/lifecycle behavior and all creative/render behavior.

## Pass 50 — Syphon Worker-Owned Transport

- Preserves the accepted Pass 49 Syphon Stability Contract.
- Preferred path moves the local Syphon WebSocket into the existing readback Worker.
- Raw RGBA is sent directly Worker -> Rust instead of being transferred back through the controls WebView first.
- Compact state/ack telemetry still returns Worker -> controls.
- Automatically falls back to the Pass 49 main-owned socket on Worker WebSocket timeout/error/close/crash.
- Retains the older main-thread Canvas2D fallback when Worker/OffscreenCanvas is unavailable.
- Adds `sy send`, `sy route`, and `sy fall` profiler diagnostics.
- No native Syphon/Metal changes and no effect/render changes.

## Pass 49 — Syphon Stability Contract

- Accepted on the target machine.
- Narrows Syphon to CLASSIC 720p30 (recommended), 1080p30 (higher load), and 720p60 (experimental).
- Removes arbitrary Syphon dimensions plus 15/24 fps choices.
- Formalizes OFF / STARTING / WAITING / STREAMING / RECOVERING / STOPPING lifecycle.
- Preserves 1 fps bootstrap and one-frame-in-flight acknowledgement gating.

## Pass 48 — Stable Layer Priority / Global Mix Curves / Expanded Luma Fades

- Removes the old render-frame alternating `NEUTRAL` Layer Priority behavior.
- Removes `PULSE` Layer Priority and `PULSE SPEED` completely from the active Classic control/runtime path.
- Layer Priority is now a stable binary hierarchy: `SCAN TOP` or `CORRUPT TOP`.
- Legacy `neutral`, `pulse`, or unknown imported values resolve to `SCAN TOP`.
- Adds Global Mix `CURVE`: `LINEAR` (exact compatibility), `SMOOTH` (ease at both ends), and `PUNCH` (clean image enters earlier).
- Global Mix curves reuse the existing Mix amount in both direct and Solarize-fused paths; no new image pass or buffer is introduced.
- Expands Luma COMPOSITE Fade from `X-FADE` / `SOFT ADD` to `LIGHTEN`, `DARKEN`, `MULTIPLY`, `OVERLAY`, `HARD LIGHT`, and `DIFFERENCE`.
- X-FADE and SOFT ADD retain their established Canvas operations exactly.
- Additional fade choices alter only keyed-patch compositing; Clip/Gain/Cleanup/Density/Invert/key extraction remain unchanged.
- Flow remains frozen; Solarize and Feedback helpers remain byte-identical to Pass 47.

## Pass 47 — LIVE Luma GPU Handoff / Scratch Budget

- Triggered by target-machine isolation: LIVE/COMPOSITE Luma alone could reduce ~60 FPS to ~52 FPS.
- Adds a bounded WebGL1 keyed-patch path for `TARGET=COMPOSITE`, `KEY SRC=LIVE`.
- Adds a one-time runtime WebGL->Canvas2D alpha parity probe for X-FADE and SOFT ADD.
- Tests the existing premultiplied Solarize context first and lazily tests an unpremultiplied Luma-only context only if required.
- Successful GPU frames perform no `getImageData()`, `putImageData()` or `readPixels()`.
- Keeps the accepted CPU path as automatic fallback and replaces per-pixel key shaping math with a final 256-entry LUT.
- Replaces width-only Luma scratch sizing with long-edge + pixel-budget sizing.
- No frame skipping, playback-rate changes, Feedback/Persistence changes, Flow changes or Solarize transfer changes.

# HUFF Classic Pass Notes

## Pass 46 — Threshold Solarize GPU Acceleration / Stage Timing

- Triggered by the Pass 45 runtime screenshot at ~48 FPS, which showed Solarize was actually running **THRESHOLD**, not LUMA QUANTIZE.
- Extends the existing <=640px WebGL 1 Solarize accelerator to THRESHOLD.
- Successful THRESHOLD GPU frames avoid Solarize's Canvas2D readback, JavaScript pixel loop and pixel upload.
- The exact CPU THRESHOLD algorithm remains present as fallback/reference.
- Adds profiler wall-clock timings at the real serial recipe stages plus separate `gpu thresh` / `gpu quant` counters.
- Pipeline Luma remains CPU after the earlier GPU-Luma parity failure; no unsafe alpha shortcut is reintroduced.
- No frame skipping, sample/hold, playback-rate changes, Feedback/Persistence changes or Flow changes.
## Pass 45 — Solarize Quantize GPU Acceleration / Luma Traversal Merge

- Runtime report: Luma + LUMA QUANTIZE could still fall to ~40 FPS in Pass 44.
- Adds a <=640px WebGL 1 assist only for Solarize LUMA QUANTIZE; Classic remains Tauri v1 + p5.js / Canvas2D.
- Removes Quantize's synchronous `getImageData()` / JavaScript pixel transform / `putImageData()` from the successful GPU path.
- Calculates LEVEL -> quantization steps once outside the fragment shader; reuses texture allocation with `texSubImage2D()`.
- Merges LIVE / COMPOSITE Luma luma-capture + source-alpha + keyed-alpha work into one exact CPU traversal on new source frames.
- Explicitly rejects and removes a tested GPU Luma prototype because final Canvas2D compositing did not preserve visual parity.
- No frame skipping, playback-rate changes or sample/hold optimization.
- Flow remains frozen and byte-identical.

## Pass 44 — Solarize Active Parameters / Performance Repair

- THRESHOLD displays THRESH + SOL R/G/B; LUMA QUANTIZE displays LEVEL + SOFT + INVERT.
- ON / MODE / AMOUNT / FLUIDITY stay visible in both modes.
- Removes Solarize's older adaptive every-N-render reuse behavior.
- Optimizes LIVE/COMPOSITE Luma by directly reusing the already-read source pixels.
- Fuses safe pre-Solarize Global Mix positions into Solarize's 640px scratch when no intervening transform is active.
- Flow remains frozen and byte-identical.

# Pass Notes

## Pass 43 — Solarize Fluidity

- Built directly from Pass 42 HUFF Classic.
- Adds Solarize FLUIDITY; 100% is exact compatibility behavior.
- Lower values continuously slew Solarize state rather than changing media FPS or adding a new frame gate.
- Uses one optional bounded low-resolution history canvas only when active.
- Flow and Feedback/Persistence equations remain untouched.
- Runtime acceptance pending.

## Pass 42 — Solarize Luma Quantize

- Built from accepted Pass 41A.
- Existing Solarize is retained as MODE = THRESHOLD and remains the default.
- Added MODE = LUMA QUANTIZE with LEVEL / SOFT / INVERT.
- New algorithm shares the existing bounded Solarize readback/scratch path.
- Flow remains frozen/protected.
- Runtime acceptance pending.

## Pass 41A — Playback Fidelity / 1080p Classic boundary

Pass 41A follows the decision that HUFF Classic may top out at **1920×1080** while
HUFF HD owns 4K+ processing. The pass repairs media-path ambiguity rather than
replacing the proven WebView decoder architecture.

Key changes:
- explicit `AUTO / 720P / 1080P` processing resolution;
- explicit `STRETCH / FIT / FILL / 1:1` source mapping;
- public `HISTORY` control instead of misleading `QUALITY`;
- strict 192 MiB FrameRing ceiling with the unsafe four-frame floor removed;
- mirror preview fully decoupled from temporal history;
- requestVideoFrameCallback / dropped-frame playback diagnostics;
- fast seek while dragging + exact seek on release;
- clearer MP4/MOV/WebM container messaging.

Pass 40W front-stage behavior is protected exactly outside `src/canvas.js` and the
source-control UI. No decoder backend, Flow, Luma, Scan FIELD, Corrupt, Feedback,
or native output architecture is redesigned here.

## Pass 52A — Solarize Solo Source-Ownership Repair

Runtime candidate. The Pass 52 standalone Solarize test exposed a pre-existing pipeline ownership gap: Solarize is terminal and did not inject fresh live pixels when no upstream image stage was active. Pass 52A supplies `gCur` directly only in the isolated Solarize case. Combined HUFF processing continues to use the persistent `gBuf` path.
