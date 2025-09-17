/* p5 Datamosh — Raw-video Brightness/Contrast + Corrupt extras (Count×, Size jitter %, Blend, Sample)
   Keeps your existing pipeline & UI.
*/
let videoEl;
let gCur, gBuf, gWarp, gBloomWork, gTemp;

let frameRing = [];
let maxRing = 180;
let canvas;
let rec, chunks = [];
let playing = false;

const els = {};
let timeAcc = 0;
let nPhaseX = 0, nPhaseY = 1000;
let cyclePhase = 0;
let baseSeed = 1;
let seededOnce = false;

// burst state
let burstState = { enabled: false, inBurst: true, t: 0, len: 2, gap: 3, boost: 3 };

function setup() {
  canvas = createCanvas(960, 540);
  pixelDensity(1);

  gCur = createGraphics(width, height);
  gBuf = createGraphics(width, height);
  gWarp = createGraphics(width, height);
  gBloomWork = createGraphics(width, height);
  gTemp = createGraphics(width, height);

  clearAll();
  hookUI();
  updateLabels();
  setSeedFromUI();
}

function clearAll() {
  gBuf.clear(); gWarp.clear(); gBloomWork.clear(); gTemp.clear();
  frameRing = [];
  seededOnce = false;
}

function hookUI() {
  const $ = id => document.getElementById(id);
  // buttons
  els.file = $('file'); els.play = $('playBtn'); els.pause = $('pauseBtn');
  els.rec = $('recBtn'); els.refresh = $('refreshBtn'); els.dim = $('dim');

  // raw video tone
  els.vidBright = $('vidBright'); els.vidBrightVal = $('vidBrightVal');
  els.vidContrast = $('vidContrast'); els.vidContrastVal = $('vidContrastVal');

  // core
  els.depth = $('depth'); els.depthVal = $('depthVal');
  els.corruptOn = $('corruptOn');
  els.corrupt = $('corrupt'); els.corruptVal = $('corruptVal');
  els.block = $('block'); els.blockVal = $('blockVal');

  // cadence
  els.glitchSpeed = $('glitchSpeed'); els.glitchSpeedVal = $('glitchSpeedVal');
  els.glitchSpeedFine = $('glitchSpeedFine'); els.glitchSpeedFineVal = $('glitchSpeedFineVal');
  els.glitchSize = $('glitchSize'); els.glitchSizeVal = $('glitchSizeVal');
  els.glitchSmear = $('glitchSmear'); els.glitchSmearVal = $('glitchSmearVal');

  // corrupt advanced (existing)
  els.corruptAlpha = $('corruptAlpha'); els.corruptAlphaVal = $('corruptAlphaVal');
  els.jitter = $('jitter'); els.jitterVal = $('jitterVal');
  els.backMin = $('backMin'); els.backMinVal = $('backMinVal');
  els.backMax = $('backMax'); els.backMaxVal = $('backMaxVal');
  els.smearAuto = $('smearAuto');
  els.smearAngle = $('smearAngle'); els.smearAngleVal = $('smearAngleVal');
  els.smearFade = $('smearFade'); els.smearFadeVal = $('smearFadeVal');

  // corrupt NEW extras
  els.corruptCountMul = $('corruptCountMul'); els.corruptCountMulVal = $('corruptCountMulVal');
  els.sizeJitter = $('sizeJitter'); els.sizeJitterVal = $('sizeJitterVal');
  els.corruptBlend = $('corruptBlend');
  els.corruptSample = $('corruptSample');

  // determinism & evolution
  els.seed = $('seed');
  els.feedback = $('feedback'); els.feedbackVal = $('feedbackVal');
  els.persistence = $('persistence'); els.persistenceVal = $('persistenceVal');
  els.fbX = $('fbX'); els.fbXVal = $('fbXVal');
  els.fbY = $('fbY'); els.fbYVal = $('fbYVal');
  els.fbZ = $('fbZ'); els.fbZVal = $('fbZVal');
  els.fbTheta = $('fbTheta'); els.fbThetaVal = $('fbThetaVal');

  // spatial/clusters
  els.spatialGap = $('spatialGap'); els.spatialGapVal = $('spatialGapVal');
  els.clusters = $('clusters');
  els.clusterCount = $('clusterCount'); els.clusterCountVal = $('clusterCountVal');
  els.clusterRadius = $('clusterRadius'); els.clusterRadiusVal = $('clusterRadiusVal');

  // cycle + bursts
  els.cycleOn = $('cycleOn'); els.cycleShape = $('cycleShape');
  els.burstOn = $('burstOn'); els.burstLen = $('burstLen'); els.burstLenVal = $('burstLenVal');
  els.burstGap = $('burstGap'); els.burstGapVal = $('burstGapVal');
  els.burstBoost = $('burstBoost'); els.burstBoostVal = $('burstBoostVal');

  // Flow + Bloom
  els.bloomOn = $('bloomOn'); els.bloomStrength = $('bloomStrength'); els.bloomStrengthVal = $('bloomStrengthVal');
  els.bloomRadius = $('bloomRadius'); els.bloomRadiusVal = $('bloomRadiusVal');
  els.flowOn = $('flowOn'); els.flowStrength = $('flowStrength'); els.flowStrengthVal = $('flowStrengthVal');
  els.flowScale = $('flowScale'); els.flowScaleVal = $('flowScaleVal');

  // Base + seed behavior
  els.baseOn = $('baseOn'); els.baseMix = $('baseMix'); els.baseMixVal = $('baseMixVal');
  els.seedOnLoad = $('seedOnLoad');

  // Pixel Sort
  els.psOn = $('psOn'); els.psDir = $('psDir');
  els.psWin = $('psWin'); els.psWinVal = $('psWinVal');
  els.psThresh = $('psThresh'); els.psThreshVal = $('psThreshVal');
  els.psChan = $('psChan');

  // Colorizer
  els.colOn = $('colOn'); els.colHue = $('colHue'); els.colHueVal = $('colHueVal');
  els.colSat = $('colSat'); els.colSatVal = $('colSatVal');

  // events
  els.file.addEventListener('change', onFile);
  els.play.addEventListener('click', () => { if (videoEl) { videoEl.loop(); playing = true; } });
  els.pause.addEventListener('click', () => { if (videoEl) { videoEl.pause(); playing = false; }});
  els.rec.addEventListener('click', toggleRecord);
  els.refresh.addEventListener('click', refreshGlitch);
  els.seed.addEventListener('change', setSeedFromUI);
  els.burstOn.addEventListener('change', () => {
    burstState.enabled = !!els.burstOn.checked; burstState.t = 0; burstState.inBurst = true;
  });
  els.baseOn.addEventListener('change', () => { els.baseMix.disabled = !els.baseOn.checked; updateLabels(); });
  els.cycleOn.addEventListener('change', () => { els.cycleShape.disabled = !els.cycleOn.checked; });

  [
    'depth','corrupt','block',
    'vidBright','vidContrast',
    'glitchSpeed','glitchSpeedFine','glitchSize','glitchSmear',
    'corruptAlpha','jitter','backMin','backMax','smearAngle','smearFade',
    'corruptCountMul','sizeJitter',
    'feedback','persistence','fbX','fbY','fbZ','fbTheta',
    'spatialGap','clusterCount','clusterRadius',
    'burstLen','burstGap','burstBoost',
    'bloomStrength','bloomRadius','flowStrength','flowScale',
    'baseMix','psWin','psThresh','colHue','colSat'
  ].forEach(k => els[k]?.addEventListener('input', updateLabels));

  ['cycleShape','psDir','psChan','corruptBlend','corruptSample'].forEach(k => els[k]?.addEventListener('change', updateLabels));
}

