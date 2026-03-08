// effects.js
// Perf notes:
//  - frameRing stores ImageData; drawRingRegion uses a single shared canvas
//  - applySolarize downsamples to max 640px wide before pixel math (big Windows win)
//  - applyTrails runs independently — not nested inside tile loop
//  - applyScanlines is a standalone pass, called separately from applyGlitch
//  - applyFlowWarp uses native drawImage throughout
//  - applyTrails supports luma keying via downsampled pixel pass (trailLumaKey)

// ─── Ring frame helpers ────────────────────────────────────────────────────

let _ringCanvas = null;
let _ringCtx    = null;

function drawRingRegion(target, imgData, sx, sy, sw, sh, dx, dy, dw, dh) {
  if (!_ringCanvas) {
    _ringCanvas = document.createElement('canvas');
    _ringCtx    = _ringCanvas.getContext('2d');
  }
  if (_ringCanvas.width !== imgData.width || _ringCanvas.height !== imgData.height) {
    _ringCanvas.width  = imgData.width;
    _ringCanvas.height = imgData.height;
    _ringCtx.putImageData(imgData, 0, 0);
    _ringCanvas._lastFrame = imgData;
  } else if (_ringCanvas._lastFrame !== imgData) {
    _ringCtx.putImageData(imgData, 0, 0);
    _ringCanvas._lastFrame = imgData;
  }
  target.drawingContext.drawImage(_ringCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
}

// ─── Luma-keyed trail blit ─────────────────────────────────────────────────
// Downsamples the ring ImageData, zeroes alpha for pixels below luma threshold,
// then scales the masked result back to full res. Same perf trick as solarize.

let _trailLumaCanvas = null, _trailLumaCtx = null;
const TRAIL_LUMA_MAX_W = 640;

function blitTrailLumaKeyed(ctx, imgData, alpha, lumaThresh) {
  const w = imgData.width, h = imgData.height;
  const scale = w > TRAIL_LUMA_MAX_W ? TRAIL_LUMA_MAX_W / w : 1;
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));

  if (!_trailLumaCanvas || _trailLumaCanvas.width !== sw || _trailLumaCanvas.height !== sh) {
    _trailLumaCanvas = document.createElement('canvas');
    _trailLumaCanvas.width  = sw;
    _trailLumaCanvas.height = sh;
    _trailLumaCtx = _trailLumaCanvas.getContext('2d', { willReadFrequently: true });
  }

  // Ensure _ringCanvas has this frame
  if (!_ringCanvas) return;
  if (_ringCanvas._lastFrame !== imgData) {
    _ringCtx.putImageData(imgData, 0, 0);
    _ringCanvas._lastFrame = imgData;
  }

  // Downsample into luma canvas
  _trailLumaCtx.clearRect(0, 0, sw, sh);
  _trailLumaCtx.drawImage(_ringCanvas, 0, 0, sw, sh);

  // Pixel pass: zero alpha below luma threshold, scale surviving alpha by trail alpha
  const imageData = _trailLumaCtx.getImageData(0, 0, sw, sh);
  const pix = imageData.data;
  const t   = lumaThresh * 255;
  for (let i = 0; i < pix.length; i += 4) {
    const lum = 0.299 * pix[i] + 0.587 * pix[i + 1] + 0.114 * pix[i + 2];
    if (lum < t) {
      pix[i + 3] = 0;
    } else {
      // Smooth rolloff above threshold so hard edges don't pop
      const roll = Math.min(1, (lum - t) / (Math.max(1, 255 - t)));
      pix[i + 3] = Math.round(roll * alpha * 255);
    }
  }
  _trailLumaCtx.putImageData(imageData, 0, 0);

  // Scale back up onto gBuf — no save/restore needed, alpha already baked in
  ctx.drawImage(_trailLumaCanvas, 0, 0, w, h);
}

// ─── Trails (independent full-frame ghost pass) ────────────────────────────
// Call this from draw() before the tile / scanline passes so ghosts sit underneath.
// Requires: frameRing.length > 1, trailLayers > 0, trailDepth > 0

function applyTrails() {
  if (!els.trailOn?.checked) return;
  const trailLayers = parseInt(els.trailLayers?.value  ?? '0',   10);
  const trailDepth  = parseFloat(els.trailDepth?.value  ?? '0');
  const lumaKey     = parseFloat(els.trailLumaKey?.value ?? '0');
  if (trailLayers <= 0 || trailDepth <= 0 || frameRing.length < 2) return;

  const maxBack = Math.max(1, Math.floor((frameRing.length - 1) * trailDepth));
  const step    = Math.max(1, Math.floor(maxBack / trailLayers));
  const ctx     = gBuf.drawingContext;

  for (let g = 1; g <= trailLayers; g++) {
    const back  = Math.min(frameRing.length - 1, g * step);
    const src   = frameRing[frameRing.length - 1 - back];
    if (!src) continue;

    // Fade from opaque at g=1 to near-transparent at g=trailLayers
    const alpha = (1 - (g - 1) / trailLayers) * 0.65;

    if (lumaKey > 0) {
      blitTrailLumaKeyed(ctx, src, alpha, lumaKey);
    } else {
      ctx.save();
      ctx.globalAlpha = alpha;
      drawRingRegion(gBuf, src, 0, 0, width, height, 0, 0, width, height);
      ctx.restore();
    }
  }
}

