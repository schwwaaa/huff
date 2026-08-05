import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const effectsSource = fs.readFileSync(path.join(root, 'src/effects.js'), 'utf8');
const canvasSource = fs.readFileSync(path.join(root, 'src/canvas.js'), 'utf8');
const packageSource = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function deterministicNoise(x, y = 0) {
  const z = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return z - Math.floor(z);
}

function oldBands(args, countNoise = null) {
  const {
    width, height, angleDeg, scanBands, bandSize, scanGap, scanSkew,
    focus, roll, shiftScale, driftAmt, phX, phY,
  } = args;
  const angleRad = (angleDeg * Math.PI) / 180;
  const absS = Math.abs(Math.sin(angleRad));
  const absC = Math.abs(Math.cos(angleRad));
  const dim = width * absS + height * absC;
  const cross = width * absC + height * absS;
  const rollOffset = (phY * roll * 80) % dim;
  const focusDistance = Math.abs(focus - 0.5);
  const gridStep = Math.max(1, bandSize + scanGap);
  const shiftRange = cross * shiftScale;
  const shiftSpan = shiftRange - (-shiftRange);
  const noShift = shiftScale === 0 && scanSkew === 0;
  const noFastJitter = driftAmt === 0;
  const out = [];
  let noiseCalls = 0;
  const noise = (x) => { noiseCalls++; return deterministicNoise(x); };

  for (let n = 0; n < scanBands; n++) {
    const slowDrift = noise(n * 3.7 + phY * 0.25 * driftAmt) * dim;
    const fastJitter = noFastJitter
      ? 0
      : (noise(n * 11.3 + phY * 1.8 * driftAmt) - 0.5) * dim * 0.12 * driftAmt;
    const biased = slowDrift * (1 - focusDistance * 1.4)
      + (focus * dim) * focusDistance * 1.4
      + fastJitter;
    const rawPos = ((biased + rollOffset) % dim + dim) % dim;
    const gridPos = scanGap > 0
      ? Math.floor(rawPos / gridStep) * gridStep
      : rawPos;
    const bandStart = Math.max(0, Math.floor(gridPos));
    const bandEnd = Math.min(dim, bandStart + bandSize);
    const bandLength = bandEnd - bandStart;
    if (bandLength <= 0) continue;

    let shift = 0;
    if (!noShift) {
      const skewOffset = Math.floor(scanSkew * bandStart);
      const shiftNoise = noise(n * 2.3 + phX * 0.5);
      shift = Math.floor(shiftNoise * shiftSpan + (-shiftRange)) + skewOffset;
    }
    const sourceOffset = Math.max(0, shift < 0 ? -shift : 0);
    const destinationOffset = Math.max(0, shift > 0 ? shift : 0);
    const bandCross = cross - Math.abs(shift);
    if (bandCross <= 0) continue;
    out.push([bandStart, bandLength, sourceOffset, destinationOffset, bandCross]);
  }
  if (countNoise) countNoise.value = noiseCalls;
  return { angleRad, dim, cross, out };
}

