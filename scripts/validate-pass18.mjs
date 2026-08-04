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

// Stable decoder and scheduling boundaries remain mandatory.
check(canvasSource.includes('createVideo([currentBlobUrl]'), 'Blob URL + p5 createVideo decoder must remain');
check(!canvasSource.includes('_afterRenderFrame'), 'rejected render-boundary scheduler must remain absent');
check(canvasSource.includes('requestAnimationFrame(function pump(ts)'), 'mirror must retain an independent animation clock');
check(canvasSource.includes('requestAnimationFrame(_tickTransport)'), 'transport must retain an independent animation clock');
check(canvasSource.includes('function loop() { frames++; report(); requestAnimationFrame(loop); }'), 'profiler must retain an independent animation clock');

// Pass 16S Syphon repair remains mandatory.
check(indexSource.includes('const BOOTSTRAP_FPS = 1;'), 'Syphon bootstrap rate must remain one fps');
check(indexSource.includes('const fpsCap = receiverConnected'), 'Syphon bootstrap/full-rate pacing must remain');
check(indexSource.includes('resizeWidth: outputW'), 'Syphon output-size ImageBitmap capture must remain');
check(!syphonSource.includes('if !clients {\n                return false;\n            }'), 'native duplicate hasClients gate must remain removed');
check(syphonSource.includes('publishFrameTexture: texture'), 'native Syphon publication must remain');

// Pass 18 structure.
for (const token of [
  'class GlitchBlitWorkspace',
  'prepareRing(ring, maxBack)',
  'prepareSmear(length, dxUnit, dyUnit, block)',
  'const ringFrames = _glitchBlits.prepareRing(frameRing, maxBack);',
  'const tileSpan = block * (size / 20);',
  'const src       = ringFrames[idx];',
  'ctx.drawImage(src, cx, cy, w, h, dstX, dstY, w, h);',
  'dstX + smearX[s]',
  'dstY + smearY[s]',
  'window.__huffGlitchTelemetry',
  '_glitchProfileFrame(targets.count, smearLen, _glitchBlits.ringRebuilt);',
]) check(effectsSource.includes(token), `missing Pass 18 token: ${token}`);

check(!effectsSource.includes('function drawRingRegion('), 'per-blit helper must be removed');
check(!effectsSource.includes('frameRing.fromEnd(idx)'), 'hot loop must not resolve ring slots per tile');
check(!effectsSource.includes('dstX + Math.round(dxUnit * s * block)'), 'hot loop must not round X smear offsets per tile');
check(!effectsSource.includes('dstY + Math.round(dyUnit * s * block)'), 'hot loop must not round Y smear offsets per tile');
check(canvasSource.includes('this._version = 0;'), 'FrameRing version counter must exist');
check(canvasSource.includes('get version()  { return this._version; }'), 'FrameRing version getter must exist');
check((canvasSource.match(/this\._version\+\+;/g) || []).length >= 3, 'FrameRing mutations must invalidate Glitch ring cache');
for (const token of [
  'function glitchTelemetrySnapshot()',
  "'gl tiles   '",
  "'gl draws   '",
  "'gl ring    '",
]) check(canvasSource.includes(token), `missing Glitch profiler token: ${token}`);

// Minimal exact models of the old and new blit preparation paths.
class RingModel {
  constructor(cap) {
    this._cap = cap;
    this._buf = new Array(cap).fill(null);
    this._head = 0;
    this._size = 0;
    this._version = 0;
    this.fromEndCalls = 0;
  }
  get length() { return this._size; }
  get version() { return this._version; }
  push(value) {
    this._buf[this._head] = value;
    this._head = (this._head + 1) % this._cap;
    if (this._size < this._cap) this._size++;
    this._version++;
  }
  clear() {
    this._head = 0;
    this._size = 0;
    this._version++;
  }
  fromEnd(n) {
    this.fromEndCalls++;
    if (n < 0 || n >= this._size) return null;
    return this._buf[(this._head - 1 - n + this._cap * 2) % this._cap] ?? null;
  }
}

class BlitWorkspaceModel {
  constructor() {
    this.ringVersion = -1;
    this.ringMaxBack = -1;
    this.ringFrames = [null];
    this.smearX = new Int32Array(0);
    this.smearY = new Int32Array(0);
  }
  prepareRing(ring, maxBack) {
    if (this.ringVersion === ring.version && this.ringMaxBack === maxBack) return this.ringFrames;
    this.ringFrames.length = maxBack + 1;
    this.ringFrames[0] = null;
    for (let i = 1; i <= maxBack; i++) this.ringFrames[i] = ring.fromEnd(i);
    this.ringVersion = ring.version;
    this.ringMaxBack = maxBack;
    return this.ringFrames;
  }
  prepareSmear(length, dxUnit, dyUnit, block) {
    const required = length + 1;
    if (this.smearX.length < required) {
      let cap = Math.max(8, this.smearX.length || 0);
      while (cap < required) cap *= 2;
      this.smearX = new Int32Array(cap);
      this.smearY = new Int32Array(cap);
    }
    for (let s = 1; s <= length; s++) {
      this.smearX[s] = Math.round(dxUnit * s * block);
      this.smearY[s] = Math.round(dyUnit * s * block);
    }
  }
}

