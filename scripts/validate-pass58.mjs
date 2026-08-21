import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const shaBytes = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
const shaText = text => crypto.createHash('sha256').update(text).digest('hex');

let checks = 0;
function ok(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  checks++;
}

const canvas = read('src/canvas.js');
const html = read('src/index.html');
const runtimeText = read('src/pipeline-runtime.js');

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  ok(start >= 0, `${name} exists`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`FAIL: could not extract ${name}`);
}

// Execute the immutable recipe registry without loading the browser renderer.
const context = { window: {}, console };
vm.runInNewContext(runtimeText, context, { filename: 'pipeline-runtime.js' });
const runtime = context.window.HuffPipelineRuntime;
ok(!!runtime, 'pipeline runtime exports successfully');
ok(runtime.version === 3, 'pipeline runtime version is Pass 58 generation');
ok(runtime.recipeVersion === 2, 'recipe schema version is Pass 58 generation');

const expectedIds = [
  'classic',
  'crisp-finish',
  'temporal-underlay',
  'symmetry-memory',
  'color-memory',
  'flow-finish',
  'feedback-finish',
];
ok(JSON.stringify(Object.keys(runtime.PIPELINE_RECIPES)) === JSON.stringify(expectedIds), 'exact seven-recipe registry is exposed');

const expectedDiagrams = {
  classic: ['image-feed','feedback','flow','symmetry','solarize'],
  'crisp-finish': ['feedback','flow','symmetry','solarize','image-feed'],
  'temporal-underlay': ['feedback','flow','image-feed','symmetry','solarize'],
  'symmetry-memory': ['image-feed','symmetry','feedback','flow','solarize'],
  'color-memory': ['image-feed','solarize','feedback','flow','symmetry'],
  'flow-finish': ['image-feed','feedback','symmetry','solarize','flow'],
  'feedback-finish': ['image-feed','flow','symmetry','solarize','feedback'],
};

const expectedExecution = {
  classic: [
    'source-sync','persistent-decay','front-stage-priority','global-mix:before',
    'feedback','global-mix:after','flow','global-mix:afterflow','symmetry',
    'solarize','global-mix:final','presentation',
  ],
  'crisp-finish': [
    'source-sync','persistent-decay','global-mix:before','feedback',
    'global-mix:after','flow','global-mix:afterflow','symmetry','solarize',
    'front-stage-priority','global-mix:final','presentation',
  ],
  'temporal-underlay': [
    'source-sync','persistent-decay','global-mix:before','feedback',
    'global-mix:after','flow','global-mix:afterflow','front-stage-priority',
    'symmetry','solarize','global-mix:final','presentation',
  ],
  'symmetry-memory': [
    'source-sync','persistent-decay','front-stage-priority','symmetry',
    'global-mix:before','feedback','global-mix:after','flow',
    'global-mix:afterflow','solarize','global-mix:final','presentation',
  ],
  'color-memory': [
    'source-sync','persistent-decay','front-stage-priority','solarize',
    'global-mix:before','feedback','global-mix:after','flow',
    'global-mix:afterflow','symmetry','global-mix:final','presentation',
  ],
  'flow-finish': [
    'source-sync','persistent-decay','front-stage-priority','global-mix:before',
    'feedback','global-mix:after','symmetry','solarize','flow',
    'global-mix:afterflow','global-mix:final','presentation',
  ],
  'feedback-finish': [
    'source-sync','persistent-decay','front-stage-priority','flow',
    'global-mix:afterflow','symmetry','solarize','global-mix:before',
    'feedback','global-mix:after','global-mix:final','presentation',
  ],
};

const handlerNames = Object.keys(runtime.STAGE_RESOURCE_RULES);
const handlers = Object.fromEntries(handlerNames.map(stage => [
  stage,
  (_frame, step) => {
    _frame.log.push(step.stage + (step.conditionalPosition ? `:${step.conditionalPosition}` : ''));
  },
]));
const registry = runtime.compileRecipeRegistry(runtime.PIPELINE_RECIPES, handlers);
ok(JSON.stringify(registry.ids) === JSON.stringify(expectedIds), 'all seven recipes compile into immutable plans');

