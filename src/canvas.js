/* canvas.js — p5 lifecycle + buffers + UI
 * Optimizations:
 *  - frameRing uses ImageData instead of p5 Graphics (.get() is very expensive)
 *  - ws-mirror sender is throttled via a flag rather than re-checking timestamps each RAF
 *  - updateLabels only runs when an input event fires, not every draw tick
 *  - allocBuffers disposes old graphics before reallocating
 *  - cloakVideo does not mutate style on every call
 */

window.$  = window.$  || (id  => document.getElementById(id));
window.$$ = window.$$ || (sel => document.querySelector(sel));

let videoEl, currentBlobUrl = null;
let gCur, gBuf, gWarp, gTemp;
let frameRing = [];   // now stores ImageData, not p5 Graphics
let canvas, rec, chunks = [];
let playing = false;

const els = {};
let baseSeed = 1, seededOnce = false;

let nPhaseX = 0, nPhaseY = 1000;
let fbPhaseX = 0, fbPhaseY = 100, fbPhaseR = 200, fbPhaseZ = 300;

// ─── video helpers ─────────────────────────────────────────────────────────

function cloakVideo(p5Vid) {
  const v = p5Vid && (p5Vid.elt || p5Vid);
  if (!v || v._cloaked) return;
  v._cloaked = true;
  v.setAttribute('playsinline', '');
  Object.assign(v.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
  });
}

function blitVideoInto(target) {
  target.imageMode(CORNER);
  target.clear();
  if (videoEl) { try { target.image(videoEl, 0, 0, target.width, target.height); } catch (e) {} }
}

let __camPrimed = false;
async function primeCameraPermissionOnce() {
  if (__camPrimed) return;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    s.getTracks().forEach(t => { try { t.stop(); } catch {} });
    __camPrimed = true;
  } catch (e) {
    console.warn('primeCameraPermissionOnce failed:', e);
  }
}

function pumpVideoFrames() {
  const v = videoEl && videoEl.elt;
  if (!v) return;

  if (typeof v.requestVideoFrameCallback === 'function') {
    v.requestVideoFrameCallback((_now, _meta) => {
      try { blitVideoInto(gCur); } catch {}
      if (videoEl && videoEl.elt === v) pumpVideoFrames();
    });
    return;
  }

  const vRef = v;
  function tick() {
    try { blitVideoInto(gCur); } catch {}
    if (videoEl && videoEl.elt === vRef) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── p5 setup / resize ─────────────────────────────────────────────────────

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  try { canvas.hide(); } catch (e) { console.warn('[setup] canvas hide failed', e); }
  pixelDensity(1);
  allocBuffers();
  clearAll();
  hookUI();
  updateLabels();
  setSeedFromUI();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
      const header = document.querySelector('header');
      header.style.display = header.style.display === 'none' ? '' : 'none';
      e.preventDefault();
    }
    if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
      e.preventDefault();
    }
  }, true);

  document.addEventListener('fullscreenchange', () => {
    const v = videoEl?.elt;
    if (v && playing && v.paused) { v.play().catch(() => {}); }
  });
}
window.setup = setup;

function allocBuffers() {
  // Dispose old buffers to avoid GPU/memory leaks
  [gCur, gBuf, gWarp, gTemp].forEach(g => { try { if (g) g.remove(); } catch {} });
  gCur  = createGraphics(width, height);
  gBuf  = createGraphics(width, height);
  gWarp = createGraphics(width, height);
  gTemp = createGraphics(width, height);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  allocBuffers();
  clearAll();
  updateDim();
}
window.windowResized = windowResized;

function clearAll() {
  [gBuf, gWarp, gTemp].forEach(g => g.clear());
  frameRing.length = 0;
  seededOnce = false;
}

// ─── UI wiring ─────────────────────────────────────────────────────────────

