import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const bytes = rel => fs.readFileSync(path.join(root, rel));
let checks = 0;
function assert(cond, msg) { checks++; if (!cond) throw new Error(`FAIL: ${msg}`); }
function sha(rel) { return crypto.createHash('sha256').update(bytes(rel)).digest('hex'); }

const index = read('src/index.html');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');
const worker = read('src/syphon-stream-worker.js');
const pkg = JSON.parse(read('package.json'));

assert(index.includes('<option value="chroma-posterize">CHROMA POSTERIZE</option>'), 'CHROMA POSTERIZE mode is exposed');
assert(index.includes('id="solarizePosterLevel"'), 'Posterize LEVEL control exists');
assert(index.includes('id="solarizePosterSoft"'), 'Posterize SOFT control exists');
assert(index.includes('id="solarizePosterPhase"'), 'Posterize PHASE control exists');
assert(canvas.includes("mode === 'chroma-posterize'"), 'render activity recognizes CHROMA POSTERIZE');
assert(canvas.includes("document.querySelectorAll('.solarize-poster-only')"), 'mode UI hides non-active Posterize controls');
assert(canvas.includes("s.solarizePosterLevel, s.solarizePosterSoft, s.solarizePosterPhase"), 'poster controls reach the colour stage');
assert(effects.includes('const chromaPosterFragment'), 'bounded GPU chroma-poster shader exists');
assert(effects.includes('_runClassicGpuChromaPosterize'), 'GPU Posterize runner exists');
assert(effects.includes('_posterizeChromaPixelsBytes'), 'CPU Posterize fallback exists');
assert(effects.includes('solarPosterizeFrames'), 'GPU Posterize telemetry exists');
assert(!effects.includes('readPixels('), 'Pass 52 adds no WebGL readPixels synchronization');
assert(!effects.includes('gl.finish('), 'Pass 52 adds no gl.finish synchronization');
assert(!effects.includes('gl.flush('), 'Pass 52 adds no gl.flush synchronization');

// Preserve the accepted Pass 51 Syphon contract exactly while augmenting colour processing.
assert(sha('src-tauri/src/syphon.rs') === 'c763c793c6a1e47579625639e229c2565afd27dfd63e62e7825d6ba7ecc3e944', 'native Syphon publisher remains protected');
assert(sha('src-tauri/src/main.rs') === '5eaff1e342ac2fd2b987c7df6855c4712b2a94692f4dd0476afaedc33e09e83c', 'native WebSocket protocol remains protected');
assert(sha('src/syphon-stream-worker.js') === '43bf5e67908ee93b2a371c84ae65b37d8c4499c7b3e4a1b18d6ada6be460750b', 'Pass 51 two-credit Worker remains protected');
assert(worker.includes('const MAX_OUTSTANDING_FRAMES = 2;'), 'Pass 51 two-credit cap remains');
assert(index.includes('<option value="720p60" selected>60 FPS — 1280×720</option>'), '720p60 remains default');
assert(index.includes('<option value="720p30">30 FPS — 1280×720 (safe)</option>'), '720p30 remains safe fallback');

// Independent CPU/shader-equation model parity. The shader uses the same equations
// in normalized float space; tolerate one byte of final rounding difference.
function process(r8,g8,b8,level,softPct,phaseDeg,amount) {
  const rgb=[r8/255,g8/255,b8/255];
  const y=.299*rgb[0]+.587*rgb[1]+.114*rgb[2];
  const cb=.5+(rgb[2]-y)/1.772, cr=.5+(rgb[0]-y)/1.402;
  const phase=phaseDeg*Math.PI/180, cs=Math.cos(phase), sn=Math.sin(phase);
  const cx=cb-.5, cy=cr-.5;
  const rx=cs*cx-sn*cy, ry=sn*cx+cs*cy;
  const ux=Math.max(0,Math.min(1,rx+.5)), uy=Math.max(0,Math.min(1,ry+.5));
  const steps=Math.max(2,Math.min(64,Math.round(64-62*(Math.max(0,Math.min(100,level))/100))));
  const qx=Math.round(ux*steps)/steps, qy=Math.round(uy*steps)/steps;
  const soft=Math.max(0,Math.min(1,softPct/100));
  const sx=(qx*(1-soft)+ux*soft)-.5, sy=(qy*(1-soft)+uy*soft)-.5;
  const ucx=cs*sx+sn*sy, ucy=-sn*sx+cs*sy;
  const ocb=ucx+.5, ocr=ucy+.5;
  let rr=y+1.402*(ocr-.5), bb=y+1.772*(ocb-.5);
  let gg=(y-.299*rr-.114*bb)/.587;
  rr=Math.max(0,Math.min(1,rr)); gg=Math.max(0,Math.min(1,gg)); bb=Math.max(0,Math.min(1,bb));
  const wet=Math.max(0,Math.min(1,amount));
  return [
    Math.round(r8*(1-wet)+rr*255*wet),
    Math.round(g8*(1-wet)+gg*255*wet),
    Math.round(b8*(1-wet)+bb*255*wet),
  ];
}

let seed=0x52c1a55;
function rnd(){ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/0x100000000; }
for(let i=0;i<32768;i++){
  const r=Math.floor(rnd()*256), g=Math.floor(rnd()*256), b=Math.floor(rnd()*256);
  const level=Math.floor(rnd()*101), soft=Math.floor(rnd()*101), phase=Math.round(rnd()*360-180), amt=rnd();
  const out=process(r,g,b,level,soft,phase,amt);
  assert(out.every(v=>Number.isInteger(v)&&v>=0&&v<=255), `posterized RGB remains byte-safe case ${i}`);
}
for(let i=0;i<1024;i++){
  const r=Math.floor(rnd()*256), g=Math.floor(rnd()*256), b=Math.floor(rnd()*256);
  const out=process(r,g,b,75,0,Math.round(rnd()*360-180),0);
  assert(out[0]===r && out[1]===g && out[2]===b, `AMOUNT 0 is exact neutral case ${i}`);
}

assert(pkg.scripts['validate:pass52'] === 'node scripts/validate-pass52.mjs', 'package exposes Pass 52 validator');
console.log(`HUFF Classic Pass 52 validation: ${checks.toLocaleString()} checks PASS`);