let seed = 0x9e3779b9;
function rnd() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
}
function rndFloat() { return rnd() / 0xffffffff; }
function rndInt(min, max) { return min + (rnd() % (max - min + 1)); }

function oldOps({ ring, indices, targets, width, height, block, size, smearLen, dxUnit, dyUnit, baseDX, baseDY }) {
  const out = [];
  for (let i = 0; i < targets.length; i++) {
    const cx = targets[i][0];
    const cy = targets[i][1];
    const w = Math.min(block * (size / 20), width - cx);
    const h = Math.min(block * (size / 20), height - cy);
    if (w <= 0 || h <= 0) continue;
    const dstX = Math.max(0, Math.min(width - w, cx + baseDX));
    const dstY = Math.max(0, Math.min(height - h, cy + baseDY));
    const src = ring.fromEnd(indices[i]);
    if (!src) continue;
    out.push([src, cx, cy, w, h, dstX, dstY, w, h]);
    for (let s = 1; s <= smearLen; s++) {
      const sx2 = Math.max(0, Math.min(width - w, dstX + Math.round(dxUnit * s * block)));
      const sy2 = Math.max(0, Math.min(height - h, dstY + Math.round(dyUnit * s * block)));
      out.push([src, cx, cy, w, h, sx2, sy2, w, h]);
    }
  }
  return out;
}

function newOps({ ringFrames, workspace, indices, targets, width, height, block, size, smearLen, dxUnit, dyUnit, baseDX, baseDY }) {
  const out = [];
  const tileSpan = block * (size / 20);
  if (smearLen > 0) workspace.prepareSmear(smearLen, dxUnit, dyUnit, block);
  for (let i = 0; i < targets.length; i++) {
    const cx = targets[i][0];
    const cy = targets[i][1];
    const w = Math.min(tileSpan, width - cx);
    const h = Math.min(tileSpan, height - cy);
    if (w <= 0 || h <= 0) continue;
    const dstX = Math.max(0, Math.min(width - w, cx + baseDX));
    const dstY = Math.max(0, Math.min(height - h, cy + baseDY));
    const src = ringFrames[indices[i]];
    if (!src) continue;
    out.push([src, cx, cy, w, h, dstX, dstY, w, h]);
    for (let s = 1; s <= smearLen; s++) {
      const sx2 = Math.max(0, Math.min(width - w, dstX + workspace.smearX[s]));
      const sy2 = Math.max(0, Math.min(height - h, dstY + workspace.smearY[s]));
      out.push([src, cx, cy, w, h, sx2, sy2, w, h]);
    }
  }
  return out;
}

let comparedDraws = 0;
for (let scenario = 0; scenario < 1200; scenario++) {
  const cap = rndInt(8, 128);
  const ring = new RingModel(cap);
  const fill = rndInt(4, cap);
  for (let i = 0; i < fill; i++) ring.push(`frame-${scenario}-${i}`);
  const maxBack = rndInt(1, Math.max(1, ring.length - 1));
  const width = rndInt(160, 3840);
  const height = rndInt(120, 2160);
  const block = rndInt(1, 128);
  const size = rndInt(1, 200);
  const smearLen = rndInt(0, 64);
  const angle = rndFloat() * Math.PI * 2;
  const dxUnit = Math.cos(angle) * (rndFloat() * 1.5);
  const dyUnit = Math.sin(angle) * (rndFloat() * 1.5);
  const baseDX = rndInt(-256, 256);
  const baseDY = rndInt(-256, 256);
  const targetCount = rndInt(1, 180);
  const targets = new Array(targetCount);
  const indices = new Int32Array(targetCount);
  for (let i = 0; i < targetCount; i++) {
    targets[i] = [rndInt(0, width - 1), rndInt(0, height - 1)];
    indices[i] = rndInt(1, maxBack);
  }

  const workspace = new BlitWorkspaceModel();
  const ringFrames = workspace.prepareRing(ring, maxBack);
  ring.fromEndCalls = 0;
  const old = oldOps({ ring, indices, targets, width, height, block, size, smearLen, dxUnit, dyUnit, baseDX, baseDY });
  const oldLookupCalls = ring.fromEndCalls;
  ring.fromEndCalls = 0;
  const cachedFrames = workspace.prepareRing(ring, maxBack);
  const cacheReuseCalls = ring.fromEndCalls;
  const next = newOps({ ringFrames: cachedFrames, workspace, indices, targets, width, height, block, size, smearLen, dxUnit, dyUnit, baseDX, baseDY });

  check(JSON.stringify(next) === JSON.stringify(old), `draw operation mismatch in scenario ${scenario}`);
  check(cacheReuseCalls === 0, `ring cache should reuse without fromEnd calls in scenario ${scenario}`);
  check(oldLookupCalls === targetCount, `reference path should resolve one ring slot per target in scenario ${scenario}`);
  comparedDraws += old.length;

  // A new decoded frame must invalidate and rebuild the source table.
  ring.push(`frame-${scenario}-new`);
  ring.fromEndCalls = 0;
  workspace.prepareRing(ring, maxBack);
  check(ring.fromEndCalls === maxBack, `ring cache must rebuild after push in scenario ${scenario}`);
}

console.log(`Pass 18 validation passed: ${checks.toLocaleString()} checks, ${comparedDraws.toLocaleString()} exact draw operations compared`);
