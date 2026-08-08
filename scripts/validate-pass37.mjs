import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const assert = (c, m) => { if (!c) throw new Error(m); };
let checks = 0;
const ok = (c, m) => { assert(c, m); checks++; };

const html = read('src/index.html');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');

// ── Semantic UI contract ─────────────────────────────────────────────────────
ok(html.includes('<div class="group-label">Corrupt</div>'), 'Corrupt group missing');
ok(!html.includes('<div class="group-label">Glitch</div>'), 'Old visible Glitch group remains');
ok(!html.includes('<div class="group-label">Clusters</div>'), 'Old separate Clusters group remains');
for (const title of ['Update','Time','Regions','Distribution','Group Shape','Group Move','Patch Move','Composite']) {
  ok(html.includes(`>${title}</div>`), `Corrupt section missing: ${title}`);
}
for (const id of [
  'corruptUpdateMode','corruptHoldFrames','corruptLiveFrames','corruptDistribution',
  'corruptMaskMode','corruptMaskThreshold','corruptMaskSide','corruptMaskStatus','corruptRate'
]) ok(html.includes(`id="${id}"`), `Corrupt control missing: ${id}`);
for (const mode of ['continuous','strobe','multigrab']) ok(html.includes(`<option value="${mode}">`), `Update mode missing: ${mode}`);
for (const layout of ['random','cluster']) ok(html.includes(`<option value="${layout}">`), `Distribution missing: ${layout}`);
ok(html.includes('DIRECTION'), 'Direction label missing');
ok(html.includes('SHAPE HOLD'), 'Shape Hold label missing');
ok(html.includes('HOLLOW'), 'Hollow label missing');
ok(html.includes('MOMENTUM'), 'Momentum label missing');
ok(html.includes('0 uses the automatic noise-driven direction'), 'AUTO direction semantics not described');

// Contextual/delegated controls — INDIGO-inspired progressive disclosure.
ok(canvas.includes("document.querySelectorAll('.cluster-only')"), 'Cluster contextual UI missing');
ok(canvas.includes("document.querySelectorAll('.multigrab-only')"), 'MultiGrab contextual UI missing');
ok(canvas.includes("document.querySelectorAll('.corrupt-stencil-only')"), 'Stencil contextual UI missing');

