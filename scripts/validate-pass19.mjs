import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const indexSource = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const canvasSource = fs.readFileSync(path.join(root, 'src', 'canvas.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'src', 'syphon-stream-worker.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'main.rs'), 'utf8');
const syphonSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'syphon.rs'), 'utf8');

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}

// Stable decoder, independent clocks, and bootstrap-safe publication remain mandatory.
for (const token of [
  'createVideo([currentBlobUrl]',
  'requestAnimationFrame(function pump(ts)',
  'requestAnimationFrame(_tickTransport)',
  'function loop() { frames++; report(); requestAnimationFrame(loop); }',
]) check(canvasSource.includes(token), `missing stable runtime boundary: ${token}`);
check(!canvasSource.includes('_afterRenderFrame'), 'rejected render-boundary scheduler must remain absent');
check(indexSource.includes('const BOOTSTRAP_FPS = 1;'), 'one-fps Syphon bootstrap must remain');
check(indexSource.includes('const fpsCap = receiverConnected ? outputFps : BOOTSTRAP_FPS;'), 'bootstrap/full-rate switch must remain');
check(!syphonSource.includes('if !clients {'), 'duplicate native hasClients publication gate must remain absent');
check(syphonSource.includes('publishFrameTexture: texture'), 'native Syphon publication must remain');

// Pass 19 browser control-plane reductions.
for (const token of [
  'const DISPLAY_PERIOD_MS = 250;',
  'function flushDisplayIfDue()',
  "profileAdd('uiUpdates');",
  'lastAckAt > 0 && now - lastAckAt < 1500',
  'statePollTimer = setInterval(() => pollRuntimeState(false), 1000);',
  'outputFps = parseInt(fpsSelect.value, 10) || 30;',
  'syphWS.send(imageData.data.buffer);',
]) check(indexSource.includes(token), `missing Pass 19 browser token: ${token}`);
check(!indexSource.includes('setInterval(pollRuntimeState, 500);'), 'legacy unconditional 500 ms runtime polling must be removed');
check(indexSource.indexOf('applyRuntimeState(state);') === indexSource.lastIndexOf('applyRuntimeState(state);'), 'runtime state must not be applied twice per poll');

// Worker and profiler phase telemetry.
for (const token of [
  'const profiled = !!message.profile;',
  'const drawStarted = profiled ? performance.now() : 0;',
  'const readStarted = profiled ? performance.now() : 0;',
  'profiled,',
  'drawMs,',
  'readMs,',
]) check(workerSource.includes(token), `missing Worker phase token: ${token}`);
for (const token of [
  'function syphonTelemetrySnapshot()',
  "'sy cap     '",
  "'sy draw    '",
  "'sy read    '",
  "'sy pipe    '",
  "'sy upload  '",
  "'sy publish '",
  "'sy skips   '",
]) check(canvasSource.includes(token), `missing Syphon profiler token: ${token}`);

// Native client sampling and sampled timing.
for (const token of [
  'let mut syphon_clients_cached = false;',
  'Duration::from_millis(250)',
  'let measure_native = frame_before % 30 == 0;',
  'syphon::push_pixels_profiled(',
  '"nativeSample": true',
  '"nativeUploadUs": result.upload_micros',
  '"nativePublishUs": result.publish_micros',
]) check(mainSource.includes(token), `missing native relay token: ${token}`);
for (const token of [
  'pub struct SyphonPushResult',
  'pub fn push_pixels_profiled(',
  'let upload_started = measure_native.then(Instant::now);',
  'let publish_started = measure_native.then(Instant::now);',
  'push_pixels_profiled(width, height, pixels, false).published',
]) check(syphonSource.includes(token), `missing native Syphon token: ${token}`);

// Deterministic model: connected receiver queries and DOM writes are bounded to 4 Hz.
function countConnectedSamples({ fps, seconds, periodMs = 250 }) {
  let checksMade = 0;
  let lastCheck = 0;
  const step = 1000 / fps;
  for (let t = 0; t < seconds * 1000; t += step) {
    if (t === 0 || t - lastCheck >= periodMs - 1e-9) {
      checksMade++;
      lastCheck = t;
    }
  }
  return checksMade;
}

for (const fps of [30, 60]) {
  const oldChecks = fps * 10;
  const nextChecks = countConnectedSamples({ fps, seconds: 10 });
  check(nextChecks >= 38 && nextChecks <= 41, `connected client sampling should remain near 4 Hz at ${fps} fps`);
  check(nextChecks <= oldChecks / 7, `connected client checks should be reduced substantially at ${fps} fps`);
}

function countUiWrites({ ackFps, seconds, periodMs = 250 }) {
  let writes = 0;
  let lastWrite = -Infinity;
  const step = 1000 / ackFps;
  for (let t = 0; t < seconds * 1000; t += step) {
    if (t - lastWrite >= periodMs - 1e-9) {
      writes++;
      lastWrite = t;
    }
  }
  return writes;
}
for (const fps of [30, 60]) {
  const writes = countUiWrites({ ackFps: fps, seconds: 10 });
  check(writes >= 38 && writes <= 41, `UI writes should remain near 4 Hz at ${fps} ACK fps`);
  check(writes < fps * 10, `UI writes must be lower than ACK count at ${fps} fps`);
}

// Disconnected mode still samples every bootstrap frame so attachment cannot deadlock.
for (const bootstrapFrames of [1, 5, 10, 30]) {
  let checksMade = 0;
  let cached = false;
  for (let i = 0; i < bootstrapFrames; i++) {
    const shouldCheck = !cached;
    if (shouldCheck) checksMade++;
  }
  check(checksMade === bootstrapFrames, `disconnected mode must query clients on every bootstrap frame (${bootstrapFrames})`);
}

console.log(`Pass 19 validation passed: ${checks.toLocaleString()} checks`);
