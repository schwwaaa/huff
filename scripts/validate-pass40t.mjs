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
function hashSection(src,a,b){
  const i=src.indexOf(a); assert(i>=0,`missing section ${a}`);
  const j=src.indexOf(b,i); assert(j>i,`missing section end ${b}`);
  return crypto.createHash('sha256').update(src.slice(i,j)).digest('hex');
}

// Existing requested control surface remains present.
for (const id of ['clusters','scanSpeed','scanPlaceX','scanPlaceY','scanZoom','scanMoveX','scanMoveY','scanMoveZ','scanAngle','scanSpinLeft','scanSpinRight','scanSpinSpeed','clusterCount','clusterRadius','scanFocus','scanShift','scanSkew','scanDrift','scanRoll','scanGap','scanAlpha']) {
  assert(html.includes(`id="${id}"`),`missing Scanlines control ${id}`);
}
assert(html.includes('Panel-aware ZOOM'),'ZOOM UI must explain panel-aware behavior');
assert(!scanHtml.includes('FIELD RATE'),'rejected FIELD RATE label returned');
assert(!scanHtml.includes('ZOOM TARGET'),'rejected zoom-target modes returned');
assert(!scanHtml.includes('Raster Scan'),'rejected Raster Scan concept returned');

// One speed clock and current XYZ motion remain unchanged from 40S intent.
assert(canvas.includes('nPhaseScanX += scanSpeed * 0.008;'),'scanSpeed must own X phase');
assert(canvas.includes('nPhaseScanY += scanSpeed * 0.009;'),'scanSpeed must own Y phase');
assert(canvas.includes('scanMoveX * scanSpeed * scanDt'),'scanSpeed must scale X motion');
assert(canvas.includes('scanMoveY * scanSpeed * scanDt'),'scanSpeed must scale Y motion');
assert(canvas.includes('scanMoveZ * scanSpeed * scanDt'),'scanSpeed must scale Z motion');
assert(canvas.includes('spinSpeed * scanSpeed * 0.5'),'scanSpeed must scale spin');

// Zoom fix: do not scale one constrained strip field as a canvas object.
const scanStart=effects.indexOf('function applyScanlines(');
const scanEnd=effects.indexOf('// ─── CORRUPT',scanStart);
assert(scanStart>=0 && scanEnd>scanStart,'missing applyScanlines section');
const scan=effects.slice(scanStart,scanEnd);
assert(!scan.includes('ctx.scale(zoom, zoom)'),'global constrained field zoom must be removed');
assert(scan.includes('const zoomDepth = neutralZoom ? 0 : Math.min(1, Math.abs(Math.log2(zoom)));'),'panel depth curve missing');
assert(scan.includes('const panelMix = zoomDepth * zoomDepth * (3 - 2 * zoomDepth);'),'panel unfold curve missing');
assert(scan.includes('const desiredPanelHeight = Math.max(bandLength, bandCross / sourceAspect);'),'panel aspect expansion missing');
assert(scan.includes('const destinationWidth = bandCross * zoom;'),'per-panel destination zoom missing');
assert(scan.includes('const destinationHeight = panelHeight * zoom;'),'per-panel height zoom missing');
assert(scan.includes('sourceOffset, sourceY, bandCross, sampledHeight,'),'expanded source window missing');
assert(scan.includes('destinationX, destinationY, destinationWidth, destinationHeight,'),'free panel destination missing');
assert(scan.includes('if (neutralZoom)'),'neutral flat-band branch missing');
assert(scan.includes('sourceOffset, bandStart, bandCross, bandLength,'),'neutral source rectangle missing');
assert(scan.includes('destinationOffset, bandStart, bandCross, bandLength,'),'neutral destination rectangle missing');

// Numerical simulation of the 2D -> panel -> depth behavior.
function panelGeometry({x,y,w,h},zoom,W=1920,H=1080){
  const neutral=Math.abs(zoom-1)<1e-9;
  const depth=neutral?0:Math.min(1,Math.abs(Math.log2(zoom)));
  const mix=depth*depth*(3-2*depth);
  const aspect=W/H;
  const desired=Math.max(h,w/aspect);
  const ph=h+(desired-h)*mix;
  const dw=w*zoom, dh=ph*zoom;
  return {x:x+w/2-dw/2,y:y+h/2-dh/2,w:dw,h:dh,mix};
}
const base={x:420,y:445,w:1120,h:96};
const neutral=panelGeometry(base,1);
assert(neutral.x===base.x && neutral.y===base.y && neutral.w===base.w && neutral.h===base.h && neutral.mix===0,'1x must be exact flat-band geometry');
const forward=panelGeometry(base,2);
assert(forward.h>base.h*5,'2x must escape original band-height lane');
assert(Math.abs(forward.w/forward.h-(1920/1080))<1e-9,'2x must become source-aspect panel');
const rear=panelGeometry(base,0.5);
assert(rear.w<base.w,'0.5x must recede in width');
assert(rear.h>base.h,'0.5x must be a free small panel rather than a thinner strip');
const mid=panelGeometry(base,1.5);
assert(mid.mix>0 && mid.mix<1,'1.5x must smoothly interpolate from strip to panel');

// The underlying Pass39N band generator remains exact.
assert(hashSection(effects,'class ScanlineBandWorkspace','const _scanlineBands') === 'f5d7246a5729fb91cc153a3d698899e6ddf2de19d31319a0755c7dd91f6fde85','ScanlineBandWorkspace changed from Pass39N');

// No expensive new pixel path / buffer.
assert(!scan.includes('getImageData'),'Scanlines added getImageData');
assert(!scan.includes('putImageData'),'Scanlines added putImageData');
assert(!scan.includes('createGraphics'),'Scanlines added graphics buffer');
assert(!scan.includes('frameRing'),'Scanlines added historical FrameRing sampling');

// Protected effect families stay exact to Pass39N.
assert(hashSection(effects,'function applyGlitch','// ─── Flow') === '86de36c770a065a75681308055108cfd8375d86e9a9bb3fa3c6341d733123031','Corrupt section changed');
assert(hashSection(effects,'// ─── Flow warp','// ─── Symmetry') === '7e8e557ee872556cd1557023e6ab2620026796c8d5527e4684f97f7cba99a99f','Flow section changed');
const lumaStart=effects.indexOf('// ─── Pipeline Luma Key'); assert(lumaStart>=0,'missing Luma section');
const lumaHash=crypto.createHash('sha256').update(effects.slice(lumaStart)).digest('hex');
assert(lumaHash === '6f3655e25a1a4ac1f820babb6d9f8b96510c7b541828e2ea820e6a15b8a3441e','Luma section changed');

console.log(`PASS 40T validation: ${checks} checks PASS`);