// ── Update policy isolation ──────────────────────────────────────────────────
ok(canvas.includes("if (mode === 'continuous')"), 'Continuous update mode missing');
ok(canvas.includes("if (mode === 'strobe')"), 'Strobe update mode missing');
ok(canvas.includes("if (mode === 'multigrab')"), 'MultiGrab update mode missing');
ok(canvas.includes('const cycleLen = hold + live;'), 'MultiGrab hold/live cycle missing');
ok(canvas.includes('const phase = decoded % cycleLen;'), 'MultiGrab decoded-frame phase missing');
ok(canvas.includes('const inLiveWindow = phase >= hold;'), 'MultiGrab live window missing');
const emitStart = canvas.indexOf('function _emitGlitchGroup');
const emitEnd = canvas.indexOf('function _emitGlobalMix', emitStart);
const emit = canvas.slice(emitStart, emitEnd);
ok(/if\s*\(glitchUpdated\)\s*\{\s*applyGlitch/.test(emit), 'Corrupt is not isolated behind its update gate');
ok(emit.includes('applyPipelineLumaKey('), 'Luma dispatch missing');
ok(emit.indexOf('applyPipelineLumaKey(') > emit.indexOf('if (glitchUpdated)'), 'Luma is incorrectly gated by Corrupt update mode');

// Deterministic model of update policies.
function gateSequence(mode, frames, rate=4, hold=8, live=2) {
  let was=false, lastMode='continuous', lastRate=4, lastBucket=-1, lastHold=8, lastLive=2;
  const out=[];
  for (const decoded of frames) {
    let update=false;
    if (mode === 'continuous') update=true;
    else if (mode === 'strobe') {
      const bucket=Math.floor(Math.max(0,decoded)/rate);
      update=!was || lastMode!=='strobe' || lastRate!==rate || lastBucket!==bucket;
      lastBucket=update?bucket:lastBucket; lastRate=rate;
    } else if (mode === 'multigrab') {
      const phase=Math.max(0,decoded)%(hold+live);
      const inLive=phase>=hold;
      const entering=!was || lastMode!=='multigrab';
      const timingChanged=lastHold!==hold || lastLive!==live;
      update=entering || timingChanged || inLive;
      lastHold=hold; lastLive=live;
    }
    was=true; lastMode=mode; out.push(update);
  }
  return out;
}
const frames=[0,1,2,3,4,5,6,7,8,9,10,11,12];
ok(gateSequence('continuous',frames).every(Boolean), 'Continuous model does not update every decoded step');
const strobe=gateSequence('strobe',frames,4);
ok(strobe[0] && !strobe[1] && !strobe[2] && !strobe[3] && strobe[4] && strobe[8] && strobe[12], 'Strobe bucket model mismatch');
const mg=gateSequence('multigrab',frames,4,3,2);
ok(mg[0] && !mg[1] && !mg[2] && mg[3] && mg[4] && !mg[5] && !mg[6] && !mg[7] && mg[8] && mg[9], 'MultiGrab hold/live model mismatch');

// ── Stencil process mask ─────────────────────────────────────────────────────
ok(effects.includes('function _corruptStencilAllows('), 'Corrupt stencil eligibility helper missing');
ok(effects.includes('_plkStencilLuma[sy * _plkStencilW + sx]'), 'Corrupt mask does not reuse stored stencil luminance');
const corruptStart = effects.indexOf('function _corruptStencilAllows(');
const flowStart = effects.indexOf('function applyFlowWarp(', corruptStart);
const corruptRegion = effects.slice(corruptStart, flowStart);
ok(!corruptRegion.includes('getImageData('), 'Corrupt stencil mask introduced a synchronous readback');
ok(!corruptRegion.includes('createGraphics('), 'Corrupt introduced a new p5 Graphics buffer');
ok(corruptRegion.includes("corruptMaskMode === 'stencil'"), 'Stencil mode gate missing');
ok(corruptRegion.includes("corruptDistribution"), 'Distribution mode missing from Corrupt runtime');
ok(corruptRegion.includes('addCorruptTarget'), 'Unified target eligibility path missing');

// ── RATE compatibility ───────────────────────────────────────────────────────
// Visible RATE is derived; legacy runtime parameter meanings/ranges remain.
ok(html.includes('id="glitchSpeed" type="range" min="0" max="5"'), 'Legacy glitchSpeed range changed');
ok(html.includes('id="glitchSpeedFine" type="range" min="0" max="10"'), 'Legacy glitchSpeedFine range changed');
ok(html.includes('id="glitchSpeedMul" type="range" min="0" max="10"'), 'Legacy glitchSpeedMul range changed');
ok(canvas.includes('speed * fine * mul * mul'), 'Legacy RATE product contract missing');
ok(canvas.includes("_syncRenderControl('glitchSpeed')"), 'Visible RATE does not synchronize runtime speed');
ok(canvas.includes("_syncRenderControl('glitchSpeedFine')"), 'Visible RATE does not synchronize runtime fine speed');
ok(canvas.includes("_syncRenderControl('glitchSpeedMul')"), 'Visible RATE does not synchronize runtime multiplier');

function knobToRate(k) { k=Math.max(0,Math.min(1,k)); return .5*(10**(4*k)-1); }
function decomposeRate(r) {
  r=Math.max(0,Math.min(5000,r));
  if (r<=5) return [r,1,1];
  if (r<=50) return [5,r/5,1];
  return [5,10,Math.sqrt(r/50)];
}
let rateCases=0;
for (let i=0;i<=1000;i++) {
  const rate=knobToRate(i/1000);
  const [s,f,m]=decomposeRate(rate);
  const actual=s*f*m*m;
  assert(Math.abs(actual-rate) <= 1e-9*Math.max(1,rate), `RATE decomposition mismatch ${rate} vs ${actual}`);
  rateCases++;
}

// ── Legacy preset migration ──────────────────────────────────────────────────
ok(canvas.includes("sourceData.corruptUpdateMode = sourceData.glitchStrobe ? 'strobe' : 'continuous'"), 'Legacy strobe migration missing');
ok(canvas.includes("sourceData.corruptDistribution = sourceData.clusterTiles ? 'cluster' : 'random'"), 'Legacy cluster migration missing');
ok(!canvas.includes('effectiveRate = legacySpeed'), 'Legacy preset speed values are being folded destructively');

// ── Protected runtime boundaries ─────────────────────────────────────────────
// All Pass 36 src files except the intended three browser files must match.
const srcManifest = read('baseline/pass36-src.sha256').trim().split('\n').filter(Boolean);
for (const line of srcManifest) {
  const m=line.match(/^([0-9a-f]{64})\s+(.+)$/); assert(m, `Malformed Pass 36 src line: ${line}`);
  const [,expected,rel]=m;
  if (['src/index.html','src/canvas.js','src/effects.js','src/midi/FORMAT.md','src/osc/FORMAT.md'].includes(rel)) continue;
  const abs=path.join(root,rel);
  ok(fs.existsSync(abs), `Missing protected source file: ${rel}`);
  ok(sha(fs.readFileSync(abs))===expected, `Unexpected protected source change: ${rel}`);
}

// Flow must be byte-identical even though effects.js legitimately changes in Corrupt.
const fStart=effects.indexOf('function applyFlowWarp(');
const fEnd=effects.indexOf('function applySymmetry(', fStart);
ok(fStart>=0 && fEnd>fStart, 'Flow section boundaries missing');
ok(sha(Buffer.from(effects.slice(fStart,fEnd)))==='e2a6aeb2969c1f506dd2467561c550cf7af483c79018a4a501884ff1732402c3', 'Flow implementation changed from Pass 36');

// Pass 36 Pipeline Luma Key remains byte-identical from its section marker to EOF.
const lumaStart=effects.indexOf('// ─── Pipeline Luma Key');
ok(lumaStart>=0, 'Pipeline Luma Key section missing');
ok(sha(Buffer.from(effects.slice(lumaStart)))==='6f3655e25a1a4ac1f820babb6d9f8b96510c7b541828e2ea820e6a15b8a3441e', 'Pass 36 Pipeline Luma Key implementation changed');

// Native tree remains exact Pass 36.
const nativeManifest=read('baseline/pass36-src-tauri.sha256').trim().split('\n').filter(Boolean);
for (const line of nativeManifest) {
  const m=line.match(/^([0-9a-f]{64})\s+(.+)$/); assert(m, `Malformed Pass 36 native line: ${line}`);
  const [,expected,rel]=m;
  const abs=path.join(root,'src-tauri',rel);
  ok(fs.existsSync(abs), `Missing native file: ${rel}`);
  ok(sha(fs.readFileSync(abs))===expected, `Native file changed: ${rel}`);
}

console.log(`Pass 37 validation passed: ${checks.toLocaleString()} structural checks, ${rateCases.toLocaleString()} RATE compatibility cases.`);
