import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const hash = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function walkFiles(base) {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() || entry.isSymbolicLink()) {
        out.push(path.relative(base, full).split(path.sep).join('/'));
      }
    }
  };
  walk(base);
  return out.sort();
}

function parseManifest(rel) {
  const entries = new Map();
  for (const line of read(rel).trim().split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert(match, `invalid manifest line in ${rel}: ${line}`);
    entries.set(match[2], match[1]);
  }
  return entries;
}

function digestFilesystemEntry(full) {
  const stat = fs.lstatSync(full);
  const bytes = stat.isSymbolicLink()
    ? Buffer.from(`SYMLINK:${fs.readlinkSync(full)}`)
    : fs.readFileSync(full);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function verifyUnchangedFromManifest(relDir, manifestRel, allowedChanged, allowedAdded = []) {
  const base = path.join(root, relDir);
  const expected = parseManifest(manifestRel);
  const changed = new Set(allowedChanged);
  const added = new Set(allowedAdded);

  for (const [rel, digest] of expected) {
    const full = path.join(base, ...rel.split('/'));
    assert(fs.existsSync(full), `${relDir}/${rel} missing`);
    if (!changed.has(rel)) {
      assert(digestFilesystemEntry(full) === digest, `${relDir}/${rel} changed outside Pass 27 scope`);
    }
  }
  for (const rel of walkFiles(base)) {
    if (!expected.has(rel)) assert(added.has(rel), `${relDir}/${rel} is an undeclared added runtime file`);
  }
}

// Load the instrumentation in isolation and verify the public contract.
let now = 1000;
const sandbox = {
  window: { __huffProfilerActive: false },
  performance: {
    now: () => now,
    memory: { usedJSHeapSize: 64 * 1048576, jsHeapSizeLimit: 1024 * 1048576 },
  },
  console,
  Object,
  Number,
  String,
  Math,
};
vm.runInNewContext(read('src/capability-instrumentation.js'), sandbox, {
  filename: 'capability-instrumentation.js',
});
const api = sandbox.window.HuffCapabilityInstrumentation;
const telemetry = sandbox.window.__huffCapabilityTelemetry;
assert(api?.version === 1, 'capability instrumentation did not register version 1');
assert(Object.isFrozen(api), 'capability API must be frozen');
assert(Object.isFrozen(api.profiles), 'capability profile registry must be frozen');
assert(Object.isFrozen(api.scenes), 'effect-load scene registry must be frozen');
assert(JSON.stringify(Object.keys(api.profiles)) === JSON.stringify(['720p30','720p60','1080p30','1080p60']), 'capability profile IDs changed');
assert(api.profiles['720p30'].width === 1280 && api.profiles['720p30'].height === 720 && api.profiles['720p30'].targetFps === 30, '720p30 profile invalid');
assert(api.profiles['720p60'].frameBudgetMs === 16.667, '720p60 budget invalid');
assert(api.profiles['1080p30'].width === 1920 && api.profiles['1080p30'].height === 1080, '1080p30 profile invalid');
assert(api.profiles['1080p60'].targetFps === 60, '1080p60 profile invalid');
assert(JSON.stringify(Object.keys(api.scenes)) === JSON.stringify(['light','moderate','worstCase']), 'effect-load scene IDs changed');
assert(JSON.stringify(api.scenes.light.stages) === JSON.stringify(['glitch']), 'light scene changed');
assert(api.scenes.moderate.stages.includes('feedback'), 'moderate scene missing Feedback');
assert(api.scenes.worstCase.stages.includes('flow') && api.scenes.worstCase.stages.includes('solarize'), 'worst-case scene incomplete');
assert(api.closestProfile(1280, 720, 30) === api.profiles['720p30'], 'exact 720p30 profile resolution failed');
assert(api.closestProfile(1920, 1080, 60) === api.profiles['1080p60'], 'exact 1080p60 profile resolution failed');

api.count('fileLoads');
api.count('sourceReplacements', 2);
assert(telemetry.fileLoads === 1 && telemetry.sourceReplacements === 2, 'lifecycle counter update failed');
api.sample('render', 5);
assert(telemetry.renderSamples === 0, 'timing sampled while profiler was hidden');
sandbox.window.__huffProfilerActive = true;
api.sample('render', 5);
api.sample('render', 9);
api.sample('sourceSync', 1.5);
api.sample('activePipeline', 4.25);
api.markRenderPath('active');
api.setSource('file', 1920, 1080);
api.setCanvas(1280, 720);
api.beginProfilerSession();
assert(telemetry.renderSamples === 2 && telemetry.renderMs === 14 && telemetry.renderMaxMs === 9, 'render timing accumulation failed');
assert(telemetry.sourceSyncSamples === 1 && telemetry.activePipelineSamples === 1, 'phase timing accumulation failed');
assert(telemetry.renderActiveSamples === 1, 'render path counter failed');
now = 7000;
const snapshot = api.snapshot();
assert(snapshot.uptimeMs === 6000, 'uptime snapshot failed');
assert(snapshot.lastSourceKind === 'file' && snapshot.lastSourceWidth === 1920, 'source snapshot failed');
assert(snapshot.lastCanvasWidth === 1280 && snapshot.lastCanvasHeight === 720, 'canvas snapshot failed');
assert(snapshot.heapUsedBytes === 64 * 1048576, 'optional heap snapshot failed');

verifyUnchangedFromManifest(
  'src',
  'baseline/pass26-src.sha256',
  ['canvas.js', 'index.html'],
  ['capability-instrumentation.js'],
);
verifyUnchangedFromManifest('src-tauri', 'baseline/pass26-src-tauri.sha256', [], []);

assert(hash('src/effects.js') === '2b352fa279c728ba292485fe22a0e580c6a3f36d669bd9741f79d5af4454dd44', 'Flow/effects implementation changed');
assert(hash('src/pipeline-runtime.js') === '5124aa948fcf556ce5b00c8da1bfef8a86da850d278e680cc9a4e0a8ea3634b9', 'validated Pass 26 pipeline runtime changed');

const instrumentation = read('src/capability-instrumentation.js');
assert(!instrumentation.includes('requestAnimationFrame('), 'instrumentation added a new animation clock');
assert(!instrumentation.includes('setInterval('), 'instrumentation added a polling clock');
assert(!instrumentation.includes('createGraphics('), 'instrumentation added a render surface');
assert(instrumentation.includes("if (!window.__huffProfilerActive"), 'timing is not profiler-gated');

const index = read('src/index.html');
const capabilityScript = index.indexOf('<script defer src="capability-instrumentation.js"></script>');
const pipelineScript = index.indexOf('<script defer src="pipeline-runtime.js"></script>');
const effectsScript = index.indexOf('<script defer src="effects.js"></script>');
const canvasScript = index.indexOf('<script defer src="canvas.js"></script>');
assert(capabilityScript >= 0 && capabilityScript < pipelineScript && pipelineScript < effectsScript && effectsScript < canvasScript, 'runtime script order is invalid');
for (const marker of [
  'const spoutTelemetry = window.__huffSpoutTelemetry = {',
  "spoutCount('bufferedSkips');",
  "spoutProfile('drawMs', performance.now() - phaseStarted);",
  "spoutProfile('readMs', performance.now() - phaseStarted);",
  "spoutProfile('sendMs', performance.now() - phaseStarted);",
  "spoutCount('sentFrames');",
]) assert(index.includes(marker), `missing Spout telemetry marker: ${marker}`);

const canvas = read('src/canvas.js');
for (const marker of [
  "const _capabilityInstrumentation = window.HuffCapabilityInstrumentation || null;",
  "_capabilityInstrumentation?.count('sourceReplacements');",
  "_capabilityInstrumentation?.count('resizeRequests');",
  "_capabilityInstrumentation?.count('resizeCommits');",
  "_capabilityInstrumentation?.sample('render', performance.now() - startedAt);",
  "_capabilityInstrumentation?.sample('sourceSync', performance.now() - sourceSyncStarted);",
  "_capabilityInstrumentation?.sample('activePipeline', performance.now() - activePipelineStarted);",
  'function spoutTelemetrySnapshot() {',
  'function capabilityTelemetrySnapshot() {',
  "'sp draw    ' + spoutDrawAvg.toFixed(2).padStart(6) + ' ms\\n' +",
  "'profile    ' + String(targetProfile?.id || 'custom').padStart(6) + '\\n' +",
  'applyFlowWarp(gBuf, gScratch, Math.trunc(s.flowStrength),',
  '[gBuf, gScratch] = [gScratch, gBuf];',
]) assert(canvas.includes(marker), `missing Pass 27 canvas marker: ${marker}`);
assert((canvas.match(/createGraphics\(/g) ?? []).length === 2, 'Pass 27 allocated another p5.Graphics surface');
assert(!canvas.includes('SortMosh') && !canvas.includes('flowMelt') && !canvas.includes('flowLag'), 'rejected Flow code detected');

const drawStart = canvas.indexOf('function draw() {');
const drawEnd = canvas.indexOf('\nfunction drawWaiting()', drawStart);
const drawBody = canvas.slice(drawStart, drawEnd);
assert(!drawBody.includes('=>'), 'Pass 27 introduced a per-frame arrow closure inside draw()');
assert(!drawBody.includes('function ('), 'Pass 27 introduced a per-frame function closure inside draw()');
assert(!drawBody.includes('{ ...'), 'Pass 27 introduced object spread allocation inside draw()');

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.scripts?.['validate:pass27'] === 'node scripts/validate-pass27.mjs', 'validate:pass27 package script missing');

console.log('PASS 27 validation passed.');
console.log('Capability profiles, effect-load scenes, lifecycle counters, profiler-gated render phases, and Spout telemetry are valid.');
console.log('Flow/effects and the Pass 26 pipeline runtime are byte-identical; src-tauri is unchanged and no render surface or clock was added.');
