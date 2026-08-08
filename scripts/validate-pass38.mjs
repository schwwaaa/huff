import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const assert = (c, m) => { if (!c) throw new Error(m); };
let checks = 0;
const ok = (c, m) => { assert(c, m); checks++; };

const html = read('src/index.html');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');

// ── User-facing Pass 38 contract ─────────────────────────────────────────────
ok(html.includes('<div class="group-label">Corrupt</div>'), 'Corrupt group missing');
for (const title of ['Update','Time','Regions','Clusters','Group Shape','Group XYZ','Group Dynamics','Patch XYZ','Patch Repeat','Composite']) {
  ok(html.includes(`>${title}</div>`), `Corrupt section missing: ${title}`);
}
for (const id of [
  'corruptSpeed','clusterTiles','clusterModeStatus','cluDepth','cluMoveX','cluMoveY','cluMoveZ',
  'glitchBaseZ','corruptMoveX','corruptMoveY','corruptMoveZ','corruptResetXYZBtn'
]) ok(html.includes(`id="${id}"`), `Pass 38 control missing: ${id}`);
ok(html.includes('id="corruptSpeed" type="range" min="0" max="4"'), 'Master Corrupt SPEED range changed/missing');
ok(html.includes('id="glitchBaseZ" type="range" min="-1" max="1"'), 'Patch POSITION Z range changed/missing');
ok(html.includes('id="corruptMoveZ" type="range" min="-1.5" max="1.5"'), 'Patch MOVE Z range changed/missing');
ok(html.includes('id="cluMoveZ" type="range" min="-1.5" max="1.5"'), 'Group MOVE Z range changed/missing');
ok(html.includes('id="cluDepth" type="range" min="0" max="1"'), 'Cluster DEPTH range changed/missing');
ok(html.includes('Group Corrupt patches into persistent moving bodies'), 'Cluster toggle semantics not described');
ok(html.includes('simulated depth'), '2.5D Z semantics not described');
ok(html.includes('FIELD RATE'), 'Legacy field-rate control not distinguished from master SPEED');

// Cluster toggle is now the visible action; hidden distribution remains an alias.
const hiddenStart = html.indexOf('<div class="corrupt-hidden"');
const hiddenEnd = html.indexOf('</div>', hiddenStart);
ok(hiddenStart >= 0 && hiddenEnd > hiddenStart, 'Hidden compatibility block missing');
const hidden = html.slice(hiddenStart, hiddenEnd);
ok(hidden.includes('id="corruptDistribution"'), 'Hidden distribution compatibility alias missing');
ok(!hidden.includes('id="clusterTiles"'), 'Visible Cluster toggle was accidentally hidden');
ok(canvas.includes("els.clusterTiles.checked = els.corruptDistribution.value === 'cluster'"), 'Distribution → Cluster toggle sync missing');
ok(canvas.includes("els.corruptDistribution.value = els.clusterTiles.checked ? 'cluster' : 'random'"), 'Cluster toggle → distribution alias sync missing');

// ── Master speed + XYZ motion ────────────────────────────────────────────────
ok(canvas.includes('window.HUFF_CORRUPT_MOTION = _corruptMotion'), 'Shared Corrupt motion state missing');
ok(canvas.includes('_corruptClock += corruptSpeed * corruptDt * 60'), 'Master SPEED clock scaling missing');
ok(canvas.includes('nPhaseX += density * corruptSpeed * 0.01'), 'Master SPEED does not scale Corrupt X noise phase');
ok(canvas.includes('nPhaseY += density * corruptSpeed * 0.011'), 'Master SPEED does not scale Corrupt Y noise phase');
ok(canvas.includes('moveX * corruptSpeed * corruptDt'), 'Patch MOVE X is not master-speed scaled');
ok(canvas.includes('moveY * corruptSpeed * corruptDt'), 'Patch MOVE Y is not master-speed scaled');
ok(canvas.includes('moveZ * corruptSpeed * corruptDt'), 'Patch MOVE Z is not master-speed scaled');
ok(canvas.includes('_corruptMotion.timeSec = _corruptClock / 60'), 'Scaled motion time is not exposed to cluster dynamics');

