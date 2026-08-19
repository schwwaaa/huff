import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const indexPath = path.join(root, 'src', 'index.html');
const canvasPath = path.join(root, 'src', 'canvas.js');
const index = fs.readFileSync(indexPath, 'utf8');
const canvas = fs.readFileSync(canvasPath, 'utf8');
let checks = 0;
function ok(cond, msg) { if (!cond) throw new Error(`FAIL: ${msg}`); checks++; }
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
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

// UI contract: make the existing three-source model visible without adding CLEAN
// or silently auto-enabling any producer.
for (const id of ['pipelineFeedCorrupt','pipelineFeedScan','pipelineFeedLuma','pipelineFeedSummary','pipelineRouteSummary','symPipelineState','solarizePipelineState']) {
  ok(index.includes(`id="${id}"`), `${id} is visible in controls UI`);
}
ok(index.includes('IMAGE FEED'), 'pipeline panel names image-feed concept');
ok(index.includes('CORRUPT') && index.includes('SCANLINES') && index.includes('LUMA/COMP'), 'three primary feed labels are present');
ok(index.includes('DOWNSTREAM'), 'downstream role is visible beside Symmetry/Solarize');
ok(index.includes('Symmetry and Solarize are downstream processors, not independent source stages.'), 'pipeline explanation states downstream contract');
ok(!index.includes('pipelineFeedClean'), 'no fourth CLEAN image-feed control was introduced');

ok(canvas.includes("if (els.corruptOn?.checked) feeds.push('CORRUPT');"), 'Corrupt is recognized as a primary image feed');
ok(canvas.includes("if (els.clusters?.checked) feeds.push('SCANLINES');"), 'Scanlines is recognized as a primary image feed');
ok(canvas.includes("String(els.lumaKeyTarget?.value || 'composite') === 'composite'"), 'Luma only counts as a primary feed in COMPOSITE target');
ok(canvas.includes("Number(els.lumaKeyMix?.value || 0) > 0.0001"), 'zero-mix Luma does not falsely report a live image feed');
ok(canvas.includes("'NEEDS IMAGE FEED'"), 'enabled downstream effects warn when no primary feed is active');
ok(canvas.includes("'WAITING FOR FEED'"), 'disabled downstream effects explain their waiting state');
ok(canvas.includes("'CLASSIC: IMAGE FEED → FEEDBACK → FLOW → SYMMETRY → SOLARIZE'"), 'CLASSIC quick route is visible');
ok(canvas.includes("'CRISP: FEEDBACK → FLOW → SYMMETRY → SOLARIZE → IMAGE FEED'"), 'CRISP FINISH quick route is visible');
ok(canvas.includes("'CRISP · PRE-FEED'"), 'CRISP FINISH downstream position is explicitly disclosed');

// No auto-enable / no hidden source insertion.
ok(!canvas.includes("els.corruptOn.checked = true"), 'awareness UI does not auto-enable Corrupt');
ok(!canvas.includes("els.clusters.checked = true"), 'awareness UI does not auto-enable Scanlines');
ok(!canvas.includes("els.lumaKeyOn.checked = true"), 'awareness UI does not auto-enable Luma');

// Protect the exact Pass 52B render pipeline. Pass 52D is intentionally UI-only.
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
  ok(sha(extract(name)) === expected, `${name} remains exact Pass 52B render behavior`);
}

// Protect effect algorithms, serial recipe contracts, Syphon transport and native publishing.
const protectedFiles = new Map([
  ['src/effects.js','78f59e6bd5e6f7c687f5f15eeb5e3f08783105f97c617920c779050994def4f3'],
  ['src/pipeline-runtime.js','9e33790d247c57742bd60222091f683c80299d51c7c428307c8b392f1749bfd9'],
  ['src/syphon-stream-worker.js','43bf5e67908ee93b2a371c84ae65b37d8c4499c7b3e4a1b18d6ada6be460750b'],
]);
for (const [rel, expected] of protectedFiles) {
  const hash = sha(fs.readFileSync(path.join(root, rel)));
  ok(hash === expected, `${rel} remains exact Pass 52B bytes`);
}

// Model the UI decision table independently.
function feeds({ corrupt=false, scan=false, luma=false, target='composite', mix=0 } = {}) {
  const out = [];
  if (corrupt) out.push('CORRUPT');
  if (scan) out.push('SCANLINES');
  if (luma && target === 'composite' && mix > 0.0001) out.push('LUMA/COMP');
  return out;
}
ok(feeds().length === 0, 'empty startup reports no primary image feed');
ok(feeds({corrupt:true}).join() === 'CORRUPT', 'Corrupt-only feed model');
ok(feeds({scan:true}).join() === 'SCANLINES', 'Scanlines-only feed model');
ok(feeds({luma:true,target:'composite',mix:1}).join() === 'LUMA/COMP', 'Luma/Composite feed model');
ok(feeds({luma:true,target:'corrupt',mix:1}).length === 0, 'Luma/Corrupt is not misrepresented as an independent image feed');
ok(feeds({luma:true,target:'scan',mix:1}).length === 0, 'Luma/Scan is not misrepresented as an independent image feed');
ok(feeds({luma:true,target:'composite',mix:0}).length === 0, 'Luma/Composite at MIX 0 remains visibly inactive');
ok(feeds({corrupt:true,scan:true,luma:true,target:'composite',mix:1}).length === 3, 'multiple simultaneous feeds are represented');

console.log(`HUFF Classic Pass 52D validation: ${checks.toLocaleString()} checks PASS`);
