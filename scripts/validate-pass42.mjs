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

// ---- UI / canonical state --------------------------------------------------
for (const id of ['solarizeMode','solarizeLevel','solarizeSoft','solarizeInvert']) {
  const matches = html.match(new RegExp(`id=["']${id}["']`, 'g')) || [];
  ok(matches.length === 1, `${id} occurs exactly once in active UI`);
}
has(html, '<option value="threshold" selected>THRESHOLD</option>', 'THRESHOLD is compatibility default');
has(html, '<option value="luma-quantize">LUMA QUANTIZE</option>', 'LUMA QUANTIZE mode exposed');
has(html, 'id="solarizeLevel" type="range" min="0" max="100" step="1" value="75"', 'LEVEL range/default');
has(html, 'id="solarizeSoft" type="range" min="0" max="100" step="1" value="0"', 'SOFT range/default');

for (const id of ['solarizeMode','solarizeLevel','solarizeSoft','solarizeInvert']) {
  has(canvas, `'${id}'`, `${id} registered in Classic state/preset surface`);
}
has(canvas, "sourceData.solarizeMode = 'threshold'", 'old presets migrate to THRESHOLD');
has(canvas, "sourceData.solarizeLevel = '75'", 'old presets receive additive LEVEL default');
has(canvas, "sourceData.solarizeSoft = '0'", 'old presets receive additive SOFT default');
has(canvas, 'sourceData.solarizeInvert = false', 'old presets receive additive INVERT default');
has(canvas, 'syncSolarizeModeUI', 'mode-aware UI wiring exists');
has(canvas, 'els.solarizeThresh.disabled = lumaMode', 'THRESH disabled in luma mode');
has(canvas, 'els.solarizeLevel.disabled = !lumaMode', 'LEVEL disabled in threshold mode');
has(canvas, "String(state.solarizeMode || 'threshold')", 'mode-aware activity detection');
has(canvas, "s.solarizeMode || 'threshold', s.solarizeLevel, s.solarizeSoft, s.solarizeInvert", 'Solarize stage forwards new controls');

// ---- Existing THRESHOLD implementation remains byte-for-byte --------------
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
const thresholdFunctionHashes = {
  _refreshSolarizeMaps: '70182f169ee6f115ef380a5a3f5388eed25b79dd072e3a371d3015d94de1199c',
  _solarizePixelsBytes: '8ba9e8780056c13f465f2d8b59cc92056d913a6e3baf54a590c8b3a215b31b7d',
  _solarizePixelsWords: '0284e0f7df9a757c2683c9fde86f91c53fa9106972d42a4648476a8f00f6eed7',
  _presentSolarizeCache: '68d705ebac1c70e5442af2b1c0900eb7aea3a3ba3f6adc0d4a0f68dee39ba198',
};
for (const [name, expected] of Object.entries(thresholdFunctionHashes)) {
  const actual = crypto.createHash('sha256').update(extractFunction(effects, name)).digest('hex');
  ok(actual === expected, `Pass 41A THRESHOLD function exact: ${name}`);
}
has(effects, "if (!lumaQuantize) {\n    if (thresh >= 1) return;\n    if (amount === 0 && solR === 1 && solG === 1 && solB === 1) return;", 'original threshold identity boundary retained');
has(effects, '_refreshSolarizeMaps(amount, solR, solG, solB);', 'threshold lookup dispatch retained');
has(effects, 'if (_solLittleEndian) _solarizePixelsWords(pix, t);', 'threshold packed transform retained');

// ---- LUMA QUANTIZE structure / one-readback rule ---------------------------
has(effects, 'const _solLumaMap = new Float32Array(256);', 'bounded luma lookup');
has(effects, 'function _refreshSolarizeLumaMap', 'luma map builder');
has(effects, 'function _solarizeLumaPixelsBytes', 'luma byte fallback');
has(effects, 'function _solarizeLumaPixelsWords', 'luma packed path');
has(effects, 'levels = Math.max(2, Math.round(Math.pow(2, 8 - 7 * t)))', 'exponential 256-to-2 mapping');
has(effects, 'if (level >= 100) levels = 0;', '100 percent luma-removal endpoint');
has(effects, 'const delta = _solLumaMap[li] - lum;', 'luminance-delta chroma retention');
has(effects, '(packed & 0xff000000)', 'alpha preserved in packed path');

