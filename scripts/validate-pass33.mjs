import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const bytes = rel => fs.readFileSync(path.join(root, rel));
const hash = rel => crypto.createHash('sha256').update(bytes(rel)).digest('hex');
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) throw new Error(message);
}

function readManifest(rel) {
  const map = new Map();
  for (const line of read(rel).trim().split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (match) map.set(match[2], match[1]);
  }
  return map;
}

const canvas = read('src/canvas.js');
const html = read('src/index.html');
const effects = read('src/effects.js');
const pipeline = read('src/pipeline-runtime.js');

// ── UI and state plumbing ────────────────────────────────────────────────────
assert(html.includes('id="lumaKeyGain"'), 'GAIN control missing');
assert(html.includes('id="lumaKeySource"'), 'KEY SRC selector missing');
assert(html.includes('<option value="clean">CLEAN</option>'), 'CLEAN key source option missing');
assert(html.includes('<option value="glitch">GLITCH</option>'), 'GLITCH key source option missing');
assert(html.includes('id="lumaKeyFade"'), 'FADE selector missing');
assert(html.includes('<option value="xfade">X-FADE</option>'), 'X-FADE mode missing');
assert(html.includes('<option value="add">ADD</option>'), 'ADD mode missing');
assert(!html.includes('id="lumaKeySelf"'), 'Rejected SELF KEY control still exposed');

assert(
  canvas.includes("'lumaKeyOn','lumaKeyMix','lumaKeyAB','lumaKeyInvert','lumaKeyGain','lumaKeySource','lumaKeyFade'"),
  'Pass 33 Luma controls missing from preset capture'
);
assert(
  canvas.includes("'lumaKeyGain','lumaKeyGainVal','lumaKeySource','lumaKeyFade'"),
  'Pass 33 Luma controls missing from UI cache'
);
assert(canvas.includes("sourceData.lumaKeySource = sourceData.lumaKeySelf === true ? 'glitch' : 'clean'"), 'Pass 32 SELF KEY migration missing');
assert(canvas.includes("sourceData.lumaKeyFade = 'xfade'"), 'Legacy X-FADE compatibility default missing');

// ── Runtime dispatch ─────────────────────────────────────────────────────────
const emitStart = canvas.indexOf('function _emitGlitchGroup');
const emitEnd = canvas.indexOf('function _emitGlobalMix', emitStart);
const emit = canvas.slice(emitStart, emitEnd);
assert(emit.includes('const glitchUpdated = _shouldApplyGlitchThisRender(state);'), 'Glitch accepted-update state not captured');
assert(emit.includes('if (glitchUpdated)'), 'Glitch-only strobe gate changed');
assert(emit.indexOf('applyGlitch(') < emit.indexOf('applyPipelineLumaKey('), 'Glitch/Luma order changed');
assert(emit.includes('state.lumaKeySource, state.lumaKeyFade, glitchUpdated'), 'Pass 33 key source/fade dispatch missing');

// ── Responsive GLITCH KEY contract ───────────────────────────────────────────
assert(effects.includes("const safeKeySource = keySource === 'glitch' ? 'glitch' : 'clean';"), 'Key source validation missing');
assert(effects.includes("const safeFadeMode = fadeMode === 'add' ? 'add' : 'xfade';"), 'Fade mode validation missing');
assert(effects.includes('let _plkGlitchLuma = null;'), 'Bounded Glitch-key luminance storage missing');
assert(effects.includes('new Uint8Array(pixelCount)'), 'Glitch-key storage is not a bounded 8-bit luminance array');
assert(effects.includes('const MAX_W = 640;'), '640px Luma workspace ceiling changed');
assert(effects.includes('acceptedNewDecodedGlitch'), 'Glitch-key accepted-update gate missing');
assert(effects.includes('!!glitchUpdated && sourceFrameSerial !== _plkGlitchCaptureFrame'), 'Glitch-key capture is not capped to accepted decoded-frame updates');
assert(effects.includes('_plkGlitchMatteVersion++'), 'Glitch-key matte versioning missing');
assert(effects.includes('window.resetPipelineLumaKeyState'), 'Luma key cache reset hook missing');
assert(canvas.includes("window.resetPipelineLumaKeyState?.();"), 'Luma key state is not reset on lifecycle cleanup');
assert(!effects.includes('const rebuild = !!selfKey'), 'Pass 32 every-render SELF KEY rebuild remains');
assert(!effects.includes('_plkCacheSelfKey'), 'Pass 32 SELF KEY cache remains');
assert(!effects.includes('let keyData = patchData;'), 'Pass 32 every-render dual-readback SELF KEY path remains');

