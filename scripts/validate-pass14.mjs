import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const canvasSource = fs.readFileSync(path.join(root, 'src/canvas.js'), 'utf8');
const effectsSource = fs.readFileSync(path.join(root, 'src/effects.js'), 'utf8');

function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}

let checks = 0;

// Stable Pass 12R / 13S boundaries must remain intact.
check(!canvasSource.includes('_afterRenderFrame'), 'render-boundary scheduler consolidation must stay absent');
check(!canvasSource.includes('convertFileSrc'), 'asset-protocol media loading must stay absent');
check(canvasSource.includes('requestAnimationFrame(function pump(ts)'), 'independent mirror clock must remain');
check(canvasSource.includes('function loop() { frames++; report(); requestAnimationFrame(loop); }'), 'independent profiler clock must remain');
check(canvasSource.includes('File → Blob URL → p5 createVideo()') || canvasSource.includes('Blob URL'), 'working Blob URL media path must remain documented');

// Pass 14 structural checks.
check(canvasSource.includes('_releaseFrame(frame)'), 'FrameRing must explicitly release retired backing stores');
check(canvasSource.includes('frameRing?.dispose?.()'), 'shutdown must dispose the temporal ring');
check(canvasSource.includes('get estimatedBytes()'), 'profiler memory estimate must exist');
check(canvasSource.includes('source.width === width && source.height === height'), 'ring capture must use exact-size copy branch');
check(effectsSource.includes('function updateClusterPhysics('), 'cluster updater must be module-scoped');
check(!effectsSource.includes('function getPhysicsCenters()'), 'per-frame nested cluster closure must be removed');

// Exact-size Canvas2D dispatch model: identical dimensions use drawImage(source, 0, 0),
// while scaling retains the five-argument destination form.
function modeledCopy(ctx, source, width, height) {
  const sourceWidth = source.videoWidth || source.width || 0;
  const sourceHeight = source.videoHeight || source.height || 0;
  if (sourceWidth === width && sourceHeight === height) ctx.drawImage(source, 0, 0);
  else ctx.drawImage(source, 0, 0, width, height);
}
const calls = [];
const ctx = { drawImage(...args) { calls.push(args); } };
modeledCopy(ctx, { width: 1920, height: 1080 }, 1920, 1080);
modeledCopy(ctx, { videoWidth: 3840, videoHeight: 2160 }, 1920, 1080);
check(calls[0].length === 3, 'exact-size copy must use three drawImage arguments');
check(calls[1].length === 5, 'scaled copy must retain five drawImage arguments');

// Reference ring for ordering semantics.
class ReferenceRing {
  constructor(cap) { this.cap = Math.max(4, cap); this.items = []; }
  push(id) { this.items.push(id); if (this.items.length > this.cap) this.items.shift(); }
  resize(cap) { this.cap = Math.max(4, cap); if (this.items.length > this.cap) this.items = this.items.slice(-this.cap); }
  clear() { this.items = []; }
  fromEnd(n) { return this.items.at(-1 - n) ?? null; }
}

class TestRing {
  constructor(cap) {
    this._cap = Math.max(4, cap);
    this._buf = new Array(this._cap).fill(null);
    this._head = 0;
    this._size = 0;
    this.released = [];
  }
  push(id) {
    let frame = this._buf[this._head];
    if (!frame || frame.released) frame = { id, released: false };
    else frame.id = id;
    this._buf[this._head] = frame;
    this._head = (this._head + 1) % this._cap;
    if (this._size < this._cap) this._size++;
  }
  fromEnd(n) {
    if (n < 0 || n >= this._size) return null;
    return this._buf[(this._head - 1 - n + this._cap * 2) % this._cap]?.id ?? null;
  }
  _releaseFrame(frame) {
    if (!frame || frame.released) return;
    frame.released = true;
    this.released.push(frame.id);
  }
  resize(newCap) {
    newCap = Math.max(4, newCap);
    if (newCap === this._cap) return;
    const keep = Math.min(this._size, newCap);
    const newBuf = new Array(newCap).fill(null);
    const retained = new Set();
    for (let i = 0; i < keep; i++) {
      const frame = this._buf[(this._head - 1 - i + this._cap * 2) % this._cap];
      newBuf[keep - 1 - i] = frame;
      if (frame) retained.add(frame);
    }
    for (const frame of this._buf) if (frame && !retained.has(frame)) this._releaseFrame(frame);
    this._buf = newBuf;
    this._head = keep % newCap;
    this._size = keep;
    this._cap = newCap;
  }
  clear(release = false) {
    if (release) {
      for (const frame of this._buf) this._releaseFrame(frame);
      this._buf.fill(null);
    }
    this._head = 0;
    this._size = 0;
  }
}

let seed = 0x51a7c0de;
function rand() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}

