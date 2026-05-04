// effects.js
// Enhancement notes:
//  - All frameRing accesses updated to FrameRing API: frameRing.fromEnd(n)
//    replaces frameRing[frameRing.length - 1 - n]. O(1) in both cases, but
//    fromEnd() is explicit and works correctly without an array reference.
//  - applyFlowWarp pre-allocates Float32Array displacement buffers — avoids
//    per-frame GC pressure from repeated typed-array construction.
//  - blitTrailLumaKeyed is fully self-contained (no dependency on drawRingRegion).
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

let _trailLumaCanvas = null, _trailLumaCtx = null;
const TRAIL_LUMA_MAX_W = 640;

function blitTrailLumaKeyed(ctx, imgData, alpha, lumaThresh) {
  const w = imgData.width, h = imgData.height;
  const scale = w > TRAIL_LUMA_MAX_W ? TRAIL_LUMA_MAX_W / w : 1;
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));

  if (!_trailLumaCanvas || _trailLumaCanvas.width !== sw || _trailLumaCanvas.height !== sh) {
    _trailLumaCanvas        = document.createElement('canvas');
    _trailLumaCanvas.width  = sw;
    _trailLumaCanvas.height = sh;
    _trailLumaCtx = _trailLumaCanvas.getContext('2d', { willReadFrequently:true });
  }

  // Use the shared LRU ring cache instead of a private _ringCanvas
  const { canvas: ringCvs } = _getRingCanvas(imgData);

  _trailLumaCtx.clearRect(0, 0, sw, sh);
  _trailLumaCtx.drawImage(ringCvs, 0, 0, sw, sh);

  const imageData = _trailLumaCtx.getImageData(0, 0, sw, sh);
  const pix = imageData.data;
  const t   = lumaThresh * 255;
  for (let i = 0; i < pix.length; i += 4) {
    const lum = 0.299 * pix[i] + 0.587 * pix[i + 1] + 0.114 * pix[i + 2];
    if (lum < t) {
      pix[i + 3] = 0;
    } else {
      const roll = Math.min(1, (lum - t) / Math.max(1, 255 - t));
      pix[i + 3] = Math.round(roll * alpha * 255);
    }
  }
  _trailLumaCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(_trailLumaCanvas, 0, 0, w, h);
}

// ─── Trails ───────────────────────────────────────────────────────────────────
// Call before scanlines and glitch so ghost frames sit underneath.
//
// When trailLayers > maxBack/step, multiple layers intentionally land on the
// same deep frame. Their alpha values accumulate, creating a bright persistent
// smear at the oldest accessible frame. This is the "dynamic" quality of the
// effect — do not spread layers out to eliminate duplicates.

function applyTrails() {
  if (!els.trailOn?.checked) return;
  const trailLayers = parseInt(els.trailLayers?.value  ?? '0', 10);
  const trailDepth  = parseFloat(els.trailDepth?.value  ?? '0');
  const lumaKey     = parseFloat(els.trailLumaKey?.value ?? '0');
  if (trailLayers <= 0 || trailDepth <= 0 || frameRing.length < 2) return;

  const maxBack = Math.max(1, Math.floor((frameRing.length - 1) * trailDepth));
  const step    = Math.max(1, Math.floor(maxBack / trailLayers));
  const ctx     = gBuf.drawingContext;

  for (let g = 1; g <= trailLayers; g++) {
    const back = Math.min(frameRing.length - 1, g * step);
    const src  = frameRing.fromEnd(back);
    if (!src) continue;

    const alpha = (1 - (g - 1) / trailLayers) * 0.65;

    // Reset to 1.0 before every layer.
    // blitTrailLumaKeyed bakes alpha into pixel data then calls ctx.drawImage —
    // a non-1.0 globalAlpha here multiplies in again and nerfes luma key output.
    ctx.globalAlpha = 1.0;

    if (lumaKey > 0) {
      blitTrailLumaKeyed(ctx, src, alpha, lumaKey);
    } else {
      ctx.globalAlpha = alpha;
      drawRingRegion(gBuf, src, 0, 0, width, height, 0, 0, width, height);
    }
  }

  ctx.globalAlpha = 1.0;
}

// ─── Scanlines ────────────────────────────────────────────────────────────────
// ORDER DEPENDENCY: draw() calls randomSeed(baseSeed + frameCount) before this.
// applyScanlines must run before applyGlitch — glitch consumes random state and
// would change scanline positions if run first. Do not reorder in draw().