function updateLabels() {
  const f2 = v => (+v).toFixed(2);
  els.depthVal.textContent = f2(els.depth.value);
  els.corruptVal.textContent = f2(els.corrupt.value);
  els.blockVal.textContent = els.block.value;

  els.vidBrightVal.textContent = f2(els.vidBright.value);
  els.vidContrastVal.textContent = f2(els.vidContrast.value);

  els.glitchSpeedVal.textContent = f2(els.glitchSpeed.value);
  els.glitchSpeedFineVal.textContent = f2(els.glitchSpeedFine.value);
  els.glitchSizeVal.textContent = els.glitchSize.value;
  els.glitchSmearVal.textContent = els.glitchSmear.value;

  els.corruptAlphaVal.textContent = f2(els.corruptAlpha.value);
  els.jitterVal.textContent = els.jitter.value;
  els.backMinVal.textContent = f2(els.backMin.value);
  els.backMaxVal.textContent = f2(els.backMax.value);
  els.smearAngleVal.textContent = els.smearAngle.value;
  els.smearFadeVal.textContent = f2(els.smearFade.value);
  els.smearAngle.disabled = !!els.smearAuto.checked;

  els.corruptCountMulVal.textContent = (+els.corruptCountMul.value).toFixed(1);
  els.sizeJitterVal.textContent = els.sizeJitter.value;

  els.feedbackVal.textContent = f2(els.feedback.value);
  els.persistenceVal.textContent = f2(els.persistence.value);
  els.fbXVal.textContent = els.fbX.value;
  els.fbYVal.textContent = els.fbY.value;
  els.fbZVal.textContent = (+els.fbZ.value).toFixed(2);
  els.fbThetaVal.textContent = els.fbTheta.value;

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

  els.cycleShape.disabled = !els.cycleOn.checked;

  els.psWinVal.textContent = els.psWin.value;
  els.psThreshVal.textContent = els.psThresh.value;
  els.colHueVal.textContent = els.colHue.value;
  els.colSatVal.textContent = (+els.colSat.value).toFixed(2);
}