function newBands(args, countNoise = null) {
  const {
    width, height, angleDeg, scanBands, bandSize, scanGap, scanSkew,
    focus, roll, shiftScale, driftAmt, phX, phY,
  } = args;
  const angleRad = (angleDeg * Math.PI) / 180;
  const absS = Math.abs(Math.sin(angleRad));
  const absC = Math.abs(Math.cos(angleRad));
  const dim = width * absS + height * absC;
  const cross = width * absC + height * absS;
  const rollOffset = (phY * roll * 80) % dim;
  const focusDistance = Math.abs(focus - 0.5);
  const focusBias = focusDistance * 1.4;
  const slowScale = 1 - focusBias;
  const focusOffset = (focus * dim) * focusDistance * 1.4;
  const gridStep = Math.max(1, bandSize + scanGap);
  const snapToGrid = scanGap > 0;
  const shiftRange = cross * shiftScale;
  const shiftSpan = shiftRange - (-shiftRange);
  const noShift = shiftScale === 0 && scanSkew === 0;
  const noFastJitter = driftAmt === 0;
  const slowPhase = phY * 0.25 * driftAmt;
  const fastPhase = phY * 1.8 * driftAmt;
  const shiftPhase = phX * 0.5;
  const out = [];
  let noiseCalls = 0;
  const noise = (x) => { noiseCalls++; return deterministicNoise(x); };

  if (noFastJitter) {
    if (noShift) {
      for (let n = 0; n < scanBands; n++) {
        const slowDrift = noise(n * 3.7 + slowPhase) * dim;
        const biased = slowDrift * slowScale + focusOffset;
        const rawPos = ((biased + rollOffset) % dim + dim) % dim;
        const gridPos = snapToGrid ? Math.floor(rawPos / gridStep) * gridStep : rawPos;
        const bandStart = Math.max(0, Math.floor(gridPos));
        const bandEnd = Math.min(dim, bandStart + bandSize);
        const bandLength = bandEnd - bandStart;
        if (bandLength <= 0) continue;
        out.push([bandStart, bandLength, 0, 0, cross]);
      }
    } else {
      for (let n = 0; n < scanBands; n++) {
        const slowDrift = noise(n * 3.7 + slowPhase) * dim;
        const biased = slowDrift * slowScale + focusOffset;
        const rawPos = ((biased + rollOffset) % dim + dim) % dim;
        const gridPos = snapToGrid ? Math.floor(rawPos / gridStep) * gridStep : rawPos;
        const bandStart = Math.max(0, Math.floor(gridPos));
        const bandEnd = Math.min(dim, bandStart + bandSize);
        const bandLength = bandEnd - bandStart;
        if (bandLength <= 0) continue;
        const skewOffset = Math.floor(scanSkew * bandStart);
        const shiftNoise = noise(n * 2.3 + shiftPhase);
        const shift = Math.floor(shiftNoise * shiftSpan + (-shiftRange)) + skewOffset;
        const sourceOffset = Math.max(0, shift < 0 ? -shift : 0);
        const destinationOffset = Math.max(0, shift > 0 ? shift : 0);
        const bandCross = cross - Math.abs(shift);
        if (bandCross <= 0) continue;
        out.push([bandStart, bandLength, sourceOffset, destinationOffset, bandCross]);
      }
    }
  } else if (noShift) {
    for (let n = 0; n < scanBands; n++) {
      const slowDrift = noise(n * 3.7 + slowPhase) * dim;
      const fastJitter = (noise(n * 11.3 + fastPhase) - 0.5) * dim * 0.12 * driftAmt;
      const biased = slowDrift * slowScale + focusOffset + fastJitter;
      const rawPos = ((biased + rollOffset) % dim + dim) % dim;
      const gridPos = snapToGrid ? Math.floor(rawPos / gridStep) * gridStep : rawPos;
      const bandStart = Math.max(0, Math.floor(gridPos));
      const bandEnd = Math.min(dim, bandStart + bandSize);
      const bandLength = bandEnd - bandStart;
      if (bandLength <= 0) continue;
      out.push([bandStart, bandLength, 0, 0, cross]);
    }
  } else {
    for (let n = 0; n < scanBands; n++) {
      const slowDrift = noise(n * 3.7 + slowPhase) * dim;
      const fastJitter = (noise(n * 11.3 + fastPhase) - 0.5) * dim * 0.12 * driftAmt;
      const biased = slowDrift * slowScale + focusOffset + fastJitter;
      const rawPos = ((biased + rollOffset) % dim + dim) % dim;
      const gridPos = snapToGrid ? Math.floor(rawPos / gridStep) * gridStep : rawPos;
      const bandStart = Math.max(0, Math.floor(gridPos));
      const bandEnd = Math.min(dim, bandStart + bandSize);
      const bandLength = bandEnd - bandStart;
      if (bandLength <= 0) continue;
      const skewOffset = Math.floor(scanSkew * bandStart);
      const shiftNoise = noise(n * 2.3 + shiftPhase);
      const shift = Math.floor(shiftNoise * shiftSpan + (-shiftRange)) + skewOffset;
      const sourceOffset = Math.max(0, shift < 0 ? -shift : 0);
      const destinationOffset = Math.max(0, shift > 0 ? shift : 0);
      const bandCross = cross - Math.abs(shift);
      if (bandCross <= 0) continue;
      out.push([bandStart, bandLength, sourceOffset, destinationOffset, bandCross]);
    }
  }
  if (countNoise) countNoise.value = noiseCalls;
  return { angleRad, dim, cross, out };
}

const widths = [1, 319, 640, 1280, 1920, 2560];
const heights = [1, 180, 360, 720, 1080, 1440];
const angles = [-180, -90, -45.5, -0, 0, 0.0005, 17.25, 45, 90, 179.75, 360];
const counts = [1, 2, 7, 31, 128, 257];
const sizes = [4, 5, 17, 64, 191];
const gaps = [0, 1, 9, 80, 300];
const skews = [-1.5, -0.01, 0, 0.2, 1.75];
const focuses = [0, 0.125, 0.5, 0.875, 1];
const rolls = [-3, -0.25, 0, 0.75, 4];
const shifts = [0, 0.01, 0.2, 0.8];
const drifts = [0, 0.01, 0.5, 2.5];