function applyScanlines(density) {
  if (!els.clusters?.checked) return;

  const scanBands  = parseInt(els.clusterCount.value,  10);
  const baseRadius = parseInt(els.clusterRadius.value, 10);
  if (scanBands <= 0 || frameRing.length < 2) return;

  const depth      = parseFloat(els.depth.value);
  const maxBackSc  = Math.max(1, Math.floor((frameRing.length - 1) * depth));
  const randSize   = !!els.scanRandSize?.checked;
  const bandAlpha  = parseFloat(els.scanAlpha?.value  ?? '0.86');
  const shiftScale = parseFloat(els.scanShift?.value  ?? '0.12');
  const driftSpeed = parseFloat(els.scanDrift?.value  ?? '1.0');
  const scanGap     = parseInt(els.scanGap?.value      ?? '0',   10);
  const scanSpacing = parseInt(els.scanSpacing?.value  ?? '0',   10);
  const scanSkew    = parseFloat(els.scanSkew?.value   ?? '0');

  // Use the dedicated scanline phase accumulator — independent of glitch phase.
  // Speed is controlled by how fast nPhaseScanX/Y accumulate in draw(),
  // not by scaling noise coordinates (which caused aliasing).
  const phX = nPhaseScanX;
  const phY = nPhaseScanY;

  // Cap the number of distinct ring frames requested to RING_CACHE_SIZE - 2.
  // With 50 bands each requesting a random frame, cache thrashing causes
  // repeated putImageData uploads. Quantising to a small pool keeps the LRU
  // cache hot and eliminates the per-band GPU readback cost.
  const framePool = Math.max(1, Math.min(maxBackSc, RING_CACHE_SIZE - 2));

  const ctx      = gBuf.drawingContext;
  const prevAlpha = ctx.globalAlpha;

  // Track last band bottom for minimum spacing enforcement
  let lastBandBot = -scanSpacing - 1;

  for (let n = 0; n < scanBands; n++) {
    const bH_n = randSize
      ? Math.max(4, Math.floor(random(baseRadius * 0.5, baseRadius * 4) * 3))
      : Math.max(4, Math.floor(baseRadius * 3));

    const driftY  = noise(n * 4.1 + phY * 0.4 * driftSpeed) * height;
    const gappedY = scanGap > 0
      ? Math.floor(driftY / Math.max(1, bH_n + scanGap)) * (bH_n + scanGap)
      : driftY;
    const bTop = Math.max(0, Math.floor(gappedY));

    // Minimum spacing — skip this band if it would overlap the previous one
    if (scanSpacing > 0 && bTop < lastBandBot + scanSpacing) continue;

    const bBot = Math.min(height, bTop + bH_n);
    const bH   = bBot - bTop;
    if (bH <= 0) continue;

    lastBandBot = bBot;

    // Quantise ring offset to framePool — keeps LRU cache hits high
    const poolIdx = Math.floor(random(framePool)) + 1;
    const src     = frameRing.fromEnd(Math.min(poolIdx, frameRing.length - 1));
    if (!src) continue;

    const skewOffset = Math.floor(scanSkew * bTop);
    const shiftX = Math.floor(
      map(noise(n * 2.3 + phX * 0.5), 0, 1, -width * shiftScale, width * shiftScale)
    ) + skewOffset;
    const srcX = Math.max(0, shiftX < 0 ? -shiftX : 0);
    const dstX = Math.max(0, shiftX > 0 ?  shiftX : 0);
    const bW   = width - Math.abs(shiftX);
    if (bW <= 0) continue;

    // Direct alpha set/restore — no ctx.save/restore per band.
    // save/restore pushes/pops the full canvas state (transform, clip, font,
    // shadow, compositing). At 50 bands × 60fps that's 6000 state snapshots/sec.
    ctx.globalAlpha = bandAlpha;
    drawRingRegion(gBuf, src, srcX, bTop, bW, bH, dstX, bTop, bW, bH);
  }

  ctx.globalAlpha = prevAlpha; // restore once at the end
}

// ─── Glitch ───────────────────────────────────────────────────────────────────
// Note: randomSeed is set by draw() once per frame. No re-seeding here.