// Explicit decoded-frame update policies must stay independent of master SPEED.
const gateStart = canvas.indexOf('function _shouldApplyGlitchThisRender');
const gateEnd = canvas.indexOf('function _emitGlitchGroup', gateStart);
ok(gateStart >= 0 && gateEnd > gateStart, 'Corrupt update gate boundaries missing');
const gate = canvas.slice(gateStart, gateEnd);
ok(!gate.includes('corruptSpeed'), 'Master SPEED incorrectly changes STROBE/MULTIGRAB decoded-frame timing');
ok(gate.includes("mode === 'strobe'"), 'Strobe update mode missing');
ok(gate.includes("mode === 'multigrab'"), 'MultiGrab update mode missing');

// Placement workspace now carries per-target Z without allocating objects.
ok(effects.includes('this.z = new Float32Array(0)'), 'Typed target Z buffer missing');
ok(effects.includes('add(x, y, z = 0)'), 'Target Z insertion path missing');
ok(effects.includes('this.z[i] = z'), 'Target Z value not stored');
ok(effects.includes('zBase: random(-1, 1)'), 'Cluster centers do not receive an independent depth coordinate');
ok(effects.includes('zMotion: 0'), 'Cluster direct Z motion state missing');
ok(effects.includes('(Number(c.zBase) || 0) * cluDepth + (Number(c.zMotion) || 0)'), 'Cluster DEPTH/direct MOVE Z composition missing');
ok(effects.includes('cluMoveX, cluMoveY, cluMoveZ, masterSpeed'), 'Group XYZ/master-speed parameters not passed to cluster physics');
ok(effects.includes('const directDX = (Number(cluMoveX) || 0) * frameDt * speed'), 'Group MOVE X direct path missing');
ok(effects.includes('const directDY = (Number(cluMoveY) || 0) * frameDt * speed'), 'Group MOVE Y direct path missing');
ok(effects.includes('const directDZ = (Number(cluMoveZ) || 0) * frameDt * speed'), 'Group MOVE Z direct path missing');
ok(effects.includes('const z = Math.max(-1.5, Math.min(1.5, staticZ + dynamicZ + clusterZ))'), 'Patch/group/general Z composition missing');
ok(effects.includes('zScale = Math.pow(2, z * 0.75)'), '2.5D Z scale projection missing');
ok(effects.includes('const neutralXYZ = motionX === 0 && motionY === 0 && z === 0'), 'Neutral XYZ compatibility branch missing');

// Projection sanity: Z=0 must be 1x, positive larger, negative smaller.
const zScale = z => 2 ** (Math.max(-1.5, Math.min(1.5, z)) * 0.75);
ok(Math.abs(zScale(0) - 1) < 1e-12, 'Z neutral scale is not 1');
ok(zScale(1) > 1, 'Positive Z does not enlarge');
ok(zScale(-1) < 1, 'Negative Z does not recede');