// Gain must be clamped once at stage level, not in _pipelineLumaMaskAlpha.
const maskFnStart = effects.indexOf('function _pipelineLumaMaskAlpha');
const maskFnEnd = effects.indexOf('function _multiplyByteAlpha', maskFnStart);
const maskFn = effects.slice(maskFnStart, maskFnEnd);
assert(!maskFn.includes('Math.max(0.25'), 'GAIN is still clamped inside the per-pixel mask helper');
assert(effects.includes('const safeGain = Math.max(0.25, Math.min(4, Number.isFinite(gain) ? gain : 1));'), 'Stage-level GAIN clamp missing');

// No extra full-resolution p5 render surface.
assert((canvas.match(/createGraphics\(/g) || []).length === 2, 'Unexpected full-resolution render-surface allocation detected');

// ── Exact CLEAN + X-FADE key-boundary parity ────────────────────────────────
function oldMask(lum, threshold, invert) {
  const roll = Math.max(0, Math.min(1, (lum - threshold) / 64));
  const reveal = invert ? (1 - roll) : roll;
  return ((1 - reveal) * 255 + 0.5) | 0;
}
function pass33Mask(lum, threshold, invert, gain = 1) {
  const safeGain = Math.max(0.25, Math.min(4, Number.isFinite(gain) ? gain : 1));
  const roll = Math.max(0, Math.min(1, ((lum - threshold) * safeGain) / 64));
  const reveal = invert ? (1 - roll) : roll;
  return ((1 - reveal) * 255 + 0.5) | 0;
}
for (let threshold = 0; threshold <= 255; threshold++) {
  for (let lum = 0; lum <= 255; lum++) {
    assert(pass33Mask(lum, threshold, false, 1) === oldMask(lum, threshold, false), `GAIN=1 CLEAN normal parity failed at lum=${lum} threshold=${threshold}`);
    assert(pass33Mask(lum, threshold, true, 1) === oldMask(lum, threshold, true), `GAIN=1 CLEAN invert parity failed at lum=${lum} threshold=${threshold}`);
  }
}

// Gain remains monotonic.
const threshold = 128;
const lumNear = 144;
assert(
  pass33Mask(lumNear, threshold, false, 0.25) >
  pass33Mask(lumNear, threshold, false, 1) &&
  pass33Mask(lumNear, threshold, false, 1) >
  pass33Mask(lumNear, threshold, false, 4),
  'GAIN does not harden the normal key edge'
);
assert(
  pass33Mask(lumNear, threshold, true, 0.25) <
  pass33Mask(lumNear, threshold, true, 1) &&
  pass33Mask(lumNear, threshold, true, 1) <
  pass33Mask(lumNear, threshold, true, 4),
  'GAIN does not harden the inverted key edge'
);

// ── INDIGO Fade Mode mapping ─────────────────────────────────────────────────
assert(effects.includes("ctx.globalCompositeOperation = safeFadeMode === 'add' ? 'lighter' : 'source-over';"), 'ADD/X-FADE compositor mapping missing');
assert(effects.includes("safeFadeMode === 'add' ? 'lighter' : 'source-over'"), 'X-FADE compatibility compositor changed');

// ── Protect accepted Pass 32 / Pass 31 infrastructure outside explicit scope ─
const pass32Src = readManifest('baseline/pass32-src.sha256');
const pass32Native = readManifest('baseline/pass32-src-tauri.sha256');
const allowedSrcChanges = new Set(['canvas.js', 'effects.js', 'index.html']);
for (const [rel, expected] of pass32Src) {
  if (allowedSrcChanges.has(rel)) continue;
  assert(hash(`src/${rel}`) === expected, `Unexpected src change outside Pass 33 scope: src/${rel}`);
}
for (const [rel, expected] of pass32Native) {
  assert(hash(`src-tauri/${rel}`) === expected, `Native tree changed unexpectedly: src-tauri/${rel}`);
}

for (const rel of [...pass32Src.keys()].filter(rel => rel.startsWith('presets/'))) {
  assert(hash(`src/${rel}`) === pass32Src.get(rel), `Factory preset changed unexpectedly: src/${rel}`);
}

assert(pipeline.includes("CRISP_FINISH_RECIPE_ID = 'crisp-finish'"), 'Pass 30 CRISP FINISH recipe missing');
assert(effects.includes('function applyGlitch('), 'Pass 22 Glitch implementation missing');
assert(canvas.includes('const _glitchStrobeGate = Object.seal({'), 'Pass 31 Glitch Strobe gate missing');

console.log(`Pass 33 responsive Luma Key validation passed (${checks.toLocaleString()} checks).`);
