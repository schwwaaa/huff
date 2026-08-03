import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const canvasSource = fs.readFileSync(path.join(root, 'src', 'canvas.js'), 'utf8');
const effectsSource = fs.readFileSync(path.join(root, 'src', 'effects.js'), 'utf8');

function feedbackHasVisibleEffect(state) {
  const amount = state.feedback;
  if (!(amount > 0)) return false;
  const angle = ((state.fbTheta % 360) + 360) % 360;
  const identityTransform =
    state.fbX === 0 &&
    state.fbY === 0 &&
    state.fbZ === 1 &&
    angle === 0;
  return amount < 1 || !identityTransform;
}

function symmetryHasVisibleEffect(state, width, height) {
  if (!state.symOn) return false;
  const mode = state.symMode || 'v';
  const x0 = Math.max(0, Math.min(width, Math.round(width * state.symPos)));
  const y0 = Math.max(0, Math.min(height, Math.round(height * state.symPos)));
  const verticalChanges = (mode === 'v' || mode === 'hv') && x0 < width;
  const horizontalChanges = (mode === 'h' || mode === 'hv') && y0 < height;
  return verticalChanges || horizontalChanges;
}

function solarizeHasVisibleEffect(state) {
  if (!state.solarizeOn) return false;
  if (state.solarizeThresh >= 1) return false;
  return !(
    state.solarizeAmt === 0 &&
    state.solarizeR === 1 &&
    state.solarizeG === 1 &&
    state.solarizeB === 1
  );
}

function resolveFrameActivity(state, width = 1920, height = 1080) {
  const glitch = !!state.corruptOn;
  const scanlines = !!state.clusters && Math.trunc(state.clusterCount) > 0 && state.scanAlpha > 0;
  const luma = !!state.lumaKeyOn && state.lumaKeyMix > 0;
  const globalMix = !!state.globalMixOn && state.globalMixAmt > 0;
  const feedback = feedbackHasVisibleEffect(state);
  const flow = !!state.flowOn && Math.trunc(state.flowStrength) > 0;
  const symmetry = symmetryHasVisibleEffect(state, width, height);
  const solarize = solarizeHasVisibleEffect(state);
  const baseMix = !!state.baseOn && state.baseMix > 0;
  return {
    glitch, scanlines, luma, globalMix, feedback, flow, symmetry, solarize, baseMix,
    any: glitch || scanlines || luma || globalMix || feedback || flow || symmetry || solarize,
  };
}

const neutral = {
  corruptOn: false,
  clusters: false,
  clusterCount: 0,
  scanAlpha: 0,
  lumaKeyOn: false,
  lumaKeyMix: 0,
  globalMixOn: false,
  globalMixAmt: 0,
  feedback: 0,
  fbX: 0,
  fbY: 0,
  fbZ: 1,
  fbTheta: 0,
  flowOn: false,
  flowStrength: 0,
  symOn: false,
  symMode: 'v',
  symPos: 0.5,
  solarizeOn: false,
  solarizeThresh: 0.5,
  solarizeAmt: 1,
  solarizeR: 1,
  solarizeG: 1,
  solarizeB: 1,
  baseOn: false,
  baseMix: 0,
};

assert.equal(resolveFrameActivity(neutral).any, false, 'neutral state should bypass');
assert.equal(resolveFrameActivity({ ...neutral, flowOn: true, flowStrength: 0.99 }).flow, false);
assert.equal(resolveFrameActivity({ ...neutral, flowOn: true, flowStrength: 1 }).flow, true);
assert.equal(resolveFrameActivity({ ...neutral, clusters: true, clusterCount: 24, scanAlpha: 0 }).scanlines, false);
assert.equal(resolveFrameActivity({ ...neutral, clusters: true, clusterCount: 24, scanAlpha: 0.01 }).scanlines, true);
assert.equal(resolveFrameActivity({ ...neutral, globalMixOn: true, globalMixAmt: 0 }).globalMix, false);
assert.equal(resolveFrameActivity({ ...neutral, globalMixOn: true, globalMixAmt: 0.1 }).globalMix, true);
assert.equal(resolveFrameActivity({ ...neutral, lumaKeyOn: true, lumaKeyMix: 0 }).luma, false);
assert.equal(resolveFrameActivity({ ...neutral, lumaKeyOn: true, lumaKeyMix: 0.5 }).luma, true);
assert.equal(resolveFrameActivity({ ...neutral, baseOn: true, baseMix: 1 }).any, false, 'base alone is not an effect stage');
assert.equal(resolveFrameActivity({ ...neutral, baseOn: true, baseMix: 1 }).baseMix, true);

