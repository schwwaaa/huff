/* Datamosh Lab — camera-free. Feedback-first modular FX with:
   - Enhanced Colorizer (driver: Luma/R/G/B/Avg/Max, Vibrance, Tint color+amount)
   - Pixel Sorter with Luma/Chroma control (+color picker for hue)
   - Higher FPS control (1–240)
   - MELT: Slitscan temporal melt + Drip/Smear
   Heavy CPU passes are throttled + cached; pipeline remains modular. */

let videoEl, currentBlobUrl = null;
let gCur, gBuf, gWarp, gBloomWork, gTemp, gFX;
let gFXColor, gFXPixel, gMelt, gFinal;
let frameRing = [];
let canvas, rec, chunks = [];
let playing = false;

const els = {};
let baseSeed = 1;

let nPhaseX = 0, nPhaseY = 1000;
let fbPhaseX = 0, fbPhaseY = 100, fbPhaseR = 200, fbPhaseZ = 300;
const burst = { on: false, inBurst: true, t: 0, len: 2, gap: 3, boost: 3 };

let lastMediaTime = -1;

/* ------------ utils ------------ */
function $(id){ return document.getElementById(id); }
function clamp01(x){ return x < 0 ? 0 : x > 1 ? 1 : x; }
function hueDiffDeg(a,b){ let d = Math.abs(a-b); return d>180 ? 360-d : d; }
function luma709(r,g,b){ return 0.2126*r + 0.7152*g + 0.0722*b; }
function hexToRGB(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return {r:255,g:0,b:255};
  return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
}
function rgbToHue(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=0;
  if (d!==0){
    if (max===r) h=((g-b)/d+(g<b?6:0))*60;
    else if (max===g) h=((b-r)/d+2)*60;
    else h=((r-g)/d+4)*60;
  }
  return h;
}

/* ------------ video helpers ------------ */
function cloakVideo(p5Vid){
  const v = p5Vid && (p5Vid.elt || p5Vid);
  if (!v) return;
  v.setAttribute('playsinline','');
  Object.assign(v.style, { position:'fixed', left:'-10000px', top:'0', width:'1px', height:'1px', opacity:'0', pointerEvents:'none' });
}
function blitVideoInto(target){
  target.imageMode(CORNER);
  const vw = videoEl?.elt?.videoWidth || width;
  const vh = videoEl?.elt?.videoHeight || height;
  const s  = Math.max(target.width / vw, target.height / vh);
  const dw = vw * s, dh = vh * s;
  const dx = (target.width - dw) * 0.5;
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

/* ------------ p5 lifecycle ------------ */
function setup(){
  canvas = createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  allocBuffers();
  clearAll();
  hookUI();
  updateLabels();
  setSeedFromUI();

  if (els.fps) frameRate(parseInt(els.fps.value || '60', 10));

  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') { const header = document.querySelector('header'); header.style.display = header.style.display === 'none' ? '' : 'none'; e.preventDefault(); }
    if (e.key === 'f' || e.key === 'F') { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); e.preventDefault(); }
  }, true);
}
function allocBuffers(){
  gCur = createGraphics(width, height);
  gBuf = createGraphics(width, height);       // feedback bus
  gWarp = createGraphics(width, height);
  gBloomWork = createGraphics(width, height);
  gTemp = createGraphics(width, height);
  gFX = createGraphics(width, height);        // effects layer
  gFXColor = createGraphics(width, height);   // colorized cache
  gFXPixel = createGraphics(width, height);   // pixel-sorted cache
  gMelt = createGraphics(width, height);      // melt cache
  gFinal = createGraphics(width, height);     // final staging (optional)
}
function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  allocBuffers();
  clearAll();
  updateDim();
}
function clearAll(){
  [gBuf, gWarp, gBloomWork, gTemp, gFX, gFXColor, gFXPixel, gMelt, gFinal].forEach(g => g.clear());
  frameRing.length = 0;
}
function updateDim(){ if (els.dim) els.dim.textContent = `${width}×${height}`; }

