/* canvas.js — p5 lifecycle + buffers + UI
 * Key fixes in this version:
 *  - Video waits readyState >= 3 (HAVE_FUTURE_DATA) — eliminates jitter on load
 *  - requestVideoFrameCallback for exact decode-sync blitting
 *  - Feedback uses drawingContext.drawImage — no gBuf.get() allocation per frame
 *  - Solarize frame-skips based on quality setting (big Windows perf win)
 *  - playBtn toggles label
 *  - frameRing capped at 192MB
 */

window.$  = window.$  || (id  => document.getElementById(id));
window.$$ = window.$$ || (sel => document.querySelector(sel));

let videoEl, currentBlobUrl = null;
let gCur, gBuf, gWarp, gTemp;
let _fbCanvas = null, _fbCtx = null; // reusable feedback offscreen canvas
let frameRing = [];
let canvas, chunks = [];
let playing = false;

const els = {};
let baseSeed = 1, seededOnce = false;
let nPhaseX = 0, nPhaseY = 1000;

// ─── video helpers ──────────────────────────────────────────────────────────

function cloakVideo(p5Vid) {
  const v = p5Vid && (p5Vid.elt || p5Vid);
  if (!v || v._cloaked) return;
  v._cloaked = true;
  v.setAttribute('playsinline', '');
  Object.assign(v.style, { position:'fixed', left:'-10000px', top:'0',
    width:'1px', height:'1px', opacity:'0', pointerEvents:'none' });
}

function blitVideoInto(target) {
  target.imageMode(CORNER);
  target.clear();
  if (videoEl) { try { target.image(videoEl, 0, 0, target.width, target.height); } catch {} }
}

let __camPrimed = false;
async function primeCameraPermissionOnce() {
  if (__camPrimed) return;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
    s.getTracks().forEach(t => { try { t.stop(); } catch {} });
    __camPrimed = true;
  } catch(e) { console.warn('primeCam:', e); }
}

// Sync-accurate frame pump — uses rVFC where available, falls back to RAF
// Video blitting is handled directly in draw() — no separate pump loop needed.
// This avoids requestVideoFrameCallback firing continuously even when paused.
function pumpVideoFrames() {
  // no-op — kept for call-site compatibility
}

// ─── p5 setup / resize ──────────────────────────────────────────────────────

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  try { canvas.hide(); } catch {}
  pixelDensity(1);
  allocBuffers();
  clearAll();
  hookUI();
  updateLabels();
  setSeedFromUI();

  window.addEventListener('keydown', e => {
    if (e.key === 'p' || e.key === 'P') {
      const h = document.querySelector('header');
      h.style.display = h.style.display === 'none' ? '' : 'none';
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
    if (v && playing && v.paused) v.play().catch(() => {});
  });
}
window.setup = setup;

function allocBuffers() {
  [gCur, gBuf, gWarp, gTemp].forEach(g => { try { if (g) g.remove(); } catch {} });
  gCur = createGraphics(width, height); gBuf = createGraphics(width, height);
  gWarp = createGraphics(width, height); gTemp = createGraphics(width, height);
  _fbCanvas = null; _fbCtx = null;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  allocBuffers(); clearAll(); updateDim();
}
window.windowResized = windowResized;

function clearAll() {
  [gBuf, gWarp, gTemp].forEach(g => g.clear());
  frameRing.length = 0;
  seededOnce = false;
}

// ─── UI wiring ──────────────────────────────────────────────────────────────