const solarStart = effects.indexOf('// ─── Solarize');
const solarEnd = effects.indexOf('// ─── Symmetry', solarStart);
const solarSection = effects.slice(solarStart, solarEnd);
ok((solarSection.match(/getImageData\(/g) || []).length === 2, 'Solarize section contains one runtime getImageData plus one explanatory comment mention');
ok((solarSection.match(/_solCtx\.getImageData\(/g) || []).length === 1, 'exactly one runtime Solarize readback');
ok((solarSection.match(/_solCtx\.putImageData\(/g) || []).length === 1, 'exactly one runtime Solarize upload');
lacks(solarSection, '_solLumaCanvas', 'no second luma canvas');
lacks(solarSection, 'createGraphics(', 'no new p5 full-resolution surface');
has(solarSection, 'const MAX_W = 640;', 'existing 640px scratch ceiling retained');
has(solarSection, 'const doProcess = (stride === 1)', 'existing adaptive load guard retained');

// ---- Deterministic pixel model ---------------------------------------------
const lumaR = new Float64Array(256), lumaG = new Float64Array(256), lumaB = new Float64Array(256);
for (let i=0;i<256;i++) { lumaR[i]=0.299*i; lumaG[i]=0.587*i; lumaB[i]=0.114*i; }
function clampByte(v) { return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v); }
function buildLumaMap(levelPct, softPct, invert, amount) {
  const map = new Float32Array(256);
  const level = Math.max(0, Math.min(100, Number(levelPct)||0));
  const soft = Math.max(0, Math.min(1, (Number(softPct)||0)/100));
  const wet = Math.max(0, Math.min(1, Number(amount)||0));
  let levels=256;
  if (level>=100) levels=0;
  else if (level>0) {
    const t=Math.min(1,level/99);
    levels=Math.max(2,Math.round(Math.pow(2,8-7*t)));
  }
  for (let i=0;i<256;i++) {
    const source=i;
    const working=invert ? 255-source : source;
    let q=working;
    if (levels===0) q=0;
    else if (levels<256) {
      const steps=levels-1;
      q=Math.round((working/255)*steps)*(255/steps);
    }
    const softened=q+(working-q)*soft;
    map[i]=source+(softened-source)*wet;
  }
  return {map,levels};
}
function lumaBytes(input, map) {
  const pix=new Uint8ClampedArray(input);
  for(let i=0;i<pix.length;i+=4){
    const r=pix[i],g=pix[i+1],b=pix[i+2];
    const lum=lumaR[r]+lumaG[g]+lumaB[b];
    const li=lum<=0?0:lum>=255?255:Math.round(lum);
    const d=map[li]-lum;
    pix[i]=clampByte(r+d); pix[i+1]=clampByte(g+d); pix[i+2]=clampByte(b+d);
  }
  return pix;
}
function lumaWords(input, map) {
  const pix=new Uint8ClampedArray(input);
  const words=new Uint32Array(pix.buffer,pix.byteOffset,pix.byteLength>>>2);
  for(let i=0;i<words.length;i++){
    const packed=words[i], r=packed&255, g=(packed>>>8)&255, b=(packed>>>16)&255;
    const lum=lumaR[r]+lumaG[g]+lumaB[b];
    const li=lum<=0?0:lum>=255?255:Math.round(lum);
    const d=map[li]-lum;
    const rr=clampByte(r+d), gg=clampByte(g+d), bb=clampByte(b+d);
    words[i]=((packed&0xff000000)|rr|(gg<<8)|(bb<<16))>>>0;
  }
  return pix;
}

ok(buildLumaMap(0,0,false,1).levels===256, 'LEVEL 0 keeps 256 luma levels');
ok(buildLumaMap(99,0,false,1).levels===2, 'LEVEL 99 maps to two luma levels');
ok(buildLumaMap(100,0,false,1).levels===0, 'LEVEL 100 removes luma');
for (const [a,b] of [[0,25],[25,50],[50,75],[75,90],[90,99]]) {
  ok(buildLumaMap(a,0,false,1).levels >= buildLumaMap(b,0,false,1).levels, `coarseness monotonic ${a}->${b}`);
}

const gray=[];
for(let v=0;v<256;v++){ gray.push(v,v,v,255); }
const grayIn=new Uint8ClampedArray(gray);
const out99=lumaBytes(grayIn,buildLumaMap(99,0,false,1).map);
const unique99=new Set(); for(let i=0;i<out99.length;i+=4) unique99.add(out99[i]);
ok(unique99.size===2 && unique99.has(0) && unique99.has(255), 'LEVEL 99 grayscale has exactly black/white luma contours');
const out100=lumaBytes(grayIn,buildLumaMap(100,0,false,1).map);
ok(out100.every((v,i)=> (i%4===3 ? v===255 : v===0)), 'LEVEL 100 removes grayscale luma and preserves alpha');
const outInvert=lumaBytes(new Uint8ClampedArray([32,32,32,77]),buildLumaMap(0,0,true,1).map);
ok(outInvert[0]===223 && outInvert[1]===223 && outInvert[2]===223 && outInvert[3]===77, 'INVERT reverses grayscale luminance and preserves alpha');
const outSoft=lumaBytes(grayIn,buildLumaMap(90,100,false,1).map);
ok(Buffer.from(outSoft).equals(Buffer.from(grayIn)), 'SOFT 100 without invert restores unquantized luma');
const outDry=lumaBytes(grayIn,buildLumaMap(90,0,false,0).map);
ok(Buffer.from(outDry).equals(Buffer.from(grayIn)), 'AMOUNT 0 is exact no-op in model');

let seed=0x42c0ffee;
function rnd(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
let compared=0;
for(const [level,soft,invert,amount] of [[1,0,false,1],[50,0,false,1],[75,25,false,.8],[90,60,true,1],[99,0,true,.5],[100,0,false,1]]){
  const {map}=buildLumaMap(level,soft,invert,amount);
  const input=new Uint8ClampedArray(32768*4);
  for(let i=0;i<input.length;i++) input[i]=rnd()&255;
  const b=lumaBytes(input,map), w=lumaWords(input,map);
  ok(Buffer.from(b).equals(Buffer.from(w)), `byte/word LUMA QUANTIZE parity level=${level}`);
  for(let i=3;i<b.length;i+=4) ok(b[i]===input[i], `alpha preserved level=${level} pixel=${(i-3)/4}`);
  compared += input.length/4;
}

// ---- Protected Pass 41A/native boundaries ---------------------------------
const manifest = read('baseline/pass41a-pass42-protected.sha256').trim().split(/\n+/).filter(Boolean);
for (const line of manifest) {
  const [expected,...parts]=line.trim().split(/\s+/);
  const rel=parts.join(' ');
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex');
  ok(actual===expected, `protected exact: ${rel}`);
}
has(effects, 'function applyFlowWarp', 'Flow implementation still present');
has(canvas, "'flowOn','flowStrength','flowScale','flowPulse','flowImpl','flowSpeed','flowTurb','flowSwirl','flowSpread'", 'Flow control IDs unchanged');
ok(pkg.scripts?.['validate:pass42']==='node scripts/validate-pass42.mjs', 'package exposes Pass 42 validator');

console.log(`PASS 42 validation: ${checks.toLocaleString()} checks PASS; ${compared.toLocaleString()} LUMA QUANTIZE pixels byte/word compared`);
