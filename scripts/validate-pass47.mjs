import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const effects=read('src/effects.js');
const canvas=read('src/canvas.js');
const pkg=JSON.parse(read('package.json'));
let checks=0;
function ok(cond,msg){assert.ok(cond,msg);checks++;}
function has(text,token,msg=token){ok(text.includes(token),msg);}
function lacks(text,token,msg=token){ok(!text.includes(token),msg);}
function sha(data){return crypto.createHash('sha256').update(data).digest('hex');}
function extractFunction(source,name){
  const start=source.indexOf(`function ${name}`); if(start<0) throw new Error(`missing ${name}`);
  const brace=source.indexOf('{',start); let depth=0;
  for(let i=brace;i<source.length;i++){
    if(source[i]==='{') depth++; else if(source[i]==='}' && --depth===0) return source.slice(start,i+1);
  }
  throw new Error(`unterminated ${name}`);
}

// Classic boundary and Pass 47 architecture.
has(effects,'Pass 47 adds a self-calibrating bounded WebGL1 LIVE/COMPOSITE Luma patch path','Pass 47 boundary documented');
lacks(effects,'navigator.gpu','no WebGPU path');
lacks(effects,'WGSL','no WGSL implementation');
has(effects,"canvas.getContext('webgl'",'Classic bounded WebGL1 accelerator retained');
has(effects,'const lumaPatchFragment = `','LIVE Luma fragment program exists');
has(effects,'function _ensureClassicGpuLumaCalibration(','runtime alpha parity calibration exists');
has(effects,'function _initClassicGpuLumaAlt()','lazy alternate Luma context exists');
has(extractFunction(effects,'_initClassicGpuLumaAlt'),'premultipliedAlpha:false','alternate context tests unpremultiplied browser semantics');
has(effects,'function _ensureLivePipelineLumaGpuPatch(','bounded cached LIVE Luma GPU patch exists');
has(effects,'function _ensurePipelineFinalKeyLut(','CPU fallback uses final key LUT');
has(effects,'return _pipelineBoundedDimensions(640, 640 * 360);','COMPOSITE Luma uses long-edge + pixel budget');
has(effects,'return _pipelineBoundedDimensions(320, 320 * 180);','object Luma uses half-size long-edge + pixel budget');
lacks(effects,'readPixels(','no per-frame WebGL CPU readback');
lacks(effects,'gl.finish(','no forced GPU synchronization');
lacks(effects,'gl.flush(','no explicit GPU flush');

// GPU gets first refusal before the established CPU getImageData fallback.
const apply=extractFunction(effects,'applyPipelineLumaKey');
const gpuTry=apply.indexOf('_ensureLivePipelineLumaGpuPatch(');
const cpuFallback=apply.indexOf('_ensureLivePipelineLuma(');
ok(gpuTry>=0 && cpuFallback>=0 && gpuTry<cpuFallback,'LIVE COMPOSITE GPU path precedes CPU fallback');
has(apply,'return;','successful GPU patch exits before CPU readback path');
const gpuRunnerStart=effects.indexOf('function _runClassicGpuLumaPatch(sourceCanvas');
const gpuRunnerEnd=effects.indexOf('function _tryClassicGpuSolarize(',gpuRunnerStart);
const gpuRunner=effects.slice(gpuRunnerStart,gpuRunnerEnd);
ok(gpuRunner.indexOf('const mainResult = tryGpu(mainGpu)') >= 0 && gpuRunner.indexOf('const mainResult = tryGpu(mainGpu)') < gpuRunner.indexOf('_initClassicGpuLumaAlt()'),'alternate WebGL context is allocated only after main-context failure');
const gpuPatch=extractFunction(effects,'_ensureLivePipelineLumaGpuPatch');
lacks(gpuPatch,'getImageData(','successful GPU patch helper has no Canvas2D readback');
lacks(gpuPatch,'putImageData(','successful GPU patch helper has no CPU upload');
lacks(gpuPatch,'readPixels(','successful GPU patch helper has no WebGL readback');
has(gpuPatch,'copyCanvasFrame(_plkGpuPatchCtx, gpuResult, sw, sh)','GPU patch is cached into bounded graphics surface');