function applyGlitch(density = 1, baseDX = 0, baseDY = 0) {
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
    const centers    = cluSpeed > 0 ? getPhysicsCenters() : getStaticCenters();
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
  for (let i = 0; i < targets.length; i++) {
    let [cx, cy] = targets[i];

    const ox = Math.floor(map(noise(nPhaseX + i * 0.013), 0, 1, -block * 2, block * 2) * jitter);
    const oy = Math.floor(map(noise(nPhaseY + i * 0.017), 0, 1, -block * 2, block * 2) * jitter);
    cx = (cx + ox + width)  % width;
    cy = (cy + oy + height) % height;

    // Tile size from the natural position — partial tiles at canvas edges are fine
    // and match the original behaviour. Do NOT use a fixed tileW clamped to
    // canvas-minus-tileW: that stacks all edge tiles at one coordinate (the band bug).
    const w = Math.min(block * (size / 20), width  - cx);
    const h = Math.min(block * (size / 20), height - cy);
    if (w <= 0 || h <= 0) continue;

    // Apply base offset to the destination position only, clamped so the tile
    // fits within the canvas. Source (cx, cy) is unchanged — tiles shift where
    // they appear but sample from their natural ring position.
    const dstX = Math.max(0, Math.min(width  - w, cx + baseDX));
    const dstY = Math.max(0, Math.min(height - h, cy + baseDY));

    const randBack  = Math.floor(random(1, maxBack + 1));
    const blendBack = Math.round(baseBack + (randBack - baseBack) * depthScatter);
    const idx       = Math.max(1, Math.min(maxBack, blendBack));
    const src       = frameRing.fromEnd(idx);
    if (!src) continue;

    ctx.save();
    ctx.globalAlpha = tileAlpha / 255;
    drawRingRegion(gBuf, src, cx, cy, w, h, dstX, dstY, w, h);
    ctx.restore();

    if (smearLen > 0) {
      for (let s = 1; s <= smearLen; s++) {
        const sx2 = Math.max(0, Math.min(width  - w, dstX + Math.round(dxUnit * s * block)));
        const sy2 = Math.max(0, Math.min(height - h, dstY + Math.round(dyUnit * s * block)));
        ctx.save();
        ctx.globalAlpha = tileAlpha / 255;
        drawRingRegion(gBuf, src, cx, cy, w, h, sx2, sy2, w, h);
        ctx.restore();
      }
    }
  }
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

function applyFlowWarp(src, dst, strength = 6, scale = 80, pulse = 0, implode = 0) {
  dst.clear();

  let srcFrame = src;
  if (pulse > 0 && frameRing.length > pulse) {
    const ringFrame = frameRing.fromEnd(pulse);
    if (ringFrame) srcFrame = { _isRingData:true, data:ringFrame };
  }

  const cell = Math.max(8, scale | 0);
  const off  = strength;
  const t    = frameCount * 0.005;
  const w = width, h = height;
  const cx2 = w * 0.5, cy2 = h * 0.5;

  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  _ensureFlowBuffers(cols, rows);

  // Pre-compute all displacement vectors into typed arrays
  let idx = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x  = col * cell;
      const y  = row * cell;
      const nx = (x + 0.5 * cell) / w * 2.0;
      const ny = (y + 0.5 * cell) / h * 2.0;
      const a  = noise(nx * 0.9 + t, ny * 0.9) * TWO_PI * 2.0;

      let dx2 = Math.cos(a) * off;
      let dy2 = Math.sin(a) * off;

      if (implode > 0) {
        const px = x + 0.5 * cell, py = y + 0.5 * cell;
        const vx = cx2 - px, vy = cy2 - py;
        const L  = Math.hypot(vx, vy) || 1;
        dx2 += (vx / L) * off * implode;
        dy2 += (vy / L) * off * implode;
      }

      _flowDx[idx] = dx2;
      _flowDy[idx] = dy2;
      idx++;
    }
  }

  // Draw all displaced tiles using the pre-computed vectors
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
        if (!srcEl) continue; // guard: graphics disposed during resize
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
  }

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

// ─── Global composite key ─────────────────────────────────────────────────────
// Applied at the final composite stage in draw(), between the clean base (gCur)
// and the processed output (gBuf).
//
// BLEND mode — CSS globalCompositeOperation. Entirely GPU-accelerated.
//   draw() already put gBuf on the p5 canvas. We draw gCur on top with a blend
//   mode at mix opacity. One drawImage call, no pixel work.
//
// LUMA mode — base luminance controls how much of the processed layer shows.
//   Optimized to a single getImageData + putImageData cycle:
//   1. Downsample base into _gkCanvas, read pixels (1 GPU→CPU readback).
//   2. Pixel loop: write luma→alpha only (3 muls per pixel, no lerp).
//      Output is white pixels with luma-derived alpha.
//   3. putImageData back to _gkCanvas (1 CPU→GPU upload).
//   4. Draw processed (gBuf) into _gkBufCanvas at downscale (GPU).
//   5. Apply _gkCanvas as alpha mask via destination-in (GPU).
//   6. Draw _gkBufCanvas over the canvas at mix opacity (GPU).
//   Net: 1 getImageData, 1 putImageData, 4 GPU drawImage/composite ops.
//   Previously: 2 getImageData + 1 createImageData + full lerp pixel loop.

let _gkCanvas = null, _gkCtx = null;       // luma mask canvas
let _gkBufCanvas = null, _gkBufCtx = null; // processed layer canvas
let _gkPixBuf = null;                       // pre-allocated pixel buffer (reused)

