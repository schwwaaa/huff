import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const canvasSource = fs.readFileSync(path.join(root, 'src', 'canvas.js'), 'utf8');
const effectsSource = fs.readFileSync(path.join(root, 'src', 'effects.js'), 'utf8');
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

function p5Map(n, start1, stop1, start2, stop2) {
  return (n - start1) / (stop1 - start1) * (stop2 - start2) + start2;
}

// Source boundaries: no p5 map() calls remain in the active Canvas2D hot paths.
for (const token of [
  'map(1 - pers, 0, 1, 1, 20)',
  'map(noise(this.shiftSeed[n] + phX * 0.5), 0, 1, -shiftRange, shiftRange)',
  'map(noise(nPhaseX), 0, 1, -1, 1)',
  'map(noise(nPhaseY), 0, 1, -1, 1)',
  'map(noise(nPhaseX * 0.5), 0, 1, -Math.PI / 6, Math.PI / 6)',
  'map(noise(nPhaseX + i * 0.013), 0, 1, -block * 2, block * 2)',
  'map(noise(nPhaseY + i * 0.017), 0, 1, -block * 2, block * 2)',
]) {
  check(!canvasSource.includes(token) && !effectsSource.includes(token), `legacy p5 map hot-path call remains: ${token}`);
}
for (const token of [
  'const shiftSpan = shiftRange - (-shiftRange);',
  'dxUnit = noise(nPhaseX) * (1 - (-1)) + (-1);',
  'const jitterSpan = jitterMax - jitterMin;',
  'const ox = Math.floor((oxNoise * jitterSpan + jitterMin) * jitter);',
  '(((1 - pers) * (20 - 1)) + 1) / 255',
]) check(effectsSource.includes(token) || canvasSource.includes(token), `missing direct arithmetic token: ${token}`);

// Profiler-only draw-count telemetry for the remaining Canvas2D ceiling review.
for (const token of [
  'window.__huffScanlineTelemetry',
  'function _scanlineProfileFrame(bandCount)',
  '_scanlineProfileFrame(bandCount);',
  'window.__huffFlowTelemetry',
  'function _flowProfileFrame(tileCount, gridRebuilt)',
  '_flowProfileFrame(_flowGrid.count, flowGridRebuilt);',
]) check(effectsSource.includes(token), `missing effect telemetry token: ${token}`);
for (const token of [
  'function scanlineTelemetrySnapshot()',
  'function flowTelemetrySnapshot()',
  "'scan bands '",
  "'scan draws '",
  "'flow tiles '",
  "'flow draws '",
  "'flow grid  '",
]) check(canvasSource.includes(token), `missing profiler display token: ${token}`);
check(packageSource.scripts?.['validate:pass20'] === 'node scripts/validate-pass20.mjs', 'package script validate:pass20 missing');

// Deterministic floating-point equivalence. These compare the exact operation
// order of p5 map() against the inlined expressions used by Pass 20.
let state = 0x7f4a7c15;
function randU32() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}
function unit() { return randU32() / 0xffffffff; }

const angleMin = -Math.PI / 6;
const angleMax =  Math.PI / 6;
for (let i = 0; i < 500_000; i++) {
  const n = unit();
  const pers = unit() * 1.5 - 0.25;
  const shiftRange = (unit() * 2 - 1) * 10000;
  const block = 1 + (randU32() % 512);

  exact(
    ((1 - pers) * (20 - 1)) + 1,
    p5Map(1 - pers, 0, 1, 1, 20),
    'persistence map equivalence',
  );
  exact(
    n * (shiftRange - (-shiftRange)) + (-shiftRange),
    p5Map(n, 0, 1, -shiftRange, shiftRange),
    'scanline shift map equivalence',
  );
  exact(
    n * (1 - (-1)) + (-1),
    p5Map(n, 0, 1, -1, 1),
    'smear unit map equivalence',
  );
  exact(
    n * (angleMax - angleMin) + angleMin,
    p5Map(n, 0, 1, angleMin, angleMax),
    'smear angle map equivalence',
  );

  const jitterMin = -block * 2;
  const jitterMax =  block * 2;
  exact(
    n * (jitterMax - jitterMin) + jitterMin,
    p5Map(n, 0, 1, jitterMin, jitterMax),
    'glitch jitter map equivalence',
  );
}

// Telemetry must be gated so ordinary playback does not pay counter-update cost.
for (const token of [
  'if (window.__huffProfilerActive !== true) return;',
]) {
  check((effectsSource.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 3,
    'Glitch, Scanline, and Flow telemetry must remain profiler-gated');
}

console.log(`Pass 20 validation passed: ${checks.toLocaleString()} checks, ${comparisons.toLocaleString()} exact arithmetic comparisons`);
