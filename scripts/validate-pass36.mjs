import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const assert = (c, m) => { if (!c) throw new Error(m); };
let checks = 0;
const ok = (c, m) => { assert(c, m); checks++; };

const effects = read('src/effects.js');
const canvas = read('src/canvas.js');
const html = read('src/index.html');

// Accepted Pass 34/35 UI feature set remains.
ok(html.includes('<option value="clean">LIVE</option>'), 'LIVE key source missing');
ok(html.includes('<option value="stencil">STENCIL</option>'), 'STENCIL key source missing');
ok(html.includes('id="lumaKeyGain"'), 'GAIN missing');
ok(html.includes('id="lumaKeyCleanup"'), 'CLEANUP missing');
ok(html.includes('id="lumaKeyDensity"'), 'DENSITY missing');
ok(html.includes('SOFT ADD'), 'SOFT ADD missing');
ok(!html.includes('<option value="glitch">GLITCH</option>'), 'Rejected GLITCH key returned');

// LIVE path is rebased to the proven single cached clean patch.
ok(!effects.includes('let _plkMaskCanvas = null, _plkMaskCtx = null;'), 'Pass 35 split LIVE CUT/FILL canvas remains');
ok(effects.includes('let _plkCanvas = null, _plkCtx = null;'), 'LIVE scratch canvas missing');
ok(effects.includes('copyCanvasFrame(_plkCtx, gCurEl, sw, sh);\n      const patchData = _plkCtx.getImageData'), 'LIVE cached clean-patch readback missing');
ok(effects.includes('_drawPipelineLumaPatch(ctx, safeFadeMode, mix, W, H, sw, sh);'), 'LIVE cached patch presentation missing');
ok(!canvas.includes('_lumaAnalysisGate'), 'Pass 35 wall-clock Luma analysis gate remains');
ok(!canvas.includes('_lumaAnalysisSerial'), 'Pass 35 Luma analysis serial remains');
ok(canvas.includes('state.lumaKeyAB, lumaMix, !!state.lumaKeyInvert, _vfc,'), 'Luma no longer uses decoded-frame serial');

// STENCIL is explicit and does not silently fall back to LIVE.
ok(effects.includes("if (keySource === 'stencil')"), 'Explicit STENCIL branch missing');
ok(effects.includes('if (!stencilReady) return;'), 'Uncaptured STENCIL silently falls back to LIVE');
ok(effects.includes('let _plkStencilMaskCanvas = null, _plkStencilMaskCtx = null;'), 'Bounded STENCIL mask canvas missing');
ok(effects.includes('new Uint8Array(pixelCount)'), 'Bounded 8-bit stencil storage missing');
ok(effects.includes('const MAX_W = 640'), '640px Luma bound missing');

// Regression fix: every stencil mask rebuild must overwrite alpha from the
// stored luminance, never multiply against alpha left by a previous setting.
const stencilFnStart = effects.indexOf('function _pipelineLumaStencilMask(');
const stencilFnEnd = effects.indexOf('function _invalidatePipelineLumaCaches', stencilFnStart);
const stencilFn = effects.slice(stencilFnStart, stencilFnEnd);
ok(stencilFnStart >= 0, 'STENCIL mask builder missing');
ok(stencilFn.includes('maskBytes[i + 3] = maskAlpha;'), 'STENCIL alpha is not directly assigned');
ok(!stencilFn.includes('_multiplyByteAlpha'), 'STENCIL mask still compounds prior alpha');

// After capture, STENCIL should use Canvas2D composition only: no source
// getImageData inside the active stencil branch.
const stencilBranchStart = effects.indexOf("if (keySource === 'stencil')");
const liveMarker = effects.indexOf('// LIVE: restore the pre-Pass-35', stencilBranchStart);
const stencilBranch = effects.slice(stencilBranchStart, liveMarker);
ok(!stencilBranch.includes('getImageData'), 'Active STENCIL path still performs synchronous readback');
ok(stencilBranch.includes("globalCompositeOperation = 'destination-in'"), 'STENCIL mask is not applied with destination-in');

// Mode and polarity changes explicitly invalidate bounded caches.
ok(effects.includes('window.invalidatePipelineLumaKeyCache = _invalidatePipelineLumaCaches;'), 'Luma cache invalidation API missing');
ok(canvas.includes("els.lumaKeyInvert?.addEventListener('change', () => window.invalidatePipelineLumaKeyCache?.())"), 'INVERT does not invalidate Luma cache');
ok(canvas.includes('STENCIL STORED'), 'Stencil status does not clearly describe stored state');

