import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const canvasPath = path.join(root, 'src', 'canvas.js');
const effectsPath = path.join(root, 'src', 'effects.js');
const canvas = fs.readFileSync(canvasPath, 'utf8');
const effects = fs.readFileSync(effectsPath, 'utf8');
let checks = 0;
function ok(cond, msg) { if (!cond) throw new Error(`FAIL: ${msg}`); checks++; }
function extract(name) {
  const marker = `function ${name}(`;
  const start = canvas.indexOf(marker);
  ok(start >= 0, `${name} exists`);
  let brace = canvas.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < canvas.length; i++) {
    if (canvas[i] === '{') depth++;
    else if (canvas[i] === '}') {
      depth--;
      if (depth === 0) return canvas.slice(start, i + 1);
    }
  }
  throw new Error(`FAIL: could not extract ${name}`);
}

ok(canvas.includes('const symmetrySource = _symmetryShouldReadCleanLiveSource(frame) ? gCur : gBuf;'), 'Symmetry dispatcher can own live gCur');
ok(canvas.includes('const directLiveSource = _solarizeShouldReadCleanLiveSource(frame)'), 'Solarize ownership decision receives complete frame state');
ok(canvas.includes('frame.state.feedbackEnabled !== false && !!frame.activity.feedback'), 'disabled Feedback is not treated as a transform owner');
ok(effects.includes('function applySymmetry(src, dst, mode = \'v\', pos = 0.5)'), 'accepted Symmetry implementation remains source-parameterized');
ok(effects.includes('sourceOverride = null'), 'Pass 52A Solarize direct-source hook retained');
ok(effects.includes('const srcCanvas = sourceOverride || buf.elt || buf.drawingContext.canvas;'), 'Solarize still prefers explicit live source');

const helperSource = [
  extract('_feedbackActuallyOwnsBuffer'),
  extract('_symmetryShouldReadCleanLiveSource'),
  extract('_solarizeShouldReadCleanLiveSource'),
].join('\n');
const context = {};
vm.createContext(context);
vm.runInContext(`${helperSource}; this.feedbackOwns=_feedbackActuallyOwnsBuffer; this.symOwns=_symmetryShouldReadCleanLiveSource; this.solOwns=_solarizeShouldReadCleanLiveSource;`, context);
const feedbackOwns = context.feedbackOwns;
const symOwns = context.symOwns;
const solOwns = context.solOwns;

const empty = {glitch:false, scanlines:false, luma:false, globalMix:false, feedback:false, flow:false, symmetry:false, solarize:false};
const frame = (activity, feedbackEnabled=false) => ({ activity:{...empty, ...activity}, state:{feedbackEnabled} });

ok(symOwns(frame({symmetry:true})) === true, 'Symmetry-only owns clean live source');
ok(solOwns(frame({solarize:true})) === true, 'Solarize-only owns clean live source');
ok(symOwns(frame({symmetry:true, solarize:true})) === true, 'Symmetry remains the live-source owner before downstream Solarize');
ok(solOwns(frame({symmetry:true, solarize:true})) === false, 'Solarize consumes Symmetry output when both are active');

// Critical Pass 52A miss: activity.feedback may remain true for the independent
// Persistence contract after the explicit Feedback transform has been disabled.
const phantomFeedbackSym = frame({symmetry:true, feedback:true}, false);
const phantomFeedbackSol = frame({solarize:true, feedback:true}, false);
ok(feedbackOwns(phantomFeedbackSym) === false, 'disabled Feedback does not own gBuf');
ok(symOwns(phantomFeedbackSym) === true, 'Symmetry standalone works with Feedback disabled and nonzero historical amount');
ok(solOwns(phantomFeedbackSol) === true, 'Solarize standalone works with Feedback disabled and nonzero historical amount');

const realFeedbackSym = frame({symmetry:true, feedback:true}, true);
const realFeedbackSol = frame({solarize:true, feedback:true}, true);
ok(feedbackOwns(realFeedbackSym) === true, 'enabled Feedback owns persistent buffer');
ok(symOwns(realFeedbackSym) === false, 'Symmetry preserves Feedback combination semantics');
ok(solOwns(realFeedbackSol) === false, 'Solarize preserves Feedback combination semantics');

for (const upstream of ['glitch','scanlines','luma','globalMix','flow']) {
  ok(symOwns(frame({symmetry:true, [upstream]:true})) === false, `Symmetry preserves ${upstream} upstream ownership`);
  ok(solOwns(frame({solarize:true, [upstream]:true})) === false, `Solarize preserves ${upstream} upstream ownership`);
}

// Protected Pass 52 / Pass 51 runtime boundaries: this repair is canvas routing only.
const protectedFiles = [
  'src/effects.js',
  'src/syphon-stream-worker.js',
  'src-tauri/src/main.rs',
  'src-tauri/src/syphon.rs',
  'src/pipeline-runtime.js',
];
const manifestPath = path.join(root, 'baseline', 'pass52a-pass52b-protected.sha256');
const manifest = fs.readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
const expected = new Map(manifest.map(line => {
  const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
  if (!m) throw new Error(`bad manifest line: ${line}`);
  return [m[2], m[1]];
}));
for (const rel of protectedFiles) {
  const bytes = fs.readFileSync(path.join(root, rel));
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  ok(expected.get(rel) === hash, `${rel} remains exact Pass 52A protected bytes`);
}

console.log(`HUFF Classic Pass 52B validation: ${checks.toLocaleString()} checks PASS`);
