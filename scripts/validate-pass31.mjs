import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const hash = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
let checks = 0;
function assert(condition, message) {
  checks++;
  if (!condition) throw new Error(message);
}

const canvas = read('src/canvas.js');
const html = read('src/index.html');
const effects = read('src/effects.js');
const pipeline = read('src/pipeline-runtime.js');

assert(html.includes('id="glitchStrobe"'), 'Glitch STROBE control missing');
assert(html.includes('id="glitchStrobeEvery"'), 'Glitch EVERY control missing');
assert(!html.includes('frameStoreMode'), 'Rejected whole-frame store control returned');
assert(!canvas.includes('_frameStoreGate'), 'Rejected whole-frame store runtime returned');
assert(canvas.includes("'glitchStrobe','glitchStrobeEvery'"), 'Preset registry does not include Glitch strobe controls');
assert(canvas.includes("sourceData.glitchStrobe = false"), 'Legacy presets do not recover to Glitch strobe off');
assert(canvas.includes("sourceData.glitchStrobeEvery = '4'"), 'Legacy preset rate default missing');
assert(canvas.includes('function _shouldApplyGlitchThisRender(state)'), 'Glitch-only gate missing');
assert(canvas.includes('Math.floor(Math.max(0, _vfc) / rate)'), 'Strobe is not based on decoded-frame buckets');
assert(canvas.includes('if (_shouldApplyGlitchThisRender(state))'), 'applyGlitch is not isolated behind the strobe gate');

const emitStart = canvas.indexOf('function _emitGlitchGroup');
const emitEnd = canvas.indexOf('function _emitGlobalMix', emitStart);
const emit = canvas.slice(emitStart, emitEnd);
assert(emit.indexOf('applyGlitch(') < emit.indexOf('applyPipelineLumaKey('), 'Glitch/Luma group order changed');
assert(emit.includes('if (_shouldApplyGlitchThisRender(state))'), 'Glitch call is not conditionally gated');
assert(emit.includes('  }\n  // Luma Key intentionally remains real-time'), 'Luma Key is not outside the Glitch strobe condition');
assert(emit.includes('if (state.lumaKeyOn && lumaMix > 0)'), 'Real-time Pipeline Luma Key dispatch missing');
assert(canvas.includes('Pipeline Luma Key\n// remains live every render frame'), 'Glitch-only scope is not documented in runtime');
assert(canvas.includes("_resetGlitchStrobeGate('source-retired')"), 'Source lifecycle reset missing');
assert(canvas.includes("_resetGlitchStrobeGate('resize')"), 'Resize reset missing');
assert(canvas.includes("_resetGlitchStrobeGate('clear')"), 'Clear reset missing');
assert((canvas.match(/createGraphics\(/g) || []).length === 2, 'Unexpected render-surface allocation detected');

// Model the exact scheduling contract independently.
function modelSequence(steps) {
  const gate = { wasGlitchActive:false, lastEnabled:false, lastRate:4, lastBucket:-1 };
  const out = [];
  for (const step of steps) {
    const active = !!step.active;
    if (!active) {
      gate.wasGlitchActive = false;
      out.push(false);
      continue;
    }
    const enabled = !!step.enabled;
    if (!enabled) {
      gate.wasGlitchActive = true;
      gate.lastEnabled = false;
      gate.lastBucket = -1;
      out.push(true);
      continue;
    }
    const rate = Math.max(1, Math.min(30, Math.trunc(Number(step.rate)) || 4));
    const bucket = Math.floor(Math.max(0, step.vfc) / rate);
    const update = !gate.wasGlitchActive || !gate.lastEnabled || gate.lastRate !== rate || gate.lastBucket !== bucket;
    gate.wasGlitchActive = true;
    gate.lastEnabled = true;
    gate.lastRate = rate;
    if (update) gate.lastBucket = bucket;
    out.push(update);
  }
  return out;
}

assert(JSON.stringify(modelSequence([
  {active:true, enabled:false, vfc:0, rate:4},
  {active:true, enabled:false, vfc:0, rate:4},
  {active:true, enabled:false, vfc:1, rate:4},
])) === JSON.stringify([true,true,true]), 'Strobe-off neutral path does not update Glitch every render');

assert(JSON.stringify(modelSequence([
  {active:true, enabled:true, vfc:0, rate:4},
  {active:true, enabled:true, vfc:0, rate:4},
  {active:true, enabled:true, vfc:1, rate:4},
  {active:true, enabled:true, vfc:3, rate:4},
  {active:true, enabled:true, vfc:4, rate:4},
  {active:true, enabled:true, vfc:7, rate:4},
  {active:true, enabled:true, vfc:8, rate:4},
])) === JSON.stringify([true,false,false,false,true,false,true]), 'Decoded-frame bucket schedule is incorrect');

assert(JSON.stringify(modelSequence([
  {active:true, enabled:true, vfc:8, rate:4},
  {active:false, enabled:true, vfc:8, rate:4},
  {active:true, enabled:true, vfc:8, rate:4},
])) === JSON.stringify([true,false,true]), 'Re-enabling Glitch does not force an immediate update');

assert(JSON.stringify(modelSequence([
  {active:true, enabled:true, vfc:8, rate:4},
  {active:true, enabled:true, vfc:8, rate:5},
])) === JSON.stringify([true,true]), 'Changing the strobe interval does not force an immediate update');

// Protected runtime files must match the Pass 30 manifests exactly.
function readManifest(rel) {
  const map = new Map();
  for (const line of read(rel).trim().split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (match) map.set(match[2], match[1]);
  }
  return map;
}
const pass30Src = readManifest('baseline/pass30-src.sha256');
const pass30Native = readManifest('baseline/pass30-src-tauri.sha256');
for (const rel of ['effects.js','pipeline-runtime.js','capability-instrumentation.js','canvas.html']) {
  assert(hash(`src/${rel}`) === pass30Src.get(rel), `src/${rel} differs from Pass 30`);
}
for (const rel of ['src/main.rs','src/syphon.rs','src/spout.rs']) {
  assert(hash(`src-tauri/${rel}`) === pass30Native.get(rel), `src-tauri/${rel} differs from Pass 30`);
}

assert(effects.includes('function applyGlitch('), 'Pass 22 Glitch implementation missing');
assert(pipeline.includes("CRISP_FINISH_RECIPE_ID = 'crisp-finish'"), 'Pass 30 CRISP FINISH recipe missing');

console.log(`Pass 31 Glitch Strobe Isolation validation passed (${checks} checks).`);