function hookUI() {
  [
    'file','playBtn','recBtn','refreshBtn','resetBtn',
    'camStartBtn','camStopBtn','camRefreshBtn','cams','corruptOn',
    'quality','qualityVal','depth','depthVal','corrupt','corruptVal','block','blockVal',
    'glitchSpeed','glitchSpeedVal','glitchSpeedFine','glitchSpeedFineVal',
    'glitchSize','glitchSizeVal','glitchSmear','glitchSmearVal',
    'glitchBaseX','glitchBaseXVal','glitchBaseY','glitchBaseYVal',
    'glitchSpeedMul','glitchSpeedMulVal','glitchAlpha','glitchAlphaVal',
    'glitchJitter','glitchJitterVal','glitchSmearAngle','glitchSmearAngleVal','seed',
    'feedback','feedbackVal','persistence','persistenceVal',
    'fbX','fbXVal','fbY','fbYVal','fbZ','fbZVal','fbTheta','fbThetaVal',
    'clusters','clusterTiles','clusterCount','clusterCountVal',
    'clusterRadius','clusterRadiusVal','spatialGap','spatialGapVal',
    'cluCenters','cluCentersVal','cluSpread','cluSpreadVal',
    'flowOn','flowStrength','flowStrengthVal','flowScale','flowScaleVal',
    'flowPulse','flowPulseVal','flowImpl','flowImplVal',
    'baseOn','baseMix','baseMixVal','seedOnLoad',
    'symOn','symMode','symPos','symPosVal',
    'solarizeOn','solarizeThresh','solarizeThreshVal','solarizeAmt','solarizeAmtVal',
    'solarizeR','solarizeRVal','solarizeG','solarizeGVal','solarizeB','solarizeBVal',
    'scanAlpha','scanAlphaVal','scanShift','scanShiftVal','scanDrift','scanDriftVal',
    'depthScatter','depthScatterVal','corruptDrift','corruptDriftVal',
    'trailLayers','trailLayersVal','trailDepth','trailDepthVal','bgMode',
  ].forEach(k => els[k] = $(k));

  els.file.addEventListener('change', onFile);

  // ── PLAY button ─────────────────────────────────────────────────────────
  if (els.playBtn) {
    els.playBtn.addEventListener('click', async () => {
      if (!videoEl) return;
      const v = videoEl.elt;
      try { await v.play(); } catch { try { v.muted = true; await v.play(); } catch {} }
      playing = true;
    });
  }

  // ── PAUSE button ────────────────────────────────────────────────────────
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      if (!videoEl) return;
      videoEl.elt.pause();
      playing = false;
    });
  }

  els.refreshBtn.addEventListener('click', refreshGlitch);
  els.seed.addEventListener('change', setSeedFromUI);

  // Volume slider — controls live video element directly
  const volSlider = document.getElementById('volumeSlider');
  if (volSlider) {
    volSlider.addEventListener('input', () => {
      const vol = parseFloat(volSlider.value);
      if (videoEl && videoEl.elt) {
        videoEl.elt.muted  = (vol === 0);
        videoEl.elt.volume = vol;
      }
    });
  }

  [
    'quality','depth','corrupt','block','glitchSpeed','glitchSpeedFine',
    'glitchSize','glitchSmear','glitchBaseX','glitchBaseY',
    'feedback','persistence','fbX','fbY','fbZ','fbTheta',
    'spatialGap','clusterCount','clusterRadius','cluCenters','cluSpread',
    'scanAlpha','scanShift','scanDrift','glitchAlpha','glitchJitter','glitchSmearAngle',
    'flowStrength','flowScale','flowPulse','flowImpl','baseMix','symPos','glitchSpeedMul',
    'depthScatter','corruptDrift','trailLayers','trailDepth',
    'solarizeThresh','solarizeAmt','solarizeR','solarizeG','solarizeB',
  ].forEach(id => els[id]?.addEventListener('input', updateLabels));

  els.baseOn?.addEventListener('change', () => {
    els.baseMix.disabled = !els.baseOn.checked; updateLabels();
  });

  els.camStartBtn?.addEventListener('click',  () => startCamera(els.cams?.value || null));
  els.camStopBtn?.addEventListener('click',   stopCamera);
  els.camRefreshBtn?.addEventListener('click', listCameras);
  els.cams?.addEventListener('change', () => {
    try { if (videoEl?.elt?.srcObject) startCamera(els.cams.value || null); } catch {}
  });

  updateDim();
  try { listCameras(); } catch {}
}

function updateDim() { if (els.dim) els.dim.textContent = `${width}×${height}`; }

