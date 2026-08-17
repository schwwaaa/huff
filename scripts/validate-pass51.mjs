import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const bytes = rel => fs.readFileSync(path.join(root, rel));
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) throw new Error(`FAIL: ${msg}`);
}
function sha(rel) {
  return crypto.createHash('sha256').update(bytes(rel)).digest('hex');
}

const index = read('src/index.html');
const worker = read('src/syphon-stream-worker.js');
const canvas = read('src/canvas.js');
const modal = index.slice(index.indexOf('<!-- ═══ Syphon Modal'), index.indexOf('<!-- ═══ Spout Modal'));
const pkg = JSON.parse(read('package.json'));

// Product boundary: Classic Syphon is 720p only, 60 primary / 30 safe.
assert(modal.includes('<option value="720p60" selected>60 FPS — 1280×720</option>'), '720p60 is the default Classic Syphon output');
assert(modal.includes('<option value="720p30">30 FPS — 1280×720 (safe)</option>'), '720p30 safe mode remains user-selectable');
assert(!modal.includes('1920×1080') && !modal.includes('1080p'), '1080p is removed from Classic Syphon');
assert(!modal.includes('15 fps') && !modal.includes('24 fps'), '15/24 fps remain removed from Classic Syphon');
assert(index.includes("'720p60': Object.freeze({ width: 1280, height: 720, fps: 60"), '720p60 profile is fixed to 1280x720');
assert(index.includes("'720p30': Object.freeze({ width: 1280, height: 720, fps: 30"), '720p30 profile is fixed to 1280x720');
assert(index.includes('requestedOutputFps = 60'), 'requested Classic output rate defaults to 60');
assert(index.includes('outputFps = Math.min(requestedOutputFps, 30);'), 'fallback automatically caps requested 60 fps at safe 30 fps');
assert(index.includes('outputFps = requestedOutputFps;'), 'worker-direct restores the requested output rate');

// Pass 51 bounded two-credit worker-direct transport.
assert(worker.includes('const MAX_OUTSTANDING_FRAMES = 2;'), 'Worker native pipeline is capped at exactly two outstanding frames');
assert(worker.includes('outstandingFrames < MAX_OUTSTANDING_FRAMES'), 'Worker capacity checks outstanding credits');
assert(worker.includes('transport.bufferedAmount <= frameBytes()'), 'Worker also bounds local WebSocket backpressure');
assert(worker.includes('pendingProfiles.push'), 'Worker tracks outstanding frames in FIFO order');
assert(worker.includes('pendingProfiles.shift()'), 'native ACK consumes exactly one FIFO credit');
assert(worker.includes('outstandingFrames = Math.max(0, outstandingFrames - 1)'), 'native ACK releases Worker-owned credit');
assert(worker.includes("type: 'frame-consumed'"), 'Worker releases controls capture gate after readback/send, not after native ACK');
assert(worker.includes("type: 'transport-capacity'"), 'Worker reports capacity when a native credit becomes available');
assert(worker.includes("type: 'transport-busy'"), 'Worker drops excess output opportunities instead of queueing');
assert(worker.includes("failTransport('Worker Syphon ACK timeout')"), 'Worker owns direct-path ACK timeout recovery');
assert(!worker.includes('setInterval('), 'Worker does not run an independent frame clock');

// Controls scheduler is decoupled from native ACKs for worker-direct but retains Pass 49 fallback semantics.
assert(index.includes('let workerCaptureInFlight = false;'), 'controls has a capture-only Worker gate');
assert(index.includes('let workerCanAccept = true;'), 'controls tracks Worker credit availability');
assert(index.includes('transportMode === TRANSPORT.WORKER'), 'worker-direct route remains explicit');
assert(index.includes('if (workerCaptureInFlight)'), 'controls prevents overlapping ImageBitmap capture tasks');
assert(index.includes('if (!workerCanAccept)'), 'controls does not capture when both native credits are occupied');
assert(index.includes('transportMode === TRANSPORT.MAIN && frameInFlight'), 'Pass 49 fallback remains one-frame-in-flight');
assert(index.includes('const fpsCap = receiverConnected ? outputFps : BOOTSTRAP_FPS;'), 'receiver-aware output pacing and one-fps bootstrap remain');
assert(index.includes('const BOOTSTRAP_FPS = 1;'), 'one-fps bootstrap remains');
assert(index.includes('function activateMainTransport'), 'automatic safe fallback remains');
assert(index.includes("worker?.postMessage({ type: 'disable-transport' })"), 'fallback disables Worker socket ownership');

// Profiler can prove whether 60 fps is credit-limited.
assert(canvas.includes("'sy credit  '"), 'profiler reports Worker native credits');
assert(canvas.includes('capacitySkips'), 'profiler tracks credit-pressure skips');
assert(index.includes('workerPeakOutstanding'), 'telemetry records peak Worker outstanding depth');

// Native and creative engine are deliberately unchanged.
assert(sha('src-tauri/src/syphon.rs') === 'c763c793c6a1e47579625639e229c2565afd27dfd63e62e7825d6ba7ecc3e944', 'native Syphon Metal publisher remains protected');
assert(sha('src-tauri/src/main.rs') === '5eaff1e342ac2fd2b987c7df6855c4712b2a94692f4dd0476afaedc33e09e83c', 'native raw-RGBA WebSocket protocol remains protected');
assert(sha('src/effects.js') === '7e3317f4fca1e5e44454e561affda95ff2aeef700bb77802e0d593716cf16654', 'effects remain protected');
assert(sha('src/pipeline-runtime.js') === '9e33790d247c57742bd60222091f683c80299d51c7c428307c8b392f1749bfd9', 'pipeline runtime remains protected');

assert(pkg.scripts['validate:pass51'] === 'node scripts/validate-pass51.mjs', 'package exposes Pass 51 validator');
assert(pkg.scripts['simulate:pass51'] === 'node scripts/simulate-pass51-syphon-pipeline.mjs', 'package exposes Pass 51 Worker pipeline simulation');

console.log(`HUFF Classic Pass 51 validation: ${checks} checks PASS`);
