import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  PIPELINE_ZONES,
  STAGE_CONTRACTS,
  PASS22_ROUTE_SKELETON,
  CRISP_FINISH_ROUTE_SKELETON,
  PIPELINE_RECIPE_DEFINITIONS,
  validateStageContractRegistry,
} from '../pipeline/stage-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = rel => sha256(fs.readFileSync(path.join(root, rel)));

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
  return sha256(bytes);
}

function verifyAgainstManifest(relDir, manifestRel, allowedChanged = [], allowedAdded = []) {
  const base = path.join(root, relDir);
  const expected = parseManifest(manifestRel);
  const changed = new Set(allowedChanged);
  const added = new Set(allowedAdded);

  for (const [rel, digest] of expected) {
    const full = path.join(base, ...rel.split('/'));
    assert(fs.existsSync(full), `${relDir}/${rel} missing`);
    if (!changed.has(rel)) {
      assert(digestFilesystemEntry(full) === digest, `${relDir}/${rel} changed outside Pass 30 scope`);
    }
  }
  for (const rel of walkFiles(base)) {
    if (!expected.has(rel)) assert(added.has(rel), `${relDir}/${rel} is an undeclared added runtime file`);
  }
}

function normalizeRoute(route) {
  return route.map(step => ({
    zone: step.zone,
    stage: step.stage,
    ...(step.conditionalPosition ? { conditionalPosition: step.conditionalPosition } : {}),
    ...(step.members ? { members: [...step.members] } : {}),
  }));
}

const registryValidation = validateStageContractRegistry();
assert(registryValidation.valid, `stage contract registry invalid: ${registryValidation.errors.join('; ')}`);
assert(registryValidation.contractCount === 11, 'stage contract count changed');
assert(registryValidation.routeStepCount === 12, 'CLASSIC route step count changed');
assert(registryValidation.recipeCount === 2, 'expected exactly two validated Classic recipes');
assert(PIPELINE_ZONES.includes('final-overlays'), 'final-overlays zone is missing');

const runtimeSource = read('src/pipeline-runtime.js');
const warnings = [];
const sandbox = {
  window: {},
  console: {
    log: (...args) => console.log(...args),
    warn: (...args) => warnings.push(args.join(' ')),
    error: (...args) => console.error(...args),
  },
};
vm.runInNewContext(runtimeSource, sandbox, { filename: 'pipeline-runtime.js' });
const runtime = sandbox.window.HuffPipelineRuntime;
assert(runtime, 'browser pipeline runtime did not register');
assert(runtime.version === 2, 'compatibility runtime version changed');
assert(runtime.recipeVersion === 1, 'unexpected recipe version');
assert(runtime.validation?.valid === true, 'CLASSIC recipe validation failed');
assert(runtime.frontStageValidation?.valid === true, 'front-stage validation failed');
assert(Object.keys(runtime.recipeValidations).length === 2, 'browser recipe validation count changed');
assert(Object.isFrozen(runtime.PIPELINE_RECIPES), 'recipe registry must be frozen');
assert(Object.isFrozen(runtime.PASS22_SERIAL_RECIPE), 'CLASSIC route must be frozen');
assert(Object.isFrozen(runtime.CRISP_FINISH_SERIAL_RECIPE), 'CRISP FINISH route must be frozen');

assert(
  JSON.stringify(normalizeRoute(runtime.PASS22_SERIAL_RECIPE)) === JSON.stringify(normalizeRoute(PASS22_ROUTE_SKELETON)),
  'browser CLASSIC route differs from the source registry',
);
assert(
  JSON.stringify(normalizeRoute(runtime.CRISP_FINISH_SERIAL_RECIPE)) === JSON.stringify(normalizeRoute(CRISP_FINISH_ROUTE_SKELETON)),
  'browser CRISP FINISH route differs from the source registry',
);

for (const [id, definition] of Object.entries(PIPELINE_RECIPE_DEFINITIONS)) {
  const browserDefinition = runtime.PIPELINE_RECIPES[id];
  assert(browserDefinition, `browser recipe missing: ${id}`);
  assert(browserDefinition.id === id, `browser recipe key/id mismatch: ${id}`);
  assert(browserDefinition.fullResolutionBufferCount === 3, `${id} changed the full-resolution buffer count`);
  assert(JSON.stringify(browserDefinition.scratchResources) === JSON.stringify(['gScratch']), `${id} changed scratch ownership`);
  assert(browserDefinition.declaredCycles.length === 0, `${id} declared an illegal cycle`);
  assert(runtime.recipeValidations[id]?.valid === true, `${id} failed browser validation`);
}