/* ------------ UI ------------ */
function hookUI(){
  [
    'file','playBtn','pauseBtn','recBtn','refreshBtn','borderlessBtn','dim',
    'quality','qualityVal','fxEvery','fxEveryVal','fps','fpsVal',
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
    'colOn','colDriver','colHue','colHueVal','colSat','colSatVal','colLuma','colLumaVal','colVibe','colVibeVal','colTint','colTintAmt','colTintAmtVal',
    'psOn','psDir','psMode','psThr','psThrVal','psHue','psHueVal','psHueWidth','psHueWidthVal','psSatMin','psSatMinVal','psColor','psSegMin','psSegMinVal','psOrder','psMix','psMixVal',
    'meltOn','meltDir','meltBack','meltBackVal','meltScale','meltScaleVal','meltSpeed','meltSpeedVal','meltMix','meltMixVal',
    'smearDown','smearDownVal','smearBlur','smearBlurVal'
  ].forEach(k => els[k] = $(k));

  els.file.addEventListener('change', onFile);

  els.playBtn.addEventListener('click', async () => {
    if (!videoEl) return;
    try { videoEl.elt.muted = false; videoEl.elt.volume = 1.0; videoEl.elt.setAttribute('playsinline',''); await videoEl.elt.play(); }
    catch { try { videoEl.elt.muted = true; await videoEl.elt.play(); } catch {} }
    pumpVideoFrames(); videoEl.loop(); playing = true;
  });
  els.pauseBtn.addEventListener('click', () => { if (!videoEl) return; try { videoEl.elt.pause(); } catch {}; if (videoEl.pause) videoEl.pause(); playing = false; });
  els.recBtn.addEventListener('click', toggleRecord);
  els.refreshBtn.addEventListener('click', refreshGlitch);
  if (els.borderlessBtn) els.borderlessBtn.addEventListener('click', toggleBorderless);

  els.seed.addEventListener('change', setSeedFromUI);

  [
    'quality','fxEvery','fps',
    'depth','corrupt','block','glitchSpeed','glitchSpeedFine','glitchSize','glitchSmear',
    'feedback','persistence','fbX','fbY','fbZ','fbTheta','fbSpeed',
    'spatialGap','clusterCount','clusterRadius',
    'burstLen','burstGap','burstBoost',
    'bloomStrength','bloomRadius','flowStrength','flowScale',
    'baseMix','colHue','colSat','colLuma','colVibe','colTintAmt',
    'psThr','psHue','psHueWidth','psSatMin','psSegMin','psMix',
    'meltBack','meltScale','meltSpeed','meltMix',
    'smearDown','smearBlur'
  ].forEach(id => els[id]?.addEventListener('input', updateLabels));
  ['cycleShape','psOrder','psDir','psMode','colDriver','meltDir'].forEach(id => els[id]?.addEventListener('change', updateLabels));
  ['baseOn','colOn','bloomOn','flowOn','fbAuto','clusters','cycleOn','burstOn','psOn','meltOn'].forEach(id => els[id]?.addEventListener('change', updateLabels));

  // Live FPS control
  if (els.fps) els.fps.addEventListener('input', () => frameRate(parseInt(els.fps.value || '60', 10)));

  // Pixel sorter color picker → sync hue slider
  if (els.psColor && els.psHue) {
    els.psColor.addEventListener('input', () => {
      const {r,g,b} = hexToRGB(els.psColor.value);
      els.psHue.value = Math.round(rgbToHue(r,g,b));
      updateLabels();
    });
  }

  updateDim(); updateLabels();
}
function f2(v){ return (+v).toFixed(2); }
function updateLabels(){
  if (els.quality) els.qualityVal.textContent = f2(els.quality.value);
  if (els.fxEvery) els.fxEveryVal.textContent = els.fxEvery.value;
  if (els.fps) els.fpsVal.textContent = els.fps.value;

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

  els.colHueVal.textContent = els.colHue.value;
  els.colSatVal.textContent = f2(els.colSat.value);
  els.colLumaVal.textContent = f2(els.colLuma.value);
  els.colVibeVal.textContent = f2(els.colVibe.value);
  els.colTintAmtVal.textContent = f2(els.colTintAmt.value);

  els.psThrVal.textContent = f2(els.psThr.value);
  els.psHueVal.textContent = els.psHue.value;
  els.psHueWidthVal.textContent = els.psHueWidth.value;
  els.psSatMinVal.textContent = f2(els.psSatMin.value);
  els.psSegMinVal.textContent = els.psSegMin.value;
  els.psMixVal.textContent = f2(els.psMix.value);

  els.meltBackVal.textContent = els.meltBack.value;
  els.meltScaleVal.textContent = els.meltScale.value;
  els.meltSpeedVal.textContent = f2(els.meltSpeed.value);
  els.meltMixVal.textContent = f2(els.meltMix.value);

  els.smearDownVal.textContent = els.smearDown.value;
  els.smearBlurVal.textContent = els.smearBlur.value;
}
function setSeedFromUI(){ baseSeed = parseInt(els.seed.value || '1', 10); if (isNaN(baseSeed)) baseSeed = 1; noiseSeed(baseSeed); }