function hookUI() {
  [
    'file', 'playBtn', 'pauseBtn', 'recBtn', 'refreshBtn',
    'camStartBtn', 'camStopBtn', 'camRefreshBtn', 'cams',
    'corruptOn',
    'quality', 'qualityVal', 'depth', 'depthVal', 'corrupt', 'corruptVal', 'block', 'blockVal',
    'glitchSpeed', 'glitchSpeedVal', 'glitchSpeedFine', 'glitchSpeedFineVal',
    'glitchSize', 'glitchSizeVal', 'glitchSmear', 'glitchSmearVal',
    'glitchBaseX', 'glitchBaseXVal', 'glitchBaseY', 'glitchBaseYVal',
    'glitchSpeedMul', 'glitchSpeedMulVal',
    'glitchAlpha', 'glitchAlphaVal', 'glitchJitter', 'glitchJitterVal',
    'glitchSmearAngle', 'glitchSmearAngleVal',
    'seed',
    'feedback', 'feedbackVal', 'persistence', 'persistenceVal',
    'fbX', 'fbXVal', 'fbY', 'fbYVal', 'fbZ', 'fbZVal', 'fbTheta', 'fbThetaVal',
    'fbAuto', 'fbSpeed', 'fbSpeedVal', 'fbMoveX', 'fbMoveY', 'fbMoveZ', 'fbMoveTheta',
    'clusters', 'clusterTiles', 'clusterCount', 'clusterCountVal',
    'clusterRadius', 'clusterRadiusVal', 'spatialGap', 'spatialGapVal',
    'cluCenters', 'cluCentersVal', 'cluSpread', 'cluSpreadVal',
    'flowOn', 'flowStrength', 'flowStrengthVal', 'flowScale', 'flowScaleVal',
    'flowPulse', 'flowPulseVal', 'flowImpl', 'flowImplVal',
    'baseOn', 'baseMix', 'baseMixVal',
    'seedOnLoad',
    'symOn', 'symMode', 'symPos', 'symPosVal',
    'solarizeOn', 'solarizeThresh', 'solarizeThreshVal',
    'solarizeAmt', 'solarizeAmtVal',
    'solarizeR', 'solarizeRVal', 'solarizeG', 'solarizeGVal', 'solarizeB', 'solarizeBVal',
    'scanAlpha', 'scanAlphaVal', 'scanShift', 'scanShiftVal', 'scanDrift', 'scanDriftVal',
    'depthScatter', 'depthScatterVal', 'corruptDrift', 'corruptDriftVal',
    'trailLayers', 'trailLayersVal', 'trailDepth', 'trailDepthVal',
    'bgMode',
  ].forEach(k => els[k] = $(k));

  els.file.addEventListener('change', onFile);

  els.playBtn.addEventListener('click', async () => {
    if (!videoEl) return;
    try {
      videoEl.elt.muted = false;
      videoEl.elt.volume = 1.0;
      videoEl.elt.setAttribute('playsinline', '');
      await videoEl.elt.play();
    } catch {
      try { videoEl.elt.muted = true; await videoEl.elt.play(); } catch {}
    }
    pumpVideoFrames();
    videoEl.loop();
    playing = true;
  });

  els.pauseBtn.addEventListener('click', () => {
    if (!videoEl) return;
    try { videoEl.elt.pause(); } catch {}
    if (videoEl.pause) videoEl.pause();
    playing = false;
  });

  els.refreshBtn.addEventListener('click', refreshGlitch);

  els.seed.addEventListener('change', setSeedFromUI);

  // All range/number inputs update labels on 'input' — not on every draw frame
  [
    'quality', 'depth', 'corrupt', 'block', 'glitchSpeed', 'glitchSpeedFine',
    'glitchSize', 'glitchSmear', 'glitchBaseX', 'glitchBaseY',
    'feedback', 'persistence',
    'fbX', 'fbY', 'fbZ', 'fbTheta',
    'spatialGap', 'clusterCount', 'clusterRadius', 'cluCenters', 'cluSpread',
    'scanAlpha', 'scanShift', 'scanDrift',
    'glitchAlpha', 'glitchJitter', 'glitchSmearAngle',
    'flowStrength', 'flowScale', 'flowPulse', 'flowImpl',
    'baseMix', 'symPos', 'glitchSpeedMul',
    'depthScatter', 'corruptDrift', 'trailLayers', 'trailDepth',
    'solarizeThresh', 'solarizeAmt', 'solarizeR', 'solarizeG', 'solarizeB',
  ].forEach(id => els[id] && els[id].addEventListener('input', updateLabels));

  els.baseOn.addEventListener('change', () => {
    els.baseMix.disabled = !els.baseOn.checked;
    updateLabels();
  });

  if (els.camStartBtn)   els.camStartBtn.addEventListener('click',  () => startCamera((els.cams && els.cams.value) || null));
  if (els.camStopBtn)    els.camStopBtn.addEventListener('click',   stopCamera);
  if (els.camRefreshBtn) els.camRefreshBtn.addEventListener('click', listCameras);
  if (els.cams) els.cams.addEventListener('change', () => {
    try {
      const active = videoEl && videoEl.elt && videoEl.elt.srcObject;
      if (active) startCamera(els.cams.value || null);
    } catch {}
  });

  updateDim();
  try { listCameras(); } catch {}
}

