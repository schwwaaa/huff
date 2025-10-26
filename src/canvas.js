/* bootstrap helpers (placed first) */
window.$  = window.$  || (id  => document.getElementById(id));
window.$$ = window.$$ || (sel => document.querySelector(sel));
console.log('[init] helpers ready');

// canvas.js — p5 lifecycle + buffers + UI
/* Datamosh Lab — Stable file-only build (camera removed). HTML owns defaults. */
let videoEl, currentBlobUrl = null;
let gCur, gBuf, gWarp, gBloomWork, gTemp;
let frameRing = [];
let canvas, rec, chunks = [];
let playing = false;
let ringDelayAccum = 0;


const els = {};
let baseSeed = 1, seededOnce = false;

// smear phases
let nPhaseX = 0, nPhaseY = 1000;
// auto-feedback phases
let fbPhaseX = 0, fbPhaseY = 100, fbPhaseR = 200, fbPhaseZ = 300;
// burst state
const burst = { on: false, inBurst: true, t: 0, len: 2, gap: 3, boost: 3 };

// rVFC-driven copy into gCur
let lastMediaTime = -1;

// Keep the <video> renderable (avoid display:none which can freeze in some embedders)
function cloakVideo(p5Vid){
  const v = p5Vid && (p5Vid.elt || p5Vid);
  if (!v) return;
  v.setAttribute('playsinline','');
  Object.assign(v.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none'
  });
}

function blitVideoInto(target){
  target.imageMode(CORNER);
  target.clear();
  if (videoEl) { try { target.image(videoEl, 0, 0, target.width, target.height); } catch(e){} }
}

let __camPrimed = false;
async function primeCameraPermissionOnce() {
  if (__camPrimed) return;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    s.getTracks().forEach(t => { try { t.stop(); } catch {} });
    __camPrimed = true;
  } catch (e) {
    // If the system blocked it, Info.plist / entitlements are still missing.
    console.warn('primeCameraPermissionOnce failed:', e);
  }
}


