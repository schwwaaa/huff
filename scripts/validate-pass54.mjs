import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('src/index.html');
const canvas = read('src/canvas.js');
let checks = 0;
function ok(cond, msg) { if (!cond) throw new Error(`FAIL: ${msg}`); checks++; }
function sha(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function extract(name) {
  const marker = `function ${name}(`;
  const start = canvas.indexOf(marker);
  ok(start >= 0, `${name} exists`);
  const brace = canvas.indexOf('{', start);
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

// User-facing session-bank contract.
ok(index.includes('>PRESETS</span>'), 'preset row is no longer mislabeled built-in only');
ok(index.includes('— choose preset —'), 'dropdown uses general preset placeholder');
ok(index.includes('loaded for this HUFF session'), 'dropdown tooltip explains session lifetime');
ok(index.includes('disappear from HUFF when the app closes'), 'dropdown tooltip explains non-persistence');
ok(index.includes('JSON files remain on disk'), 'dropdown tooltip distinguishes disk file persistence');
ok(index.includes('added to the preset menu for this HUFF session only'), 'Load File tooltip explains session-bank behavior');
ok(index.includes('loaded files stay for this session'), 'preset status communicates temporary bank');
ok(index.includes('SAVE FILE…') && index.includes('LOAD FILE…'), 'portable Save/Load actions remain');

// Runtime storage model: RAM only, no new local persistence.
ok(canvas.includes('const _sessionLoadedPresets = new Map();'), 'session-loaded preset bank is in-memory Map');
ok(canvas.includes('let _sessionLoadedPresetSerial = 0;'), 'session entries have stable runtime IDs');
ok(canvas.includes("group.label = 'SESSION — LOADED FILES';"), 'session files have their own dropdown group');
ok(canvas.includes("o.value = `session:${id}`;"), 'session dropdown entries use runtime IDs');
ok(canvas.includes("value.startsWith('session:')"), 'session dropdown entries are recallable');
ok(canvas.includes('_sessionLoadedPresets.get(id)'), 'recall resolves current-session preset state');
ok(canvas.includes('session loaded · ${name}'), 'session recall reports session state');
ok(canvas.includes('clears on quit'), 'load status explicitly reports temporary lifetime');
ok(!canvas.includes('localStorage.setItem(PRESETS_LS_KEY'), 'session bank does not write new preset data to localStorage');
ok(!canvas.includes('sessionStorage.'), 'session bank does not use browser sessionStorage');
ok(!canvas.includes('write_preset_file') || canvas.includes("invoke('write_preset_file'"), 'native write remains explicit Save File path only');

// Loading a single JSON must register it, refresh menu, select it, then apply it.
const applyLoaded = extract('_applyLoadedPresetDocument');
ok(applyLoaded.includes('_registerSessionLoadedPreset(name, doc.preset'), 'single JSON is registered into session bank');
ok(applyLoaded.includes('refreshPresetList();'), 'session dropdown refreshes after load');
ok(applyLoaded.includes("sel.value = `session:${id}`"), 'loaded single preset becomes selected dropdown entry');
ok(applyLoaded.includes('applyPreset(doc.preset)'), 'loaded single preset still applies immediately');
ok(applyLoaded.includes('loaded into this session'), 'single-load toast describes session behavior');
ok(!applyLoaded.includes('_sessionLoadedPresets.clear()'), 'loading another file does not erase the performance bank');

// Legacy exported banks should populate the same temporary performance bank.
ok(applyLoaded.includes("_registerSessionLoadedPreset(name, preset, sourceKey, 'legacy-bank')"), 'legacy bank entries register into session bank');
ok(applyLoaded.includes('loadedIds.length'), 'legacy bank load tracks all session entries');
ok(applyLoaded.includes('Loaded ${loadedIds.length} presets into this HUFF session'), 'multi-entry bank reports temporary load');

// Execute the actual registration/display helpers in an isolated VM.
const context = {
  _sessionLoadedPresets: new Map(),
  _sessionLoadedPresetSerial: 0,
};
vm.createContext(context);
vm.runInContext(`${extract('_registerSessionLoadedPreset')}\n${extract('_sessionPresetDisplayNames')}`, context);
const a = vm.runInContext(`_registerSessionLoadedPreset('LOOK A', { _v:1, amount:1 }, '/tmp/a.json', 'file')`, context);
ok(a === 'loaded-1', 'first loaded file gets first session ID');
ok(context._sessionLoadedPresets.size === 1, 'first load creates one session slot');
const b = vm.runInContext(`_registerSessionLoadedPreset('LOOK B', { _v:1, amount:2 }, '/tmp/b.json', 'file')`, context);
ok(b === 'loaded-2', 'second file gets independent session ID');
ok(context._sessionLoadedPresets.size === 2, 'multiple loaded files accumulate for performance');
const a2 = vm.runInContext(`_registerSessionLoadedPreset('LOOK A UPDATED', { _v:1, amount:3 }, '/tmp/a.json', 'file')`, context);
ok(a2 === a, 'reloading the same file refreshes its existing session slot');
ok(context._sessionLoadedPresets.size === 2, 'same-file reload does not duplicate slot');
ok(context._sessionLoadedPresets.get(a).preset.amount === 3, 'same-file reload refreshes stored preset data');
ok(context._sessionLoadedPresets.get(a).name === 'LOOK A UPDATED', 'same-file reload refreshes slot name');
const c = vm.runInContext(`_registerSessionLoadedPreset('LOOK B', { _v:1, amount:4 }, '/tmp/c.json', 'file')`, context);
ok(c === 'loaded-3', 'same name from different file remains a distinct performance slot');
const display = vm.runInContext(`_sessionPresetDisplayNames()`, context);
ok(display.length === 3, 'display helper returns all session slots');
ok(display[1][2] === 'LOOK B', 'first duplicate name remains unchanged');
ok(display[2][2] === 'LOOK B (2)', 'later duplicate name is visibly disambiguated');

// Pass 53 native preset file I/O must remain byte-identical.
const protectedFiles = new Map([
  ['src-tauri/src/main.rs','2185862ffa089595cdd51408492c5ab7a4c947cb884ca92a84472ca6d47073d9'],
  ['src-tauri/tauri.conf.json','3845255df948f024f1b1f799934b2b3640fb6eec2427b7638ea3a2aba656a1ae'],
  ['src/effects.js','78f59e6bd5e6f7c687f5f15eeb5e3f08783105f97c617920c779050994def4f3'],
  ['src/pipeline-runtime.js','9e33790d247c57742bd60222091f683c80299d51c7c428307c8b392f1749bfd9'],
  ['src/syphon-stream-worker.js','43bf5e67908ee93b2a371c84ae65b37d8c4499c7b3e4a1b18d6ada6be460750b'],
]);
for (const [rel, expected] of protectedFiles) {
  ok(sha(fs.readFileSync(path.join(root, rel))) === expected, `${rel} remains exact accepted bytes`);
}

// Exact accepted render-stage functions remain untouched. Pass 54 is preset UX only.
const protectedFunctions = new Map([
  ['_runSourceSyncStage','c19ed1745eeb2c997ba2f8cf2617fcf7534f5a2f170b8d256a39d0ac8b869c1a'],
  ['_runPersistentDecayStage','587b604a7f1f2a8402c080a4edaafde3dcccb1a0511edeb7d0d3d6ba084669b5'],
  ['_runGlitchLumaFrontGroup','7b85b44cd1b424d30a02a3e73c26f7f8f865f31e8c3021276f951e3c73d3d828'],
  ['_runScanlineFrontGroup','9878d33437655c0eda9116878a54cb86624f98e5a2ff02e023170fc19825ac11'],
  ['_runFrontStagePriority','a91b4095c38aaff4b3e5681db9b48b5772c134d1d72d750261807629c711bde4'],
  ['_canFuseGlobalMixIntoSolarize','633092439a02674697e6ef1fa265e5d911557bf072a8cb6cee496aca9ff3d26c'],
  ['_runGlobalMixStage','3069c3bd61335e28565474ba055eb9cb60f3f07813fc9f332ae514fe51bb342c'],
  ['_runFeedbackStage','c16665c91eba693b618a3bb5db355e861ee4a025f7f3b4d1a271f93f60dbcc3a'],
  ['_runFlowStage','940fe6d63c217e9443245d9349e59aa142243dae905c783bed50aef2c6ba038a'],
  ['_feedbackActuallyOwnsBuffer','74aad95e9f517948cc021964f02e825367fde4310db63594486e0eff53c1d63e'],
  ['_symmetryShouldReadCleanLiveSource','dfb6f7baa1589880010313b2270010374ec7ddabda1e9fd14d957ad3b736f92d'],
  ['_runSymmetryStage','c5e3348fe7c6613b27154f44e9efbcea8d84c4b3106abf339e67e87ef96d17d3'],
  ['_solarizeShouldReadCleanLiveSource','dd01db0a83d7455bf61462b6dbf726cd40d0258a74ca6bc9007da0cac493276d'],
  ['_runSolarizeStage','be55f18343db0255af4e15a466a23ac9edd835bb1109a4c8957835ddef5aa5f6'],
  ['_runPresentationStage','50be01b68214d834124c3e9419a684e36a0f5318f2f2864ee22ac5c20571b001'],
  ['draw','9ebe5cf7eb848acf9f76a22436e6f164e68053f30968fd61b2748649e17b7ad8'],
]);
for (const [name, expected] of protectedFunctions) {
  ok(sha(extract(name)) === expected, `${name} remains exact accepted render behavior`);
}

console.log(`HUFF Classic Pass 54 validation: ${checks.toLocaleString()} checks PASS`);