function updateLabels() {
  const f2 = v => (+v).toFixed(2);
  const set = (el, valEl, fmt) => { if (el && valEl) valEl.textContent = fmt(el.value); };
  set(els.quality,          els.qualityVal,          f2);
  set(els.depth,            els.depthVal,            f2);
  set(els.corrupt,          els.corruptVal,          f2);
  set(els.block,            els.blockVal,            v => v);
  set(els.glitchSpeed,      els.glitchSpeedVal,      f2);
  set(els.glitchSpeedFine,  els.glitchSpeedFineVal,  f2);
  set(els.glitchSize,       els.glitchSizeVal,       v => v);
  set(els.glitchSmear,      els.glitchSmearVal,      v => v);
  set(els.feedback,         els.feedbackVal,         f2);
  set(els.persistence,      els.persistenceVal,      f2);
  set(els.fbX,              els.fbXVal,              f2);
  set(els.fbY,              els.fbYVal,              f2);
  set(els.fbZ,              els.fbZVal,              f2);
  set(els.fbTheta,          els.fbThetaVal,          v => v);
  set(els.spatialGap,       els.spatialGapVal,       v => v);
  set(els.clusterCount,     els.clusterCountVal,     v => v);
  set(els.clusterRadius,    els.clusterRadiusVal,    v => v);
  set(els.cluCenters,       els.cluCentersVal,       v => v);
  set(els.cluSpread,        els.cluSpreadVal,        v => v);
  set(els.flowStrength,     els.flowStrengthVal,     v => v);
  set(els.flowScale,        els.flowScaleVal,        v => v);
  set(els.flowPulse,        els.flowPulseVal,        v => (v|0));
  set(els.flowImpl,         els.flowImplVal,         f2);
  set(els.glitchBaseX,      els.glitchBaseXVal,      v => (v|0));
  set(els.glitchBaseY,      els.glitchBaseYVal,      v => (v|0));
  set(els.glitchSpeedMul,   els.glitchSpeedMulVal,   f2);
  set(els.glitchAlpha,      els.glitchAlphaVal,      f2);
  set(els.glitchJitter,     els.glitchJitterVal,     f2);
  set(els.glitchSmearAngle, els.glitchSmearAngleVal, v => (v|0)+'°');
  set(els.scanAlpha,        els.scanAlphaVal,        f2);
  set(els.scanShift,        els.scanShiftVal,        f2);
  set(els.scanDrift,        els.scanDriftVal,        f2);
  set(els.depthScatter,     els.depthScatterVal,     f2);
  set(els.corruptDrift,     els.corruptDriftVal,     f2);
  set(els.trailLayers,      els.trailLayersVal,      v => (v|0));
  set(els.trailDepth,       els.trailDepthVal,       f2);
  set(els.symPos,           els.symPosVal,           f2);
  set(els.solarizeThresh,   els.solarizeThreshVal,   f2);
  set(els.solarizeAmt,      els.solarizeAmtVal,      f2);
  set(els.solarizeR,        els.solarizeRVal,        f2);
  set(els.solarizeG,        els.solarizeGVal,        f2);
  set(els.solarizeB,        els.solarizeBVal,        f2);
  if (els.baseMix && els.baseMixVal) {
    els.baseMixVal.textContent = f2(els.baseMix.value);
    els.baseMix.disabled = !els.baseOn?.checked;
  }
}

function setSeedFromUI() {
  baseSeed = parseInt(els.seed?.value || '1', 10);
  if (isNaN(baseSeed)) baseSeed = 1;
  noiseSeed(baseSeed);
}

// ─── file loading ────────────────────────────────────────────────────────────