/* ------------ file mode ------------ */
function onFile(ev){
  const file = ev.target.files?.[0]; if (!file) return;
  if (videoEl) { try { videoEl.remove(); } catch {} videoEl = null; }
  if (currentBlobUrl) { try { URL.revokeObjectURL(currentBlobUrl); } catch {} currentBlobUrl = null; }

  const url = URL.createObjectURL(file);
  currentBlobUrl = url;

  videoEl = createVideo([url], () => enableTransport(true));
  videoEl.attribute('preload','metadata');
  videoEl.attribute('playsinline','');
  cloakVideo(videoEl);
  videoEl.elt.muted = false;
  videoEl.elt.volume = 1.0;

  let primed = false;
  const prime = async () => {
    if (primed) return;
    if (videoEl.elt.videoWidth > 0 && videoEl.elt.videoHeight > 0) {
      primed = true;
      clearAll(); updateDim();
      gBuf.image(gCur, 0, 0, gBuf.width, gBuf.height);
      try { videoEl.elt.muted = false; videoEl.elt.volume = 1.0; videoEl.elt.setAttribute('playsinline',''); await videoEl.elt.play(); }
      catch { try { videoEl.elt.muted = true; await videoEl.elt.play(); } catch {} }
      pumpVideoFrames(); videoEl.loop(); playing = true;
    }
  };
  videoEl.elt.addEventListener('loadeddata', prime, { once: true });
  if (videoEl.elt.requestVideoFrameCallback) videoEl.elt.requestVideoFrameCallback(() => prime());
}
function enableTransport(enabled){
  ['playBtn','pauseBtn','recBtn','refreshBtn','borderlessBtn'].forEach(id=>{ const b = els[id]; if (b) b.disabled = !enabled; });
}