// ─── Scanlines (band displacement pass) ───────────────────────────────────
// Extracted from applyGlitch so it can be toggled independently.
// Controlled by: els.clusters (ON), clusterCount, clusterRadius, scanAlpha,
//                scanShift, scanDrift, depth.

function applyScanlines(density) {
  if (!els.clusters?.checked) return;

  const scanBands  = parseInt(els.clusterCount.value,  10);
  const baseRadius = parseInt(els.clusterRadius.value, 10);
  if (scanBands <= 0 || frameRing.length < 2) return;

  const depth      = parseFloat(els.depth.value);
  const maxBackSc  = Math.max(1, Math.floor((frameRing.length - 1) * depth));
  const randSize   = !!els.scanRandSize?.checked;
  const bandHeight = randSize
    ? Math.max(4, Math.floor(random(baseRadius * 0.5, baseRadius * 4) * 3))
    : Math.max(4, Math.floor(baseRadius * 3));
  const bandAlpha  = Math.floor(parseFloat(els.scanAlpha?.value  ?? '0.86') * 255);
  const shiftScale = parseFloat(els.scanShift?.value  ?? '0.12');
  const driftSpeed = parseFloat(els.scanDrift?.value  ?? '1.0');

  const ctx = gBuf.drawingContext;
  for (let n = 0; n < scanBands; n++) {
    const bH_n = randSize
      ? Math.max(4, Math.floor(random(baseRadius * 0.5, baseRadius * 4) * 3))
      : bandHeight;
    const driftY = noise(n * 4.1 + nPhaseY * 0.4 * driftSpeed) * height;
    const bTop   = Math.max(0, Math.floor(driftY));
    const bBot   = Math.min(height, bTop + bH_n);
    const bH     = bBot - bTop;
    if (bH <= 0) continue;

    const back   = frameRing.length - 1 - Math.floor(random(1, maxBackSc + 1));
    const src    = frameRing[Math.max(0, back)];
    const shiftX = Math.floor(map(noise(n * 2.3 + nPhaseX * 0.5), 0, 1, -width * shiftScale, width * shiftScale));
    const srcX   = Math.max(0, shiftX < 0 ? -shiftX : 0);
    const dstX   = Math.max(0, shiftX > 0 ? shiftX  : 0);
    const bW     = width - Math.abs(shiftX);
    if (bW <= 0) continue;

    ctx.save();
    ctx.globalAlpha = bandAlpha / 255;
    drawRingRegion(gBuf, src, srcX, bTop, bW, bH, dstX, bTop, bW, bH);
    ctx.restore();
  }
}

