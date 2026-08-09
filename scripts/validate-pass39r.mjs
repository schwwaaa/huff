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

// ── Exact Pass 38 Feedback surface restored ──────────────────────────────────
for (const fragment of [
  '<label>FEEDBACK</label>',
  'id="feedback" type="range" min="0" max="3" step="0.05" value="0.6"',
  '<label>PERSISTENCE</label>',
  'id="persistence" type="range" min="0" max="10" step="0.05" value="0.7"',
  'id="fbX" type="range" min="-1" max="1" step="0.001" value="1"',
  'id="fbY" type="range" min="-1" max="1" step="0.001" value="1"',
  'id="fbZ" type="range" min="0.98" max="1.03" step="0.005" value="1.000"',
  'id="fbTheta" type="range" min="-2.0" max="2.0" step="0.005" value="0.01"',
]) ok(html.includes(fragment), `Pass 38 Feedback control missing/changed: ${fragment}`);

ok(html.includes("const defaults = { fbX: '1', fbY: '1', fbZ: '1.000', fbTheta: '0.01' }"), 'Reset Motion no longer uses Pass 38 defaults');
ok(!html.includes('id="feedbackReturn"'), 'Rejected RETURN replacement is still present');
ok(!html.includes('id="feedbackDecay"'), 'Rejected DECAY replacement is still present');
ok(!html.includes('id="feedbackOn"'), 'Rejected Feedback ON replacement is still present');
ok(!canvas.includes('feedbackReturn'), 'Rejected feedbackReturn runtime state is still present');
ok(!canvas.includes('feedbackDecay'), 'Rejected feedbackDecay runtime state is still present');
ok(!canvas.includes('feedbackOn'), 'Rejected feedbackOn runtime state is still present');

// These two core functions are exact Pass 38 source-equivalent.
ok(sha(Buffer.from(extractFunction(canvas, '_feedbackHasVisibleEffect'))) === '6a70c0a4c0a0a569c3fcfc96bd5586a20850664a69748fde31f99b6fa6bb469b', 'Pass 38 _feedbackHasVisibleEffect changed');
ok(sha(Buffer.from(extractFunction(canvas, '_runPersistentDecayStage'))) === '630c8d59439e10a43e09fdb9baa9be8e364b460204e43baec5936e76fac5ef0d', 'Pass 38 PERSISTENCE stage changed');

// ── Additive-only experiments ────────────────────────────────────────────────
for (const id of ['feedbackStrobe','feedbackStrobeEvery','feedbackRestore']) {
  ok(html.includes(`id="${id}"`), `Pass 39R additive control missing: ${id}`);
  ok(canvas.includes(`'${id}'`), `Pass 39R runtime/preset control missing: ${id}`);
}
ok(html.includes('Experimental — additive only'), 'Feedback experiments are not clearly separated from legacy controls');
ok(canvas.includes("if (!('feedbackStrobe' in sourceData)) sourceData.feedbackStrobe = false"), 'Legacy presets do not default Feedback Strobe OFF');
ok(canvas.includes("if (!('feedbackRestore' in sourceData)) sourceData.feedbackRestore = '0'"), 'Legacy presets do not default Restore to zero');

const persistenceFn = extractFunction(canvas, '_runPersistentDecayStage');
ok(!persistenceFn.includes('feedbackStrobe'), 'Feedback Strobe incorrectly gates PERSISTENCE');
ok(!persistenceFn.includes('feedbackRestore'), 'Restore incorrectly modifies PERSISTENCE');
ok(!persistenceFn.includes('feedbackStrobeEvery'), 'Feedback interval incorrectly gates PERSISTENCE');

const feedbackFn = extractFunction(canvas, '_runFeedbackStage');
ok(feedbackFn.includes('_shouldApplyFeedbackTransformThisRender(s)'), 'Feedback transform-only strobe gate missing');
ok(feedbackFn.includes('const fb = s.feedback;'), 'Original FEEDBACK value no longer drives transform');
ok(feedbackFn.includes('ctx.globalAlpha = Math.min(1, fb);'), 'Original FEEDBACK draw-alpha semantics changed');
ok(feedbackFn.includes('const restore = Math.max(0, Math.min(1, Number(s.feedbackRestore) || 0));'), 'Restore additive path missing');
ok(feedbackFn.includes("ctx.globalCompositeOperation = 'source-over'"), 'Restore does not use bounded source-over compositing');

const gateFn = extractFunction(canvas, '_shouldApplyFeedbackTransformThisRender');
ok(gateFn.includes('_vfc'), 'Feedback Strobe is not decoded-frame based');
ok(gateFn.includes('feedbackStrobeEvery'), 'Feedback Strobe interval missing');
ok(!gateFn.includes('persistence'), 'Feedback Strobe gate improperly references PERSISTENCE');
ok(!gateFn.includes('getImageData'), 'Feedback Strobe introduced pixel readback');

// No new image-analysis or full-resolution image surface was introduced.
ok((canvas.match(/getImageData\(/g) || []).length === 0, 'Pass 39R canvas.js introduced synchronous getImageData');
ok((canvas.match(/putImageData\(/g) || []).length === 0, 'Pass 39R canvas.js introduced putImageData');
ok(sha(fs.readFileSync(path.join(root, 'src/effects.js'))) === 'ff7577cb87d11ee407cba4d0a5b940174f5949e0cdfe75cb9cee4173cebeabc9', 'Pass 38 effects.js changed');
ok(sha(fs.readFileSync(path.join(root, 'src/pipeline-runtime.js'))) === 'f5c80efe0c052fbdac5ddc6b14c91b23d531fff543929fd4d99e7e37757a6188', 'Pass 38 pipeline-runtime.js changed');

console.log(inherited.stdout.trim());
console.log(`Pass 39R validation passed: ${checks.toLocaleString()} recovery/additive-boundary checks.`);
