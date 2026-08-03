import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const effectsSource = fs.readFileSync(path.join(root, 'src/effects.js'), 'utf8');
const packageSource = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const canvasSource = fs.readFileSync(path.join(root, 'src/canvas.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function p5Map(value, start1, stop1, start2, stop2) {
  return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
}

function deterministicNoise(x, y = 0) {
  const z = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return z - Math.floor(z);
}

function oldBands({
  width,
  height,
  angleDeg,
  scanBands,
  clusterRadius,
  scanAlpha,
  scanPriority,
  shiftScale,
  driftAmt,
  scanGap,
  scanSkew,
  focus,
  roll,
  phX,
  phY,
}) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const bandAlpha = scanAlpha * scanPriority;
  if (!(bandAlpha > 0) || scanBands <= 0) return { angleRad, dim: 0, cross: 0, bands: [] };
  const absS = Math.abs(Math.sin(angleRad));
  const absC = Math.abs(Math.cos(angleRad));
  const dim = width * absS + height * absC;
  const cross = width * absC + height * absS;
  const bSize = Math.max(4, Math.floor(Math.trunc(clusterRadius) * 3));
  const rollOffset = (phY * roll * 80) % dim;
  const bands = [];

  for (let n = 0; n < scanBands; n++) {
    const slowDrift = deterministicNoise(n * 3.7 + phY * 0.25 * driftAmt) * dim;
    const fastJitter = (deterministicNoise(n * 11.3 + phY * 1.8 * driftAmt) - 0.5) * dim * 0.12 * driftAmt;
    const biased = slowDrift * (1 - Math.abs(focus - 0.5) * 1.4)
      + (focus * dim) * Math.abs(focus - 0.5) * 1.4
      + fastJitter;
    const rawPos = ((biased + rollOffset) % dim + dim) % dim;
    const gridPos = scanGap > 0
      ? Math.floor(rawPos / Math.max(1, bSize + scanGap)) * (bSize + scanGap)
      : rawPos;
    const bStart = Math.max(0, Math.floor(gridPos));
    const bEnd = Math.min(dim, bStart + bSize);
    const bLen = bEnd - bStart;
    if (bLen <= 0) continue;
    const skewOffset = Math.floor(scanSkew * bStart);
    const shift = Math.floor(
      p5Map(
        deterministicNoise(n * 2.3 + phX * 0.5),
        0,
        1,
        -cross * shiftScale,
        cross * shiftScale,
      ),
    ) + skewOffset;
    const srcOff = Math.max(0, shift < 0 ? -shift : 0);
    const dstOff = Math.max(0, shift > 0 ? shift : 0);
    const bCross = cross - Math.abs(shift);
    if (bCross <= 0) continue;
    bands.push([bStart, bLen, srcOff, dstOff, bCross]);
  }
  return { angleRad, dim, cross, bands };
}

class NewWorkspaceModel {
  constructor() {
    this.slowSeed = [];
    this.fastSeed = [];
    this.shiftSeed = [];
    this.geometry = null;
    this.cache = null;
    this.noiseCalls = 0;
  }

  noise(x, y = 0) {
    this.noiseCalls++;
    return deterministicNoise(x, y);
  }

  ensure(required) {
    for (let n = this.slowSeed.length; n < required; n++) {
      this.slowSeed[n] = n * 3.7;
      this.fastSeed[n] = n * 11.3;
      this.shiftSeed[n] = n * 2.3;
    }
  }

  resolveGeometry(width, height, angleDeg) {
    if (this.geometry && this.geometry.width === width && this.geometry.height === height && this.geometry.angleDeg === angleDeg) {
      return this.geometry;
    }
    const angleRad = (angleDeg * Math.PI) / 180;
    const absS = Math.abs(Math.sin(angleRad));
    const absC = Math.abs(Math.cos(angleRad));
    this.geometry = {
      width,
      height,
      angleDeg,
      angleRad,
      dim: width * absS + height * absC,
      cross: width * absC + height * absS,
    };
    this.cache = null;
    return this.geometry;
  }

