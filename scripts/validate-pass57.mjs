import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

let checks = 0;
function ok(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  checks++;
}
function read(rel) { return fs.readFileSync(rel, 'utf8'); }
function sha(rel) { return crypto.createHash('sha256').update(fs.readFileSync(rel)).digest('hex'); }

// Pass 57 is deliberately a regression/release-candidate pass. Runtime files
// must remain byte-identical to the committed Pass 56 baseline.
const protectedHashes = new Map([
  ['src/canvas.js', 'cddce5c7514283bcbb81469bba44b6dc8fa324f45b877d398feb2a06582dfb8c'],
  ['src/effects.js', '78f59e6bd5e6f7c687f5f15eeb5e3f08783105f97c617920c779050994def4f3'],
  ['src/pipeline-runtime.js', '9e33790d247c57742bd60222091f683c80299d51c7c428307c8b392f1749bfd9'],
  ['src/syphon-stream-worker.js', '43bf5e67908ee93b2a371c84ae65b37d8c4499c7b3e4a1b18d6ada6be460750b'],
  ['src/index.html', 'b64e228e7044ff4a20bd59e9dc57eb346d8f7020e3e0a4fff5798d9e8f8e7269'],
  ['src-tauri/src/main.rs', '2185862ffa089595cdd51408492c5ab7a4c947cb884ca92a84472ca6d47073d9'],
  ['src-tauri/src/syphon.rs', 'c763c793c6a1e47579625639e229c2565afd27dfd63e62e7825d6ba7ecc3e944'],
]);
for (const [rel, expected] of protectedHashes) {
  ok(fs.existsSync(rel), `${rel} exists`);
  ok(sha(rel) === expected, `${rel} remains exact Pass 56 runtime bytes`);
}

const canvas = read('src/canvas.js');
const html = read('src/index.html');
const main = read('src-tauri/src/main.rs');
const tauri = read('src-tauri/tauri.conf.json');
const worker = read('src/syphon-stream-worker.js');

// Preset contract: durable JSON + RAM-only session recall.
ok(canvas.includes("const _sessionLoadedPresets = new Map();"), 'session preset bank is RAM-owned');
ok(!canvas.includes("localStorage.setItem(PRESETS_LS_KEY"), 'new preset saves never write the legacy preset store');
ok(!canvas.includes("sessionStorage.setItem"), 'session preset bank is not persisted via sessionStorage');
ok(canvas.includes("const documentData = _makePresetFile(name, capturePreset());"), 'save captures one canonical preset document');
ok(canvas.includes("await invoke('write_preset_file', { path, contents })"), 'native file write occurs on SAVE FILE');
ok(canvas.includes("_registerSessionLoadedPreset(\n        name,\n        documentData.preset"), 'successful save registers exact serialized state into session bank');
ok(canvas.includes("sel.value = `session:${sessionId}`"), 'newly saved preset becomes selected in dropdown');
ok(canvas.includes("group.label = 'SESSION — SAVED / LOADED'"), 'session dropdown communicates saved + loaded behavior');
ok(canvas.includes("_applyLoadedPresetDocument"), 'LOAD FILE uses shared preset document parser');
ok(main.includes('fn write_preset_file(') && main.includes('fn read_preset_file('), 'native preset read/write commands remain present');
ok(/"dialog"\s*:\s*\{[^}]*"open"\s*:\s*true[^}]*"save"\s*:\s*true/s.test(tauri), 'Tauri Open/Save dialog permissions remain enabled');

// Keyboard focus contract.
ok(!/e\.key\.toLowerCase\(\)\s*===\s*['"]p['"]/.test(canvas), 'P is not a global shortcut');
ok(!/e\.key\s*===\s*['"]p['"]/.test(canvas), 'lowercase p is not bound globally');
ok(!/e\.key\s*===\s*['"]P['"]/.test(canvas), 'uppercase P is not bound globally');
ok(canvas.includes('function _keyboardEventTargetsEditableControl'), 'editable-focus ownership helper remains present');

// Three-source pipeline-awareness contract.
ok(html.includes('IMAGE FEED'), 'image-feed UI is present');
ok(html.includes('LUMA/COMP'), 'Luma Composite feed indicator is present');
ok(canvas.includes("feeds.push('CORRUPT')"), 'Corrupt is represented as a primary feed');
ok(canvas.includes("feeds.push('SCANLINES')"), 'Scanlines is represented as a primary feed');
ok(canvas.includes("feeds.push('LUMA/COMP')"), 'Luma Composite is represented as a primary feed');
ok(canvas.includes("'NEEDS IMAGE FEED'"), 'downstream no-feed warning remains present');
ok(canvas.includes('CLASSIC: IMAGE FEED → FEEDBACK → FLOW → SYMMETRY → SOLARIZE'), 'CLASSIC quick-route remains explicit');
ok(canvas.includes('CRISP: FEEDBACK → FLOW → SYMMETRY → SOLARIZE → IMAGE FEED'), 'CRISP FINISH quick-route remains explicit');

// Syphon Classic output contract: 720p only, 60 primary / 30 safe.
const syphMatch = html.match(/<select id="syphProfile"[\s\S]*?<\/select>/);
ok(!!syphMatch, 'Syphon profile selector exists');
const syph = syphMatch?.[0] || '';
ok(syph.includes('value="720p60"'), 'Syphon 720p60 profile remains present');
ok(syph.includes('value="720p30"'), 'Syphon 720p30 safe profile remains present');
ok(!/1080/i.test(syph), 'Syphon selector exposes no 1080 profile');
ok(worker.includes('MAX_OUTSTANDING_FRAMES = 2'), 'worker-direct transport remains strictly two-credit bounded');
ok(/fallback/i.test(worker), 'Pass 50/51 fallback route remains represented in worker');

// Catch accidental duplicate element IDs, which previously broke preset I/O.
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const seen = new Set();
const duplicateIds = [];
for (const id of ids) {
  if (seen.has(id)) duplicateIds.push(id);
  seen.add(id);
}
ok(duplicateIds.length === 0, `index.html has no duplicate element IDs${duplicateIds.length ? `: ${duplicateIds.join(', ')}` : ''}`);

// Release-facing files required by the candidate package.
for (const rel of [
  'RELEASE_CANDIDATE_REGRESSION_AUDIT.md',
  'RELEASE_CANDIDATE_TEST_MATRIX.md',
  'HUFF_CLASSIC_RELEASE_CANDIDATE_PASS_57.txt',
  'GIT_COMMIT_MESSAGE.md',
]) ok(fs.existsSync(rel), `${rel} is present`);

console.log(`HUFF Classic Pass 57 validation: ${checks} checks PASS`);
