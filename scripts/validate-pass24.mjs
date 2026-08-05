import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  PIPELINE_RESOURCES,
  PIPELINE_ZONES,
  STAGE_CONTRACTS,
  PASS22_ROUTE_SKELETON,
  FRONT_STAGE_PRIORITY_CONTRACT,
  validateStageContractRegistry,
} from '../pipeline/stage-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256File(rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
}

function verifyManifest(relDir, manifestRel) {
  const base = path.join(root, relDir);
  const lines = fs.readFileSync(path.join(root, manifestRel), 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const expectedPaths = new Set();

  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert(match, `invalid baseline manifest line: ${line}`);
    const [, expectedDigest, rel] = match;
    expectedPaths.add(rel);
    const full = path.join(base, ...rel.split('/'));
    assert(fs.existsSync(full) || fs.lstatSync(path.dirname(full)).isDirectory(), `${relDir}/${rel} missing`);
    const stat = fs.lstatSync(full);
    const bytes = stat.isSymbolicLink()
      ? Buffer.from(`SYMLINK:${fs.readlinkSync(full)}`)
      : fs.readFileSync(full);
    const actualDigest = crypto.createHash('sha256').update(bytes).digest('hex');
    assert(actualDigest === expectedDigest, `${relDir}/${rel} differs from Pass 22`);
  }

  const actualPaths = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() || entry.isSymbolicLink()) {
        actualPaths.push(path.relative(base, full).split(path.sep).join('/'));
      }
    }
  };
  walk(base);
  for (const rel of actualPaths) {
    assert(expectedPaths.has(rel), `${relDir}/${rel} is not in the Pass 22 baseline manifest`);
  }
  assert(actualPaths.length === expectedPaths.size, `${relDir} baseline file count changed`);
}

const expectedFiles = {
  'src/canvas.js': '3fdb5fb540be2d42173ddfd1aa355db930bac8e2cc758930e6eeddca05477798',
  'src/effects.js': '2b352fa279c728ba292485fe22a0e580c6a3f36d669bd9741f79d5af4454dd44',
  'src/index.html': 'a8648e98ab3f0dae2883adadba843754889e70a22efd2c9e1e3b91933f5116dc',
  'package.json': 'cf608e2bcdf638c613e9480f2df01d46dcadde138be4696f7ae7943a47640b2d',
};

for (const [rel, digest] of Object.entries(expectedFiles)) {
  assert(sha256File(rel) === digest, `${rel} differs from the authoritative Pass 22 baseline`);
}
verifyManifest('src', 'baseline/pass22-src.sha256');
verifyManifest('src-tauri', 'baseline/pass22-src-tauri.sha256');

const registryResult = validateStageContractRegistry();
assert(registryResult.valid, `stage contract registry invalid: ${registryResult.errors.join('; ')}`);
assert(registryResult.contractCount === 11, `expected 11 contracts, got ${registryResult.contractCount}`);
assert(registryResult.routeStepCount === 12, `expected 12 route steps, got ${registryResult.routeStepCount}`);
assert(Object.isFrozen(PIPELINE_RESOURCES), 'resource registry must be frozen');
assert(Object.isFrozen(PIPELINE_ZONES), 'zone registry must be frozen');
assert(Object.isFrozen(STAGE_CONTRACTS), 'stage registry must be frozen');
assert(Object.isFrozen(PASS22_ROUTE_SKELETON), 'route skeleton must be frozen');
for (const contract of STAGE_CONTRACTS) {
  assert(Object.isFrozen(contract), `${contract.id} contract must be frozen`);
  assert(Object.isFrozen(contract.legalZones), `${contract.id} legalZones must be frozen`);
  assert(Object.isFrozen(contract.reads), `${contract.id} reads must be frozen`);
  assert(Object.isFrozen(contract.writes), `${contract.id} writes must be frozen`);
  assert(Object.isFrozen(contract.scratch), `${contract.id} scratch must be frozen`);
}

const expectedZoneOrder = [
  'source-sync',
  'persistent-decay',
  'front-overlays',
  'global-mix-before',
  'persistent-transform',
  'global-mix-after',
  'primary-transform',
  'global-mix-afterflow',
  'secondary-transform',
  'color-finish',
  'global-mix-final',
  'presentation',
];
assert(
  JSON.stringify(PASS22_ROUTE_SKELETON.map((step) => step.zone)) === JSON.stringify(expectedZoneOrder),
  'Pass 22 route skeleton zone order changed',
);

