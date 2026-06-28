// effects.js
// Enhancement notes:
//  - All frameRing accesses updated to FrameRing API: frameRing.fromEnd(n)
//    replaces frameRing[frameRing.length - 1 - n]. O(1) in both cases, but
//    fromEnd() is explicit and works correctly without an array reference.
//  - applyFlowWarp pre-allocates Float32Array displacement buffers — avoids
//    per-frame GC pressure from repeated typed-array construction.
//  - applyGlitch does not re-seed random — draw() seeds once per frame.
//  - Cluster physics centers use p5 seeded random() for reproducibility.

// ─── Ring canvas LRU cache ────────────────────────────────────────────────────
// Replaces the single shared _ringCanvas. Caches up to RING_CACHE_SIZE canvases
// keyed by ImageData object identity. When the same ImageData is requested again
// (e.g. the same trail frame accessed by multiple layers) the putImageData upload
// is skipped entirely. Eviction is LRU — least-recently-used entries are dropped
// first, which naturally aligns with how old ring frames age out.

// Cache sized to hold max trail layers + glitch tile frames simultaneously.
// At 8 trail layers + up to 16 unique glitch depth frames, 8 was too small
// and caused repeated putImageData uploads for evicted-then-re-requested frames.
const RING_CACHE_SIZE = 24;
const _ringCacheMap   = new Map(); // ImageData → { canvas, ctx }
const _ringCacheOrder = [];        // oldest-first insertion order

function _getRingCanvas(imgData) {
  if (_ringCacheMap.has(imgData)) {
    // Promote to most-recently-used
    const idx = _ringCacheOrder.indexOf(imgData);
    if (idx !== -1) { _ringCacheOrder.splice(idx, 1); _ringCacheOrder.push(imgData); }
    return _ringCacheMap.get(imgData);
  }

  let entry;
  if (_ringCacheOrder.length >= RING_CACHE_SIZE) {
    // Evict LRU entry — reuse its canvas to avoid a fresh allocation
    const oldest = _ringCacheOrder.shift();
    entry = _ringCacheMap.get(oldest);
    _ringCacheMap.delete(oldest);
    if (entry.canvas.width !== imgData.width || entry.canvas.height !== imgData.height) {
      entry.canvas.width  = imgData.width;
      entry.canvas.height = imgData.height;
    }
  } else {
    const c = document.createElement('canvas');
    c.width = imgData.width; c.height = imgData.height;
    entry = { canvas: c, ctx: c.getContext('2d') };
  }

  entry.ctx.putImageData(imgData, 0, 0);
  _ringCacheMap.set(imgData, entry);
  _ringCacheOrder.push(imgData);
  return entry;
}

