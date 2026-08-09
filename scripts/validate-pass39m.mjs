import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const assert = (c, m) => { if (!c) throw new Error(m); };
let checks = 0;
const ok = (c, m) => { assert(c, m); checks++; };

const inherited = spawnSync(process.execPath, ['scripts/validate-pass38.mjs'], { cwd: root, encoding: 'utf8' });
if (inherited.status !== 0) {
  process.stderr.write(inherited.stdout || '');
  process.stderr.write(inherited.stderr || '');
  throw new Error('Pass 38 inherited validation failed');
}

const html = read('src/index.html');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');

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

// ── Feedback merge: preserve the established instrument ─────────────────────
for (const fragment of [
  'id="feedback" type="range" min="0" max="3" step="0.05" value="0.6"',
  'id="persistence" type="range" min="0" max="10" step="0.05" value="0.7"',
  'id="fbX" type="range" min="-1" max="1" step="0.001" value="1"',
  'id="fbY" type="range" min="-1" max="1" step="0.001" value="1"',
  'id="fbZ" type="range" min="0.98" max="1.03" step="0.005" value="1.000"',
  'id="fbTheta" type="range" min="-2.0" max="2.0" step="0.005" value="0.01"',
]) ok(html.includes(fragment), `Original Feedback control changed/missing: ${fragment}`);

ok(html.includes('FEEDBACK · RETURN'), 'Feedback semantic action label missing');
ok(html.includes('PERSISTENCE · MEMORY'), 'Persistence semantic action label missing');
ok(html.includes('FB X · DRIFT') && html.includes('FB Y · DRIFT'), 'Feedback drift semantic labels missing');
ok(html.includes('FB Z · ZOOM') && html.includes('FB θ · ROTATE'), 'Feedback zoom/rotation semantic labels missing');
ok(html.includes("const defaults = { fbX: '1', fbY: '1', fbZ: '1.000', fbTheta: '0.01' }"), 'Original Reset Motion defaults changed');

const persistenceFn = extractFunction(canvas, '_runPersistentDecayStage');
ok(sha(Buffer.from(persistenceFn)) === '630c8d59439e10a43e09fdb9baa9be8e364b460204e43baec5936e76fac5ef0d', 'PERSISTENCE stage changed from accepted Pass 38');
ok(!persistenceFn.includes('feedbackEnabled'), 'Feedback ENABLE incorrectly gates PERSISTENCE');
ok(!persistenceFn.includes('feedbackStrobe'), 'Feedback STROBE incorrectly gates PERSISTENCE');
ok(!persistenceFn.includes('feedbackRestore'), 'RESTORE incorrectly modifies PERSISTENCE');

// ── Additive Feedback features ───────────────────────────────────────────────
for (const id of ['feedbackEnabled','feedbackMotionRange','feedbackStrobe','feedbackStrobeEvery','feedbackRestore']) {
  ok(html.includes(`id="${id}"`), `Feedback merge control missing: ${id}`);
  ok(canvas.includes(`'${id}'`), `Feedback merge runtime/preset state missing: ${id}`);
}
ok(canvas.includes("if (!('feedbackEnabled' in sourceData)) sourceData.feedbackEnabled = true"), 'Legacy presets do not default Feedback ENABLE on');
ok(canvas.includes("if (!('feedbackMotionRange' in sourceData)) sourceData.feedbackMotionRange = 'classic'"), 'Legacy presets do not default Feedback motion range CLASSIC');
ok(canvas.includes("if (!('feedbackStrobe' in sourceData)) sourceData.feedbackStrobe = false"), 'Legacy presets do not default Feedback Strobe off');
ok(canvas.includes("if (!('feedbackRestore' in sourceData)) sourceData.feedbackRestore = '0'"), 'Legacy presets do not default Restore neutral');
ok(canvas.includes("? { fbX:[-8,8,0.01], fbY:[-8,8,0.01], fbZ:[0.95,1.05,0.001], fbTheta:[-5,5,0.01] }"), 'WIDE Feedback range missing');
ok(canvas.includes(": { fbX:[-1,1,0.001], fbY:[-1,1,0.001], fbZ:[0.98,1.03,0.005], fbTheta:[-2,2,0.005] }"), 'CLASSIC Feedback range missing');