function setSeedFromUI() {
  baseSeed = parseInt(els.seed.value || '1', 10);
  if (isNaN(baseSeed)) baseSeed = 1;
  noiseSeed(baseSeed);
}

function onFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (videoEl) { videoEl.remove(); videoEl = null; }

  const url = URL.createObjectURL(file);
  videoEl = createVideo([url], onVideoReady);
  videoEl.elt.volume = 1.0;
  videoEl.volume(1);
  videoEl.hide();
}

function onVideoReady() {
  const vw = videoEl.elt.videoWidth || 960;
  const vh = videoEl.elt.videoHeight || 540;
  const { w, h } = fitWithin(vw, vh, 1280, 720);
  resizeCanvas(w, h);

  gCur = createGraphics(width, height);
  gBuf = createGraphics(width, height);
  gWarp = createGraphics(width, height);
  gBloomWork = createGraphics(width, height);
  gTemp = createGraphics(width, height);
  clearAll();

  els.dim.textContent = `${width}×${height}`;
  els.play.disabled = false; els.pause.disabled = false;
  els.rec.disabled = false; els.refresh.disabled = false;
}

/* ---------------- Main Draw ---------------- */
function draw() {
  background(0);
  if (!videoEl) { drawWaiting(); return; }

  randomSeed(baseSeed + frameCount);
  noiseSeed(baseSeed);

  // current raw video
  gCur.image(videoEl, 0, 0, gCur.width, gCur.height);

  // Raw-video Brightness/Contrast (pre-FX, pre-history)
  const b = parseFloat(els.vidBright.value);
  const c = parseFloat(els.vidContrast.value);
  if (b !== 0 || c !== 0) applyBrightnessContrast(gCur, b, c);

  // seed-on-load -> buffer
  if (!seededOnce && document.getElementById('seedOnLoad').checked) {
    gBuf.image(gCur, 0, 0, gBuf.width, gBuf.height);
    seededOnce = true;
  }

  // persistence fade
  const pers = parseFloat(els.persistence.value);
  if (pers < 1) {
    gBuf.push();
    gBuf.noStroke();
    gBuf.drawingContext.globalCompositeOperation = 'destination-out';
    const decay = map(1.0 - pers, 0, 1, 1, 20);
    gBuf.fill(0, 0, 0, decay);
    gBuf.rect(0, 0, gBuf.width, gBuf.height);
    gBuf.pop();
    gBuf.drawingContext.globalCompositeOperation = 'source-over';
  }

  // cadence & drift
  const coarse = parseFloat(els.glitchSpeed.value);
  const fine   = parseFloat(els.glitchSpeedFine.value || 1);
  const rate   = coarse * fine;
  timeAcc += rate / 60;
  nPhaseX += rate * 0.01;
  nPhaseY += rate * 0.011;
  cyclePhase += rate * 0.10;

  updateBurstState();

  if (timeAcc >= 1.0) { timeAcc -= 1.0; applyGlitch(); }

  // feedback echo (XYZ + rotation)
  const fb = parseFloat(els.feedback.value);
  if (fb > 0) {
    const tmp = gBuf.get();
    gBuf.clear();
    gBuf.push();
    gBuf.tint(255, fb * 255);
    gBuf.imageMode(CENTER);
    const fx = parseFloat(els.fbX.value) || 0;
    const fy = parseFloat(els.fbY.value) || 0;
    const fz = parseFloat(els.fbZ.value) || 1;
    const ft = radians(parseFloat(els.fbTheta.value) || 0);
    gBuf.translate(gBuf.width / 2, gBuf.height / 2);
    gBuf.rotate(ft);
    gBuf.scale(fz);
    gBuf.image(tmp, fx, fy, gBuf.width, gBuf.height);
    gBuf.pop();
  }

  // Flow warp
  const flowS = parseInt(els.flowStrength.value, 10);
  if (els.flowOn.checked && flowS > 0) {
    applyFlowWarp(gBuf, gWarp, flowS, parseInt(els.flowScale.value, 10));
    const tmp = gBuf; gBuf = gWarp; gWarp = tmp;
  }

  // Bloom
  const bloomK = parseFloat(els.bloomStrength.value);
  const bloomR = parseInt(els.bloomRadius.value, 10);
  if (els.bloomOn.checked && bloomK > 0 && bloomR > 0) {
    gBloomWork.clear();
    gBloomWork.imageMode(CORNER);
    gBloomWork.image(gBuf, 0, 0, gBloomWork.width, gBloomWork.height);
    for (let i = 0; i < 2; i++) { gBloomWork.filter(BLUR, bloomR); }
    gBuf.push(); gBuf.imageMode(CORNER); gBuf.blendMode(ADD);
    gBuf.tint(255, constrain(bloomK, 0, 2) * 255);
    gBuf.image(gBloomWork, 0, 0, gBuf.width, gBuf.height);
    gBuf.pop();
  }

  // Pixel Sort
  if (els.psOn.checked) {
    applyPixelSort(gBuf, gTemp, els.psDir.value, parseInt(els.psWin.value, 10),
      parseInt(els.psThresh.value, 10), els.psChan.value);
    let t = gBuf; gBuf = gTemp; gTemp = t;
  }

  // Colorizer
  if (els.colOn.checked) {
    applyColorizer(gBuf, gTemp, parseInt(els.colHue.value, 10), parseFloat(els.colSat.value));
    let t = gBuf; gBuf = gTemp; gTemp = t;
  }

  // Present (with optional base mix)
  const baseOn = !!els.baseOn.checked;
  const baseMix = parseFloat(els.baseMix.value);
  if (baseOn && baseMix > 0) {
    push(); tint(255, baseMix * 255); image(gCur, 0, 0, width, height); pop();
  }
  image(gBuf, 0, 0, width, height);

  // push raw to history
  frameRing.push(gCur.get());
  if (frameRing.length > maxRing) frameRing.shift();
}

