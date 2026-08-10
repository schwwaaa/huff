import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('src/index.html');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');
const pipeline = read('src/pipeline-runtime.js');
const pkg = JSON.parse(read('package.json'));
let checks = 0;
function assert(cond, msg) { checks++; if (!cond) throw new Error(msg); }
function section(src, a, b) {
  const i = src.indexOf(a); assert(i >= 0, `missing section ${a}`);
  const j = src.indexOf(b, i); assert(j > i, `missing section end ${b}`);
  return src.slice(i, j);
}
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

// ── User-facing targeting / routing clarity ─────────────────────────────────
for (const id of ['lumaKeyOn','lumaKeyTarget','lumaKeyTargetState','lumaKeyMix','lumaKeyAB','lumaKeyInvert','lumaKeySource']) {
  assert(html.includes(`id="${id}"`), `missing Luma control ${id}`);
}
for (const [value,label] of [['composite','COMPOSITE'],['corrupt','CORRUPT'],['scan','SCAN']]) {
  assert(html.includes(`<option value="${value}">${label}</option>`), `missing Luma target ${label}`);
}
assert(canvas.includes("'lumaKeyTarget'"), 'Luma target missing from render/preset state');
assert(canvas.includes("if (!('lumaKeyTarget' in sourceData)) sourceData.lumaKeyTarget = 'composite';"), 'legacy presets must default Luma target to COMPOSITE');
assert(canvas.includes("target === 'scan'"), 'SCAN target UI delegation missing');
assert(canvas.includes("target === 'corrupt'"), 'CORRUPT target UI delegation missing');
assert(canvas.includes("'SCAN PANELS'"), 'SCAN target status missing');
assert(canvas.includes("'CORRUPT PATCHES'"), 'CORRUPT target status missing');

// Layer-order modes were already capable of intentional flicker; make that explicit.
assert(html.includes('<option value="neutral"') && html.includes('>ALTERNATE</option>'), 'legacy neutral mode must be visibly named ALTERNATE');
assert(html.includes('>PULSE ORDER</option>'), 'pulse layer-order mode must be explicit');
assert(html.includes('id="layerPriorityState"'), 'layer-priority status missing');
assert(canvas.includes("'ALTERNATES EVERY FRAME'"), 'alternate-every-frame warning missing');
assert(canvas.includes("'STABLE · SCAN TOP'"), 'stable Scan-top status missing');
assert(canvas.includes("'STABLE · CORRUPT TOP'"), 'stable Corrupt-top status missing');

// ── Luma handoff architecture ────────────────────────────────────────────────
const luma = effects.slice(effects.indexOf('// ─── Pipeline Luma Key'));
assert(luma.includes('let _plkLiveLuma = null;'), 'COMPOSITE raw luminance cache missing');
assert(luma.includes('let _plkObjectLiveLuma = null;'), 'targeted object luminance cache missing');
assert(luma.includes('const MAX_W = 640;'), 'COMPOSITE bounded 640px workspace missing');
assert(luma.includes('const MAX_W = 320;'), 'targeted 320px workspace missing');
assert(luma.includes('function _ensureLivePipelineLumaObject'), 'targeted LIVE source cache missing');
assert(luma.includes('object-live:${sourceFrameSerial}'), 'targeted source token missing');
assert(luma.includes('function _resolvePipelineLumaObjectPlane'), 'targeted luma plane resolver missing');
assert(luma.includes('return _ensureLivePipelineLumaObject(sourceFrameSerial, profile);'), 'LIVE targeted key must use 320px object plane');
assert(luma.includes('luma: _plkStencilLuma'), 'targeted STENCIL must reuse stored luma');
assert(luma.includes('function _pipelineLumaObjectRegionAlpha'), 'Scan region-coverage key missing');
assert(luma.includes('five-point coverage estimate'), 'Scan coverage intent missing');
assert(luma.includes("_plkProfileAdd('objectSamples')"), 'object sampling telemetry missing');

// Shape edits must not invalidate raw decoded-frame luma.
const shapeInvalidator = section(luma, 'function _invalidatePipelineLumaShapeCache()', 'window.invalidatePipelineLumaKeyCache');
assert(!shapeInvalidator.includes('_plkLiveLumaFrame = -1'), 'shape edit still invalidates COMPOSITE source readback cache');
assert(!shapeInvalidator.includes('_plkObjectLiveLumaFrame = -1'), 'shape edit still invalidates targeted source readback cache');
assert(shapeInvalidator.includes('_plkPreparedObjectKey = null'), 'shape edit must invalidate prepared object shaping');
const sourceInvalidator = section(luma, 'function _invalidatePipelineLumaSourceCache()', 'window.invalidatePipelineLumaSourceCache');
assert(sourceInvalidator.includes('_plkLiveLumaFrame = -1'), 'source invalidation must clear COMPOSITE source cache');
assert(sourceInvalidator.includes('_plkObjectLiveLumaFrame = -1'), 'source invalidation must clear targeted source cache');

