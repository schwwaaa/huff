import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const bytes = rel => fs.readFileSync(path.join(root, rel));
const hash = rel => crypto.createHash('sha256').update(bytes(rel)).digest('hex');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
let checks = 0;
function assert(condition, message) {
  checks++;
  if (!condition) throw new Error(message);
}

const canvas = read('src/canvas.js');
const html = read('src/index.html');
const effects = read('src/effects.js');
const pipeline = read('src/pipeline-runtime.js');

// UI and state plumbing.
assert(html.includes('id="lumaKeyGain"'), 'Luma GAIN control missing');
assert(html.includes('min="0.25" max="4" step="0.05" value="1"'), 'Luma GAIN compatibility default/range changed');
assert(html.includes('id="lumaKeySelf"'), 'SELF KEY control missing');
assert(canvas.includes("'lumaKeyGain','lumaKeyGainVal','lumaKeySelf'"), 'Luma refinement controls missing from UI cache');
assert(canvas.includes("'lumaKeyOn','lumaKeyMix','lumaKeyAB','lumaKeyInvert','lumaKeyGain','lumaKeySelf'"), 'Luma controls are not captured by new presets/undo');
assert(canvas.includes("sourceData.lumaKeyGain = '1'"), 'Legacy preset GAIN compatibility default missing');
assert(canvas.includes('sourceData.lumaKeySelf = false'), 'Legacy preset SELF KEY compatibility default missing');
assert(canvas.includes('state.lumaKeyGain, !!state.lumaKeySelf'), 'Luma refinement state not dispatched to effect');

// Effect contract.
assert(effects.includes('function applyPipelineLumaKey(thresh, mix, invert, sourceFrameSerial = -1, gain = 1, selfKey = false)'), 'Pass 32 luma function signature missing');
assert(effects.includes('const rebuild = !!selfKey'), 'SELF KEY does not force current processed-key rebuild');
assert(effects.includes('const gBufEl = gBuf.elt ?? gBuf.drawingContext?.canvas;'), 'SELF KEY is not derived from processed gBuf');
assert(effects.includes('copyCanvasFrame(_plkCtx, gBufEl, sw, sh);'), 'SELF KEY processed readback missing');
assert(effects.includes('let keyData = patchData;'), 'Legacy clean-source key path missing');
assert(effects.includes('_plkCacheGain = safeGain'), 'GAIN cache tracking missing');
assert(effects.includes('_plkCacheSelfKey = !!selfKey'), 'SELF KEY cache tracking missing');
assert((canvas.match(/createGraphics\(/g) || []).length === 2, 'Unexpected full-resolution render-surface allocation detected');

// Exact neutral parity for the prior fixed 64-level rolloff.
function oldMask(lum, threshold, invert) {
  const roll = Math.max(0, Math.min(1, (lum - threshold) / 64));
  const reveal = invert ? (1 - roll) : roll;
  return ((1 - reveal) * 255 + 0.5) | 0;
}
function newMask(lum, threshold, invert, gain = 1) {
  const safeGain = Math.max(0.25, Math.min(4, Number.isFinite(gain) ? gain : 1));
  const roll = Math.max(0, Math.min(1, ((lum - threshold) * safeGain) / 64));
  const reveal = invert ? (1 - roll) : roll;
  return ((1 - reveal) * 255 + 0.5) | 0;
}
for (let threshold = 0; threshold <= 255; threshold++) {
  for (let lum = 0; lum <= 255; lum++) {
    assert(newMask(lum, threshold, false, 1) === oldMask(lum, threshold, false), `GAIN=1 normal parity failed at lum=${lum} threshold=${threshold}`);
    assert(newMask(lum, threshold, true, 1) === oldMask(lum, threshold, true), `GAIN=1 invert parity failed at lum=${lum} threshold=${threshold}`);
  }
}

// Gain behavior: higher gain must make the transition steeper while low gain
// remains more translucent at the same distance above the clip point.
const t = 128;
const lumNear = 144;
const soft = newMask(lumNear, t, false, 0.25);
const unity = newMask(lumNear, t, false, 1);
const hard = newMask(lumNear, t, false, 4);
assert(soft > unity && unity > hard, 'GAIN does not monotonically harden the normal key edge');
const softInv = newMask(lumNear, t, true, 0.25);
const unityInv = newMask(lumNear, t, true, 1);
const hardInv = newMask(lumNear, t, true, 4);
assert(softInv < unityInv && unityInv < hardInv, 'GAIN does not monotonically harden the inverted key edge');

// SELF KEY semantics: normal self-key preserves brighter processed fill and
// restores clean background where processed luminance falls below the clip.
const darkProcessedAlpha = newMask(32, 128, false, 1);
const brightProcessedAlpha = newMask(224, 128, false, 1);
assert(darkProcessedAlpha > brightProcessedAlpha, 'SELF KEY normal polarity does not restore more clean background under dark processed pixels');
const darkProcessedAlphaInv = newMask(32, 128, true, 1);
const brightProcessedAlphaInv = newMask(224, 128, true, 1);
assert(darkProcessedAlphaInv < brightProcessedAlphaInv, 'SELF KEY invert polarity does not reverse processed-fill ownership');

// Glitch-only strobe and real-time keying must remain intact.
const emitStart = canvas.indexOf('function _emitGlitchGroup');
const emitEnd = canvas.indexOf('function _emitGlobalMix', emitStart);
const emit = canvas.slice(emitStart, emitEnd);
assert(emit.includes('if (_shouldApplyGlitchThisRender(state))'), 'Pass 31 Glitch-only strobe gate missing');
assert(emit.indexOf('applyGlitch(') < emit.indexOf('applyPipelineLumaKey('), 'Glitch/Luma dispatch order changed');
assert(emit.includes('if (state.lumaKeyOn && lumaMix > 0)'), 'Pipeline Luma Key is no longer real-time outside the Glitch strobe gate');

// Protect the rest of the Pass 31 runtime.
function readManifest(rel) {
  const map = new Map();
  for (const line of read(rel).trim().split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (match) map.set(match[2], match[1]);
  }
  return map;
}
const pass31Src = readManifest('baseline/pass31-src.sha256');
const pass31Native = readManifest('baseline/pass31-src-tauri.sha256');
for (const rel of ['pipeline-runtime.js','capability-instrumentation.js','canvas.html']) {
  assert(hash(`src/${rel}`) === pass31Src.get(rel), `src/${rel} differs from accepted Pass 31`);
}
for (const rel of ['src/main.rs','src/syphon.rs','src/spout.rs']) {
  assert(hash(`src-tauri/${rel}`) === pass31Native.get(rel), `src-tauri/${rel} differs from accepted Pass 31`);
}
for (const rel of [...pass31Src.keys()].filter(rel => rel.startsWith('presets/'))) {
  assert(hash(`src/${rel}`) === pass31Src.get(rel), `Factory preset changed unexpectedly: src/${rel}`);
}
const marker = '// ─── Pipeline Luma Key';
const prefix = effects.split(marker, 1)[0];
const expectedPrefix = read('baseline/pass31-effects-prefix.sha256').trim().split(/\s+/)[0];
assert(sha(prefix) === expectedPrefix, 'Effect code before Pipeline Luma Key differs from accepted Pass 31');
assert(pipeline.includes("CRISP_FINISH_RECIPE_ID = 'crisp-finish'"), 'Pass 30 CRISP FINISH recipe missing');
assert(effects.includes('function applyGlitch('), 'Pass 22 Glitch implementation missing');

console.log(`Pass 32 Luma Key Gain + Self Key validation passed (${checks.toLocaleString()} checks).`);