/* ------------ draw loop ------------ */
function draw(){
  background(0);
  if (!videoEl) { drawWaiting(); return; }

  randomSeed(baseSeed + frameCount);
  noiseSeed(baseSeed);

  if (!videoEl.elt.requestVideoFrameCallback) blitVideoInto(gCur);

  // cadence
  const coarse = parseFloat(els.glitchSpeed.value);
  const fine   = parseFloat(els.glitchSpeedFine.value || 1);
  const density = coarse * fine;
  nPhaseX += density * 0.01; nPhaseY += density * 0.011;

  // Quality & heavy cadence
  const Q = parseFloat(els.quality.value);
  const everyN  = Q >= 0.9 ? 1 : Q >= 0.7 ? 2 : Q >= 0.5 ? 3 : 4;
  const fxEvery = parseInt(els.fxEvery.value || '2', 10);
  const heavyEveryN = Math.max(1, everyN * fxEvery);

  // feedback bus policy
  const fbAmt = parseFloat(els.feedback.value);
  const corruptOn = !!els.corruptOn.checked;
  const activeFB = (fbAmt > 0 || corruptOn);

  if (!activeFB) {
    gBuf.clear();
    gBuf.image(gCur, 0, 0, gBuf.width, gBuf.height);
  } else {
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
  }

  // corrupt modifies gBuf
  if (corruptOn) applyGlitch(density);

  // feedback transform on gBuf
  if (fbAmt > 0) {
    let fx = parseFloat(els.fbX.value) || 0;
    let fy = parseFloat(els.fbY.value) || 0;
    let fz = parseFloat(els.fbZ.value) || 1;
    let ft = radians(parseFloat(els.fbTheta.value) || 0);
    if (els.fbAuto.checked) {
      const sp = parseFloat(els.fbSpeed.value);
      fbPhaseX += sp * 0.005; fbPhaseY += sp * 0.006; fbPhaseR += sp * 0.004; fbPhaseZ += sp * 0.003;
      if (els.fbMoveX.checked)      fx += map(noise(fbPhaseX), 0, 1, -20, 20);
      if (els.fbMoveY.checked)      fy += map(noise(fbPhaseY), 0, 1, -20, 20);
      if (els.fbMoveTheta.checked)  ft += radians(map(noise(fbPhaseR), 0, 1, -10, 10));
      if (els.fbMoveZ.checked)      fz *= (1.0 + map(noise(fbPhaseZ), 0, 1, -0.01, 0.01));
    }
    const tmp = gBuf.get();
    gBuf.clear();
    gBuf.push(); gBuf.tint(255, fbAmt * 255); gBuf.imageMode(CENTER);
    gBuf.translate(gBuf.width/2, gBuf.height/2); gBuf.rotate(ft); gBuf.scale(fz);
    gBuf.image(tmp, fx, fy, gBuf.width, gBuf.height);
    gBuf.pop();
  }

  // FX layer starts as feedback
  gFX.clear(); gFX.image(gBuf, 0, 0, gFX.width, gFX.height);

  // Flow (medium cost)
  if (els.flowOn.checked && parseInt(els.flowStrength.value,10) > 0 && (frameCount % everyN === 0)) {
    applyFlowWarp(gFX, gWarp, parseInt(els.flowStrength.value,10), parseInt(els.flowScale.value,10));
    const t = gFX; gFX = gWarp; gWarp = t;
  }

  // Bloom (medium cost)
  const bloomK = parseFloat(els.bloomStrength.value);
  const bloomR = parseInt(els.bloomRadius.value, 10);
  if (els.bloomOn.checked && bloomK > 0 && bloomR > 0 && (frameCount % everyN === 0)) {
    gBloomWork.clear();
    gBloomWork.image(gFX, 0, 0, gBloomWork.width, gBloomWork.height);
    gBloomWork.filter(BLUR, bloomR);
    gFX.push(); gFX.blendMode(ADD);
    gFX.tint(255, Math.min(2, bloomK) * 255);
    gFX.image(gBloomWork, 0, 0, gFX.width, gFX.height);
    gFX.pop();
  }

  // Colorizer (heavy) — throttled + cached
  let afterColor = gFX;
  if (els.colOn && els.colOn.checked) {
    if (frameCount % heavyEveryN === 0) {
      const tintRGB = hexToRGB(els.colTint.value || '#ffffff');
      applyColorizerEnhanced(gFX, gFXColor, {
        driver: els.colDriver?.value || 'luma',
        hueDeg: parseInt(els.colHue.value, 10),
        sat: parseFloat(els.colSat.value),
        lumaPreserve: parseFloat(els.colLuma.value),
        vibrance: parseFloat(els.colVibe.value),
        tint: tintRGB, tintAmt: parseFloat(els.colTintAmt.value)
      });
    }
    afterColor = gFXColor;
  }

  // Pixel Sorting (heavy) — throttled + cached
  let afterPixel = afterColor;
  if (els.psOn && els.psOn.checked) {
    if (frameCount % heavyEveryN === 0) {
      applyPixelSort(afterColor, gFXPixel, {
        mode: (els.psMode?.value || 'luma'),
        dir: (els.psDir?.value || 'rows'),
        thr: parseFloat(els.psThr?.value || '0.6'),
        hue: parseInt(els.psHue?.value || '180', 10),
        hueWidth: parseInt(els.psHueWidth?.value || '30', 10),
        satMin: parseFloat(els.psSatMin?.value || '0.1'),
        segMin: parseInt(els.psSegMin?.value || '24', 10),
        order: (els.psOrder?.value || 'desc'),
        mix: parseFloat(els.psMix?.value || '1')
      });
    }
    afterPixel = gFXPixel;
  }

  // MELT (medium/heavy depending on settings)
  let afterMelt = afterPixel;
  if (els.meltOn && els.meltOn.checked) {
    if (frameCount % everyN === 0) {
      applyMeltSlitscan(afterPixel, gMelt, {
        dir: els.meltDir?.value || 'rows',
        backMax: parseInt(els.meltBack?.value || '40', 10),
        cell: parseInt(els.meltScale?.value || '16', 10),
        speed: parseFloat(els.meltSpeed?.value || '0.8'),
        mix: parseFloat(els.meltMix?.value || '0.5')
      });
      // Drip/Smear on top
      const off = parseInt(els.smearDown?.value || '40', 10);
      const blur = parseInt(els.smearBlur?.value || '6', 10);
      applyDripSmear(gMelt, gMelt, off, blur, 0.4);
    }
    afterMelt = gMelt;
  }

  // ---- Composite to screen (no keyer; base + FX) ----
  if (els.baseOn.checked && parseFloat(els.baseMix.value) > 0) {
    push(); tint(255, parseFloat(els.baseMix.value) * 255); image(gCur, 0, 0, width, height); pop();
  }
  image(afterMelt, 0, 0, width, height);

  // ring for depth sampling (from base)
  const ringCap = Math.round(60 * (parseFloat(els.quality.value) * 2));
  frameRing.push(gCur.get());
  if (frameRing.length > ringCap) frameRing.shift();
}

