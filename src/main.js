/* Datamosh Lab — HTML-first defaults; no JS flips at startup */
let videoEl, currentBlobUrl = null;

let gCur, gBuf, gWarp, gBloomWork, gTemp;
let frameRing = [];
let canvas, rec, chunks = [];
let playing = false;

const els = {};
let baseSeed = 1, seededOnce = false;

let nPhaseX = 0, nPhaseY = 1000;
let fbPhaseX = 0, fbPhaseY = 100, fbPhaseR = 200, fbPhaseZ = 300;
const burst = { on: false, inBurst: true, t: 0, len: 2, gap: 3, boost: 3 };

/* Borderless (no-op in browser) */
let isBorderless = false, savedBounds = {};
async function toggleBorderless(){ /* keep stub for desktop builds */ }

/* rVFC-driven copy */
let lastMediaTime = -1;
function blitVideoInto(target){
  target.imageMode(CORNER);
  const vw = videoEl?.elt?.videoWidth || width;
  const vh = videoEl?.elt?.videoHeight || height;
  const s  = Math.max(target.width / vw, target.height / vh);
  const dw = vw * s, dh = vh * s;
  const dx = (target.width  - dw) * 0.5;
  const dy = (target.height - dh) * 0.5;
  target.clear();
  target.image(videoEl, dx, dy, dw, dh);
}
function pumpVideoFrames(){
  if (!videoEl?.elt?.requestVideoFrameCallback) return;
  videoEl.elt.requestVideoFrameCallback((_now, meta) => {
    if (meta?.mediaTime !== undefined && meta.mediaTime !== lastMediaTime) {
      lastMediaTime = meta.mediaTime;
      blitVideoInto(gCur);
    }
    if (!videoEl.elt.paused && !videoEl.elt.ended) pumpVideoFrames();
  });
}

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  allocBuffers();
  clearAll();
  hookUI();
  updateLabels();
  setSeedFromUI();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') { const header = document.querySelector('header'); header.style.display = header.style.display === 'none' ? '' : 'none'; e.preventDefault(); }
    if (e.key === 'f' || e.key === 'F') { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); e.preventDefault(); }
  }, true);
}

function allocBuffers() {
  gCur = createGraphics(width, height);
  gBuf = createGraphics(width, height);
  gWarp = createGraphics(width, height);
  gBloomWork = createGraphics(width, height);
  gTemp = createGraphics(width, height);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  allocBuffers();
  clearAll();
  updateDim();
}

function clearAll() {
  [gBuf, gWarp, gBloomWork, gTemp].forEach(g => g.clear());
  frameRing.length = 0;
  seededOnce = false;
}

function $(id){ return document.getElementById(id); }

function hookUI() {
  [
    'file','playBtn','pauseBtn','recBtn','refreshBtn','borderlessBtn','dim',
    'quality','qualityVal',
    'depth','depthVal','corruptOn','corrupt','corruptVal','block','blockVal',
    'glitchSpeed','glitchSpeedVal','glitchSpeedFine','glitchSpeedFineVal',
    'glitchSize','glitchSizeVal','glitchSmear','glitchSmearVal',
    'seed','feedback','feedbackVal','persistence','persistenceVal',
    'fbX','fbXVal','fbY','fbYVal','fbZ','fbZVal','fbTheta','fbThetaVal',
    'fbAuto','fbSpeed','fbSpeedVal','fbMoveX','fbMoveY','fbMoveZ','fbMoveTheta',
    'spatialGap','spatialGapVal','clusters','clusterCount','clusterCountVal','clusterRadius','clusterRadiusVal',
    'cycleOn','cycleShape',
    'burstOn','burstLen','burstLenVal','burstGap','burstGapVal','burstBoost','burstBoostVal',
    'bloomOn','bloomStrength','bloomStrengthVal','bloomRadius','bloomRadiusVal',
    'flowOn','flowStrength','flowStrengthVal','flowScale','flowScaleVal',
    'baseOn','baseMix','baseMixVal','seedOnLoad',
    'psOn','psDir','psWin','psWinVal','psThresh','psThreshVal','psChan',
    'colOn','colHue','colHueVal','colSat','colSatVal'
  ].forEach(k => els[k] = $(k));

  // loader + playback
  els.file.addEventListener('change', onFile);
  els.playBtn.addEventListener('click', async () => {
    if (!videoEl) return;
    try {
      videoEl.elt.muted = false;
      videoEl.elt.volume = 1.0;
      videoEl.elt.setAttribute('playsinline','');
      await videoEl.elt.play();
    } catch (e) {
      // fallback: allow muted autoplay if audio is blocked
      try { videoEl.elt.muted = true; await videoEl.elt.play(); } catch {}
    }
    pumpVideoFrames();
    videoEl.loop();
    playing = true;
  });
  els.pauseBtn.addEventListener('click', () => { if (!videoEl) return; try{videoEl.elt.pause();}catch{} videoEl.pause(); playing=false; });
  els.recBtn.addEventListener('click', toggleRecord);
  els.refreshBtn.addEventListener('click', refreshGlitch);
  if (els.borderlessBtn) els.borderlessBtn.addEventListener('click', toggleBorderless);

  // labels only; NO default flipping here
  els.seed.addEventListener('change', setSeedFromUI);
  ['quality','depth','corrupt','block','glitchSpeed','glitchSpeedFine','glitchSize','glitchSmear',
   'feedback','persistence','fbX','fbY','fbZ','fbTheta','fbSpeed',
   'spatialGap','clusterCount','clusterRadius',
   'burstLen','burstGap','burstBoost',
   'bloomStrength','bloomRadius','flowStrength','flowScale',
   'baseMix','psWin','psThresh','colHue','colSat'].forEach(id => els[id].addEventListener('input', updateLabels));
  ['cycleShape','psDir','psChan'].forEach(id => els[id].addEventListener('change', updateLabels));
  els.baseOn.addEventListener('change', () => { els.baseMix.disabled = !els.baseOn.checked; updateLabels(); });

  updateDim();
}

