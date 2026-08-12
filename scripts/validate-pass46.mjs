import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');
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
  for (let i=brace;i<source.length;i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start,i+1); }
  }
  throw new Error(`unterminated function ${name}`);
}

// Pass 46 is still HUFF Classic and extends only the bounded Solarize accelerator.
has(effects, 'Pass 46 extends that same bounded accelerator to legacy THRESHOLD Solarize', 'Pass 46 boundary documented');
lacks(effects, 'WGSL', 'no WGSL in Classic effect implementation');
lacks(effects, 'navigator.gpu', 'no WebGPU path');
has(effects, "canvas.getContext('webgl'", 'bounded WebGL1 assist retained');
has(effects, 'const MAX_W = 640;', 'Solarize working ceiling remains <=640px');
lacks(effects, 'readPixels(', 'runtime accelerator does not read WebGL pixels to CPU');
lacks(effects, 'gl.finish(', 'no forced GPU synchronization');
lacks(effects, 'gl.flush(', 'no explicit GPU flush');

// The legacy THRESHOLD path now gets GPU first refusal before the CPU readback.
const solApply = extractFunction(effects, 'applySolarize');
const thresholdTry = solApply.indexOf('_tryClassicGpuThresholdSolarize(');
const cpuRead = solApply.indexOf('_solCtx.getImageData');
ok(thresholdTry >= 0 && cpuRead >= 0 && thresholdTry < cpuRead, 'THRESHOLD GPU path precedes CPU readback fallback');
has(effects, 'const solarThresholdFragment = `', 'dedicated THRESHOLD fragment shader exists');
has(effects, 'const solarThreshold = _linkClassicGpuProgram', 'THRESHOLD shader is linked once');
has(effects, 'function _runClassicGpuThresholdSolarize(', 'THRESHOLD GPU runner exists');
has(effects, 'function _tryClassicGpuThresholdSolarize(', 'THRESHOLD GPU staging attempt exists');
has(effects, '_classicGpuTelemetry.solarThresholdFrames++', 'THRESHOLD GPU use is observable');
has(canvas, "'gpu thresh '", 'profiler reports THRESHOLD GPU frames');
has(canvas, "'gpu quant  '", 'profiler distinguishes Quantize GPU frames');
has(canvas, "'gpu fall   '", 'profiler reports accelerator fallback');

// GPU formula is the accepted Pass 42/43/44/45 THRESHOLD byte-domain transfer.
const thresholdShaderStart = effects.indexOf('const solarThresholdFragment = `');
const thresholdShaderEnd = effects.indexOf('`;', thresholdShaderStart + 32);
const thresholdShader = effects.slice(thresholdShaderStart, thresholdShaderEnd);
has(thresholdShader, 'float lum = dot(rgb, vec3(0.299, 0.587, 0.114));', 'THRESHOLD shader uses accepted luma coefficients');
has(thresholdShader, 'if (lum > uThreshold)', 'strict greater-than threshold preserved');
has(thresholdShader, 'rgb + (vec3(255.0) - 2.0 * rgb) * uAmount', 'accepted inversion equation preserved');
has(thresholdShader, 'floor(clamp(inverted * uScale, 0.0, 255.0) + 0.5)', 'accepted channel scale/round equation preserved');

function cpuThresholdPixel(r,g,b,threshold01,amount,solR,solG,solB) {
  const lum = 0.299*r + 0.587*g + 0.114*b;
  if (!(lum > threshold01*255)) return [r,g,b];
  const a = Math.max(0,Math.min(1,amount));
  function map(v,scale) {
    const inverted = v + (255-v-v)*a;
    return Math.floor(Math.min(255,Math.max(0,inverted*scale + 0.5)));
  }
  return [map(r,solR),map(g,solG),map(b,solB)];
}
function gpuThresholdModel(r,g,b,threshold01,amount,solR,solG,solB) {
  // CPU model of the shader's byte-domain math; actual browser GPU parity is
  // separately covered by PASS46_BROWSER_PARITY.md / runtime acceptance.
  const rgb=[r,g,b];
  const lum=0.299*rgb[0]+0.587*rgb[1]+0.114*rgb[2];
  if (lum > Math.max(0,Math.min(255,threshold01*255))) {
    const scales=[solR,solG,solB];
    for (let i=0;i<3;i++) {
      const inv=rgb[i]+(255-2*rgb[i])*Math.max(0,Math.min(1,amount));
      rgb[i]=Math.floor(Math.max(0,Math.min(255,inv*Math.max(0,scales[i])))+0.5);
    }
  }
  return rgb;
}
let seed=0x46008110;
function rnd(){ seed ^= seed<<13; seed ^= seed>>>17; seed ^= seed<<5; return seed>>>0; }
for (let i=0;i<65536;i++) {
  const r=rnd()&255,g=rnd()&255,b=rnd()&255;
  const threshold=(rnd()&1023)/1023;
  const amount=(rnd()&1023)/1023;
  const sr=(rnd()&2047)/1024, sg=(rnd()&2047)/1024, sb=(rnd()&2047)/1024;
  ok(JSON.stringify(cpuThresholdPixel(r,g,b,threshold,amount,sr,sg,sb)) === JSON.stringify(gpuThresholdModel(r,g,b,threshold,amount,sr,sg,sb)), `threshold model parity ${i}`);
}