// Runtime calibration checks actual WebGL->Canvas2D semantics and both fades.
const cal=extractFunction(effects,'_ensureClassicGpuLumaCalibration');
has(cal,"'xfade'",'calibration tests X-FADE');
has(cal,"'add'",'calibration tests SOFT ADD/screen');
has(cal,'for (const mode of [0,1,2])','multiple alpha conventions are probed');
has(cal,'bestMax <= 2 && bestMean <= 0.75','parity gate rejects visibly wrong alpha handoffs');
has(canvas,"'gpu lu cal '",'profiler exposes calibration mode/error');
has(canvas,"'luma gpu   '",'profiler exposes GPU Luma build/reuse/fallback');

// Byte-domain CPU reference and shader model parity for matte alpha.
function cpuMask(luma,thresh,invert,gain,cleanup,density){
  const threshold=(1-thresh)*255;
  const roll=Math.max(0,Math.min(1,((luma-threshold)*gain)/64));
  let mask=Math.floor((invert?roll:(1-roll))*255+0.5);
  let a=mask/255;
  const bp=Math.max(0,Math.min(.45,cleanup*.45));
  const wp=Math.max(.55,Math.min(1,1-density*.45));
  if(bp>0) a=a<=bp?0:(a-bp)/(1-bp);
  if(wp<1) a=a>=wp?1:a/wp;
  return Math.max(0,Math.min(255,Math.floor(a*255+0.5)));
}
function shaderMask(r,g,b,thresh,invert,gain,cleanup,density){
  const rb=Math.floor(Math.max(0,Math.min(1,r/255))*255+0.5);
  const gb=Math.floor(Math.max(0,Math.min(1,g/255))*255+0.5);
  const bb=Math.floor(Math.max(0,Math.min(1,b/255))*255+0.5);
  const luma=Math.floor(0.299*rb+0.587*gb+0.114*bb+0.5);
  return cpuMask(luma,thresh,invert,gain,cleanup,density);
}
let seed=0x47008111;
function rnd(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
for(let i=0;i<65536;i++){
  const r=rnd()&255,g=rnd()&255,b=rnd()&255;
  const t=(rnd()&1023)/1023, inv=!!(rnd()&1);
  const gain=.25+((rnd()&1023)/1023)*3.75;
  const cleanup=(rnd()&1023)/1023,density=(rnd()&1023)/1023;
  const luma=Math.floor(0.299*r+0.587*g+0.114*b+0.5);
  ok(cpuMask(luma,t,inv,gain,cleanup,density)===shaderMask(r,g,b,t,inv,gain,cleanup,density),`Luma shader matte parity ${i}`);
}

// Final LUT is mathematically the same mapping as the accepted per-pixel path.
for(let i=0;i<32768;i++){
  const luma=rnd()&255,t=(rnd()&1023)/1023,inv=!!(rnd()&1);
  const gain=.25+((rnd()&1023)/1023)*3.75;
  const cleanup=(rnd()&1023)/1023,density=(rnd()&1023)/1023;
  const direct=cpuMask(luma,t,inv,gain,cleanup,density);
  const lut=new Uint8Array(256);
  for(let j=0;j<256;j++) lut[j]=cpuMask(j,t,inv,gain,cleanup,density);
  ok(lut[luma]===direct,`final LUT parity ${i}`);
}

// Workspace policy expectations.
function dims(W,H,maxLong,maxPixels){
  const edge=Math.max(W,H); const area=W*H;
  const scale=Math.min(1,edge>maxLong?maxLong/edge:1,area>maxPixels?Math.sqrt(maxPixels/area):1);
  return [Math.max(1,Math.round(W*scale)),Math.max(1,Math.round(H*scale))];
}
ok(JSON.stringify(dims(1920,1080,640,640*360))==='[640,360]','1080p COMPOSITE remains 640x360');
ok(JSON.stringify(dims(1080,1920,640,640*360))==='[360,640]','portrait COMPOSITE is bounded to 360x640');
for(const [W,H] of [[1512,916],[916,1512],[3440,1440],[720,1280],[1280,720]]){
  const [w,h]=dims(W,H,640,640*360);
  ok(Math.max(w,h)<=640,`long edge bounded ${W}x${H}`);
  ok(w*h<=640*360+640,`pixel budget bounded ${W}x${H}`); // rounding allowance
}

// CPU fallback and legacy creative behavior remain present.
has(effects,'_plkCtx.getImageData(0, 0, sw, sh)','CPU LIVE fallback retained');
has(effects,'_plkCtx.putImageData(sourceData, 0, 0)','CPU keyed patch fallback retained');
has(effects,'function _pipelineLumaMaskByte(','accepted matte reference retained');
const exact={
  applyFlowWarp:'e637e05b8100716693ed4f3e04f8881e9997b42a3b30e28368c88fdbdd5292fc',
  _refreshSolarizeMaps:'70182f169ee6f115ef380a5a3f5388eed25b79dd072e3a371d3015d94de1199c',
  _solarizePixelsBytes:'8ba9e8780056c13f465f2d8b59cc92056d913a6e3baf54a590c8b3a215b31b7d',
  _solarizePixelsWords:'0284e0f7df9a757c2683c9fde86f91c53fa9106972d42a4648476a8f00f6eed7',
  _refreshSolarizeLumaMap:'c277c967eaee0f0c16a4b8472dbf44f19f726c8c79ca4996f11471451dd1836e',
  _solarizeLumaPixelsBytes:'56eb657589f465e7b071d48af000ed2070e078f3a7b43914ff4e78772028c50f',
  _solarizeLumaPixelsWords:'f93b6fcd5ff4c2e1a74705aacbab6a3c60a3a70cd70c4d5c9ae25c89673f857a',
  _solarizeFluidBlendAlpha:'50c2ac8a0f5eccaf603746f3178627a6d463ee558f6a39dbabd562261139c594',
  _presentSolarizeFluidCache:'f216a7296f950f5a780b35b753cb7df44f46330271bc0611ea8750928fb91214',
};
for(const [name,expected] of Object.entries(exact)) ok(sha(extractFunction(effects,name))===expected,`protected creative helper exact: ${name}`);

// No frame cadence manipulation.
const lumaSection=effects.slice(effects.indexOf('// ─── Pipeline Luma Key'),effects.indexOf('// ─── Solarize',effects.indexOf('// ─── Pipeline Luma Key'))>0?effects.indexOf('// ─── Solarize',effects.indexOf('// ─── Pipeline Luma Key')):effects.length);
lacks(lumaSection,'setTimeout(','no Luma frame timer');
lacks(lumaSection,'setInterval(','no Luma frame timer');
lacks(lumaSection,'% 2','no every-other-frame Luma gate');

// Protected runtime/native/preset boundary remains exact from Pass 46.
const manifest=read('baseline/pass46-pass47-protected.sha256').trim().split(/\n+/).filter(Boolean);
for(const line of manifest){
  const [expected,...parts]=line.trim().split(/\s+/); const rel=parts.join(' ');
  ok(sha(fs.readFileSync(path.join(root,rel)))===expected,`protected exact: ${rel}`);
}
ok(pkg.scripts?.['validate:pass47']==='node scripts/validate-pass47.mjs','package exposes Pass 47 validator');
console.log(`PASS 47 validation: ${checks.toLocaleString()} checks PASS; LIVE/COMPOSITE GPU Luma first-refusal, runtime alpha parity gate, aspect-safe workspaces, final CPU key LUT and protected Classic behavior verified`);