// ── Luma performance boundary ────────────────────────────────────────────────
// Pass 38 deliberately does not modify the proven Pass 36/37 Luma section.
const lumaStart = effects.indexOf('// ─── Pipeline Luma Key');
ok(lumaStart >= 0, 'Pipeline Luma Key section missing');
ok(sha(Buffer.from(effects.slice(lumaStart))) === '6f3655e25a1a4ac1f820babb6d9f8b96510c7b541828e2ea820e6a15b8a3441e', 'Pass 36/37 Luma implementation changed');
ok((effects.match(/getImageData\(/g) || []).length === 5, 'Pass 38 added a synchronous image readback');
ok((effects.match(/putImageData\(/g) || []).length === 4, 'Pass 38 added a pixel upload path');
const corruptStart = effects.indexOf('function _corruptStencilAllows(');
const flowStart = effects.indexOf('// ─── Flow warp', corruptStart);
const corruptRegion = effects.slice(corruptStart, flowStart);
ok(!corruptRegion.includes('getImageData('), 'Corrupt/XYZ/Clusters introduced synchronous readback');
ok(!corruptRegion.includes('putImageData('), 'Corrupt/XYZ/Clusters introduced pixel upload');
ok(!corruptRegion.includes('createGraphics('), 'Corrupt/XYZ/Clusters introduced a full-resolution p5 buffer');

// Corrupt draw-call count is still tileCount * (1 + repeats): Z does not multiply passes.
ok(effects.includes('_glitchTelemetry.drawCalls += tileCount * (1 + smearLength)'), 'Corrupt draw-call telemetry formula changed');

// ── Legacy / accepted boundaries ─────────────────────────────────────────────
ok(html.includes('id="glitchSpeed" type="range" min="0" max="5"'), 'Legacy glitchSpeed range changed');
ok(html.includes('id="glitchSpeedFine" type="range" min="0" max="10"'), 'Legacy glitchSpeedFine range changed');
ok(html.includes('id="glitchSpeedMul" type="range" min="0" max="10"'), 'Legacy glitchSpeedMul range changed');
ok(canvas.includes('speed * fine * mul * mul'), 'Legacy FIELD RATE product contract missing');
ok(canvas.includes("sourceData.corruptDistribution = sourceData.clusterTiles ? 'cluster' : 'random'"), 'Legacy cluster preset migration missing');
ok(canvas.includes("if (!('cluDepth' in sourceData)) sourceData.cluDepth = '0'"), 'Legacy presets are not protected from new cluster depth default');
ok(canvas.includes("if (!('corruptSpeed' in sourceData)) sourceData.corruptSpeed = '1'"), 'Legacy presets are not given neutral master SPEED');

// All Pass 36 source files except intentional browser/doc compatibility files remain protected.
const srcManifest = read('baseline/pass36-src.sha256').trim().split('\n').filter(Boolean);
for (const line of srcManifest) {
  const m = line.match(/^([0-9a-f]{64})\s+(.+)$/); assert(m, `Malformed Pass 36 src line: ${line}`);
  const [, expected, rel] = m;
  if (['src/index.html','src/canvas.js','src/effects.js','src/midi/FORMAT.md','src/osc/FORMAT.md'].includes(rel)) continue;
  const abs = path.join(root, rel);
  ok(fs.existsSync(abs), `Missing protected source file: ${rel}`);
  ok(sha(fs.readFileSync(abs)) === expected, `Unexpected protected source change: ${rel}`);
}

// Flow remains byte-identical to accepted baseline.
const fStart = effects.indexOf('function applyFlowWarp(');
const fEnd = effects.indexOf('function applySymmetry(', fStart);
ok(fStart >= 0 && fEnd > fStart, 'Flow section boundaries missing');
ok(sha(Buffer.from(effects.slice(fStart, fEnd))) === 'e2a6aeb2969c1f506dd2467561c550cf7af483c79018a4a501884ff1732402c3', 'Flow implementation changed');

// Native tree remains exact Pass 36.
const nativeManifest = read('baseline/pass36-src-tauri.sha256').trim().split('\n').filter(Boolean);
for (const line of nativeManifest) {
  const m = line.match(/^([0-9a-f]{64})\s+(.+)$/); assert(m, `Malformed Pass 36 native line: ${line}`);
  const [, expected, rel] = m;
  const abs = path.join(root, 'src-tauri', rel);
  ok(fs.existsSync(abs), `Missing native file: ${rel}`);
  ok(sha(fs.readFileSync(abs)) === expected, `Native file changed: ${rel}`);
}

console.log(`Pass 38 validation passed: ${checks.toLocaleString()} structural/performance-boundary checks.`);