const classicFrontIndex = runtime.PASS22_SERIAL_RECIPE.findIndex(step => step.stage === 'front-stage-priority');
const crispFrontIndex = runtime.CRISP_FINISH_SERIAL_RECIPE.findIndex(step => step.stage === 'front-stage-priority');
assert(classicFrontIndex === 2, 'CLASSIC front-stage position changed');
assert(runtime.PASS22_SERIAL_RECIPE[classicFrontIndex].zone === 'front-overlays', 'CLASSIC front-stage zone changed');
assert(crispFrontIndex === 9, 'CRISP FINISH front-stage position is not the audited final slot');
assert(runtime.CRISP_FINISH_SERIAL_RECIPE[crispFrontIndex].zone === 'final-overlays', 'CRISP FINISH front-stage zone changed');
assert(
  runtime.CRISP_FINISH_SERIAL_RECIPE.findIndex(step => step.stage === 'flow') < crispFrontIndex,
  'CRISP FINISH does not place Flow before the front-stage group',
);
assert(
  runtime.CRISP_FINISH_SERIAL_RECIPE.findIndex(step => step.stage === 'solarize') < crispFrontIndex,
  'CRISP FINISH does not place Solarize before the front-stage group',
);

const stageIds = Object.keys(runtime.STAGE_RESOURCE_RULES);
const trace = [];
const handlers = Object.fromEntries(stageIds.map(stage => [stage, (_frame, step) => trace.push(`${step.zone}:${stage}`)]));
const compiledRegistry = runtime.compileRecipeRegistry(runtime.PIPELINE_RECIPES, handlers);
assert(Object.isFrozen(compiledRegistry), 'compiled recipe registry must be frozen');
assert(JSON.stringify(compiledRegistry.ids) === JSON.stringify(['classic', 'crisp-finish']), 'compiled recipe ID order changed');

const switcher = runtime.createRecipeSwitcher(compiledRegistry, 'classic');
assert(Object.isFrozen(switcher), 'recipe switcher must be frozen');
assert(switcher.activeId === 'classic', 'switcher did not begin in CLASSIC');

let plan = switcher.select('classic');
plan.executeSource({});
plan.executePersistent({});
plan.executeEffectsAndPresentation({});
assert(
  JSON.stringify(trace.splice(0)) === JSON.stringify(runtime.PASS22_SERIAL_RECIPE.map(step => `${step.zone}:${step.stage}`)),
  'CLASSIC execution trace changed',
);

plan = switcher.select('crisp-finish');
assert(switcher.activeId === 'crisp-finish', 'atomic switch to CRISP FINISH failed');
plan.executeSource({});
plan.executePersistent({});
plan.executeEffectsAndPresentation({});
assert(
  JSON.stringify(trace.splice(0)) === JSON.stringify(runtime.CRISP_FINISH_SERIAL_RECIPE.map(step => `${step.zone}:${step.stage}`)),
  'CRISP FINISH execution trace changed',
);

const crispPlan = switcher.activePlan;
assert(switcher.select('crisp-finish') === crispPlan, 'reselecting the active route replaced its precompiled plan');
plan = switcher.select('not-a-route');
assert(plan === compiledRegistry.plans.classic, 'invalid route did not recover to CLASSIC');
assert(switcher.activeId === 'classic', 'invalid route did not restore CLASSIC ID');
assert(switcher.fallbackCount === 1, 'invalid route fallback was not counted exactly once');
assert(warnings.length === 1, 'invalid route warning count changed');

// The old validateRecipe API remains CLASSIC-compatible for inherited tools.
const reorderedClassic = runtime.PASS22_SERIAL_RECIPE.map(step => ({ ...step }));
[reorderedClassic[4], reorderedClassic[6]] = [reorderedClassic[6], reorderedClassic[4]];
assert(runtime.validateRecipe(reorderedClassic).valid === false, 'legacy CLASSIC validator accepted a reordered route');
assert(runtime.validateRecipe(runtime.PASS22_SERIAL_RECIPE).valid === true, 'legacy CLASSIC validator rejected the compatibility route');
assert(runtime.validateRecipeDefinition(runtime.PIPELINE_RECIPES['crisp-finish']).valid === true, 'definition validator rejected CRISP FINISH');