/* ------------ Corrupt ------------ */
function applyGlitch(density = 1){
  if (els.corruptOn && !els.corruptOn.checked) return;

  const block = parseInt(els.block.value, 10);
  const size = parseInt(els.glitchSize.value, 10);
  const smearLen = parseInt(els.glitchSmear.value, 10);
  const corrupt  = parseFloat(els.corrupt.value);

  const cols = Math.max(1, Math.floor(width / block));
  const rows = Math.max(1, Math.floor(height / block));
  const total = cols * rows;

  const depth = parseFloat(els.depth.value);
  const maxBack = Math.max(1, Math.floor((frameRing.length - 1) * depth));

  let count = Math.max(1, Math.floor(total * corrupt * (0.5 + density)));

  if (els.cycleOn.checked && els.cycleShape.value === 'sine') {
    const cyc = 0.2 + 0.8 * ((Math.sin(frameCount * 0.1) + 1) * 0.5);
    count = Math.max(1, Math.floor(count * cyc));
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

/* ------------ Heavy FX ------------ */
// Enhanced Colorizer (driver + vibrance + tint + luma preserve)
function applyColorizerEnhanced(src, dst, {driver='luma', hueDeg=20, sat=1.4, lumaPreserve=1.0, vibrance=0.75, tint={r:255,g:0,b:255}, tintAmt=0.25}={}){
  dst.clear(); dst.image(src, 0, 0, dst.width, dst.height); dst.loadPixels();
  const pix = dst.pixels;
  for (let i = 0; i < pix.length; i += 4) {
    const r8 = pix[i], g8 = pix[i+1], b8 = pix[i+2];
    const r = r8/255, g = g8/255, b = b8/255;

    // HSL
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max + min) / 2, d = max - min;
    if (d === 0) { h = 0; s = 0; }
    else {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) { case r: h=((g-b)/d+(g<b?6:0)); break; case g: h=((b-r)/d+2); break; default: h=((r-g)/d+4); }
      h *= 60;
    }

    // Driver channel for lightness target
    let Yd = 0;
    if (driver === 'r') Yd = r;
    else if (driver === 'g') Yd = g;
    else if (driver === 'b') Yd = b;
    else if (driver === 'avg') Yd = (r+g+b)/3;
    else if (driver === 'max') Yd = Math.max(r,g,b);
    else Yd = luma709(r,g,b);

    // Adjustments
    h = (h + hueDeg) % 360; if (h < 0) h += 360;

    // Vibrance: boost low-sat pixels more
    const vibe = Math.max(0, vibrance);
    const satBoost = 1 + vibe * (1 - s);
    s = Math.max(0, Math.min(1, s * sat * satBoost));

    // Preserve toward driver
    const newL = clamp01((1 - lumaPreserve) * l + lumaPreserve * Yd);

    // HSL → RGB
    const c = (1 - Math.abs(2*newL - 1)) * s;
    const x = c * (1 - Math.abs(((h/60) % 2) - 1));
    const m = newL - c/2;
    let rp=0,gp=0,bp=0;
    if (h < 60)      { rp=c; gp=x; bp=0; }
    else if (h <120) { rp=x; gp=c; bp=0; }
    else if (h <180) { rp=0; gp=c; bp=x; }
    else if (h <240) { rp=0; gp=x; bp=c; }
    else if (h <300) { rp=x; gp=0; bp=c; }
    else             { rp=c; gp=0; bp=x; }
    let nr = (rp + m), ng = (gp + m), nb = (bp + m);

    // Tint mix
    const ta = clamp01(tintAmt);
    nr = nr*(1-ta) + (tint.r/255)*ta;
    ng = ng*(1-ta) + (tint.g/255)*ta;
    nb = nb*(1-ta) + (tint.b/255)*ta;

    pix[i]   = Math.round(nr * 255);
    pix[i+1] = Math.round(ng * 255);
    pix[i+2] = Math.round(nb * 255);
  }
  dst.updatePixels();
}

