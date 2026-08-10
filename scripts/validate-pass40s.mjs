import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const html = read('src/index.html');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');
const scanUiStart = html.indexOf('<!-- SCANLINES');
const scanUiEnd = html.indexOf('<!-- LUMA', scanUiStart) > scanUiStart ? html.indexOf('<!-- LUMA', scanUiStart) : html.length;
const scanHtml = html.slice(scanUiStart, scanUiEnd);
let checks=0;
function assert(cond,msg){ checks++; if(!cond) throw new Error(msg); }
function count(h,n){ return h.split(n).length-1; }
function hashSection(src,a,b){
  const i=src.indexOf(a); assert(i>=0,`missing section ${a}`);
  const j=src.indexOf(b,i); assert(j>i,`missing section end ${b}`);
  return crypto.createHash('sha256').update(src.slice(i,j)).digest('hex');
}

// UI: one speed only; no rejected conceptual replacement controls.
for (const id of ['clusters','scanSpeed','scanPlaceX','scanPlaceY','scanZoom','scanMoveX','scanMoveY','scanMoveZ','scanAngle','scanSpinLeft','scanSpinRight','scanSpinSpeed','clusterCount','clusterRadius','scanFocus','scanShift','scanSkew','scanDrift','scanRoll','scanGap','scanAlpha']) {
  assert(html.includes(`id="${id}"`),`missing UI control ${id}`);
}
assert(count(html,'id="scanSpeed"')===1,'scanSpeed must appear once');
assert(!scanHtml.includes('FIELD RATE'),'Scanlines FIELD RATE must not be visible');
assert(!scanHtml.includes('ZOOM TARGET'),'Scanlines ZOOM TARGET must not be visible');
assert(!scanHtml.includes('scanMasterSpeed'),'rejected Scanlines scanMasterSpeed must be absent');
assert(!scanHtml.includes('scanZoomMode'),'rejected Scanlines zoom mode must be absent');
assert(!scanHtml.includes('Raster Scan'),'rejected Raster Scan concept must be absent');
assert(scanHtml.includes('General zoom for the complete existing Scanlines result'),'Zoom must be one general effect zoom');

// One SPEED governs every automatic motion path.
assert(canvas.includes('nPhaseScanX += scanSpeed * 0.008;'),'SPEED must drive original X phase');
assert(canvas.includes('nPhaseScanY += scanSpeed * 0.009;'),'SPEED must drive original Y phase');
assert(canvas.includes('spinSpeed * scanSpeed * 0.5'),'SPEED must scale spin');
assert(canvas.includes('scanMoveX * scanSpeed * scanDt'),'SPEED must scale X motion');
assert(canvas.includes('scanMoveY * scanSpeed * scanDt'),'SPEED must scale Y motion');
assert(canvas.includes('scanMoveZ * scanSpeed * scanDt'),'SPEED must scale zoom motion');
assert(!canvas.includes('scanSpeed * scanMasterSpeed'),'double-speed architecture must be absent');

// SPEED 0 simulation: no phase/spin/spatial evolution.
function step(st,cfg,dt=1/60){
  const speed=Math.max(0,Number(cfg.speed)||0);
  st.phX += speed*0.008; st.phY += speed*0.009;
  st.x += (cfg.moveX||0)*speed*dt; st.y += (cfg.moveY||0)*speed*dt;
  if ((cfg.moveZ||0)!==0 && speed>0) st.zoomOffset += (cfg.moveZ||0)*speed*dt*st.zDir;
  if(cfg.spinRight) st.spin=(st.spin+(cfg.spinSpeed||0)*speed*0.5)%360;
  return st;
}
let st={phX:0,phY:2000,x:0,y:0,zoomOffset:0,zDir:1,spin:0};
for(let i=0;i<600;i++) step(st,{speed:0,moveX:999,moveY:-999,moveZ:2,spinRight:true,spinSpeed:10});
assert(st.phX===0 && st.phY===2000 && st.x===0 && st.y===0 && st.zoomOffset===0 && st.spin===0,'SPEED 0 must be stable');
st={phX:0,phY:2000,x:0,y:0,zoomOffset:0,zDir:1,spin:0};
step(st,{speed:1,spinRight:true,spinSpeed:1});
assert(st.phX===0.008,'1x must preserve Pass39N X phase increment');
assert(st.phY===2000.009,'1x must preserve Pass39N Y phase increment');
assert(st.spin===0.5,'1x must preserve Pass39N spin increment');

// General zoom only wraps the existing renderer; source crop stays original.
assert(effects.includes('const zoom = Math.max(0.25, Math.min(4, baseZoom + motionZoomOffset));'),'combined general zoom missing');
assert(effects.includes('ctx.scale(zoom, zoom);'),'general centered zoom transform missing');
assert(!effects.includes('contentZoom'),'content zoom architecture must be absent');
assert(!effects.includes('fieldZoom'),'field zoom architecture must be absent');
assert(!effects.includes('zoomMode'),'zoom mode architecture must be absent');
assert(effects.includes('sourceOffsets[i], bandStart, bandCross, bandLength,'),'original source rectangle must remain');
assert(effects.includes('destinationOffsets[i], bandStart, bandCross, bandLength,'),'original destination rectangle must remain');

// Original band generator remains byte-identical to Pass 39N.
assert(hashSection(effects,'class ScanlineBandWorkspace','const _scanlineBands') === 'f5d7246a5729fb91cc153a3d698899e6ddf2de19d31319a0755c7dd91f6fde85','ScanlineBandWorkspace changed from Pass39N');

// No new CPU pixel path or full-res graphics allocation in the Scanlines implementation.
const scanSection = effects.slice(effects.indexOf('function applyScanlines('), effects.indexOf('// ─── CORRUPT', effects.indexOf('function applyScanlines(')));
assert(!scanSection.includes('getImageData'),'Scanlines added getImageData');
assert(!scanSection.includes('putImageData'),'Scanlines added putImageData');
assert(!scanSection.includes('createGraphics'),'Scanlines added graphics buffer');
assert(!scanSection.includes('frameRing'),'Scanlines added historical FrameRing sampling');

// Protected effect families stay exact to Pass 39N where they are outside this pass.
assert(hashSection(effects,'function applyGlitch','// ─── Flow') === '86de36c770a065a75681308055108cfd8375d86e9a9bb3fa3c6341d733123031','Corrupt section changed');
assert(hashSection(effects,'// ─── Flow warp','// ─── Symmetry') === '7e8e557ee872556cd1557023e6ab2620026796c8d5527e4684f97f7cba99a99f','Flow section changed');
const lumaStart=effects.indexOf('// ─── Pipeline Luma Key'); assert(lumaStart>=0,'missing Luma section');
const lumaHash=crypto.createHash('sha256').update(effects.slice(lumaStart)).digest('hex');
assert(lumaHash === '6f3655e25a1a4ac1f820babb6d9f8b96510c7b541828e2ea820e6a15b8a3441e','Luma section changed');

console.log(`PASS 40S validation: ${checks} checks PASS`);