function drawRingRegion(target, imgData, sx, sy, sw, sh, dx, dy, dw, dh) {
  const { canvas } = _getRingCanvas(imgData);
  target.drawingContext.drawImage(canvas, sx, sy, sw, sh, dx, dy, dw, dh);
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
// Self-contained — initialises _ringCanvas itself rather than relying on
// drawRingRegion having run first. Safe to call in any order.

// ─── Trails ───────────────────────────────────────────────────────────────────
// Call before scanlines and glitch so ghost frames sit underneath.
//
// When trailLayers > maxBack/step, multiple layers intentionally land on the
// same deep frame. Their alpha values accumulate, creating a bright persistent
// smear at the oldest accessible frame. This is the "dynamic" quality of the
// effect — do not spread layers out to eliminate duplicates.

// Adaptive load guard (same approach as the solarize guard). Every trail layer
// is a full-screen ring composite, and as the ring slides each depth needs a
// full-resolution GPU upload as its frame enters the cache window — that upload
// churn is the fps cost of turning trails on. While the frame period is healthy
// we draw every layer (look unchanged); only when overloaded do we thin the
// layers drawn, cutting the per-frame upload + composite count. The deepest
// layer is always kept so the trail's reach never snaps shorter.
let _trailPrevTs   = 0;
let _trailFrameEMA = 16.7;   // smoothed frame period, ms

function applyTrails() {
  if (!els.trailOn?.checked) return;
  const trailLayers = parseInt(els.trailLayers?.value  ?? '0', 10);
  const trailDepth  = parseFloat(els.trailDepth?.value  ?? '0');
  if (trailLayers <= 0 || trailDepth <= 0 || frameRing.length < 2) return;

  // Smoothed frame period (applyTrails runs once per frame). Thinning layers
  // shortens the frame, so the metric self-corrects toward the threshold.
  const now = performance.now();
  if (_trailPrevTs) _trailFrameEMA += ((now - _trailPrevTs) - _trailFrameEMA) * 0.1;
  _trailPrevTs = now;

  // Layer stride from load:  ≤20ms (≈50fps+) → every layer,
  // 20–30ms → every 2nd layer, >30ms → every 3rd layer.
  let layerStride = 1;
  if (_trailFrameEMA > 30)      layerStride = 3;
  else if (_trailFrameEMA > 20) layerStride = 2;

  const maxBack = Math.max(1, Math.floor((frameRing.length - 1) * trailDepth));
  const step    = Math.max(1, Math.floor(maxBack / trailLayers));
  const ctx     = gBuf.drawingContext;

  // Each kept layer is a single cached drawImage of a historical ring frame — no
  // per-layer pixel readback. (The old trail-local luma key ran a full
  // getImageData/putImageData cycle PER LAYER; it has been removed.)
  for (let g = 1; g <= trailLayers; g++) {
    // Under load, skip intermediate layers but always keep the deepest one so
    // the trail's visual reach is preserved.
    if (layerStride > 1 && g !== trailLayers && (g % layerStride) !== 0) continue;

    const back = Math.min(frameRing.length - 1, g * step);
    const src  = frameRing.fromEnd(back);
    if (!src) continue;

    const alpha = (1 - (g - 1) / trailLayers) * 0.65;
    ctx.globalAlpha = alpha;
    drawRingRegion(gBuf, src, 0, 0, width, height, 0, 0, width, height);
  }

  ctx.globalAlpha = 1.0;
}

// ─── Scanlines ────────────────────────────────────────────────────────────────
// ANGLE — rotates the entire scanline pattern. 0°=horizontal, 90°=vertical,
//         45°=diagonal right, -45°=diagonal left, any value = spin.
//         Canvas context is rotated before drawing bands; all band math runs in
//         the rotated frame so displacement is always perpendicular to band axis.
// FOCUS — biases band positions toward a region of the canvas (0=top/left, 1=bottom/right)
// ROLL  — steady scroll simulating CRT rolling sync loss, independent of DRIFT
// DRIFT — dual-frequency noise: slow sync wander + fast instability jitter

function applyScanlines(density, angleOverride = null, scanPriority = 1.0) {
  if (!els.clusters?.checked) return;

  const scanBands  = parseInt(els.clusterCount?.value ?? '3',  10);
  const bandSize   = parseInt(els.clusterRadius?.value ?? '10', 10);
  if (scanBands <= 0) return;

  // Use spin override if active, otherwise read from the static slider
  const angleDeg = angleOverride !== null
    ? angleOverride
    : parseFloat(els.scanAngle?.value ?? '0');
  const angleRad   = (angleDeg * Math.PI) / 180;
  const bandAlpha  = parseFloat(els.scanAlpha?.value  ?? '0.86') * scanPriority;
  const shiftScale = parseFloat(els.scanShift?.value  ?? '0.12');
  const driftAmt   = parseFloat(els.scanDrift?.value  ?? '1.0');
  const scanGap    = parseInt(els.scanGap?.value       ?? '0',   10);
  const scanSkew   = parseFloat(els.scanSkew?.value   ?? '0');
  const focus      = parseFloat(els.scanFocus?.value  ?? '0.5');
  const roll       = parseFloat(els.scanRoll?.value   ?? '0');

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
  const bSize = Math.max(4, Math.floor(parseInt(els.clusterRadius?.value ?? '10', 10) * 3));

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

function applyGlitch(density = 1, baseDX = 0, baseDY = 0, glitchPriority = 1.0) {
  const block     = parseInt(els.block.value, 10);
  const size      = parseInt(els.glitchSize.value, 10);
  const smearLen  = parseInt(els.glitchSmear.value, 10);
  const corrupt   = parseFloat(els.corrupt.value);
  const tileAlpha = Math.floor(parseFloat(els.glitchAlpha?.value ?? '1.0') * 255);
  const jitter    = parseFloat(els.glitchJitter?.value ?? '1.0');

  const smearAngleDeg = parseFloat(els.glitchSmearAngle?.value ?? '0');
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

  const depth   = parseFloat(els.depth.value);
  const maxBack = Math.max(1, Math.floor((frameRing.length - 1) * depth));

  const depthScatter = parseFloat(els.depthScatter?.value ?? '1.0');
  const baseBack     = Math.max(1, Math.floor(maxBack * (0.3 + 0.7 * noise(nPhaseX * 0.1 + nPhaseY * 0.07))));

  const corruptDrift = parseFloat(els.corruptDrift?.value ?? '0');
  const driftMod     = corruptDrift > 0 ? (noise(nPhaseX * 0.08, nPhaseY * 0.08) * 2 - 1) : 0;
  const corruptMul   = Math.max(0.05, 1.0 + corruptDrift * driftMod);
  let count = Math.max(1, Math.floor(total * corrupt * corruptMul));

  const gap          = parseInt(els.spatialGap.value, 10);
  const useCluTiles  = !!els.clusterTiles?.checked;
  const cluCenters   = parseInt(els.cluCenters?.value   ?? '3',  10);
  const cluSpread    = parseInt(els.cluSpread?.value    ?? '80', 10);
  const cluMinSpread = parseInt(els.cluMinSpread?.value ?? '0',  10);
  const cluBias      = parseFloat(els.cluBias?.value    ?? '0.85');
  const cluDrift     = parseFloat(els.cluDrift?.value   ?? '0');
  const cluSpeed     = parseFloat(els.cluSpeed?.value   ?? '0');
  const cluInertia   = parseFloat(els.cluInertia?.value ?? '0.92');

  const targets = [];

  // ── Spatial index — O(1) gap enforcement ──────────────────────────────────
  // Divide the canvas into cells of size `gap`. Each cell stores the actual
  // tile positions it contains. Checking a candidate only requires scanning
  // the 3×3 neighbourhood of cells, not all existing targets.
  let tryAdd;
  if (gap <= 0) {
    tryAdd = (x, y) => { targets.push([x, y]); return true; };
  } else {
    const cellSize = gap;
    const gridW    = Math.ceil(width  / cellSize) + 2;
    const gridCells = new Map(); // cell key → [[x,y],…]

    tryAdd = (x, y) => {
      const gx = Math.floor(x / cellSize);
      const gy = Math.floor(y / cellSize);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const pts = gridCells.get((gy + dy) * gridW + (gx + dx));
          if (!pts) continue;
          for (const p of pts) {
            const ddx = x - p[0], ddy = y - p[1];
            if (ddx * ddx + ddy * ddy < gap * gap) return false;
          }
        }
      }
      const key  = gy * gridW + gx;
      const cell = gridCells.get(key) ?? [];
      cell.push([x, y]);
      gridCells.set(key, cell);
      targets.push([x, y]);
      return true;
    };
  }

  // Note: randomSeed is set by draw() once per frame; no re-seeding here.
  // applyScanlines ran first and consumed some random state — that ordering is intentional.

  const cluSpeedVar = parseFloat(els.cluSpeedVar?.value ?? '0');
  const cluPulse    = parseFloat(els.cluPulse?.value   ?? '0');

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
      });
    }
    _cluPhysics.length = cluCenters;

    _cluPhysT += cluSpeed * 0.004;

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
          const force = cluPulse * cluSpeed * 0.6;
          c.vx += Math.cos(ang) * force;
          c.vy += Math.sin(ang) * force;
        }
      }
    }

    for (const c of _cluPhysics) {
      const effectiveSpeed = cluSpeed * (c.speedMul ?? 1);
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

      c.x = ((c.x + c.vx) % width  + width)  % width;
      c.y = ((c.y + c.vy) % height + height) % height;
    }
    return _cluPhysics;
  }

  function getStaticCenters() {
    const centers = [];
    for (let i = 0; i < cluCenters; i++) {
      const baseX = Math.floor(random(cols)) * block + (block >> 1);
      const baseY = Math.floor(random(rows)) * block + (block >> 1);
      const driftOff  = cluDrift > 0
        ? (noise(i * 3.7 + nPhaseX * cluDrift * 0.01) - 0.5) * 2 * Math.min(width, height) * 0.5 * cluDrift : 0;
      const driftOffY = cluDrift > 0
        ? (noise(i * 5.3 + nPhaseY * cluDrift * 0.01) - 0.5) * 2 * Math.min(width, height) * 0.5 * cluDrift : 0;
      centers.push({
        x: (baseX + driftOff  + width)  % width,
        y: (baseY + driftOffY + height) % height,
      });
    }
    return centers;
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

    for (const c of centers) {
      for (let i = 0; i < per && targets.length < biasCount; i++) {
        const ang = random(TWO_PI);
        const r   = cluMinSpread + random(Math.max(1, cluSpread - cluMinSpread));
        const x   = (c.x + Math.cos(ang) * r + width)  % width;
        const y   = (c.y + Math.sin(ang) * r + height) % height;
        let ok = tryAdd(Math.floor(x), Math.floor(y)), tries = 0;
        while (!ok && tries++ < 6) {
          const a2 = random(TWO_PI);
          const r2 = cluMinSpread + random(Math.max(1, cluSpread - cluMinSpread));
          ok = tryAdd(
            Math.floor((c.x + Math.cos(a2) * r2 + width)  % width),
            Math.floor((c.y + Math.sin(a2) * r2 + height) % height)
          );
        }
      }
    }
    let guard = 0;
    while (targets.length < count && guard++ < count * 4)
      tryAdd(Math.floor(random(cols)) * block, Math.floor(random(rows)) * block);
  } else {
    let attempts = 0;
    while (targets.length < count && attempts++ < count * 8)
      tryAdd(Math.floor(random(cols)) * block, Math.floor(random(rows)) * block);
  }

  // ── Blit tiles ─────────────────────────────────────────────────────────────
  if (frameRing.length === 0 || maxBack <= 0) return;

  const ctx = gBuf.drawingContext;
  const prevAlpha = ctx.globalAlpha;

  // tileAlpha is constant for all tiles — set once, restore once.
  // glitchPriority scales contribution relative to scanlines (A/B mix).
  ctx.globalAlpha = (tileAlpha / 255) * glitchPriority;

  for (let i = 0; i < targets.length; i++) {
    let [cx, cy] = targets[i];

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
// Pre-allocates Float32Array displacement buffers to avoid per-frame GC pressure.
// Buffers are only reallocated when the grid dimensions change (scale or canvas resize).

let _flowDx = null, _flowDy = null;
let _flowBufCols = 0, _flowBufRows = 0;

function _ensureFlowBuffers(cols, rows) {
  const n = cols * rows;
  if (!_flowDx || _flowBufCols !== cols || _flowBufRows !== rows) {
    _flowDx = new Float32Array(n);
    _flowDy = new Float32Array(n);
    _flowBufCols = cols;
    _flowBufRows = rows;
  }
}

function applyFlowWarp(src, dst, strength = 6, scale = 80, pulse = 0, implode = 0, speed = 1, turb = 0, swirl = 0) {
  dst.clear();

  let srcFrame = src;
  if (pulse > 0 && frameRing.length > pulse) {
    const ringFrame = frameRing.fromEnd(pulse);
    if (ringFrame) srcFrame = { _isRingData:true, data:ringFrame };
  }

  const cell = Math.max(8, scale | 0);
  const off  = strength;
  // Speed multiplier on time — at speed=0 the field is completely frozen.
  const t    = frameCount * 0.005 * Math.max(0, speed);
  const w = width, h = height;
  const cx2 = w * 0.5, cy2 = h * 0.5;

  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  _ensureFlowBuffers(cols, rows);

  let idx = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x  = col * cell;
      const y  = row * cell;
      const nx = (x + 0.5 * cell) / w * 2.0;
      const ny = (y + 0.5 * cell) / h * 2.0;

      // Primary noise octave
      let a = noise(nx * 0.9 + t, ny * 0.9) * TWO_PI * 2.0;

      // Turbulence: second octave at 4× frequency, half amplitude
      // Blends in fractional Brownian noise for organic complexity
      if (turb > 0) {
        const a2 = noise(nx * 3.6 + t * 1.3 + 100, ny * 3.6 + t * 0.9) * TWO_PI * 2.0;
        a = a * (1 - turb * 0.5) + a2 * (turb * 0.5);
      }

      let dx2 = Math.cos(a) * off;
      let dy2 = Math.sin(a) * off;

      // Implode (positive) / Explode (negative) — bidirectional on one slider
      if (implode !== 0) {
        const px = x + 0.5 * cell, py = y + 0.5 * cell;
        const vx = cx2 - px, vy = cy2 - py;
        const L  = Math.hypot(vx, vy) || 1;
        dx2 += (vx / L) * off * implode;
        dy2 += (vy / L) * off * implode;
      }

      // Swirl: rotate displacement vector by angle proportional to distance from center
      // Positive = clockwise spiral, negative = counterclockwise
      if (swirl !== 0) {
        const px  = x + 0.5 * cell, py = y + 0.5 * cell;
        const ang = Math.atan2(py - cy2, px - cx2) * swirl;
        const cs  = Math.cos(ang), sn = Math.sin(ang);
        const rx  = dx2 * cs - dy2 * sn;
        const ry  = dx2 * sn + dy2 * cs;
        dx2 = rx; dy2 = ry;
      }

      _flowDx[idx] = dx2;
      _flowDy[idx] = dy2;
      idx++;
    }
  }

  const dctx = dst.drawingContext;
  dctx.save();
  idx = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x     = col * cell;
      const y     = row * cell;
      const tileW = Math.min(cell, w - x);
      const tileH = Math.min(cell, h - y);
      const sx2   = Math.max(0, Math.min(w - tileW, Math.floor(x + _flowDx[idx])));
      const sy2   = Math.max(0, Math.min(h - tileH, Math.floor(y + _flowDy[idx])));
      idx++;

      if (srcFrame?._isRingData) {
        drawRingRegion(dst, srcFrame.data, sx2, sy2, tileW, tileH, x, y, tileW, tileH);
      } else {
        const srcEl = srcFrame?.elt ?? srcFrame?.drawingContext?.canvas ?? null;
        if (!srcEl) continue;
        dctx.drawImage(srcEl, sx2, sy2, tileW, tileH, x, y, tileW, tileH);
      }
    }
  }
  dctx.restore();
}

