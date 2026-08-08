// effects.js
// Enhancement notes:
//  - All frameRing accesses updated to FrameRing API: frameRing.fromEnd(n)
//    replaces frameRing[frameRing.length - 1 - n]. O(1) in both cases, but
//    fromEnd() is explicit and works correctly without an array reference.
//  - applyFlowWarp computes and draws each tile in one pass, with static grid
//    geometry cached by render size + cell size.
//  - Solarize uses cached channel lookup tables; pipeline luma masks are rebuilt
//    only when the decoded source frame or key parameters change.
//  - applyGlitch does not re-seed random — draw() seeds once per frame.
//  - Cluster physics centers use p5 seeded random() for reproducibility.
//  - Symmetry uses native Canvas2D clipping/transforms instead of p5 wrappers.
//  - Solarize and luma-key scratch canvases resize in place.
//  - Scanline placement reuses typed band buffers, cached angle geometry, and
//    cached per-band noise seeds; identical static states reuse prepared bands.
//  - Glitch tile placement reuses typed target/grid buffers and persistent
//    Float64 cluster offsets instead of allocating arrays, Maps, and objects
//    every frame.
//  - Pass 11 neutral Solarize states return before scratch allocation/readback;
//    the draw dispatcher also skips neutral Flow/Feedback/Symmetry/Mix stages.
//  - Pass 14 exact-size canvas copies avoid Canvas2D scaling setup, and the
//    cluster-physics updater is reused instead of recreated inside applyGlitch.
//  - Pass 16 processes Solarize pixels through a little-endian Uint32 path,
//    keeps the byte path as fallback, and presents the cached 640px result
//    directly instead of maintaining a second full-resolution cache canvas.
//  - Pass 17 builds the Pipeline Luma Key clean patch directly in one bounded
//    scratch canvas, removing the separate mask canvas, duplicate clean copy,
//    and destination-in composition while preserving the same alpha gate.
//  - Pass 18 keeps Glitch blits on the cached Canvas2D context, reuses prepared
//    smear offsets, and resolves temporal-ring slots once per ring generation
//    instead of repeating helper/context/ring lookups for every tile draw.
//  - Pass 20 removes p5 map() dispatch from active Scanline/Glitch/persistence
//    hot paths and adds profiler-only Scanline/Flow draw-count telemetry.
//  - Pass 21 caches Flow noise-coordinate products, per-tile source clip bounds,
//    and radial swirl sin/cos values in persistent typed workspaces.
//  - Pass 22 specializes Scanline band preparation by neutral shift/drift state,
//    caches phase/focus scalars, and uses a direct horizontal blit path.

// ─── Temporal ring drawing ───────────────────────────────────────────────────
// FrameRing stores reusable canvas snapshots, so historical frames remain
// directly drawable. This avoids the old getImageData() readback on capture and
// the later putImageData() upload/cache needed before every temporal sample.

function copyCanvasFrame(ctx, source, width, height) {
  if (!ctx || !source || width <= 0 || height <= 0) return;
  const prevOp    = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;
  try {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    const sourceWidth  = source.videoWidth  || source.width  || 0;
    const sourceHeight = source.videoHeight || source.height || 0;
    if (sourceWidth === width && sourceHeight === height) {
      ctx.drawImage(source, 0, 0);
    } else {
      ctx.drawImage(source, 0, 0, width, height);
    }
  } finally {
    ctx.globalCompositeOperation = prevOp || 'source-over';
    ctx.globalAlpha = prevAlpha;
  }
}

// Exact coefficient contributions reused by both CPU luma paths. This removes
// three multiplications from every sampled pixel without changing the formula.
const _lumaR = new Float64Array(256);
const _lumaG = new Float64Array(256);
const _lumaB = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  _lumaR[i] = 0.299 * i;
  _lumaG[i] = 0.587 * i;
  _lumaB[i] = 0.114 * i;
}

// ─── Cluster physics state ─────────────────────────────────────────────────────
let _cluPhysics = [];
let _cluPhysT   = 0;

// Called by canvas.js clearAll() so Refresh wipes physics momentum
function resetClusterPhysics() {
  _cluPhysics.length = 0;
  _cluPhysT = 0;
}
window.resetClusterPhysics = resetClusterPhysics;

// ─── Reusable glitch-placement workspace ─────────────────────────────────────
// Tile placement previously rebuilt an Array of [x,y] pairs plus a Map of cell
// Arrays on every rendered frame. This workspace retains typed buffers and a
// linked-cell spatial index between frames. Capacity only grows when a preset,
// control value, or render size actually requires more targets.
class GlitchPlacementWorkspace {
  constructor() {
    this.x = new Int32Array(0);
    this.y = new Int32Array(0);
    this.next = new Int32Array(0);
    this.head = new Int32Array(0);
    this.count = 0;
    this.gap = 0;
    this.gapSq = 0;
    this.gridW = 0;
    this.gridH = 0;
  }

  _ensureTargetCapacity(required) {
    if (this.x.length >= required) return;
    let cap = Math.max(32, this.x.length || 0);
    while (cap < required) cap *= 2;
    const nx = new Int32Array(cap);
    const ny = new Int32Array(cap);
    const nn = new Int32Array(cap);
    nx.set(this.x); ny.set(this.y); nn.set(this.next);
    this.x = nx; this.y = ny; this.next = nn;
  }

  _ensureGridCapacity(required) {
    if (this.head.length >= required) return;
    let cap = Math.max(64, this.head.length || 0);
    while (cap < required) cap *= 2;
    this.head = new Int32Array(cap);
  }

  begin(maxTargets, canvasW, canvasH, gap) {
    this._ensureTargetCapacity(Math.max(1, maxTargets));
    this.count = 0;
    this.gap = gap;
    this.gapSq = gap * gap;

    if (gap <= 0) {
      this.gridW = 0;
      this.gridH = 0;
      return;
    }

    this.gridW = Math.ceil(canvasW / gap) + 2;
    this.gridH = Math.ceil(canvasH / gap) + 2;
    const cells = this.gridW * this.gridH;
    this._ensureGridCapacity(cells);
    this.head.fill(-1, 0, cells);
  }

  add(x, y) {
    if (this.gap <= 0) {
      const i = this.count++;
      this.x[i] = x;
      this.y[i] = y;
      return true;
    }

    const gx = Math.floor(x / this.gap);
    const gy = Math.floor(y / this.gap);
    for (let oy = -1; oy <= 1; oy++) {
      const ngy = gy + oy;
      if (ngy < 0 || ngy >= this.gridH) continue;
      const row = ngy * this.gridW;
      for (let ox = -1; ox <= 1; ox++) {
        const ngx = gx + ox;
        if (ngx < 0 || ngx >= this.gridW) continue;
        let i = this.head[row + ngx];
        while (i >= 0) {
          const dx = x - this.x[i];
          const dy = y - this.y[i];
          if (dx * dx + dy * dy < this.gapSq) return false;
          i = this.next[i];
        }
      }
    }

    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    const key = gy * this.gridW + gx;
    this.next[i] = this.head[key];
    this.head[key] = i;
    return true;
  }
}

const _glitchTargets = new GlitchPlacementWorkspace();

// ─── Reusable glitch blit workspace ─────────────────────────────────────────
// Glitch can issue hundreds or thousands of Canvas2D drawImage calls per frame.
// Keep everything around those irreducible blits as cheap as possible:
//   - temporal ring slots are resolved once per ring generation;
//   - smear offsets are rounded once per smear step, not once per tile;
//   - the hot loop calls the cached Canvas2D context directly.
class GlitchBlitWorkspace {
  constructor() {
    this.ringVersion = -1;
    this.ringMaxBack = -1;
    this.ringFrames = [null];
    this.smearX = new Int32Array(0);
    this.smearY = new Int32Array(0);
    this.ringRebuilt = false;
  }

  prepareRing(ring, maxBack) {
    const version = ring?.version ?? -1;
    if (this.ringVersion === version && this.ringMaxBack === maxBack) {
      this.ringRebuilt = false;
      return this.ringFrames;
    }

    this.ringFrames.length = maxBack + 1;
    this.ringFrames[0] = null;
    for (let i = 1; i <= maxBack; i++) {
      this.ringFrames[i] = ring.fromEnd(i);
    }
    this.ringVersion = version;
    this.ringMaxBack = maxBack;
    this.ringRebuilt = true;
    return this.ringFrames;
  }

  prepareSmear(length, dxUnit, dyUnit, block) {
    if (length <= 0) return;
    const required = length + 1;
    if (this.smearX.length < required) {
      let cap = Math.max(8, this.smearX.length || 0);
      while (cap < required) cap *= 2;
      this.smearX = new Int32Array(cap);
      this.smearY = new Int32Array(cap);
    }
    // Preserve the original multiplication order exactly:
    // Math.round(dxUnit * s * block), not Math.round((dxUnit * block) * s).
    for (let s = 1; s <= length; s++) {
      this.smearX[s] = Math.round(dxUnit * s * block);
      this.smearY[s] = Math.round(dyUnit * s * block);
    }
  }
}

const _glitchBlits = new GlitchBlitWorkspace();
const _glitchTelemetry = window.__huffGlitchTelemetry || {
  frames: 0,
  tiles: 0,
  drawCalls: 0,
  ringRebuilds: 0,
  ringReuses: 0,
};
window.__huffGlitchTelemetry = _glitchTelemetry;

function _glitchProfileFrame(tileCount, smearLength, ringRebuilt) {
  if (window.__huffProfilerActive !== true) return;
  _glitchTelemetry.frames++;
  _glitchTelemetry.tiles += tileCount;
  _glitchTelemetry.drawCalls += tileCount * (1 + smearLength);
  if (ringRebuilt) _glitchTelemetry.ringRebuilds++;
  else _glitchTelemetry.ringReuses++;
}

function ensureClusterTileCapacity(center, required) {
  if ((center.tileAngles?.length || 0) >= required) return;
  let cap = Math.max(8, center.tileAngles?.length || 0);
  while (cap < required) cap *= 2;
  const angles = new Float64Array(cap);
  const radii  = new Float64Array(cap);
  if (center.tileAngles) angles.set(center.tileAngles);
  if (center.tileRadii)  radii.set(center.tileRadii);
  center.tileAngles = angles;
  center.tileRadii  = radii;
}

