// effects.js — extracted effect helpers

function applyGlitch(density = 1, baseDX = 0, baseDY = 0){
  if (els.corruptOn && !els.corruptOn.checked) return;

  const block     = parseInt(els.block.value, 10);
  const size      = parseInt(els.glitchSize.value, 10);
  const smearLen  = parseInt(els.glitchSmear.value, 10);
  const corrupt   = parseFloat(els.corrupt.value);
  const tileAlpha = Math.floor(parseFloat(els.glitchAlpha?.value ?? '1.0') * 255);
  const jitter    = parseFloat(els.glitchJitter?.value ?? '1.0');

  // Smear direction: if angle slider is at 0 use raw noise (old organic behavior),
  // otherwise bias toward the chosen angle with ±30° noise variation.
  const smearAngleDeg = parseFloat(els.glitchSmearAngle?.value ?? '0');
  let dxUnit, dyUnit;
  if (smearAngleDeg === 0) {
    // Old behavior: pure noise-driven direction, chaotic and organic
    dxUnit = map(noise(nPhaseX), 0, 1, -1, 1);
    dyUnit = map(noise(nPhaseY), 0, 1, -1, 1);
  } else {
    const rad = (smearAngleDeg * Math.PI / 180)
      + map(noise(nPhaseX * 0.5), 0, 1, -Math.PI / 6, Math.PI / 6);
    dxUnit = Math.cos(rad);
    dyUnit = Math.sin(rad);
  }

  const cols = Math.max(1, Math.floor(width / block));
  const rows = Math.max(1, Math.floor(height / block));
  const total = cols * rows;

  const depth   = parseFloat(els.depth.value);
  const maxBack = Math.max(1, Math.floor((frameRing.length - 1) * depth));

  // DEPTH SCATTER (0–1): 0 = all tiles converge on one temporal moment, 1 = full random scatter
  const depthScatter = parseFloat(els.depthScatter?.value ?? '1.0');
  const baseBack = Math.max(1, Math.floor(maxBack * (0.3 + 0.7 * noise(nPhaseX * 0.1 + nPhaseY * 0.07))));

  // CORRUPT DRIFT: noise-driven density breathing tied to the glitch noise field
  const corruptDrift = parseFloat(els.corruptDrift?.value ?? '0');
  const driftMod     = corruptDrift > 0 ? (noise(nPhaseX * 0.08, nPhaseY * 0.08) * 2 - 1) : 0;
  const corruptMul   = Math.max(0.05, 1.0 + corruptDrift * driftMod);

  let count = Math.max(1, Math.floor(total * corrupt * (0.5 + density) * corruptMul));

  const gap         = parseInt(els.spatialGap.value, 10);
  const useScan     = !!els.clusters.checked;
  const useCluTiles = !!els.clusterTiles?.checked;

  // Scanlines use their own sliders
  const scanBands  = parseInt(els.clusterCount.value, 10);
  const scanRadius = parseInt(els.clusterRadius.value, 10);

  // Cluster tiles use independent sliders
  const cluCenters = parseInt(els.cluCenters?.value ?? '3', 10);
  const cluSpread  = parseInt(els.cluSpread?.value  ?? '80', 10);

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

  // --- Scanline Band Displacement (SCANLINES toggle) ---
  if (useScan && scanBands > 0 && frameRing.length > 1) {
    const bandHeight = Math.max(4, Math.floor(scanRadius * 3));
    const maxBackSc  = Math.max(1, Math.floor((frameRing.length - 1) * depth));
    const bandAlpha  = Math.floor(parseFloat(els.scanAlpha?.value ?? '0.86') * 255);
    const shiftScale = parseFloat(els.scanShift?.value ?? '0.12');
    const driftSpeed = parseFloat(els.scanDrift?.value ?? '1.0');

    for (let n = 0; n < scanBands; n++) {
      const driftY = noise(n * 4.1 + nPhaseY * 0.4 * driftSpeed) * height;
      const bTop   = Math.max(0, Math.floor(driftY));
      const bBot   = Math.min(height, bTop + bandHeight);
      const bH     = bBot - bTop;
      if (bH <= 0) continue;

      const back = frameRing.length - 1 - Math.floor(random(1, maxBackSc + 1));
      const src  = frameRing[Math.max(0, back)];
      const shiftX = Math.floor(map(noise(n * 2.3 + nPhaseX * 0.5), 0, 1, -width * shiftScale, width * shiftScale));
      const srcX   = Math.max(0, Math.min(width - 1, shiftX < 0 ? -shiftX : 0));
      const dstX   = Math.max(0, shiftX > 0 ? shiftX : 0);
      const bW     = width - Math.abs(shiftX);
      if (bW <= 0) continue;

      gBuf.push();
      gBuf.imageMode(CORNER);
      gBuf.tint(255, bandAlpha);
      gBuf.image(src.get(srcX, bTop, bW, bH), dstX, bTop, bW, bH);
      gBuf.pop();
    }
  }

  // --- Tile placement: radial cluster (CLUSTER TILES) or random scatter ---
  if (useCluTiles && cluCenters > 0) {
    const centers = [];
    for (let i = 0; i < cluCenters; i++) {
      centers.push([
        Math.floor(random(cols)) * block + (block >> 1),
        Math.floor(random(rows)) * block + (block >> 1)
      ]);
    }
    const per = Math.max(1, Math.floor(count / cluCenters));
    for (const c of centers) {
      for (let i = 0; i < per && targets.length < count; i++) {
        const ang = random(TWO_PI), r = random(cluSpread);
        const x = (c[0] + Math.cos(ang) * r + width)  % width;
        const y = (c[1] + Math.sin(ang) * r + height) % height;
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
    // Fill remaining up to count
    let guard = 0;
    while (targets.length < count && guard++ < count * 4) {
      tryAdd(Math.floor(random(cols)) * block, Math.floor(random(rows)) * block);
    }
  } else {
    // Default: evenly scattered random tiles
    let attempts = 0;
    while (targets.length < count && attempts++ < count * 8) {
      tryAdd(Math.floor(random(cols)) * block, Math.floor(random(rows)) * block);
    }
  }

  // --- Blit tiles ---
  gBuf.push();
  gBuf.imageMode(CORNER);
  for (let i = 0; i < targets.length; i++) {
    let [cx, cy] = targets[i];

    const ox = Math.floor(map(noise(nPhaseX + i*0.013), 0, 1, -block*2, block*2) * jitter);
    const oy = Math.floor(map(noise(nPhaseY + i*0.017), 0, 1, -block*2, block*2) * jitter);
    cx = (cx + ox + width)  % width;
    cy = (cy + oy + height) % height;
    cx = Math.max(0, Math.min(width  - 1, cx + baseDX));
    cy = Math.max(0, Math.min(height - 1, cy + baseDY));

    const w = Math.min(block * (size / 20), width  - cx);
    const h = Math.min(block * (size / 20), height - cy);
    if (w <= 0 || h <= 0) continue;

    if (frameRing.length > 0 && maxBack > 0) {
      // DEPTH SCATTER: lerp between convergent baseBack and random per-tile back
      const randBack  = Math.floor(random(1, maxBack + 1));
      const blendBack = Math.round(baseBack + (randBack - baseBack) * depthScatter);
      const back      = frameRing.length - 1 - Math.max(1, Math.min(maxBack, blendBack));
      const src  = frameRing[Math.max(0, back)];
      const tile = src.get(cx, cy, w, h);

      // Temporal smoothing — blend adjacent ring frame
      if (back > 0) {
        const tile2 = frameRing[Math.max(0, back - 1)].get(cx, cy, w, h);
        gBuf.push(); gBuf.tint(255, 89); // 0.35 * 255
        gBuf.image(tile2, cx, cy, w, h);
        gBuf.pop();
      }

      gBuf.push(); gBuf.tint(255, tileAlpha);
      gBuf.image(tile, cx, cy, w, h);
      gBuf.pop();

      if (smearLen > 0) {
        for (let s = 1; s <= smearLen; s++) {
          // pixel-scale steps (old behavior) — builds a continuous streak not discrete stamps
          const sx = Math.max(0, Math.min(width  - w, cx + Math.round(dxUnit * s) + baseDX));
          const sy = Math.max(0, Math.min(height - h, cy + Math.round(dyUnit * s) + baseDY));
          gBuf.push(); gBuf.tint(255, tileAlpha);
          gBuf.image(tile, sx, sy, w, h);
          gBuf.pop();
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

    // temporal smoothing via pulse
    if (pulse > 0 && Array.isArray(frameRing) && frameRing.length > pulse + 1) {
      const srcPrev  = frameRing[frameRing.length - 1 - (pulse + 1)];
      const tilePrev = srcPrev.get(sx, sy, tileW, tileH);
      dst.push(); dst.tint(255, 89);
      dst.image(tilePrev, x, y, tileW, tileH);
      dst.pop();
    }

    }
  }
}

// --- Solarize: CVI-style luminance threshold inversion with channel tinting ---
// Pixels above `thresh` luminance are inverted, then their RGB channels are
// individually scaled by solR/solG/solB (1.0 = neutral, 0 = kill, 2 = boost).
// This lets you tint the solarized zone toward any color — electric blue,
// acid green, hot pink — exactly the CVI colorizer-on-luminance-zone behavior.
function applySolarize(buf, thresh = 0.5, amount = 1.0, solR = 1.0, solG = 1.0, solB = 1.0) {
  buf.loadPixels();
  const pix = buf.pixels;
  const t   = thresh * 255;
  const a   = Math.max(0, Math.min(1, amount));
  for (let i = 0; i < pix.length; i += 4) {
    const r = pix[i], g = pix[i+1], b = pix[i+2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > t) {
      // invert
      const ir = 255 - r, ig = 255 - g, ib = 255 - b;
      // blend with original by `amount`, then apply channel tint
      const br = r + (ir - r) * a;
      const bg = g + (ig - g) * a;
      const bb = b + (ib - b) * a;
      pix[i]   = Math.round(Math.min(255, Math.max(0, br * solR)));
      pix[i+1] = Math.round(Math.min(255, Math.max(0, bg * solG)));
      pix[i+2] = Math.round(Math.min(255, Math.max(0, bb * solB)));
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