const feedbackFn = extractFunction(canvas, '_runFeedbackStage');
ok(feedbackFn.includes('frame.state.feedbackEnabled === false'), 'Feedback ENABLE does not bypass transform/Restore stage');
ok(feedbackFn.includes('_shouldApplyFeedbackTransformThisRender(s)'), 'Transform-only Feedback Strobe gate missing');
ok(feedbackFn.includes('const fb = s.feedback;'), 'Original FEEDBACK parameter no longer drives transform');
ok(feedbackFn.includes('ctx.globalAlpha = Math.min(1, fb);'), 'Original Feedback alpha equation changed');
ok(feedbackFn.includes('const restore = Math.max(0, Math.min(1, Number(s.feedbackRestore) || 0));'), 'Restore path missing');
ok(!feedbackFn.includes('feedbackReturn') && !feedbackFn.includes('feedbackDecay'), 'Rejected replacement Feedback parameters returned');

const feedbackGate = extractFunction(canvas, '_shouldApplyFeedbackTransformThisRender');
ok(feedbackGate.includes('_vfc'), 'Feedback Strobe is not decoded-frame based');
ok(!feedbackGate.includes('persistence'), 'Feedback Strobe gate references PERSISTENCE');

// ── Independent overall Cluster speed ───────────────────────────────────────
ok(html.includes('id="clusterMasterSpeed" type="range" min="0" max="4" step="0.01" value="1"'), 'CLUSTER SPEED control/range missing');
ok(html.includes('Independent of the general CORRUPT SPEED control'), 'Cluster speed independence is not described');
ok(canvas.includes("if (!('clusterMasterSpeed' in sourceData)) sourceData.clusterMasterSpeed = '1'"), 'Legacy presets do not get neutral CLUSTER SPEED');
ok(canvas.includes('clusterSpeed:1, clusterTimeSec:0'), 'Independent cluster motion clock missing');
ok(canvas.includes('_corruptMotion.clusterTimeSec += clusterMasterSpeed * corruptDt'), 'CLUSTER SPEED does not advance independent cluster clock');
ok(canvas.includes('_corruptMotion.clusterSpeed = clusterMasterSpeed'), 'CLUSTER SPEED is not exposed to cluster renderer');
ok(effects.includes('corruptMotion.clusterSpeed'), 'Cluster physics does not consume independent CLUSTER SPEED');
ok(effects.includes('corruptMotion.clusterTimeSec'), 'Cluster breathing/kick timing does not consume independent cluster clock');
ok(!effects.includes('const masterSpeed = Math.max(0, Math.min(4, Number.isFinite(Number(corruptMotion.speed))'), 'Cluster physics still uses general CORRUPT SPEED as master');
ok(effects.includes('const reroll    = Math.min(1, (1 - cluCohere) * masterSpeed);'), 'CLUSTER SPEED does not scale shape evolution');

const clusterUpdate = extractFunction(effects, 'updateClusterPhysics');
ok(clusterUpdate.includes('if (speed <= 0) return _cluPhysics;'), 'CLUSTER SPEED 0 does not freeze center physics');
ok(clusterUpdate.includes('const directDX = (Number(cluMoveX) || 0) * frameDt * speed'), 'CLUSTER SPEED does not scale Group MOVE X');
ok(clusterUpdate.includes('const directDY = (Number(cluMoveY) || 0) * frameDt * speed'), 'CLUSTER SPEED does not scale Group MOVE Y');
ok(clusterUpdate.includes('const directDZ = (Number(cluMoveZ) || 0) * frameDt * speed'), 'CLUSTER SPEED does not scale Group MOVE Z');
ok(clusterUpdate.includes('_cluPhysT += cluSteer * 0.004 * speed'), 'CLUSTER SPEED does not scale steering field time');

// ── Performance boundaries ──────────────────────────────────────────────────
ok((canvas.match(/getImageData\(/g) || []).length === 0, 'Pass 39M canvas.js introduced synchronous pixel readback');
ok((canvas.match(/putImageData\(/g) || []).length === 0, 'Pass 39M canvas.js introduced pixel upload');
const corruptStart = effects.indexOf('function _corruptStencilAllows(');
const flowStart = effects.indexOf('// ─── Flow warp', corruptStart);
const corruptRegion = effects.slice(corruptStart, flowStart);
ok(!corruptRegion.includes('getImageData('), 'Cluster speed path introduced synchronous readback');
ok(!corruptRegion.includes('putImageData('), 'Cluster speed path introduced pixel upload');
ok(!corruptRegion.includes('createGraphics('), 'Cluster speed path introduced full-resolution buffer');

console.log(inherited.stdout.trim());
console.log(`Pass 39M validation passed: ${checks.toLocaleString()} merge/cluster-speed checks.`);
