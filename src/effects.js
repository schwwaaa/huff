// effects.js
// Enhancement notes:
//  - All frameRing accesses updated to FrameRing API: frameRing.fromEnd(n)
//    replaces frameRing[frameRing.length - 1 - n]. O(1) in both cases, but
//    fromEnd() is explicit and works correctly without an array reference.
//  - applyFlowWarp computes and draws each tile in one pass — no displacement
//    arrays and no second grid traversal.
//  - Solarize uses cached channel lookup tables; pipeline luma masks are rebuilt
//    only when the decoded source frame or key parameters change.
//  - applyGlitch does not re-seed random — draw() seeds once per frame.
//  - Cluster physics centers use p5 seeded random() for reproducibility.
//  - Glitch tile placement reuses typed target/grid buffers and persistent
//    Float64 cluster offsets instead of allocating arrays, Maps, and objects
//    every frame.

// ─── Temporal ring drawing ───────────────────────────────────────────────────
// FrameRing stores reusable canvas snapshots, so historical frames remain
// directly drawable. This avoids the old getImageData() readback on capture and
// the later putImageData() upload/cache needed before every temporal sample.

function drawRingRegion(target, frameCanvas, sx, sy, sw, sh, dx, dy, dw, dh) {
  if (!frameCanvas) return;
  target.drawingContext.drawImage(frameCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
}

function copyCanvasFrame(ctx, source, width, height) {
  if (!ctx || !source || width <= 0 || height <= 0) return;
  const prevOp    = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;
  try {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(source, 0, 0, width, height);
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

function applyScanlines(density, angleOverride = null, scanPriority = 1.0, state = window.HUFF_RENDER_STATE) {
  const rs = state || window.HUFF_RENDER_STATE || {};
  if (!rs.clusters) return;

  const scanBands  = Math.trunc(rs.clusterCount);
  if (scanBands <= 0) return;

  // Use spin override if active, otherwise read from the static slider
  const angleDeg = angleOverride !== null
    ? angleOverride
    : rs.scanAngle;
  const angleRad   = (angleDeg * Math.PI) / 180;
  const bandAlpha  = rs.scanAlpha * scanPriority;
  const shiftScale = rs.scanShift;
  const driftAmt   = rs.scanDrift;
  const scanGap    = Math.trunc(rs.scanGap);
  const scanSkew   = rs.scanSkew;
  const focus      = rs.scanFocus;
  const roll       = rs.scanRoll;

  const phX = nPhaseScanX;
  const phY = nPhaseScanY;

  // The span needed to cover the full canvas perpendicular to the band axis
  // at angle θ is |W·sin θ| + |H·cos θ|. At 0° this equals H, at 90° equals W,
  // at 45° on a 16:9 canvas it's ~1.3× H. Without this, rotated bands only fill
  // the center strip and leave the corners empty.
  const absS = Math.abs(Math.sin(angleRad));
  const absC = Math.abs(Math.cos(angleRad));
  const dim   = width * absS + height * absC;   // full rotated span
  const cross = width * absC + height * absS;   // displacement axis span
  const bSize = Math.max(4, Math.floor(Math.trunc(rs.clusterRadius) * 3));

  // Roll offset scrolls bands along the full rotated span
  const rollOffset = (phY * roll * 80) % dim;

  const ctx       = gBuf.drawingContext;
  const prevAlpha = ctx.globalAlpha;
  const gCurCvs   = gCur.drawingContext.canvas;

  // Rotate around canvas centre. We also translate so the band coordinate
  // system is centred on the canvas — bands at position dim/2 appear at the
  // visual centre regardless of angle.
  const rotated = Math.abs(angleRad) > 0.001;
  ctx.save();
  ctx.translate(gBuf.width / 2, gBuf.height / 2);
  if (rotated) ctx.rotate(angleRad);
  // Offset so that band Y=0 is at -dim/2 from canvas centre
  ctx.translate(-gBuf.width / 2, -dim / 2);

  for (let n = 0; n < scanBands; n++) {
    const slowDrift  = noise(n * 3.7 + phY * 0.25 * driftAmt) * dim;
    const fastJitter = (noise(n * 11.3 + phY * 1.8 * driftAmt) - 0.5) * dim * 0.12 * driftAmt;

    // Focus bias within the full rotated span
    const biased = slowDrift * (1 - Math.abs(focus - 0.5) * 1.4)
                 + (focus * dim) * Math.abs(focus - 0.5) * 1.4
                 + fastJitter;

    const rawPos  = ((biased + rollOffset) % dim + dim) % dim;
    const gridPos = scanGap > 0
      ? Math.floor(rawPos / Math.max(1, bSize + scanGap)) * (bSize + scanGap)
      : rawPos;

    const bStart = Math.max(0, Math.floor(gridPos));
    const bEnd   = Math.min(dim, bStart + bSize);
    const bLen   = bEnd - bStart;
    if (bLen <= 0) continue;

    const skewOffset = Math.floor(scanSkew * bStart);
    const shift = Math.floor(
      map(noise(n * 2.3 + phX * 0.5), 0, 1, -cross * shiftScale, cross * shiftScale)
    ) + skewOffset;

    const srcOff = Math.max(0, shift < 0 ? -shift : 0);
    const dstOff = Math.max(0, shift > 0 ?  shift : 0);
    const bCross = cross - Math.abs(shift);
    if (bCross <= 0) continue;

    ctx.globalAlpha = bandAlpha;
    // Source coordinates: sample from gCur at the unshifted position
    // (srcOff accounts for horizontal shift direction)
    ctx.drawImage(gCurCvs, srcOff, bStart, bCross, bLen, dstOff, bStart, bCross, bLen);
  }

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
    dxUnit = map(noise(nPhaseX), 0, 1, -1, 1);
    dyUnit = map(noise(nPhaseY), 0, 1, -1, 1);
  } else {
    const rad = (smearAngleDeg * Math.PI / 180)
      + map(noise(nPhaseX * 0.5), 0, 1, -Math.PI / 6, Math.PI / 6);
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
  function getPhysicsCenters() {
    while (_cluPhysics.length < cluCenters) {
      _cluPhysics.push({
        x: random(width),
        y: random(height),
        vx: (random() - 0.5) * 2,
        vy: (random() - 0.5) * 2,
        noiseOffX: random(1000),
        noiseOffY: random(1000),
        // Per-center speed multiplier — randomized once on creation so each
        // center has its own characteristic speed even at the same cluSpeed.
        // cluSpeedVar=0 → all centers same speed; =1 → range 0×–2× of cluSpeed.
        speedMul: 1 + (random() - 0.5) * 2 * cluSpeedVar,
        tileAngles: new Float64Array(0),
        tileRadii:  new Float64Array(0),
        tileCount: 0,   // persistent center-relative offsets (COHERENCE)
      });
    }
    _cluPhysics.length = cluCenters;

    _cluPhysT += cluSteer * 0.004;   // heading-sweep rate — decoupled from travel SPEED

    // Pulse: every pulseInterval seconds, kick all centers with a random
    // velocity burst. Creates sudden lurching motion that steady inertia alone
    // can't produce. cluPulse=0 disables; higher values = stronger kicks.
    if (cluPulse > 0) {
      const pulseInterval = Math.max(0.2, 3 - cluPulse * 0.25); // 3s down to 0.5s
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
        // Reflect position and velocity at the edges — momentum (INERTIA) carries
        // the center away from the wall, giving real side-to-side travel with no
        // teleport. Reversed heading persists until steering eases it back.
        if      (nxp < 0)      { c.x = -nxp;             c.vx = -c.vx; }
        else if (nxp > width)  { c.x = 2 * width - nxp;  c.vx = -c.vx; }
        else                   { c.x = nxp; }
        if      (nyp < 0)      { c.y = -nyp;             c.vy = -c.vy; }
        else if (nyp > height) { c.y = 2 * height - nyp; c.vy = -c.vy; }
        else                   { c.y = nyp; }
      } else {
        c.x = (nxp % width  + width)  % width;
        c.y = (nyp % height + height) % height;
      }
    }
    return _cluPhysics;
  }



  // ── Tile placement ─────────────────────────────────────────────────────────
  if (useCluTiles && cluCenters > 0) {
    // Always use physics centres. At cluSpeed=0 the desired velocity is zero
    // so centres gradually stop and hold position via inertia.
    // getStaticCenters() called random() every frame causing re-randomisation
    // even at speed=0 — that looked like movement when there should be none.
    const centers = getPhysicsCenters();
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

  // tileAlpha is constant for all tiles — set once, restore once.
  // glitchPriority scales contribution relative to scanlines (A/B mix).
  ctx.globalAlpha = (tileAlpha / 255) * glitchPriority;

  for (let i = 0; i < targets.count; i++) {
    let cx = targets.x[i];
    let cy = targets.y[i];

    const ox = Math.floor(map(noise(nPhaseX + i * 0.013), 0, 1, -block * 2, block * 2) * jitter);
    const oy = Math.floor(map(noise(nPhaseY + i * 0.017), 0, 1, -block * 2, block * 2) * jitter);
    cx = (cx + ox + width)  % width;
    cy = (cy + oy + height) % height;

    const w = Math.min(block * (size / 20), width  - cx);
    const h = Math.min(block * (size / 20), height - cy);
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
    const src       = frameRing.fromEnd(idx);
    if (!src) continue;

    drawRingRegion(gBuf, src, cx, cy, w, h, dstX, dstY, w, h);

    if (smearLen > 0) {
      for (let s = 1; s <= smearLen; s++) {
        const sx2 = Math.max(0, Math.min(width  - w, dstX + Math.round(dxUnit * s * block)));
        const sy2 = Math.max(0, Math.min(height - h, dstY + Math.round(dyUnit * s * block)));
        drawRingRegion(gBuf, src, cx, cy, w, h, sx2, sy2, w, h);
      }
    }
  }

  ctx.globalAlpha = prevAlpha;
}

// ─── Flow warp ────────────────────────────────────────────────────────────────
// Computes displacement and draws the tile immediately. The source and destination
// are always distinct surfaces, so there is no need to retain a full displacement
// field or walk the grid a second time.

function applyFlowWarp(src, dst, strength = 6, scale = 80, pulse = 0, implode = 0, speed = 1, turb = 0, swirl = 0, spread = 1) {
  dst.clear();

  let srcFrame = src;
  if (pulse > 0 && frameRing.length > pulse) {
    const ringFrame = frameRing.fromEnd(pulse);
    if (ringFrame) srcFrame = ringFrame;
  }

  const srcEl = (srcFrame instanceof HTMLCanvasElement)
    ? srcFrame
    : (srcFrame?.elt ?? srcFrame?.drawingContext?.canvas ?? null);
  if (!srcEl) return;

  const cell = Math.max(8, scale | 0);
  const off  = strength;
  // SPEED is exponential (pow 1.6): fine, crawling control at the low end and a
  // genuinely fast top end. speed=1 maps to the original tempo; speed=0 freezes.
  const t    = frameCount * 0.005 * Math.pow(Math.max(0, speed), 1.6);
  const w = width, h = height;
  const cx2 = w * 0.5, cy2 = h * 0.5;

  // SPREAD scales the flow-field noise frequency: low = large coherent zones all
  // drifting together (watery), high = many small independent eddies.
  const freq = 0.9 * Math.max(0.05, spread);
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);

  const dctx = dst.drawingContext;
  dctx.save();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x  = col * cell;
      const y  = row * cell;
      const nx = (x + 0.5 * cell) / w * 2.0;
      const ny = (y + 0.5 * cell) / h * 2.0;

      let a = noise(nx * freq + t, ny * freq) * TWO_PI * 2.0;
      if (turb > 0) {
        const a2 = noise(nx * freq * 4 + t * 1.3 + 100, ny * freq * 4 + t * 0.9) * TWO_PI * 2.0;
        a = a * (1 - turb * 0.5) + a2 * (turb * 0.5);
      }

      let dx2 = Math.cos(a) * off;
      let dy2 = Math.sin(a) * off;

      if (implode !== 0) {
        const px = x + 0.5 * cell, py = y + 0.5 * cell;
        const vx = cx2 - px, vy = cy2 - py;
        const L  = Math.hypot(vx, vy) || 1;
        dx2 += (vx / L) * off * implode;
        dy2 += (vy / L) * off * implode;
      }

      if (swirl !== 0) {
        const px  = x + 0.5 * cell, py = y + 0.5 * cell;
        const ang = Math.atan2(py - cy2, px - cx2) * swirl;
        const cs  = Math.cos(ang), sn = Math.sin(ang);
        const rx  = dx2 * cs - dy2 * sn;
        const ry  = dx2 * sn + dy2 * cs;
        dx2 = rx; dy2 = ry;
      }

      // The previous displacement arrays were Float32Array-backed. Preserve that
      // quantization exactly before flooring so the visual tile selection does
      // not shift at floating-point boundaries.
      dx2 = Math.fround(dx2);
      dy2 = Math.fround(dy2);
      const tileW = Math.min(cell, w - x);
      const tileH = Math.min(cell, h - y);
      const sx2   = Math.max(0, Math.min(w - tileW, Math.floor(x + dx2)));
      const sy2   = Math.max(0, Math.min(h - tileH, Math.floor(y + dy2)));
      dctx.drawImage(srcEl, sx2, sy2, tileW, tileH, x, y, tileW, tileH);
    }
  }
  dctx.restore();
}