  prepare(args) {
    const {
      width,
      height,
      angleDeg,
      scanBands,
      clusterRadius,
      scanAlpha,
      scanPriority,
      shiftScale,
      driftAmt,
      scanGap,
      scanSkew,
      focus,
      roll,
      phX,
      phY,
    } = args;
    const bandAlpha = scanAlpha * scanPriority;
    const geometry = this.resolveGeometry(width, height, angleDeg);
    if (!(bandAlpha > 0) || scanBands <= 0) return { ...geometry, bands: [] };
    this.ensure(scanBands);
    const bSize = Math.max(4, Math.floor(Math.trunc(clusterRadius) * 3));
    const cacheKey = [scanBands, bSize, scanGap, scanSkew, focus, roll, shiftScale, driftAmt, phX, phY, geometry.dim, geometry.cross];
    if (this.cache && cacheKey.every((value, index) => Object.is(value, this.cache.key[index]))) {
      return this.cache.value;
    }

    const dim = geometry.dim;
    const cross = geometry.cross;
    const rollOffset = (phY * roll * 80) % dim;
    const focusDistance = Math.abs(focus - 0.5);
    const gridStep = Math.max(1, bSize + scanGap);
    const shiftRange = cross * shiftScale;
    const noShift = shiftScale === 0 && scanSkew === 0;
    const noFastJitter = driftAmt === 0;
    const bands = [];

    for (let n = 0; n < scanBands; n++) {
      const slowDrift = this.noise(this.slowSeed[n] + phY * 0.25 * driftAmt) * dim;
      const fastJitter = noFastJitter
        ? 0
        : (this.noise(this.fastSeed[n] + phY * 1.8 * driftAmt) - 0.5) * dim * 0.12 * driftAmt;
      const biased = slowDrift * (1 - focusDistance * 1.4)
        + (focus * dim) * focusDistance * 1.4
        + fastJitter;
      const rawPos = ((biased + rollOffset) % dim + dim) % dim;
      const gridPos = scanGap > 0
        ? Math.floor(rawPos / gridStep) * gridStep
        : rawPos;
      const bStart = Math.max(0, Math.floor(gridPos));
      const bEnd = Math.min(dim, bStart + bSize);
      const bLen = bEnd - bStart;
      if (bLen <= 0) continue;
      let shift = 0;
      if (!noShift) {
        const skewOffset = Math.floor(scanSkew * bStart);
        shift = Math.floor(
          p5Map(this.noise(this.shiftSeed[n] + phX * 0.5), 0, 1, -shiftRange, shiftRange),
        ) + skewOffset;
      }
      const srcOff = Math.max(0, shift < 0 ? -shift : 0);
      const dstOff = Math.max(0, shift > 0 ? shift : 0);
      const bCross = cross - Math.abs(shift);
      if (bCross <= 0) continue;
      bands.push([bStart, bLen, srcOff, dstOff, bCross]);
    }
    const value = { ...geometry, bands };
    this.cache = { key: cacheKey, value };
    return value;
  }
}

const widths = [320, 641, 1280, 1920];
const heights = [180, 359, 720, 1080];
const angles = [-180, -90, -44.5, 0, 31.25, 90, 179.5];
const bandCounts = [1, 3, 11, 37];
const radii = [1, 4.9, 17, 63];
const gaps = [0, 1, 23, 200];
const drifts = [0, 0.7, 3];
const shifts = [0, 0.12, 0.5];
const skews = [-1, 0, 0.73];
const focuses = [0, 0.5, 1];

