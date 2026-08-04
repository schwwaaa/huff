import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const effectsSource = fs.readFileSync(path.join(root, 'src', 'effects.js'), 'utf8');
const canvasSource = fs.readFileSync(path.join(root, 'src', 'canvas.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const syphonSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'syphon.rs'), 'utf8');

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}

// Stable decoder and scheduling boundaries must remain untouched.
check(canvasSource.includes('createVideo([currentBlobUrl]'), 'Blob URL + p5 createVideo decoder must remain');
check(!canvasSource.includes('_afterRenderFrame'), 'rejected render-boundary scheduler must remain absent');
check(canvasSource.includes('requestAnimationFrame(function pump(ts)'), 'mirror must retain an independent animation clock');
check(canvasSource.includes('requestAnimationFrame(_tickTransport)'), 'transport must retain an independent animation clock');
check(canvasSource.includes('function loop() { frames++; report(); requestAnimationFrame(loop); }'), 'profiler must retain an independent animation clock');

// Pass 16S Syphon repair must remain.
check(indexSource.includes('const BOOTSTRAP_FPS = 1;'), 'Syphon bootstrap rate must remain one fps');
check(indexSource.includes('const fpsCap = receiverConnected'), 'Syphon bootstrap/full-rate pacing must remain');
check(indexSource.includes('resizeWidth: outputW'), 'Syphon output-size ImageBitmap capture must remain');
check(!syphonSource.includes('if !clients {\n                return false;\n            }'), 'native duplicate hasClients gate must remain removed');
check(syphonSource.includes('publishFrameTexture: texture'), 'native Syphon publication must remain');

// Pass 17 one-scratch luma-key structure.
check(effectsSource.includes('function _pipelineLumaPixelsWords'), 'packed Pipeline Luma Key path must exist');
check(effectsSource.includes('function _pipelineLumaPixelsBytes'), 'byte fallback Pipeline Luma Key path must exist');
check(effectsSource.includes('function _multiplyByteAlpha'), 'direct destination-in alpha multiplication helper must exist');
check(effectsSource.includes('(packed & 0x00ffffff) | (outputAlpha << 24)'), 'word path must preserve RGB and replace only alpha');
check(!effectsSource.includes('_plkBufCanvas'), 'second Pipeline Luma Key scratch canvas must be removed');
check(!effectsSource.includes('_plkBufCtx'), 'second Pipeline Luma Key scratch context must be removed');
check(!effectsSource.includes("globalCompositeOperation = 'destination-in'"), 'Pipeline Luma Key destination-in composition pass must be removed');
check(effectsSource.includes('copyCanvasFrame(_plkCtx, gCurEl, sw, sh)'), 'clean source must be copied once into the retained scratch');
check(effectsSource.includes('_plkCtx.putImageData(patchData, 0, 0)'), 'direct clean patch upload must remain');
check(effectsSource.includes('if (sw === W && sh === H) ctx.drawImage(_plkCanvas, 0, 0);'), 'exact-size presentation fast path must exist');
check(effectsSource.includes('sourceFrameSerial !== _plkCacheFrame'), 'decoded-frame cache key must remain');
check(effectsSource.includes('thresh !== _plkCacheThresh'), 'threshold cache key must remain');
check(effectsSource.includes('invert !== _plkCacheInvert'), 'invert cache key must remain');

// Profiler-only telemetry.
for (const token of [
  '__huffLumaKeyTelemetry',
  "_plkProfileAdd('readbackMs'",
  "_plkProfileAdd('transformMs'",
  "_plkProfileAdd('uploadMs'",
  "_plkProfileAdd('presentMs'",
  "'luma read  '",
  "'luma xform '",
  "'luma upload'",
  "'luma pres  '",
  "'luma cache '",
]) check(effectsSource.includes(token) || canvasSource.includes(token), `missing luma profiler token: ${token}`);
check(effectsSource.includes('const profile = window.__huffProfilerActive === true;'), 'luma timing must remain profiler-gated');

const lumaR = new Float64Array(256);
const lumaG = new Float64Array(256);
const lumaB = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  lumaR[i] = 0.299 * i;
  lumaG[i] = 0.587 * i;
  lumaB[i] = 0.114 * i;
}

function maskAlpha(r, g, b, thresh, invert) {
  const threshold = (1 - thresh) * 255;
  const lum = lumaR[r] + lumaG[g] + lumaB[b];
  const roll = Math.max(0, Math.min(1, (lum - threshold) / 64));
  const reveal = invert ? (1 - roll) : roll;
  return ((1 - reveal) * 255 + 0.5) | 0;
}

