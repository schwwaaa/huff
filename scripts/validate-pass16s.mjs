import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const indexSource = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const syphonSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'syphon.rs'), 'utf8');
const canvasSource = fs.readFileSync(path.join(root, 'src', 'canvas.js'), 'utf8');
const effectsSource = fs.readFileSync(path.join(root, 'src', 'effects.js'), 'utf8');

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}

// Preserve the stable Pass 16 rendering and decode boundaries.
check(canvasSource.includes('createVideo([currentBlobUrl]'), 'Blob URL + p5 createVideo decoder must remain');
check(!canvasSource.includes('_afterRenderFrame'), 'rejected render-boundary scheduler must remain absent');
check(canvasSource.includes('requestAnimationFrame(function pump(ts)'), 'mirror must retain an independent animation clock');
check(canvasSource.includes('requestAnimationFrame(_tickTransport)'), 'transport must retain an independent animation clock');
check(effectsSource.includes('function _solarizePixelsWords'), 'Pass 16 Solarize optimization must remain');

// Syphon bootstrap repair.
check(indexSource.includes('const BOOTSTRAP_FPS = 1;'), 'Syphon bootstrap rate must be one frame per second');
check(indexSource.includes("Publishing a 1 fps bootstrap frame"), 'Syphon UI must describe bootstrap publishing');
check(indexSource.includes('const fpsCap = receiverConnected'), 'Syphon pacing must switch between bootstrap and full rate');
check(indexSource.includes(': BOOTSTRAP_FPS;'), 'no-client pacing must use the bounded bootstrap rate');
check(!indexSource.includes('if (!receiverConnected) return;\n            if (syphWS.bufferedAmount > 0) return;'), 'strict browser-side receiver gate must be removed');
check(indexSource.includes('resizeWidth: outputW'), 'Syphon ImageBitmap capture should request output width');
check(indexSource.includes('resizeHeight: outputH'), 'Syphon ImageBitmap capture should request output height');
check(indexSource.includes('if (!bitmap) bitmap = await createImageBitmap(source);'), 'legacy full-size ImageBitmap fallback must remain');
check(indexSource.includes('bootstrapFrames++'), 'bootstrap publication telemetry must remain');

check(!syphonSource.includes('if !clients {\n                return false;\n            }'), 'native duplicate hasClients gate must be removed');
check(syphonSource.includes('one-frame-per-second bootstrap probe'), 'native bootstrap rationale must be documented');
check(syphonSource.includes('publishFrameTexture: texture'), 'native Syphon publication call must remain');
check(syphonSource.includes('FRAME_COUNT.fetch_add(1'), 'native frame publication counter must remain');

// Verify the pacing policy independently.
function shouldSend(lastTs, ts, receiver, selectedFps) {
  const fps = receiver ? selectedFps : 1;
  return ts - lastTs >= 1000 / fps;
}
check(shouldSend(0, 1000, false, 60), 'no-client bootstrap should publish at one second');
check(!shouldSend(0, 999, false, 60), 'no-client bootstrap must not exceed one fps');
check(shouldSend(0, 1000 / 30, true, 30), 'connected receiver should publish at selected frame rate');
check(!shouldSend(0, 20, true, 30), 'connected receiver should retain selected pacing cap');

console.log(`Pass 16S validation passed: ${checks} checks`);