for (const id of expectedIds) {
  const definition = runtime.PIPELINE_RECIPES[id];
  ok(runtime.recipeValidations[id]?.valid === true, `${id} built-in validation passes`);
  ok(definition.fullResolutionBufferCount === 3, `${id} keeps exactly three full-resolution buffers`);
  ok(JSON.stringify(definition.scratchResources) === JSON.stringify(['gScratch']), `${id} keeps gScratch as the only scratch surface`);
  ok(definition.declaredCycles.length === 0, `${id} declares no same-frame cycle`);
  ok(JSON.stringify(definition.diagram) === JSON.stringify(expectedDiagrams[id]), `${id} operator diagram order is exact`);

  const frame = { log: [] };
  const plan = registry.get(id);
  plan.executeSource(frame);
  plan.executePersistent(frame);
  plan.executeEffectsAndPresentation(frame);
  ok(JSON.stringify(frame.log) === JSON.stringify(expectedExecution[id]), `${id} executable stage order is exact`);
}

ok(runtime.PIPELINE_RECIPES.classic.compatibilityDefault === true, 'CLASSIC remains the compatibility default');
ok(runtime.PIPELINE_RECIPES['feedback-finish'].experimental === true, 'FEEDBACK FINISH is explicitly marked experimental');

const switcher = runtime.createRecipeSwitcher(registry, runtime.CLASSIC_RECIPE_ID);
ok(switcher.activeId === 'classic', 'recipe switcher starts on CLASSIC');
const selected = switcher.select('color-memory');
ok(switcher.activeId === 'color-memory' && selected === registry.get('color-memory'), 'recipe switcher selects a precompiled alternate atomically');
switcher.select('not-a-real-recipe');
ok(switcher.activeId === 'classic', 'unknown recipe falls back to CLASSIC');
ok(switcher.fallbackCount === 1, 'unknown recipe fallback is counted');

// Existing effect algorithms and native output code remain exact Pass 57 bytes.
const protectedFiles = new Map([
  ['src/effects.js', '78f59e6bd5e6f7c687f5f15eeb5e3f08783105f97c617920c779050994def4f3'],
  ['src/syphon-stream-worker.js', '43bf5e67908ee93b2a371c84ae65b37d8c4499c7b3e4a1b18d6ada6be460750b'],
  ['src-tauri/src/main.rs', '2185862ffa089595cdd51408492c5ab7a4c947cb884ca92a84472ca6d47073d9'],
  ['src-tauri/src/syphon.rs', 'c763c793c6a1e47579625639e229c2565afd27dfd63e62e7825d6ba7ecc3e944'],
]);
for (const [rel, expected] of protectedFiles) {
  ok(shaBytes(rel) === expected, `${rel} remains exact Pass 57 bytes`);
}

// The creative algorithms themselves are protected. Pass 58 changes dispatch
// topology, not Feedback / Flow / Symmetry / Solarize implementations.
const protectedFunctions = new Map([
  ['_runFeedbackStage','c16665c91eba693b618a3bb5db355e861ee4a025f7f3b4d1a271f93f60dbcc3a'],
  ['_runFlowStage','940fe6d63c217e9443245d9349e59aa142243dae905c783bed50aef2c6ba038a'],
  ['_feedbackActuallyOwnsBuffer','74aad95e9f517948cc021964f02e825367fde4310db63594486e0eff53c1d63e'],
  ['_symmetryShouldReadCleanLiveSource','dfb6f7baa1589880010313b2270010374ec7ddabda1e9fd14d957ad3b736f92d'],
  ['_runSymmetryStage','c5e3348fe7c6613b27154f44e9efbcea8d84c4b3106abf339e67e87ef96d17d3'],
  ['_solarizeShouldReadCleanLiveSource','dd01db0a83d7455bf61462b6dbf726cd40d0258a74ca6bc9007da0cac493276d'],
  ['_runSolarizeStage','be55f18343db0255af4e15a466a23ac9edd835bb1109a4c8957835ddef5aa5f6'],
  ['_runPresentationStage','50be01b68214d834124c3e9419a684e36a0f5318f2f2864ee22ac5c20571b001'],
]);
for (const [name, expected] of protectedFunctions) {
  ok(shaText(extractFunction(canvas, name)) === expected, `${name} remains exact accepted implementation`);
}