// >>> CHANGED: continuous pump so camera never freezes <<<
function pumpVideoFrames(){
  const v = videoEl && videoEl.elt;
  if (!v) return;

  if (typeof v.requestVideoFrameCallback === 'function') {
    v.requestVideoFrameCallback((_now, _meta) => {
      try { blitVideoInto(gCur); } catch {}
      // keep pumping as long as this element is still active
      if (videoEl && videoEl.elt === v) pumpVideoFrames();
    });
    return;
  }

  // Fallback: RAF blitter (engines without rVFC)
  const vRef = v;
  function tick(){
    try { blitVideoInto(gCur); } catch {}
    if (videoEl && videoEl.elt === vRef) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  try{canvas.hide();}catch(e){console.warn("[setup] canvas hide failed", e);}
  pixelDensity(1);
  allocBuffers();
  clearAll();
  hookUI();
  updateLabels();
  setSeedFromUI();

  // UI toggle + fullscreen
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

  // Resume if WebKit pauses video on FS toggle
  document.addEventListener('fullscreenchange', () => {
    const v = videoEl?.elt;
    if (v && playing && v.paused) { v.play().catch(()=>{}); }
  });
}
window.setup = setup;

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
window.windowResized = windowResized;

function clearAll() {
  [gBuf, gWarp, gBloomWork, gTemp].forEach(g => g.clear());
  frameRing.length = 0;
  seededOnce = false;
}

function hookUI() {
[
  // transport + camera
  'file','playBtn','pauseBtn','recBtn','refreshBtn',
  'camStartBtn','camStopBtn','camRefreshBtn','cams',

  // core
  'quality','qualityVal','depth','depthVal','corrupt','corruptVal','block','blockVal',

  // cadence
  'glitchSpeed','glitchSpeedVal','glitchSpeedFine','glitchSpeedFineVal','glitchSize','glitchSizeVal','glitchSmear','glitchSmearVal',
  'glitchBaseX','glitchBaseXVal','glitchBaseY','glitchBaseYVal',

  // determinism
  'seed',

  // buffer evolution
  'feedback','feedbackVal','persistence','persistenceVal',

  // feedback xyz + theta
  'fbX','fbXVal','fbY','fbYVal','fbZ','fbZVal','fbTheta','fbThetaVal',

  // auto fb + toggles
  'fbAuto','fbSpeed','fbSpeedVal','fbMoveX','fbMoveY','fbMoveZ','fbMoveTheta',

  // spatialization + clusters
  'clusters','clusterCount','clusterCountVal','clusterRadius','clusterRadiusVal','spatialGap','spatialGapVal',

  // cycle + bursts
  'cycleOn','cycleShape','burstOn','burstLen','burstLenVal','burstGap','burstGapVal','burstBoost','burstBoostVal',

  // bloom
  'bloomOn','bloomStrength','bloomStrengthVal','bloomRadius','bloomRadiusVal',

  // flow
  'flowOn','flowStrength','flowStrengthVal','flowScale','flowScaleVal',
  'flowPulse','flowPulseVal','flowImpl','flowImplVal',

  // base video
  'baseOn','baseMix','baseMixVal',

  // seed on load
  'seedOnLoad',

  // colorizer
  'colOn','colHue','colHueVal','colSat','colSatVal',
  'colR','colRVal','colG','colGVal','colB','colBVal',
  'colFB','colFBMix','colFBMixVal','colStyle',

  // symmetry
  'symOn','symMode','symPos','symPosVal',

  // background
  'bgMode',

  // frame-ring delay
  'ringDelay','ringDelayVal'
].forEach(k => els[k] = $(k));


  // file loader
  els.file.addEventListener('change', onFile);

  // transport
  els.playBtn.addEventListener('click', async () => {
    if (!videoEl) return;
    try {
      videoEl.elt.muted = false;
      videoEl.elt.volume = 1.0;
      videoEl.elt.setAttribute('playsinline','');
      await videoEl.elt.play();
    } catch (e) {
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

  els.recBtn.addEventListener('click', toggleRecord);
  els.refreshBtn.addEventListener('click', refreshGlitch);
  if (els.borderlessBtn) els.borderlessBtn.addEventListener('click', toggleBorderless);

  // labels only
  // els.seed.addEventListener('change', setSeedFromUI);
  // ['quality','depth','corrupt','block','glitchSpeed','glitchSpeedFine','glitchSize','glitchSmear',
  //  'feedback','persistence','fbX','fbY','fbZ','fbTheta','fbSpeed',
  //  'spatialGap','clusterCount','clusterRadius',
  //  'burstLen','burstGap','burstBoost',
  //  'bloomStrength','bloomRadius','flowStrength','flowScale',
  //  'baseMix','colHue','colSat'].forEach(id => els[id].addEventListener('input', updateLabels));
  // ['cycleShape'].forEach(id => els[id].addEventListener('change', updateLabels));
  // els.baseOn.addEventListener('change', () => { els.baseMix.disabled = !els.baseOn.checked; updateLabels(); });

  els.seed.addEventListener('change', setSeedFromUI);
  ['quality','depth','corrupt','block','glitchSpeed','glitchSpeedFine','glitchSize','glitchSmear','glitchBaseX','glitchBaseY',
   'feedback','persistence',
   'fbX','fbY','fbZ','fbTheta',
  //  'fbSpeed',
   'spatialGap','clusterCount','clusterRadius',
   'burstLen','burstGap','burstBoost',
   'bloomStrength','bloomRadius','flowStrength','flowScale','flowPulse','flowImpl',
   'baseMix','symPos','ringDelay','ringDelayVal'].forEach(id => els[id].addEventListener('input', updateLabels));
  ['cycleShape'].forEach(id => els[id].addEventListener('change', updateLabels));
  els.baseOn.addEventListener('change', () => { els.baseMix.disabled = !els.baseOn.checked; updateLabels(); });


  // CAMERA wiring (added)
  if (els.camStartBtn)  els.camStartBtn.addEventListener('click', () => {
    const id = (els.cams && els.cams.value) || null;
    startCamera(id);
  });
  if (els.camStopBtn)   els.camStopBtn.addEventListener('click', stopCamera);
  if (els.camRefreshBtn) els.camRefreshBtn.addEventListener('click', listCameras);
  if (els.cams) els.cams.addEventListener('change', () => {
    try {
      const active = videoEl && videoEl.elt && videoEl.elt.srcObject;
      if (active) startCamera(els.cams.value || null);
    } catch {}
  });

  updateDim();

  // Try to populate device list up front
  try { listCameras(); } catch {}
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
  // els.fbSpeedVal.textContent = f2(els.fbSpeed.value);
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

  // inside updateLabels()
  if (els.flowPulse) els.flowPulseVal.textContent = (els.flowPulse.value|0);
  if (els.flowImpl)  els.flowImplVal.textContent  = (+els.flowImpl.value).toFixed(2);

if (els.glitchBaseX) els.glitchBaseXVal.textContent = (els.glitchBaseX.value|0);
if (els.glitchBaseY) els.glitchBaseYVal.textContent = (els.glitchBaseY.value|0);

  // inside updateLabels()
  if (els.ringDelay) els.ringDelayVal.textContent = (els.ringDelay.value|0);

  if (els.symPos) els.symPosVal.textContent = (+els.symPos.value).toFixed(2);

  // Colorizer
  // els.colHueVal.textContent = els.colHue.value;
  // els.colSatVal.textContent = (+els.colSat.value).toFixed(2);

}

function setSeedFromUI(){
  baseSeed = parseInt(els.seed.value || '1', 10);
  if (isNaN(baseSeed)) baseSeed = 1;
  noiseSeed(baseSeed);
}

// ---------- FIXED: robust first-load + immediate autoplay ----------
function onFile(ev){
  const input = ev.target;
  const file = input.files?.[0]; if (!file) return;

  // Allow re-selecting the SAME file later
  queueMicrotask(() => { try { input.value = ''; } catch {} });

  // Cleanup previous (also stop camera tracks if any)
  try {
    if (videoEl && videoEl.elt && videoEl.elt.srcObject) {
      videoEl.elt.srcObject.getTracks().forEach(t => { try{t.stop();}catch{} });
    }
  } catch {}
  if (videoEl) { try { videoEl.remove(); } catch {} videoEl = null; }
  if (currentBlobUrl) { try { URL.revokeObjectURL(currentBlobUrl); } catch {} currentBlobUrl = null; }

  const url = URL.createObjectURL(file);
  currentBlobUrl = url;

  // Create hidden <video> via p5
  videoEl = createVideo([url], () => enableTransport(true));
  videoEl.attribute('preload','auto');
  videoEl.attribute('playsinline','');
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
          v.setAttribute('playsinline','');
          await v.play();
          pumpVideoFrames();
          videoEl.loop();
          playing = true;

          const unmuteOnce = () => {
            try { v.muted = false; v.volume = 1.0; } catch {}
            window.removeEventListener('pointerdown', unmuteOnce, true);
            window.removeEventListener('keydown',  unmuteOnce, true);
          };
          window.addEventListener('pointerdown', unmuteOnce, true);
          window.addEventListener('keydown',  unmuteOnce, true);
        } catch {
          const gesture = async () => {
            try { await v.play(); pumpVideoFrames(); videoEl.loop(); playing = true; } catch {}
            window.removeEventListener('pointerdown', gesture, true);
            window.removeEventListener('keydown',  gesture, true);
          };
          window.addEventListener('pointerdown', gesture, true);
          window.addEventListener('keydown',  gesture, true);
        }
      })();

      enableTransport(true);
    }
  };

  v.addEventListener('loadedmetadata', primeOnce, { once: true });
  v.addEventListener('loadeddata',     primeOnce, { once: true });
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => primeOnce());
  setTimeout(primeOnce, 80);

  v.addEventListener('error', (e) => {
    console.warn('[video] error', e);
    enableTransport(true);
  }, { once: true });
}