// ─── Solarize ─────────────────────────────────────────────────────────────────
// Downsamples to max 640px wide before pixel math, then scales back up.
// ~4–16x faster on large screens / Windows.

let _solCanvas = null, _solCtx = null;
let _solOut    = null, _solOutCtx = null;
const _solRMap = new Uint8ClampedArray(256);
const _solGMap = new Uint8ClampedArray(256);
const _solBMap = new Uint8ClampedArray(256);
let _solMapKey = '';

function _refreshSolarizeMaps(amount, solR, solG, solB) {
  const key = `${amount}|${solR}|${solG}|${solB}`;
  if (key === _solMapKey) return;
  _solMapKey = key;
  const a = Math.max(0, Math.min(1, amount));
  for (let i = 0; i < 256; i++) {
    const inverted = i + (255 - i - i) * a;
    _solRMap[i] = Math.floor(Math.min(255, Math.max(0, inverted * solR + 0.5)));
    _solGMap[i] = Math.floor(Math.min(255, Math.max(0, inverted * solG + 0.5)));
    _solBMap[i] = Math.floor(Math.min(255, Math.max(0, inverted * solB + 0.5)));
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
// processes solarize every 2nd/3rd frame, re-blitting the cached full-res result
// (_solOut) on the frames it skips. At healthy frame rates it processes every
// frame, so the output is identical to before — the easing only kicks in exactly
// when the machine is already dropping frames, trading a little solarize update
// rate for stable audio.
let _solPrevTs   = 0;
let _solFrameEMA = 16.7;   // smoothed frame period, ms
let _solPhase    = 0;
let _solHasCache = false;

function applySolarize(buf, thresh = 0.5, amount = 1.0, solR = 1.0, solG = 1.0, solB = 1.0) {
  const BW = buf.width, BH = buf.height;
  const MAX_W = 640;
  const scale = BW > MAX_W ? MAX_W / BW : 1;
  const sw = Math.max(1, Math.round(BW * scale));
  const sh = Math.max(1, Math.round(BH * scale));

  if (!_solCanvas || _solCanvas.width !== sw || _solCanvas.height !== sh) {
    _solCanvas = document.createElement('canvas'); _solCanvas.width = sw; _solCanvas.height = sh;
    _solCtx    = _solCanvas.getContext('2d', { willReadFrequently:true });
  }
  if (!_solOut || _solOut.width !== BW || _solOut.height !== BH) {
    _solOut    = document.createElement('canvas'); _solOut.width = BW; _solOut.height = BH;
    _solOutCtx = _solOut.getContext('2d');
    _solHasCache = false;   // fresh canvas — must process before it can be reused
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

  if (doProcess) {
    const srcCanvas = buf.elt || buf.drawingContext.canvas;
    copyCanvasFrame(_solCtx, srcCanvas, sw, sh);

    const imgData = _solCtx.getImageData(0, 0, sw, sh);
    const pix = imgData.data;
    const t   = thresh * 255;
    _refreshSolarizeMaps(amount, solR, solG, solB);

    for (let i = 0; i < pix.length; i += 4) {
      const r = pix[i], g = pix[i + 1], b = pix[i + 2];
      const lum = _lumaR[r] + _lumaG[g] + _lumaB[b];
      if (lum > t) {
        pix[i]     = _solRMap[r];
        pix[i + 1] = _solGMap[g];
        pix[i + 2] = _solBMap[b];
      }
    }
    _solCtx.putImageData(imgData, 0, 0);

    copyCanvasFrame(_solOutCtx, _solCanvas, BW, BH);
    _solHasCache = true;
  }

  copyCanvasFrame(buf.drawingContext, _solOut, BW, BH);
}

// ─── Symmetry ─────────────────────────────────────────────────────────────────

function applySymmetry(src, dst, mode = 'v', pos = 0.5) {
  const w  = dst.width, h = dst.height;
  const x0 = Math.max(0, Math.min(w, Math.round(w * pos)));
  const y0 = Math.max(0, Math.min(h, Math.round(h * pos)));

  dst.clear();
  dst.imageMode(CORNER);
  dst.image(src, 0, 0, w, h);

  const ctx = dst.drawingContext;
  if (!ctx) return;

  if (mode === 'v' || mode === 'hv') {
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, 0, w - x0, h); ctx.clip();
    dst.push(); dst.translate(2 * x0, 0); dst.scale(-1, 1);
    dst.image(src, 0, 0, w, h);
    dst.pop(); ctx.restore();
  }
  if (mode === 'h' || mode === 'hv') {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y0, w, h - y0); ctx.clip();
    dst.push(); dst.translate(0, 2 * y0); dst.scale(1, -1);
    dst.image(src, 0, 0, w, h);
    dst.pop(); ctx.restore();
  }
}

// ─── Pipeline Luma Key ────────────────────────────────────────────────────────
// Applied in draw() between applyGlitch() and applyScanlines().
// Gates how much of the glitch output (gBuf) shows through based on the
// luminance of the clean source (gCur).
//
// thresh=0 → nothing keyed (all glitch shows) 
// thresh=1 → everything keyed (all clean shows)
// invert   → flips: dark areas show glitch, bright areas stay clean
//
// Operates at 640px max width for performance.

let _plkCanvas = null, _plkCtx = null;
let _plkBufCanvas = null, _plkBufCtx = null;
let _plkCacheFrame = -1;
let _plkCacheThresh = NaN;
let _plkCacheInvert = false;

function applyPipelineLumaKey(thresh, mix, invert, sourceFrameSerial = -1) {
  if (mix <= 0) return;

  const W = gBuf.width, H = gBuf.height;
  const MAX_W  = 640;
  const scale  = W > MAX_W ? MAX_W / W : 1;
  const sw     = Math.max(1, Math.round(W * scale));
  const sh     = Math.max(1, Math.round(H * scale));
  if (!_plkCanvas || _plkCanvas.width !== sw || _plkCanvas.height !== sh) {
    _plkCanvas = document.createElement('canvas');
    _plkCanvas.width = sw; _plkCanvas.height = sh;
    _plkCtx = _plkCanvas.getContext('2d', { willReadFrequently: true });
    _plkCacheFrame = -1;
  }
  if (!_plkBufCanvas || _plkBufCanvas.width !== sw || _plkBufCanvas.height !== sh) {
    _plkBufCanvas = document.createElement('canvas');
    _plkBufCanvas.width = sw; _plkBufCanvas.height = sh;
    _plkBufCtx = _plkBufCanvas.getContext('2d');
    _plkCacheFrame = -1;
  }

  const gCurEl = gCur.elt ?? gCur.drawingContext?.canvas;
  if (!gCurEl) return;

  // The mask and masked clean patch depend only on the decoded clean frame,
  // threshold, invert state, and dimensions. At a 60 Hz render rate with a
  // 30 fps source this avoids rebuilding the same pixel mask twice.
  const rebuild = sourceFrameSerial !== _plkCacheFrame
    || thresh !== _plkCacheThresh
    || invert !== _plkCacheInvert;

  if (rebuild) {
    copyCanvasFrame(_plkCtx, gCurEl, sw, sh);
    const maskData = _plkCtx.getImageData(0, 0, sw, sh);
    const sp = maskData.data;
    const n = sp.length;

    // Build luma mask: alpha = how much glitch should show at each pixel.
    const t = (1 - thresh) * 255;
    const rollRange = 64;
    for (let i = 0; i < n; i += 4) {
      const r = sp[i], g = sp[i + 1], b = sp[i + 2];
      const lum    = _lumaR[r] + _lumaG[g] + _lumaB[b];
      const roll   = Math.max(0, Math.min(1, (lum - t) / rollRange));
      const reveal = invert ? (1 - roll) : roll;
      sp[i] = sp[i + 1] = sp[i + 2] = 255;
      sp[i + 3] = ((1 - reveal) * 255 + 0.5) | 0;
    }
    _plkCtx.putImageData(maskData, 0, 0);

    copyCanvasFrame(_plkBufCtx, gCurEl, sw, sh);
    _plkBufCtx.globalCompositeOperation = 'destination-in';
    _plkBufCtx.drawImage(_plkCanvas, 0, 0, sw, sh);
    _plkBufCtx.globalCompositeOperation = 'source-over';

    _plkCacheFrame  = sourceFrameSerial;
    _plkCacheThresh = thresh;
    _plkCacheInvert = invert;
  }

  // Overlay the cached clean-area patch onto gBuf at mix strength.
  // Glitch areas are untouched — gBuf content (trails, feedback) preserved.
  const ctx = gBuf.drawingContext;
  ctx.save();
  ctx.globalAlpha = mix;
  ctx.drawImage(_plkBufCanvas, 0, 0, W, H);
  ctx.restore();
}