function updateDim(){ if (els.dim) els.dim.textContent = `${width}×${height}`; }

function updateLabels() {
  const f2 = v => (+v).toFixed(2);
  if (els.quality) els.qualityVal.textContent = f2(els.quality.value);
  els.depthVal.textContent = f2(els.depth.value);
  els.corruptVal.textContent = f2(els.corrupt.value);
  els.blockVal.textContent = els.block.value;
  els.glitchSpeedVal.textContent = f2(els.glitchSpeed.value);
  els.glitchSpeedFineVal.textContent = f2(els.glitchSpeedFine.value);
  els.glitchSizeVal.textContent = els.glitchSize.value;
  els.glitchSmearVal.textContent = els.glitchSmear.value;
  els.feedbackVal.textContent = f2(els.feedback.value);
  els.persistenceVal.textContent = f2(els.persistence.value);
  els.fbXVal.textContent = els.fbX.value;
  els.fbYVal.textContent = els.fbY.value;
  els.fbZVal.textContent = (+els.fbZ.value).toFixed(2);
  els.fbThetaVal.textContent = els.fbTheta.value;
  els.fbSpeedVal.textContent = f2(els.fbSpeed.value);
  els.spatialGapVal.textContent = els.spatialGap.value;
  els.clusterCountVal.textContent = els.clusterCount.value;
  els.clusterRadiusVal.textContent = els.clusterRadius.value;
  els.burstLenVal.textContent = f2(els.burstLen.value);
  els.burstGapVal.textContent = f2(els.burstGap.value);
  els.burstBoostVal.textContent = f2(els.burstBoost.value);
  els.bloomStrengthVal.textContent = f2(els.bloomStrength.value);
  els.bloomRadiusVal.textContent = els.bloomRadius.value;
  els.flowStrengthVal.textContent = els.flowStrength.value;
  els.flowScaleVal.textContent = els.flowScale.value;
  els.baseMixVal.textContent = f2(els.baseMix.value);
  els.baseMix.disabled = !els.baseOn.checked;
  els.psWinVal.textContent = els.psWin.value;
  els.psThreshVal.textContent = els.psThresh.value;
  els.colHueVal.textContent = els.colHue.value;
  els.colSatVal.textContent = (+els.colSat.value).toFixed(2);
}

function setSeedFromUI(){ baseSeed = parseInt(els.seed.value || '1', 10); if (isNaN(baseSeed)) baseSeed = 1; noiseSeed(baseSeed); }

/* File load + AUTOPLAY after video is ready */
function onFile(ev){
  const file = ev.target.files?.[0]; if (!file) return;

  if (videoEl) { try{ videoEl.remove(); }catch{} videoEl = null; }
  if (currentBlobUrl) { try{ URL.revokeObjectURL(currentBlobUrl); }catch{} currentBlobUrl = null; }

  const url = URL.createObjectURL(file); currentBlobUrl = url;

  videoEl = createVideo([url], () => {
    ['playBtn','pauseBtn','recBtn','refreshBtn','borderlessBtn']
      .forEach(id => { const b = document.getElementById(id); if (b) b.disabled = false; });
  });

  videoEl.attribute('preload','metadata');
  videoEl.attribute('playsinline','');
  videoEl.hide();
  videoEl.elt.muted = false;
  videoEl.elt.volume = 1.0;

  let primed = false;
  const prime = async () => {
    if (primed) return;
    if (videoEl.elt.videoWidth > 0 && videoEl.elt.videoHeight > 0) {
      primed = true;
      clearAll(); updateDim();

      try {
        videoEl.elt.muted = false;
        videoEl.elt.volume = 1.0;
        videoEl.elt.setAttribute('playsinline','');
        await videoEl.elt.play();          // try with sound
      } catch (e) {
        try { videoEl.elt.muted = true; await videoEl.elt.play(); } catch {}
      }

      pumpVideoFrames();
      videoEl.loop();
      playing = true;
    }
  };
  videoEl.elt.addEventListener('loadeddata', prime, { once: true });
  if (videoEl.elt.requestVideoFrameCallback) videoEl.elt.requestVideoFrameCallback(() => prime());
}