function enableTransport(enabled){
  ['playBtn','pauseBtn','recBtn','refreshBtn','borderlessBtn'].forEach(id=>{
    const b = els[id]; if (b) b.disabled = !enabled;
  });
}

function draw() {
  // background(0);

  let bg = (els.bgMode && els.bgMode.value) || 'black';
  if (bg === 'white')      background(255);
  else if (bg === 'green') background(0, 255, 0);   // chroma green
  else if (bg === 'blue')  background(0, 0, 255);   // chroma blue
  else                     background(0);           // black (default)

  if (!videoEl) { drawWaiting(); return; }

  randomSeed(baseSeed + frameCount);
  noiseSeed(baseSeed);

  // If rVFC is missing, pull a frame in draw
  if (!videoEl.elt.requestVideoFrameCallback) blitVideoInto(gCur);

  if (!seededOnce && els.seedOnLoad.checked) {
    gBuf.image(gCur, 0, 0, gBuf.width, gBuf.height);
    seededOnce = true;
  }

  // persistence decay
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

  const coarse = parseFloat(els.glitchSpeed.value);
  const fine   = parseFloat(els.glitchSpeedFine.value || 1);
  const density = coarse * fine;
  nPhaseX += density * 0.01;
  nPhaseY += density * 0.011;

  updateBurstState();

  const Q = parseFloat(els.quality.value);
  const everyN  = Q >= 0.9 ? 1 : Q >= 0.7 ? 2 : Q >= 0.5 ? 3 : 4;

applyGlitch(
  density,
  parseInt(els.glitchBaseX?.value || '0', 10),
  parseInt(els.glitchBaseY?.value || '0', 10)
);

  // Feedback transforms
  const fb = parseFloat(els.feedback.value);
  if (fb > 0) {
    let fx = parseFloat(els.fbX.value) || 0;
    let fy = parseFloat(els.fbY.value) || 0;
    let fz = parseFloat(els.fbZ.value) || 1;
    let ft = radians(parseFloat(els.fbTheta.value) || 0);

    // if (els.fbAuto.checked) {
    //   const sp = parseFloat(els.fbSpeed.value);
    //   fbPhaseX += sp * 0.005; fbPhaseY += sp * 0.006; fbPhaseR += sp * 0.004; fbPhaseZ += sp * 0.003;
    //   if (els.fbMoveX.checked)      fx += map(noise(fbPhaseX), 0, 1, -20, 20);
    //   if (els.fbMoveY.checked)      fy += map(noise(fbPhaseY), 0, 1, -20, 20);
    //   if (els.fbMoveTheta.checked)  ft += radians(map(noise(fbPhaseR), 0, 1, -10, 10));
    //   if (els.fbMoveZ.checked)      fz *= (1.0 + map(noise(fbPhaseZ), 0, 1, -0.01, 0.01));
    // }

    const tmp = gBuf.get();
    gBuf.clear();
    gBuf.push();
    gBuf.tint(255, fb * 255);
    gBuf.imageMode(CENTER);
    gBuf.translate(gBuf.width/2, gBuf.height/2);
    gBuf.rotate(ft);
    gBuf.scale(fz);
    gBuf.image(tmp, fx, fy, gBuf.width, gBuf.height);
    gBuf.pop();
  }

  // Flow
  const flowS = parseInt(els.flowStrength.value, 10);
  if (els.flowOn.checked && flowS > 0 && (frameCount % everyN === 0)) {
    applyFlowWarp(gBuf, gWarp, flowS, parseInt(els.flowScale.value, 10),parseInt(els.flowPulse?.value || '0', 100),parseFloat(els.flowImpl?.value || '0') );
    const t = gBuf; gBuf = gWarp; gWarp = t;
  }
// Flow
// const flowS = parseInt(els.flowStrength.value, 10);
// if (els.flowOn.checked && flowS > 0 && (frameCount % everyN === 0)) {
//   applyFlowWarp(
//     gBuf, gWarp,
//     flowS,
//     parseInt(els.flowScale.value, 10),
//     parseInt(els.flowPulse?.value || '0', 10),       // NEW pulse spacing
//     parseFloat(els.flowImpl?.value || '0')           // NEW implosion
//   );
//   const t = gBuf; gBuf = gWarp; gWarp = t;
// }



  // Bloom
  const bloomK = parseFloat(els.bloomStrength.value);
  const bloomR = parseInt(els.bloomRadius.value, 10);
  if (els.bloomOn.checked && bloomK > 0 && bloomR > 0 && (frameCount % everyN === 0)) {
    gBloomWork.clear();
    gBloomWork.imageMode(CORNER);
    gBloomWork.image(gBuf, 0, 0, gBloomWork.width, gBloomWork.height);
    gBloomWork.filter(BLUR, bloomR);
    gBuf.push(); gBuf.imageMode(CORNER); gBuf.blendMode(ADD);
    gBuf.tint(255, Math.min(2, bloomK) * 255);
    gBuf.image(gBloomWork, 0, 0, gBuf.width, gBuf.height); gBuf.pop();
  }

  // Colorizer
  if (els.colOn && els.colOn.checked) {
    applyColorizer(gBuf, gTemp,
      parseInt(els.colHue.value, 10),
      parseFloat(els.colSat.value));
    const t = gBuf; gBuf = gTemp; gTemp = t;
  }

  // Symmetry
if (els.symOn && els.symOn.checked) {
  const mode = (els.symMode && els.symMode.value) || 'v'; // 'v'|'h'|'hv'
  applySymmetry(gBuf, gTemp, mode, parseFloat(els.symPos?.value || '0.5'));
  const tS = gBuf; gBuf = gTemp; gTemp = tS;
}


  // Base composite
  if (els.baseOn.checked && parseFloat(els.baseMix.value) > 0) {
    push(); tint(255, parseFloat(els.baseMix.value) * 255); image(gCur, 0, 0, width, height); pop();
  }
  image(gBuf, 0, 0, width, height);

  // // ring for depth sampling
  // const ringCap = Math.round(60 * (parseFloat(els.quality.value) * 2));
  // frameRing.push(gCur.get());
  // if (frameRing.length > ringCap) frameRing.shift();

  const ringCap = Math.round(60 * (parseFloat(els.quality.value) * 2));

// accumulate elapsed time (p5's deltaTime is ms)
ringDelayAccum += (typeof deltaTime === 'number' ? deltaTime : 16.6);
const ringDelayMs = parseInt(els.ringDelay?.value || '0', 10);

// only capture a new frame when enough time has passed
if (ringDelayAccum >= ringDelayMs) {
  frameRing.push(gCur.get());
  if (frameRing.length > ringCap) frameRing.shift();
  ringDelayAccum = 0;
}


}

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