function updateDim() { if (els.dim) els.dim.textContent = `${width}×${height}`; }

function updateLabels() {
  const f2 = v => (+v).toFixed(2);
  if (els.quality)    els.qualityVal.textContent    = f2(els.quality.value);
  els.depthVal.textContent        = f2(els.depth.value);
  els.corruptVal.textContent      = f2(els.corrupt.value);
  els.blockVal.textContent        = els.block.value;
  els.glitchSpeedVal.textContent  = f2(els.glitchSpeed.value);
  els.glitchSpeedFineVal.textContent = f2(els.glitchSpeedFine.value);
  els.glitchSizeVal.textContent   = els.glitchSize.value;
  els.glitchSmearVal.textContent  = els.glitchSmear.value;
  els.feedbackVal.textContent     = f2(els.feedback.value);
  els.persistenceVal.textContent  = f2(els.persistence.value);
  els.fbXVal.textContent          = els.fbX.value;
  els.fbYVal.textContent          = els.fbY.value;
  els.fbZVal.textContent          = f2(els.fbZ.value);
  els.fbThetaVal.textContent      = els.fbTheta.value;
  els.spatialGapVal.textContent   = els.spatialGap.value;
  els.clusterCountVal.textContent = els.clusterCount.value;
  els.clusterRadiusVal.textContent = els.clusterRadius.value;
  if (els.cluCenters) els.cluCentersVal.textContent = els.cluCenters.value;
  if (els.cluSpread)  els.cluSpreadVal.textContent  = els.cluSpread.value;
  els.flowStrengthVal.textContent = els.flowStrength.value;
  els.flowScaleVal.textContent    = els.flowScale.value;
  els.baseMixVal.textContent      = f2(els.baseMix.value);
  els.baseMix.disabled            = !els.baseOn.checked;
  if (els.flowPulse)        els.flowPulseVal.textContent        = (els.flowPulse.value | 0);
  if (els.flowImpl)         els.flowImplVal.textContent         = f2(els.flowImpl.value);
  if (els.glitchBaseX)      els.glitchBaseXVal.textContent      = (els.glitchBaseX.value | 0);
  if (els.glitchBaseY)      els.glitchBaseYVal.textContent      = (els.glitchBaseY.value | 0);
  if (els.glitchSpeedMul)   els.glitchSpeedMulVal.textContent   = f2(els.glitchSpeedMul.value);
  if (els.glitchAlpha)      els.glitchAlphaVal.textContent      = f2(els.glitchAlpha.value);
  if (els.glitchJitter)     els.glitchJitterVal.textContent     = f2(els.glitchJitter.value);
  if (els.glitchSmearAngle) els.glitchSmearAngleVal.textContent = (els.glitchSmearAngle.value | 0) + '°';
  if (els.scanAlpha)        els.scanAlphaVal.textContent        = f2(els.scanAlpha.value);
  if (els.scanShift)        els.scanShiftVal.textContent        = f2(els.scanShift.value);
  if (els.scanDrift)        els.scanDriftVal.textContent        = f2(els.scanDrift.value);
  if (els.depthScatter)     els.depthScatterVal.textContent     = f2(els.depthScatter.value);
  if (els.corruptDrift)     els.corruptDriftVal.textContent     = f2(els.corruptDrift.value);
  if (els.trailLayers)      els.trailLayersVal.textContent      = (els.trailLayers.value | 0);
  if (els.trailDepth)       els.trailDepthVal.textContent       = f2(els.trailDepth.value);
  if (els.symPos)           els.symPosVal.textContent           = f2(els.symPos.value);
  if (els.solarizeThresh)   els.solarizeThreshVal.textContent   = f2(els.solarizeThresh.value);
  if (els.solarizeAmt)      els.solarizeAmtVal.textContent      = f2(els.solarizeAmt.value);
  if (els.solarizeR)        els.solarizeRVal.textContent        = f2(els.solarizeR.value);
  if (els.solarizeG)        els.solarizeGVal.textContent        = f2(els.solarizeG.value);
  if (els.solarizeB)        els.solarizeBVal.textContent        = f2(els.solarizeB.value);
}