verifyAgainstManifest(
  'src',
  'baseline/pass29-src.sha256',
  ['canvas.js', 'index.html', 'pipeline-runtime.js'],
  [],
);
verifyAgainstManifest('src-tauri', 'baseline/pass29-src-tauri.sha256', [], []);
const pass29Src = parseManifest('baseline/pass29-src.sha256');
assert(hashFile('src/effects.js') === pass29Src.get('effects.js'), 'Flow/effect implementation changed');
assert(hashFile('src/capability-instrumentation.js') === pass29Src.get('capability-instrumentation.js'), 'capability instrumentation changed');
assert(hashFile('src/canvas.html') === pass29Src.get('canvas.html'), 'canvas mirror changed');

const canvas = read('src/canvas.js');
const index = read('src/index.html');
for (const marker of [
  'const _pipelineRecipeRegistry = _pipelineRuntime.compileRecipeRegistry(',
  'const _pipelineRecipeSwitcher = _pipelineRuntime.createRecipeSwitcher(',
  "const pipelinePlan = _pipelineRecipeSwitcher.select(s.pipelineRecipe || 'classic');",
  'pipelinePlan.executeSource(_pipelineFrame);',
  'pipelinePlan.executePersistent(_pipelineFrame);',
  'pipelinePlan.executeEffectsAndPresentation(_pipelineFrame);',
  "const validRecipeIds = new Set(['classic', 'crisp-finish']);",
  "sourceData.pipelineRecipe = 'classic';",
  "'pipelineRecipe','layerPriority','layerPulseSpeed',",
]) {
  assert(canvas.includes(marker), `missing Pass 30 canvas marker: ${marker}`);
}
assert(!canvas.includes('_pass22PipelinePlan.execute'), 'draw still dispatches the hard-coded Pass 22 plan');
assert((canvas.match(/createGraphics\(/g) ?? []).length === 2, 'Pass 30 allocated another p5.Graphics surface');
assert(!canvas.includes('SortMosh') && !runtimeSource.includes('SortMosh'), 'rejected Sort-Mosh code detected');
assert(!canvas.includes('flowMelt') && !canvas.includes('flowLag') && !canvas.includes('flowCohesion'), 'rejected Flow augmentation detected');

for (const marker of [
  '<select id="pipelineRecipe"',
  '<option value="classic">CLASSIC</option>',
  '<option value="crisp-finish">CRISP FINISH</option>',
  'VALIDATED SERIAL',
]) {
  assert(index.includes(marker), `missing Pass 30 route UI marker: ${marker}`);
}
const classicOption = index.indexOf('<option value="classic">CLASSIC</option>');
const crispOption = index.indexOf('<option value="crisp-finish">CRISP FINISH</option>');
assert(classicOption >= 0 && classicOption < crispOption, 'CLASSIC is not the default first route option');

const drawStart = canvas.indexOf('function draw() {');
const drawEnd = canvas.indexOf('\nfunction drawWaiting()', drawStart);
const drawBody = canvas.slice(drawStart, drawEnd);
const selectAt = drawBody.indexOf('const pipelinePlan = _pipelineRecipeSwitcher.select');
const sourceAt = drawBody.indexOf('pipelinePlan.executeSource');
const persistentAt = drawBody.indexOf('pipelinePlan.executePersistent');
const effectsAt = drawBody.indexOf('pipelinePlan.executeEffectsAndPresentation');
assert(selectAt >= 0 && selectAt < sourceAt && sourceAt < persistentAt && persistentAt < effectsAt, 'route is not selected atomically before frame dispatch');
assert(!drawBody.includes('=>'), 'Pass 30 introduced a per-frame arrow closure inside draw()');
assert(!drawBody.includes('function ('), 'Pass 30 introduced a per-frame function closure inside draw()');

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.scripts?.['validate:pass30'] === 'node scripts/validate-pass30.mjs', 'validate:pass30 package script missing');

console.log('PASS 30 validation passed.');
console.log('CLASSIC preserves the exact Pass 22 route; CRISP FINISH moves only the existing front-stage group to final-overlays.');
console.log('Both recipes compile once, use the existing three full-resolution buffers, declare no cycles, and switch atomically with CLASSIC fallback.');
console.log('Flow/effects, decoder, FrameRing, clocks, mirror, Syphon, Spout, packaging runtime, and native tree remain unchanged.');