// Pixel Sorting (Luma/Chroma)
function applyPixelSort(src, dst, { mode='luma', dir='rows', thr=0.6, hue=180, hueWidth=30, satMin=0.1, segMin=24, order='desc', mix=1.0 } = {}){
  dst.clear(); dst.image(src, 0, 0, dst.width, dst.height);
  dst.loadPixels(); src.loadPixels();
  const sp = src.pixels, dp = dst.pixels;
  const w = src.width, h = src.height;
  const desc = (order === 'desc');

  function rowKey(idx){
    const r=sp[idx]/255, g=sp[idx+1]/255, b=sp[idx+2]/255;
    if (mode === 'chroma'){
      const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
      let hh=0, ss=(max===0?0:d/max);
      if (d!==0){ if (max===r) hh=((g-b)/d+(g<b?6:0))*60; else if (max===g) hh=((b-r)/d+2)*60; else hh=((r-g)/d+4)*60; }
      const dist = hueDiffDeg(hh, (hue%360+360)%360);
      const passHue = dist <= hueWidth;
      const passSat = ss >= satMin;
      return (passHue && passSat) ? ss : -1; // negative = not in segment
    } else {
      return luma709(r,g,b) >= thr ? luma709(r,g,b) : -1;
    }
  }
  function processRangeRow(y, x0, x1){
    const len = x1 - x0;
    if (len < segMin) return;
    const buf = new Array(len);
    const orig = new Array(len);
    for (let i=0; i<len; i++){
      const idx = ((y*w) + (x0 + i)) * 4;
      buf[i]  = { r:sp[idx], g:sp[idx+1], b:sp[idx+2], a:sp[idx+3], key: luma709(sp[idx]/255, sp[idx+1]/255, sp[idx+2]/255) };
      orig[i] = { r:sp[idx], g:sp[idx+1], b:sp[idx+2], a:sp[idx+3] };
    }
    buf.sort((A,B)=> desc ? (B.key - A.key) : (A.key - B.key));
    for (let i=0; i<len; i++){
      const idx = ((y*w) + (x0 + i)) * 4;
      const s = buf[i], o = orig[i];
      dp[idx]   = Math.round(s.r * mix + o.r * (1-mix));
      dp[idx+1] = Math.round(s.g * mix + o.g * (1-mix));
      dp[idx+2] = Math.round(s.b * mix + o.b * (1-mix));
      dp[idx+3] = 255;
    }
  }
  function processRangeCol(x, y0, y1){
    const len = y1 - y0;
    if (len < segMin) return;
    const buf = new Array(len);
    const orig = new Array(len);
    for (let i=0; i<len; i++){
      const idx = (((y0 + i)*w) + x) * 4;
      buf[i]  = { r:sp[idx], g:sp[idx+1], b:sp[idx+2], a:sp[idx+3], key: luma709(sp[idx]/255, sp[idx+1]/255, sp[idx+2]/255) };
      orig[i] = { r:sp[idx], g:sp[idx+1], b:sp[idx+2], a:sp[idx+3] };
    }
    buf.sort((A,B)=> desc ? (B.key - A.key) : (A.key - B.key));
    for (let i=0; i<len; i++){
      const idx = (((y0 + i)*w) + x) * 4;
      const s = buf[i], o = orig[i];
      dp[idx]   = Math.round(s.r * mix + o.r * (1-mix));
      dp[idx+1] = Math.round(s.g * mix + o.g * (1-mix));
      dp[idx+2] = Math.round(s.b * mix + o.b * (1-mix));
      dp[idx+3] = 255;
    }
  }

  if (dir === 'cols'){
    for (let x=0; x<w; x++){
      let y=0;
      while (y<h){
        const idx = ((y*w) + x) * 4;
        const key = rowKey(idx);
        if (key >= 0){
          const y0 = y;
          y++;
          while (y<h){
            const idx2 = ((y*w) + x) * 4;
            if (rowKey(idx2) < 0) break;
            y++;
          }
          processRangeCol(x, y0, y);
        } else y++;
      }
    }
  } else {
    for (let y=0; y<h; y++){
      let x=0;
      while (x<w){
        const idx = ((y*w) + x) * 4;
        const key = rowKey(idx);
        if (key >= 0){
          const x0 = x;
          x++;
          while (x<w){
            const idx2 = ((y*w) + x) * 4;
            if (rowKey(idx2) < 0) break;
            x++;
          }
          processRangeRow(y, x0, x);
        } else x++;
      }
    }
  }
  dst.updatePixels();
}

