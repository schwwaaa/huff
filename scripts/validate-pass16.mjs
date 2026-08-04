import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const effectsSource = fs.readFileSync(path.join(root, 'src', 'effects.js'), 'utf8');
const canvasSource = fs.readFileSync(path.join(root, 'src', 'canvas.js'), 'utf8');

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}

// Preserve accepted HUFF Classic boundaries.
check(!canvasSource.includes('_afterRenderFrame'), 'rejected render-boundary scheduler must remain absent');
check(!canvasSource.includes('convertFileSrc('), 'rejected asset-protocol decode path must remain absent');
check(canvasSource.includes('createVideo([currentBlobUrl]'), 'Blob URL + p5 createVideo decoder must remain');
check(canvasSource.includes('requestAnimationFrame(function pump(ts)'), 'mirror must retain an independent animation clock');
check(canvasSource.includes('requestAnimationFrame(_tickTransport)'), 'transport must retain an independent animation clock');
check(canvasSource.includes('function loop() { frames++; report(); requestAnimationFrame(loop); }'), 'profiler must retain an independent animation clock');

// Pass 16 structure.
check(effectsSource.includes('function _solarizePixelsWords'), 'little-endian Uint32 Solarize path must exist');
check(effectsSource.includes('function _solarizePixelsBytes'), 'byte fallback Solarize path must remain');
check(effectsSource.includes('const _solLittleEndian'), 'endianness detection must exist');
check(effectsSource.includes('(packed & 0xff000000)'), 'word path must preserve alpha verbatim');
check(effectsSource.includes("ctx.globalCompositeOperation = 'copy'"), 'Solarize presentation must remain a replacing copy');
check(effectsSource.includes("ctx.imageSmoothingQuality = 'low'"), 'direct scaling must match the old cache-canvas default quality');
check(effectsSource.includes('_presentSolarizeCache(buf.drawingContext, BW, BH)'), 'processed scratch must present directly into gBuf');
check(!/let\s+_solOut\s*[=,]/.test(effectsSource), 'full-resolution Solarize cache canvas must be removed');
check(!effectsSource.includes('_solOutCtx'), 'full-resolution Solarize cache context must be removed');
check(effectsSource.includes('_solOutputW !== BW || _solOutputH !== BH'), 'output-size changes must invalidate the cached result');
check(effectsSource.includes('const doProcess = (stride === 1)'), 'existing adaptive load guard must remain');
check(effectsSource.includes('_refreshSolarizeMaps(amount, solR, solG, solB)'), 'channel lookup refresh must remain parameter-driven');
check(!effectsSource.includes("const key = `${amount}|${solR}|${solG}|${solB}`"), 'per-process map-key string allocation must be removed');

// Profiler-only phase instrumentation.
for (const token of [
  '__huffSolarizeTelemetry',
  "_solProfileAdd('readbackMs'",
  "_solProfileAdd('transformMs'",
  "_solProfileAdd('uploadMs'",
  "_solProfileAdd('presentMs'",
  "'sol read   '",
  "'sol xform  '",
  "'sol upload '",
  "'sol present'",
  "'sol cache  '",
]) check(effectsSource.includes(token) || canvasSource.includes(token), `missing profiler token: ${token}`);
check(effectsSource.includes('const profile = window.__huffProfilerActive === true;'), 'Solarize sub-stage timing must remain profiler-gated');

const lumaR = new Float64Array(256);
const lumaG = new Float64Array(256);
const lumaB = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  lumaR[i] = 0.299 * i;
  lumaG[i] = 0.587 * i;
  lumaB[i] = 0.114 * i;
}

function buildMaps(amount, solR, solG, solB) {
  const r = new Uint8ClampedArray(256);
  const g = new Uint8ClampedArray(256);
  const b = new Uint8ClampedArray(256);
  const a = Math.max(0, Math.min(1, amount));
  for (let i = 0; i < 256; i++) {
    const inverted = i + (255 - i - i) * a;
    r[i] = Math.floor(Math.min(255, Math.max(0, inverted * solR + 0.5)));
    g[i] = Math.floor(Math.min(255, Math.max(0, inverted * solG + 0.5)));
    b[i] = Math.floor(Math.min(255, Math.max(0, inverted * solB + 0.5)));
  }
  return { r, g, b };
}

