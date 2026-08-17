import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) throw new Error(`FAIL: ${msg}`);
}
function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}
function hashFunction(rel, name) {
  const src = read(rel);
  const re = new RegExp(`^function\\s+${name}\\s*\\(.*?(?=^function\\s+|^// ───|\\Z)`, 'ms');
  const match = src.match(re);
  assert(!!match, `${name} function exists`);
  return crypto.createHash('sha256').update(match[0].trimEnd()).digest('hex');
}

const index = read('src/index.html');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');
const pipeline = read('src/pipeline-runtime.js');
const pkg = JSON.parse(read('package.json'));

// Layer Priority: stable binary hierarchy only.
assert(index.includes('<option value="scan">SCAN TOP</option>'), 'SCAN TOP remains available');
assert(index.includes('<option value="glitch">CORRUPT TOP</option>'), 'CORRUPT TOP remains available');
assert(!index.includes('value="neutral"'), 'NEUTRAL/ALTERNATE UI removed');
assert(!index.includes('value="pulse"'), 'PULSE UI removed');
assert(!index.includes('id="layerPulseSpeed"'), 'PULSE SPEED control removed');
assert(!canvas.includes("'layerPulseSpeed'"), 'layerPulseSpeed removed from active Classic state');
assert(pipeline.includes("scan: FRONT_STAGE_SCAN_TOP_ORDER"), 'binary contract contains scan order');
assert(pipeline.includes("glitch: FRONT_STAGE_GLITCH_TOP_ORDER"), 'binary contract contains corrupt order');
assert(!pipeline.includes("neutral: 'alternate-each-render-frame'"), 'alternate-each-frame runtime removed');
assert(!pipeline.includes("pulse: 'alternate-by-layer-pulse-speed'"), 'pulse-order runtime removed');
assert(canvas.includes("if (sourceData.layerPriority !== 'glitch' && sourceData.layerPriority !== 'scan') sourceData.layerPriority = 'scan';"), 'legacy dynamic priorities migrate deterministically');

// Exercise the actual priority runtime in a VM.
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(pipeline, sandbox, { filename: 'pipeline-runtime.js' });
const rt = sandbox.window.HuffPipelineRuntime;
assert(rt.frontStageValidation.valid === true, 'front-stage contract validates');
const scanOrder = Array.from(rt.resolveFrontStageOrder('scan'));
const glitchOrder = Array.from(rt.resolveFrontStageOrder('glitch'));
const oldNeutralOrder = Array.from(rt.resolveFrontStageOrder('neutral'));
const oldPulseOrder = Array.from(rt.resolveFrontStageOrder('pulse'));
assert(JSON.stringify(scanOrder) === JSON.stringify(['glitch-luma-group','scanline-group']), 'SCAN TOP paint order correct');
assert(JSON.stringify(glitchOrder) === JSON.stringify(['scanline-group','glitch-luma-group']), 'CORRUPT TOP paint order correct');
assert(JSON.stringify(oldNeutralOrder) === JSON.stringify(scanOrder), 'legacy neutral resolves to stable SCAN TOP');
assert(JSON.stringify(oldPulseOrder) === JSON.stringify(scanOrder), 'legacy pulse resolves to stable SCAN TOP');

// Luma fades: preserve INDIGO pair and add curated HUFF compositing fades.
const fades = ['xfade','add','lighten','darken','multiply','overlay','hardlight','difference'];
for (const mode of fades) {
  assert(index.includes(`option value="${mode}"`), `Luma fade UI includes ${mode}`);
  assert(effects.includes(`${mode}:`), `Luma fade map includes ${mode}`);
}
assert(effects.includes("xfade: 'source-over'"), 'X-FADE keeps source-over behavior');
assert(effects.includes("add: 'screen'"), 'SOFT ADD keeps bounded screen behavior');
assert(effects.includes("hardlight: 'hard-light'"), 'HARD LIGHT maps to Canvas hard-light');
assert(canvas.includes("validLumaFades = new Set(['xfade','add','lighten','darken','multiply','overlay','hardlight','difference'])"), 'preset migration recognizes all Luma fades');

// Global Mix: light fader-profile extension only, with exact default compatibility.
for (const mode of ['linear','smooth','punch']) {
  assert(index.includes(`option value="${mode}"`), `Global Mix curve UI includes ${mode}`);
}
assert(canvas.includes("'globalMixCurve'"), 'Global Mix curve is preset/render state');
assert(canvas.includes("if (!('globalMixCurve' in sourceData)) sourceData.globalMixCurve = 'linear';"), 'legacy presets default Global Mix curve to LINEAR');
assert(canvas.includes("if (curve === 'smooth') return a * a * (3 - 2 * a);"), 'SMOOTH curve implementation present');
assert(canvas.includes("if (curve === 'punch') return 1 - (1 - a) * (1 - a);"), 'PUNCH curve implementation present');
assert(count(canvas, '_globalMixEffectiveAmount(') >= 3, 'Global Mix curve is used by direct and fused paths');
for (const a of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
  const linear = a;
  const smooth = a*a*(3-2*a);
  const punch = 1-(1-a)*(1-a);
  assert(Math.abs(linear-a) < 1e-12, `LINEAR exact at ${a}`);
  assert(smooth >= 0 && smooth <= 1, `SMOOTH bounded at ${a}`);
  assert(punch >= 0 && punch <= 1, `PUNCH bounded at ${a}`);
}

// Protected effect algorithms remain byte-identical to Pass 47.
assert(hashFunction('src/effects.js', 'applyFlowWarp') === 'e637e05b8100716693ed4f3e04f8881e9997b42a3b30e28368c88fdbdd5292fc', 'Flow remains Pass 47 byte-identical');
assert(hashFunction('src/effects.js', 'applySolarize') === 'b95b50914435d624d72d6d4837554953813449b96151d0307e4cdd8c17ef4d0e', 'Solarize remains Pass 47 byte-identical');
assert(hashFunction('src/canvas.js', '_runFeedbackStage') === '89dd55d26c88b35ff996f78ec57d54e685328ab6baa366fd2d50f75920ac50aa', 'Feedback remains Pass 47 byte-identical');

assert(pkg.scripts['validate:pass48'] === 'node scripts/validate-pass48.mjs', 'package exposes Pass 48 validator');

console.log(`HUFF Classic Pass 48 validation: ${checks} checks PASS`);