// Reused cluster-physics updater. Pass 13S recreated this function and its
// closure on every glitch frame even though the implementation and captured
// state were stable. Positional arguments avoid replacing that closure with a
// per-frame options object. Random/noise call order and equations are unchanged.
function updateClusterPhysics(
  cluCenters, cluSpeedVar, cluSteer, cluPulse, cluTravel,
  cluInertia, cluDrift, cluBounce, canvasWidth, canvasHeight
) {
  while (_cluPhysics.length < cluCenters) {
    _cluPhysics.push({
      x: random(canvasWidth),
      y: random(canvasHeight),
      vx: (random() - 0.5) * 2,
      vy: (random() - 0.5) * 2,
      noiseOffX: random(1000),
      noiseOffY: random(1000),
      speedMul: 1 + (random() - 0.5) * 2 * cluSpeedVar,
      tileAngles: new Float64Array(0),
      tileRadii:  new Float64Array(0),
      tileCount: 0,
    });
  }
  _cluPhysics.length = cluCenters;

  _cluPhysT += cluSteer * 0.004;

  if (cluPulse > 0) {
    const pulseInterval = Math.max(0.2, 3 - cluPulse * 0.25);
    const nowSec = millis() / 1000;
    if (!_cluPhysics._lastPulse) _cluPhysics._lastPulse = nowSec;
    if (nowSec - _cluPhysics._lastPulse >= pulseInterval) {
      _cluPhysics._lastPulse = nowSec;
      for (const c of _cluPhysics) {
        const ang = random(TWO_PI);
        const force = cluPulse * cluTravel * 0.6;
        c.vx += Math.cos(ang) * force;
        c.vy += Math.sin(ang) * force;
      }
    }
  }

  for (const c of _cluPhysics) {
    const effectiveSpeed = cluTravel * (c.speedMul ?? 1);
    const steerAng = noise(c.noiseOffX + _cluPhysT * 0.7,
                           c.noiseOffY + _cluPhysT * 0.5) * TWO_PI * 2;
    const desiredVx = Math.cos(steerAng) * effectiveSpeed;
    const desiredVy = Math.sin(steerAng) * effectiveSpeed;

    c.vx = c.vx * cluInertia + desiredVx * (1 - cluInertia);
    c.vy = c.vy * cluInertia + desiredVy * (1 - cluInertia);

    if (cluDrift > 0) {
      c.vx += (noise(c.noiseOffX * 2.1 + _cluPhysT * 1.3) - 0.5) * cluDrift * 0.5;
      c.vy += (noise(c.noiseOffY * 2.1 + _cluPhysT * 1.1) - 0.5) * cluDrift * 0.5;
    }

    const nxp = c.x + c.vx;
    const nyp = c.y + c.vy;
    if (cluBounce) {
      if      (nxp < 0)           { c.x = -nxp;                    c.vx = -c.vx; }
      else if (nxp > canvasWidth) { c.x = 2 * canvasWidth - nxp;  c.vx = -c.vx; }
      else                        { c.x = nxp; }
      if      (nyp < 0)            { c.y = -nyp;                     c.vy = -c.vy; }
      else if (nyp > canvasHeight) { c.y = 2 * canvasHeight - nyp;  c.vy = -c.vy; }
      else                         { c.y = nyp; }
    } else {
      c.x = (nxp % canvasWidth  + canvasWidth)  % canvasWidth;
      c.y = (nyp % canvasHeight + canvasHeight) % canvasHeight;
    }
  }
  return _cluPhysics;
}

// Self-contained — initialises _ringCanvas itself rather than relying on
// drawRingRegion having run first. Safe to call in any order.

// ─── Scanlines ────────────────────────────────────────────────────────────────
// ANGLE — rotates the entire scanline pattern. 0°=horizontal, 90°=vertical,
//         45°=diagonal right, -45°=diagonal left, any value = spin.
//         Canvas context is rotated before drawing bands; all band math runs in
//         the rotated frame so displacement is always perpendicular to band axis.
// FOCUS — biases band positions toward a region of the canvas (0=top/left, 1=bottom/right)
// ROLL  — steady scroll simulating CRT rolling sync loss, independent of DRIFT
// DRIFT — dual-frequency noise: slow sync wander + fast instability jitter

class ScanlineBandWorkspace {
  constructor() {
    this.slowSeed = new Float64Array(0);
    this.fastSeed = new Float64Array(0);
    this.shiftSeed = new Float64Array(0);
    this.start = new Int32Array(0);
    this.length = new Float64Array(0);
    this.srcOff = new Int32Array(0);
    this.dstOff = new Int32Array(0);
    this.crossLength = new Float64Array(0);
    this.count = 0;

    this.geometryWidth = -1;
    this.geometryHeight = -1;
    this.geometryAngle = Number.NaN;
    this.angleRad = 0;
    this.absS = 0;
    this.absC = 1;
    this.dim = 0;
    this.cross = 0;
    this.halfWidth = 0;
    this.halfHeight = 0;
    this.negativeHalfWidth = 0;
    this.negativeHalfDim = 0;
    this.rotatePattern = false;
    this.directHorizontal = false;
    this.geometryRebuilt = false;
    this.bandsRebuilt = false;

    this.cacheValid = false;
    this.cacheBands = -1;
    this.cacheBandSize = -1;
    this.cacheGap = -1;
    this.cacheSkew = Number.NaN;
    this.cacheFocus = Number.NaN;
    this.cacheRoll = Number.NaN;
    this.cacheShiftScale = Number.NaN;
    this.cacheDrift = Number.NaN;
    this.cachePhaseX = Number.NaN;
    this.cachePhaseY = Number.NaN;
    this.cacheDim = Number.NaN;
    this.cacheCross = Number.NaN;
  }

  _ensureCapacity(required) {
    if (this.start.length >= required) return;
    const previous = this.start.length;
    let capacity = Math.max(32, previous || 0);
    while (capacity < required) capacity *= 2;

    const slowSeed = new Float64Array(capacity);
    const fastSeed = new Float64Array(capacity);
    const shiftSeed = new Float64Array(capacity);
    const start = new Int32Array(capacity);
    const length = new Float64Array(capacity);
    const srcOff = new Int32Array(capacity);
    const dstOff = new Int32Array(capacity);
    const crossLength = new Float64Array(capacity);

    slowSeed.set(this.slowSeed);
    fastSeed.set(this.fastSeed);
    shiftSeed.set(this.shiftSeed);
    start.set(this.start);
    length.set(this.length);
    srcOff.set(this.srcOff);
    dstOff.set(this.dstOff);
    crossLength.set(this.crossLength);

    for (let n = previous; n < capacity; n++) {
      slowSeed[n] = n * 3.7;
      fastSeed[n] = n * 11.3;
      shiftSeed[n] = n * 2.3;
    }

    this.slowSeed = slowSeed;
    this.fastSeed = fastSeed;
    this.shiftSeed = shiftSeed;
    this.start = start;
    this.length = length;
    this.srcOff = srcOff;
    this.dstOff = dstOff;
    this.crossLength = crossLength;
  }

  invalidate() {
    this.cacheValid = false;
  }

  resolveGeometry(canvasWidth, canvasHeight, angleDeg) {
    if (
      this.geometryWidth === canvasWidth &&
      this.geometryHeight === canvasHeight &&
      this.geometryAngle === angleDeg
    ) {
      this.geometryRebuilt = false;
      return this;
    }

    this.geometryWidth = canvasWidth;
    this.geometryHeight = canvasHeight;
    this.geometryAngle = angleDeg;
    this.angleRad = (angleDeg * Math.PI) / 180;
    this.absS = Math.abs(Math.sin(this.angleRad));
    this.absC = Math.abs(Math.cos(this.angleRad));
    this.dim = canvasWidth * this.absS + canvasHeight * this.absC;
    this.cross = canvasWidth * this.absC + canvasHeight * this.absS;
    this.halfWidth = canvasWidth / 2;
    this.halfHeight = canvasHeight / 2;
    this.negativeHalfWidth = -this.halfWidth;
    this.negativeHalfDim = -this.dim / 2;
    this.rotatePattern = Math.abs(this.angleRad) > 0.001;
    // With an exact zero angle, the old pair of translations cancelled to the
    // incoming transform. Draw directly and restore only the alpha we modify.
    this.directHorizontal = angleDeg === 0;
    this.geometryRebuilt = true;
    this.cacheValid = false;
    return this;
  }

  _matches(scanBands, bandSize, scanGap, scanSkew, focus, roll, shiftScale, driftAmt, phX, phY) {
    return this.cacheValid &&
      this.cacheBands === scanBands &&
      this.cacheBandSize === bandSize &&
      this.cacheGap === scanGap &&
      this.cacheSkew === scanSkew &&
      this.cacheFocus === focus &&
      this.cacheRoll === roll &&
      this.cacheShiftScale === shiftScale &&
      this.cacheDrift === driftAmt &&
      this.cachePhaseX === phX &&
      this.cachePhaseY === phY &&
      this.cacheDim === this.dim &&
      this.cacheCross === this.cross;
  }

