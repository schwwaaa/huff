import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const effectsSource = fs.readFileSync(path.join(root, 'src', 'effects.js'), 'utf8');
const canvasSource = fs.readFileSync(path.join(root, 'src', 'canvas.js'), 'utf8');
const packageSource = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

let checks = 0;
let comparisons = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}
function exact(actual, expected, message) {
  assert.ok(Object.is(actual, expected), `${message}: ${actual} !== ${expected}`);
  comparisons++;
}

for (const token of [
  'class FlowFieldWorkspace',
  'configureFrequency(grid, frequency)',
  'configureSwirl(grid, swirl)',
  'this.maxSourceX = new Int32Array',
  'this.maxSourceY = new Int32Array',
  '_flowField.configureFrequency(_flowGrid, freq)',
  '_flowField.configureSwirl(_flowGrid, swirl)',
  'const noiseXs = _flowField.noiseX;',
  'const turbulenceXs = _flowField.turbulenceX;',
  'const swirlCosines = _flowField.swirlCos;',
  'const maxSourceXs = _flowGrid.maxSourceX;',
]) check(effectsSource.includes(token), `missing Pass 21 Flow token: ${token}`);

for (const legacy of [
  'noise(nx * freq + t, ny * freq)',
  'noise(nx * freq * 4 + t * 1.3 + 100, ny * freq * 4 + t * 0.9)',
  'const ang = _flowGrid.radialAngle[i] * swirl;',
  'Math.min(w - tileW, Math.floor(x + dx2))',
]) check(!effectsSource.includes(legacy), `legacy per-tile Flow preparation remains: ${legacy}`);

for (const token of [
  'frequencyRebuilds',
  'frequencyReuses',
  'swirlRebuilds',
  'swirlReuses',
  "'flow freq  '",
  "'flow swirl '",
]) check(effectsSource.includes(token) || canvasSource.includes(token), `missing Flow cache telemetry: ${token}`);

check(packageSource.scripts?.['validate:pass21'] === 'node scripts/validate-pass21.mjs', 'package script validate:pass21 missing');

function buildGrid(width, height, cell, generation = 1) {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const count = cols * rows;
  const grid = {
    width, height, cell, count, generation,
    x: new Int32Array(count),
    y: new Int32Array(count),
    tileW: new Int32Array(count),
    tileH: new Int32Array(count),
    maxSourceX: new Int32Array(count),
    maxSourceY: new Int32Array(count),
    nx: new Float64Array(count),
    ny: new Float64Array(count),
    inwardX: new Float64Array(count),
    inwardY: new Float64Array(count),
    radialAngle: new Float64Array(count),
  };
  const cx = width * 0.5;
  const cy = height * 0.5;
  let i = 0;
  for (let row = 0; row < rows; row++) {
    const y = row * cell;
    const py = y + 0.5 * cell;
    for (let col = 0; col < cols; col++, i++) {
      const x = col * cell;
      const px = x + 0.5 * cell;
      const vx = cx - px;
      const vy = cy - py;
      const length = Math.hypot(vx, vy) || 1;
      grid.x[i] = x;
      grid.y[i] = y;
      grid.tileW[i] = Math.min(cell, width - x);
      grid.tileH[i] = Math.min(cell, height - y);
      grid.maxSourceX[i] = width - grid.tileW[i];
      grid.maxSourceY[i] = height - grid.tileH[i];
      grid.nx[i] = (x + 0.5 * cell) / width * 2.0;
      grid.ny[i] = (y + 0.5 * cell) / height * 2.0;
      grid.inwardX[i] = vx / length;
      grid.inwardY[i] = vy / length;
      grid.radialAngle[i] = Math.atan2(py - cy, px - cx);
    }
  }
  return grid;
}

class FieldCache {
  constructor() {
    this.frequencyGeneration = -1;
    this.frequency = NaN;
    this.swirlGeneration = -1;
    this.swirl = NaN;
    this.noiseX = new Float64Array(0);
    this.noiseY = new Float64Array(0);
    this.turbulenceX = new Float64Array(0);
    this.turbulenceY = new Float64Array(0);
    this.swirlCos = new Float64Array(0);
    this.swirlSin = new Float64Array(0);
  }
  ensure(count) {
    if (this.noiseX.length >= count) return;
    this.noiseX = new Float64Array(count);
    this.noiseY = new Float64Array(count);
    this.turbulenceX = new Float64Array(count);
    this.turbulenceY = new Float64Array(count);
    this.swirlCos = new Float64Array(count);
    this.swirlSin = new Float64Array(count);
    this.frequencyGeneration = -1;
    this.swirlGeneration = -1;
  }
  configureFrequency(grid, frequency) {
    this.ensure(grid.count);
    if (this.frequencyGeneration === grid.generation && this.frequency === frequency) return false;
    this.frequencyGeneration = grid.generation;
    this.frequency = frequency;
    for (let i = 0; i < grid.count; i++) {
      const fx = grid.nx[i] * frequency;
      const fy = grid.ny[i] * frequency;
      this.noiseX[i] = fx;
      this.noiseY[i] = fy;
      this.turbulenceX[i] = fx * 4;
      this.turbulenceY[i] = fy * 4;
    }
    return true;
  }
  configureSwirl(grid, swirl) {
    this.ensure(grid.count);
    if (this.swirlGeneration === grid.generation && this.swirl === swirl) return false;
    this.swirlGeneration = grid.generation;
    this.swirl = swirl;
    if (swirl === 0) return true;
    for (let i = 0; i < grid.count; i++) {
      const angle = grid.radialAngle[i] * swirl;
      this.swirlCos[i] = Math.cos(angle);
      this.swirlSin[i] = Math.sin(angle);
    }
    return true;
  }
}