function updateBurstState() {
  burstState.enabled = !!els.burstOn.checked;
  if (!burstState.enabled) return;
  burstState.t += (deltaTime || 16.6) / 1000.0;
  if (burstState.inBurst && burstState.t >= burstState.len) {
    burstState.inBurst = false; burstState.t = 0;
  } else if (!burstState.inBurst && burstState.t >= burstState.gap) {
    burstState.inBurst = true; burstState.t = 0;
  }
}

// -------- Corrupt effect (separate), with extra manual controls
function applyGlitch() {
    if (!els.corruptOn.checked) return; // NEW: hard off

    const block = parseInt(els.block.value, 10);
    const size = parseInt(els.glitchSize.value, 10);
    const smearLen = parseInt(els.glitchSmear.value, 10);
    const corruptFrac = parseFloat(els.corrupt.value);

    const cols = Math.floor(width / block);
    const rows = Math.floor(height / block);
    const total = cols * rows;

    const depth = parseFloat(els.depth.value);
    const maxBack = Math.max(1, Math.floor((frameRing.length - 1) * depth));

    // cycle
    let cycleMod = 1.0;
    if (els.cycleOn.checked) {
        if (els.cycleShape.value === 'sine') {
            cycleMod = 0.2 + 0.8 * ((Math.sin(cyclePhase) + 1) * 0.5);
        } else { cycleMod = 1.0; }
    }

    // base count then cycle + bursts
    const baseCount = Math.max(1, Math.floor(total * corruptFrac));
    let burstMod = 1.0;
    if (burstState.enabled) burstMod = burstState.inBurst ? burstState.boost : 0.2;
    let num = Math.max(1, Math.floor(baseCount * cycleMod * burstMod));

    const gap = parseInt(els.spatialGap.value, 10);
    const useClusters = !!els.clusters.checked;
    const k = parseInt(els.clusterCount.value, 10);
    const radius = parseInt(els.clusterRadius.value, 10);

    const dxUnit = map(noise(nPhaseX), 0, 1, -1, 1);
    const dyUnit = map(noise(nPhaseY), 0, 1, -1, 1);

    const targets = [];
    const tryAdd = (x, y) => {
        if (gap <= 0) { targets.push([x, y]); return true; }
        for (const t of targets) {
            const dx = x - t[0],
                dy = y - t[1];
            if (dx * dx + dy * dy < gap * gap) return false;
        }
        targets.push([x, y]);
        return true;
    };

    randomSeed(baseSeed + frameCount);

    if (useClusters && k > 0) {
        const centers = [];
        for (let i = 0; i < k; i++) {
            centers.push([
                Math.floor(random(cols)) * block + (block >> 1),
                Math.floor(random(rows)) * block + (block >> 1)
            ]);
        }
        const per = Math.max(1, Math.floor(num / k));
        for (const c of centers) {
            for (let i = 0; i < per && targets.length < num; i++) {
                const ang = random(TWO_PI);
                const r = random(radius);
                const x = (c[0] + Math.cos(ang) * r + width) % width;
                const y = (c[1] + Math.sin(ang) * r + height) % height;
                let ok = tryAdd(Math.floor(x), Math.floor(y)),
                    tries = 0;
                while (!ok && tries++ < 8) {
                    const a2 = random(TWO_PI),
                        r2 = random(radius);
                    ok = tryAdd(
                        Math.floor((c[0] + Math.cos(a2) * r2 + width) % width),
                        Math.floor((c[1] + Math.sin(a2) * r2 + height) % height)
                    );
                }
            }
        }
        let guard = 0;
        while (targets.length < num && guard++ < num * 5) {
            const x = Math.floor(random(cols)) * block;
            const y = Math.floor(random(rows)) * block;
            tryAdd(x, y);
        }
    } else {
        let attempts = 0;
        while (targets.length < num && attempts++ < num * 10) {
            const x = Math.floor(random(cols)) * block;
            const y = Math.floor(random(rows)) * block;
            tryAdd(x, y);
        }
    }

    for (let i = 0; i < targets.length; i++) {
        let [cx, cy] = targets[i];
        const ox = Math.floor(map(noise(nPhaseX + i * 0.013), 0, 1, -block * 2, block * 2));
        const oy = Math.floor(map(noise(nPhaseY + i * 0.017), 0, 1, -block * 2, block * 2));
        cx = (cx + ox + width) % width;
        cy = (cy + oy + height) % height;

        const w = Math.min(block * (size / 20), width - cx);
        const h = Math.min(block * (size / 20), height - cy);
        if (w <= 0 || h <= 0) continue;

        if (frameRing.length > 0 && maxBack > 0) {
            const back = frameRing.length - 1 - Math.floor(random(1, maxBack + 1));
            const src = frameRing[Math.max(0, back)];
            const tile = src.get(cx, cy, w, h);

            gBuf.imageMode(CORNER);
            gBuf.image(tile, cx, cy, w, h);

            const smearLen = parseInt(els.glitchSmear.value, 10);
            if (smearLen > 0) {
                for (let s = 1; s <= smearLen; s++) {
                    const sx = Math.max(0, Math.min(width - w, cx + Math.round(dxUnit * s)));
                    const sy = Math.max(0, Math.min(height - h, cy + Math.round(dyUnit * s)));
                    gBuf.image(tile, sx, sy, w, h);
                }
            }
        }
    }
}


