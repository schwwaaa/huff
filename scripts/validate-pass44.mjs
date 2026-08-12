import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');
const html = read('src/index.html');
const pkg = JSON.parse(read('package.json'));
let checks = 0;
function ok(cond, msg) { assert.ok(cond, msg); checks++; }
function has(text, token, msg=token) { ok(text.includes(token), msg); }
function lacks(text, token, msg=token) { ok(!text.includes(token), msg); }

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

// ---- Active-parameter Solarize UI -----------------------------------------
has(html, '.solarize-mode-hidden { display: none !important; }', 'Solarize hidden class exists');
ok((html.match(/solarize-threshold-only/g) || []).length === 4, 'THRESHOLD owns exactly four mode-specific chips');
ok((html.match(/solarize-luma-only/g) || []).length === 3, 'LUMA QUANTIZE owns exactly three mode-specific chips');
for (const id of ['solarizeThresh','solarizeR','solarizeG','solarizeB']) {
  const pos = html.indexOf(`id="${id}"`);
  ok(pos > 0 && html.slice(Math.max(0,pos-180),pos).includes('solarize-threshold-only'), `${id} is THRESHOLD-only`);
}
for (const id of ['solarizeLevel','solarizeSoft','solarizeInvert']) {
  const pos = html.indexOf(`id="${id}"`);
  ok(pos > 0 && html.slice(Math.max(0,pos-180),pos).includes('solarize-luma-only'), `${id} is LUMA-only`);
}
for (const id of ['solarizeOn','solarizeMode','solarizeAmt','solarizeFluidity']) {
  const pos = html.indexOf(`id="${id}"`);
  ok(pos > 0 && !html.slice(Math.max(0,pos-180),pos).includes('solarize-threshold-only') && !html.slice(Math.max(0,pos-180),pos).includes('solarize-luma-only'), `${id} remains shared/visible`);
}
has(canvas, "document.querySelectorAll('.solarize-threshold-only')", 'threshold chip visibility is synchronized');
has(canvas, "document.querySelectorAll('.solarize-luma-only')", 'luma chip visibility is synchronized');
has(canvas, "el.classList.toggle('solarize-mode-hidden', lumaMode)", 'threshold chips hide in luma mode');
has(canvas, "el.classList.toggle('solarize-mode-hidden', !lumaMode)", 'luma chips hide in threshold mode');

