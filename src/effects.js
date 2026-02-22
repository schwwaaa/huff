// effects.js — extracted effect helpers

function applyGlitch(density = 1, baseDX = 0, baseDY = 0){
  if (els.corruptOn && !els.corruptOn.checked) return;

  const block    = parseInt(els.block.value, 10);
  const size     = parseInt(els.glitchSize.value, 10);
  const smearLen = parseInt(els.glitchSmear.value, 10);
  const corrupt  = parseFloat(els.corrupt.value);

  const cols = Math.max(1, Math.floor(width / block));
  const rows = Math.max(1, Math.floor(height / block));
  const total = cols * rows;

  const depth = parseFloat(els.depth.value);
  const maxBack = Math.max(1, Math.floor((frameRing.length - 1) * depth));

  let count = Math.max(1, Math.floor(total * corrupt * (0.5 + density)));

  const dxUnit = map(noise(nPhaseX), 0, 1, -1, 1);
  const dyUnit = map(noise(nPhaseY), 0, 1, -1, 1);

  const gap = parseInt(els.spatialGap.value, 10);
  const useCl = !!els.clusters.checked;
  const k = parseInt(els.clusterCount.value, 10);
  const radius = parseInt(els.clusterRadius.value, 10);

  const targets = [];
  const tryAdd = (x, y) => {
    if (gap <= 0) { targets.push([x,y]); return true; }
    for (const t of targets) {
      const dx = x - t[0], dy = y - t[1];
      if (dx*dx + dy*dy < gap*gap) return false;
    }
    targets.push([x,y]); return true;
  };

  randomSeed(baseSeed + frameCount);

  // --- Scanline Band Displacement (CLUSTERS) ---
  // Divides the frame into N horizontal bands; each band is independently
  // sampled from a different depth in the ring buffer and blitted in-place.
  // Produces the characteristic CVI horizontal-band time-offset / tear look.
  if (useCl && k > 0 && frameRing.length > 1) {
    const bandHeight = Math.max(4, Math.floor(radius * 3)); // SPREAD controls band thickness
    const depth      = parseFloat(els.depth.value);
    const maxBack    = Math.max(1, Math.floor((frameRing.length - 1) * depth));

    // Generate k band positions, spread across the frame height
    const bandAlpha = 220;
    for (let n = 0; n < k; n++) {
      // Each band drifts slowly via noise so it's animated, not static
      const driftY = noise(n * 4.1 + nPhaseY * 0.4) * height;
      const bandY  = Math.floor(driftY);
      const bTop   = Math.max(0, bandY);
      const bBot   = Math.min(height, bTop + bandHeight);
      const bH     = bBot - bTop;
      if (bH <= 0) continue;

      // Each band gets its own ring depth — creates temporal offset between bands
      const bandDepth = Math.floor(random(1, maxBack + 1));
      const back      = frameRing.length - 1 - bandDepth;
      const src       = frameRing[Math.max(0, back)];

      // Horizontal shift per band (noise-driven, can push the band left/right)
      const shiftX = Math.floor(map(noise(n * 2.3 + nPhaseX * 0.5), 0, 1, -width * 0.12, width * 0.12));
      const srcX   = Math.max(0, Math.min(width - 1, shiftX < 0 ? -shiftX : 0));
      const dstX   = Math.max(0, shiftX > 0 ? shiftX : 0);
      const bW     = width - Math.abs(shiftX);
      if (bW <= 0) continue;

      const strip = src.get(srcX, bTop, bW, bH);

      gBuf.push();
      gBuf.imageMode(CORNER);
      gBuf.tint(255, bandAlpha);
      gBuf.image(strip, dstX, bTop, bW, bH);
      gBuf.pop();
    }
  }

  // Scatter glitch tiles
  let attempts = 0;
  while (targets.length < count && attempts++ < count * 8) {
    tryAdd(Math.floor(random(cols))*block, Math.floor(random(rows))*block);
  }

  gBuf.push();
  gBuf.imageMode(CORNER);
  for (let i = 0; i < targets.length; i++) {
    let [cx, cy] = targets[i];

    const ox = Math.floor(map(noise(nPhaseX + i*0.013), 0, 1, -block*2, block*2));
    const oy = Math.floor(map(noise(nPhaseY + i*0.017), 0, 1, -block*2, block*2));
    cx = (cx + ox + width) % width;
    cy = (cy + oy + height) % height;

    // apply user base offsets (manual XY control)
    cx = Math.max(0, Math.min(width  - 1, cx + baseDX));
    cy = Math.max(0, Math.min(height - 1, cy + baseDY));    

    const w = Math.min(block * (size / 20), width - cx);
    const h = Math.min(block * (size / 20), height - cy);
    if (w <= 0 || h <= 0) continue;

    if (frameRing.length > 0 && maxBack > 0) {
      const back = frameRing.length - 1 - Math.floor(random(1, maxBack + 1));
      const src = frameRing[Math.max(0, back)];
      const tile = src.get(cx, cy, w, h);

    // --- temporal smoothing: blend neighbor frame toward current tile ---
    let interp = 0.35; // fallback
    try {
      if (typeof ringDelayAccum !== 'undefined') {
        const delay = parseInt(els.ringDelay?.value || '0', 10) || 0;
        if (delay > 0) interp = Math.min(1, ringDelayAccum / delay);
      }
    } catch {}
    if (back > 0 && interp > 0) {
      const src2  = frameRing[Math.max(0, back - 1)];
      const tile2 = src2.get(cx, cy, w, h);
      gBuf.push(); gBuf.tint(255, Math.floor(interp * 255));
      gBuf.image(tile2, cx, cy, w, h);
      gBuf.pop();
    }      

      gBuf.image(tile, cx, cy, w, h);

      if (smearLen > 0) {
        for (let s = 1; s <= smearLen; s++) {
        const sx = Math.max(0, Math.min(width  - w, cx + Math.round(dxUnit * s) + baseDX));
        const sy = Math.max(0, Math.min(height - h, cy + Math.round(dyUnit * s) + baseDY));
          gBuf.image(tile, sx, sy, w, h);
        }
      }
    }
  }
  gBuf.pop();
}