// Global Mix fusion remains available only for the two routes whose relative
// transform order matches the original proof.
const fuse = extractFunction(canvas, '_canFuseGlobalMixIntoSolarize');
ok(fuse.includes('frame.recipeId !== _pipelineRuntime.CLASSIC_RECIPE_ID'), 'new recipes disable the old Classic-only Global Mix fusion proof');
ok(fuse.includes('frame.recipeId !== _pipelineRuntime.CRISP_FINISH_RECIPE_ID'), 'CRISP FINISH retains the original fusion proof');
ok(canvas.includes('_pipelineFrame.recipeId = _pipelineRecipeSwitcher.activeId;'), 'selected recipe ID is fixed on the frame before execution');

// Presets accept every built-in recipe while retaining CLASSIC fallback.
ok(canvas.includes("new Set(Object.keys(window.HuffPipelineRuntime?.PIPELINE_RECIPES"), 'preset route validation is driven by the runtime registry');
ok(canvas.includes("'pipelineRecipe','layerPriority'"), 'pipeline recipe remains preset-scoped');
ok(canvas.includes("sourceData.pipelineRecipe = 'classic';"), 'unknown or legacy route still falls back to CLASSIC');

// UI exposes the same runtime choices and a live minimal diagram.
for (const id of expectedIds) {
  ok(html.includes(`value="${id}"`), `pipeline selector exposes ${id}`);
}
ok(html.includes('id="pipelineDiagram"'), 'minimal pipeline diagram is present under the selector');
ok(html.includes('pipeline-diagram-stage'), 'pipeline diagram uses stage boxes');
ok(html.includes('pipeline-diagram-arrow'), 'pipeline diagram uses directional arrows');
ok(canvas.includes('definition.diagram.forEach'), 'pipeline diagram is generated from the executable recipe definition');
ok(canvas.includes('els.pipelineDiagram.replaceChildren(fragment)'), 'pipeline diagram updates in place when the recipe changes');
ok(canvas.includes("stageId === 'image-feed' && feeds.length"), 'image-feed node reflects current feed activity');
ok(canvas.includes("'feedback-finish': 'FEEDBACK FINISH: IMAGE FEED → FLOW → SYMMETRY → SOLARIZE → FEEDBACK'"), 'experimental feedback-finish quick route is explicit');

// Guard against accidental duplicate element IDs.
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const seen = new Set();
const duplicates = [];
for (const id of ids) {
  if (seen.has(id)) duplicates.push(id);
  seen.add(id);
}
ok(duplicates.length === 0, `index.html has no duplicate element IDs${duplicates.length ? `: ${duplicates.join(', ')}` : ''}`);

// Pass documentation required in the package.
for (const rel of [
  'HUFF_CLASSIC_PIPELINE_RECIPE_PASS_58.txt',
  'PIPELINE_RECIPE_EXPANSION_AUDIT.md',
  'CHANGED_FILES_PASS58.md',
  'baseline/pass57-pass58-protected.sha256',
  'GIT_COMMIT_MESSAGE.md',
]) ok(fs.existsSync(path.join(root, rel)), `${rel} is present`);

console.log(`HUFF Classic Pass 58 validation: ${checks} checks PASS`);