function applyGlobalKey(p5canvas, baseSrc, processedSrc, mode, mix, thresh, invert, blendMode) {
  if (!mode || mode === 'off' || mix <= 0) return;

  const W = p5canvas.width, H = p5canvas.height;
  const ctx = p5canvas.drawingContext;

  // Resolve source elements once — avoid repeated optional chaining per pixel
  const baseEl = baseSrc?.elt ?? baseSrc?.drawingContext?.canvas ?? null;
  const procEl = processedSrc?.elt ?? processedSrc?.drawingContext?.canvas ?? null;
  if (!baseEl || !procEl) return;

  // ── Blend mode ─────────────────────────────────────────────────────────────
  // draw() already has gBuf on the canvas. We composite gCur on top with a
  // blend mode — one drawImage, zero pixel work.
  if (mode === 'blend') {
    ctx.save();
    ctx.globalCompositeOperation = blendMode || 'screen';
    ctx.globalAlpha = mix;
    ctx.drawImage(baseEl, 0, 0, W, H);
    ctx.restore();
    return;
  }

  // ── Luma mode ──────────────────────────────────────────────────────────────
  if (mode === 'luma') {
    const MAX_W = 640;
    const scale = W > MAX_W ? MAX_W / W : 1;
    const sw = Math.max(1, Math.round(W * scale));
    const sh = Math.max(1, Math.round(H * scale));
    const n  = sw * sh * 4;

    // Allocate canvases only when dimensions change
    if (!_gkCanvas || _gkCanvas.width !== sw || _gkCanvas.height !== sh) {
      _gkCanvas = document.createElement('canvas');
      _gkCanvas.width = sw; _gkCanvas.height = sh;
      _gkCtx = _gkCanvas.getContext('2d', { willReadFrequently: true });
      _gkPixBuf = null; // force realloc below
    }
    if (!_gkBufCanvas || _gkBufCanvas.width !== sw || _gkBufCanvas.height !== sh) {
      _gkBufCanvas = document.createElement('canvas');
      _gkBufCanvas.width = sw; _gkBufCanvas.height = sh;
      _gkBufCtx = _gkBufCanvas.getContext('2d');
    }

    // Pre-allocated output buffer — no createImageData per frame
    if (!_gkPixBuf || _gkPixBuf.length !== n) _gkPixBuf = new Uint8ClampedArray(n);

    // Step 1: Downsample base, read pixels — single getImageData
    _gkCtx.drawImage(baseEl, 0, 0, sw, sh);
    const baseData = _gkCtx.getImageData(0, 0, sw, sh);
    const bp = baseData.data;

    // Step 2: Luma→alpha pixel loop — 3 multiplies per pixel, no lerp
    // Output: white (255,255,255) with luma-derived alpha.
    // destination-in compositing will use this alpha to clip the processed layer.
    //
    // thresh=0 → gate at luma 255 → nothing revealed → base video only
    // thresh=1 → gate at luma 0   → everything revealed → full processed output
    const t = (1 - thresh) * 255;
    const rollRange = Math.max(1, 64); // soft rolloff width in luma units
    for (let i = 0; i < n; i += 4) {
      const lum    = (0.299 * bp[i] + 0.587 * bp[i+1] + 0.114 * bp[i+2]);
      const roll   = Math.max(0, Math.min(1, (lum - t) / rollRange));
      const reveal = invert ? (1 - roll) : roll;
      _gkPixBuf[i]   = 255;
      _gkPixBuf[i+1] = 255;
      _gkPixBuf[i+2] = 255;
      _gkPixBuf[i+3] = (reveal * 255 + 0.5) | 0; // alpha = luma gate
    }

    // Step 3: Upload luma mask
    _gkCtx.putImageData(new ImageData(_gkPixBuf, sw, sh), 0, 0);

    // Steps 4–5: Draw processed into _gkBufCanvas, clip it with the luma mask
    _gkBufCtx.clearRect(0, 0, sw, sh);
    _gkBufCtx.drawImage(procEl, 0, 0, sw, sh);        // processed layer
    _gkBufCtx.globalCompositeOperation = 'destination-in';
    _gkBufCtx.drawImage(_gkCanvas, 0, 0, sw, sh);     // apply luma mask as alpha
    _gkBufCtx.globalCompositeOperation = 'source-over'; // reset

    // Step 6: Composite — draw base (gCur) as foundation, then luma-clipped
    // processed (gBuf) on top at mix opacity.
    // This is done here rather than relying on whatever draw() already put on
    // the canvas — by this point gBuf is already painted, so we must replace
    // it with gCur first or the key has nothing to cut through.
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(baseEl, 0, 0, W, H);     // lay down clean base
    ctx.globalAlpha = mix;
    ctx.drawImage(_gkBufCanvas, 0, 0, W, H); // processed, clipped by luma mask
    ctx.restore();
  }
}
