// Pass 40U deterministic Scan PANEL FIELD geometry simulation.
// This does not render video; it validates the spatial contract used by applyScanlines().

function seed01(index, salt) {
  let x = (((index + 1) * 0x9e3779b1) ^ salt) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x / 4294967295;
}

function fieldPanel(i, opts = {}) {
  const {
    cross = 1920,
    dim = 1080,
    baseX = 400,
    baseY = 420,
    bandCross = 960,
    bandLength = 90,
    zoom = 1.5,
    spreadX = 0.55,
    spreadY = 0.45,
    spreadZ = 0.50,
    sizeVar = 0.20,
    drift = 0.15,
    depthDrift = 0.10,
    phX = 0,
    phY = 2000,
  } = opts;
  const sx = seed01(i, 0x13579bdf) * 2 - 1;
  const sy = seed01(i, 0x2468ace1) * 2 - 1;
  const sz = seed01(i, 0x51f15e5d) * 2 - 1;
  const ss = seed01(i, 0xa5a5f00d) * 2 - 1;
  const pa = seed01(i, 0xc001d00d) * Math.PI * 2;
  const pb = seed01(i, 0x7f4a7c15) * Math.PI * 2;

  let ox = sx * cross * 0.46 * spreadX;
  let oy = sy * dim * 0.46 * spreadY;
  ox += Math.sin(phX * 0.85 + pa) * cross * 0.16 * drift;
  oy += Math.cos(phY * 0.72 + pb) * dim * 0.16 * drift;

  let z = sz * spreadZ;
  z += Math.sin(phY * 0.58 + pa + pb) * depthDrift * 0.70;
  const depthScale = Math.pow(2, Math.max(-1.35, Math.min(1.35, z * 1.35)));
  const localZoom = Math.max(0.25, Math.min(4, zoom * depthScale));
  const sizeScale = Math.max(0.35, 1 + ss * 0.72 * sizeVar);

  const centerX = baseX + bandCross / 2 + ox;
  const centerY = baseY + bandLength / 2 + oy;
  return {i, x:centerX, y:centerY, zoom:localZoom, size:sizeScale, ox, oy};
}

function fmt(n){ return n.toFixed(2); }

console.log('Pass 40U — Scan PANEL FIELD simulation');
console.log('Default FIELD: spread X 55%, Y 45%, Z 50%, size var 20%, drift 15%, depth drift 10%');
console.log('Panel   center X   center Y   local ZOOM   size');
for (let i=0;i<8;i++) {
  const p=fieldPanel(i);
  console.log(String(i+1).padStart(5), fmt(p.x).padStart(10), fmt(p.y).padStart(10), (fmt(p.zoom)+'x').padStart(12), fmt(p.size).padStart(7));
}

const a=fieldPanel(2,{drift:0,depthDrift:0,phX:0,phY:2000});
const b=fieldPanel(2,{drift:0,depthDrift:0,phX:99,phY:9999});
if (JSON.stringify(a)!==JSON.stringify(b)) throw new Error('Static FIELD changed while drift controls were zero');

const zero=fieldPanel(2,{spreadX:0,spreadY:0,spreadZ:0,sizeVar:0,drift:0,depthDrift:0,zoom:1});
if (Math.abs(zero.ox)>1e-12 || Math.abs(zero.oy)>1e-12 || Math.abs(zero.zoom-1)>1e-12 || Math.abs(zero.size-1)>1e-12) {
  throw new Error('Zeroed FIELD did not collapse to neutral BANDS geometry');
}

console.log('\nPASS: deterministic distribution, zeroed FIELD collapse, and drift-independent static anchors validated.');