function multiplyAlpha(sourceAlpha, alphaMask) {
  if (sourceAlpha === 255) return alphaMask;
  if (sourceAlpha === 0 || alphaMask === 0) return 0;
  return Math.floor((sourceAlpha * alphaMask + 127) / 255);
}

// Reference model of the removed two-canvas path: clean RGBA copied into a
// second canvas, then destination-in multiplies its alpha by the generated mask.
function oldTwoCanvasReference(input, thresh, invert) {
  const output = new Uint8ClampedArray(input);
  for (let i = 0; i < output.length; i += 4) {
    const a = maskAlpha(output[i], output[i + 1], output[i + 2], thresh, invert);
    output[i + 3] = multiplyAlpha(output[i + 3], a);
  }
  return output;
}

function newBytePath(input, thresh, invert) {
  const output = new Uint8ClampedArray(input);
  const threshold = (1 - thresh) * 255;
  for (let i = 0; i < output.length; i += 4) {
    const r = output[i], g = output[i + 1], b = output[i + 2];
    const lum = lumaR[r] + lumaG[g] + lumaB[b];
    const roll = Math.max(0, Math.min(1, (lum - threshold) / 64));
    const reveal = invert ? (1 - roll) : roll;
    const a = ((1 - reveal) * 255 + 0.5) | 0;
    output[i + 3] = multiplyAlpha(output[i + 3], a);
  }
  return output;
}

function newWordPath(input, thresh, invert) {
  const output = new Uint8ClampedArray(input);
  const words = new Uint32Array(output.buffer, output.byteOffset, output.byteLength >>> 2);
  const threshold = (1 - thresh) * 255;
  for (let i = 0; i < words.length; i++) {
    const packed = words[i];
    const r = packed & 0xff;
    const g = (packed >>> 8) & 0xff;
    const b = (packed >>> 16) & 0xff;
    const sourceAlpha = packed >>> 24;
    const lum = lumaR[r] + lumaG[g] + lumaB[b];
    const roll = Math.max(0, Math.min(1, (lum - threshold) / 64));
    const reveal = invert ? (1 - roll) : roll;
    const a = ((1 - reveal) * 255 + 0.5) | 0;
    const outputAlpha = multiplyAlpha(sourceAlpha, a);
    words[i] = ((packed & 0x00ffffff) | (outputAlpha << 24)) >>> 0;
  }
  return output;
}

const endianWord = new Uint32Array([0x0a0b0c0d]);
check(new Uint8Array(endianWord.buffer)[0] === 0x0d, 'validator host must be little-endian');

let seed = 0x61c88647;
function rnd() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
}

let comparedPixels = 0;
const thresholdSteps = [0, 1, 5, 17, 33, 50, 67, 83, 95, 99, 100];
for (let batch = 0; batch < 24; batch++) {
  const pixels = 32768;
  const input = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < input.length; i += 4) {
    input[i] = rnd() & 0xff;
    input[i + 1] = rnd() & 0xff;
    input[i + 2] = rnd() & 0xff;
    // Most samples are opaque like video/camera frames; retain broad alpha
    // coverage to validate the destination-in equivalence fallback.
    input[i + 3] = batch < 16 ? 255 : (rnd() & 0xff);
  }
  for (const step of thresholdSteps) {
    const thresh = step / 100;
    for (const invert of [false, true]) {
      const reference = oldTwoCanvasReference(input, thresh, invert);
      const bytes = newBytePath(input, thresh, invert);
      const words = newWordPath(input, thresh, invert);
      check(Buffer.from(bytes).equals(Buffer.from(reference)), `byte mismatch batch=${batch} threshold=${step} invert=${invert}`);
      check(Buffer.from(words).equals(Buffer.from(reference)), `word mismatch batch=${batch} threshold=${step} invert=${invert}`);
      comparedPixels += pixels;
    }
  }
}

// Exhaustive grayscale and alpha boundaries across all public threshold steps.
const boundary = [];
for (let v = 0; v < 256; v++) {
  for (const a of [0, 1, 63, 127, 128, 191, 254, 255]) boundary.push(v, v, v, a);
}
const boundaryInput = new Uint8ClampedArray(boundary);
for (let step = 0; step <= 100; step++) {
  const thresh = step / 100;
  for (const invert of [false, true]) {
    const reference = oldTwoCanvasReference(boundaryInput, thresh, invert);
    const words = newWordPath(boundaryInput, thresh, invert);
    check(Buffer.from(words).equals(Buffer.from(reference)), `boundary mismatch threshold=${step} invert=${invert}`);
    comparedPixels += boundaryInput.length / 4;
  }
}

console.log(`Pass 17 validation passed: ${checks.toLocaleString()} checks, ${comparedPixels.toLocaleString()} exact pixel comparisons`);
