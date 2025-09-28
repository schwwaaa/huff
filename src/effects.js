// effects.js — extracted effect helpers (true content)
function updateBurstState(){
  burst.on = !!els.burstOn.checked;
  if (!burst.on) return;
  burst.t += (deltaTime || 16.6) / 1000.0;
  if (burst.inBurst && burst.t >= burst.len) { burst.inBurst = false; burst.t = 0; }
  else if (!burst.inBurst && burst.t >= burst.gap) { burst.inBurst = true; burst.t = 0; }
}

function applyGlitch(density = 1){
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

  if (els.cycleOn.checked) {
    if (els.cycleShape.value === 'sine') {
      const cyc = 0.2 + 0.8 * ((Math.sin(frameCount * 0.1) + 1) * 0.5);
      count = Math.max(1, Math.floor(count * cyc));
    }
  }
  if (burst.on) count = Math.max(1, Math.floor(count * (burst.inBurst ? burst.boost : 0.2)));

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

  if (useCl && k > 0) {
    const centers = [];
    for (let i = 0; i < k; i++) centers.push([Math.floor(random(cols))*block + (block>>1), Math.floor(random(rows))*block + (block>>1)]);
    const per = Math.max(1, Math.floor(count / k));
    for (const c of centers) {
      for (let i = 0; i < per && targets.length < count; i++) {
        const ang = random(TWO_PI), r = random(radius);
        const x = (c[0] + Math.cos(ang)*r + width) % width;
        const y = (c[1] + Math.sin(ang)*r + height) % height;
        let ok = tryAdd(Math.floor(x), Math.floor(y)), tries = 0;
        while (!ok && tries++ < 6) {
          const a2 = random(TWO_PI), r2 = random(radius);
          ok = tryAdd(Math.floor((c[0] + Math.cos(a2)*r2 + width) % width),
                      Math.floor((c[1] + Math.sin(a2)*r2 + height) % height));
        }
      }
    }
    let guard = 0;
    while (targets.length < count && guard++ < count * 4) {
      tryAdd(Math.floor(random(cols))*block, Math.floor(random(rows))*block);
    }
  } else {
    let attempts = 0;
    while (targets.length < count && attempts++ < count * 8) {
      tryAdd(Math.floor(random(cols))*block, Math.floor(random(rows))*block);
    }
  }

  gBuf.push();
  gBuf.imageMode(CORNER);
  for (let i = 0; i < targets.length; i++) {
    let [cx, cy] = targets[i];

    const ox = Math.floor(map(noise(nPhaseX + i*0.013), 0, 1, -block*2, block*2));
    const oy = Math.floor(map(noise(nPhaseY + i*0.017), 0, 1, -block*2, block*2));
    cx = (cx + ox + width) % width;
    cy = (cy + oy + height) % height;

    const w = Math.min(block * (size / 20), width - cx);
    const h = Math.min(block * (size / 20), height - cy);
    if (w <= 0 || h <= 0) continue;

    if (frameRing.length > 0 && maxBack > 0) {
      const back = frameRing.length - 1 - Math.floor(random(1, maxBack + 1));
      const src = frameRing[Math.max(0, back)];
      const tile = src.get(cx, cy, w, h);

      gBuf.image(tile, cx, cy, w, h);

      if (smearLen > 0) {
        for (let s = 1; s <= smearLen; s++) {
          const sx = Math.max(0, Math.min(width - w, cx + Math.round(dxUnit * s)));
          const sy = Math.max(0, Math.min(height - h, cy + Math.round(dyUnit * s)));
          gBuf.image(tile, sx, sy, w, h);
        }
      }
    }
  }
  gBuf.pop();
}

function applyFlowWarp(src, dst, strength = 6, scale = 80) {
  dst.clear();
  const cell = Math.max(8, scale | 0);
  const off  = strength;
  const t = frameCount * 0.005;
  dst.imageMode(CORNER);
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const nx = (x + 0.5 * cell) / width * 2.0;
      const ny = (y + 0.5 * cell) / height * 2.0;
      const a = noise(nx * 0.9 + t, ny * 0.9) * TWO_PI * 2.0;
      const dx = Math.cos(a) * off;
      const dy = Math.sin(a) * off;

      const tileW = Math.min(cell, width - x);
      const tileH = Math.min(cell, height - y);
      const sx = Math.max(0, Math.min(width - tileW, Math.floor(x + dx)));
      const sy = Math.max(0, Math.min(height - tileH, Math.floor(y + dy)));

      const tile = src.get(sx, sy, tileW, tileH);
      dst.image(tile, x, y, tileW, tileH);
    }
  }
}

function applyColorizer(src, dst, hueDeg=20, sat=1.1) {
  dst.clear(); dst.imageMode(CORNER); dst.image(src, 0, 0, dst.width, dst.height); dst.loadPixels();
  const pix = dst.pixels; const H = (((hueDeg % 360) + 360) % 360) / 60, C = sat, u = 0.787, w = 0.213;
  for (let i = 0; i < pix.length; i += 4) {
    const r = pix[i]/255, g = pix[i+1]/255, b = pix[i+2]/255;
    const nr = r + H * (-w*r - u*g + (1-u)*b);
    const ng = g + H * ((1-u)*r - w*g - u*b);
    const nb = b + H * (u*r + (1-u)*g - w*b);
    pix[i]   = Math.round(Math.min(1, Math.max(0, nr*C)) * 255);
    pix[i+1] = Math.round(Math.min(1, Math.max(0, ng*C)) * 255);
    pix[i+2] = Math.round(Math.min(1, Math.max(0, nb*C)) * 255);
  }
  dst.updatePixels();
}
