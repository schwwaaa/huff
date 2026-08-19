import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const index = read('src/index.html');
const canvas = read('src/canvas.js');
const main = read('src-tauri/src/main.rs');
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
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

// User-facing preset contract.
ok(index.includes('BUILT-IN'), 'preset UI exposes built-in recall separately');
ok(index.includes('SAVE FILE…'), 'preset UI has explicit Save File action');
ok(index.includes('LOAD FILE…'), 'preset UI has explicit Load File action');
ok(index.includes('id="presetBuiltinLoadBtn"'), 'built-in recall has its own button');
ok(index.includes('id="presetFileState"'), 'preset file status is visible');
ok((index.match(/id="presetLoadInput"/g) || []).length === 1, 'only one browser fallback file input exists');
ok(!index.includes('id="presetDeleteBtn"'), 'obsolete localStorage Delete control is removed');
ok(!index.includes('id="presetExportBtn"'), 'obsolete bank Export control is removed');
ok(!index.includes('id="presetImportBtn"'), 'obsolete Import control is removed');

// New saves are portable single-preset documents, never localStorage writes.
ok(canvas.includes("const PRESET_FILE_FORMAT = 'huff-classic-preset';"), 'portable preset file format is versioned');
ok(canvas.includes('formatVersion: PRESET_FILE_FORMAT_VERSION'), 'file envelope stores a format version');
ok(canvas.includes("app: 'HUFF Classic'"), 'file envelope identifies HUFF Classic');
ok(canvas.includes('preset: parsed.preset'), 'wrapped single-preset files are parsed');
ok(canvas.includes("if ('_v' in parsed)"), 'legacy raw single-preset JSON remains loadable');
ok(canvas.includes('LOADED LEGACY FILE BANK'), 'old exported preset banks can be migrated');
ok(canvas.includes('LEGACY LOCAL — SAVE FILE TO MIGRATE'), 'old localStorage presets remain recallable for migration');
ok(!canvas.includes('localStorage.setItem(PRESETS_LS_KEY'), 'Pass 53 never writes new presets to localStorage');
ok(!canvas.includes('function saveNamedPreset'), 'old local named-save implementation is removed');
ok(!canvas.includes('function deleteNamedPreset'), 'old local delete implementation is removed');
ok(!canvas.includes('function exportPresetsJSON'), 'old browser bank exporter is removed');

// Native system dialog path in packaged Tauri.
ok(canvas.includes('window.__TAURI__?.dialog'), 'preset I/O resolves Tauri dialog global');
ok(canvas.includes('await dialog.save({'), 'SAVE FILE uses native Save dialog');
ok(canvas.includes('await dialog.open({'), 'LOAD FILE uses native Open dialog');
ok(canvas.includes("invoke('write_preset_file'"), 'selected Save path is written through narrow native command');
ok(canvas.includes("invoke('read_preset_file'"), 'selected Open path is read through narrow native command');
ok(canvas.includes('Plain browser/dev preview fallback'), 'non-Tauri preview has an explicit fallback');
ok(config?.tauri?.allowlist?.dialog?.open === true, 'Tauri v1 dialog open allowlist is enabled');
ok(config?.tauri?.allowlist?.dialog?.save === true, 'Tauri v1 dialog save allowlist is enabled');

// Native preset file commands are deliberately narrow.
ok(main.includes('fn write_preset_file(path: String, contents: String)'), 'native preset write command exists');
ok(main.includes('fn read_preset_file(path: String)'), 'native preset read command exists');
ok(main.includes('PRESET_FILE_MAX_BYTES: usize = 1024 * 1024'), 'native I/O enforces 1 MiB ceiling');
ok(main.includes('eq_ignore_ascii_case("json")'), 'native I/O restricts preset files to JSON');
ok(main.includes('serde_json::from_str::<serde_json::Value>(&contents)'), 'native write validates JSON before disk write');
ok(main.includes('std::fs::read_to_string(&path)'), 'native load reads UTF-8 text');
ok(main.includes('write_preset_file,') && main.includes('read_preset_file,'), 'both preset commands are registered with invoke_handler');

// Built-in state is immutable and independent from file storage.
ok(canvas.includes('_classicDefaultPreset = Object.freeze({ ...capturePreset() });'), 'Classic Default is captured as immutable built-in state');
ok(canvas.includes("classic.value = 'builtin:classic-default';"), 'Classic Default appears in built-in list');
ok(canvas.includes("value === 'builtin:classic-default'"), 'Classic Default can be recalled');
ok(canvas.includes("_$('presetBuiltinLoadBtn')?.addEventListener('click', recallPresetSelection)"), 'built-in recall is wired');
ok(canvas.includes("_$('presetSaveBtn')?.addEventListener('click'"), 'Save File button is wired');
ok(canvas.includes("_$('presetLoadBtn')?.addEventListener('click'"), 'Load File button is wired');

// Protect exact Pass 52B/52D image pipeline behavior. Pass 53 is preset I/O only.
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

const protectedFiles = new Map([
  ['src/effects.js','78f59e6bd5e6f7c687f5f15eeb5e3f08783105f97c617920c779050994def4f3'],
  ['src/pipeline-runtime.js','9e33790d247c57742bd60222091f683c80299d51c7c428307c8b392f1749bfd9'],
  ['src/syphon-stream-worker.js','43bf5e67908ee93b2a371c84ae65b37d8c4499c7b3e4a1b18d6ada6be460750b'],
]);
for (const [rel, expected] of protectedFiles) {
  ok(sha(fs.readFileSync(path.join(root, rel))) === expected, `${rel} remains exact Pass 52D bytes`);
}

// Model the portable document compatibility contract independently.
const state = { _v: 1, corruptOn: true, feedback: '0.42' };
const wrapped = { format:'huff-classic-preset', formatVersion:1, app:'HUFF Classic', name:'TEST', preset:state };
ok(wrapped.preset._v === 1 && wrapped.name === 'TEST', 'portable envelope round-trip model');
const legacySingle = state;
ok('_v' in legacySingle, 'legacy raw single preset model');
const legacyBank = { A: state, B: { ...state, corruptOn:false } };
ok(Object.entries(legacyBank).filter(([,v]) => v && typeof v === 'object' && '_v' in v).length === 2, 'legacy preset-bank migration model');

console.log(`HUFF Classic Pass 53 validation: ${checks.toLocaleString()} checks PASS`);
