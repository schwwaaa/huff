import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

function ok(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS  ${msg}`);
}
function text(path) { return fs.readFileSync(path, 'utf8'); }
function sha(path) { return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'); }

const html = text('src/index.html');
const main = text('src-tauri/src/main.rs');
const spout = text('src-tauri/src/spout.rs');
const bridge = text('src-tauri/native/spout_bridge/spout_bridge.cpp');
const bridgeH = text('src-tauri/native/spout_bridge/spout_bridge.h');
const buildRs = text('src-tauri/build.rs');
const cmake = text('src-tauri/native/spout_bridge/CMakeLists.txt');
const worker = text('src/spout-stream-worker.js');

// Known-good Windows v5 build orchestration remains untouched.
ok(sha('scripts/build-windows.ps1') === '7df616ead0126e82778478c868824a94a6a37a2ea04c3499f314e80315f29d98', 'known-good Windows v5 build script is unchanged');
ok(buildRs.includes('cargo:rustc-link-lib=dylib=spout_bridge'), 'dynamic spout_bridge.dll linkage remains authoritative');
ok(cmake.includes('add_library(spout_bridge SHARED'), 'Spout bridge remains a DLL');

// UI / controls contract.
ok(/<option value="60" selected>60<\/option>/.test(html), 'Spout defaults to 60 fps');
ok(html.includes("new Worker('./spout-stream-worker.js')"), 'Spout uses dedicated Worker transport');
ok(html.includes('Math.min(requestedOutputFps, 30)'), 'fallback path is capped at 30 fps');
ok(html.includes('function outputFrameDue(ts)'), 'deadline-based frame pacing is present');
ok(html.includes('workerCanAccept'), 'controls thread honors Worker capacity');
ok(html.includes("invoke('spout_runtime_state')"), 'controls poll native Spout runtime diagnostics');

// Worker transport contract.
ok(worker.includes('const MAX_OUTSTANDING_FRAMES = 2'), 'Worker native pipeline is bounded to two credits');
ok(worker.includes('ACK_TIMEOUT_MS = 2500'), 'Worker ACK timeout recovery is present');
ok(worker.includes("role: 'spout-sender'"), 'Worker declares dedicated Spout sender role');
ok(worker.includes("message.type !== 'spout-ack'"), 'Worker releases credits from native Spout ACKs');
ok(worker.includes('transport-busy'), 'Worker drops output opportunities when capacity is exhausted');
ok(worker.includes('getImageData'), 'RGBA readback moved into Worker preferred path');

// Rust/native completion contract.
ok(main.includes('let result = spout::push_pixels_profiled('), 'Rust WebSocket path uses profiled native Spout send');
ok(main.includes('"type": "spout-ack"'), 'Rust emits per-frame Spout ACKs');
ok(main.indexOf('spout::push_pixels_profiled(') < main.indexOf('"type": "spout-ack"'), 'ACK is constructed after native send call');
ok(spout.includes('Instant::now()'), 'native SendImage duration is sampled');
ok(spout.includes('spoutdx_get_adapter_name'), 'Rust exposes adapter diagnostics');
ok(bridge.includes('GetAdapterName'), 'bridge queries Spout-selected graphics adapter');
ok(bridge.includes('GetSenderFps'), 'bridge exposes Spout sender FPS');
ok(bridgeH.includes('spoutdx_get_adapter_count'), 'bridge ABI includes adapter count diagnostics');

// JS syntax.
const syntax = spawnSync(process.execPath, ['--check', 'src/spout-stream-worker.js'], { encoding: 'utf8' });
ok(syntax.status === 0, 'Spout Worker JavaScript parses');

// Pacing sanity: preserve ~60 fps across common display refresh rates while never exceeding one capture per rAF.
function simulate(refreshHz, targetFps, durationMs = 5000) {
  const rafPeriod = 1000 / refreshHz;
  const period = 1000 / targetFps;
  const tolerance = Math.min(1.25, period * 0.08);
  let nextFrameDue = 0;
  let sent = 0;
  for (let ts = 0; ts < durationMs; ts += rafPeriod) {
    let due = false;
    if (!Number.isFinite(nextFrameDue) || nextFrameDue <= 0 || ts - nextFrameDue > period * 4) {
      nextFrameDue = ts + period;
      due = true;
    } else if (ts + tolerance >= nextFrameDue) {
      while (nextFrameDue <= ts + tolerance) nextFrameDue += period;
      due = true;
    }
    if (due) sent++;
  }
  return sent * 1000 / durationMs;
}
for (const hz of [60, 120, 144, 165]) {
  const actual = simulate(hz, 60);
  ok(actual >= 58.0 && actual <= 61.0, `60 fps pacing remains stable on ${hz} Hz rAF (${actual.toFixed(2)} fps)`);
}
const thirty = simulate(60, 30);
ok(thirty >= 29.0 && thirty <= 31.0, `30 fps fallback pacing remains stable (${thirty.toFixed(2)} fps)`);

console.log('\nHUFF Windows Spout optimization pass 1 validation PASS');
