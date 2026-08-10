import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const html = read('src/index.html');
const canvas = read('src/canvas.js');
const effects = read('src/effects.js');
const pkg = JSON.parse(read('package.json'));
const scanUiStart = html.indexOf('<!-- SCANLINES');
const scanUiEnd = html.indexOf('<!-- GLOBAL MIX -->', scanUiStart);
const scanHtml = html.slice(scanUiStart, scanUiEnd > scanUiStart ? scanUiEnd : html.length);
let checks=0;
function assert(cond,msg){ checks++; if(!cond) throw new Error(msg); }
function hashSection(src,a,b){
  const i=src.indexOf(a); assert(i>=0,`missing section ${a}`);
  const j=src.indexOf(b,i); assert(j>i,`missing section end ${b}`);
  return crypto.createHash('sha256').update(src.slice(i,j)).digest('hex');
}

// UI: one new organizational mode, no re-interpretation of Scanlines.
for (const id of [
  'clusters','scanSpeed','scanPlaceX','scanPlaceY','scanZoom','scanMoveX','scanMoveY','scanMoveZ',
  'scanPanelLayout','scanFieldSpreadX','scanFieldSpreadY','scanFieldSpreadZ','scanFieldSizeVar','scanFieldDrift','scanFieldDepthDrift','scanFieldResetBtn',
  'scanAngle','scanSpinLeft','scanSpinRight','scanSpinSpeed','clusterCount','clusterRadius','scanFocus','scanShift','scanSkew','scanDrift','scanRoll','scanGap','scanAlpha'
]) assert(html.includes(`id="${id}"`),`missing Scanlines control ${id}`);
assert(html.includes('<option value="bands" selected>BANDS</option>'),'BANDS must remain default layout');
assert(html.includes('<option value="field">FIELD</option>'),'FIELD layout missing');
assert(html.includes('class="ctrl scan-field-control" style="display:none"'),'FIELD controls must be contextual');
assert(!scanHtml.includes('FIELD RATE'),'rejected Scanlines FIELD RATE returned');
assert(!scanHtml.includes('ZOOM TARGET'),'rejected Scanlines zoom-target concept returned');
assert(!scanHtml.includes('Raster Scan'),'rejected Raster Scan naming returned');

// Presets and state compatibility.
for (const id of ['scanPanelLayout','scanFieldSpreadX','scanFieldSpreadY','scanFieldSpreadZ','scanFieldSizeVar','scanFieldDrift','scanFieldDepthDrift']) {
  assert(canvas.includes(`'${id}'`),`missing preset/render state id ${id}`);
}
assert(canvas.includes("sourceData.scanPanelLayout = 'bands'"),'legacy presets must load as BANDS');
assert(canvas.includes('syncScanFieldUI'),'contextual FIELD UI sync missing');
assert(canvas.includes("String(els.scanPanelLayout?.value || 'bands') === 'field'"),'FIELD UI delegation missing');

// One Scanlines motion clock remains authoritative.
assert(canvas.includes('nPhaseScanX += scanSpeed * 0.008;'),'scanSpeed must own X phase');
assert(canvas.includes('nPhaseScanY += scanSpeed * 0.009;'),'scanSpeed must own Y phase');
assert(canvas.includes('scanMoveX * scanSpeed * scanDt'),'scanSpeed must scale X motion');
assert(canvas.includes('scanMoveY * scanSpeed * scanDt'),'scanSpeed must scale Y motion');
assert(canvas.includes('scanMoveZ * scanSpeed * scanDt'),'scanSpeed must scale Z motion');
assert(canvas.includes('spinSpeed * scanSpeed * 0.5'),'scanSpeed must scale spin');

const scanStart=effects.indexOf('function applyScanlines(');
const scanEnd=effects.indexOf('// ─── CORRUPT',scanStart);
assert(scanStart>=0 && scanEnd>scanStart,'missing applyScanlines section');
const scan=effects.slice(scanStart,scanEnd);
assert(scan.includes("const fieldMode = panelLayout === 'field';"),'FIELD mode branch missing');
assert(scan.includes('const neutralField = !fieldMode ||'),'zero-field collapse contract missing');
assert(scan.includes('fieldOffsetX = seedX * cross * 0.46 * fieldSpreadX;'),'X spread missing');
assert(scan.includes('fieldOffsetY = seedY * dim * 0.46 * fieldSpreadY;'),'Y spread missing');
assert(scan.includes('Math.sin(phX * 0.85 + phaseA)'),'FIELD XY drift missing');
assert(scan.includes('const depthScale = Math.pow(2'),'FIELD Z spread missing');
assert(scan.includes('Math.sin(phY * 0.58 + phaseA + phaseB)'),'FIELD depth drift missing');
assert(scan.includes('sizeScale = Math.max(0.35, 1 + seedSize * 0.72 * fieldSizeVar);'),'FIELD size variation missing');
assert(scan.includes('const destinationCenterX = destinationOffset + bandCross * 0.5 + fieldOffsetX;'),'per-panel X placement missing');
assert(scan.includes('const destinationCenterY = bandStart + bandLength * 0.5 + fieldOffsetY;'),'per-panel Y placement missing');
assert(scan.includes('const destinationWidth = bandCross * localZoom * sizeScale;'),'per-panel Z/size scaling missing');
assert(scan.includes('const destinationHeight = panelHeight * localZoom * sizeScale;'),'per-panel panel height missing');
assert(!scan.includes('ctx.scale(zoom, zoom)'),'whole-field constrained zoom returned');