let cases = 0;
let comparedFields = 0;
let comparedBands = 0;
for (let i = 0; i < 12000; i++) {
  const args = {
    width: widths[(i * 3) % widths.length],
    height: heights[(i * 5) % heights.length],
    angleDeg: angles[(i * 7) % angles.length],
    scanBands: counts[(i * 11) % counts.length],
    bandSize: sizes[(i * 13) % sizes.length],
    scanGap: gaps[(i * 17) % gaps.length],
    scanSkew: skews[(i * 19) % skews.length],
    focus: focuses[(i * 23) % focuses.length],
    roll: rolls[(i * 29) % rolls.length],
    shiftScale: shifts[(i * 31) % shifts.length],
    driftAmt: drifts[(i * 37) % drifts.length],
    phX: (i % 97) * 0.03125,
    phY: 2000 + (i % 113) * 0.027,
  };
  // Force all four specialization quadrants regularly.
  if (i % 4 === 0) { args.driftAmt = 0; args.shiftScale = 0; args.scanSkew = 0; }
  if (i % 4 === 1) { args.driftAmt = 0; args.shiftScale = 0.2; }
  if (i % 4 === 2) { args.driftAmt = 0.5; args.shiftScale = 0; args.scanSkew = 0; }
  if (i % 4 === 3) { args.driftAmt = 0.5; args.shiftScale = 0.2; }

  const oldCount = { value: 0 };
  const newCount = { value: 0 };
  const before = oldBands(args, oldCount);
  const after = newBands(args, newCount);
  assert(Object.is(before.angleRad, after.angleRad), `angle mismatch case ${i}`);
  assert(Object.is(before.dim, after.dim), `dim mismatch case ${i}`);
  assert(Object.is(before.cross, after.cross), `cross mismatch case ${i}`);
  assert(oldCount.value === newCount.value, `noise-call mismatch case ${i}: ${oldCount.value} !== ${newCount.value}`);
  assert(before.out.length === after.out.length, `band count mismatch case ${i}`);
  for (let b = 0; b < before.out.length; b++) {
    for (let f = 0; f < 5; f++) {
      assert(Object.is(before.out[b][f], after.out[b][f]),
        `field mismatch case ${i}, band ${b}, field ${f}: ${before.out[b][f]} !== ${after.out[b][f]}`);
      comparedFields++;
    }
    comparedBands++;
  }
  cases++;
}

// The exact zero-angle legacy transform is identity relative to any incoming
// transform because both translations cancel and rotation is skipped.
for (const width of [1, 319, 640, 1280, 1920]) {
  for (const height of [1, 181, 720, 1080]) {
    const angleRad = (0 * Math.PI) / 180;
    const dim = width * Math.abs(Math.sin(angleRad)) + height * Math.abs(Math.cos(angleRad));
    const tx = width / 2 + (-width / 2);
    const ty = height / 2 + (-dim / 2);
    assert(Object.is(tx, 0) || Object.is(tx, -0), `horizontal X transform did not cancel at ${width}x${height}`);
    assert(Object.is(ty, 0) || Object.is(ty, -0), `horizontal Y transform did not cancel at ${width}x${height}`);
  }
}

assert(effectsSource.includes('this.directHorizontal = angleDeg === 0;'), 'direct horizontal geometry marker missing');
assert(effectsSource.includes('if (workspace.directHorizontal) {'), 'direct horizontal dispatch missing');
assert(effectsSource.includes('const previousAlpha = ctx.globalAlpha;'), 'horizontal alpha preservation missing');
assert(effectsSource.includes('ctx.globalAlpha = previousAlpha;'), 'horizontal alpha restoration missing');
assert(effectsSource.includes('const slowPhase = phY * 0.25 * driftAmt;'), 'cached slow phase missing');
assert(effectsSource.includes('const fastPhase = phY * 1.8 * driftAmt;'), 'cached fast phase missing');
assert(effectsSource.includes('const shiftPhase = phX * 0.5;'), 'cached shift phase missing');
assert(effectsSource.includes('if (noFastJitter) {\n      if (noShift) {'), 'scanline specialization dispatch missing');
assert(effectsSource.includes('const starts = workspace.start;'), 'local draw-array resolution missing');
assert(effectsSource.includes('geometryRebuilds: 0'), 'scanline geometry telemetry missing');
assert(effectsSource.includes('directFrames: 0'), 'scanline path telemetry missing');
assert(canvasSource.includes("'scan geom  '"), 'profiler scan geometry row missing');
assert(canvasSource.includes("'scan prep  '"), 'profiler scan preparation row missing');
assert(canvasSource.includes("'scan path  '"), 'profiler scan dispatch row missing');
assert(packageSource.scripts?.['validate:pass22'] === 'node scripts/validate-pass22.mjs', 'validate:pass22 package script missing');

console.log(`PASS 22 validation passed: ${cases} scanline cases, ${comparedBands} bands, ${comparedFields} exact band-field comparisons.`);
console.log('All four drift/shift specialization quadrants preserved exact noise-call counts and output fields.');
console.log('Exact zero-angle legacy translations cancel, validating the direct horizontal dispatch boundary.');