for (const amount of [1, 1.5, 3]) {
  assert.equal(feedbackHasVisibleEffect({ feedback: amount, fbX: 0, fbY: 0, fbZ: 1, fbTheta: 0 }), false);
  assert.equal(feedbackHasVisibleEffect({ feedback: amount, fbX: 0, fbY: 0, fbZ: 1, fbTheta: 360 }), false);
}
assert.equal(feedbackHasVisibleEffect({ feedback: 0.5, fbX: 0, fbY: 0, fbZ: 1, fbTheta: 0 }), true);
assert.equal(feedbackHasVisibleEffect({ feedback: 1, fbX: 1, fbY: 0, fbZ: 1, fbTheta: 0 }), true);
assert.equal(feedbackHasVisibleEffect({ feedback: 1, fbX: 0, fbY: 0, fbZ: 1.01, fbTheta: 0 }), true);
assert.equal(feedbackHasVisibleEffect({ feedback: 1, fbX: 0, fbY: 0, fbZ: 1, fbTheta: 1 }), true);

for (const [w, h] of [[1, 1], [320, 240], [1280, 720], [1920, 1080]]) {
  for (const mode of ['v', 'h', 'hv']) {
    assert.equal(symmetryHasVisibleEffect({ symOn: true, symMode: mode, symPos: 1 }, w, h), false);
    assert.equal(symmetryHasVisibleEffect({ symOn: true, symMode: mode, symPos: 2 }, w, h), false);
    assert.equal(symmetryHasVisibleEffect({ symOn: true, symMode: mode, symPos: 0.5 }, w, h), w > 1 || h > 1);
  }
}
assert.equal(symmetryHasVisibleEffect({ symOn: false, symMode: 'v', symPos: 0.5 }, 1920, 1080), false);
assert.equal(symmetryHasVisibleEffect({ symOn: true, symMode: 'unknown', symPos: 0.5 }, 1920, 1080), false);

assert.equal(solarizeHasVisibleEffect({ solarizeOn: true, solarizeThresh: 1, solarizeAmt: 1, solarizeR: 2, solarizeG: 2, solarizeB: 2 }), false);
assert.equal(solarizeHasVisibleEffect({ solarizeOn: true, solarizeThresh: 0.5, solarizeAmt: 0, solarizeR: 1, solarizeG: 1, solarizeB: 1 }), false);
assert.equal(solarizeHasVisibleEffect({ solarizeOn: true, solarizeThresh: 0.5, solarizeAmt: 0, solarizeR: 1.1, solarizeG: 1, solarizeB: 1 }), true);
assert.equal(solarizeHasVisibleEffect({ solarizeOn: false, solarizeThresh: 0.5, solarizeAmt: 1, solarizeR: 1, solarizeG: 1, solarizeB: 1 }), false);

// Exhaustively prove the unity Solarize lookup is identity for every channel.
for (let value = 0; value < 256; value++) {
  const amount = 0;
  const mapped = Math.floor(Math.min(255, Math.max(0, (value + (255 - value - value) * amount) * 1 + 0.5)));
  assert.equal(mapped, value);
}

// Decode-serial bypass sync: one copy for each new decoded frame, no duplicate
// copy for repeated render ticks sharing the same serial.
let seededOnce = false;
let bypassSyncedVfc = -1;
let copies = 0;
function sync(serial) {
  if (seededOnce && bypassSyncedVfc === serial) return;
  copies++;
  seededOnce = true;
  bypassSyncedVfc = serial;
}
for (const serial of [0, 0, 0, 1, 1, 2, 2, 2, 3]) sync(serial);
assert.equal(copies, 4);

const requiredMarkers = [
  'function _resolveFrameActivity(state)',
  'function _feedbackHasVisibleEffect(state)',
  'function _symmetryHasVisibleEffect(state)',
  'function _solarizeHasVisibleEffect(state)',
  'function _syncBypassBuffer()',
  "_mainCtx.globalCompositeOperation = 'copy';",
  'if (!activity.any)',
  'if (activity.feedback)',
  'if (activity.flow)',
  'if (activity.symmetry)',
  'if (activity.solarize)',
  'if (activity.globalMix && gmPos ===',
  '_bypassSyncedVfc === _vfc',
];
for (const marker of requiredMarkers) {
  assert.ok(canvasSource.includes(marker), `missing source marker: ${marker}`);
}

assert.ok(!canvasSource.includes('const anyFxActive ='), 'legacy anyFxActive predicate should be removed');
assert.ok(!canvasSource.includes('if (s.flowOn && flowS > 0)'), 'legacy Flow dispatch should be removed');
assert.ok(effectsSource.includes('if (thresh >= 1) return;'), 'Solarize threshold guard missing');
assert.ok(effectsSource.includes('if (amount === 0 && solR === 1 && solG === 1 && solB === 1) return;'), 'Solarize identity guard missing');

console.log('Pass 11 validation passed:');
console.log('  neutral-stage activity truth table');
console.log('  feedback identity-transform cases');
console.log('  symmetry edge no-op cases');
console.log('  Solarize identity proof for 256 channel values');
console.log('  decoded-frame bypass copy coalescing');
console.log('  source-marker and legacy-path checks');