function deterministicNoise(x, y) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function oldTile(grid, i, params) {
  const { frequency, t, turb, swirl, implode, strength } = params;
  const turbulenceMix = turb * 0.5;
  let angle = deterministicNoise(grid.nx[i] * frequency + t, grid.ny[i] * frequency) * Math.PI * 4;
  if (turb > 0) {
    const angle2 = deterministicNoise(
      grid.nx[i] * frequency * 4 + t * 1.3 + 100,
      grid.ny[i] * frequency * 4 + t * 0.9,
    ) * Math.PI * 4;
    angle = angle * (1 - turbulenceMix) + angle2 * turbulenceMix;
  }
  let dx = Math.cos(angle) * strength;
  let dy = Math.sin(angle) * strength;
  if (implode !== 0) {
    const implodeScale = strength * implode;
    dx += grid.inwardX[i] * implodeScale;
    dy += grid.inwardY[i] * implodeScale;
  }
  if (swirl !== 0) {
    const radial = grid.radialAngle[i] * swirl;
    const cs = Math.cos(radial);
    const sn = Math.sin(radial);
    const rx = dx * cs - dy * sn;
    const ry = dx * sn + dy * cs;
    dx = rx;
    dy = ry;
  }
  dx = Math.fround(dx);
  dy = Math.fround(dy);
  const tileW = grid.tileW[i];
  const tileH = grid.tileH[i];
  return [
    Math.max(0, Math.min(grid.width - tileW, Math.floor(grid.x[i] + dx))),
    Math.max(0, Math.min(grid.height - tileH, Math.floor(grid.y[i] + dy))),
    tileW, tileH, grid.x[i], grid.y[i], tileW, tileH,
  ];
}

function newTile(grid, cache, i, params) {
  const { t, turb, swirl, implode, strength } = params;
  const turbulenceMix = turb * 0.5;
  const turbulenceBaseMix = 1 - turbulenceMix;
  const turbulenceTimeX = t * 1.3;
  const turbulenceTimeY = t * 0.9;
  let angle = deterministicNoise(cache.noiseX[i] + t, cache.noiseY[i]) * Math.PI * 4;
  if (turb > 0) {
    const angle2 = deterministicNoise(
      cache.turbulenceX[i] + turbulenceTimeX + 100,
      cache.turbulenceY[i] + turbulenceTimeY,
    ) * Math.PI * 4;
    angle = angle * turbulenceBaseMix + angle2 * turbulenceMix;
  }
  let dx = Math.cos(angle) * strength;
  let dy = Math.sin(angle) * strength;
  if (implode !== 0) {
    const implodeScale = strength * implode;
    dx += grid.inwardX[i] * implodeScale;
    dy += grid.inwardY[i] * implodeScale;
  }
  if (swirl !== 0) {
    const cs = cache.swirlCos[i];
    const sn = cache.swirlSin[i];
    const rx = dx * cs - dy * sn;
    const ry = dx * sn + dy * cs;
    dx = rx;
    dy = ry;
  }
  dx = Math.fround(dx);
  dy = Math.fround(dy);
  const tileW = grid.tileW[i];
  const tileH = grid.tileH[i];
  return [
    Math.max(0, Math.min(grid.maxSourceX[i], Math.floor(grid.x[i] + dx))),
    Math.max(0, Math.min(grid.maxSourceY[i], Math.floor(grid.y[i] + dy))),
    tileW, tileH, grid.x[i], grid.y[i], tileW, tileH,
  ];
}

const dimensions = [
  [320, 180], [640, 360], [960, 540], [1280, 720], [1920, 1080],
];
const cells = [17, 32, 63, 96, 160];
const spreads = [0, 0.5, 1, 2.75, 8];
const swirls = [-2, -0.35, 0, 0.4, 1.75];