const byId = new Map(STAGE_CONTRACTS.map((contract) => [contract.id, contract]));
const flow = byId.get('flow');
assert(flow?.stageClass === 'ping-pong-transform', 'Flow contract class changed');
assert(JSON.stringify(flow.legalZones) === JSON.stringify(['primary-transform']), 'Flow legal zone changed');
assert(JSON.stringify(flow.reads) === JSON.stringify(['gBuf', 'FrameRing']), 'Flow reads changed');
assert(JSON.stringify(flow.writes) === JSON.stringify(['gScratch']), 'Flow writes changed');
assert(flow.swapsBuffers === true, 'Flow must retain the Pass 22 ping-pong swap');
assert(flow.frozen === true, 'Flow must remain frozen');
assert(flow.routingPresettable === false, 'Flow routing must not become presettable in Pass 24');
assert(flow.liveSafeRouting === false, 'Flow routing must not be marked live-safe in Pass 24');

const feedback = byId.get('feedback');
assert(feedback?.stageClass === 'snapshot-transform', 'Feedback contract class changed');
assert(feedback.clearsDestination === true, 'Feedback destination-clear contract missing');
assert(feedback.swapsBuffers === false, 'Feedback must not swap gBuf/gScratch');

const globalMix = byId.get('global-mix');
assert(JSON.stringify(globalMix?.legalZones) === JSON.stringify([
  'global-mix-before',
  'global-mix-after',
  'global-mix-afterflow',
  'global-mix-final',
]), 'Global Mix legal positions changed');

assert(FRONT_STAGE_PRIORITY_CONTRACT.stateKey === 'layerPriority', 'front priority state key changed');
assert(FRONT_STAGE_PRIORITY_CONTRACT.pulseSpeedKey === 'layerPulseSpeed', 'front pulse key changed');
assert(JSON.stringify(FRONT_STAGE_PRIORITY_CONTRACT.groups['glitch-luma-group']) === JSON.stringify(['glitch', 'pipeline-luma-key']), 'glitch/luma group changed');
assert(JSON.stringify(FRONT_STAGE_PRIORITY_CONTRACT.groups['scanline-group']) === JSON.stringify(['scanlines']), 'scanline group changed');
assert(JSON.stringify(FRONT_STAGE_PRIORITY_CONTRACT.modes.scan) === JSON.stringify(['glitch-luma-group', 'scanline-group']), 'scan priority order changed');
assert(JSON.stringify(FRONT_STAGE_PRIORITY_CONTRACT.modes.glitch) === JSON.stringify(['scanline-group', 'glitch-luma-group']), 'glitch priority order changed');

const canvas = fs.readFileSync(path.join(root, 'src/canvas.js'), 'utf8');
const effects = fs.readFileSync(path.join(root, 'src/effects.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');

const routeMarkers = [
  '_syncGCur();',
  "ctx.globalCompositeOperation = 'destination-out';",
  'if (glitchOnTop) {',
  "if (activity.globalMix && gmPos === 'before') _emitGlobalMix(s);",
  'if (activity.feedback) {',
  "if (activity.globalMix && gmPos === 'after') _emitGlobalMix(s);",
  'if (activity.flow) {',
  "if (activity.globalMix && gmPos === 'afterflow') _emitGlobalMix(s);",
  'if (activity.symmetry) {',
  'if (activity.solarize) {',
  "if (activity.globalMix && gmPos === 'final') _emitGlobalMix(s);",
  '_paintMainBackground(bg);',
];
let last = -1;
for (const marker of routeMarkers) {
  const at = canvas.indexOf(marker, last + 1);
  assert(at > last, `Pass 22 route marker missing or out of order: ${marker}`);
  last = at;
}

assert(canvas.includes('applyFlowWarp(gBuf, gScratch, Math.trunc(s.flowStrength),'), 'Pass 22 Flow dispatch missing');
assert(canvas.includes('[gBuf, gScratch] = [gScratch, gBuf];'), 'Pass 22 ping-pong swap missing');
assert(effects.includes('function applyFlowWarp(src, dst, strength = 6, scale = 80, pulse = 0, implode = 0, speed = 1, turb = 0, swirl = 0, spread = 1)'), 'Pass 22 Flow function missing');
assert(!effects.includes('SortMosh') && !canvas.includes('SortMosh') && !index.includes('Sort-Mosh'), 'rejected Sort-Mosh branch detected');
assert(!index.includes('flowMelt') && !index.includes('flowLag') && !index.includes('flowCohesion'), 'rejected Flow controls detected');

for (const rel of ['src/canvas.js', 'src/canvas.html', 'src/index.html', 'src/effects.js']) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  assert(!text.includes('stage-contracts.mjs'), `${rel} loads the Pass 24 registry; Pass 24 must remain runtime-inert`);
}

console.log('PASS 24 validation passed.');
console.log('11 immutable stage contracts and the 12-zone Pass 22 route skeleton are valid.');
console.log('The complete src and src-tauri trees remain byte-for-byte identical to the authoritative Pass 22 baseline.');
console.log('The registry is not loaded by the runtime, and Flow remains the exact Pass 22 implementation.');