// Ensure hookUI runs after DOM is ready (safety)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { try { hookUI && hookUI(); } catch(e){ console.warn('[hookUI] deferred failed:', e); } });
} else { try { hookUI && hookUI(); } catch(e){ console.warn('[hookUI] immediate failed:', e); } }

/* ===================== CAMERA HELPERS (added) ===================== */

// Enumerate cameras (labels appear after first permission grant)
async function listCameras(){
  try {
    await primeCameraPermissionOnce();          // ← added
    const devs = await navigator.mediaDevices.enumerateDevices();
    const vids = devs.filter(d => d.kind === 'videoinput');
    if (!els.cams) return vids.length;
    const prev = els.cams.value;
    els.cams.innerHTML = '';
    vids.forEach((d,i) => {
      const o = document.createElement('option');
      o.value = d.deviceId || '';
      o.textContent = d.label || `Camera ${i+1}`;
      els.cams.appendChild(o);
    });
    if (prev && Array.from(els.cams.options).some(o => o.value === prev)) els.cams.value = prev;
    return vids.length;
  } catch(e){
    console.warn('enumerateDevices failed:', e);
    return 0;
  }
}


// Build constraints that NEVER ask for mic (avoid mic permission conflicts)
function cameraConstraints(deviceId){
  const video = deviceId && deviceId.length
    ? { deviceId: { exact: deviceId } }
    : { facingMode: { ideal: 'user' } };
  return { video, audio: false }; // video-only
}