  prepare(scanBands, bandSize, scanGap, scanSkew, focus, roll, shiftScale, driftAmt, phX, phY) {
    this._ensureCapacity(scanBands);
    if (this._matches(scanBands, bandSize, scanGap, scanSkew, focus, roll, shiftScale, driftAmt, phX, phY)) {
      this.bandsRebuilt = false;
      return this.count;
    }

    const dim = this.dim;
    const cross = this.cross;
    const rollOffset = (phY * roll * 80) % dim;
    const focusDistance = Math.abs(focus - 0.5);
    const focusBias = focusDistance * 1.4;
    const slowScale = 1 - focusBias;
    const focusOffset = (focus * dim) * focusDistance * 1.4;
    const gridStep = Math.max(1, bandSize + scanGap);
    const snapToGrid = scanGap > 0;
    const shiftRange = cross * shiftScale;
    // p5 map(noise, 0, 1, -shiftRange, shiftRange) performs parameter
    // validation on every band. Preserve the exact arithmetic locally.
    const shiftSpan = shiftRange - (-shiftRange);
    const noShift = shiftScale === 0 && scanSkew === 0;
    const noFastJitter = driftAmt === 0;
    // These expressions were previously identical inside every band iteration.
    // Keep their original left-to-right arithmetic, but resolve them once.
    const slowPhase = phY * 0.25 * driftAmt;
    const fastPhase = phY * 1.8 * driftAmt;
    const shiftPhase = phX * 0.5;

    const slowSeed = this.slowSeed;
    const fastSeed = this.fastSeed;
    const shiftSeed = this.shiftSeed;
    const starts = this.start;
    const lengths = this.length;
    const sourceOffsets = this.srcOff;
    const destinationOffsets = this.dstOff;
    const crossLengths = this.crossLength;
    let count = 0;

    // Select the neutral/dynamic variants once per Scanline pass rather than
    // re-testing drift and shift state for every requested band.
    if (noFastJitter) {
      if (noShift) {
        for (let n = 0; n < scanBands; n++) {
          const slowDrift = noise(slowSeed[n] + slowPhase) * dim;
          const biased = slowDrift * slowScale + focusOffset;
          const rawPos = ((biased + rollOffset) % dim + dim) % dim;
          const gridPos = snapToGrid
            ? Math.floor(rawPos / gridStep) * gridStep
            : rawPos;
          const bandStart = Math.max(0, Math.floor(gridPos));
          const bandEnd = Math.min(dim, bandStart + bandSize);
          const bandLength = bandEnd - bandStart;
          if (bandLength <= 0) continue;

          starts[count] = bandStart;
          lengths[count] = bandLength;
          sourceOffsets[count] = 0;
          destinationOffsets[count] = 0;
          crossLengths[count] = cross;
          count++;
        }
      } else {
        for (let n = 0; n < scanBands; n++) {
          const slowDrift = noise(slowSeed[n] + slowPhase) * dim;
          const biased = slowDrift * slowScale + focusOffset;
          const rawPos = ((biased + rollOffset) % dim + dim) % dim;
          const gridPos = snapToGrid
            ? Math.floor(rawPos / gridStep) * gridStep
            : rawPos;
          const bandStart = Math.max(0, Math.floor(gridPos));
          const bandEnd = Math.min(dim, bandStart + bandSize);
          const bandLength = bandEnd - bandStart;
          if (bandLength <= 0) continue;

          const skewOffset = Math.floor(scanSkew * bandStart);
          const shiftNoise = noise(shiftSeed[n] + shiftPhase);
          const shift = Math.floor(shiftNoise * shiftSpan + (-shiftRange)) + skewOffset;
          const sourceOffset = Math.max(0, shift < 0 ? -shift : 0);
          const destinationOffset = Math.max(0, shift > 0 ? shift : 0);
          const bandCross = cross - Math.abs(shift);
          if (bandCross <= 0) continue;

          starts[count] = bandStart;
          lengths[count] = bandLength;
          sourceOffsets[count] = sourceOffset;
          destinationOffsets[count] = destinationOffset;
          crossLengths[count] = bandCross;
          count++;
        }
      }
    } else if (noShift) {
      for (let n = 0; n < scanBands; n++) {
        const slowDrift = noise(slowSeed[n] + slowPhase) * dim;
        const fastJitter = (noise(fastSeed[n] + fastPhase) - 0.5) * dim * 0.12 * driftAmt;
        const biased = slowDrift * slowScale + focusOffset + fastJitter;
        const rawPos = ((biased + rollOffset) % dim + dim) % dim;
        const gridPos = snapToGrid
          ? Math.floor(rawPos / gridStep) * gridStep
          : rawPos;
        const bandStart = Math.max(0, Math.floor(gridPos));
        const bandEnd = Math.min(dim, bandStart + bandSize);
        const bandLength = bandEnd - bandStart;
        if (bandLength <= 0) continue;

        starts[count] = bandStart;
        lengths[count] = bandLength;
        sourceOffsets[count] = 0;
        destinationOffsets[count] = 0;
        crossLengths[count] = cross;
        count++;
      }
    } else {
      for (let n = 0; n < scanBands; n++) {
        const slowDrift = noise(slowSeed[n] + slowPhase) * dim;
        const fastJitter = (noise(fastSeed[n] + fastPhase) - 0.5) * dim * 0.12 * driftAmt;
        const biased = slowDrift * slowScale + focusOffset + fastJitter;
        const rawPos = ((biased + rollOffset) % dim + dim) % dim;
        const gridPos = snapToGrid
          ? Math.floor(rawPos / gridStep) * gridStep
          : rawPos;
        const bandStart = Math.max(0, Math.floor(gridPos));
        const bandEnd = Math.min(dim, bandStart + bandSize);
        const bandLength = bandEnd - bandStart;
        if (bandLength <= 0) continue;

        const skewOffset = Math.floor(scanSkew * bandStart);
        const shiftNoise = noise(shiftSeed[n] + shiftPhase);
        const shift = Math.floor(shiftNoise * shiftSpan + (-shiftRange)) + skewOffset;
        const sourceOffset = Math.max(0, shift < 0 ? -shift : 0);
        const destinationOffset = Math.max(0, shift > 0 ? shift : 0);
        const bandCross = cross - Math.abs(shift);
        if (bandCross <= 0) continue;

        starts[count] = bandStart;
        lengths[count] = bandLength;
        sourceOffsets[count] = sourceOffset;
        destinationOffsets[count] = destinationOffset;
        crossLengths[count] = bandCross;
        count++;
      }
    }

    this.count = count;
    this.cacheValid = true;
    this.bandsRebuilt = true;
    this.cacheBands = scanBands;
    this.cacheBandSize = bandSize;
    this.cacheGap = scanGap;
    this.cacheSkew = scanSkew;
    this.cacheFocus = focus;
    this.cacheRoll = roll;
    this.cacheShiftScale = shiftScale;
    this.cacheDrift = driftAmt;
    this.cachePhaseX = phX;
    this.cachePhaseY = phY;
    this.cacheDim = dim;
    this.cacheCross = cross;
    return count;
  }
}

const _scanlineBands = new ScanlineBandWorkspace();
window.invalidateScanlineCache = () => _scanlineBands.invalidate();

const _scanlineTelemetry = window.__huffScanlineTelemetry || {
  frames: 0,
  bands: 0,
  drawCalls: 0,
  geometryRebuilds: 0,
  geometryReuses: 0,
  bandRebuilds: 0,
  bandReuses: 0,
  directFrames: 0,
  transformedFrames: 0,
};
window.__huffScanlineTelemetry = _scanlineTelemetry;

function _scanlineProfileFrame(bandCount) {
  if (window.__huffProfilerActive !== true) return;
  const workspace = _scanlineBands;
  _scanlineTelemetry.frames++;
  _scanlineTelemetry.bands += bandCount;
  _scanlineTelemetry.drawCalls += bandCount;
  if (workspace.geometryRebuilt) _scanlineTelemetry.geometryRebuilds++;
  else _scanlineTelemetry.geometryReuses++;
  if (workspace.bandsRebuilt) _scanlineTelemetry.bandRebuilds++;
  else _scanlineTelemetry.bandReuses++;
  if (workspace.directHorizontal) _scanlineTelemetry.directFrames++;
  else _scanlineTelemetry.transformedFrames++;
}

function applyScanlines(density, angleOverride = null, scanPriority = 1.0, state = window.HUFF_RENDER_STATE) {
  const rs = state || window.HUFF_RENDER_STATE || {};
  if (!rs.clusters) return;

  const scanBands = Math.trunc(rs.clusterCount);
  if (scanBands <= 0) return;

  const bandAlpha = rs.scanAlpha * scanPriority;
  if (!(bandAlpha > 0)) return;

  const angleDeg = angleOverride !== null ? angleOverride : rs.scanAngle;
  const shiftScale = rs.scanShift;
  const driftAmt = rs.scanDrift;
  const scanGap = Math.trunc(rs.scanGap);
  const scanSkew = rs.scanSkew;
  const focus = rs.scanFocus;
  const roll = rs.scanRoll;
  const bandSize = Math.max(4, Math.floor(Math.trunc(rs.clusterRadius) * 3));
  const phX = nPhaseScanX;
  const phY = nPhaseScanY;

  const workspace = _scanlineBands.resolveGeometry(width, height, angleDeg);
  const dim = workspace.dim;
  const cross = workspace.cross;
  if (!(dim > 0) || !(cross > 0)) return;

  const bandCount = workspace.prepare(
    scanBands,
    bandSize,
    scanGap,
    scanSkew,
    focus,
    roll,
    shiftScale,
    driftAmt,
    phX,
    phY,
  );
  if (bandCount <= 0) return;

  const ctx = gBuf.drawingContext;
  const sourceCanvas = gCur.drawingContext.canvas;
  const starts = workspace.start;
  const lengths = workspace.length;
  const sourceOffsets = workspace.srcOff;
  const destinationOffsets = workspace.dstOff;
  const crossLengths = workspace.crossLength;

  if (workspace.directHorizontal) {
    // At exact 0°, the legacy translate pair is a mathematical identity.
    // Avoid save/translate/translate/restore and restore only globalAlpha.
    const previousAlpha = ctx.globalAlpha;
    try {
      ctx.globalAlpha = bandAlpha;
      for (let i = 0; i < bandCount; i++) {
        const bandStart = starts[i];
        const bandLength = lengths[i];
        const bandCross = crossLengths[i];
        ctx.drawImage(
          sourceCanvas,
          sourceOffsets[i], bandStart, bandCross, bandLength,
          destinationOffsets[i], bandStart, bandCross, bandLength,
        );
      }
    } finally {
      ctx.globalAlpha = previousAlpha;
    }
    _scanlineProfileFrame(bandCount);
    return;
  }

  ctx.save();
  ctx.translate(workspace.halfWidth, workspace.halfHeight);
  if (workspace.rotatePattern) ctx.rotate(workspace.angleRad);
  ctx.translate(workspace.negativeHalfWidth, workspace.negativeHalfDim);
  ctx.globalAlpha = bandAlpha;

  for (let i = 0; i < bandCount; i++) {
    const bandStart = starts[i];
    const bandLength = lengths[i];
    const bandCross = crossLengths[i];
    ctx.drawImage(
      sourceCanvas,
      sourceOffsets[i], bandStart, bandCross, bandLength,
      destinationOffsets[i], bandStart, bandCross, bandLength,
    );
  }

  _scanlineProfileFrame(bandCount);
  ctx.restore();
}


// ─── Glitch ───────────────────────────────────────────────────────────────────
// Note: randomSeed is set by draw() once per frame. No re-seeding here.