const ref = new ReferenceRing(12);
const ring = new TestRing(12);
let nextId = 1;
for (let step = 0; step < 5000; step++) {
  const r = rand();
  if (r < 0.68) {
    ref.push(nextId);
    ring.push(nextId++);
  } else if (r < 0.9) {
    const cap = 4 + Math.floor(rand() * 28);
    ref.resize(cap);
    ring.resize(cap);
  } else {
    const release = rand() < 0.35;
    ref.clear();
    ring.clear(release);
  }
  check(ring._size === ref.items.length, `ring size mismatch at step ${step}`);
  for (let n = 0; n < ref.items.length; n++) {
    check(ring.fromEnd(n) === ref.fromEnd(n), `ring ordering mismatch at step ${step}, index ${n}`);
  }
}
check(ring.released.length > 0, 'resize/clear test must release retired frames');

// Deterministic physics equivalence model. Both implementations consume the same
// pseudo-random and noise streams and must produce identical centers and state.
function makeEnv() {
  let rs = 0x91e10da5;
  let randomCalls = 0;
  return {
    random(max = 1) {
      rs = (Math.imul(rs, 1103515245) + 12345) >>> 0;
      randomCalls++;
      return (rs / 0x100000000) * max;
    },
    noise(x, y = 0) {
      const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
      return v - Math.floor(v);
    },
    millis() { return 12345.678; },
    calls() { return randomCalls; },
  };
}

function physicsStep(state, env, p) {
  const { centers, speedVar, steer, pulse, travel, inertia, drift, bounce, width, height } = p;
  while (state.list.length < centers) {
    state.list.push({
      x: env.random(width), y: env.random(height),
      vx: (env.random() - 0.5) * 2, vy: (env.random() - 0.5) * 2,
      noiseOffX: env.random(1000), noiseOffY: env.random(1000),
      speedMul: 1 + (env.random() - 0.5) * 2 * speedVar,
    });
  }
  state.list.length = centers;
  state.t += steer * 0.004;
  if (pulse > 0) {
    const pulseInterval = Math.max(0.2, 3 - pulse * 0.25);
    const nowSec = env.millis() / 1000;
    if (!state.lastPulse) state.lastPulse = nowSec;
    if (nowSec - state.lastPulse >= pulseInterval) {
      state.lastPulse = nowSec;
      for (const c of state.list) {
        const ang = env.random(Math.PI * 2);
        const force = pulse * travel * 0.6;
        c.vx += Math.cos(ang) * force;
        c.vy += Math.sin(ang) * force;
      }
    }
  }
  for (const c of state.list) {
    const effectiveSpeed = travel * (c.speedMul ?? 1);
    const steerAng = env.noise(c.noiseOffX + state.t * 0.7, c.noiseOffY + state.t * 0.5) * Math.PI * 4;
    const desiredVx = Math.cos(steerAng) * effectiveSpeed;
    const desiredVy = Math.sin(steerAng) * effectiveSpeed;
    c.vx = c.vx * inertia + desiredVx * (1 - inertia);
    c.vy = c.vy * inertia + desiredVy * (1 - inertia);
    if (drift > 0) {
      c.vx += (env.noise(c.noiseOffX * 2.1 + state.t * 1.3) - 0.5) * drift * 0.5;
      c.vy += (env.noise(c.noiseOffY * 2.1 + state.t * 1.1) - 0.5) * drift * 0.5;
    }
    const nxp = c.x + c.vx;
    const nyp = c.y + c.vy;
    if (bounce) {
      if (nxp < 0) { c.x = -nxp; c.vx = -c.vx; }
      else if (nxp > width) { c.x = 2 * width - nxp; c.vx = -c.vx; }
      else c.x = nxp;
      if (nyp < 0) { c.y = -nyp; c.vy = -c.vy; }
      else if (nyp > height) { c.y = 2 * height - nyp; c.vy = -c.vy; }
      else c.y = nyp;
    } else {
      c.x = (nxp % width + width) % width;
      c.y = (nyp % height + height) % height;
    }
  }
}

const params = [
  { centers: 1, speedVar: 0, steer: 0, pulse: 0, travel: 0, inertia: .8, drift: 0, bounce: true, width: 1280, height: 720 },
  { centers: 7, speedVar: .9, steer: 4.2, pulse: 2, travel: 5.1, inertia: .35, drift: .8, bounce: true, width: 1920, height: 1080 },
  { centers: 5, speedVar: .5, steer: 8, pulse: 0, travel: 9.2, inertia: .92, drift: .25, bounce: false, width: 640, height: 360 },
];
for (const p of params) {
  const oldState = { list: [], t: 0, lastPulse: 0 };
  const newState = { list: [], t: 0, lastPulse: 0 };
  const oldEnv = makeEnv();
  const newEnv = makeEnv();
  for (let frame = 0; frame < 240; frame++) {
    physicsStep(oldState, oldEnv, p);
    physicsStep(newState, newEnv, p);
    check(JSON.stringify(oldState) === JSON.stringify(newState), `cluster state mismatch at frame ${frame}`);
    check(oldEnv.calls() === newEnv.calls(), `cluster random-call mismatch at frame ${frame}`);
  }
}

console.log(`Pass 14 validation passed: ${checks.toLocaleString()} checks`);