// Preserve accepted Pass 40U matte polarity exactly.
assert(luma.includes('invert ? roll : (1 - roll)'), 'accepted normal/invert matte polarity changed');
function maskByte(lumaByte, threshold, invert, gain=1) {
  const roll = Math.max(0, Math.min(1, ((lumaByte - threshold) * gain) / 64));
  return Math.max(0, Math.min(255, Math.floor((invert ? roll : (1-roll)) * 255 + 0.5)));
}
for (let L = 0; L <= 255; L += 5) {
  const a = maskByte(L, 128, false, 1);
  const b = maskByte(L, 128, true, 1);
  assert(Math.abs((a+b)-255) <= 1, `invert complement failed at luma ${L}`);
}
assert(maskByte(0,128,false) === 255 && maskByte(0,128,true) === 0, 'dark-side normal polarity changed');
assert(maskByte(255,128,false) === 0 && maskByte(255,128,true) === 255, 'bright-side invert polarity changed');

// STENCIL composite must keep live RGB moving; mask cache and RGB-frame cache are separate.
assert(luma.includes('let _plkPatchFrame = -1;'), 'composite RGB frame cache missing');
assert(luma.includes('if (!_plkPatchValid || _plkPatchFrame !== sourceFrameSerial)'), 'STENCIL composite can freeze RGB across decoded frames');
assert(luma.includes('_plkPatchFrame = sourceFrameSerial;'), 'composite RGB frame identity not updated');

// Targeted object hot path must not upload an alpha mask or allocate a full-res layer.
const objectBlock = section(luma, 'window.preparePipelineLumaObjectSource', 'window.capturePipelineLumaStencil');
assert(!objectBlock.includes('putImageData'), 'targeted Luma performs mask upload');
assert(!objectBlock.includes('createGraphics'), 'targeted Luma allocates p5 graphics');
assert(!objectBlock.includes('gScratch'), 'targeted Luma adds full-frame scratch dependency');
assert(!objectBlock.includes('gBuf.drawingContext.getImageData'), 'targeted Luma reads persistent output to CPU');

// ── Scan target integration ──────────────────────────────────────────────────
const scan = section(effects, 'function applyScanlines(', '// ─── CORRUPT');
assert(scan.includes("String(rs.lumaKeyTarget || 'composite') === 'scan'"), 'Scan target gate missing');
assert(scan.includes('_pipelineLumaObjectRegionAlpha('), 'Scan does not use region-aware targeted key');
assert(scan.includes('ctx.globalAlpha = bandAlpha * keyAlpha'), 'Scan key does not modulate panel alpha');
assert(!scan.includes('getImageData'), 'Scan hot loop added readback');
assert(!scan.includes('putImageData'), 'Scan hot loop added upload');
assert(!scan.includes('createGraphics'), 'Scan hot loop added full-resolution buffer');
assert(!scan.includes('frameRing'), 'Scan target added historical sampling');

// Scan FIELD seed hashes are cached rather than recalculated six times/panel/render.
assert(effects.includes('class ScanPanelFieldSeedWorkspace'), 'Scan FIELD seed workspace missing');
assert(scan.includes('_scanPanelFieldSeeds.ensure(bandCount)'), 'Scan FIELD seed workspace is not prepared');
for (const prop of ['x','y','z','size','phaseA','phaseB']) {
  assert(scan.includes(`_scanPanelFieldSeeds.${prop}[i]`), `Scan FIELD cached seed ${prop} missing`);
}

// ── Corrupt target integration ───────────────────────────────────────────────
const corrupt = section(effects, 'function applyGlitch(', '// ─── Flow');
assert(corrupt.includes("String(rs.lumaKeyTarget || 'composite') === 'corrupt'"), 'Corrupt target gate missing');
assert(corrupt.includes('_pipelineLumaObjectAlpha('), 'Corrupt does not sample targeted Luma');
assert(corrupt.includes('ctx.globalAlpha = baseTileAlpha * keyAlpha'), 'Corrupt key does not modulate patch alpha');
assert(!corrupt.includes('getImageData'), 'Corrupt hot loop added readback');
assert(!corrupt.includes('putImageData'), 'Corrupt hot loop added upload');
assert(!corrupt.includes('createGraphics'), 'Corrupt hot loop added full-res buffer');