/* ------------ Flow Warp --------------- */
function applyFlowWarp(src, dst, strength = 6, scale = 80) {
  dst.clear();
  const cell = max(8, scale | 0);
  const off = strength;
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

/* ---------------- Pixel Sort ---------------- */
function applyPixelSort(src, dst, dir = 'h', win = 48, thresh = 140, chan = 'luma') {
  dst.clear();
  dst.image(src, 0, 0, dst.width, dst.height);
  dst.loadPixels();

  const w = dst.width, h = dst.height;
  const pix = dst.pixels; // RGBA

  const getVal = (i) => {
    const r = pix[i], g = pix[i + 1], b = pix[i + 2];
    if (chan === 'r') return r;
    if (chan === 'g') return g;
    if (chan === 'b') return b;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; // luma
  };

  if (dir === 'h') {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x += win) {
        const xEnd = Math.min(w, x + win);
        let qualifies = false;
        for (let xx = x; xx < xEnd; xx++) {
          const idx = 4 * (y * w + xx);
          if (getVal(idx) >= thresh) { qualifies = true; break; }
        }
        if (!qualifies) continue;
        const seg = [];
        for (let xx = x; xx < xEnd; xx++) {
          const idx = 4 * (y * w + xx);
          seg.push([getVal(idx), pix[idx], pix[idx + 1], pix[idx + 2], pix[idx + 3]]);
        }
        seg.sort((a, b) => a[0] - b[0]);
        for (let xx = x, k = 0; xx < xEnd; xx++, k++) {
          const idx = 4 * (y * w + xx);
          pix[idx] = seg[k][1];
          pix[idx + 1] = seg[k][2];
          pix[idx + 2] = seg[k][3];
          pix[idx + 3] = seg[k][4];
        }
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y += win) {
        const yEnd = Math.min(h, y + win);
        let qualifies = false;
        for (let yy = y; yy < yEnd; yy++) {
          const idx = 4 * (yy * w + x);
          if (getVal(idx) >= thresh) { qualifies = true; break; }
        }
        if (!qualifies) continue;
        const seg = [];
        for (let yy = y; yy < yEnd; yy++) {
          const idx = 4 * (yy * w + x);
          seg.push([getVal(idx), pix[idx], pix[idx + 1], pix[idx + 2], pix[idx + 3]]);
        }
        seg.sort((a, b) => a[0] - b[0]);
        for (let yy = y, k = 0; yy < yEnd; yy++, k++) {
          const idx = 4 * (yy * w + x);
          pix[idx] = seg[k][1];
          pix[idx + 1] = seg[k][2];
          pix[idx + 2] = seg[k][3];
          pix[idx + 3] = seg[k][4];
        }
      }
    }
  }
  dst.updatePixels();
}