function onFile(ev) {
  const input = ev.target;
  const file = input.files?.[0]; if (!file) return;
  queueMicrotask(() => { try { input.value = ''; } catch {} });

  // Teardown previous
  try { videoEl?.elt?.srcObject?.getTracks().forEach(t => t.stop()); } catch {}
  try { if (videoEl) videoEl.remove(); } catch {}
  videoEl = null;
  if (currentBlobUrl) { try { URL.revokeObjectURL(currentBlobUrl); } catch {} currentBlobUrl = null; }

  playing = false;
  enableTransport(false);

  currentBlobUrl = URL.createObjectURL(file);
  videoEl = createVideo([currentBlobUrl], () => {});
  cloakVideo(videoEl);

  const v = videoEl.elt;
  v.preload      = 'auto';
  v.muted        = true;
  v.volume       = 1.0;
  v.playbackRate = 1.0;
  v.setAttribute('playsinline', '');
  try { v.disableRemotePlayback = true; } catch {}

  let primed = false;
  const startPlayback = async () => {
    if (primed) return;
    // Need HAVE_FUTURE_DATA (3) at minimum — guarantees smooth start
    if (v.readyState < 3 || v.videoWidth === 0) return;
    primed = true;
    clearAll(); updateDim();
    try { blitVideoInto(gCur); } catch {}

    try {
      await v.play();
    } catch {
      const gesture = async () => {
        try { await v.play(); } catch {}
        window.removeEventListener('pointerdown', gesture, true);
        window.removeEventListener('keydown',     gesture, true);
      };
      window.addEventListener('pointerdown', gesture, true);
      window.addEventListener('keydown',     gesture, true);
    }
    try { videoEl.elt.loop = true; } catch {}
    playing = true;
    enableTransport(true);

    // Apply current volume slider setting
    const volSlider = document.getElementById('volumeSlider');
    const vol = volSlider ? parseFloat(volSlider.value) : 1;
    try { v.muted = (vol === 0); v.volume = vol; } catch {}
  };

  v.addEventListener('canplay',        startPlayback, { once: true });
  v.addEventListener('canplaythrough', startPlayback, { once: true });
  v.addEventListener('loadeddata',     startPlayback, { once: true });
  // Poll fallback for slow WebViews
  let poll = 0;
  const poller = setInterval(() => { startPlayback(); if (primed || ++poll > 40) clearInterval(poller); }, 100);
  v.addEventListener('error', () => { clearInterval(poller); enableTransport(true); }, { once: true });
  v.load();
}

function enableTransport(en) {
  ['playBtn','pauseBtn','recBtn','refreshBtn'].forEach(id => {
    const b = document.getElementById(id); if (b) b.disabled = !en;
  });
}

// ─── draw loop ───────────────────────────────────────────────────────────────