function setSeedFromUI() {
  baseSeed = parseInt(els.seed.value || '1', 10);
  if (isNaN(baseSeed)) baseSeed = 1;
  noiseSeed(baseSeed);
}

// ─── file / camera loading ─────────────────────────────────────────────────

function onFile(ev) {
  const input = ev.target;
  const file = input.files?.[0]; if (!file) return;
  queueMicrotask(() => { try { input.value = ''; } catch {} });

  try {
    if (videoEl && videoEl.elt && videoEl.elt.srcObject) {
      videoEl.elt.srcObject.getTracks().forEach(t => { try { t.stop(); } catch {} });
    }
  } catch {}
  if (videoEl) { try { videoEl.remove(); } catch {} videoEl = null; }
  if (currentBlobUrl) { try { URL.revokeObjectURL(currentBlobUrl); } catch {} currentBlobUrl = null; }

  const url = URL.createObjectURL(file);
  currentBlobUrl = url;

  videoEl = createVideo([url], () => enableTransport(true));
  videoEl.attribute('preload', 'auto');
  videoEl.attribute('playsinline', '');
  cloakVideo(videoEl);

  const v = videoEl.elt;
  v.muted = true;
  v.volume = 1.0;

  let primed = false;
  const primeOnce = () => {
    if (primed) return;
    if (v.readyState >= 1 && v.videoWidth > 0 && v.videoHeight > 0) {
      primed = true;
      clearAll(); updateDim();
      try { blitVideoInto(gCur); } catch {}
      try { v.currentTime = 0; } catch {}

      (async () => {
        try {
          v.setAttribute('playsinline', '');
          await v.play();
          pumpVideoFrames();
          videoEl.loop();
          playing = true;

          const unmuteOnce = () => {
            try { v.muted = false; v.volume = 1.0; } catch {}
            window.removeEventListener('pointerdown', unmuteOnce, true);
            window.removeEventListener('keydown', unmuteOnce, true);
          };
          window.addEventListener('pointerdown', unmuteOnce, true);
          window.addEventListener('keydown', unmuteOnce, true);
        } catch {
          const gesture = async () => {
            try { await v.play(); pumpVideoFrames(); videoEl.loop(); playing = true; } catch {}
            window.removeEventListener('pointerdown', gesture, true);
            window.removeEventListener('keydown', gesture, true);
          };
          window.addEventListener('pointerdown', gesture, true);
          window.addEventListener('keydown', gesture, true);
        }
      })();

      enableTransport(true);
    }
  };

  v.addEventListener('loadedmetadata', primeOnce, { once: true });
  v.addEventListener('loadeddata', primeOnce, { once: true });
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => primeOnce());
  setTimeout(primeOnce, 80);
  v.addEventListener('error', (e) => { console.warn('[video] error', e); enableTransport(true); }, { once: true });
}