// ─── Solarize ─────────────────────────────────────────────────────────────────
// Downsamples to max 640px wide before pixel math, then scales back up.
// ~4–16x faster on large screens / Windows.

let _solCanvas = null, _solCtx = null;
let _solOut    = null, _solOutCtx = null;
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
    _solCtx.clearRect(0, 0, sw, sh);
    _solCtx.drawImage(srcCanvas, 0, 0, sw, sh);

    const imgData = _solCtx.getImageData(0, 0, sw, sh);
    const pix = imgData.data;
    const t   = thresh * 255;
    const a   = Math.max(0, Math.min(1, amount));

    for (let i = 0; i < pix.length; i += 4) {
      const r = pix[i], g = pix[i + 1], b = pix[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > t) {
        pix[i]     = Math.min(255, Math.max(0, (r + (255 - r - r) * a) * solR + 0.5) | 0);
        pix[i + 1] = Math.min(255, Math.max(0, (g + (255 - g - g) * a) * solG + 0.5) | 0);
        pix[i + 2] = Math.min(255, Math.max(0, (b + (255 - b - b) * a) * solB + 0.5) | 0);
      }
    }
    _solCtx.putImageData(imgData, 0, 0);

    _solOutCtx.clearRect(0, 0, BW, BH);
    _solOutCtx.drawImage(_solCanvas, 0, 0, BW, BH);
    _solHasCache = true;
  }

  buf.drawingContext.clearRect(0, 0, BW, BH);
  buf.drawingContext.drawImage(_solOut, 0, 0);
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
let _plkPixBuf = null;