function applyGlitch(density = 1, baseDX = 0, baseDY = 0, glitchPriority = 1.0, state = window.HUFF_RENDER_STATE) {
  const rs = state || window.HUFF_RENDER_STATE || {};
  const block     = Math.trunc(rs.block);
  const size      = Math.trunc(rs.glitchSize);
  const smearLen  = Math.trunc(rs.glitchSmear);
  const corrupt   = rs.corrupt;
  const tileAlpha = Math.floor(rs.glitchAlpha * 255);
  const jitter    = rs.glitchJitter;

  const smearAngleDeg = rs.glitchSmearAngle;
  let dxUnit, dyUnit;
  if (smearAngleDeg === 0) {
    // Exact p5 map(noise, 0, 1, -1, 1) arithmetic without the framework
    // parameter-validation dispatch on every active Glitch frame.
    dxUnit = noise(nPhaseX) * (1 - (-1)) + (-1);
    dyUnit = noise(nPhaseY) * (1 - (-1)) + (-1);
  } else {
    const smearAngleMin = -Math.PI / 6;
    const smearAngleMax =  Math.PI / 6;
    const rad = (smearAngleDeg * Math.PI / 180)
      + noise(nPhaseX * 0.5) * (smearAngleMax - smearAngleMin) + smearAngleMin;
    dxUnit = Math.cos(rad);
    dyUnit = Math.sin(rad);
  }

  const cols  = Math.max(1, Math.floor(width  / block));
  const rows  = Math.max(1, Math.floor(height / block));
  const total = cols * rows;

  const depth   = rs.depth;
  const maxBack = Math.max(1, Math.floor((frameRing.length - 1) * depth));

  const depthScatter = rs.depthScatter;
  const baseBack     = Math.max(1, Math.floor(maxBack * (0.3 + 0.7 * noise(nPhaseX * 0.1 + nPhaseY * 0.07))));

  const corruptDrift = rs.corruptDrift;
  const driftMod     = corruptDrift > 0 ? (noise(nPhaseX * 0.08, nPhaseY * 0.08) * 2 - 1) : 0;
  const corruptMul   = Math.max(0.05, 1.0 + corruptDrift * driftMod);
  let count = Math.max(1, Math.floor(total * corrupt * corruptMul));

  const gap          = Math.trunc(rs.spatialGap);
  const useCluTiles  = !!rs.clusterTiles;
  const cluCenters   = Math.trunc(rs.cluCenters);
  const cluSpread    = Math.trunc(rs.cluSpread);
  const cluMinSpread = Math.trunc(rs.cluMinSpread);
  const cluBias      = rs.cluBias;
  const cluDrift     = rs.cluDrift;
  const cluSpeed     = rs.cluSpeed;
  const cluInertia   = rs.cluInertia;
  // STEER decouples heading-change rate from travel SPEED: cluSpeed is now pure
  // travel velocity, cluSteer is how fast the heading sweeps. cluBounce makes
  // centers reflect off the edges (true side-to-side travel) instead of wrapping
  // (which teleported them across — the main source of jumpiness). cluBreathe
  // slowly oscillates the scatter radius so the cloud expands/contracts.
  const cluSteer     = rs.cluSteer;
  const cluBreathe   = rs.cluBreathe;
  const cluBounce    = (rs.cluBounds || 'bounce') === 'bounce';
  const cluBreatheF  = cluBreathe > 0 ? (1 + Math.sin(millis() * 0.0006) * cluBreathe) : 1;
  // COHERENCE — how much each center's tile offsets persist frame to frame, so a
  // cluster reads as a BODY that travels with its center instead of re-rolling
  // into static every frame. 0 = full per-frame boil (original), 1 = rigid
  // constellation, between = slowly morphing blob. This is what makes the physics
  // (steer / inertia / bounce) legible — there's finally something to watch move.
  const cluCohere    = rs.cluCohere;
  // Recalibrated travel: exponential so the slow, watchable range spreads across
  // the lower half of the SPEED slider instead of bunching at the bottom, and the
  // top is calmer than the old linear px/frame.
  const cluTravel    = Math.pow(Math.max(0, cluSpeed) / 10, 1.7) * 7;

  // ── Spatial index — O(1) gap enforcement ──────────────────────────────────
  // Reuse typed target buffers and a linked-cell index. Candidate acceptance and
  // insertion order remain the same as the previous Array/Map implementation.
  const targets = _glitchTargets;
  targets.begin(count, width, height, gap);

  // Note: randomSeed is set by draw() once per frame; no re-seeding here.
  // applyScanlines ran first and consumed some random state — that ordering is intentional.

  const cluSpeedVar = rs.cluSpeedVar;
  const cluPulse    = rs.cluPulse;

  // ── Cluster center physics ─────────────────────────────────────────────────
  // Updated by a module-level helper so normal glitch frames do not allocate a
  // new closure. The call remains at the same point in the seeded random stream.

  // ── Tile placement ─────────────────────────────────────────────────────────
  if (useCluTiles && cluCenters > 0) {
    // Always use physics centres. At cluSpeed=0 the desired velocity is zero
    // so centres gradually stop and hold position via inertia.
    // getStaticCenters() called random() every frame causing re-randomisation
    // even at speed=0 — that looked like movement when there should be none.
    const centers = updateClusterPhysics(
      cluCenters, cluSpeedVar, cluSteer, cluPulse, cluTravel,
      cluInertia, cluDrift, cluBounce, width, height
    );
    const biasCount  = Math.round(count * cluBias);
    const per        = Math.max(1, Math.floor(biasCount / cluCenters));

    // BREATHE: oscillate the scatter radius over time so the cloud expands and
    // contracts. cluBreatheF is 1 when BREATHE is 0 (static, original behaviour).
    const effSpread = Math.max(1, cluSpread * cluBreatheF);
    const effMin    = cluMinSpread * cluBreatheF;
    const reroll    = 1 - cluCohere;   // per-frame chance each offset re-rolls

    for (const c of centers) {
      ensureClusterTileCapacity(c, per);
      for (let i = 0; i < per && targets.count < biasCount; i++) {
        // Persistent center-relative offset (angle + normalized radius) so the
        // cluster travels as a body. COHERENCE sets how often it re-rolls:
        // reroll=1 (COHERENCE 0) → new offset every frame = original boil;
        // reroll=0 (COHERENCE 1) → fixed constellation. Float64 buffers retain
        // the same numeric precision without allocating an object per reroll.
        const hadOffset = i < c.tileCount;
        if (!hadOffset || random() < reroll) {
          c.tileAngles[i] = random(TWO_PI);
          c.tileRadii[i]  = random();
          if (!hadOffset) c.tileCount = i + 1;
        }
        const angle = c.tileAngles[i];
        const r = effMin + c.tileRadii[i] * Math.max(1, effSpread - effMin);
        const x = (c.x + Math.cos(angle) * r + width)  % width;
        const y = (c.y + Math.sin(angle) * r + height) % height;
        let ok = targets.add(Math.floor(x), Math.floor(y)), tries = 0;
        while (!ok && tries++ < 6) {
          // Collision fallback — transient random probe, doesn't disturb the body
          const a2 = random(TWO_PI);
          const r2 = effMin + random() * Math.max(1, effSpread - effMin);
          ok = targets.add(
            Math.floor((c.x + Math.cos(a2) * r2 + width)  % width),
            Math.floor((c.y + Math.sin(a2) * r2 + height) % height)
          );
        }
      }
      if (c.tileCount > per) c.tileCount = per;   // trim if per shrank
    }
    let guard = 0;
    while (targets.count < count && guard++ < count * 4)
      targets.add(Math.floor(random(cols)) * block, Math.floor(random(rows)) * block);
  } else {
    let attempts = 0;
    while (targets.count < count && attempts++ < count * 8)
      targets.add(Math.floor(random(cols)) * block, Math.floor(random(rows)) * block);
  }

  // ── Blit tiles ─────────────────────────────────────────────────────────────
  if (frameRing.length === 0 || maxBack <= 0) return;

  const ctx = gBuf.drawingContext;
  const prevAlpha = ctx.globalAlpha;
  const ringFrames = _glitchBlits.prepareRing(frameRing, maxBack);
  const tileSpan = block * (size / 20);
  if (smearLen > 0) _glitchBlits.prepareSmear(smearLen, dxUnit, dyUnit, block);
  const smearX = _glitchBlits.smearX;
  const smearY = _glitchBlits.smearY;

  // tileAlpha is constant for all tiles — set once, restore once.
  // glitchPriority scales contribution relative to scanlines (A/B mix).
  ctx.globalAlpha = (tileAlpha / 255) * glitchPriority;

  const jitterMin = -block * 2;
  const jitterMax =  block * 2;
  const jitterSpan = jitterMax - jitterMin;

  for (let i = 0; i < targets.count; i++) {
    let cx = targets.x[i];
    let cy = targets.y[i];

    // This is the exact p5 map(noise, 0, 1, jitterMin, jitterMax) formula,
    // kept inline so the hottest per-tile loop avoids p5 validation overhead.
    const oxNoise = noise(nPhaseX + i * 0.013);
    const oyNoise = noise(nPhaseY + i * 0.017);
    const ox = Math.floor((oxNoise * jitterSpan + jitterMin) * jitter);
    const oy = Math.floor((oyNoise * jitterSpan + jitterMin) * jitter);
    cx = (cx + ox + width)  % width;
    cy = (cy + oy + height) % height;

    const w = Math.min(tileSpan, width  - cx);
    const h = Math.min(tileSpan, height - cy);
    if (w <= 0 || h <= 0) continue;

    const dstX = Math.max(0, Math.min(width  - w, cx + baseDX));
    const dstY = Math.max(0, Math.min(height - h, cy + baseDY));

    // Stable ring frame selection per video frame using _vfc hash.
    // Previously random(1, maxBack+1) reseeded from frameCount — every draw()
    // at 60fps picked a different historical frame per tile. Between two video
    // frames each tile would flash through different time-slices of the person,
    // causing the temporal stutter on movement.
    // _vfc only increments when a real decoded frame arrives (~30fps), so this
    // hash is identical across all draw() calls sharing the same video frame.
    const randBack  = Math.max(1, ((_vfc * 1664525 + i * 1013904223) >>> 0) % maxBack + 1);
    const blendBack = Math.round(baseBack + (randBack - baseBack) * depthScatter);
    const idx       = Math.max(1, Math.min(maxBack, blendBack));
    const src       = ringFrames[idx];
    if (!src) continue;

    ctx.drawImage(src, cx, cy, w, h, dstX, dstY, w, h);

    if (smearLen > 0) {
      for (let s = 1; s <= smearLen; s++) {
        const sx2 = Math.max(0, Math.min(width  - w, dstX + smearX[s]));
        const sy2 = Math.max(0, Math.min(height - h, dstY + smearY[s]));
        ctx.drawImage(src, cx, cy, w, h, sx2, sy2, w, h);
      }
    }
  }

  ctx.globalAlpha = prevAlpha;
  _glitchProfileFrame(targets.count, smearLen, _glitchBlits.ringRebuilt);
}