function draw(){
  background(0);
  if (!videoEl) { drawWaiting(); return; }

  randomSeed(baseSeed + frameCount); noiseSeed(baseSeed);

  if (!videoEl.elt.requestVideoFrameCallback) blitVideoInto(gCur);

  // Seed-on-load is OFF by default; honored here
  if (!seededOnce && els.seedOnLoad.checked) { gBuf.image(gCur, 0, 0, gBuf.width, gBuf.height); seededOnce = true; }

  const pers = parseFloat(els.persistence.value);
  if (pers < 1) {
    gBuf.push(); gBuf.noStroke();
    gBuf.drawingContext.globalCompositeOperation = 'destination-out';
    const decay = map(1 - pers, 0, 1, 1, 20);
    gBuf.fill(0,0,0,decay); gBuf.rect(0,0,gBuf.width,gBuf.height);
    gBuf.pop(); gBuf.drawingContext.globalCompositeOperation = 'source-over';
  }

  const coarse = parseFloat(els.glitchSpeed.value);
  const fine   = parseFloat(els.glitchSpeedFine.value || 1);
  const density = coarse * fine;
  nPhaseX += density * 0.01; nPhaseY += density * 0.011;

  updateBurstState();

  const Q = parseFloat(els.quality.value);
  const everyN  = Q >= 0.9 ? 1 : Q >= 0.7 ? 2 : Q >= 0.5 ? 3 : 4;

  applyGlitch(density);

  const fb = parseFloat(els.feedback.value);
  if (fb > 0) {
    let fx = parseFloat(els.fbX.value) || 0;
    let fy = parseFloat(els.fbY.value) || 0;
    let fz = parseFloat(els.fbZ.value) || 1;
    let ft = radians(parseFloat(els.fbTheta.value) || 0);

    if (els.fbAuto.checked) {
      const sp = parseFloat(els.fbSpeed.value);
      fbPhaseX += sp * 0.005;
      fbPhaseY += sp * 0.006;
      fbPhaseR += sp * 0.004;
      fbPhaseZ += sp * 0.003;
      if (els.fbMoveX.checked)      fx += map(noise(fbPhaseX), 0, 1, -20, 20);
      if (els.fbMoveY.checked)      fy += map(noise(fbPhaseY), 0, 1, -20, 20);
      if (els.fbMoveTheta.checked)  ft += radians(map(noise(fbPhaseR), 0, 1, -10, 10));
      if (els.fbMoveZ.checked)      fz *= 1.0 + map(noise(fbPhaseZ), 0, 1, -0.01, 0.01);
    }

    const tmp = gBuf.get();
    gBuf.clear(); gBuf.push();
    gBuf.tint(255, fb * 255);
    gBuf.imageMode(CENTER);
    gBuf.translate(gBuf.width/2, gBuf.height/2);
    gBuf.rotate(ft); gBuf.scale(fz);
    gBuf.image(tmp, fx, fy, gBuf.width, gBuf.height);
    gBuf.pop();
  }

  if (els.flowOn.checked) {
    const flowS = parseInt(els.flowStrength.value, 10);
    const flowScale = parseInt(els.flowScale.value, 10);
    if (flowS > 0 && (frameCount % (Q >= 0.9 ? 1 : Q >= 0.7 ? 2 : Q >= 0.5 ? 3 : 4) === 0)) {
      applyFlowWarp(gBuf, gWarp, flowS, flowScale);
      const t = gBuf; gBuf = gWarp; gWarp = t;
    }
  }

  const bloomK = parseFloat(els.bloomStrength.value);
  const bloomR = parseInt(els.bloomRadius.value, 10);
  if (els.bloomOn.checked && bloomK > 0 && bloomR > 0) {
    gBloomWork.clear(); gBloomWork.imageMode(CORNER);
    gBloomWork.image(gBuf, 0, 0, gBloomWork.width, gBloomWork.height);
    gBloomWork.filter(BLUR, bloomR);
    gBuf.push(); gBuf.imageMode(CORNER); gBuf.blendMode(ADD);
    gBuf.tint(255, Math.min(2, bloomK) * 255);
    gBuf.image(gBloomWork, 0, 0, gBuf.width, gBuf.height); gBuf.pop();
  }

  if (els.psOn.checked) {
    applyPixelSort(gBuf, gTemp, els.psDir.value,
      parseInt(els.psWin.value, 10),
      parseInt(els.psThresh.value, 10),
      els.psChan.value);
    const t = gBuf; gBuf = gTemp; gTemp = t;
  }

  if (els.colOn && els.colOn.checked) {
    applyColorizer(gBuf, gTemp, parseInt(els.colHue.value, 10), parseFloat(els.colSat.value));
    const t = gBuf; gBuf = gTemp; gTemp = t;
  }

  if (els.baseOn.checked && parseFloat(els.baseMix.value) > 0) {
    push(); tint(255, parseFloat(els.baseMix.value) * 255); image(gCur, 0, 0, width, height); pop();
  }
  image(gBuf, 0, 0, width, height);

  const ringCap = Math.round(60 * (parseFloat(els.quality.value) * 2));
  frameRing.push(gCur.get());
  if (frameRing.length > ringCap) frameRing.shift();
}

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
  const tryAdd = (x,y) => {
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

function applyPixelSort(src, dst, dir='h', win=48, thresh=140, chan='luma') {
  dst.clear(); dst.imageMode(CORNER); dst.image(src, 0, 0, dst.width, dst.height); dst.loadPixels();
  const w = dst.width, h = dst.height, pix = dst.pixels;
  const lum = (r,g,b) => (0.299*r + 0.587*g + 0.114*b) | 0;
  const cmpVal = (r,g,b) => chan==='r'?r:chan==='g'?g:chan==='b'?b:lum(r,g,b);
  if (dir === 'h') {
    for (let y = 0; y < h; y++) {
      for (let x0 = 0; x0 < w; x0 += win) {
        const x1 = Math.min(w, x0 + win), vals = [];
        for (let x = x0; x < x1; x++) { const i = (y*w + x) * 4; vals.push(cmpVal(pix[i], pix[i+1], pix[i+2])); }
        const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
        if (avg >= thresh) {
          for (let pass = 0; pass < vals.length-1; pass++) {
            for (let xi = x0; xi < x1-1; xi++) {
              const i = (y*w + xi) * 4, j = (y*w + xi + 1) * 4;
              const vi = cmpVal(pix[i],pix[i+1],pix[i+2]), vj = cmpVal(pix[j],pix[j+1],pix[j+2]);
              if (vi > vj) { for (let c=0;c<4;c++){ const t=pix[i+c]; pix[i+c]=pix[j+c]; pix[j+c]=t; } }
            }
          }
        }
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      for (let y0 = 0; y0 < h; y0 += win) {
        const y1 = Math.min(h, y0 + win), vals = [];
        for (let y = y0; y < y1; y++) { const i = (y*w + x) * 4; vals.push(cmpVal(pix[i], pix[i+1], pix[i+2])); }
        const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
        if (avg >= thresh) {
          for (let pass = 0; pass < vals.length-1; pass++) {
            for (let yi = y0; yi < y1-1; yi++) {
              const i = (yi*w + x) * 4, j = ((yi+1)*w + x) * 4;
              const vi = cmpVal(pix[i],pix[i+1],pix[i+2]), vj = cmpVal(pix[j],pix[j+1],pix[j+2]);
              if (vi > vj) { for (let c=0;c<4;c++){ const t=pix[i+c]; pix[i+c]=pix[j+c]; pix[j+c]=t; } }
            }
          }
        }
      }
    }
  }
  dst.updatePixels();
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

function toggleRecord(){
  if (rec && rec.state === 'recording') { rec.stop(); els.recBtn.textContent='● Record'; return; }
  chunks=[]; const stream=canvas.elt.captureStream(30);
  let opts; try{ opts={ mimeType:'video/webm;codecs=vp9' }; }catch{}
  try{ rec = new MediaRecorder(stream, opts); }catch{ rec = new MediaRecorder(stream); }
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type:'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='moshed.webm'; a.click();
    URL.revokeObjectURL(url);
  };
  rec.start(); els.recBtn.textContent='⏹ Stop';
}

function refreshGlitch(){
  clearAll();
  nPhaseX=0; nPhaseY=1000;
  fbPhaseX=0; fbPhaseY=100; fbPhaseR=200; fbPhaseZ=300;
  burst.t=0; burst.inBurst=true;
}

function drawWaiting(){
  noStroke(); fill(255,20); rect(0,0,width,height);
  fill(220); textAlign(CENTER,CENTER); textSize(14);
  text('Load a video. P: toggle UI • F: fullscreen', width/2, height/2);
}
