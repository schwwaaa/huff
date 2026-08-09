import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const assert = (c, m) => { if (!c) throw new Error(m); };
let checks = 0;
const ok = (c, m) => { assert(c, m); checks++; };

const pass22 = spawnSync(process.execPath, ['scripts/validate-pass22.mjs'], { cwd: root, encoding: 'utf8' });
if (pass22.status !== 0) {
  process.stderr.write(pass22.stdout || '');
  process.stderr.write(pass22.stderr || '');
  throw new Error('Pass 22 inherited Flow/Scanline validation failed');
}

const html = read('src/index.html');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');
const pipeline = read('src/pipeline-runtime.js');

function extractFunction(text, name) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  assert(start >= 0, `Missing function: ${name}`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`Unterminated function: ${name}`);
}

// ── Protected Pass 39M behavior ─────────────────────────────────────────────
ok(sha(Buffer.from(effects)) === '2bafe602c11d121da981dbbef09fc003b4ff9472571db099a22f9f56b8298230', 'effects.js changed; Corrupt/Luma/Flow algorithm body should remain Pass 39M exact');
ok(sha(Buffer.from(pipeline)) === 'f5c80efe0c052fbdac5ddc6b14c91b23d531fff543929fd4d99e7e37757a6188', 'pipeline-runtime.js changed');
ok(sha(Buffer.from(extractFunction(canvas, '_runPersistentDecayStage'))) === '630c8d59439e10a43e09fdb9baa9be8e364b460204e43baec5936e76fac5ef0d', 'PERSISTENCE stage changed');
ok(sha(Buffer.from(extractFunction(canvas, '_runFeedbackStage'))) === '5aa476f16414d611178a2f8fb7daa1059dfe8bf37482bbdb1284fff7c0c312b4', 'Feedback merge behavior changed');
ok(sha(Buffer.from(extractFunction(canvas, '_shouldApplyFeedbackTransformThisRender'))) === '071bc83f0fceaef3cdca0883c41a2788cac5121cd0b27cec6de7d87638eadde6', 'Feedback Strobe gate changed');

// ── Explicit RANDOM / CLUSTER clocks ────────────────────────────────────────
ok(html.includes('<label>RANDOM SPEED</label>'), 'RANDOM SPEED label missing');
ok(html.includes('class="ctrl random-speed-only"'), 'RANDOM SPEED contextual control missing');
ok(html.includes('<label>CLUSTER SPEED</label>'), 'CLUSTER SPEED label missing');
ok(html.includes('class="ctrl cluster-speed-only"'), 'CLUSTER SPEED contextual control missing');
ok(html.includes('Independent of CLUSTER SPEED'), 'RANDOM SPEED independence description missing');
ok(html.includes('Independent of RANDOM SPEED'), 'CLUSTER SPEED independence description missing');
ok(canvas.includes("document.querySelectorAll('.random-speed-only')"), 'RANDOM SPEED contextual visibility missing');
ok(canvas.includes("document.querySelectorAll('.cluster-speed-only')"), 'CLUSTER SPEED contextual visibility missing');
ok(canvas.includes("'CLUSTER CLOCK ACTIVE' : 'RANDOM CLOCK ACTIVE'"), 'Active Corrupt clock status missing');

// Active mode owns autonomous Corrupt phase/XYZ time.
ok(canvas.includes('const activeCorruptSpeed = clusteredCorrupt ? clusterMasterSpeed : corruptSpeed;'), 'Active mode speed selection missing');
ok(canvas.includes('_corruptClock += activeCorruptSpeed * corruptDt * 60;'), 'Active mode speed does not drive Corrupt clock');
ok(canvas.includes('nPhaseX += density * activeCorruptSpeed * 0.01;'), 'Active mode speed does not drive Corrupt phase X');
ok(canvas.includes('nPhaseY += density * activeCorruptSpeed * 0.011;'), 'Active mode speed does not drive Corrupt phase Y');
ok(canvas.includes('moveX * activeCorruptSpeed * corruptDt'), 'Active mode speed does not drive Patch MOVE X');
ok(canvas.includes('moveY * activeCorruptSpeed * corruptDt'), 'Active mode speed does not drive Patch MOVE Y');
ok(canvas.includes('moveZ * activeCorruptSpeed * corruptDt'), 'Active mode speed does not drive Patch MOVE Z');
ok(canvas.includes('if (clusteredCorrupt) _corruptMotion.clusterTimeSec += clusterMasterSpeed * corruptDt;'), 'Cluster clock still advances while Clusters are disabled');

// ── CONTINUOUS speed = visible update rate ──────────────────────────────────
const gateSource = extractFunction(canvas, '_shouldApplyGlitchThisRender');
ok(gateSource.includes("const rawSpeed = clustered ? Number(state.clusterMasterSpeed) : Number(state.corruptSpeed);"), 'Continuous gate does not select independent RANDOM/CLUSTER speed');
ok(gateSource.includes('if (speed <= 0)'), '0x hold branch missing');
ok(gateSource.includes('gate.continuousAccumulator += speed * dt * 60;'), 'Sub-1x slow-evolution accumulator missing');
ok(gateSource.includes('if (speed >= 1)'), '1x+ established-cadence branch missing');
ok(gateSource.includes('previous "0x still looks full-speed" behavior'), 'Regression rationale missing from source');