// ─── Flow warp ────────────────────────────────────────────────────────────────
// Computes displacement and draws each tile immediately. Static grid geometry is
// cached by render size + cell size, so normal frames no longer repeat divisions,
// edge-size checks, radial normalisation, or atan2 work for every tile.

class FlowGridWorkspace {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.cell = 0;
    this.count = 0;
    this.capacity = 0;
    this.generation = 0;
    this.x = new Int32Array(0);
    this.y = new Int32Array(0);
    this.tileW = new Int32Array(0);
    this.tileH = new Int32Array(0);
    this.maxSourceX = new Int32Array(0);
    this.maxSourceY = new Int32Array(0);
    this.nx = new Float64Array(0);
    this.ny = new Float64Array(0);
    this.inwardX = new Float64Array(0);
    this.inwardY = new Float64Array(0);
    this.radialAngle = new Float64Array(0);
  }

  _ensureCapacity(required) {
    if (this.capacity >= required) return;
    let cap = Math.max(32, this.capacity || 0);
    while (cap < required) cap *= 2;
    this.capacity = cap;
    this.x = new Int32Array(cap);
    this.y = new Int32Array(cap);
    this.tileW = new Int32Array(cap);
    this.tileH = new Int32Array(cap);
    this.maxSourceX = new Int32Array(cap);
    this.maxSourceY = new Int32Array(cap);
    this.nx = new Float64Array(cap);
    this.ny = new Float64Array(cap);
    this.inwardX = new Float64Array(cap);
    this.inwardY = new Float64Array(cap);
    this.radialAngle = new Float64Array(cap);
  }

  configure(width, height, cell) {
    if (this.width === width && this.height === height && this.cell === cell) return false;
    this.width = width;
    this.height = height;
    this.cell = cell;

    const cols = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    const required = cols * rows;
    this._ensureCapacity(required);

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

        this.x[i] = x;
        this.y[i] = y;
        this.tileW[i] = Math.min(cell, width - x);
        this.tileH[i] = Math.min(cell, height - y);
        this.maxSourceX[i] = width - this.tileW[i];
        this.maxSourceY[i] = height - this.tileH[i];
        this.nx[i] = (x + 0.5 * cell) / width * 2.0;
        this.ny[i] = (y + 0.5 * cell) / height * 2.0;
        this.inwardX[i] = vx / length;
        this.inwardY[i] = vy / length;
        this.radialAngle[i] = Math.atan2(py - cy, px - cx);
      }
    }
    this.count = required;
    this.generation++;
    return true;
  }
}

// Dynamic Flow terms that depend on stable grid geometry plus slowly changing
// controls. Keeping them in reusable typed arrays follows the same persistent-
// resource discipline used throughout the Junkpile examples and avoids repeating
// frequency multiplication and radial sin/cos work for every tile on every frame.
class FlowFieldWorkspace {
  constructor() {
    this.capacity = 0;
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

  _ensureCapacity(required) {
    if (this.capacity >= required) return;
    let cap = Math.max(32, this.capacity || 0);
    while (cap < required) cap *= 2;
    this.capacity = cap;
    this.noiseX = new Float64Array(cap);
    this.noiseY = new Float64Array(cap);
    this.turbulenceX = new Float64Array(cap);
    this.turbulenceY = new Float64Array(cap);
    this.swirlCos = new Float64Array(cap);
    this.swirlSin = new Float64Array(cap);
    this.frequencyGeneration = -1;
    this.swirlGeneration = -1;
  }

  configureFrequency(grid, frequency) {
    this._ensureCapacity(grid.count);
    if (this.frequencyGeneration === grid.generation && this.frequency === frequency) return false;
    this.frequencyGeneration = grid.generation;
    this.frequency = frequency;
    const nx = grid.nx;
    const ny = grid.ny;
    const noiseX = this.noiseX;
    const noiseY = this.noiseY;
    const turbulenceX = this.turbulenceX;
    const turbulenceY = this.turbulenceY;
    for (let i = 0; i < grid.count; i++) {
      const fx = nx[i] * frequency;
      const fy = ny[i] * frequency;
      noiseX[i] = fx;
      noiseY[i] = fy;
      // Preserve the original left-associated nx * frequency * 4 operation.
      turbulenceX[i] = fx * 4;
      turbulenceY[i] = fy * 4;
    }
    return true;
  }

  configureSwirl(grid, swirl) {
    this._ensureCapacity(grid.count);
    if (this.swirlGeneration === grid.generation && this.swirl === swirl) return false;
    this.swirlGeneration = grid.generation;
    this.swirl = swirl;
    if (swirl === 0) return true;
    const radialAngle = grid.radialAngle;
    const swirlCos = this.swirlCos;
    const swirlSin = this.swirlSin;
    for (let i = 0; i < grid.count; i++) {
      const angle = radialAngle[i] * swirl;
      swirlCos[i] = Math.cos(angle);
      swirlSin[i] = Math.sin(angle);
    }
    return true;
  }
}

const _flowGrid = new FlowGridWorkspace();
const _flowField = new FlowFieldWorkspace();
let _flowLastFrequencyRebuilt = false;
let _flowLastSwirlRebuilt = false;
const _flowTelemetry = window.__huffFlowTelemetry || {
  frames: 0,
  tiles: 0,
  drawCalls: 0,
  gridRebuilds: 0,
  gridReuses: 0,
  frequencyRebuilds: 0,
  frequencyReuses: 0,
  swirlRebuilds: 0,
  swirlReuses: 0,
};
window.__huffFlowTelemetry = _flowTelemetry;

function _flowProfileFrame(tileCount, gridRebuilt) {
  if (window.__huffProfilerActive !== true) return;
  _flowTelemetry.frames++;
  _flowTelemetry.tiles += tileCount;
  _flowTelemetry.drawCalls += tileCount;
  if (gridRebuilt) _flowTelemetry.gridRebuilds++;
  else _flowTelemetry.gridReuses++;
  if (_flowLastFrequencyRebuilt) _flowTelemetry.frequencyRebuilds++;
  else _flowTelemetry.frequencyReuses++;
  if (_flowLastSwirlRebuilt) _flowTelemetry.swirlRebuilds++;
  else _flowTelemetry.swirlReuses++;
}

function applyFlowWarp(src, dst, strength = 6, scale = 80, pulse = 0, implode = 0, speed = 1, turb = 0, swirl = 0, spread = 1) {
  let srcFrame = src;
  if (pulse > 0 && frameRing.length > pulse) {
    const ringFrame = frameRing.fromEnd(pulse);
    if (ringFrame) srcFrame = ringFrame;
  }

  const srcEl = (srcFrame instanceof HTMLCanvasElement)
    ? srcFrame
    : (srcFrame?.elt ?? srcFrame?.drawingContext?.canvas ?? null);

  const dctx = dst.drawingContext;
  dctx.save();
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.globalAlpha = 1;
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, dst.width, dst.height);
  if (!srcEl) { dctx.restore(); return; }

  const cell = Math.max(8, scale | 0);
  const off  = strength;
  // SPEED is exponential (pow 1.6): fine, crawling control at the low end and a
  // genuinely fast top end. speed=1 maps to the original tempo; speed=0 freezes.
  const t    = frameCount * 0.005 * Math.pow(Math.max(0, speed), 1.6);
  const w = width, h = height;
  const flowGridRebuilt = _flowGrid.configure(w, h, cell);

  // SPREAD scales the flow-field noise frequency: low = large coherent zones all
  // drifting together (watery), high = many small independent eddies.
  const freq = 0.9 * Math.max(0.05, spread);
  _flowLastFrequencyRebuilt = _flowField.configureFrequency(_flowGrid, freq);
  _flowLastSwirlRebuilt = _flowField.configureSwirl(_flowGrid, swirl);

  const turbulenceMix = turb * 0.5;
  const turbulenceBaseMix = 1 - turbulenceMix;
  const implodeScale = off * implode;
  const angleScale = TWO_PI * 2.0;
  const turbulenceTimeX = t * 1.3;
  const turbulenceTimeY = t * 0.9;

  // Resolve reusable typed arrays once per pass rather than repeatedly walking
  // workspace properties inside the per-tile loop.
  const count = _flowGrid.count;
  const xs = _flowGrid.x;
  const ys = _flowGrid.y;
  const tileWidths = _flowGrid.tileW;
  const tileHeights = _flowGrid.tileH;
  const maxSourceXs = _flowGrid.maxSourceX;
  const maxSourceYs = _flowGrid.maxSourceY;
  const inwardXs = _flowGrid.inwardX;
  const inwardYs = _flowGrid.inwardY;
  const noiseXs = _flowField.noiseX;
  const noiseYs = _flowField.noiseY;
  const turbulenceXs = _flowField.turbulenceX;
  const turbulenceYs = _flowField.turbulenceY;
  const swirlCosines = _flowField.swirlCos;
  const swirlSines = _flowField.swirlSin;

  for (let i = 0; i < count; i++) {
    const x = xs[i];
    const y = ys[i];

    let a = noise(noiseXs[i] + t, noiseYs[i]) * angleScale;
    if (turb > 0) {
      const a2 = noise(turbulenceXs[i] + turbulenceTimeX + 100, turbulenceYs[i] + turbulenceTimeY) * angleScale;
      a = a * turbulenceBaseMix + a2 * turbulenceMix;
    }

    let dx2 = Math.cos(a) * off;
    let dy2 = Math.sin(a) * off;

    if (implode !== 0) {
      dx2 += inwardXs[i] * implodeScale;
      dy2 += inwardYs[i] * implodeScale;
    }

    if (swirl !== 0) {
      const cs = swirlCosines[i];
      const sn = swirlSines[i];
      const rx = dx2 * cs - dy2 * sn;
      const ry = dx2 * sn + dy2 * cs;
      dx2 = rx; dy2 = ry;
    }

    // The previous displacement arrays were Float32Array-backed. Preserve that
    // quantization exactly before flooring so the visual tile selection does
    // not shift at floating-point boundaries.
    dx2 = Math.fround(dx2);
    dy2 = Math.fround(dy2);
    const tileW = tileWidths[i];
    const tileH = tileHeights[i];
    const sx2 = Math.max(0, Math.min(maxSourceXs[i], Math.floor(x + dx2)));
    const sy2 = Math.max(0, Math.min(maxSourceYs[i], Math.floor(y + dy2)));
    dctx.drawImage(srcEl, sx2, sy2, tileW, tileH, x, y, tileW, tileH);
  }
  _flowProfileFrame(_flowGrid.count, flowGridRebuilt);
  dctx.restore();
}

// ─── Solarize ─────────────────────────────────────────────────────────────────
// Downsamples to max 640px wide before pixel math, then scales back up.
// ~4–16x faster on large screens / Windows.

