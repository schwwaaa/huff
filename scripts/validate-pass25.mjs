import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  STAGE_CONTRACTS,
  PASS22_ROUTE_SKELETON,
  validateStageContractRegistry,
} from '../pipeline/stage-contracts.mjs';

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
      assert(digestFilesystemEntry(full) === digest, `${relDir}/${rel} changed outside Pass 25 scope`);
    }
  }

  for (const rel of walkFiles(base)) {
    if (!expected.has(rel)) assert(added.has(rel), `${relDir}/${rel} is an undeclared added runtime file`);
  }
}

const contractValidation = validateStageContractRegistry();
assert(contractValidation.valid, `Pass 24 contract registry invalid: ${contractValidation.errors.join('; ')}`);

const runtimeSource = read('src/pipeline-runtime.js');
const sandbox = { window: {}, console };
vm.runInNewContext(runtimeSource, sandbox, { filename: 'pipeline-runtime.js' });
const runtime = sandbox.window.HuffPipelineRuntime;
assert(runtime, 'browser pipeline runtime did not register');
assert(runtime.version === 1, 'unexpected pipeline runtime version');
assert(runtime.validation?.valid === true, 'built-in serial recipe is invalid');
assert(Object.isFrozen(runtime.PASS22_SERIAL_RECIPE), 'serial recipe must be frozen');
assert(Object.isFrozen(runtime.ZONE_ORDER), 'zone order must be frozen');
assert(Object.isFrozen(runtime.STAGE_LEGAL_ZONES), 'legal-zone registry must be frozen');
assert(Object.isFrozen(runtime.STAGE_RESOURCE_RULES), 'resource-rule registry must be frozen');

const expectedRuntimeRecipe = PASS22_ROUTE_SKELETON.map(step => ({
  zone: step.zone,
  stage: step.stage,
  ...(step.conditionalPosition ? { conditionalPosition: step.conditionalPosition } : {}),
  ...(step.members ? { members: [...step.members] } : {}),
}));
const actualRuntimeRecipe = runtime.PASS22_SERIAL_RECIPE.map(step => ({
  zone: step.zone,
  stage: step.stage,
  ...(step.conditionalPosition ? { conditionalPosition: step.conditionalPosition } : {}),
  ...(step.members ? { members: [...step.members] } : {}),
}));
assert(JSON.stringify(actualRuntimeRecipe) === JSON.stringify(expectedRuntimeRecipe), 'runtime recipe differs from Pass 24 route skeleton');

const contracts = new Map(STAGE_CONTRACTS.map(contract => [contract.id, contract]));
for (const stageId of ['source-sync', 'persistent-decay', 'global-mix', 'feedback', 'flow', 'symmetry', 'solarize', 'presentation']) {
  const contract = contracts.get(stageId);
  const rule = runtime.STAGE_RESOURCE_RULES[stageId];
  assert(contract && rule, `missing contract/resource rule for ${stageId}`);
  assert(rule.scratch === (contract.scratch.length > 0), `${stageId} scratch rule differs from stage contract`);
  assert(rule.swap === contract.swapsBuffers, `${stageId} swap rule differs from stage contract`);
}
for (const member of runtime.PASS22_SERIAL_RECIPE[2].members) {
  const contract = contracts.get(member);
  assert(contract?.legalZones.includes('front-overlays'), `${member} is not legal in the front stage`);
  assert(contract.scratch.length === 0 && contract.swapsBuffers === false, `${member} violates front-stage resource limits`);
}

const reordered = runtime.PASS22_SERIAL_RECIPE.map(step => ({ ...step }));
[reordered[4], reordered[6]] = [reordered[6], reordered[4]];
assert(runtime.validateRecipe(reordered).valid === false, 'reordered recipe was accepted');
const unknown = runtime.PASS22_SERIAL_RECIPE.map(step => ({ ...step }));
unknown[6] = { ...unknown[6], stage: 'unknown-effect' };
assert(runtime.validateRecipe(unknown).valid === false, 'unknown stage was accepted');
const badGlobalMix = runtime.PASS22_SERIAL_RECIPE.map(step => ({ ...step }));
badGlobalMix[3] = { ...badGlobalMix[3], conditionalPosition: 'final' };
assert(runtime.validateRecipe(badGlobalMix).valid === false, 'incorrect Global Mix position was accepted');