// function applyFlowWarp(src, dst, strength = 6, scale = 80) {
//   dst.clear();
//   const cell = Math.max(8, scale | 0);
//   const off  = strength;
//   const t = frameCount * 0.005;
//   dst.imageMode(CORNER);
//   for (let y = 0; y < height; y += cell) {
//     for (let x = 0; x < width; x += cell) {
//       const nx = (x + 0.5 * cell) / width * 2.0;
//       const ny = (y + 0.5 * cell) / height * 2.0;
//       const a = noise(nx * 0.9 + t, ny * 0.9) * TWO_PI * 2.0;
//       const dx = Math.cos(a) * off;
//       const dy = Math.sin(a) * off;

//       const tileW = Math.min(cell, width - x);
//       const tileH = Math.min(cell, height - y);
//       const sx = Math.max(0, Math.min(width - tileW, Math.floor(x + dx)));
//       const sy = Math.max(0, Math.min(height - tileH, Math.floor(y + dy)));

//       const tile = src.get(sx, sy, tileW, tileH);
//       dst.image(tile, x, y, tileW, tileH);
//     }
//   }
// }

function applyFlowWarp(src, dst, strength = 6, scale = 80, pulse = 0, implode = 0) {
  dst.clear();

  // Select source frame with pulse spacing (0 = current)
  let srcFrame = src;
  if (pulse > 0 && Array.isArray(frameRing) && frameRing.length > pulse) {
    srcFrame = frameRing[frameRing.length - 1 - pulse];
  }

  const cell = Math.max(8, scale | 0);
  const off  = strength;
  const t = frameCount * 0.005;

  const w = width, h = height;
  const cx = w * 0.5, cy = h * 0.5;

  dst.imageMode(CORNER);
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      // base flow direction from noise
      const nx = (x + 0.5 * cell) / w * 2.0;
      const ny = (y + 0.5 * cell) / h * 2.0;
      const a = noise(nx * 0.9 + t, ny * 0.9) * TWO_PI * 2.0;

      let dx = Math.cos(a) * off;
      let dy = Math.sin(a) * off;

      // add implosion (inward) component toward center
      if (implode > 0) {
        const px = x + 0.5 * cell, py = y + 0.5 * cell;
        const vx = cx - px,        vy = cy - py;          // inward vector
        const L  = Math.hypot(vx, vy) || 1;
        // normalize, scale by strength and implode amount
        const k  = off * implode;
        dx += (vx / L) * k;
        dy += (vy / L) * k;
      }

      const tileW = Math.min(cell, w - x);
      const tileH = Math.min(cell, h - y);

      const sx = Math.max(0, Math.min(w - tileW, Math.floor(x + dx)));
      const sy = Math.max(0, Math.min(h - tileH, Math.floor(y + dy)));

      // const tile = srcFrame.get(sx, sy, tileW, tileH);
      // dst.image(tile, x, y, tileW, tileH);
const tile = srcFrame.get(sx, sy, tileW, tileH);
dst.image(tile, x, y, tileW, tileH);

    // --- temporal smoothing if we’re using frameRing via pulse ---
    if (pulse > 0 && Array.isArray(frameRing) && frameRing.length > pulse + 1) {
      let interp = 0.35; // fallback
      try {
        if (typeof ringDelayAccum !== 'undefined') {
          const delay = parseInt(els.ringDelay?.value || '0', 10) || 0;
          if (delay > 0) interp = Math.min(1, ringDelayAccum / delay);
        }
      } catch {}
      if (interp > 0) {
        const srcPrev  = frameRing[frameRing.length - 1 - (pulse + 1)];
        const tilePrev = srcPrev.get(sx, sy, tileW, tileH);
        dst.push(); dst.tint(255, Math.floor(interp * 255));
        dst.image(tilePrev, x, y, tileW, tileH);
        dst.pop();
      }
    }

    }
  }
}