let _solCanvas = null, _solCtx = null;
const _solRMap = new Uint8ClampedArray(256);
const _solGMap = new Uint8ClampedArray(256);
const _solBMap = new Uint8ClampedArray(256);
const _solRPacked = new Uint32Array(256);
const _solGPacked = new Uint32Array(256);
const _solBPacked = new Uint32Array(256);
let _solMapAmount = NaN;
let _solMapR = NaN;
let _solMapG = NaN;
let _solMapB = NaN;
let _solOutputW = 0;
let _solOutputH = 0;

// Every supported HUFF Classic release target is little-endian today, but keep
// the original byte loop as a deterministic fallback rather than assuming it.
const _solLittleEndian = (() => {
  const word = new Uint32Array([0x0a0b0c0d]);
  return new Uint8Array(word.buffer)[0] === 0x0d;
})();

// Profiler-only sub-stage telemetry. The main profiler reads this object on its
// independent clock; Solarize only measures these phases while the profiler is
// visible, so hidden-profiler playback retains the optimized hot path.
const _solTelemetry = window.__huffSolarizeTelemetry || {
  readbackMs: 0,
  readbackSamples: 0,
  transformMs: 0,
  transformSamples: 0,
  uploadMs: 0,
  uploadSamples: 0,
  presentMs: 0,
  presentSamples: 0,
  processedFrames: 0,
  reusedFrames: 0,
};
window.__huffSolarizeTelemetry = _solTelemetry;

function _solProfileAdd(name, amount = 1) {
  _solTelemetry[name] = (_solTelemetry[name] || 0) + amount;
}

function _refreshSolarizeMaps(amount, solR, solG, solB) {
  // Primitive comparisons avoid constructing a parameter-key string on every
  // processed Solarize frame. Equality behavior remains the same for controls.
  if (
    amount === _solMapAmount &&
    solR === _solMapR &&
    solG === _solMapG &&
    solB === _solMapB
  ) return;

  _solMapAmount = amount;
  _solMapR = solR;
  _solMapG = solG;
  _solMapB = solB;

  const a = Math.max(0, Math.min(1, amount));
  for (let i = 0; i < 256; i++) {
    const inverted = i + (255 - i - i) * a;
    _solRMap[i] = Math.floor(Math.min(255, Math.max(0, inverted * solR + 0.5)));
    _solGMap[i] = Math.floor(Math.min(255, Math.max(0, inverted * solG + 0.5)));
    _solBMap[i] = Math.floor(Math.min(255, Math.max(0, inverted * solB + 0.5)));
    _solRPacked[i] = _solRMap[i];
    _solGPacked[i] = _solGMap[i] << 8;
    _solBPacked[i] = _solBMap[i] << 16;
  }
}

function _solarizePixelsBytes(pix, threshold) {
  for (let i = 0; i < pix.length; i += 4) {
    const r = pix[i], g = pix[i + 1], b = pix[i + 2];
    const lum = _lumaR[r] + _lumaG[g] + _lumaB[b];
    if (lum > threshold) {
      pix[i]     = _solRMap[r];
      pix[i + 1] = _solGMap[g];
      pix[i + 2] = _solBMap[b];
    }
  }
}

function _solarizePixelsWords(pix, threshold) {
  // RGBA ImageData bytes are packed as 0xAABBGGRR on little-endian targets.
  // Process one Uint32 per pixel while retaining the alpha byte verbatim.
  const words = new Uint32Array(
    pix.buffer,
    pix.byteOffset,
    pix.byteLength >>> 2
  );
  for (let i = 0; i < words.length; i++) {
    const packed = words[i];
    const r = packed & 0xff;
    const g = (packed >>> 8) & 0xff;
    const b = (packed >>> 16) & 0xff;
    const lum = _lumaR[r] + _lumaG[g] + _lumaB[b];
    if (lum > threshold) {
      words[i] = (
        (packed & 0xff000000) |
        _solRPacked[r] |
        _solGPacked[g] |
        _solBPacked[b]
      ) >>> 0;
    }
  }
}

function _presentSolarizeCache(ctx, width, height) {
  if (!ctx || !_solCanvas || width <= 0 || height <= 0) return;
  const prevOp = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;
  const prevSmoothing = ctx.imageSmoothingEnabled;
  const hasQuality = 'imageSmoothingQuality' in ctx;
  const prevQuality = hasQuality ? ctx.imageSmoothingQuality : null;
  try {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    // Match the default scaling state of the removed full-resolution cache
    // canvas. The old second exact-size copy did not perform any extra filtering.
    ctx.imageSmoothingEnabled = true;
    if (hasQuality) ctx.imageSmoothingQuality = 'low';
    if (_solCanvas.width === width && _solCanvas.height === height) {
      ctx.drawImage(_solCanvas, 0, 0);
    } else {
      ctx.drawImage(_solCanvas, 0, 0, width, height);
    }
  } finally {
    ctx.globalCompositeOperation = prevOp || 'source-over';
    ctx.globalAlpha = prevAlpha;
    ctx.imageSmoothingEnabled = prevSmoothing;
    if (hasQuality && prevQuality) ctx.imageSmoothingQuality = prevQuality;
  }
}

// ── Adaptive load guard ───────────────────────────────────────────────────────
// applySolarize()'s getImageData() forces a synchronous GPU→CPU readback. Because
// solarize runs late in the pipeline, that readback flushes every preceding
// effect's GPU work on the main thread before it returns. Under sustained load the
// stall pushes the frame past budget and starves the <video> element's decode
// pipeline that feeds Web Audio — the "breaks up, drops, then recovers" symptom.
//
// The guard measures the smoothed frame period and, ONLY while overloaded,
// processes solarize every 2nd/3rd frame, re-presenting the cached processed
// low-resolution result on skipped frames. At healthy frame rates it processes
// every frame, so the output is identical to before — the easing only kicks in
// exactly when the machine is already dropping frames, trading a little solarize
// update rate for stable audio.
let _solPrevTs   = 0;
let _solFrameEMA = 16.7;   // smoothed frame period, ms
let _solPhase    = 0;
let _solHasCache = false;

function applySolarize(buf, thresh = 0.5, amount = 1.0, solR = 1.0, solG = 1.0, solB = 1.0) {
  // Keep the function safe when called outside the main dispatcher. These
  // states are exact identities and must not trigger a synchronous readback.
  if (thresh >= 1) return;
  if (amount === 0 && solR === 1 && solG === 1 && solB === 1) return;
  const BW = buf.width, BH = buf.height;
  const MAX_W = 640;
  const scale = BW > MAX_W ? MAX_W / BW : 1;
  const sw = Math.max(1, Math.round(BW * scale));
  const sh = Math.max(1, Math.round(BH * scale));

  if (!_solCanvas) {
    _solCanvas = document.createElement('canvas');
    _solCtx = _solCanvas.getContext('2d', { willReadFrequently:true });
  }
  if (_solCanvas.width !== sw || _solCanvas.height !== sh) {
    _solCanvas.width = sw;
    _solCanvas.height = sh;
    // Setting canvas dimensions resets context state but does not require a new
    // context object. Keeping the same reference avoids an unnecessary lookup.
    _solHasCache = false;
  }
  if (_solOutputW !== BW || _solOutputH !== BH) {
    _solOutputW = BW;
    _solOutputH = BH;
    _solHasCache = false;
  }

  // Smoothed frame period (ms). Solarize runs once per frame, so the gap between
  // calls is the frame period; skipping work shortens it, so the metric self-corrects.
  const now = performance.now();
  if (_solPrevTs) _solFrameEMA += ((now - _solPrevTs) - _solFrameEMA) * 0.1;
  _solPrevTs = now;

  // Processing stride from load:  ≤20ms (≈50fps+) → every frame,
  // 20–30ms → every 2nd frame, >30ms → every 3rd frame.
  let stride = 1;
  if (_solFrameEMA > 30)      stride = 3;
  else if (_solFrameEMA > 20) stride = 2;

  const doProcess = (stride === 1) || (_solPhase % stride === 0) || !_solHasCache;
  _solPhase++;
  const profile = window.__huffProfilerActive === true;

  if (doProcess) {
    const srcCanvas = buf.elt || buf.drawingContext.canvas;
    let phaseStart = profile ? performance.now() : 0;
    copyCanvasFrame(_solCtx, srcCanvas, sw, sh);
    const imgData = _solCtx.getImageData(0, 0, sw, sh);
    if (profile) {
      _solProfileAdd('readbackMs', performance.now() - phaseStart);
      _solProfileAdd('readbackSamples');
    }

    const pix = imgData.data;
    const t = thresh * 255;
    _refreshSolarizeMaps(amount, solR, solG, solB);
    phaseStart = profile ? performance.now() : 0;
    if (_solLittleEndian) _solarizePixelsWords(pix, t);
    else _solarizePixelsBytes(pix, t);
    if (profile) {
      _solProfileAdd('transformMs', performance.now() - phaseStart);
      _solProfileAdd('transformSamples');
    }

    phaseStart = profile ? performance.now() : 0;
    _solCtx.putImageData(imgData, 0, 0);
    if (profile) {
      _solProfileAdd('uploadMs', performance.now() - phaseStart);
      _solProfileAdd('uploadSamples');
      _solProfileAdd('processedFrames');
    }
    _solHasCache = true;
  } else if (profile) {
    _solProfileAdd('reusedFrames');
  }

  const presentStart = profile ? performance.now() : 0;
  _presentSolarizeCache(buf.drawingContext, BW, BH);
  if (profile) {
    _solProfileAdd('presentMs', performance.now() - presentStart);
    _solProfileAdd('presentSamples');
  }
}

// ─── Symmetry ─────────────────────────────────────────────────────────────────

function applySymmetry(src, dst, mode = 'v', pos = 0.5) {
  const w  = dst.width, h = dst.height;
  const x0 = Math.max(0, Math.min(w, Math.round(w * pos)));
  const y0 = Math.max(0, Math.min(h, Math.round(h * pos)));
  const srcCanvas = src?.elt ?? src?.drawingContext?.canvas ?? null;
  const ctx = dst.drawingContext;
  if (!ctx || !srcCanvas) return;

  // Replace the destination in one native Canvas2D copy, then perform the same
  // clipped mirror draws without p5 push/pop/image wrapper overhead.
  copyCanvasFrame(ctx, srcCanvas, w, h);

  if (mode === 'v' || mode === 'hv') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, w - x0, h);
    ctx.clip();
    ctx.translate(2 * x0, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(srcCanvas, 0, 0, w, h);
    ctx.restore();
  }
  if (mode === 'h' || mode === 'hv') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, w, h - y0);
    ctx.clip();
    ctx.translate(0, 2 * y0);
    ctx.scale(1, -1);
    ctx.drawImage(srcCanvas, 0, 0, w, h);
    ctx.restore();
  }
}