/* ------------ MELT ------------ */
// Temporal slitscan (uses frameRing); draws block stripes from past frames
function applyMeltSlitscan(src, dst, {dir='rows', backMax=40, cell=16, speed=0.8, mix=0.5} = {}){
  // seed ring already holds base frames; we melt SRC visually but pattern is driven by noise/time
  dst.clear();
  dst.image(src, 0, 0, dst.width, dst.height); // start with current
  if (frameRing.length < 2 || backMax <= 0) return;

  const maxIdx = Math.min(frameRing.length-1, backMax);
  const t = frameCount * 0.005 * speed;

  if (dir === 'cols'){
    for (let x = 0; x < width; x += cell){
      const nx = x / width;
      const age = Math.floor(clamp01(noise(nx*2.0, t)) * maxIdx);
      const f = frameRing[frameRing.length-1 - age];
      const tileW = Math.min(cell, width - x);
      const tile = f.get(x, 0, tileW, height);
      dst.push(); dst.tint(255, mix*255); dst.image(tile, x, 0, tileW, height); dst.pop();
    }
  } else {
    for (let y = 0; y < height; y += cell){
      const ny = y / height;
      const age = Math.floor(clamp01(noise(ny*2.0, t)) * maxIdx);
      const f = frameRing[frameRing.length-1 - age];
      const tileH = Math.min(cell, height - y);
      const tile = f.get(0, y, width, tileH);
      dst.push(); dst.tint(255, mix*255); dst.image(tile, 0, y, width, tileH); dst.pop();
    }
  }
}

// Drip/Smear: blurred copy shifted downward and added
function applyDripSmear(src, dst, offset=40, blur=6, addAmt=0.4){
  if (offset === 0 || addAmt <= 0) return;
  gBloomWork.clear();
  gBloomWork.image(src, 0, 0, gBloomWork.width, gBloomWork.height);
  if (blur > 0) gBloomWork.filter(BLUR, blur);
  dst.push(); dst.blendMode(ADD); dst.tint(255, clamp01(addAmt)*255);
  dst.image(gBloomWork, 0, Math.max(-height, Math.min(height, offset)), dst.width, dst.height);
  dst.pop();
}

/* ------------ Flow/Bloom helpers ------------ */
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

/* ------------ Recording/misc ------------ */
async function toggleBorderless(){ /* no-op for web */ }
function toggleRecord(){
  if (rec && rec.state === 'recording') { rec.stop(); els.recBtn.textContent = '● Record'; return; }
  chunks = [];
  const stream = canvas.elt.captureStream(30);
  let opts; try { opts = { mimeType: 'video/webm;codecs=vp9' }; } catch {}
  try { rec = new MediaRecorder(stream, opts); } catch { rec = new MediaRecorder(stream); }
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'moshed.webm'; a.click();
    URL.revokeObjectURL(url);
  };
  rec.start();
  els.recBtn.textContent = '⏹ Stop';
}
function refreshGlitch(){
  clearAll();
  nPhaseX = 0; nPhaseY = 1000;
  fbPhaseX = 0; fbPhaseY = 100; fbPhaseR = 200; fbPhaseZ = 300;
  burst.t = 0; burst.inBurst = true;
}
function drawWaiting(){
  noStroke(); fill(255,20); rect(0,0,width,height);
  fill(220); textAlign(CENTER,CENTER); textSize(14);
  text('File: choose a video. P: toggle UI • F: fullscreen', width/2, height/2);
}