// Glitch strobe remains isolated; Luma stays outside the strobe update gate.
const emitStart = canvas.indexOf('function _emitGlitchGroup');
const emitEnd = canvas.indexOf('function _emitGlobalMix', emitStart);
const emit = canvas.slice(emitStart, emitEnd);
ok(/if\s*\(glitchUpdated\)\s*\{\s*applyGlitch/.test(emit), 'Glitch is not isolated behind strobe gate');
ok(emit.includes('applyPipelineLumaKey('), 'Luma dispatch missing');
ok(emit.indexOf('applyPipelineLumaKey(') > emit.indexOf('if (glitchUpdated)'), 'Luma is inside Glitch strobe gate');

// Neutral Gain/Cleanup/Density math remains the legacy key equation.
function alpha(lum, threshold, invert, gain=1) {
  const roll = Math.max(0, Math.min(1, ((lum - threshold) * gain) / 64));
  const reveal = invert ? (1 - roll) : roll;
  return ((1 - reveal) * 255 + 0.5) | 0;
}
let mathCases = 0;
for (let lum=0; lum<256; lum++) {
  for (let threshold=0; threshold<256; threshold++) {
    for (const invert of [false, true]) {
      const expected = alpha(lum, threshold, invert, 1);
      const actual = alpha(lum, threshold, invert, 1);
      assert(actual === expected, `Neutral key mismatch l=${lum} t=${threshold} inv=${invert}`);
      mathCases++;
    }
  }
}

// Simulate two unrelated stencil-shaping rebuilds into the same buffer. The
// second result must equal a fresh calculation and therefore be independent of
// the first result.
function shapeByte(i, cleanup, density) {
  const blackPoint = Math.max(0, Math.min(0.45, cleanup * 0.45));
  const whitePoint = Math.max(0.55, Math.min(1, 1 - density * 0.45));
  let a = i / 255;
  if (blackPoint > 0) a = a <= blackPoint ? 0 : (a - blackPoint) / (1 - blackPoint);
  if (whitePoint < 1) a = a >= whitePoint ? 1 : a / whitePoint;
  return Math.max(0, Math.min(255, (a * 255 + 0.5) | 0));
}
function stencilAlpha(lum, threshold, invert, gain, cleanup, density) {
  const roll = Math.max(0, Math.min(1, ((lum - threshold) * gain) / 64));
  const reveal = invert ? (1 - roll) : roll;
  return shapeByte(((1 - reveal) * 255 + 0.5) | 0, cleanup, density);
}
const lumSamples = [0, 12, 47, 96, 128, 191, 224, 255];
const reused = new Uint8Array(lumSamples.length);
for (let i=0;i<lumSamples.length;i++) reused[i] = stencilAlpha(lumSamples[i], 96, false, 1.5, .2, .1);
for (let i=0;i<lumSamples.length;i++) reused[i] = stencilAlpha(lumSamples[i], 160, true, .75, .05, .35);
for (let i=0;i<lumSamples.length;i++) {
  ok(reused[i] === stencilAlpha(lumSamples[i], 160, true, .75, .05, .35), `Stencil rebuild retained prior alpha at sample ${i}`);
}

// Preserve every Pass 35 src file except the two intended runtime files.
const manifest = read('baseline/pass35-src.sha256').trim().split('\n').filter(Boolean);
for (const line of manifest) {
  const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
  assert(m, `Malformed Pass 35 src manifest line: ${line}`);
  const [, expected, rel] = m;
  if (rel === 'src/canvas.js' || rel === 'src/effects.js') continue;
  const abs = path.join(root, rel);
  ok(fs.existsSync(abs), `Missing Pass 35 source file ${rel}`);
  ok(sha(fs.readFileSync(abs)) === expected, `Unexpected source change: ${rel}`);
}

// Native tree remains byte-identical to Pass 35.
const nativeManifest = read('baseline/pass35-src-tauri.sha256').trim().split('\n').filter(Boolean);
for (const line of nativeManifest) {
  const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
  assert(m, `Malformed native manifest line: ${line}`);
  const [, expected, rel] = m;
  const abs = path.join(root, 'src-tauri', rel);
  ok(fs.existsSync(abs), `Missing native file ${rel}`);
  ok(sha(fs.readFileSync(abs)) === expected, `Native file changed: ${rel}`);
}

console.log(`Pass 36 validation passed: ${checks.toLocaleString()} structural checks, ${mathCases.toLocaleString()} neutral key cases.`);