// ─── Pipeline Luma Key ────────────────────────────────────────────────────────
// Applied in draw() between applyGlitch() and applyScanlines().
//
// Pass 36 stability rebase:
//   - LIVE returns to the known-good Pass 31/34 single-scratch architecture.
//     One bounded clean patch is analyzed/cached by decoded source frame and
//     then composited exactly as before. No 15 Hz wall-clock gate and no
//     per-render split CUT/FILL path.
//   - STENCIL keeps the accepted Fairlight-inspired stored luminance plane,
//     but its reusable alpha mask is rebuilt by direct byte assignment. This
//     avoids the Pass 35 cumulative-alpha bug where repeated threshold/invert
//     changes multiplied a new mask by the previously shaped mask.
//   - Selecting STENCIL without a valid capture no longer silently falls back
//     to LIVE; the stage simply waits for CAPTURE, matching the UI state.
//
// INDIGO-inspired GAIN, CLEANUP, DENSITY, X-FADE and SOFT ADD remain.
// Operates at 640px max width for performance. No new full-resolution surface.

let _plkCanvas = null, _plkCtx = null;
let _plkStencilMaskCanvas = null, _plkStencilMaskCtx = null;
let _plkStencilMaskImageData = null;

// LIVE cached clean patch.
let _plkCacheFrame = -1;
let _plkCacheThresh = NaN;
let _plkCacheInvert = false;
let _plkCacheGain = NaN;
let _plkCacheCleanup = NaN;
let _plkCacheDensity = NaN;

// Fairlight-inspired stored stencil: bounded 8-bit luminance only.
let _plkStencilLuma = null;
let _plkStencilW = 0, _plkStencilH = 0;
let _plkStencilVersion = 0;
let _plkStencilMaskVersion = -1;
let _plkStencilMaskThresh = NaN;
let _plkStencilMaskInvert = false;
let _plkStencilMaskGain = NaN;
let _plkStencilMaskCleanup = NaN;
let _plkStencilMaskDensity = NaN;

// INDIGO Cleanup/Density is applied as a 256-entry alpha shaping table.
// The table is rebuilt only when these two controls change.
const _plkShapeLut = new Uint8Array(256);
let _plkShapeCleanup = NaN;
let _plkShapeDensity = NaN;
let _plkShapeIdentity = true;

const _plkTelemetry = window.__huffLumaKeyTelemetry || {
  readbackMs: 0,
  readbackSamples: 0,
  transformMs: 0,
  transformSamples: 0,
  uploadMs: 0,
  uploadSamples: 0,
  presentMs: 0,
  presentSamples: 0,
  rebuiltFrames: 0,
  reusedFrames: 0,
  stencilCaptureMs: 0,
  stencilCaptureSamples: 0,
  stencilCaptures: 0,
  stencilReuses: 0,
};
window.__huffLumaKeyTelemetry = _plkTelemetry;

function _plkProfileAdd(name, amount = 1) {
  _plkTelemetry[name] = (_plkTelemetry[name] || 0) + amount;
}

function _multiplyByteAlpha(sourceAlpha, maskAlpha) {
  if (sourceAlpha === 255) return maskAlpha;
  if (sourceAlpha === 0 || maskAlpha === 0) return 0;
  return Math.floor((sourceAlpha * maskAlpha + 127) / 255);
}

function _ensurePipelineShapeLut(cleanup, density) {
  if (cleanup === _plkShapeCleanup && density === _plkShapeDensity) {
    return _plkShapeIdentity ? null : _plkShapeLut;
  }

  _plkShapeCleanup = cleanup;
  _plkShapeDensity = density;
  _plkShapeIdentity = cleanup <= 0 && density <= 0;

  if (_plkShapeIdentity) return null;

  const blackPoint = Math.max(0, Math.min(0.45, cleanup * 0.45));
  const whitePoint = Math.max(0.55, Math.min(1, 1 - density * 0.45));

  for (let i = 0; i < 256; i++) {
    let a = i / 255;
    if (blackPoint > 0) {
      a = a <= blackPoint ? 0 : (a - blackPoint) / (1 - blackPoint);
    }
    if (whitePoint < 1) {
      a = a >= whitePoint ? 1 : a / whitePoint;
    }
    _plkShapeLut[i] = Math.max(0, Math.min(255, (a * 255 + 0.5) | 0));
  }

  return _plkShapeLut;
}

// LIVE key path: mutate only the alpha of the bounded clean patch. This is the
// same architecture that was stable before the Pass 35 CUT/FILL experiment.
function _pipelineLumaPixelsBytesClean(patchPix, threshold, invert, safeGain, shapeLut) {
  if (invert) {
    for (let i = 0; i < patchPix.length; i += 4) {
      const lum = _lumaR[patchPix[i]] + _lumaG[patchPix[i + 1]] + _lumaB[patchPix[i + 2]];
      const roll = Math.max(0, Math.min(1, ((lum - threshold) * safeGain) / 64));
      const reveal = 1 - roll;
      let maskAlpha = ((1 - reveal) * 255 + 0.5) | 0;
      if (shapeLut) maskAlpha = shapeLut[maskAlpha];
      patchPix[i + 3] = _multiplyByteAlpha(patchPix[i + 3], maskAlpha);
    }
    return;
  }

  for (let i = 0; i < patchPix.length; i += 4) {
    const lum = _lumaR[patchPix[i]] + _lumaG[patchPix[i + 1]] + _lumaB[patchPix[i + 2]];
    const roll = Math.max(0, Math.min(1, ((lum - threshold) * safeGain) / 64));
    let maskAlpha = ((1 - roll) * 255 + 0.5) | 0;
    if (shapeLut) maskAlpha = shapeLut[maskAlpha];
    patchPix[i + 3] = _multiplyByteAlpha(patchPix[i + 3], maskAlpha);
  }
}

function _pipelineLumaPixelsWordsClean(patchPix, threshold, invert, safeGain, shapeLut) {
  const words = new Uint32Array(
    patchPix.buffer,
    patchPix.byteOffset,
    patchPix.byteLength >>> 2
  );

  if (invert) {
    for (let i = 0; i < words.length; i++) {
      const packed = words[i];
      const r = packed & 0xff;
      const g = (packed >>> 8) & 0xff;
      const b = (packed >>> 16) & 0xff;
      const lum = _lumaR[r] + _lumaG[g] + _lumaB[b];
      const roll = Math.max(0, Math.min(1, ((lum - threshold) * safeGain) / 64));
      const reveal = 1 - roll;
      let maskAlpha = ((1 - reveal) * 255 + 0.5) | 0;
      if (shapeLut) maskAlpha = shapeLut[maskAlpha];
      const outputAlpha = _multiplyByteAlpha(packed >>> 24, maskAlpha);
      words[i] = ((packed & 0x00ffffff) | (outputAlpha << 24)) >>> 0;
    }
    return;
  }

  for (let i = 0; i < words.length; i++) {
    const packed = words[i];
    const r = packed & 0xff;
    const g = (packed >>> 8) & 0xff;
    const b = (packed >>> 16) & 0xff;
    const lum = _lumaR[r] + _lumaG[g] + _lumaB[b];
    const roll = Math.max(0, Math.min(1, ((lum - threshold) * safeGain) / 64));
    let maskAlpha = ((1 - roll) * 255 + 0.5) | 0;
    if (shapeLut) maskAlpha = shapeLut[maskAlpha];
    const outputAlpha = _multiplyByteAlpha(packed >>> 24, maskAlpha);
    words[i] = ((packed & 0x00ffffff) | (outputAlpha << 24)) >>> 0;
  }
}

// STENCIL mask path. Crucially, alpha is ASSIGNED from the stored luminance on
// every mask rebuild. It is never multiplied by the previous mask alpha.
function _pipelineLumaStencilMask(stencilLuma, maskBytes, threshold, invert, safeGain, shapeLut) {
  if (invert) {
    for (let p = 0, i = 0; p < stencilLuma.length; p++, i += 4) {
      const roll = Math.max(0, Math.min(1, ((stencilLuma[p] - threshold) * safeGain) / 64));
      const reveal = 1 - roll;
      let maskAlpha = ((1 - reveal) * 255 + 0.5) | 0;
      if (shapeLut) maskAlpha = shapeLut[maskAlpha];
      maskBytes[i + 3] = maskAlpha;
    }
    return;
  }

  for (let p = 0, i = 0; p < stencilLuma.length; p++, i += 4) {
    const roll = Math.max(0, Math.min(1, ((stencilLuma[p] - threshold) * safeGain) / 64));
    let maskAlpha = ((1 - roll) * 255 + 0.5) | 0;
    if (shapeLut) maskAlpha = shapeLut[maskAlpha];
    maskBytes[i + 3] = maskAlpha;
  }
}

function _invalidatePipelineLumaCaches() {
  _plkCacheFrame = -1;
  _plkCacheThresh = NaN;
  _plkCacheInvert = false;
  _plkCacheGain = NaN;
  _plkCacheCleanup = NaN;
  _plkCacheDensity = NaN;
  _plkStencilMaskVersion = -1;
  _plkStencilMaskThresh = NaN;
  _plkStencilMaskInvert = false;
  _plkStencilMaskGain = NaN;
  _plkStencilMaskCleanup = NaN;
  _plkStencilMaskDensity = NaN;
}
window.invalidatePipelineLumaKeyCache = _invalidatePipelineLumaCaches;

function _ensurePipelineLumaCanvas(sw, sh) {
  if (!_plkCanvas) {
    _plkCanvas = document.createElement('canvas');
    _plkCtx = _plkCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!_plkStencilMaskCanvas) {
    _plkStencilMaskCanvas = document.createElement('canvas');
    _plkStencilMaskCtx = _plkStencilMaskCanvas.getContext('2d');
  }

  const resized =
    _plkCanvas.width !== sw || _plkCanvas.height !== sh ||
    _plkStencilMaskCanvas.width !== sw || _plkStencilMaskCanvas.height !== sh;

  if (!resized) return;

  _plkCanvas.width = sw;
  _plkCanvas.height = sh;
  _plkStencilMaskCanvas.width = sw;
  _plkStencilMaskCanvas.height = sh;
  _plkStencilMaskImageData = _plkStencilMaskCtx.createImageData(sw, sh);

  const maskBytes = _plkStencilMaskImageData.data;
  for (let i = 0; i < maskBytes.length; i += 4) {
    maskBytes[i] = 255;
    maskBytes[i + 1] = 255;
    maskBytes[i + 2] = 255;
    maskBytes[i + 3] = 255;
  }

  _invalidatePipelineLumaCaches();

  // A stored stencil belongs to its capture dimensions. Do not silently scale
  // it after a renderer resize.
  _plkStencilLuma = null;
  _plkStencilW = 0;
  _plkStencilH = 0;
  _plkStencilVersion++;
}

