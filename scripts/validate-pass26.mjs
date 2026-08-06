import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  STAGE_CONTRACTS,
  PASS22_ROUTE_SKELETON,
  FRONT_STAGE_PRIORITY_CONTRACT,
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
      assert(digestFilesystemEntry(full) === digest, `${relDir}/${rel} changed outside Pass 26 scope`);
    }
  }

  for (const rel of walkFiles(base)) {
    if (!expected.has(rel)) assert(added.has(rel), `${relDir}/${rel} is an undeclared added runtime file`);
  }
}

function legacyGlitchOnTop(mode, pulseSpeed, renderFrame) {
  let glitchOnTop = false;
  const layerState = mode || 'scan';
  const pulseFrames = Math.max(1, Math.round(60 / Math.max(0.1, pulseSpeed)));
  if (layerState === 'glitch') glitchOnTop = true;
  else if (layerState === 'neutral') glitchOnTop = (renderFrame & 1) === 0;
  else if (layerState === 'pulse') glitchOnTop = (Math.floor(renderFrame / pulseFrames) & 1) === 0;
  return glitchOnTop;
}

const registryValidation = validateStageContractRegistry();
assert(registryValidation.valid, `stage contract registry invalid: ${registryValidation.errors.join('; ')}`);

const runtimeSource = read('src/pipeline-runtime.js');
const sandbox = { window: {}, console };
vm.runInNewContext(runtimeSource, sandbox, { filename: 'pipeline-runtime.js' });
const runtime = sandbox.window.HuffPipelineRuntime;
assert(runtime, 'browser pipeline runtime did not register');
assert(runtime.version === 2, 'unexpected pipeline runtime version');
assert(runtime.validation?.valid === true, 'built-in serial recipe is invalid');
assert(runtime.frontStageValidation?.valid === true, 'built-in front-stage contract is invalid');
assert(Object.isFrozen(runtime.FRONT_STAGE_PRIORITY_CONTRACT), 'front-stage contract must be frozen');
assert(Object.isFrozen(runtime.FRONT_STAGE_PRIORITY_CONTRACT.groups), 'front-stage groups must be frozen');
assert(Object.isFrozen(runtime.FRONT_STAGE_PRIORITY_CONTRACT.modes), 'front-stage modes must be frozen');

const sourceFront = FRONT_STAGE_PRIORITY_CONTRACT;
const browserFront = runtime.FRONT_STAGE_PRIORITY_CONTRACT;
for (const key of [
  'stateKey',
  'pulseSpeedKey',
  'renderFrameKey',
  'defaultMode',
  'fallbackMode',
  'renderRateBasis',
  'pulseMinimumSpeed',
  'pulseMinimumFrames',
]) {
  assert(browserFront[key] === sourceFront[key], `browser/source front-stage contract mismatch: ${key}`);
}
assert(
  JSON.stringify(browserFront.groups) === JSON.stringify(sourceFront.groups),
  'browser/source front-stage groups differ',
);
assert(
  JSON.stringify(browserFront.modes) === JSON.stringify(sourceFront.modes),
  'browser/source front-stage modes differ',
);

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
assert(JSON.stringify(actualRuntimeRecipe) === JSON.stringify(expectedRuntimeRecipe), 'runtime recipe differs from Pass 22 route skeleton');
assert(runtime.PASS22_SERIAL_RECIPE[2].priorityContract === browserFront, 'front route does not own the validated priority contract');

const scanOrder = browserFront.modes.scan;
const glitchOrder = browserFront.modes.glitch;
assert(Object.isFrozen(scanOrder) && Object.isFrozen(glitchOrder), 'resolved static orders must be frozen');

const modes = ['scan', 'glitch', 'neutral', 'pulse', '', 'unknown', undefined, null];
const speeds = [0.05, 0.1, 0.2, 0.5, 1, 2, 5.5, 12, undefined, Number.NaN];
let parityCases = 0;
for (const mode of modes) {
  for (const speed of speeds) {
    for (let frame = 0; frame < 4096; frame += 7) {
      const expectedGlitchOnTop = legacyGlitchOnTop(mode, speed, frame);
      const expectedOrder = expectedGlitchOnTop ? glitchOrder : scanOrder;
      const actualOrder = runtime.resolveFrontStageOrder(mode, speed, frame);
      assert(actualOrder === expectedOrder, `priority parity mismatch: mode=${mode} speed=${speed} frame=${frame}`);
      parityCases++;
    }
  }
}

assert(runtime.resolveFrontStageOrder('scan', 2, 1) === scanOrder, 'SCAN TOP did not reuse static order');
assert(runtime.resolveFrontStageOrder('scan', 2, 2) === scanOrder, 'SCAN TOP allocated/replaced its order');
assert(runtime.resolveFrontStageOrder('glitch', 2, 1) === glitchOrder, 'GLITCH TOP did not reuse static order');
assert(runtime.resolveFrontStageOrder('glitch', 2, 2) === glitchOrder, 'GLITCH TOP allocated/replaced its order');