function applyPipelineLumaKey(thresh, mix, invert) {
  if (mix <= 0) return;

  const W = gBuf.width, H = gBuf.height;
  const MAX_W  = 640;
  const scale  = W > MAX_W ? MAX_W / W : 1;
  const sw     = Math.max(1, Math.round(W * scale));
  const sh     = Math.max(1, Math.round(H * scale));
  const n      = sw * sh * 4;

  if (!_plkCanvas || _plkCanvas.width !== sw || _plkCanvas.height !== sh) {
    _plkCanvas = document.createElement('canvas');
    _plkCanvas.width = sw; _plkCanvas.height = sh;
    _plkCtx = _plkCanvas.getContext('2d', { willReadFrequently: true });
    _plkPixBuf = null;
  }
  if (!_plkBufCanvas || _plkBufCanvas.width !== sw || _plkBufCanvas.height !== sh) {
    _plkBufCanvas = document.createElement('canvas');
    _plkBufCanvas.width = sw; _plkBufCanvas.height = sh;
    _plkBufCtx = _plkBufCanvas.getContext('2d');
  }
  if (!_plkPixBuf || _plkPixBuf.length !== n) _plkPixBuf = new Uint8ClampedArray(n);

  // Read gCur (clean source) for luma sampling
  const gCurEl = gCur.elt ?? gCur.drawingContext?.canvas;
  if (!gCurEl) return;
  _plkCtx.drawImage(gCurEl, 0, 0, sw, sh);
  const srcData = _plkCtx.getImageData(0, 0, sw, sh);
  const sp = srcData.data;

  // Build luma mask: alpha = how much glitch should show at each pixel
  // reveal=1 → keep gBuf (glitch), reveal=0 → replace with gCur (clean)
  const t = (1 - thresh) * 255;
  const rollRange = Math.max(1, 64);
  for (let i = 0; i < n; i += 4) {
    const lum    = 0.299 * sp[i] + 0.587 * sp[i+1] + 0.114 * sp[i+2];
    const roll   = Math.max(0, Math.min(1, (lum - t) / rollRange));
    const reveal = invert ? (1 - roll) : roll;
    // Inverted alpha: opaque where CLEAN should show, transparent where GLITCH shows
    _plkPixBuf[i]   = 255;
    _plkPixBuf[i+1] = 255;
    _plkPixBuf[i+2] = 255;
    _plkPixBuf[i+3] = ((1 - reveal) * 255 + 0.5) | 0;
  }
  _plkCtx.putImageData(new ImageData(_plkPixBuf, sw, sh), 0, 0);

  // Clip gCur to the "clean" regions using the inverted mask
  const gBufEl = gBuf.elt ?? gBuf.drawingContext?.canvas;
  if (!gBufEl) return;
  _plkBufCtx.clearRect(0, 0, sw, sh);
  _plkBufCtx.drawImage(gCurEl, 0, 0, sw, sh);         // clean source
  _plkBufCtx.globalCompositeOperation = 'destination-in';
  _plkBufCtx.drawImage(_plkCanvas, 0, 0, sw, sh);      // keep only clean areas
  _plkBufCtx.globalCompositeOperation = 'source-over';

  // Overlay the clean-area patch onto gBuf at mix strength.
  // Glitch areas are untouched — gBuf content (trails, feedback) preserved.
  const ctx = gBuf.drawingContext;
  ctx.save();
  ctx.globalAlpha = mix;
  ctx.drawImage(_plkBufCanvas, 0, 0, W, H);
  ctx.restore();
}