// Execute the real extracted gate with mocked globals to verify user-reported sequence.
const context = {
  window: { HUFF_CORRUPT_MOTION: { dt: 1/60 } },
  _vfc: 0,
  _glitchStrobeRate: v => Math.max(1, Math.min(30, Math.trunc(Number(v)) || 4)),
  _corruptFrameCount: (v, fallback, max) => Math.max(1, Math.min(max, Math.trunc(Number(v)) || fallback)),
  _glitchStrobeGate: {
    wasGlitchActive:false, lastMode:'continuous', lastRate:4, lastHold:8, lastLive:2,
    lastBucket:-1, lastCycle:-1, lastContinuousSpeed:1, lastClustered:false,
    continuousAccumulator:0, updates:0, heldRenders:0, resets:0, lastResetReason:'test'
  }
};
vm.createContext(context);
vm.runInContext(`${gateSource}; this.gateFn = _shouldApplyGlitchThisRender;`, context);
const resetGate = () => Object.assign(context._glitchStrobeGate, {
  wasGlitchActive:false, lastMode:'continuous', lastRate:4, lastHold:8, lastLive:2,
  lastBucket:-1, lastCycle:-1, lastContinuousSpeed:1, lastClustered:false,
  continuousAccumulator:0, updates:0, heldRenders:0
});
const baseState = { corruptOn:true, corruptUpdateMode:'continuous', clusterTiles:false, corruptSpeed:1, clusterMasterSpeed:1 };

resetGate();
ok(context.gateFn({...baseState, corruptSpeed:0}) === true, 'RANDOM 0x should render one state when entered');
ok(context.gateFn({...baseState, corruptSpeed:0}) === false, 'RANDOM 0x should hold after initial state');
ok(context.gateFn({...baseState, corruptSpeed:0}) === false, 'RANDOM 0x should remain held');

resetGate();
ok(context.gateFn({...baseState, corruptSpeed:0.25}) === true, 'RANDOM 0.25x should render immediately on entry');
ok(context.gateFn({...baseState, corruptSpeed:0.25}) === false, 'RANDOM 0.25x should hold between updates #1');
ok(context.gateFn({...baseState, corruptSpeed:0.25}) === false, 'RANDOM 0.25x should hold between updates #2');
ok(context.gateFn({...baseState, corruptSpeed:0.25}) === false, 'RANDOM 0.25x should hold between updates #3');
ok(context.gateFn({...baseState, corruptSpeed:0.25}) === true, 'RANDOM 0.25x should update at slowed cadence');

resetGate();
const clusterZero = {...baseState, clusterTiles:true, corruptSpeed:4, clusterMasterSpeed:0};
ok(context.gateFn(clusterZero) === true, 'CLUSTER 0x should render one state when entered even if RANDOM SPEED is 4x');
ok(context.gateFn(clusterZero) === false, 'CLUSTER 0x should hold independently from RANDOM SPEED');

resetGate();
const randomZeroClusterFast = {...baseState, clusterTiles:false, corruptSpeed:0, clusterMasterSpeed:4};
ok(context.gateFn(randomZeroClusterFast) === true, 'RANDOM 0x should render one state when entered even if CLUSTER SPEED is 4x');
ok(context.gateFn(randomZeroClusterFast) === false, 'RANDOM 0x should hold independently from CLUSTER SPEED');

// Switching Clusters on/off must switch clocks immediately, which reproduces the user's exact failure path.
resetGate();
ok(context.gateFn({...baseState, clusterTiles:true, clusterMasterSpeed:1}) === true, 'Cluster mode entry failed');
ok(context.gateFn({...baseState, clusterTiles:false, corruptSpeed:0}) === true, 'Cluster OFF -> RANDOM 0x should establish one held Random state');
ok(context.gateFn({...baseState, clusterTiles:false, corruptSpeed:0}) === false, 'Cluster OFF -> RANDOM 0x should then hold');

// Explicit STROBE remains an explicit decoded-frame timing policy, not silently redefined by master speed.
resetGate();
context._vfc = 0;
const strobeZero = {...baseState, corruptUpdateMode:'strobe', corruptSpeed:0, glitchStrobeEvery:4};
ok(context.gateFn(strobeZero) === true, 'STROBE should update when entering');
ok(context.gateFn(strobeZero) === false, 'STROBE should hold inside same decoded-frame bucket');
context._vfc = 4;
ok(context.gateFn(strobeZero) === true, 'STROBE explicit interval should still update at next bucket');

// ── UI readability: no neon-green text declarations remain ─────────────────
ok(!/(?<!-)color\s*:\s*var\(--term-green\)/.test(html), 'Neon green CSS text remains in index.html');
ok(!/(?<!-)color\s*:\s*var\(--term-dgreen\)/.test(html), 'Dark neon green CSS text remains in index.html');
ok(!/(?<!-)color\s*:\s*#0f0/i.test(html), 'Hard-coded neon green CSS text remains in index.html');
ok(!/(?<!-)color\s*:\s*rgba\(80,220,120/.test(html), 'Green OSC text remains in index.html');
ok(!/(?<!-)color\s*:\s*#0f0/i.test(canvas), 'Hard-coded neon green dynamic text remains in canvas.js');
ok(canvas.includes("color:'#000'"), 'Success toast is not black text');
ok(canvas.includes("color:'#000', fontFamily:'monospace'"), 'UI-hidden indicator is not black text');
ok(canvas.includes("marginLeft:'10px', color:'#000'"), 'FPS readout is not black text');
ok(canvas.includes("'color:#000', 'background:#D4D0C8'"), 'Profiler overlay is not black text on light background');

// Performance boundary: fix must not introduce new image readback/upload or buffers.
ok((canvas.match(/getImageData\(/g) || []).length === 0, 'Pass 39N canvas.js introduced synchronous pixel readback');
ok((canvas.match(/putImageData\(/g) || []).length === 0, 'Pass 39N canvas.js introduced pixel upload');
ok(!gateSource.includes('createGraphics('), 'Continuous speed gate introduced graphics buffer');

console.log(pass22.stdout.trim());
console.log(`Pass 39N validation passed: ${checks.toLocaleString()} speed/readability/protection checks.`);