const trace = [];
const handlers = {};
for (const stage of new Set(runtime.PASS22_SERIAL_RECIPE.map(step => step.stage))) {
  handlers[stage] = (_frame, step) => trace.push(`${step.zone}:${step.stage}${step.conditionalPosition ? `:${step.conditionalPosition}` : ''}`);
}
const plan = runtime.compileRecipe(runtime.PASS22_SERIAL_RECIPE, handlers);
assert(Object.isFrozen(plan), 'compiled plan must be frozen');
plan.executeSource({});
plan.executePersistent({});
plan.executeEffectsAndPresentation({});
const expectedTrace = runtime.PASS22_SERIAL_RECIPE.map(step => `${step.zone}:${step.stage}${step.conditionalPosition ? `:${step.conditionalPosition}` : ''}`);
assert(JSON.stringify(trace) === JSON.stringify(expectedTrace), 'compiled dispatch order differs from Pass 22');
let missingHandlerRejected = false;
try { runtime.compileRecipe(runtime.PASS22_SERIAL_RECIPE, {}); }
catch { missingHandlerRejected = true; }
assert(missingHandlerRejected, 'recipe compilation accepted missing handlers');

verifyUnchangedFromManifest(
  'src',
  'baseline/pass24-src.sha256',
  ['canvas.js', 'index.html'],
  ['pipeline-runtime.js'],
);
verifyUnchangedFromManifest('src-tauri', 'baseline/pass22-src-tauri.sha256', [], []);
assert(hash('src/effects.js') === '2b352fa279c728ba292485fe22a0e580c6a3f36d669bd9741f79d5af4454dd44', 'Flow/effects implementation changed');

const index = read('src/index.html');
const pipelineAt = index.indexOf('<script defer src="pipeline-runtime.js"></script>');
const effectsAt = index.indexOf('<script defer src="effects.js"></script>');
const canvasAt = index.indexOf('<script defer src="canvas.js"></script>');
assert(pipelineAt >= 0 && pipelineAt < effectsAt && effectsAt < canvasAt, 'pipeline runtime must load before effects and canvas');

const canvas = read('src/canvas.js');
const requiredCanvasMarkers = [
  'const _pipelineFrame = Object.seal({',
  'const _pipelineStageHandlers = Object.freeze({',
  'const _pass22PipelinePlan = _pipelineRuntime.compileRecipe(',
  '_pass22PipelinePlan.executeSource(_pipelineFrame);',
  '_pass22PipelinePlan.executePersistent(_pipelineFrame);',
  '_pass22PipelinePlan.executeEffectsAndPresentation(_pipelineFrame);',
  'applyFlowWarp(gBuf, gScratch, Math.trunc(s.flowStrength),',
  'Math.trunc(s.flowScale), Math.trunc(s.flowPulse), s.flowImpl, s.flowSpeed,',
  's.flowTurb, s.flowSwirl, s.flowSpread);',
  '[gBuf, gScratch] = [gScratch, gBuf];',
  '_copyGraphicsFrame(gScratch, gBuf);',
  'ctx.clearRect(0, 0, gBuf.width, gBuf.height);',
];
for (const marker of requiredCanvasMarkers) assert(canvas.includes(marker), `missing canvas recipe marker: ${marker}`);
assert(canvas.indexOf('_copyGraphicsFrame(gScratch, gBuf);') < canvas.indexOf('ctx.clearRect(0, 0, gBuf.width, gBuf.height);'), 'Feedback no longer snapshots before clearing');
assert((canvas.match(/createGraphics\(/g) ?? []).length === 2, 'Pass 25 allocated another p5.Graphics surface');
assert(!canvas.includes('SortMosh') && !runtimeSource.includes('SortMosh'), 'rejected Sort-Mosh code detected');
assert(!canvas.includes('flowMelt') && !canvas.includes('flowLag') && !canvas.includes('flowCohesion'), 'rejected Flow controls detected');

const drawStart = canvas.indexOf('function draw() {');
const drawEnd = canvas.indexOf('\nfunction drawWaiting()', drawStart);
const drawBody = canvas.slice(drawStart, drawEnd);
assert(!drawBody.includes('=>'), 'Pass 25 introduced a per-frame arrow closure inside draw()');
assert(!drawBody.includes('function ('), 'Pass 25 introduced a per-frame function closure inside draw()');

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.scripts?.['validate:pass25'] === 'node scripts/validate-pass25.mjs', 'validate:pass25 package script missing');

console.log('PASS 25 validation passed.');
console.log('The exact 12-zone Pass 22 route validates, compiles once, and dispatches in the original order.');
console.log('Illegal ordering, unknown stages, invalid Global Mix positions, and missing handlers are rejected before rendering.');
console.log('Flow/effects and src-tauri remain unchanged; no additional full-resolution p5.Graphics buffer was added.');