function _captureLumaBytesFromImageData(data, target) {
  if (_solLittleEndian) {
    const words = new Uint32Array(
      data.buffer,
      data.byteOffset,
      data.byteLength >>> 2
    );
    for (let i = 0; i < words.length; i++) {
      const packed = words[i];
      target[i] = (
        _lumaR[packed & 0xff] +
        _lumaG[(packed >>> 8) & 0xff] +
        _lumaB[(packed >>> 16) & 0xff] + 0.5
      ) | 0;
    }
    return;
  }

  for (let p = 0, i = 0; i < data.length; p++, i += 4) {
    target[p] = (
      _lumaR[data[i]] +
      _lumaG[data[i + 1]] +
      _lumaB[data[i + 2]] + 0.5
    ) | 0;
  }
}

window.capturePipelineLumaStencil = function capturePipelineLumaStencil() {
  if (!gBuf || !gCur) return false;

  const W = gBuf.width, H = gBuf.height;
  if (!W || !H) return false;

  const MAX_W = 640;
  const scale = W > MAX_W ? MAX_W / W : 1;
  const sw = Math.max(1, Math.round(W * scale));
  const sh = Math.max(1, Math.round(H * scale));
  _ensurePipelineLumaCanvas(sw, sh);

  const gCurEl = gCur.elt ?? gCur.drawingContext?.canvas;
  if (!gCurEl) return false;

  const profile = window.__huffProfilerActive === true;
  const started = profile ? performance.now() : 0;

  try {
    copyCanvasFrame(_plkCtx, gCurEl, sw, sh);
    const keyData = _plkCtx.getImageData(0, 0, sw, sh);
    const pixelCount = sw * sh;

    if (!_plkStencilLuma || _plkStencilLuma.length !== pixelCount) {
      _plkStencilLuma = new Uint8Array(pixelCount);
    }

    _captureLumaBytesFromImageData(keyData.data, _plkStencilLuma);
    _plkStencilW = sw;
    _plkStencilH = sh;
    _plkStencilVersion++;
    _plkStencilMaskVersion = -1;

    if (profile) {
      const elapsed = performance.now() - started;
      _plkProfileAdd('stencilCaptureMs', elapsed);
      _plkProfileAdd('stencilCaptureSamples');
      _plkProfileAdd('stencilCaptures');
    }
    return true;
  } catch (err) {
    console.warn('[huff] luma stencil capture failed', err);
    return false;
  }
};

window.getPipelineLumaStencilStatus = function getPipelineLumaStencilStatus() {
  return {
    ready: !!_plkStencilLuma,
    width: _plkStencilW,
    height: _plkStencilH,
    version: _plkStencilVersion,
  };
};

window.resetPipelineLumaKeyState = function resetPipelineLumaKeyState() {
  _invalidatePipelineLumaCaches();
  _plkStencilLuma = null;
  _plkStencilW = 0;
  _plkStencilH = 0;
  _plkStencilVersion++;
};

function _drawPipelineLumaPatch(ctx, safeFadeMode, mix, W, H, sw, sh) {
  ctx.save();
  if (safeFadeMode === 'add') {
    ctx.globalCompositeOperation = 'screen';
  } else {
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = mix;
  if (sw === W && sh === H) ctx.drawImage(_plkCanvas, 0, 0);
  else ctx.drawImage(_plkCanvas, 0, 0, W, H);
  ctx.restore();
}

function applyPipelineLumaKey(
  thresh,
  mix,
  invert,
  sourceFrameSerial = -1,
  gain = 1,
  keySource = 'clean',
  fadeMode = 'xfade',
  cleanup = 0,
  density = 0
) {
  if (mix <= 0 || !gBuf || !gCur) return;

  const W = gBuf.width, H = gBuf.height;
  if (!W || !H) return;

  const MAX_W = 640;
  const scale = W > MAX_W ? MAX_W / W : 1;
  const sw = Math.max(1, Math.round(W * scale));
  const sh = Math.max(1, Math.round(H * scale));
  _ensurePipelineLumaCanvas(sw, sh);

  const gCurEl = gCur.elt ?? gCur.drawingContext?.canvas;
  if (!gCurEl) return;

  const safeGain = Math.max(0.25, Math.min(4, Number.isFinite(gain) ? gain : 1));
  const safeCleanup = Math.max(0, Math.min(1, Number.isFinite(cleanup) ? cleanup : 0));
  const safeDensity = Math.max(0, Math.min(1, Number.isFinite(density) ? density : 0));
  const safeFadeMode = fadeMode === 'add' ? 'add' : 'xfade';
  const profile = window.__huffProfilerActive === true;
  const threshold = (1 - thresh) * 255;
  const shapeLut = _ensurePipelineShapeLut(safeCleanup, safeDensity);
  const ctx = gBuf.drawingContext;

  // STENCIL is explicit: if no stored matte exists, do not silently behave as
  // LIVE. The UI says CAPTURE FIRST and the image remains untouched.
  if (keySource === 'stencil') {
    const stencilReady =
      !!_plkStencilLuma && _plkStencilW === sw && _plkStencilH === sh;
    if (!stencilReady) return;

    if (profile) _plkProfileAdd('stencilReuses');

    const maskRebuild =
      _plkStencilMaskVersion !== _plkStencilVersion ||
      thresh !== _plkStencilMaskThresh ||
      invert !== _plkStencilMaskInvert ||
      safeGain !== _plkStencilMaskGain ||
      safeCleanup !== _plkStencilMaskCleanup ||
      safeDensity !== _plkStencilMaskDensity;

    if (maskRebuild) {
      const phaseStart = profile ? performance.now() : 0;
      _pipelineLumaStencilMask(
        _plkStencilLuma,
        _plkStencilMaskImageData.data,
        threshold,
        invert,
        safeGain,
        shapeLut
      );
      if (profile) {
        _plkProfileAdd('transformMs', performance.now() - phaseStart);
        _plkProfileAdd('transformSamples');
      }

      const uploadStart = profile ? performance.now() : 0;
      _plkStencilMaskCtx.putImageData(_plkStencilMaskImageData, 0, 0);
      if (profile) {
        _plkProfileAdd('uploadMs', performance.now() - uploadStart);
        _plkProfileAdd('uploadSamples');
        _plkProfileAdd('rebuiltFrames');
      }

      _plkStencilMaskVersion = _plkStencilVersion;
      _plkStencilMaskThresh = thresh;
      _plkStencilMaskInvert = invert;
      _plkStencilMaskGain = safeGain;
      _plkStencilMaskCleanup = safeCleanup;
      _plkStencilMaskDensity = safeDensity;
    } else if (profile) {
      _plkProfileAdd('reusedFrames');
    }

    // Current clean RGB passes through the stored mask using Canvas2D only;
    // there is no synchronous readback after the one-shot CAPTURE.
    const presentStart = profile ? performance.now() : 0;
    copyCanvasFrame(_plkCtx, gCurEl, sw, sh);
    _plkCtx.save();
    _plkCtx.globalAlpha = 1;
    _plkCtx.globalCompositeOperation = 'destination-in';
    _plkCtx.drawImage(_plkStencilMaskCanvas, 0, 0, sw, sh);
    _plkCtx.restore();
    _drawPipelineLumaPatch(ctx, safeFadeMode, mix, W, H, sw, sh);
    if (profile) {
      _plkProfileAdd('presentMs', performance.now() - presentStart);
      _plkProfileAdd('presentSamples');
    }
    return;
  }

  // LIVE: restore the pre-Pass-35 single-scratch behavior. The cached patch is
  // rebuilt on decoded source frames or parameter changes and otherwise reused.
  const rebuild =
    sourceFrameSerial !== _plkCacheFrame ||
    thresh !== _plkCacheThresh ||
    invert !== _plkCacheInvert ||
    safeGain !== _plkCacheGain ||
    safeCleanup !== _plkCacheCleanup ||
    safeDensity !== _plkCacheDensity;

  if (rebuild) {
    try {
      let phaseStart = profile ? performance.now() : 0;
      copyCanvasFrame(_plkCtx, gCurEl, sw, sh);
      const patchData = _plkCtx.getImageData(0, 0, sw, sh);
      if (profile) {
        _plkProfileAdd('readbackMs', performance.now() - phaseStart);
        _plkProfileAdd('readbackSamples');
      }

      phaseStart = profile ? performance.now() : 0;
      if (_solLittleEndian) {
        _pipelineLumaPixelsWordsClean(
          patchData.data, threshold, invert, safeGain, shapeLut
        );
      } else {
        _pipelineLumaPixelsBytesClean(
          patchData.data, threshold, invert, safeGain, shapeLut
        );
      }
      if (profile) {
        _plkProfileAdd('transformMs', performance.now() - phaseStart);
        _plkProfileAdd('transformSamples');
      }

      phaseStart = profile ? performance.now() : 0;
      _plkCtx.putImageData(patchData, 0, 0);
      if (profile) {
        _plkProfileAdd('uploadMs', performance.now() - phaseStart);
        _plkProfileAdd('uploadSamples');
        _plkProfileAdd('rebuiltFrames');
      }

      _plkCacheFrame = sourceFrameSerial;
      _plkCacheThresh = thresh;
      _plkCacheInvert = invert;
      _plkCacheGain = safeGain;
      _plkCacheCleanup = safeCleanup;
      _plkCacheDensity = safeDensity;
    } catch (err) {
      // A transient canvas readback failure should skip this key pass, not take
      // down the renderer or leave the control surface appearing wedged.
      console.warn('[huff] live luma key update failed', err);
      _plkCacheFrame = -1;
      return;
    }
  } else if (profile) {
    _plkProfileAdd('reusedFrames');
  }

  const presentStart = profile ? performance.now() : 0;
  _drawPipelineLumaPatch(ctx, safeFadeMode, mix, W, H, sw, sh);
  if (profile) {
    _plkProfileAdd('presentMs', performance.now() - presentStart);
    _plkProfileAdd('presentSamples');
  }
}