// --- Solarize: CVI-style luminance threshold inversion ---
// Pixels whose luminance exceeds `thresh` get their RGB inverted.
// `amount` blends between the original and solarized result.
function applySolarize(buf, thresh = 0.5, amount = 1.0) {
  buf.loadPixels();
  const pix = buf.pixels;
  const t   = thresh * 255;
  const a   = Math.max(0, Math.min(1, amount));
  for (let i = 0; i < pix.length; i += 4) {
    const r = pix[i], g = pix[i+1], b = pix[i+2];
    // perceived luminance
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > t) {
      pix[i]   = Math.round(r + (255 - r - r) * a);
      pix[i+1] = Math.round(g + (255 - g - g) * a);
      pix[i+2] = Math.round(b + (255 - b - b) * a);
    }
  }
  buf.updatePixels();
}

// --- Symmetry helper (vertical / horizontal / both) with axis position ---
// pos ∈ [0,1] controls the mirror axis: vertical uses x = pos*w, horizontal uses y = pos*h
function applySymmetry(src, dst, mode = 'v', pos = 0.5) {
  const w = dst.width, h = dst.height;
  const x0 = Math.max(0, Math.min(w, Math.round(w * pos)));
  const y0 = Math.max(0, Math.min(h, Math.round(h * pos)));

  dst.clear();
  dst.imageMode(CORNER);

  // draw the original frame once
  dst.image(src, 0, 0, w, h);

  const ctx = dst.drawingContext; // p5's 2D context
  if (!ctx) return;

  if (mode === 'v' || mode === 'hv') {
    // Overwrite the RIGHT side with a mirror of the LEFT across x = x0
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, w - x0, h); // keep only right side of the mirrored draw
    ctx.clip();

    dst.push();
    dst.translate(2 * x0, 0);
    dst.scale(-1, 1);
    dst.image(src, 0, 0, w, h);
    dst.pop();

    ctx.restore();
  }

  if (mode === 'h' || mode === 'hv') {
    // Overwrite the BOTTOM side with a mirror of the TOP across y = y0
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, w, h - y0); // keep only bottom side of the mirrored draw
    ctx.clip();

    dst.push();
    dst.translate(0, 2 * y0);
    dst.scale(1, -1);
    dst.image(src, 0, 0, w, h);
    dst.pop();

    ctx.restore();
  }
}
