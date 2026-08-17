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
const main = read('src-tauri/src/main.rs');
const pkg = JSON.parse(read('package.json'));

// Pass 50 preferred transport: raw RGBA never returns to the controls WebView.
assert(worker.includes('new WebSocket(transportUrl)'), 'Worker can own the Syphon WebSocket');
assert(worker.includes("role: 'syphon-sender'"), 'Worker sends the established Syphon hello role');
assert(worker.includes('transport.send(buffer);'), 'Worker sends RGBA directly to native socket');
assert(worker.includes("message.type = 'transport-ack'"), 'Worker forwards compact native ACK metadata to main thread');
assert(worker.includes("type: 'transport-state'"), 'Worker forwards compact receiver state to main thread');
assert(index.includes("type: 'enable-transport'"), 'main enables Worker transport explicitly');
assert(index.includes("transportMode = TRANSPORT.WORKER;"), 'main enters worker-direct transport only after open');
assert(index.includes("returnPixels: transportMode === TRANSPORT.MAIN"), 'full-frame Worker→main transfer is restricted to fallback');
assert(index.includes("worker-direct"), 'worker-direct mode is visible in diagnostics');

// Automatic Pass 49 fallback must remain first-class.
assert(index.includes('function activateMainTransport'), 'automatic Pass 49 fallback function exists');
assert(index.includes("worker?.postMessage({ type: 'disable-transport' })"), 'fallback explicitly disables Worker socket ownership');
assert(index.includes('WORKER_TRANSPORT_TIMEOUT_MS = 1800'), 'Worker transport startup has a bounded timeout');
assert(index.includes("activateMainTransport('Worker WebSocket timed out')"), 'timeout falls back rather than hanging');
assert(index.includes("activateMainTransport(message.message || 'Worker WebSocket failed')"), 'runtime Worker socket failure falls back');
assert(index.includes('ensureMainSocket();'), 'main-owned socket recovery remains available');
assert(worker.includes("if (message.returnPixels)"), 'Worker retains Pass 49 pixel return mode');
assert(worker.includes("type: 'pixels'"), 'Worker can transfer pixels only for fallback');

// No frame skipping/sample-hold architecture introduced; the established one-frame gate remains.
assert(index.includes('let frameInFlight = false;'), 'one-frame-in-flight gate retained');
assert(index.includes('const fpsCap = receiverConnected ? outputFps : BOOTSTRAP_FPS;'), 'receiver-aware cadence remains unchanged');
assert(!index.includes('everyNthFrame'), 'no new every-N-frame transport mechanism');
assert(!worker.includes('setInterval('), 'Worker does not create an independent frame clock');

// Telemetry distinguishes direct transport from fallback without per-frame large-message copies.
assert(canvas.includes("'sy send    '"), 'profiler reports Worker WebSocket send call time');
assert(canvas.includes("'sy route   '"), 'profiler reports worker-direct vs main-socket frame counts');
assert(canvas.includes("'sy fall    '"), 'profiler reports transport fallbacks');
assert(index.includes('workerDirectFrames'), 'worker-direct frame telemetry exists');
assert(index.includes('mainSocketFrames'), 'main-socket frame telemetry exists');

// Native protocol/effect engine are deliberately untouched by the transport experiment.
assert(sha('src-tauri/src/syphon.rs') === 'c763c793c6a1e47579625639e229c2565afd27dfd63e62e7825d6ba7ecc3e944', 'native Syphon Metal publisher remains Pass 48 byte-identical');
assert(sha('src-tauri/src/main.rs') === '5eaff1e342ac2fd2b987c7df6855c4712b2a94692f4dd0476afaedc33e09e83c', 'native WebSocket/Syphon protocol remains Pass 48 byte-identical');
assert(sha('src/effects.js') === '7e3317f4fca1e5e44454e561affda95ff2aeef700bb77802e0d593716cf16654', 'effect implementation remains Pass 48 byte-identical');
assert(sha('src/pipeline-runtime.js') === '9e33790d247c57742bd60222091f683c80299d51c7c428307c8b392f1749bfd9', 'pipeline runtime remains Pass 48 byte-identical');

assert(main.includes('raw RGBA pixels only'), 'native socket still accepts fixed-size raw RGBA payloads');
assert(pkg.scripts['validate:pass50'] === 'node scripts/validate-pass50.mjs', 'package exposes Pass 50 validator');
assert(pkg.scripts['simulate:pass50'] === 'node scripts/simulate-pass50-syphon-worker.mjs', 'package exposes Pass 50 Worker simulation');

console.log(`HUFF Classic Pass 50 validation: ${checks} checks PASS`);