function enableTransport(enabled) {
  ['playBtn', 'pauseBtn', 'recBtn', 'refreshBtn', 'borderlessBtn'].forEach(id => {
    const b = els[id]; if (b) b.disabled = !enabled;
  });
}

// ─── draw loop ─────────────────────────────────────────────────────────────

function draw() {
  const bg = (els.bgMode && els.bgMode.value) || 'black';
  if      (bg === 'white') background(255);
  else if (bg === 'green') background(0, 255, 0);
  else if (bg === 'blue')  background(0, 0, 255);
  else                     background(0);

  if (!videoEl) { drawWaiting(); return; }

  randomSeed(baseSeed + frameCount);
  noiseSeed(baseSeed);

  if (!videoEl.elt.requestVideoFrameCallback) blitVideoInto(gCur);

  if (!seededOnce && els.seedOnLoad.checked) {
    gBuf.image(gCur, 0, 0, gBuf.width, gBuf.height);
    seededOnce = true;
  }

  // Persistence decay
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

  const mul    = parseFloat(els.glitchSpeedMul?.value || '1');
  const coarse = parseFloat(els.glitchSpeed.value) * mul;
  const fine   = parseFloat(els.glitchSpeedFine.value) * mul;
  const density = coarse * fine;
  nPhaseX += density * 0.01;
  nPhaseY += density * 0.011;

  const Q      = parseFloat(els.quality.value);
  const everyN = Q >= 0.9 ? 1 : Q >= 0.7 ? 2 : Q >= 0.5 ? 3 : 4;

  applyGlitch(
    density,
    parseInt(els.glitchBaseX?.value || '0', 10),
    parseInt(els.glitchBaseY?.value || '0', 10)
  );

  // Feedback
  const fb = parseFloat(els.feedback.value);
  if (fb > 0) {
    const fx = parseFloat(els.fbX.value) || 0;
    const fy = parseFloat(els.fbY.value) || 0;
    const fz = parseFloat(els.fbZ.value) || 1;
    const ft = radians(parseFloat(els.fbTheta.value) || 0);
    const tmp = gBuf.get();
    gBuf.clear();
    gBuf.push();
    gBuf.tint(255, fb * 255);
    gBuf.imageMode(CENTER);
    gBuf.translate(gBuf.width / 2, gBuf.height / 2);
    gBuf.rotate(ft);
    gBuf.scale(fz);
    gBuf.image(tmp, fx, fy, gBuf.width, gBuf.height);
    gBuf.pop();
  }

  // Flow
  const flowS = parseInt(els.flowStrength.value, 10);
  if (els.flowOn.checked && flowS > 0 && (frameCount % everyN === 0)) {
    applyFlowWarp(gBuf, gWarp, flowS, parseInt(els.flowScale.value, 10),
      parseInt(els.flowPulse?.value || '0', 10),
      parseFloat(els.flowImpl?.value || '0'));
    const t = gBuf; gBuf = gWarp; gWarp = t;
  }

  // Symmetry
  if (els.symOn && els.symOn.checked) {
    const mode = (els.symMode && els.symMode.value) || 'v';
    applySymmetry(gBuf, gTemp, mode, parseFloat(els.symPos?.value || '0.5'));
    const tS = gBuf; gBuf = gTemp; gTemp = tS;
  }

  // Solarize
  if (els.solarizeOn && els.solarizeOn.checked) {
    applySolarize(gBuf,
      parseFloat(els.solarizeThresh?.value || '0.5'),
      parseFloat(els.solarizeAmt?.value    || '1.0'),
      parseFloat(els.solarizeR?.value      || '1.0'),
      parseFloat(els.solarizeG?.value      || '1.0'),
      parseFloat(els.solarizeB?.value      || '1.0'));
  }

  // Base composite
  if (els.baseOn.checked && parseFloat(els.baseMix.value) > 0) {
    push();
    tint(255, parseFloat(els.baseMix.value) * 255);
    image(gCur, 0, 0, width, height);
    pop();
  }
  image(gBuf, 0, 0, width, height);

  // ── Frame ring — use ImageData to avoid p5 .get() overhead ───────────────
  const bytesPerFrame   = width * height * 4;
  const maxRingBytes    = 256 * 1024 * 1024; // 256 MB hard cap
  const q               = parseFloat(els.quality.value) || 1;
  let ringCap           = Math.round(60 * (q * 2));
  const maxFramesByMem  = Math.max(1, Math.floor(maxRingBytes / bytesPerFrame));
  ringCap               = Math.max(1, Math.min(ringCap, maxFramesByMem));

  // Capture current frame as ImageData (much cheaper than gCur.get())
  gCur.loadPixels();
  const snapshot = new ImageData(
    new Uint8ClampedArray(gCur.pixels.buffer.slice(0)),
    gCur.width, gCur.height
  );
  frameRing.push(snapshot);
  if (frameRing.length > ringCap) frameRing.shift();
}