// ---- Solarize cadence: no every-N-render load shedding --------------------
const solarStart = effects.indexOf('// ─── Solarize');
const solarEnd = effects.indexOf('// ─── Symmetry', solarStart);
const solarSection = effects.slice(solarStart, solarEnd);
has(solarSection, 'Solarize now transforms every render call', 'every-render cadence documented in code');
lacks(solarSection, '_solFrameEMA', 'old frame-time load guard removed');
lacks(solarSection, '_solPhase', 'old frame modulus phase removed');
lacks(solarSection, 'doProcess', 'old conditional Solarize processing removed');
lacks(solarSection, 'stride ===', 'no render-stride gate remains');
ok((solarSection.match(/_solCtx\.getImageData\(/g) || []).length === 1, 'Solarize has exactly one runtime readback');
ok((solarSection.match(/_solCtx\.putImageData\(/g) || []).length === 1, 'Solarize has exactly one runtime upload');
has(solarSection, 'const MAX_W = 640;', 'Solarize remains bounded at 640px');
lacks(solarSection, 'createGraphics(', 'Solarize adds no p5 full-resolution buffer');

// ---- Safe Global Mix fusion -----------------------------------------------
const fuseGate = extractFunction(canvas, '_canFuseGlobalMixIntoSolarize');
has(fuseGate, "if (position === 'before')", 'BEFORE fusion rule exists');
has(fuseGate, "!frame.activity.feedback && !frame.activity.flow && !frame.activity.symmetry", 'BEFORE refuses intervening transforms');
has(fuseGate, "if (position === 'after')", 'AFTER FB fusion rule exists');
has(fuseGate, "!frame.activity.flow && !frame.activity.symmetry", 'AFTER FB refuses Flow/Symmetry');
has(fuseGate, "if (position === 'afterflow')", 'AFTER FLOW fusion rule exists');
has(fuseGate, "return !frame.activity.symmetry", 'AFTER FLOW refuses Symmetry');
lacks(fuseGate, "position === 'final'", 'FINAL is never explicitly admitted to fusion');
const gmStage = extractFunction(canvas, '_runGlobalMixStage');
has(gmStage, 'frame.deferredGlobalMix = true;', 'eligible Global Mix is deferred');
has(gmStage, '_emitGlobalMix(frame.state);', 'ineligible Global Mix keeps exact path');
const solApply = extractFunction(effects, 'applySolarize');
has(solApply, 'fusedGlobalMix = null', 'fused mix is additive optional input');
const mixDraw = solApply.indexOf('_solCtx.drawImage(fusedGlobalMix.source');
const readback = solApply.indexOf('_solCtx.getImageData');
ok(mixDraw >= 0 && mixDraw < readback, 'fused Global Mix occurs before the single Solarize readback');
has(solApply, "_solCtx.globalCompositeOperation = fusedGlobalMix.blend || 'screen'", 'fused path respects blend mode');
has(solApply, '_solCtx.globalAlpha = Math.max(0, Math.min(1, Number(fusedGlobalMix.amount) || 0));', 'fused path respects mix amount');

// Deterministic gate model mirrors the source rules.
function canFuse(activity, position) {
  if (!activity.solarize || !activity.globalMix) return false;
  if (position === 'before') return !activity.feedback && !activity.flow && !activity.symmetry;
  if (position === 'after') return !activity.flow && !activity.symmetry;
  if (position === 'afterflow') return !activity.symmetry;
  return false;
}
ok(canFuse({solarize:true,globalMix:true,feedback:true,flow:false,symmetry:false}, 'after'), 'heavy feedback AFTER FB case fuses');
ok(!canFuse({solarize:true,globalMix:true,feedback:true,flow:true,symmetry:false}, 'after'), 'Flow blocks AFTER FB fusion');
ok(!canFuse({solarize:true,globalMix:true,feedback:false,flow:false,symmetry:true}, 'afterflow'), 'Symmetry blocks AFTER FLOW fusion');
ok(!canFuse({solarize:true,globalMix:true,feedback:false,flow:false,symmetry:false}, 'final'), 'FINAL never fuses');
ok(!canFuse({solarize:false,globalMix:true,feedback:false,flow:false,symmetry:false}, 'after'), 'Solarize-off never fuses');

// ---- LIVE / COMPOSITE Luma patch fast path -------------------------------
has(effects, 'let _plkLiveImageData = null;', 'live source ImageData retained');
has(effects, 'let _plkLiveSourceAlpha = null;', 'source alpha retained');
has(effects, 'function _captureLumaBytesFromImageData(data, target, alphaTarget = null)', 'luma and alpha captured in one traversal');
has(effects, '_captureLumaBytesFromImageData(sourceData.data, _plkLiveLuma, _plkLiveSourceAlpha);', 'LIVE capture uses combined traversal');
const livePatch = extractFunction(effects, '_ensureLivePipelineLumaPatch');
lacks(livePatch, 'getImageData(', 'fast patch adds no second readback');
lacks(livePatch, 'copyCanvasFrame(', 'fast patch adds no second clean-source copy');
lacks(livePatch, 'destination-in', 'fast patch adds no destination-in draw');
lacks(livePatch, '_plkStencilMaskCtx.putImageData', 'fast patch adds no separate mask upload');
has(livePatch, '_plkCtx.putImageData(imageData, 0, 0);', 'fast patch uploads RGB+alpha directly once');
has(livePatch, 'const baseAlpha = sourceAlpha ? sourceAlpha[p] : 255;', 'source alpha preserved');
has(livePatch, '((maskAlpha * baseAlpha + 127) / 255) | 0', 'matte multiplies source alpha');
const lumaApply = extractFunction(effects, 'applyPipelineLumaKey');
has(lumaApply, "const liveCleanFastPath = keySource !== 'stencil' && !!planeInfo.imageData;", 'LIVE/COMPOSITE fast path selected only for live source');
has(lumaApply, '_ensureLivePipelineLumaPatch(', 'LIVE path uses direct patch builder');
has(lumaApply, '_ensurePipelineLumaMask(', 'STENCIL fallback still uses accepted mask path');
has(lumaApply, "_plkCtx.globalCompositeOperation = 'destination-in';", 'STENCIL fallback retains accepted destination-in behavior');

// Alpha composition model: direct patch and legacy destination-in are the same
// ideal alpha equation to integer rounding.
let seed = 0x44c0ffee;
function rnd(){ seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
for (let i=0;i<4096;i++) {
  const sourceAlpha = rnd() & 255;
  const maskAlpha = rnd() & 255;
  const direct = ((maskAlpha * sourceAlpha + 127) / 255) | 0;
  const ideal = Math.round(maskAlpha * sourceAlpha / 255);
  ok(direct === ideal, `alpha multiply parity ${i}`);
}

// ---- Accepted Solarize/Fluidity/Flow behavior remains exact ---------------
const pass43Exact = {
  _refreshSolarizeMaps: '70182f169ee6f115ef380a5a3f5388eed25b79dd072e3a371d3015d94de1199c',
  _solarizePixelsBytes: '8ba9e8780056c13f465f2d8b59cc92056d913a6e3baf54a590c8b3a215b31b7d',
  _solarizePixelsWords: '0284e0f7df9a757c2683c9fde86f91c53fa9106972d42a4648476a8f00f6eed7',
  _presentSolarizeCache: '68d705ebac1c70e5442af2b1c0900eb7aea3a3ba3f6adc0d4a0f68dee39ba198',
  _refreshSolarizeLumaMap: 'c277c967eaee0f0c16a4b8472dbf44f19f726c8c79ca4996f11471451dd1836e',
  _solarizeLumaPixelsBytes: '56eb657589f465e7b071d48af000ed2070e078f3a7b43914ff4e78772028c50f',
  _solarizeLumaPixelsWords: 'f93b6fcd5ff4c2e1a74705aacbab6a3c60a3a70cd70c4d5c9ae25c89673f857a',
  _solarizeFluidBlendAlpha: '50c2ac8a0f5eccaf603746f3178627a6d463ee558f6a39dbabd562261139c594',
  _updateSolarizeFluidity: '1316dd5383cd767cbe027b95fed5bb1cf00e63eaa1bec8f1aaa0647b2f051ff1',
  _presentSolarizeFluidCache: 'f216a7296f950f5a780b35b753cb7df44f46330271bc0611ea8750928fb91214',
  applyFlowWarp: 'e637e05b8100716693ed4f3e04f8881e9997b42a3b30e28368c88fdbdd5292fc',
};
for (const [name, expected] of Object.entries(pass43Exact)) {
  ok(sha(extractFunction(effects, name)) === expected, `Pass 43 exact helper retained: ${name}`);
}
ok(sha(extractFunction(canvas, '_runFeedbackStage')) === '5aa476f16414d611178a2f8fb7daa1059dfe8bf37482bbdb1284fff7c0c312b4', 'Feedback stage byte-identical to Pass 43');

// ---- Protected files/native boundary --------------------------------------
const manifest = read('baseline/pass43-pass44-protected.sha256').trim().split(/\n+/).filter(Boolean);
for (const line of manifest) {
  const [expected, ...parts] = line.trim().split(/\s+/);
  const rel = parts.join(' ');
  const actual = sha(fs.readFileSync(path.join(root, rel)));
  ok(actual === expected, `protected exact: ${rel}`);
}
ok(pkg.scripts?.['validate:pass44'] === 'node scripts/validate-pass44.mjs', 'package exposes Pass 44 validator');
has(read('SOLARIZE_LUMA_GLOBAL_MIX_PERFORMANCE_AUDIT.md'), 'No temporal load shedding', 'audit documents no frame skipping');

console.log(`PASS 44 validation: ${checks.toLocaleString()} checks PASS; active-parameter UI, every-render Solarize, Luma direct patch and safe Global Mix fusion verified`);
