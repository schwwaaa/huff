import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const index = read('src/index.html');
const syphonModal = index.slice(index.indexOf('<!-- ═══ Syphon Modal'), index.indexOf('<!-- ═══ Spout Modal'));
const worker = read('src/syphon-stream-worker.js');
const main = read('src-tauri/src/main.rs');
const syphon = read('src-tauri/src/syphon.rs');
const pkg = JSON.parse(read('package.json'));

// Pass 49 stability contract: bounded profiles, not arbitrary dimensions/rates.
assert(index.includes('id="syphProfile"'), 'Syphon Quality profile selector exists');
assert(index.includes('60 FPS — 1280×720'), '720p60 Classic profile is present');
assert(index.includes('30 FPS — 1280×720 (safe)'), '720p30 safe profile is present');
assert(!syphonModal.includes('1920×1080'), 'Pass 51 intentionally removes 1080p from Classic Syphon');
assert(!index.includes('id="syphW"'), 'arbitrary Syphon width input removed');
assert(!index.includes('id="syphH"'), 'arbitrary Syphon height input removed');
assert(!index.includes('id="syphFps"'), 'independent Syphon FPS selector removed');
assert(!syphonModal.includes('<option value="24">24</option>'), '24 fps Syphon option removed');
assert(!syphonModal.includes('<option value="15">15</option>'), '15 fps Syphon option removed');

// Explicit lifecycle state machine.
for (const state of ['OFF','STARTING','WAITING','STREAMING','RECOVERING','STOPPING']) {
  assert(index.includes(`${state}: '${state}'`), `lifecycle contains ${state}`);
}
assert(index.includes('let lifecycle = LIFECYCLE.OFF;'), 'single authoritative lifecycle variable starts OFF');
assert(index.includes('function setLifecycle(next)'), 'lifecycle transitions are centralized');
assert(index.includes('function releaseSyphonTransport'), 'transport release path exists');
assert(index.includes('++lifecycleGeneration;'), 'generation invalidates stale async transitions');
assert(index.includes("window.addEventListener('pagehide', shutdownSyphon"), 'pagehide cleanup remains protected');
assert(index.includes("window.addEventListener('beforeunload', shutdownSyphon"), 'beforeunload cleanup remains protected');

// Bootstrap and latest-frame-only safety.
assert(index.includes('const BOOTSTRAP_FPS = 1;'), '1 fps bootstrap publication retained');
assert(index.includes('let frameInFlight = false;'), 'one-frame-in-flight gate retained');
assert(index.includes('transportMode === TRANSPORT.MAIN && frameInFlight'), 'Pass 49 fallback still gates on one frame in flight');
assert(index.includes('bufferedAmount > 0'), 'socket backpressure still drops output opportunities');
assert(index.includes('const ACK_TIMEOUT_MS = 2500;'), 'lost ACK recovery remains bounded');
assert(main.includes('"type": "syphon-ack"'), 'native sender still acknowledges every Syphon frame');
assert(main.includes('role == "syphon-sender"') || main.includes('sender_role == "syphon-sender"'), 'native dedicated Syphon sender role retained');
assert(syphon.includes('const TEXTURE_COUNT: usize = 3;'), 'triple-buffered Metal textures retained');

// Worker readback fallback remains available in the stability contract.
assert(worker.includes('OffscreenCanvas'), 'Worker/OffscreenCanvas processing retained');
assert(worker.includes("message.returnPixels"), 'Worker can return pixels to Pass 49 main-socket fallback');
assert(index.includes("transportMode === TRANSPORT.MAIN"), 'main-socket fallback path remains active');

assert(pkg.scripts['validate:pass49'] === 'node scripts/validate-pass49.mjs', 'package exposes Pass 49 validator');
console.log(`HUFF Classic Pass 49 validation: ${checks} checks PASS`);
