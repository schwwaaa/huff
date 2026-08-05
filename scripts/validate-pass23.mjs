import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const expected = {
  'src/canvas.js': '3fdb5fb540be2d42173ddfd1aa355db930bac8e2cc758930e6eeddca05477798',
  'src/effects.js': '2b352fa279c728ba292485fe22a0e580c6a3f36d669bd9741f79d5af4454dd44',
  'src/index.html': 'a8648e98ab3f0dae2883adadba843754889e70a22efd2c9e1e3b91933f5116dc',
  'package.json': 'cf608e2bcdf638c613e9480f2df01d46dcadde138be4696f7ae7943a47640b2d',
};

function sha256File(rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const [rel, digest] of Object.entries(expected)) {
  const actual = sha256File(rel);
  assert(actual === digest, `${rel} differs from the user-supplied Pass 22 baseline: ${actual}`);
}

const effects = fs.readFileSync(path.join(root, 'src/effects.js'), 'utf8');
const canvas = fs.readFileSync(path.join(root, 'src/canvas.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');

assert(effects.includes('function applyFlowWarp(src, dst, strength = 6, scale = 80, pulse = 0, implode = 0, speed = 1, turb = 0, swirl = 0, spread = 1)'), 'Pass 22 Flow signature missing');
assert(canvas.includes('applyFlowWarp(gBuf, gScratch, Math.trunc(s.flowStrength),'), 'Pass 22 Flow dispatch missing');
assert(canvas.includes('[gBuf, gScratch] = [gScratch, gBuf];'), 'Pass 22 ping-pong swap missing');
assert(!effects.includes('SortMosh') && !canvas.includes('SortMosh') && !index.includes('Sort-Mosh'), 'Rejected Sort-Mosh branch detected');
assert(!index.includes('flowMelt') && !index.includes('flowLag') && !index.includes('flowCohesion'), 'Rejected Flow controls detected');

const orderMarkers = [
  'if (activity.scanlines) applyScanlines',
  'if (activity.feedback) {',
  'if (activity.flow) {',
  'if (activity.symmetry) {',
  'if (activity.solarize) {',
];
let last = -1;
for (const marker of orderMarkers) {
  const at = canvas.indexOf(marker);
  assert(at > last, `pipeline marker missing or out of order: ${marker}`);
  last = at;
}

console.log('PASS 23 validation passed.');
console.log('The authoritative Pass 22 runtime core is byte-for-byte unchanged.');
console.log('Flow remains the exact Pass 22 implementation; rejected Flow branches are absent.');
console.log('Pipeline stage order markers remain in the Pass 22 order.');
