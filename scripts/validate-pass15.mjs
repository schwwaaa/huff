import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const canvasSource = fs.readFileSync(path.join(root, 'src', 'canvas.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'src', 'mirror-encoder-worker.js'), 'utf8');

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}

// Preserve the stable 12R/13S scheduling and decode boundaries.
check(!canvasSource.includes('_afterRenderFrame'), 'rejected render-boundary scheduler must remain absent');
check(!canvasSource.includes('convertFileSrc('), 'rejected asset-protocol decode path must remain absent');
check(canvasSource.includes('createVideo([currentBlobUrl]'), 'Blob URL + p5 createVideo decoder must remain');
check(canvasSource.includes('requestAnimationFrame(function pump(ts)'), 'mirror must retain an independent animation clock');
check(canvasSource.includes('requestAnimationFrame(_tickTransport)'), 'transport must retain an independent animation clock');
check(canvasSource.includes('function loop() { frames++; report(); requestAnimationFrame(loop); }'), 'profiler must retain an independent animation clock');

// Pass 15 structural checks.
check(canvasSource.includes('function mirrorTargetSize(cnv)'), 'mirror target-size cache must exist');
check(canvasSource.includes('resizeWidth: target.width'), 'bounded ImageBitmap resize width must be requested');
check(canvasSource.includes('resizeHeight: target.height'), 'bounded ImageBitmap resize height must be requested');
check(canvasSource.includes("resizeQuality: 'low'"), 'fast preview resize quality must be explicit');
check(canvasSource.includes('resizedBitmapCapture = false'), 'unsupported/ignored resize must disable the optimized path');
check(canvasSource.includes('bitmap = await createImageBitmap(cnv);'), 'legacy full-size ImageBitmap fallback must remain');
check(canvasSource.includes('width: target.width'), 'worker must receive the final bounded width');
check(canvasSource.includes('height: target.height'), 'worker must receive the final bounded height');
check(canvasSource.includes('profile: window.__huffProfilerActive'), 'worker timing must remain profiler-gated');
check(workerSource.includes('if (bitmap.width === width && bitmap.height === height) ctx.drawImage(bitmap, 0, 0);'), 'worker must use exact-size bitmap copy when pre-sized');
check(workerSource.includes('else ctx.drawImage(bitmap, 0, 0, width, height);'), 'worker must retain legacy full-size scaling fallback');
check(workerSource.includes('const profile = msg.profile === true;'), 'worker telemetry must be disabled while profiler is hidden');
check(canvasSource.includes("'mir cap    '"), 'capture timing must be visible in profiler');
check(canvasSource.includes("'mir enc    '"), 'encode timing must be visible in profiler');
check(canvasSource.includes("'mir stage  '"), 'scaled/full capture counts must be visible in profiler');

function targetSize(sw, sh, maxW = 1280, maxH = 1280) {
  sw = Math.max(1, sw | 0);
  sh = Math.max(1, sh | 0);
  const scale = Math.min(1, maxW / sw, maxH / sh);
  return {
    width: Math.max(1, Math.round(sw * scale)),
    height: Math.max(1, Math.round(sh * scale)),
  };
}

const expected = [
  [640, 360, 640, 360],
  [1280, 720, 1280, 720],
  [1920, 1080, 1280, 720],
  [2560, 1440, 1280, 720],
  [3840, 2160, 1280, 720],
  [1080, 1920, 720, 1280],
  [4096, 2160, 1280, 675],
];
for (const [sw, sh, ew, eh] of expected) {
  const got = targetSize(sw, sh);
  check(got.width === ew && got.height === eh, `target size mismatch for ${sw}x${sh}`);
}

// Model the optimized capture compatibility behavior. The first unsupported or
// ignored resize permanently reuses the proven full-bitmap path.
async function modeledCapture(createBitmap, state, source, target) {
  const needsScale = source.width !== target.width || source.height !== target.height;
  let bitmap = null;
  let mode = 'full';
  if (needsScale && state.resized) {
    try {
      bitmap = await createBitmap(source, 0, 0, source.width, source.height, {
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: 'low',
      });
      if (bitmap.width !== target.width || bitmap.height !== target.height) {
        state.resized = false;
      } else {
        mode = 'scaled';
      }
    } catch {
      state.resized = false;
    }
  }
  if (!bitmap) bitmap = await createBitmap(source);
  return { bitmap, mode };
}

{
  const calls = [];
  const state = { resized: true };
  const createBitmap = async (...args) => {
    calls.push(args);
    const opts = args.at(-1);
    return opts?.resizeWidth ? { width: opts.resizeWidth, height: opts.resizeHeight } : { width: 1920, height: 1080 };
  };
  const result = await modeledCapture(createBitmap, state, { width: 1920, height: 1080 }, { width: 1280, height: 720 });
  check(result.mode === 'scaled', 'supported resize path must produce bounded bitmap');
  check(calls.length === 1, 'supported resize path must require one bitmap capture');
  check(state.resized === true, 'supported resize path must remain enabled');
}

{
  const calls = [];
  const state = { resized: true };
  const createBitmap = async (...args) => {
    calls.push(args);
    if (args.length > 1) throw new Error('options unsupported');
    return { width: 1920, height: 1080 };
  };
  const first = await modeledCapture(createBitmap, state, { width: 1920, height: 1080 }, { width: 1280, height: 720 });
  check(first.bitmap.width === 1920, 'unsupported resize must fall back to full bitmap in the same frame');
  check(state.resized === false, 'unsupported resize must disable repeated option attempts');
  const before = calls.length;
  await modeledCapture(createBitmap, state, { width: 1920, height: 1080 }, { width: 1280, height: 720 });
  check(calls.length === before + 1, 'subsequent captures must use only the legacy path');
}

{
  const state = { resized: true };
  const createBitmap = async (...args) => ({ width: 1920, height: 1080 });
  const result = await modeledCapture(createBitmap, state, { width: 1920, height: 1080 }, { width: 1280, height: 720 });
  check(result.mode === 'full', 'ignored resize options must be treated as full capture');
  check(state.resized === false, 'ignored resize options must disable optimized capture');
}

// Quantify the raw pixel-transfer reduction without claiming runtime speedup.
function pixelReduction(sw, sh) {
  const target = targetSize(sw, sh);
  return 1 - (target.width * target.height) / (sw * sh);
}
check(Math.abs(pixelReduction(1920, 1080) - 5 / 9) < 1e-12, '1080p bounded capture reduction must be 55.56%');
check(Math.abs(pixelReduction(3840, 2160) - 8 / 9) < 1e-12, '4K bounded capture reduction must be 88.89%');

console.log(`Pass 15 validation passed: ${checks.toLocaleString()} checks`);