function stopCamera(){
  try {
    if (videoEl && videoEl.elt && videoEl.elt.srcObject) {
      videoEl.elt.srcObject.getTracks().forEach(t => { try{ t.stop(); } catch{} });
    }
  } catch {}
  try { if (videoEl) videoEl.remove(); } catch {}
  videoEl = null;
  playing = false;
  try { enableTransport(false); } catch {}
}

function startCamera(deviceId){
  // Stop any existing (file or camera)
  stopCamera();

  const cons = cameraConstraints(deviceId || null);
  try {
    videoEl = createCapture(cons, () => {
      try { enableTransport(true); } catch {}
      listCameras();  // labels/ids populate after first allow

      const v = videoEl.elt;
      try { v.setAttribute('playsinline',''); } catch {}
      try { v.setAttribute('muted',''); v.muted = true; } catch {}

      const kick = () => {
        try { v.play().catch(()=>{}); } catch {}
        try { pumpVideoFrames(); } catch {}
      };
      if (v.readyState >= 1) kick();
      else v.addEventListener('loadedmetadata', kick, { once:true });
    });

    // Keep the element out of layout but renderable (no display:none)
    try { cloakVideo(videoEl); } catch {}

    playing = true;
  } catch(e){
    console.warn('startCamera error:', e);
    try { enableTransport(true); } catch {}
  }
}
/* =================== end CAMERA HELPERS (added) =================== */

