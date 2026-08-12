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

// ---- UI / canonical state / preset compatibility --------------------------
const fluidMatches = html.match(/id=["']solarizeFluidity["']/g) || [];
ok(fluidMatches.length === 1, 'solarizeFluidity occurs exactly once in active UI');
has(html, 'id="solarizeFluidity" type="range" min="0" max="100" step="1" value="100"', 'FLUIDITY range/default');
has(canvas, "'solarizeFluidity'", 'FLUIDITY registered in state/preset surface');
has(canvas, "sourceData.solarizeFluidity = '100'", 'legacy preset migration is exact compatibility value');
has(canvas, 'els.solarizeFluidityVal', 'FLUIDITY label registered');
has(canvas, 's.solarizeFluidity', 'Solarize dispatcher forwards FLUIDITY');
has(read('src/midi/FORMAT.md'), '`solarizeFluidity`', 'MIDI parameter reference documents FLUIDITY');
has(read('src/osc/FORMAT.md'), '`solarizeFluidity`', 'OSC parameter reference documents FLUIDITY');

// ---- Pass 42 compatibility path -------------------------------------------
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
const pass42Exact = {
  _refreshSolarizeMaps: '70182f169ee6f115ef380a5a3f5388eed25b79dd072e3a371d3015d94de1199c',
  _solarizePixelsBytes: '8ba9e8780056c13f465f2d8b59cc92056d913a6e3baf54a590c8b3a215b31b7d',
  _solarizePixelsWords: '0284e0f7df9a757c2683c9fde86f91c53fa9106972d42a4648476a8f00f6eed7',
  _presentSolarizeCache: '68d705ebac1c70e5442af2b1c0900eb7aea3a3ba3f6adc0d4a0f68dee39ba198',
};
for (const [name, expected] of Object.entries(pass42Exact)) {
  const actual = crypto.createHash('sha256').update(extractFunction(effects, name)).digest('hex');
  ok(actual === expected, `Pass 42 exact helper retained: ${name}`);
}
has(effects, "function applySolarize(buf, thresh = 0.5, amount = 1.0, solR = 1.0, solG = 1.0, solB = 1.0, mode = 'threshold', level = 75, soft = 0, invert = false, fluidity = 100)", 'FLUIDITY appended with compatibility default');
has(effects, 'if (fluidity >= 100 || !_solCanvas)', '100 percent bypass branch exists');
has(effects, 'return _solCanvas;', 'compatibility branch presents accepted Solarize target');

// ---- Continuous temporal slew / no new frame gate -------------------------
for (const name of ['_solarizeFluidBlendAlpha','_updateSolarizeFluidity','_presentSolarizeFluidCache']) {
  has(effects, `function ${name}`, `${name} exists`);
}
has(effects, "const alpha60 = Math.exp(Math.log(0.002) * (1 - normalized));", 'logarithmic control mapping');
has(effects, 'return 1 - Math.pow(1 - alpha60, frameScale);', 'time-normalized exponential slew');
has(effects, "_solFluidCanvas = document.createElement('canvas');", 'bounded fluid history is lazily allocated');
has(effects, '_solFluidCtx.drawImage(_solCanvas, 0, 0);', 'current Solarize target continuously leaks into history');
lacks(extractFunction(effects, '_updateSolarizeFluidity'), 'setTimeout(', 'FLUIDITY adds no timer gate');
lacks(extractFunction(effects, '_updateSolarizeFluidity'), 'setInterval(', 'FLUIDITY adds no interval gate');
lacks(extractFunction(effects, '_updateSolarizeFluidity'), '%', 'FLUIDITY adds no every-N-frame modulus gate');
lacks(extractFunction(effects, '_updateSolarizeFluidity'), 'playbackRate', 'FLUIDITY never changes playback speed');
lacks(extractFunction(effects, '_updateSolarizeFluidity'), 'getImageData(', 'FLUIDITY history adds no readback');
lacks(extractFunction(effects, '_updateSolarizeFluidity'), 'putImageData(', 'FLUIDITY history adds no pixel upload');

const solarStart = effects.indexOf('// ─── Solarize');
const solarEnd = effects.indexOf('// ─── Symmetry', solarStart);
const solarSection = effects.slice(solarStart, solarEnd);
ok((solarSection.match(/_solCtx\.getImageData\(/g) || []).length === 1, 'Solarize still has exactly one runtime readback');
ok((solarSection.match(/_solCtx\.putImageData\(/g) || []).length === 1, 'Solarize still has exactly one runtime pixel upload');
has(solarSection, 'const MAX_W = 640;', 'existing 640px Solarize ceiling retained');
has(solarSection, 'const doProcess = (stride === 1)', 'pre-existing overload guard retained, not redesigned');

// ---- Temporal transfer model ----------------------------------------------
function blendAlpha(fluidityPct, dtMs) {
  const fluidity = Math.max(0, Math.min(100, Number(fluidityPct) || 0));
  if (fluidity >= 100) return 1;
  const normalized = fluidity / 100;
  const alpha60 = Math.exp(Math.log(0.002) * (1 - normalized));
  const frameScale = Math.max(0.25, Math.min(6, (Number(dtMs) || (1000 / 60)) / (1000 / 60)));
  return 1 - Math.pow(1 - alpha60, frameScale);
}
const a0 = blendAlpha(0, 1000/60);
const a10 = blendAlpha(10, 1000/60);
const a30 = blendAlpha(30, 1000/60);
const a50 = blendAlpha(50, 1000/60);
const a75 = blendAlpha(75, 1000/60);
const a100 = blendAlpha(100, 1000/60);
ok(a0 > 0, 'FLUIDITY 0 still evolves; not a freeze');
ok(a0 < a10 && a10 < a30 && a30 < a50 && a50 < a75 && a75 < a100, 'response is strictly faster as FLUIDITY increases');
ok(a100 === 1, 'FLUIDITY 100 is mathematically instantaneous');
// Two half-frame integrations should equal one full-frame integration apart
// from floating error, proving the intended time normalization.
const half = blendAlpha(30, (1000/60)/2);
const combined = 1 - (1-half)*(1-half);
ok(Math.abs(combined - a30) < 1e-12, 'temporal response normalizes across half-frame cadence');
ok(a30 > 0.005 && a30 < 0.05, '30 percent occupies strong-viscosity operating range');
ok(a75 > 0.1 && a75 < 0.4, '75 percent occupies light-viscosity operating range');

// ---- Protected Pass 42/native boundaries ----------------------------------
const manifest = read('baseline/pass42-pass43-protected.sha256').trim().split(/\n+/).filter(Boolean);
for (const line of manifest) {
  const [expected, ...parts] = line.trim().split(/\s+/);
  const rel = parts.join(' ');
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
  ok(actual === expected, `protected exact: ${rel}`);
}
has(effects, 'function applyFlowWarp', 'Flow implementation remains present');
has(canvas, "'feedbackEnabled','feedback','persistence'", 'Feedback/Persistence canonical controls unchanged');
ok(pkg.scripts?.['validate:pass43'] === 'node scripts/validate-pass43.mjs', 'package exposes Pass 43 validator');

console.log(`PASS 43 validation: ${checks.toLocaleString()} checks PASS; continuous Solarize FLUIDITY model verified`);