// Routing: targeted modes do not also paint legacy COMPOSITE key.
const emit = section(canvas, 'function _emitGlitchGroup(', 'function _emitGlobalMix');
assert(emit.includes("lumaTarget === 'corrupt'"), 'Corrupt luma source is not primed');
assert(emit.includes("lumaTarget === 'composite'"), 'legacy COMPOSITE target branch missing');
assert(!emit.includes("lumaTarget === 'scan'\n    applyPipelineLumaKey"), 'SCAN target also paints composite Luma');
const scanGroup = section(canvas, 'function _runScanlineFrontGroup(', 'const _frontStageGroupHandlers');
assert(scanGroup.includes("String(s.lumaKeyTarget || 'composite') === 'scan'"), 'Scan group does not prime targeted Luma');
assert(scanGroup.includes('preparePipelineLumaObjectSource'), 'Scan target source prep missing');

// Activity is target-aware: unavailable target does not execute an orphan key stage.
const activity = section(canvas, 'function _resolveFrameActivity(', 'function _syncBypassBuffer');
assert(activity.includes("(lumaTarget === 'corrupt' && glitch)"), 'Corrupt target activity not gated by Corrupt');
assert(activity.includes("(lumaTarget === 'scan' && scanlines)"), 'Scan target activity not gated by Scan');

// Profiler must expose the handoff distinction during runtime validation.
assert(canvas.includes('objectReadbackSamples'), 'targeted Luma readback telemetry missing');
assert(canvas.includes("'luma obj rd'"), 'profiler targeted readback row missing');
assert(canvas.includes("' read/reuse/sample\\n'"), 'profiler targeted cache/sample row missing');

// ── Protected 40U systems ────────────────────────────────────────────────────
assert(sha(section(effects, 'class ScanlineBandWorkspace', 'const _scanlineBands')) === 'f5d7246a5729fb91cc153a3d698899e6ddf2de19d31319a0755c7dd91f6fde85', 'ScanlineBandWorkspace changed');
assert(sha(section(effects, '// ─── Flow warp', '// ─── Symmetry')) === '7e8e557ee872556cd1557023e6ab2620026796c8d5527e4684f97f7cba99a99f', 'Flow changed');
assert(sha(pipeline) === 'f5c80efe0c052fbdac5ddc6b14c91b23d531fff543929fd4d99e7e37757a6188', 'pipeline-runtime changed');

// Existing 40U Panel Field concepts remain present.
for (const id of ['scanPanelLayout','scanFieldSpreadX','scanFieldSpreadY','scanFieldSpreadZ','scanFieldSizeVar','scanFieldDrift','scanFieldDepthDrift']) {
  assert(html.includes(`id="${id}"`), `Pass 40U Panel Field control lost: ${id}`);
}
assert(scan.includes("const fieldMode = panelLayout === 'field';"), 'Pass 40U FIELD branch lost');
assert(scan.includes('const depthScale = Math.pow(2'), 'Pass 40U FIELD Z spread lost');
assert(scan.includes('const destinationWidth = bandCross * localZoom * sizeScale;'), 'Pass 40U panel collage zoom lost');

// No extra p5 full-resolution buffers were introduced anywhere by Pass 40V.
const createGraphicsCount = (effects.match(/createGraphics\s*\(/g) || []).length + (canvas.match(/createGraphics\s*\(/g) || []).length;
assert(createGraphicsCount === 2, `unexpected createGraphics count ${createGraphicsCount}; expected inherited 2`);

// Native tree must match the included Pass 40U manifest exactly.
const manifestPath = path.join(root, 'baseline/pass40u-src-tauri.sha256');
assert(fs.existsSync(manifestPath), 'Pass 40U src-tauri manifest missing');
const expectedManifest = fs.readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).sort();
const nativeRoot = path.join(root, 'src-tauri');
const nativeFiles = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full); else nativeFiles.push(full);
  }
}
walk(nativeRoot);
const actualManifest = nativeFiles.map(full => {
  const rel = path.relative(root, full).split(path.sep).join('/');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  return `${hash}  ${rel}`;
}).sort();
assert(JSON.stringify(actualManifest) === JSON.stringify(expectedManifest), 'src-tauri differs from Pass 40U');

