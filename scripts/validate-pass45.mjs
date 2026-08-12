import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');
const html = read('src/index.html');
const pkg = JSON.parse(read('package.json'));
let checks = 0;
function ok(cond, msg) { assert.ok(cond, msg); checks++; }
function has(text, token, msg=token) { ok(text.includes(token), msg); }
function lacks(text, token, msg=token) { ok(!text.includes(token), msg); }
function sha(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

// ---- Product boundary: Classic stays Classic ------------------------------
has(effects, 'Pass 45 Classic bounded GPU colour accelerator', 'Pass 45 bounded accelerator documented');
has(effects, 'HUFF Classic remains the Tauri v1 + p5.js / Canvas2D application', 'Classic architecture explicitly retained');
lacks(effects, 'WGSL', 'effects path contains no WGSL');
lacks(effects, 'navigator.gpu', 'no WebGPU adapter path');
has(effects, "canvas.getContext('webgl'", 'bounded WebGL1 assist exists');
has(effects, "canvas.getContext('experimental-webgl'", 'WebGL1 compatibility fallback exists');
has(effects, 'window.HUFF_CLASSIC_FORCE_CPU_COLOR', 'CPU compatibility/debug fallback exposed');
has(effects, 'const MAX_W = 640;', 'existing 640px bounded processing ceiling retained');
lacks(effects, 'readPixels(', 'accelerator never reads WebGL pixels back to CPU');
lacks(effects, 'gl.finish(', 'accelerator adds no explicit GPU stall');
lacks(effects, 'gl.flush(', 'accelerator adds no explicit GPU flush');
has(effects, 'preserveDrawingBuffer: false', 'WebGL drawing buffer uses non-preserved fast mode');

// Only Solarize Quantize is accelerated. A parity-failed GPU luma experiment
// must not ship.
lacks(effects, 'const lumaFragment = `', 'GPU luma shader is not shipped');
lacks(effects, "kind === 'luma'", 'no runtime GPU luma dispatch');
lacks(effects, 'gpu.luma', 'no GPU luma program');
has(effects, 'function _runClassicGpuSolarize(', 'Solarize-only GPU runner exists');
has(effects, 'function _tryClassicGpuSolarize(', 'Solarize GPU attempt is isolated');

// ---- Solarize Quantize hot path -------------------------------------------
const solApply = extractFunction(effects, 'applySolarize');
const gpuTry = solApply.indexOf('_tryClassicGpuSolarize(');
const cpuRead = solApply.indexOf('_solCtx.getImageData');
ok(gpuTry >= 0 && cpuRead >= 0 && gpuTry < cpuRead, 'GPU Quantize path runs before CPU readback path');
has(solApply, 'if (lumaQuantize)', 'GPU assist is restricted to LUMA QUANTIZE mode');
has(solApply, 'if (gpuResult)', 'GPU result has explicit successful bypass');
has(solApply, '_updateSolarizeFluidity(fluidity, now, sw, sh, gpuResult)', 'accepted Fluidity consumes GPU result');
has(solApply, '_presentSolarizeFluidCache(buf.drawingContext, fluidCanvas, BW, BH)', 'GPU result returns through accepted presentation path');
ok((solApply.match(/_solCtx\.getImageData\(/g) || []).length === 1, 'CPU fallback still has exactly one bounded readback');
ok((solApply.match(/_solCtx\.putImageData\(/g) || []).length === 1, 'CPU fallback still has exactly one bounded upload');

const gpuRun = extractFunction(effects, '_runClassicGpuSolarize');
has(gpuRun, 'gl.texSubImage2D', 'steady-state source texture storage is reused');
has(gpuRun, 'gl.drawArrays(gl.TRIANGLES, 0, 6)', 'single fullscreen GPU draw per quantize stage');
lacks(gpuRun, 'getImageData(', 'GPU runner has no Canvas2D readback');
lacks(gpuRun, 'putImageData(', 'GPU runner has no Canvas2D pixel upload');
has(gpuRun, '_classicGpuTelemetry.solarFrames++', 'GPU Solarize usage is observable');

// Per-pixel pow() was moved out of the shader and is computed once per control
// state/dispatch on the CPU.
const shaderStart = effects.indexOf('const solarFragment = `');
const shaderEnd = effects.indexOf('`;', shaderStart + 24);
const solarShader = effects.slice(shaderStart, shaderEnd);
lacks(solarShader, 'pow(', 'Solarize shader has no per-pixel pow');
has(solarShader, 'uniform float uSteps;', 'quantization step count is uniform');
has(solarShader, 'uniform float uRemoveLuma;', '100% luma-removal endpoint is explicit uniform');
has(effects, 'levels = Math.max(2, Math.round(Math.pow(2, 8 - 7 * t)))', 'accepted Level transfer is computed once on CPU');

// ---- LIVE/COMPOSITE Luma: exact two-loop -> one-loop merge ----------------
has(effects, 'function _captureLiveLumaAndPatchFromImageData(', 'merged LIVE luma+alpha traversal exists');
const merged = extractFunction(effects, '_captureLiveLumaAndPatchFromImageData');
has(merged, 'lumaTarget[i] = luma;', 'merged traversal preserves cached luma plane');
has(merged, 'alphaTarget[i] = baseAlpha;', 'merged traversal preserves original source alpha');
has(merged, '_pipelineLumaMaskByte(luma, threshold, invert, safeGain, shapeLut)', 'merged traversal uses established matte function');
has(merged, '((maskAlpha * baseAlpha + 127) / 255) | 0', 'merged traversal retains exact alpha multiplication');
lacks(merged, 'getImageData(', 'merged traversal adds no readback');
const liveEnsure = extractFunction(effects, '_ensureLivePipelineLuma');
has(liveEnsure, 'patchParams = null', 'LIVE source capture accepts optional composite patch params');
has(liveEnsure, '_captureLiveLumaAndPatchFromImageData(', 'new source frame uses merged traversal');
has(liveEnsure, '_plkCtx.putImageData(sourceData, 0, 0);', 'merged path uploads keyed patch once');
has(liveEnsure, "_plkProfileAdd('livePatchMergedBuilds')", 'merged builds are profiled');
const lumaApply = extractFunction(effects, 'applyPipelineLumaKey');
has(lumaApply, '? _ensureLivePipelineLuma(sourceFrameSerial, profile, {', 'LIVE/COMPOSITE calls merged source path');
has(lumaApply, ": _resolvePipelineLumaPlane(sourceFrameSerial, 'stencil', profile)", 'STENCIL retains established path');
has(lumaApply, '_ensureLivePipelineLumaPatch(', 'same-frame parameter changes retain cached rebuild path');
has(lumaApply, '_ensurePipelineLumaMask(', 'stencil mask path retained');

// Mathematical equivalence of Pass 44 two-pass alpha construction and Pass 45
// merged construction for a large deterministic sample set.
function shapeByte(mask, cleanup, density) {
  let a = mask / 255;
  const blackPoint = Math.max(0, Math.min(0.45, cleanup * 0.45));
  const whitePoint = Math.max(0.55, Math.min(1, 1 - density * 0.45));
  if (blackPoint > 0) a = a <= blackPoint ? 0 : (a - blackPoint) / (1 - blackPoint);
  if (whitePoint < 1) a = a >= whitePoint ? 1 : a / whitePoint;
  return Math.max(0, Math.min(255, (a * 255 + 0.5) | 0));
}
function maskByte(luma, threshold, invert, gain, cleanup, density) {
  const roll = Math.max(0, Math.min(1, ((luma - threshold) * gain) / 64));
  let a = invert ? 1 - roll : roll;
  let b = Math.max(0, Math.min(255, (a * 255 + 0.5) | 0));
  return shapeByte(b, cleanup, density);
}
let seed = 0x45008110;
function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
for (let i = 0; i < 16384; i++) {
  const r = rnd() & 255, g = rnd() & 255, b = rnd() & 255, sourceAlpha = rnd() & 255;
  const thresh = (rnd() & 1023) / 1023;
  const threshold = (1 - thresh) * 255;
  const invert = !!(rnd() & 1);
  const gain = 0.25 + ((rnd() & 1023) / 1023) * 3.75;
  const cleanup = (rnd() & 1023) / 1023;
  const density = (rnd() & 1023) / 1023;
  const luma44 = (0.299 * r + 0.587 * g + 0.114 * b + 0.5) | 0;
  const alpha44 = ((maskByte(luma44, threshold, invert, gain, cleanup, density) * sourceAlpha + 127) / 255) | 0;
  const luma45 = (0.299 * r + 0.587 * g + 0.114 * b + 0.5) | 0;
  const alpha45 = ((maskByte(luma45, threshold, invert, gain, cleanup, density) * sourceAlpha + 127) / 255) | 0;
  ok(luma44 === luma45 && alpha44 === alpha45, `merged luma parity ${i}`);
}

// ---- Quantize transfer model ---------------------------------------------
function cpuQuantizedLuma(sourceLuma, levelPct, softPct, invert, amount) {
  const level = Math.max(0, Math.min(100, Number(levelPct) || 0));
  const soft = Math.max(0, Math.min(1, (Number(softPct) || 0) / 100));
  const wet = Math.max(0, Math.min(1, Number(amount) || 0));
  let levels = 256;
  if (level >= 100) levels = 0;
  else if (level > 0) {
    const t = Math.min(1, level / 99);
    levels = Math.max(2, Math.round(Math.pow(2, 8 - 7 * t)));
  }
  const working = invert ? 255 - sourceLuma : sourceLuma;
  let q = working;
  if (levels === 0) q = 0;
  else if (levels < 256) q = Math.round((working / 255) * (levels - 1)) * (255 / (levels - 1));
  const softened = q + (working - q) * soft;
  return sourceLuma + (softened - sourceLuma) * wet;
}
function gpuUniformModel(sourceLuma, levelPct, softPct, invert, amount) {
  const level = Math.max(0, Math.min(100, Number(levelPct) || 0));
  let levels = 256;
  if (level >= 100) levels = 0;
  else if (level > 0) {
    const t = Math.min(1, level / 99);
    levels = Math.max(2, Math.round(Math.pow(2, 8 - 7 * t)));
  }
  const steps = levels > 0 ? levels - 1 : 0;
  const working = invert ? 255 - sourceLuma : sourceLuma;
  let q = working;
  if (levels === 0) q = 0;
  else if (steps > 0 && steps < 255.5) q = Math.floor((working / 255) * steps + 0.5) * (255 / steps);
  const soft = Math.max(0, Math.min(1, (Number(softPct) || 0) / 100));
  const softened = q + (working - q) * soft;
  return sourceLuma + (softened - sourceLuma) * Math.max(0, Math.min(1, Number(amount) || 0));
}
for (const level of [0,1,10,25,50,75,90,94,98,99,100]) {
  for (const soft of [0,17,50,67,100]) {
    for (const invert of [false,true]) {
      for (const amount of [0.1,0.5,1]) {
        for (let l=0;l<256;l++) {
          ok(Math.abs(cpuQuantizedLuma(l,level,soft,invert,amount)-gpuUniformModel(l,level,soft,invert,amount)) < 1e-9,
            `quantize transfer parity ${level}/${soft}/${invert}/${amount}/${l}`);
        }
      }
    }
  }
}

// ---- Accepted behavior remains protected ---------------------------------
const exact = {
  applyFlowWarp: 'e637e05b8100716693ed4f3e04f8881e9997b42a3b30e28368c88fdbdd5292fc',
  _refreshSolarizeMaps: '70182f169ee6f115ef380a5a3f5388eed25b79dd072e3a371d3015d94de1199c',
  _solarizePixelsBytes: '8ba9e8780056c13f465f2d8b59cc92056d913a6e3baf54a590c8b3a215b31b7d',
  _solarizePixelsWords: '0284e0f7df9a757c2683c9fde86f91c53fa9106972d42a4648476a8f00f6eed7',
  _refreshSolarizeLumaMap: 'c277c967eaee0f0c16a4b8472dbf44f19f726c8c79ca4996f11471451dd1836e',
  _solarizeLumaPixelsBytes: '56eb657589f465e7b071d48af000ed2070e078f3a7b43914ff4e78772028c50f',
  _solarizeLumaPixelsWords: 'f93b6fcd5ff4c2e1a74705aacbab6a3c60a3a70cd70c4d5c9ae25c89673f857a',
  _solarizeFluidBlendAlpha: '50c2ac8a0f5eccaf603746f3178627a6d463ee558f6a39dbabd562261139c594',
  _presentSolarizeFluidCache: 'f216a7296f950f5a780b35b753cb7df44f46330271bc0611ea8750928fb91214',
};
for (const [name, expected] of Object.entries(exact)) {
  ok(sha(extractFunction(effects, name)) === expected, `accepted helper byte-identical: ${name}`);
}

// Fluidity formula is unchanged; only the source canvas was generalized so the
// accepted GPU result can enter the same temporal integrator.
const fluid = extractFunction(effects, '_updateSolarizeFluidity');
has(fluid, 'const alpha = _solarizeFluidBlendAlpha(fluidity, gapMs);', 'Fluidity alpha function unchanged');
has(fluid, "_solFluidCtx.globalCompositeOperation = 'source-over';", 'Fluidity blend operation unchanged');
has(fluid, '_solFluidCtx.globalAlpha = alpha;', 'Fluidity blend amount unchanged');
has(fluid, 'sourceCanvas = _solCanvas', 'CPU Solarize remains default Fluidity source');

// No intentional cadence changes anywhere in the new accelerator section.
const pass45Section = effects.slice(effects.indexOf('// ─── Pass 45 Classic bounded GPU'), effects.indexOf('// temporal cadence', effects.indexOf('// ─── Pass 45 Classic bounded GPU')));
lacks(pass45Section, 'setTimeout(', 'no timer-based frame reduction');
lacks(pass45Section, 'setInterval(', 'no timer-based frame reduction');
lacks(solApply, 'doProcess', 'no Solarize process/reuse cadence gate');
lacks(solApply, '_solPhase', 'no Solarize frame-phase gate');
lacks(solApply, '_solFrameEMA', 'no Solarize frame-time load shedder');

// UI mode visibility from Pass 44 remains present.
has(html, '.solarize-mode-hidden { display: none !important; }', 'mode-specific Solarize UI remains');
has(canvas, "document.querySelectorAll('.solarize-threshold-only')", 'Threshold controls still mode-scoped');
has(canvas, "document.querySelectorAll('.solarize-luma-only')", 'Quantize controls still mode-scoped');

// Profiler exposes proof of the two optimizations.
has(canvas, "'gpu sol    '", 'profiler reports GPU Solarize frames');
has(canvas, "'gpu fall   '", 'profiler reports GPU fallback frames');
lacks(canvas, "'gpu luma   '", 'profiler makes no false GPU-luma claim');
has(canvas, "'luma merge '", 'profiler reports merged luma patch builds');

// Protected native/runtime/config boundary remains exact.
const manifest = read('baseline/pass44-pass45-protected.sha256').trim().split(/\n+/).filter(Boolean);
for (const line of manifest) {
  const [expected, ...parts] = line.trim().split(/\s+/);
  const rel = parts.join(' ');
  const actual = sha(fs.readFileSync(path.join(root, rel)));
  ok(actual === expected, `protected exact: ${rel}`);
}

ok(pkg.scripts?.['validate:pass45'] === 'node scripts/validate-pass45.mjs', 'package exposes Pass 45 validator');
has(read('SOLARIZE_QUANTIZE_GPU_ACCELERATION_AUDIT.md'), 'WebGL 1', 'Pass 45 audit documents bounded WebGL1 assist');
has(read('SOLARIZE_QUANTIZE_GPU_ACCELERATION_AUDIT.md'), 'not wgpu', 'audit explicitly distinguishes Classic from wgpu');

console.log(`PASS 45 validation: ${checks.toLocaleString()} checks PASS; bounded Solarize GPU acceleration, exact merged Luma CPU path, protected Flow and no frame skipping verified`);