let cases = 0;
let bands = 0;
const workspace = new NewWorkspaceModel();
for (let i = 0; i < 2400; i++) {
  const args = {
    width: widths[i % widths.length],
    height: heights[(i * 3) % heights.length],
    angleDeg: angles[(i * 5) % angles.length],
    scanBands: bandCounts[(i * 7) % bandCounts.length],
    clusterRadius: radii[(i * 11) % radii.length],
    scanAlpha: i % 29 === 0 ? 0 : 0.86,
    scanPriority: i % 17 === 0 ? 0.35 : 1,
    shiftScale: shifts[(i * 13) % shifts.length],
    driftAmt: drifts[(i * 17) % drifts.length],
    scanGap: gaps[(i * 19) % gaps.length],
    scanSkew: skews[(i * 23) % skews.length],
    focus: focuses[(i * 29) % focuses.length],
    roll: [-2, 0, 1.37][(i * 31) % 3],
    phX: i % 41 === 0 ? 0 : i * 0.03125,
    phY: i % 43 === 0 ? 2000 : 2000 + i * 0.027,
  };
  const before = oldBands(args);
  const after = workspace.prepare(args);
  assert(Object.is(before.angleRad, after.angleRad), `angle mismatch in case ${i}`);
  if (before.bands.length || after.bands.length) {
    assert(Object.is(before.dim, after.dim), `dim mismatch in case ${i}`);
    assert(Object.is(before.cross, after.cross), `cross mismatch in case ${i}`);
  }
  assert(before.bands.length === after.bands.length, `band count mismatch in case ${i}`);
  for (let band = 0; band < before.bands.length; band++) {
    for (let field = 0; field < before.bands[band].length; field++) {
      assert(
        Object.is(before.bands[band][field], after.bands[band][field]),
        `band mismatch in case ${i}, band ${band}, field ${field}: ${before.bands[band][field]} !== ${after.bands[band][field]}`,
      );
    }
  }
  cases++;
  bands += before.bands.length;
}

const staticArgs = {
  width: 1280,
  height: 720,
  angleDeg: 0,
  scanBands: 37,
  clusterRadius: 17,
  scanAlpha: 0.86,
  scanPriority: 1,
  shiftScale: 0.12,
  driftAmt: 0,
  scanGap: 0,
  scanSkew: 0,
  focus: 0.5,
  roll: 0,
  phX: 3,
  phY: 2000,
};
const cacheWorkspace = new NewWorkspaceModel();
const first = cacheWorkspace.prepare(staticArgs);
const callsAfterFirst = cacheWorkspace.noiseCalls;
const second = cacheWorkspace.prepare(staticArgs);
assert(first === second, 'identical scanline state did not reuse prepared band result');
assert(cacheWorkspace.noiseCalls === callsAfterFirst, 'identical scanline state repeated noise work');
cacheWorkspace.prepare({ ...staticArgs, phY: staticArgs.phY + 0.009 });
assert(cacheWorkspace.noiseCalls > callsAfterFirst, 'phase change did not invalidate prepared bands');

assert(effectsSource.includes('class ScanlineBandWorkspace'), 'ScanlineBandWorkspace missing');
assert(effectsSource.includes('const _scanlineBands = new ScanlineBandWorkspace();'), 'scanline workspace singleton missing');
assert(effectsSource.includes('if (!(bandAlpha > 0)) return;'), 'invisible scanline early exit missing');
assert(effectsSource.includes('ctx.globalAlpha = bandAlpha;'), 'single scanline alpha assignment missing');
assert(effectsSource.includes('this.cachePhaseX === phX'), 'scanline prepared-state cache marker missing');
assert(effectsSource.includes('window.invalidateScanlineCache = () => _scanlineBands.invalidate();'), 'scanline seed-invalidation hook missing');
assert(effectsSource.includes('slowSeed[n] = n * 3.7;'), 'cached slow-noise seeds missing');
assert(effectsSource.includes('fastSeed[n] = n * 11.3;'), 'cached fast-noise seeds missing');
assert(effectsSource.includes('shiftSeed[n] = n * 2.3;'), 'cached shift-noise seeds missing');
assert(canvasSource.includes('window.invalidateScanlineCache?.();'), 'noise-seed cache invalidation call missing');
assert(packageSource.scripts?.['validate:pass10'] === 'node scripts/validate-pass10.mjs', 'validate:pass10 package script missing');

console.log(`PASS 10 validation passed: ${cases} scanline cases, ${bands} exact prepared-band comparisons.`);
console.log(`Static-state cache reused ${staticArgs.scanBands} prepared bands without additional noise calls.`);