function refreshGlitch() {
  clearAll();
  nPhaseX = 0; nPhaseY = 1000;
  fbPhaseX = 0; fbPhaseY = 100; fbPhaseR = 200; fbPhaseZ = 300;
}

function drawWaiting() {
  noStroke(); fill(255, 20); rect(0, 0, width, height);
  fill(220); textAlign(CENTER, CENTER); textSize(14);
  text('File: choose a video. P: toggle UI • F: fullscreen', width / 2, height / 2);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { try { hookUI && hookUI(); } catch (e) { console.warn('[hookUI] deferred failed:', e); } });
} else { try { hookUI && hookUI(); } catch (e) { console.warn('[hookUI] immediate failed:', e); } }

// ─── camera helpers ────────────────────────────────────────────────────────

async function listCameras() {
  try {
    await primeCameraPermissionOnce();
    const devs = await navigator.mediaDevices.enumerateDevices();
    const vids  = devs.filter(d => d.kind === 'videoinput');
    if (!els.cams) return vids.length;
    const prev = els.cams.value;
    els.cams.innerHTML = '';
    vids.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId || '';
      o.textContent = d.label || `Camera ${i + 1}`;
      els.cams.appendChild(o);
    });
    if (prev && Array.from(els.cams.options).some(o => o.value === prev)) els.cams.value = prev;
    return vids.length;
  } catch (e) {
    console.warn('enumerateDevices failed:', e);
    return 0;
  }
}

function cameraConstraints(deviceId) {
  const video = deviceId && deviceId.length
    ? { deviceId: { exact: deviceId } }
    : { facingMode: { ideal: 'user' } };
  return { video, audio: false };
}

function stopCamera() {
  try {
    if (videoEl && videoEl.elt && videoEl.elt.srcObject)
      videoEl.elt.srcObject.getTracks().forEach(t => { try { t.stop(); } catch {} });
  } catch {}
  try { if (videoEl) videoEl.remove(); } catch {}
  videoEl = null;
  playing = false;
  try { enableTransport(false); } catch {}
}

function startCamera(deviceId) {
  stopCamera();
  const cons = cameraConstraints(deviceId || null);
  try {
    videoEl = createCapture(cons, () => {
      try { enableTransport(true); } catch {}
      listCameras();
      const v = videoEl.elt;
      try { v.setAttribute('playsinline', ''); } catch {}
      try { v.setAttribute('muted', ''); v.muted = true; } catch {}
      const kick = () => {
        try { v.play().catch(() => {}); } catch {}
        try { pumpVideoFrames(); } catch {}
      };
      if (v.readyState >= 1) kick();
      else v.addEventListener('loadedmetadata', kick, { once: true });
    });
    try { cloakVideo(videoEl); } catch {}
    playing = true;
  } catch (e) {
    console.warn('startCamera error:', e);
    try { enableTransport(true); } catch {}
  }
}