// ─── Glitch (tile displacement pass) ─────────────────────────────────────
// Scanlines and trails are now separate passes — call them from draw() before this.
// Controlled by: els.corruptOn (ON toggle in Glitch group).

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

  const gap         = parseInt(els.spatialGap.value, 10);
  const useCluTiles = !!els.clusterTiles?.checked;
  const cluCenters  = parseInt(els.cluCenters?.value  ?? '3',  10);
  const cluSpread   = parseInt(els.cluSpread?.value   ?? '80', 10);

  const targets = [];
  const tryAdd = (x, y) => {
    if (gap <= 0) { targets.push([x, y]); return true; }
    for (const t of targets) {
      const dx = x - t[0], dy = y - t[1];
      if (dx * dx + dy * dy < gap * gap) return false;
    }
    targets.push([x, y]); return true;
  };

  randomSeed(baseSeed + frameCount);

  // ── Tile placement ───────────────────────────────────────────────────────
  if (useCluTiles && cluCenters > 0) {
    const centers = [];
    for (let i = 0; i < cluCenters; i++) {
      centers.push([
        Math.floor(random(cols)) * block + (block >> 1),
        Math.floor(random(rows)) * block + (block >> 1),
      ]);
    }
    const per = Math.max(1, Math.floor(count / cluCenters));
    for (const c of centers) {
      for (let i = 0; i < per && targets.length < count; i++) {
        const ang = random(TWO_PI), r = random(cluSpread);
        const x   = (c[0] + Math.cos(ang) * r + width)  % width;
        const y   = (c[1] + Math.sin(ang) * r + height) % height;
        let ok = tryAdd(Math.floor(x), Math.floor(y)), tries = 0;
        while (!ok && tries++ < 6) {
          const a2 = random(TWO_PI), r2 = random(cluSpread);
          ok = tryAdd(
            Math.floor((c[0] + Math.cos(a2) * r2 + width)  % width),
            Math.floor((c[1] + Math.sin(a2) * r2 + height) % height)
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

  // ── Blit tiles ───────────────────────────────────────────────────────────
  if (frameRing.length === 0 || maxBack <= 0) return;

  const ctx = gBuf.drawingContext;
  for (let i = 0; i < targets.length; i++) {
    let [cx, cy] = targets[i];

    const ox = Math.floor(map(noise(nPhaseX + i * 0.013), 0, 1, -block * 2, block * 2) * jitter);
    const oy = Math.floor(map(noise(nPhaseY + i * 0.017), 0, 1, -block * 2, block * 2) * jitter);
    cx = (cx + ox + width)  % width;
    cy = (cy + oy + height) % height;
    cx = Math.max(0, Math.min(width  - 1, cx + baseDX));
    cy = Math.max(0, Math.min(height - 1, cy + baseDY));

    const w = Math.min(block * (size / 20), width  - cx);
    const h = Math.min(block * (size / 20), height - cy);
    if (w <= 0 || h <= 0) continue;

    const randBack  = Math.floor(random(1, maxBack + 1));
    const blendBack = Math.round(baseBack + (randBack - baseBack) * depthScatter);
    const back      = frameRing.length - 1 - Math.max(1, Math.min(maxBack, blendBack));
    const src       = frameRing[Math.max(0, back)];

    ctx.save();
    ctx.globalAlpha = tileAlpha / 255;
    drawRingRegion(gBuf, src, cx, cy, w, h, cx, cy, w, h);
    ctx.restore();

    if (smearLen > 0) {
      for (let s = 1; s <= smearLen; s++) {
        const sx2 = Math.max(0, Math.min(width  - w, cx + Math.round(dxUnit * s * block) + baseDX));
        const sy2 = Math.max(0, Math.min(height - h, cy + Math.round(dyUnit * s * block) + baseDY));
        ctx.save();
        ctx.globalAlpha = tileAlpha / 255;
        drawRingRegion(gBuf, src, cx, cy, w, h, sx2, sy2, w, h);
        ctx.restore();
      }
    }
  }
}

// ─── Flow warp ────────────────────────────────────────────────────────────

function applyFlowWarp(src, dst, strength = 6, scale = 80, pulse = 0, implode = 0) {
  dst.clear();

  let srcFrame = src;
  if (pulse > 0 && Array.isArray(frameRing) && frameRing.length > pulse) {
    srcFrame = { _isRingData: true, data: frameRing[frameRing.length - 1 - pulse] };
  }

  const cell = Math.max(8, scale | 0);
  const off  = strength;
  const t    = frameCount * 0.005;
  const w = width, h = height;
  const cx2 = w * 0.5, cy2 = h * 0.5;
  const dctx = dst.drawingContext;
  dctx.save();

  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
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

      const tileW = Math.min(cell, w - x);
      const tileH = Math.min(cell, h - y);
      const sx2   = Math.max(0, Math.min(w - tileW, Math.floor(x + dx2)));
      const sy2   = Math.max(0, Math.min(h - tileH, Math.floor(y + dy2)));

      if (srcFrame?._isRingData) {
        drawRingRegion(dst, srcFrame.data, sx2, sy2, tileW, tileH, x, y, tileW, tileH);
      } else {
        dctx.drawImage(srcFrame.elt || srcFrame.drawingContext.canvas,
          sx2, sy2, tileW, tileH, x, y, tileW, tileH);
      }
    }
  }
  dctx.restore();
}

// ─── Solarize ─────────────────────────────────────────────────────────────
// Perf: downsamples to a max 640px wide offscreen canvas before pixel math,
// then scales result back up. This is ~4-16x faster on large screens / Windows.

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
    _solCtx    = _solCanvas.getContext('2d', { willReadFrequently: true });
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
    const r = pix[i], g = pix[i+1], b = pix[i+2];
    const lum = 0.299*r + 0.587*g + 0.114*b;
    if (lum > t) {
      pix[i]   = Math.min(255, Math.max(0, (r + (255-r-r)*a) * solR + 0.5) | 0);
      pix[i+1] = Math.min(255, Math.max(0, (g + (255-g-g)*a) * solG + 0.5) | 0);
      pix[i+2] = Math.min(255, Math.max(0, (b + (255-b-b)*a) * solB + 0.5) | 0);
    }
  }
  _solCtx.putImageData(imgData, 0, 0);

  _solOutCtx.clearRect(0, 0, BW, BH);
  _solOutCtx.drawImage(_solCanvas, 0, 0, BW, BH);
  buf.drawingContext.clearRect(0, 0, BW, BH);
  buf.drawingContext.drawImage(_solOut, 0, 0);
}

// ─── Symmetry ─────────────────────────────────────────────────────────────

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
    ctx.beginPath(); ctx.rect(x0, 0, w-x0, h); ctx.clip();
    dst.push(); dst.translate(2*x0, 0); dst.scale(-1, 1);
    dst.image(src, 0, 0, w, h);
    dst.pop(); ctx.restore();
  }
  if (mode === 'h' || mode === 'hv') {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y0, w, h-y0); ctx.clip();
    dst.push(); dst.translate(0, 2*y0); dst.scale(1, -1);
    dst.image(src, 0, 0, w, h);
    dst.pop(); ctx.restore();
  }
}