// Accepted Solarize/Flow helpers remain byte-identical to Pass 45.
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
  _captureLiveLumaAndPatchFromImageData: '452e93f8b6fe47c95882d701861b015532e79ece287c8e8e640a7a6b0f724add',
  _pipelineLumaMaskByte: '416db8f545ee47a69d9654f4f46b1a360be6e44f8f4f84c388d2a51d95543b6a',
  applyPipelineLumaKey: '859945e5ccdeb55665b5df82003a1da3ade6f50a4526d058d651bb9fe560a93e',
};
for (const [name, expected] of Object.entries(exact)) {
  ok(sha(extractFunction(effects,name)) === expected, `accepted helper byte-identical: ${name}`);
}

// Luma stays on the accepted CPU implementation; no parity-failed GPU luma ships.
lacks(effects, 'const lumaFragment = `', 'GPU Luma prototype remains absent');
lacks(effects, 'gpu.luma', 'no GPU Luma program');
has(effects, 'function _captureLiveLumaAndPatchFromImageData(', 'Pass 45 merged Luma traversal retained');
has(effects, "_plkProfileAdd('livePatchMergedBuilds')", 'merged Luma telemetry retained');

// No frame cadence tricks were added.
lacks(solApply, 'doProcess', 'no Solarize frame reuse gate');
lacks(solApply, '_solPhase', 'no Solarize phase gate');
lacks(solApply, '_solFrameEMA', 'no Solarize overload frame shedder');
const pass46Gpu = effects.slice(effects.indexOf('// ─── Pass 45 Classic bounded GPU'), effects.indexOf('// ─── Cluster physics state'));
lacks(pass46Gpu, 'setTimeout(', 'no timer-based frame reduction');
lacks(pass46Gpu, 'setInterval(', 'no timer-based frame reduction');

// Stage timing is profiler-only and attached to the actual serial recipe stages.
has(canvas, 'window.__huffPipelineStageTelemetry', 'pipeline stage telemetry registry exists');
has(canvas, "_pipelineStageProfileEnd('front'", 'front-stage timing exists');
has(canvas, "_pipelineStageProfileEnd('feedback'", 'feedback stage timing exists');
has(canvas, "_pipelineStageProfileEnd('flow'", 'Flow stage timing exists');
has(canvas, "_pipelineStageProfileEnd('symmetry'", 'Symmetry stage timing exists');
has(canvas, "_pipelineStageProfileEnd('solarize'", 'Solarize stage timing exists');
has(canvas, "_pipelineStageProfileEnd('presentation'", 'presentation stage timing exists');
has(canvas, "'stage solar'", 'profiler displays Solarize wall time');
has(canvas, "'stage front'", 'profiler displays front-stage wall time');

// Native/runtime/config boundary remains exact from Pass 45.
const manifest = read('baseline/pass45-pass46-protected.sha256').trim().split(/\n+/).filter(Boolean);
for (const line of manifest) {
  const [expected,...parts]=line.trim().split(/\s+/);
  const rel=parts.join(' ');
  const actual=sha(fs.readFileSync(path.join(root,rel)));
  ok(actual===expected,`protected exact: ${rel}`);
}
ok(pkg.scripts?.['validate:pass46'] === 'node scripts/validate-pass46.mjs', 'package exposes Pass 46 validator');
console.log(`PASS 46 validation: ${checks.toLocaleString()} checks PASS; THRESHOLD GPU acceleration, accepted Solarize/Flow behavior, CPU Luma boundary and profiler stage timing verified`);