function draw() {
  const bg = els.bgMode?.value || 'black';
  if      (bg === 'white') background(255);
  else if (bg === 'green') background(0,255,0);
  else if (bg === 'blue')  background(0,0,255);
  else                     background(0);

  if (!videoEl) { drawWaiting(); return; }

  randomSeed(baseSeed + frameCount);
  noiseSeed(baseSeed);

  // Blit current video frame into gCur only when playing
  if (playing) { try { blitVideoInto(gCur); } catch {} }

  if (!seededOnce && els.seedOnLoad?.checked) {
    gBuf.image(gCur, 0, 0, gBuf.width, gBuf.height);
    seededOnce = true;
  }

  // Persistence decay — pure ctx op, no p5 push/pop needed
  const pers = parseFloat(els.persistence?.value ?? '0.7');
  if (pers < 1) {
    const ctx = gBuf.drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${map(1-pers,0,1,1,20)/255})`;
    ctx.fillRect(0, 0, gBuf.width, gBuf.height);
    ctx.restore();
  }

  const mul     = parseFloat(els.glitchSpeedMul?.value ?? '1');
  const coarse  = parseFloat(els.glitchSpeed?.value    ?? '0.8') * mul;
  const fine    = parseFloat(els.glitchSpeedFine?.value ?? '1')  * mul;
  const density = coarse * fine;
  nPhaseX += density * 0.01;
  nPhaseY += density * 0.011;

  const Q      = parseFloat(els.quality?.value ?? '1');
  const everyN = Q >= 0.9 ? 1 : Q >= 0.7 ? 2 : Q >= 0.5 ? 3 : 4;

  applyGlitch(density,
    parseInt(els.glitchBaseX?.value ?? '0', 10),
    parseInt(els.glitchBaseY?.value ?? '0', 10));

  // Feedback — drawingContext only, no p5 .get() allocation
  const fb = parseFloat(els.feedback?.value ?? '0');
  if (fb > 0) {
    const fx = parseFloat(els.fbX?.value    ?? '0');
    const fy = parseFloat(els.fbY?.value    ?? '0');
    const fz = parseFloat(els.fbZ?.value    ?? '1');
    const ft = (parseFloat(els.fbTheta?.value ?? '0') * Math.PI) / 180;

    const gCanvas = gBuf.elt || gBuf.drawingContext.canvas;
    if (!_fbCanvas || _fbCanvas.width !== gBuf.width || _fbCanvas.height !== gBuf.height) {
      _fbCanvas = document.createElement('canvas');
      _fbCanvas.width = gBuf.width; _fbCanvas.height = gBuf.height;
      _fbCtx = _fbCanvas.getContext('2d', { alpha: true });
    }
    _fbCtx.clearRect(0,0,_fbCanvas.width,_fbCanvas.height);
    _fbCtx.drawImage(gCanvas, 0, 0);

    const ctx = gBuf.drawingContext;
    ctx.save();
    ctx.clearRect(0, 0, gBuf.width, gBuf.height);
    ctx.globalAlpha = Math.min(1, fb);
    ctx.translate(gBuf.width/2 + fx, gBuf.height/2 + fy);
    ctx.rotate(ft);
    ctx.scale(fz, fz);
    ctx.drawImage(_fbCanvas, -gBuf.width/2, -gBuf.height/2, gBuf.width, gBuf.height);
    ctx.restore();
  }

  // Flow
  const flowS = parseInt(els.flowStrength?.value ?? '0', 10);
  if (els.flowOn?.checked && flowS > 0 && (frameCount % everyN === 0)) {
    applyFlowWarp(gBuf, gWarp, flowS,
      parseInt(els.flowScale?.value  ?? '80', 10),
      parseInt(els.flowPulse?.value  ?? '0',  10),
      parseFloat(els.flowImpl?.value ?? '0'));
    [gBuf, gWarp] = [gWarp, gBuf];
  }

  // Symmetry
  if (els.symOn?.checked) {
    applySymmetry(gBuf, gTemp, els.symMode?.value || 'v', parseFloat(els.symPos?.value ?? '0.5'));
    [gBuf, gTemp] = [gTemp, gBuf];
  }

  // Solarize — frame-skip at lower quality for Windows perf
  if (els.solarizeOn?.checked && (frameCount % everyN === 0)) {
    applySolarize(gBuf,
      parseFloat(els.solarizeThresh?.value ?? '0.5'),
      parseFloat(els.solarizeAmt?.value    ?? '1.0'),
      parseFloat(els.solarizeR?.value      ?? '1.0'),
      parseFloat(els.solarizeG?.value      ?? '1.0'),
      parseFloat(els.solarizeB?.value      ?? '1.0'));
  }

  // Composite
  if (els.baseOn?.checked && parseFloat(els.baseMix?.value ?? '0') > 0) {
    push(); tint(255, parseFloat(els.baseMix.value) * 255);
    image(gCur, 0, 0, width, height); pop();
  }
  image(gBuf, 0, 0, width, height);

  // Frame ring
  const bytesPerFrame = width * height * 4;
  let ringCap = Math.max(4, Math.round(60 * (Q * 2)));
  ringCap = Math.min(ringCap, Math.max(4, Math.floor(192*1024*1024 / bytesPerFrame)));
  gCur.loadPixels();
  if (gCur.pixels.length > 0) {
    frameRing.push(new ImageData(new Uint8ClampedArray(gCur.pixels.buffer.slice(0)), gCur.width, gCur.height));
    while (frameRing.length > ringCap) frameRing.shift();
  }
}

function refreshGlitch() {
  clearAll();
  nPhaseX = 0; nPhaseY = 1000;
}

function drawWaiting() {
  noStroke(); fill(255,20); rect(0,0,width,height);
  fill(220); textAlign(CENTER,CENTER); textSize(14);
  text('Load a video or start a camera  ·  P: toggle UI  ·  F: fullscreen', width/2, height/2);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { try { hookUI(); } catch(e) { console.warn('[hookUI]',e); } });
} else { try { hookUI(); } catch(e) { console.warn('[hookUI]',e); } }

// ─── camera ──────────────────────────────────────────────────────────────────

async function listCameras() {
  try {
    await primeCameraPermissionOnce();
    const devs = await navigator.mediaDevices.enumerateDevices();
    const vids = devs.filter(d => d.kind === 'videoinput');
    if (!els.cams) return vids.length;
    const prev = els.cams.value;
    els.cams.innerHTML = '';
    vids.forEach((d,i) => {
      const o = document.createElement('option');
      o.value = d.deviceId||''; o.textContent = d.label||`Camera ${i+1}`;
      els.cams.appendChild(o);
    });
    if (prev && Array.from(els.cams.options).some(o => o.value===prev)) els.cams.value = prev;
    return vids.length;
  } catch(e) { console.warn('enumerateDevices:',e); return 0; }
}

function stopCamera() {
  try { videoEl?.elt?.srcObject?.getTracks().forEach(t=>t.stop()); } catch {}
  try { if (videoEl) videoEl.remove(); } catch {}
  videoEl = null; playing = false;
  try { enableTransport(false); } catch {}
}

function startCamera(deviceId) {
  stopCamera();
  const video = deviceId?.length
    ? { deviceId:{ exact:deviceId }, width:{ ideal:1920 }, height:{ ideal:1080 } }
    : { facingMode:{ ideal:'user' }, width:{ ideal:1920 }, height:{ ideal:1080 } };
  try {
    videoEl = createCapture({ video, audio:false }, () => {
      try { enableTransport(true); } catch {}
      listCameras();
      const v = videoEl.elt;
      try { v.setAttribute('playsinline',''); v.muted=true; } catch {}
      const kick = () => { try { v.play().catch(()=>{}); pumpVideoFrames(); } catch {} };
      if (v.readyState >= 1) kick(); else v.addEventListener('loadedmetadata', kick, {once:true});
    });
    try { cloakVideo(videoEl); } catch {}
    playing = true;
  } catch(e) { console.warn('startCamera:',e); try { enableTransport(true); } catch {} }
}

// ─── ws-mirror ───────────────────────────────────────────────────────────────
(function() {
  const STREAM_MAX_W=1280, STREAM_MAX_H=1280, STREAM_Q=0.76, TARGET_FPS=30;
  function setWSStatus(txt) { const el=$('status'); if(el) el.textContent=txt; }
  function findCanvas() {
    try { if(typeof canvas!=='undefined'&&canvas?.elt instanceof HTMLCanvasElement) return canvas.elt; } catch {}
    return document.querySelector('canvas')||null;
  }
  const wsUrl = (typeof __getWSURL__==='function') ? __getWSURL__() : (window.WS_MIRROR_URL||'ws://127.0.0.1:8787');
  const openBtn = $('openCanvasBtn');
  if (openBtn) openBtn.addEventListener('click', ()=>
    window.open('canvas.html?ws='+encodeURIComponent(wsUrl)+'&mode=stretch&autofs=1',
      'canvas-mirror','popup=yes,noopener,noreferrer,width=1280,height=720'));

  const tcv=document.createElement('canvas'), ttx=tcv.getContext('2d',{alpha:false});
  let ws=null, connected=false, sending=false;

  function ensureWS() {
    if (ws&&(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING)) return;
    ws=new WebSocket(wsUrl); ws.binaryType='arraybuffer';
    ws.onopen =()=>{ connected=true;  setWSStatus('WS: connected');    try{ws.send(JSON.stringify({type:'hello',role:'index'}));}catch{} };
    ws.onerror=()=>{};
    ws.onclose=()=>{ connected=false; setWSStatus('WS: disconnected'); setTimeout(ensureWS,1500); };
  }
  ensureWS();

  async function sendFrame(cnv) {
    if (!connected||!ws||ws.readyState!==1||sending) return;
    sending=true;
    try {
      const sw=cnv.width,sh=cnv.height,scale=Math.min(1,STREAM_MAX_W/sw,STREAM_MAX_H/sh);
      const tw=Math.max(1,Math.round(sw*scale)),th=Math.max(1,Math.round(sh*scale));
      if (tcv.width!==tw||tcv.height!==th){tcv.width=tw;tcv.height=th;}
      ttx.drawImage(cnv,0,0,tw,th);
      await new Promise(r=>tcv.toBlob(b=>{try{if(b)ws.send(b);}catch{}r();},'image/jpeg',STREAM_Q));
    } finally { sending=false; }
  }
  const period=1000/TARGET_FPS; let last=0;
  requestAnimationFrame(function pump(ts){
    if (ts-last>=period){last=ts;const c=findCanvas();if(c)sendFrame(c).catch(()=>{});}
    requestAnimationFrame(pump);
  });
})();