const frontTrace = [];
const frontPlan = runtime.compileFrontStagePriority({
  'glitch-luma-group': () => frontTrace.push('glitch-luma-group'),
  'scanline-group': () => frontTrace.push('scanline-group'),
});
assert(Object.isFrozen(frontPlan), 'compiled front-stage plan must be frozen');
assert(frontPlan.validation.valid, 'compiled front-stage plan is invalid');
frontPlan.execute({}, 'scan', 2, 1);
assert(JSON.stringify(frontTrace.splice(0)) === JSON.stringify(scanOrder), 'SCAN TOP execution order changed');
frontPlan.execute({}, 'glitch', 2, 1);
assert(JSON.stringify(frontTrace.splice(0)) === JSON.stringify(glitchOrder), 'GLITCH TOP execution order changed');
frontPlan.execute({}, 'neutral', 2, 2);
assert(JSON.stringify(frontTrace.splice(0)) === JSON.stringify(glitchOrder), 'NEUTRAL even-frame order changed');
frontPlan.execute({}, 'neutral', 2, 3);
assert(JSON.stringify(frontTrace.splice(0)) === JSON.stringify(scanOrder), 'NEUTRAL odd-frame order changed');

let missingGlitchGroupRejected = false;
try {
  runtime.compileFrontStagePriority({ 'scanline-group': () => {} });
} catch {
  missingGlitchGroupRejected = true;
}
assert(missingGlitchGroupRejected, 'front plan accepted a missing Glitch/Luma handler');
let missingScanGroupRejected = false;
try {
  runtime.compileFrontStagePriority({ 'glitch-luma-group': () => {} });
} catch {
  missingScanGroupRejected = true;
}
assert(missingScanGroupRejected, 'front plan accepted a missing Scanline handler');

const badPriorityRecipe = runtime.PASS22_SERIAL_RECIPE.map(step => ({ ...step }));
badPriorityRecipe[2] = {
  ...badPriorityRecipe[2],
  priorityContract: {
    ...browserFront,
    modes: { ...browserFront.modes, scan: glitchOrder },
  },
};
assert(runtime.validateRecipe(badPriorityRecipe).valid === false, 'recipe accepted a changed SCAN TOP order');

const contracts = new Map(STAGE_CONTRACTS.map(contract => [contract.id, contract]));
for (const member of runtime.PASS22_SERIAL_RECIPE[2].members) {
  const contract = contracts.get(member);
  assert(contract?.legalZones.includes('front-overlays'), `${member} is not legal in the front stage`);
  assert(contract.scratch.length === 0 && contract.swapsBuffers === false, `${member} violates front-stage serial limits`);
}

verifyUnchangedFromManifest(
  'src',
  'baseline/pass25-src.sha256',
  ['canvas.js', 'pipeline-runtime.js'],
  [],
);
verifyUnchangedFromManifest('src-tauri', 'baseline/pass22-src-tauri.sha256', [], []);
assert(hash('src/effects.js') === '2b352fa279c728ba292485fe22a0e580c6a3f36d669bd9741f79d5af4454dd44', 'Flow/effects implementation changed');

const canvas = read('src/canvas.js');
const requiredCanvasMarkers = [
  'const _frontStageGroupHandlers = Object.freeze({',
  "'glitch-luma-group': _runGlitchLumaFrontGroup,",
  "'scanline-group': _runScanlineFrontGroup,",
  'const _frontStagePriorityPlan = _pipelineRuntime.compileFrontStagePriority(',
  '_frontStagePriorityPlan.execute(',
  '_pipelineFrame.frontStageActive = activity.scanlines || activity.glitch || activity.luma;',
  "_pipelineFrame.layerPriority = s.layerPriority || 'scan';",
  '_pipelineFrame.layerPulseSpeed = s.layerPulseSpeed;',
  '_pipelineFrame.renderFrame = frameCount;',
  'applyFlowWarp(gBuf, gScratch, Math.trunc(s.flowStrength),',
  'Math.trunc(s.flowScale), Math.trunc(s.flowPulse), s.flowImpl, s.flowSpeed,',
  's.flowTurb, s.flowSwirl, s.flowSpread);',
  '[gBuf, gScratch] = [gScratch, gBuf];',
];
for (const marker of requiredCanvasMarkers) assert(canvas.includes(marker), `missing Pass 26 canvas marker: ${marker}`);
assert(!canvas.includes('let glitchOnTop = false;'), 'legacy inline priority resolver still runs in draw()');
assert(!canvas.includes('const pulseFrames = Math.max(1, Math.round(60 / Math.max(0.1, pulseSpd)));'), 'legacy inline pulse resolver still runs in draw()');
assert((canvas.match(/createGraphics\(/g) ?? []).length === 2, 'Pass 26 allocated another p5.Graphics surface');
assert(!canvas.includes('SortMosh') && !runtimeSource.includes('SortMosh'), 'rejected Sort-Mosh code detected');
assert(!canvas.includes('flowMelt') && !canvas.includes('flowLag') && !canvas.includes('flowCohesion'), 'rejected Flow controls detected');

const drawStart = canvas.indexOf('function draw() {');
const drawEnd = canvas.indexOf('\nfunction drawWaiting()', drawStart);
const drawBody = canvas.slice(drawStart, drawEnd);
assert(!drawBody.includes('=>'), 'Pass 26 introduced a per-frame arrow closure inside draw()');
assert(!drawBody.includes('function ('), 'Pass 26 introduced a per-frame function closure inside draw()');

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.scripts?.['validate:pass26'] === 'node scripts/validate-pass26.mjs', 'validate:pass26 package script missing');

console.log('PASS 26 validation passed.');
console.log(`${parityCases.toLocaleString()} front-stage resolver cases match the exact Pass 22 priority calculation.`);
console.log('SCAN TOP, GLITCH TOP, NEUTRAL, and PULSE execute through two immutable precompiled front-stage groups.');
console.log('Flow/effects, controls, presets, media/output paths, and src-tauri remain unchanged; no render buffer was added.');