// ws-mirror.js — sender (stable), opens viewer popup with minimal chrome
(function(){
  const STREAM_MAX_W = 1280;
  const STREAM_MAX_H = 1280;
  const STREAM_FPS   = 30;
  const STREAM_Q     = 0.76;
  const USE_JPEG     = true;

  function setWSStatus(txt){
    const el = document.getElementById('status');
    if (el) el.textContent = txt;
  }
  function findCanvas(){
    try { if (typeof canvas !== 'undefined' && canvas && canvas.elt instanceof HTMLCanvasElement) return canvas.elt; } catch(e){}
    const c = document.querySelector('canvas');
    return c || null;
  }
  // const wsUrl = (typeof __getWSURL__ === 'function') ? __getWSURL__() : (window.WS_MIRROR_URL || 'ws://127.0.0.1:17777');
  const wsUrl = (typeof __getWSURL__ === 'function') ? __getWSURL__() : (window.WS_MIRROR_URL || 'ws://127.0.0.1:8787');

  const openBtn = document.getElementById('openCanvasBtn');
  if (openBtn) openBtn.addEventListener('click', () => {
    const url = 'canvas.html?ws=' + encodeURIComponent(wsUrl) + '&mode=stretch&autofs=1';
    const features = 'popup=yes,noopener,noreferrer,menubar=0,toolbar=0,location=0,status=0,scrollbars=0,resizable=1,width=1280,height=720,left=80,top=60';
    window.open(url, 'canvas-mirror', features);
  });

  let ws = null, connected = false, sending = false;
  function ensureWS(){
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { connected = true; setWSStatus('WS: connected'); try{ ws.send(JSON.stringify({type:'hello', role:'index'})); }catch(e){}; console.log('[ws] connect'); };
    ws.onclose = () => { connected = false; setWSStatus('WS: disconnected'); console.log('[ws] close'); setTimeout(ensureWS, 1500); };
  }
  ensureWS();

  async function sendFrameNow(cnv){
    if (!connected || !ws || ws.readyState !== 1 || sending) return;
    sending = true;
    try {
      const sw = cnv.width, sh = cnv.height;
      const scale = Math.min(1, Math.min(STREAM_MAX_W / sw, STREAM_MAX_H / sh));
      const tw = Math.max(1, Math.round(sw * scale));
      const th = Math.max(1, Math.round(sh * scale));
      const tcv = sendFrameNow._tcv || (sendFrameNow._tcv = document.createElement('canvas'));
      const ttx = sendFrameNow._ttx || (sendFrameNow._ttx = tcv.getContext('2d', { alpha:false }));
      if (tcv.width !== tw || tcv.height !== th) { tcv.width = tw; tcv.height = th; }
      ttx.drawImage(cnv, 0, 0, tw, th);
      const mime = USE_JPEG ? 'image/jpeg' : 'image/webp';
      await new Promise((resolve) => {
        tcv.toBlob((blob) => { try { if (blob) ws.send(blob); } catch(e){} resolve(); }, mime, STREAM_Q);
      });
    } finally { sending = false; }
  }

  let last = 0;
  function pump(ts){
    try {
      const cnv = findCanvas();
      if (cnv){
        const period = 1000 / Math.max(1, 30);
        if (!last || ts - last >= period){ last = ts; sendFrameNow(cnv); }
      }
    } catch(e){}
    requestAnimationFrame(pump);
  }
  requestAnimationFrame(pump);
})();