function oldByteTransform(input, threshold, maps) {
  const pix = new Uint8ClampedArray(input);
  for (let i = 0; i < pix.length; i += 4) {
    const r = pix[i], g = pix[i + 1], b = pix[i + 2];
    const lum = lumaR[r] + lumaG[g] + lumaB[b];
    if (lum > threshold) {
      pix[i] = maps.r[r];
      pix[i + 1] = maps.g[g];
      pix[i + 2] = maps.b[b];
    }
  }
  return pix;
}

function newWordTransform(input, threshold, maps) {
  const pix = new Uint8ClampedArray(input);
  const words = new Uint32Array(pix.buffer, pix.byteOffset, pix.byteLength >>> 2);
  for (let i = 0; i < words.length; i++) {
    const packed = words[i];
    const r = packed & 0xff;
    const g = (packed >>> 8) & 0xff;
    const b = (packed >>> 16) & 0xff;
    const lum = lumaR[r] + lumaG[g] + lumaB[b];
    if (lum > threshold) {
      words[i] = (
        (packed & 0xff000000) |
        maps.r[r] |
        (maps.g[g] << 8) |
        (maps.b[b] << 16)
      ) >>> 0;
    }
  }
  return pix;
}

function fallbackByteTransform(input, threshold, maps) {
  return oldByteTransform(input, threshold, maps);
}

// Verify host endianness before testing the optimized path.
const endianWord = new Uint32Array([0x0a0b0c0d]);
check(new Uint8Array(endianWord.buffer)[0] === 0x0d, 'validator host must be little-endian');

let seed = 0x13579bdf;
function rnd() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
}

const parameterSets = [
  [0, 1, 1, 1],
  [1, 1, 1, 1],
  [0.5, 1, 1, 1],
  [0.85, 1.1, 0.9, 1.2],
  [0.33, 0, 2, 0.5],
  [0.77, 2, 0, 1.37],
];
for (let i = 0; i < 26; i++) {
  parameterSets.push([
    (rnd() % 101) / 100,
    (rnd() % 201) / 100,
    (rnd() % 201) / 100,
    (rnd() % 201) / 100,
  ]);
}

let comparedPixels = 0;
for (const [amount, solR, solG, solB] of parameterSets) {
  const maps = buildMaps(amount, solR, solG, solB);
  const pixels = 32768;
  const input = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < input.length; i++) input[i] = rnd() & 0xff;

  for (const thresholdStep of [0, 1, 17, 40, 50, 73, 99, 100]) {
    const threshold = thresholdStep / 100 * 255;
    const oldOut = oldByteTransform(input, threshold, maps);
    const wordOut = newWordTransform(input, threshold, maps);
    const fallbackOut = fallbackByteTransform(input, threshold, maps);
    check(Buffer.from(wordOut).equals(Buffer.from(oldOut)), `Uint32 mismatch at amount=${amount}, threshold=${thresholdStep}`);
    check(Buffer.from(fallbackOut).equals(Buffer.from(oldOut)), `byte fallback mismatch at amount=${amount}, threshold=${thresholdStep}`);
    comparedPixels += pixels;
  }
}

// Boundary colors and every public threshold step.
const boundaryColors = [];
for (const v of [0, 1, 2, 63, 64, 127, 128, 191, 192, 253, 254, 255]) {
  boundaryColors.push(v, v, v, 0xff);
  boundaryColors.push(v, 255 - v, (v * 37) & 0xff, v);
}
const boundaryInput = new Uint8ClampedArray(boundaryColors);
const boundaryMaps = buildMaps(0.85, 1.1, 0.9, 1.2);
for (let step = 0; step <= 100; step++) {
  const threshold = step / 100 * 255;
  const oldOut = oldByteTransform(boundaryInput, threshold, boundaryMaps);
  const wordOut = newWordTransform(boundaryInput, threshold, boundaryMaps);
  check(Buffer.from(wordOut).equals(Buffer.from(oldOut)), `threshold boundary mismatch at ${step}`);
  comparedPixels += boundaryInput.length / 4;
}

console.log(`Pass 16 validation passed: ${checks.toLocaleString()} checks, ${comparedPixels.toLocaleString()} exact pixel comparisons`);