assert(pkg.scripts['validate:pass40v'] === 'node scripts/validate-pass40v.mjs', 'package validate:pass40v script missing');
assert(pkg.scripts['simulate:pass40v'] === 'node scripts/simulate-pass40v-luma-handoff.mjs', 'package simulate:pass40v script missing');

// ── Pass 40W layer-presence / evolution separation ──────────────────────────
const corruptGate = section(canvas, 'function _shouldApplyGlitchThisRender(state)', '// ─── draw loop');
const continuousGate = section(corruptGate, "if (mode === 'continuous')", "if (mode === 'strobe')");
assert(continuousGate.includes('CONTINUOUS describes layer presence'), '40W continuous-layer rationale missing');
assert(continuousGate.includes("gate.updates++;\n    return true;"), 'CONTINUOUS Corrupt is not composited every render');
assert(!continuousGate.includes("gate.heldRenders++;\n    return false;"), 'CONTINUOUS still removes Corrupt on slow held renders');
assert(!continuousGate.includes('continuousAccumulator += speed'), 'CONTINUOUS still uses speed as a compositor sample/hold gate');

assert(canvas.includes('let _corruptSourceClock = 0;'), 'speed-scaled Corrupt source clock missing');
assert(canvas.includes('let _corruptSourceLastVfc = -1;'), 'decoded-frame source clock anchor missing');
assert(canvas.includes('sourceSerial:0'), 'Corrupt motion sourceSerial missing');
assert(canvas.includes('_corruptSourceClock += decodedDelta * activeCorruptSpeed;'), 'historical-age clock is not speed-scaled');
assert(canvas.includes('_corruptMotion.sourceSerial = Math.floor(_corruptSourceClock);'), 'source serial not published to Corrupt renderer');

const corrupt40w = section(effects, 'function applyGlitch(', '// ─── Flow');
assert(corrupt40w.includes('corruptMotion.sourceSerial'), 'Corrupt renderer does not consume speed-scaled source serial');
assert(corrupt40w.includes('chosen delay is fixed, but the video at that fixed delay remains live'), '0x fixed-delay semantics missing');
assert(!corrupt40w.includes('((_vfc * 1664525 + i * 1013904223)'), 'Corrupt age choice still hashes live _vfc directly');

// Explicit temporal modes remain untouched as the actual hold/update policies.
assert(corruptGate.includes("if (mode === 'strobe')"), 'STROBE policy lost');
assert(corruptGate.includes("if (mode === 'multigrab')"), 'MULTIGRAB policy lost');
assert(corruptGate.includes('Math.floor(Math.max(0, _vfc) / rate)'), 'STROBE decoded-frame scheduling changed');
assert(corruptGate.includes('const hold = _corruptFrameCount(state.corruptHoldFrames, 8, 60);'), 'MULTIGRAB hold scheduling changed');

// UI must explain the new continuous/layer distinction.
assert(html.includes('CONTINUOUS keeps the Corrupt layer continuously composited while SPEED controls its evolution.'), 'CONTINUOUS UI does not explain layer/evolution split');
assert(html.includes('0× locks patch placement and historical-age choice while delayed video remains live inside the patches'), 'Random Speed 0x semantics missing');
assert(html.includes('0× locks cluster bodies, shape evolution and historical-age choice while delayed video remains live inside patches'), 'Cluster Speed 0x semantics missing');
assert(html.includes('RANDOM EVOLUTION'), 'Random evolution status missing');
assert(canvas.includes('CLUSTER EVOLUTION ACTIVE'), 'Cluster evolution status missing');

// No new buffer/readback was needed for the layering repair.
const createGraphicsCount40w = (effects.match(/createGraphics\s*\(/g) || []).length + (canvas.match(/createGraphics\s*\(/g) || []).length;
assert(createGraphicsCount40w === 2, `40W introduced an extra p5 full-resolution buffer: ${createGraphicsCount40w}`);
const corrupt40wBlock = section(effects, 'function applyGlitch(', '// ─── Flow');
assert(!corrupt40wBlock.includes('getImageData'), '40W Corrupt added CPU readback');
assert(!corrupt40wBlock.includes('putImageData'), '40W Corrupt added CPU upload');

assert(pkg.scripts['validate:pass40w'] === 'node scripts/validate-pass40w.mjs', 'package validate:pass40w script missing');
assert(pkg.scripts['simulate:pass40w'] === 'node scripts/simulate-pass40w-layer-handoff.mjs', 'package simulate:pass40w script missing');
console.log(`PASS 40W validation: ${checks} checks PASS`);
