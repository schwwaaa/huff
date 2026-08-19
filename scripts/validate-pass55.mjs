import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
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

const keyboard = extract('hookKeyboard');
const editable = extract('_keyboardEventTargetsEditableControl');

// Pass 55 keyboard contract.
ok(!keyboard.includes("e.key === 'p'") && !keyboard.includes('e.key === "p"'), 'P is no longer a global key binding');
ok(!keyboard.includes('toggleUI()'), 'keyboard handler no longer hides/shows the HUFF controls');
ok(canvas.match(/toggleUI\(/g)?.length === 1, 'toggleUI remains only as an unbound legacy helper');
ok(!canvas.includes('P to show'), 'hidden-UI indicator no longer promises the removed P shortcut');
ok(keyboard.includes('_keyboardEventTargetsEditableControl(e)'), 'global shortcut handler checks editable focus');
ok(keyboard.indexOf('_keyboardEventTargetsEditableControl(e)') < keyboard.indexOf("e.key === 'f'"), 'editable guard runs before fullscreen shortcut');
ok(keyboard.indexOf('_keyboardEventTargetsEditableControl(e)') < keyboard.indexOf("e.key === 'z'"), 'editable guard runs before instrument undo shortcut');
ok(editable.includes('target.isContentEditable'), 'contenteditable fields consume typing normally');
ok(editable.includes("closest('input, textarea, select"), 'form controls consume typing normally');
ok(editable.includes('[role=\\"textbox\\"]'), 'ARIA textboxes consume typing normally');
ok(keyboard.includes("e.key === 'f'") && keyboard.includes('requestFullscreen'), 'F fullscreen shortcut remains outside editable controls');
ok(keyboard.includes("e.key === 'z'") && keyboard.includes('(e.ctrlKey || e.metaKey)'), 'Ctrl/Cmd+Z instrument undo remains outside editable controls');

// Preset-name field remains directly editable and Enter still invokes Save File.
const presetNameBlock = canvas.slice(canvas.indexOf("_$('presetName')?.addEventListener('keydown'"), canvas.indexOf('// Reset btn'));
ok(presetNameBlock.includes("e.key === 'Enter'"), 'preset name Enter-to-save remains');
ok(presetNameBlock.includes('savePresetToFile()'), 'preset name Enter still opens Save File workflow');

// Pass 54 / Pass 53 / Pass 52 / Pass 51 non-keyboard systems remain exact accepted bytes.
const protectedFiles = new Map([
  ['src-tauri/src/main.rs','2185862ffa089595cdd51408492c5ab7a4c947cb884ca92a84472ca6d47073d9'],
  ['src-tauri/tauri.conf.json','3845255df948f024f1b1f799934b2b3640fb6eec2427b7638ea3a2aba656a1ae'],
  ['src/effects.js','78f59e6bd5e6f7c687f5f15eeb5e3f08783105f97c617920c779050994def4f3'],
  ['src/pipeline-runtime.js','9e33790d247c57742bd60222091f683c80299d51c7c428307c8b392f1749bfd9'],
  ['src/syphon-stream-worker.js','43bf5e67908ee93b2a371c84ae65b37d8c4499c7b3e4a1b18d6ada6be460750b'],
  ['src/index.html','b64e228e7044ff4a20bd59e9dc57eb346d8f7020e3e0a4fff5798d9e8f8e7269'],
]);
for (const [rel, expected] of protectedFiles) {
  ok(sha(fs.readFileSync(path.join(root, rel))) === expected, `${rel} remains exact Pass 54 accepted bytes`);
}

// Exact accepted render-stage functions remain untouched.
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

console.log(`HUFF Classic Pass 55 validation: ${checks.toLocaleString()} checks PASS`);