// Explicit cache-key behavior, including the clamped SPREAD values 0 and 0.05
// that intentionally produce the same frequency.
{
  const grid = buildGrid(640, 360, 32, 1);
  const local = new FieldCache();
  const frequencyA = 0.9 * Math.max(0.05, 0);
  const frequencyEquivalent = 0.9 * Math.max(0.05, 0.05);
  const frequencyB = 0.9 * Math.max(0.05, 1);
  check(local.configureFrequency(grid, frequencyA) === true, 'initial frequency cache build');
  check(local.configureFrequency(grid, frequencyA) === false, 'unchanged frequency cache reuse');
  check(local.configureFrequency(grid, frequencyEquivalent) === false, 'equivalent clamped frequency cache reuse');
  check(local.configureFrequency(grid, frequencyB) === true, 'changed frequency cache rebuild');
  check(local.configureSwirl(grid, 0) === true, 'initial zero-swirl cache key');
  check(local.configureSwirl(grid, 0) === false, 'unchanged zero-swirl cache reuse');
  check(local.configureSwirl(grid, 0.75) === true, 'changed swirl cache rebuild');
  check(local.configureSwirl(grid, 0.75) === false, 'unchanged swirl cache reuse');
  const resizedGrid = buildGrid(640, 360, 32, 2);
  check(local.configureFrequency(resizedGrid, frequencyB) === true, 'grid generation invalidates frequency cache');
  check(local.configureSwirl(resizedGrid, 0.75) === true, 'grid generation invalidates swirl cache');
}

// Exact cached-field construction across representative sizes and controls.
let generation = 10;
const cache = new FieldCache();
const grids = [];
for (const [width, height] of dimensions) {
  for (const cell of cells) grids.push(buildGrid(width, height, cell, ++generation));
}
for (const grid of grids) {
  for (const spread of spreads) {
    const frequency = 0.9 * Math.max(0.05, spread);
    cache.configureFrequency(grid, frequency);
    for (let i = 0; i < grid.count; i++) {
      exact(cache.noiseX[i], grid.nx[i] * frequency, 'base noise X');
      exact(cache.noiseY[i], grid.ny[i] * frequency, 'base noise Y');
      exact(cache.turbulenceX[i], grid.nx[i] * frequency * 4, 'turbulence X');
      exact(cache.turbulenceY[i], grid.ny[i] * frequency * 4, 'turbulence Y');
      exact(grid.maxSourceX[i], grid.width - grid.tileW[i], 'maximum source X');
      exact(grid.maxSourceY[i], grid.height - grid.tileH[i], 'maximum source Y');
    }
    for (const swirl of swirls) {
      cache.configureSwirl(grid, swirl);
      if (swirl === 0) continue;
      for (let i = 0; i < grid.count; i++) {
        exact(cache.swirlCos[i], Math.cos(grid.radialAngle[i] * swirl), 'swirl cosine');
        exact(cache.swirlSin[i], Math.sin(grid.radialAngle[i] * swirl), 'swirl sine');
      }
    }
  }
}

// Deterministic randomized full-draw comparison. Sample a fixed spread of tiles
// from each selected grid so the validator stays fast while covering millions of
// exact source/destination rectangle components.
let randomState = 0x21f10a5d;
function randU32() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return randomState >>> 0;
}
function randUnit() { return randU32() / 0xffffffff; }
function pick(values) { return values[randU32() % values.length]; }

const turbs = [0, 0.2, 1];
const implodes = [-1, 0, 0.65];
const strengths = [0, 1, 6, 31];
let cases = 0;
for (let caseIndex = 0; caseIndex < 5000; caseIndex++) {
  const grid = pick(grids);
  const spread = pick(spreads);
  const frequency = 0.9 * Math.max(0.05, spread);
  const swirl = pick(swirls);
  const params = {
    frequency,
    t: randUnit() * 8,
    turb: pick(turbs),
    swirl,
    implode: pick(implodes),
    strength: pick(strengths),
  };
  cache.configureFrequency(grid, frequency);
  cache.configureSwirl(grid, swirl);
  const sampleCount = Math.min(64, grid.count);
  for (let sample = 0; sample < sampleCount; sample++) {
    const i = sampleCount === grid.count
      ? sample
      : Math.floor(sample * (grid.count - 1) / Math.max(1, sampleCount - 1));
    exact(cache.noiseX[i] + params.t, grid.nx[i] * frequency + params.t, 'primary noise X argument');
    exact(cache.noiseY[i], grid.ny[i] * frequency, 'primary noise Y argument');
    exact(cache.turbulenceX[i] + params.t * 1.3 + 100, grid.nx[i] * frequency * 4 + params.t * 1.3 + 100, 'turbulence noise X argument');
    exact(cache.turbulenceY[i] + params.t * 0.9, grid.ny[i] * frequency * 4 + params.t * 0.9, 'turbulence noise Y argument');
    const oldDraw = oldTile(grid, i, params);
    const newDraw = newTile(grid, cache, i, params);
    for (let j = 0; j < oldDraw.length; j++) {
      exact(newDraw[j], oldDraw[j], `draw field case ${caseIndex} tile ${i} component ${j}`);
    }
  }
  cases++;
}

console.log(`Pass 21 validation passed: ${checks.toLocaleString()} checks, ${cases.toLocaleString()} Flow cases, ${comparisons.toLocaleString()} exact field/draw comparisons`);