/* ---------------- Colorizer ---------------- */
function applyColorizer(src, dst, hueDeg = 20, satMul = 1.1) {
  dst.clear();
  dst.image(src, 0, 0, dst.width, dst.height);
  dst.loadPixels();

  const pix = dst.pixels;
  const len = pix.length;
  const hueShift = (h) => (h + hueDeg) % 360;

  for (let i = 0; i < len; i += 4) {
    let r = pix[i] / 255, g = pix[i + 1] / 255, b = pix[i + 2] / 255;
    const maxv = Math.max(r, g, b), minv = Math.min(r, g, b);
    const l = (maxv + minv) / 2;
    let h = 0, s = 0;
    if (maxv !== minv) {
      const d = maxv - minv;
      s = l > 0.5 ? d / (2 - maxv - minv) : d / (maxv + minv);
      switch (maxv) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    h = hueShift(h); s = Math.min(1, Math.max(0, s * satMul));

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs(hp % 2 - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (hp >= 0 && hp < 1)      { r1 = c; g1 = x; b1 = 0; }
    else if (hp < 2)            { r1 = x; g1 = c; b1 = 0; }
    else if (hp < 3)            { r1 = 0; g1 = c; b1 = x; }
    else if (hp < 4)            { r1 = 0; g1 = x; b1 = c; }
    else if (hp < 5)            { r1 = x; g1 = 0; b1 = c; }
    else                        { r1 = c; g1 = 0; b1 = x; }
    const m = l - c / 2;

    pix[i]   = Math.round((r1 + m) * 255);
    pix[i+1] = Math.round((g1 + m) * 255);
    pix[i+2] = Math.round((b1 + m) * 255);
  }
  dst.updatePixels();
}

/* --- Brightness/Contrast pass on a p5.Graphics (raw video only) --- */
function applyBrightnessContrast(gfx, bright = 0, contrast = 0) {
  if (!gfx) return;
  const B = bright * 255;
  const C = contrast * 255;
  const F = (259 * (C + 255)) / (255 * (259 - C)); // standard contrast curve
  gfx.loadPixels();
  const p = gfx.pixels;
  for (let i = 0; i < p.length; i += 4) {
    p[i]   = constrain(F * (p[i]   - 128) + 128 + B, 0, 255);
    p[i+1] = constrain(F * (p[i+1] - 128) + 128 + B, 0, 255);
    p[i+2] = constrain(F * (p[i+2] - 128) + 128 + B, 0, 255);
  }
  gfx.updatePixels();
}

function refreshGlitch() {
  clearAll();
  timeAcc = 0; cyclePhase = 0; nPhaseX = 0; nPhaseY = 1000;
  burstState.t = 0; burstState.inBurst = true;
}

function toggleRecord() {
  if (rec && rec.state === 'recording') {
    rec.stop(); document.getElementById('recBtn').textContent = '● Record'; return;
  }
  chunks = [];
  const stream = canvas.elt.captureStream(30);
  try { rec = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2' }); } catch (e) { rec = new MediaRecorder(stream); }
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'moshed.webm'; a.click();
    URL.revokeObjectURL(url);
  };
  rec.start();
  document.getElementById('recBtn').textContent = '⏹ Stop';
}

function drawWaiting() {
  noStroke(); fill(255, 20); rect(0, 0, width, height);
  fill(220); textAlign(CENTER, CENTER); textSize(14);
  text('Load a video (use Play for audio).', width / 2, height / 2);
}

function fitWithin(w, h, maxW, maxH) {
  const r = Math.min(maxW / w, maxH / h);
  return { w: Math.round(w * r), h: Math.round(h * r) };
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  gCur = createGraphics(width, height);
  gBuf = createGraphics(width, height);
  gWarp = createGraphics(width, height);
  gBloomWork = createGraphics(width, height);
  gTemp = createGraphics(width, height);
  clearAll();
}

/* UI shortcuts */
function toggleUI() {
  const header = document.querySelector('header');
  if (header.style.display === 'none') header.style.display = '';
  else header.style.display = 'none';
}
function keyPressed() {
  if (key === 'f' || key === 'F') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }
  if (key === 'p' || key === 'P') toggleUI();
}
