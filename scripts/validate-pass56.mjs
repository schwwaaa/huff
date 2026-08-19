import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const canvas = read('src/canvas.js');
let checks = 0;
function ok(cond, msg) { if (!cond) throw new Error(`FAIL: ${msg}`); checks++; }
function sha(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function extract(name, isAsync=false) {
  const marker = `${isAsync ? 'async ' : ''}function ${name}(`;
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

const save = extract('savePresetToFile', true);
const register = extract('_registerSessionLoadedPreset');
const display = extract('_sessionPresetDisplayNames');

// Pass 56 contract: SAVE FILE has two outputs — durable JSON + temporary recall slot.
ok(save.includes("invoke('write_preset_file', { path, contents })"), 'native JSON file save remains authoritative durable output');
ok(save.includes('_registerSessionLoadedPreset('), 'successful Save File registers the saved preset in the session bank');
ok(save.indexOf("invoke('write_preset_file'") < save.indexOf('_registerSessionLoadedPreset('), 'session registration happens only after native file write succeeds');
ok(save.includes('documentData.preset'), 'session slot uses the exact snapshot serialized to disk');
ok(save.includes('savedPath || path || filename'), 'native saved path is used as stable session identity');
ok(save.includes('refreshPresetList();'), 'dropdown refreshes immediately after save');
ok(save.includes("sel.value = `session:${sessionId}`"), 'newly saved preset becomes selected in dropdown');
ok(save.includes('session saved · ${name} · clears on quit'), 'native save reports temporary in-app lifetime');
ok(save.includes('saved + added to this session'), 'native save toast explains both outcomes');

// Browser/dev fallback mirrors the same temporary-bank behavior.
const browserDownloadPos = save.indexOf('_browserDownloadPreset(contents, filename)');
ok(browserDownloadPos >= 0, 'browser download fallback remains');
const browserRegisterPos = save.indexOf('_registerSessionLoadedPreset(', browserDownloadPos);
ok(browserRegisterPos > browserDownloadPos, 'browser fallback also registers saved snapshot after initiating download');
ok(save.indexOf('refreshPresetList();', browserRegisterPos) > browserRegisterPos, 'browser fallback refreshes session dropdown');
ok(save.includes('downloaded + added to this session'), 'browser fallback reports session registration');

ok(canvas.includes("group.label = 'SESSION — SAVED / LOADED';"), 'session group identifies both saved and loaded presets');
ok(!canvas.includes('localStorage.setItem(PRESETS_LS_KEY'), 'new preset saves do not persist the HUFF session bank internally');
ok(!canvas.includes('sessionStorage.'), 'session bank remains RAM-only');

// Same saved path refreshes a slot rather than multiplying duplicates.
const context = { _sessionLoadedPresets: new Map(), _sessionLoadedPresetSerial: 0 };
vm.createContext(context);
vm.runInContext(`${register}\n${display}`, context);
const first = vm.runInContext(`_registerSessionLoadedPreset('A', {_v:1, amount:'1'}, '/tmp/A.json', 'file')`, context);
const second = vm.runInContext(`_registerSessionLoadedPreset('A revised', {_v:1, amount:'2'}, '/tmp/A.json', 'file')`, context);
ok(first === second, 'saving the same file path refreshes its existing session slot');
ok(context._sessionLoadedPresets.size === 1, 'same-path resave does not create duplicate dropdown entries');
ok(context._sessionLoadedPresets.get(first).preset.amount === '2', 'resave updates the recall snapshot');
ok(context._sessionLoadedPresets.get(first).name === 'A revised', 'resave updates the displayed preset name');

// Pass 55 and accepted runtime boundaries remain untouched.
const protectedFiles = new Map([
  ['src-tauri/src/main.rs','2185862ffa089595cdd51408492c5ab7a4c947cb884ca92a84472ca6d47073d9'],
  ['src-tauri/tauri.conf.json','3845255df948f024f1b1f799934b2b3640fb6eec2427b7638ea3a2aba656a1ae'],
  ['src/effects.js','78f59e6bd5e6f7c687f5f15eeb5e3f08783105f97c617920c779050994def4f3'],
  ['src/pipeline-runtime.js','9e33790d247c57742bd60222091f683c80299d51c7c428307c8b392f1749bfd9'],
  ['src/syphon-stream-worker.js','43bf5e67908ee93b2a371c84ae65b37d8c4499c7b3e4a1b18d6ada6be460750b'],
  ['src/index.html','b64e228e7044ff4a20bd59e9dc57eb346d8f7020e3e0a4fff5798d9e8f8e7269'],
]);
for (const [rel, expected] of protectedFiles) {
  ok(sha(fs.readFileSync(path.join(root, rel))) === expected, `${rel} remains exact accepted Pass 55 bytes`);
}

const keyboard = extract('hookKeyboard');
ok(!keyboard.includes("e.key === 'p'") && !keyboard.includes('toggleUI()'), 'Pass 55 P-key removal remains intact');
ok(keyboard.includes('_keyboardEventTargetsEditableControl(e)'), 'Pass 55 editable-focus guard remains intact');

const protectedFunctions = new Map([
  ['_runSourceSyncStage','c19ed1745eeb2c997ba2f8cf2617fcf7534f5a2f170b8d256a39d0ac8b869c1a'],
  ['_runPersistentDecayStage','587b604a7f1f2a8402c080a4edaafde3dcccb1a0511edeb7d0d3d6ba084669b5'],
  ['_runGlitchLumaFrontGroup','7b85b44cd1b424d30a02a3e73c26f7f8f865f31e8c3021276f951e3c73d3d828'],
  ['_runScanlineFrontGroup','9878d33437655c0eda9116878a54cb86624f98e5a2ff02e023170fc19825ac11'],
  ['_runFrontStagePriority','a91b4095c38aaff4b3e5681db9b48b5772c134d1d72d750261807629c711bde4'],
  ['_runGlobalMixStage','3069c3bd61335e28565474ba055eb9cb60f3f07813fc9f332ae514fe51bb342c'],
  ['_runFeedbackStage','c16665c91eba693b618a3bb5db355e861ee4a025f7f3b4d1a271f93f60dbcc3a'],
  ['_runFlowStage','940fe6d63c217e9443245d9349e59aa142243dae905c783bed50aef2c6ba038a'],
  ['_runSymmetryStage','c5e3348fe7c6613b27154f44e9efbcea8d84c4b3106abf339e67e87ef96d17d3'],
  ['_runSolarizeStage','be55f18343db0255af4e15a466a23ac9edd835bb1109a4c8957835ddef5aa5f6'],
  ['_runPresentationStage','50be01b68214d834124c3e9419a684e36a0f5318f2f2864ee22ac5c20571b001'],
  ['draw','9ebe5cf7eb848acf9f76a22436e6f164e68053f30968fd61b2748649e17b7ad8'],
]);
for (const [name, expected] of protectedFunctions) {
  ok(sha(extract(name)) === expected, `${name} remains exact accepted render behavior`);
}

console.log(`HUFF Classic Pass 56 validation: ${checks.toLocaleString()} checks PASS`);