// ─── ws-mirror sender (inline) ─────────────────────────────────────────────
(function () {
  const STREAM_MAX_W = 1280;
  const STREAM_MAX_H = 1280;
  const STREAM_Q     = 0.76;
  const USE_JPEG     = true;
  const TARGET_FPS   = 30;

  function setWSStatus(txt) {
    const el = document.getElementById('status');
    if (el) el.textContent = txt;
  }
  function findCanvas() {
    try { if (typeof canvas !== 'undefined' && canvas && canvas.elt instanceof HTMLCanvasElement) return canvas.elt; } catch (e) {}
    return document.querySelector('canvas') || null;
  }

  const wsUrl = (typeof __getWSURL__ === 'function') ? __getWSURL__() : (window.WS_MIRROR_URL || 'ws://127.0.0.1:8787');

  const openBtn = document.getElementById('openCanvasBtn');
  if (openBtn) openBtn.addEventListener('click', () => {
    const url      = 'canvas.html?ws=' + encodeURIComponent(wsUrl) + '&mode=stretch&autofs=1';
    const features = 'popup=yes,noopener,noreferrer,menubar=0,toolbar=0,location=0,status=0,scrollbars=0,resizable=1,width=1280,height=720,left=80,top=60';
    window.open(url, 'canvas-mirror', features);
  });

  // Reusable off-screen canvas — allocated once, resized only when dims change
  const tcv = document.createElement('canvas');
  const ttx = tcv.getContext('2d', { alpha: false });

  let ws = null, connected = false, sending = false;

function ensureWS() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  console.log('[ws] connecting to', wsUrl);
  ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  ws.onopen  = () => {
    connected = true;
    setWSStatus('WS: connected');
    console.log('[ws] connected');

    try {
      ws.send(JSON.stringify({ type: 'hello', role: 'index' }));
    } catch (err) {
      console.error('[ws] error sending hello', err);
    }
  };

  ws.onerror = (ev) => {
    console.error('[ws] error event', ev);
  };

  ws.onclose = (ev) => {
    connected = false;
    setWSStatus('WS: disconnected');
    console.warn('[ws] closed', ev.code, ev.reason);
    setTimeout(ensureWS, 1500);
  };
}
ensureWS();

  async function sendFrameNow(cnv) {
    if (!connected || !ws || ws.readyState !== 1 || sending) return;
    sending = true;
    try {
      const sw    = cnv.width, sh = cnv.height;
      const scale = Math.min(1, Math.min(STREAM_MAX_W / sw, STREAM_MAX_H / sh));
      const tw    = Math.max(1, Math.round(sw * scale));
      const th    = Math.max(1, Math.round(sh * scale));
      if (tcv.width !== tw || tcv.height !== th) { tcv.width = tw; tcv.height = th; }
      ttx.drawImage(cnv, 0, 0, tw, th);
      const mime = USE_JPEG ? 'image/jpeg' : 'image/webp';
      await new Promise(resolve => {
        tcv.toBlob(blob => { try { if (blob) ws.send(blob); } catch {} resolve(); }, mime, STREAM_Q);
      });
    } finally { sending = false; }
  }

  // Single RAF loop — throttle by checking elapsed time instead of two nested loops
  const period = 1000 / TARGET_FPS;
  let last = 0;
  function pump(ts) {
    if (ts - last >= period) {
      last = ts;
      const cnv = findCanvas();
      if (cnv) sendFrameNow(cnv).catch(() => {});
    }
    requestAnimationFrame(pump);
  }
  requestAnimationFrame(pump);
})();