// Deterministic field seed must not consume p5 random/noise state.
assert(effects.includes('function _scanPanelFieldSeed01(index, salt)'),'deterministic field seed helper missing');
const helperStart=effects.indexOf('function _scanPanelFieldSeed01');
const helperEnd=effects.indexOf('function applyScanlines',helperStart);
const helper=effects.slice(helperStart,helperEnd);
assert(!helper.includes('random('),'FIELD seed consumes random state');
assert(!helper.includes('noise('),'FIELD seed consumes p5 noise state');

// Underlying band generator must remain exact to accepted lineage.
assert(hashSection(effects,'class ScanlineBandWorkspace','const _scanlineBands') === 'f5d7246a5729fb91cc153a3d698899e6ddf2de19d31319a0755c7dd91f6fde85','ScanlineBandWorkspace changed from Pass39N');

// Numerical field behavior.
function seed01(index, salt) {
  let x = (((index + 1) * 0x9e3779b1) ^ salt) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16; return x / 4294967295;
}
function field(i,{cross=1920,dim=1080,zoom=1,spreadX=.55,spreadY=.45,spreadZ=.5,sizeVar=.2,drift=.15,depthDrift=.1,phX=0,phY=2000}={}){
  const sx=seed01(i,0x13579bdf)*2-1, sy=seed01(i,0x2468ace1)*2-1, sz=seed01(i,0x51f15e5d)*2-1, ss=seed01(i,0xa5a5f00d)*2-1;
  const pa=seed01(i,0xc001d00d)*Math.PI*2, pb=seed01(i,0x7f4a7c15)*Math.PI*2;
  let ox=sx*cross*.46*spreadX, oy=sy*dim*.46*spreadY;
  if(drift>0){ ox+=Math.sin(phX*.85+pa)*cross*.16*drift; oy+=Math.cos(phY*.72+pb)*dim*.16*drift; }
  let z=sz*spreadZ; if(depthDrift>0) z+=Math.sin(phY*.58+pa+pb)*depthDrift*.70;
  const depth=Math.pow(2,Math.max(-1.35,Math.min(1.35,z*1.35)));
  return {ox,oy,zoom:Math.max(.25,Math.min(4,zoom*depth)),size:Math.max(.35,1+ss*.72*sizeVar)};
}
const zero=field(4,{spreadX:0,spreadY:0,spreadZ:0,sizeVar:0,drift:0,depthDrift:0});
assert(Math.abs(zero.ox)<1e-12 && Math.abs(zero.oy)<1e-12 && Math.abs(zero.zoom-1)<1e-12 && Math.abs(zero.size-1)<1e-12,'zero FIELD must collapse to BANDS geometry');
const defaults=Array.from({length:8},(_,i)=>field(i));
assert(new Set(defaults.map(v=>v.ox.toFixed(3))).size>=6,'default FIELD X distribution is not diverse');
assert(new Set(defaults.map(v=>v.oy.toFixed(3))).size>=6,'default FIELD Y distribution is not diverse');
assert(Math.max(...defaults.map(v=>v.zoom))-Math.min(...defaults.map(v=>v.zoom))>.4,'default FIELD Z spread is too weak');
assert(Math.max(...defaults.map(v=>v.size))-Math.min(...defaults.map(v=>v.size))>.08,'default FIELD size variation is too weak');
const staticA=field(3,{drift:0,depthDrift:0,phX:0,phY:2000});
const staticB=field(3,{drift:0,depthDrift:0,phX:99,phY:9999});
assert(JSON.stringify(staticA)===JSON.stringify(staticB),'zero drift FIELD must not move with phases');

// No new expensive video path.
assert(!scan.includes('getImageData'),'Scan FIELD added getImageData');
assert(!scan.includes('putImageData'),'Scan FIELD added putImageData');
assert(!scan.includes('createGraphics'),'Scan FIELD added graphics buffer');
assert(!scan.includes('frameRing'),'Scan FIELD added historical FrameRing sampling');

// Protected effect families stay exact to Pass39N.
assert(hashSection(effects,'function applyGlitch','// ─── Flow') === '86de36c770a065a75681308055108cfd8375d86e9a9bb3fa3c6341d733123031','Corrupt section changed');
assert(hashSection(effects,'// ─── Flow warp','// ─── Symmetry') === '7e8e557ee872556cd1557023e6ab2620026796c8d5527e4684f97f7cba99a99f','Flow section changed');
const lumaStart=effects.indexOf('// ─── Pipeline Luma Key'); assert(lumaStart>=0,'missing Luma section');
const lumaHash=crypto.createHash('sha256').update(effects.slice(lumaStart)).digest('hex');
assert(lumaHash === '6f3655e25a1a4ac1f820babb6d9f8b96510c7b541828e2ea820e6a15b8a3441e','Luma section changed');

assert(pkg.scripts['simulate:pass40u']==='node scripts/simulate-pass40u-scan-field.mjs','simulation script missing from package.json');
console.log(`PASS 40U validation: ${checks} checks PASS`);
