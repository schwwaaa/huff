/* canvas.js — p5 lifecycle + buffers + UI
 * Enhancements over previous version:
 *  - FrameRing replaces plain array — O(1) push/read, no shift() cost
 *  - allocBuffers uses double-buffer swap — resize never exposes disposed graphics to draw()
 *  - Preset save / load (JSON export + file import)
 *  - 10-step undo stack with Ctrl+Z (debounced 300 ms snapshot)
 *  - showToast() — visible error/status feedback for camera, file, and decode failures
 *  - "UI hidden" persistent indicator when header is toggled off with P
 *  - WS mirror JPEG quality and target FPS dynamically follow the quality slider
 *  - hookUI split into focused sub-functions
 */

// ─── Module-local DOM helpers ─────────────────────────────────────────────────
// Not stomped onto window — window.$ preserved for any legacy references.
const _$ = id  => document.getElementById(id);
window.$  = window.$  || _$;
window.$$ = window.$$ || (sel => document.querySelector(sel));

let videoEl, currentBlobUrl = null;
let gCur, gBuf, gWarp, gTemp;
let _fbCanvas = null, _fbCtx = null;
let canvas;
let playing = false;
let _wasPlaying  = false; // whether video was playing when a scrub started
let _seekPending = false; // whether a seek is still in flight when drag ends

const els = {};
let baseSeed = 1, seededOnce = false;
let nPhaseX = 0, nPhaseY = 1000;
let nPhaseScanX = 0, nPhaseScanY = 2000; // independent scanline phase

// ─── FrameRing ────────────────────────────────────────────────────────────────
// Replaces the plain array + shift() pattern.
//   push(frame)   — O(1), auto-evicts oldest when at capacity
//   fromEnd(n)    — O(1), n=0 is newest, n=1 is one before, etc.
//   resize(cap)   — adjusts capacity, retaining most-recent frames
//   clear()       — empties the ring
//   .length       — number of frames currently held

class FrameRing {
  constructor(cap) {
    this._cap  = Math.max(4, cap);
    this._buf  = new Array(this._cap).fill(null);
    this._head = 0;
    this._size = 0;
  }

  get length()   { return this._size; }
  get capacity() { return this._cap;  }

  push(frame) {
    this._buf[this._head] = frame;
    this._head = (this._head + 1) % this._cap;
    if (this._size < this._cap) this._size++;
  }

  fromEnd(n) {
    if (n < 0 || n >= this._size) return null;
    return this._buf[(this._head - 1 - n + this._cap * 2) % this._cap];
  }

  resize(newCap) {
    newCap = Math.max(4, newCap);
    if (newCap === this._cap) return;
    const keep   = Math.min(this._size, newCap);
    const newBuf = new Array(newCap).fill(null);
    for (let i = 0; i < keep; i++) newBuf[keep - 1 - i] = this.fromEnd(i);
    this._buf  = newBuf;
    this._head = keep % newCap;
    this._size = keep;
    this._cap  = newCap;
  }

  clear() {
    this._buf.fill(null);
    this._head = 0;
    this._size = 0;
  }
}

let frameRing = new FrameRing(120);

// ─── Toast feedback ───────────────────────────────────────────────────────────
// Visible on-screen feedback for errors and status events.
// isError=true → red, 5 s; isError=false → green, 2.5 s

function showToast(msg, isError = false) {
  let t = _$('_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_toast';
    Object.assign(t.style, {
      position:'fixed', top:'12px', left:'50%', transform:'translateX(-50%)',
      fontFamily:'monospace', fontSize:'13px', padding:'6px 16px',
      borderRadius:'4px', pointerEvents:'none', zIndex:'999999',
      display:'none', transition:'opacity 0.3s',
    });
    document.body.appendChild(t);
  }
  const errStyle = { background:'#600', color:'#f88', border:'1px solid #f44' };
  const okStyle  = { background:'rgba(0,0,0,0.78)', color:'#0f0', border:'1px solid #0f0' };
  Object.assign(t.style, isError ? errStyle : okStyle);
  t.textContent    = msg;
  t.style.display  = 'block';
  t.style.opacity  = '1';
  clearTimeout(t._tid);
  t._tid = setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => { t.style.display = 'none'; }, 320);
  }, isError ? 5000 : 2500);
}

// ─── UI-hidden indicator ──────────────────────────────────────────────────────
// A persistent pill at the bottom of the screen shown whenever the header panel
// is hidden, so the user always knows how to bring it back.

function _syncUIIndicator() {
  const h      = document.querySelector('header');
  const hidden = h && h.style.display === 'none';
  let ind = _$('_uiInd');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = '_uiInd';
    Object.assign(ind.style, {
      position:'fixed', bottom:'10px', left:'50%', transform:'translateX(-50%)',
      background:'rgba(0,0,0,0.72)', color:'#0f0', fontFamily:'monospace',
      padding:'3px 14px', borderRadius:'3px', fontSize:'12px',
      pointerEvents:'none', zIndex:'999998', display:'none',
    });
    ind.textContent = 'UI hidden  ·  P to show';
    document.body.appendChild(ind);
  }
  ind.style.display = hidden ? 'block' : 'none';
}

function toggleUI() {
  const h = document.querySelector('header');
  if (!h) return;
  h.style.display = (h.style.display === 'none') ? '' : 'none';
  _syncUIIndicator();
}

// ─── Preset system ────────────────────────────────────────────────────────────
// capturePreset()        — snapshot all control values into a plain object
// applyPreset(data)      — restore all control values from a snapshot
// savePreset()           — download snapshot as a .json file
// loadPresetFromFile(f)  — load snapshot from a File object

const PRESET_IDS = [
  'quality','depth','corrupt','block','glitchSpeed','glitchSpeedFine',
  'glitchSize','glitchSmear','glitchBaseX','glitchBaseY',
  'glitchSpeedMul','glitchAlpha','glitchJitter','glitchSmearAngle','seed',
  'corruptOn','feedback','persistence','fbX','fbY','fbZ','fbTheta',
  'clusters','clusterTiles','clusterCount','clusterRadius','spatialGap',
  'cluCenters','cluSpread','cluMinSpread','cluBias','cluDrift','cluSpeed','cluInertia',
  'flowOn','flowStrength','flowScale','flowPulse','flowImpl',
  'baseOn','baseMix','seedOnLoad',
  'symOn','symMode','symPos',
  'solarizeOn','solarizeThresh','solarizeAmt','solarizeR','solarizeG','solarizeB',
  'scanAlpha','scanShift','scanDrift','scanSpeed','scanGap','scanSpacing','scanSkew','scanRandSize',
  'depthScatter','corruptDrift',
  'trailOn','trailLayers','trailDepth','trailLumaKey',
  'bgMode',
  'cluSpeedVar','cluPulse',
  'keyMode','keyMix','keyThresh','keyInvert','keyBlend',
];

function capturePreset() {
  const data = { _v: 1 };
  PRESET_IDS.forEach(id => {
    const el = _$(id);
    if (!el) return;
    data[id] = (el.type === 'checkbox') ? el.checked : el.value;
  });
  return data;
}

// ─── Undo suppression flag ────────────────────────────────────────────────────
// Set true during applyPreset so individual control events don't each
// trigger a debounced snapshot. One clean snapshot is pushed at the end.
let _suppressUndo = false;

function _clampToElement(el, val) {
  if (el.type === 'range' || el.type === 'number') {
    const min = parseFloat(el.min);
    const max = parseFloat(el.max);
    const num = parseFloat(val);
    if (!isNaN(min) && !isNaN(max) && !isNaN(num)) {
      return String(Math.max(min, Math.min(max, num)));
    }
  }
  return String(val);
}

function applyPreset(data) {
  if (!data) return;
  _suppressUndo = true;
  try {
    PRESET_IDS.forEach(id => {
      if (!(id in data)) return;
      const el = _$(id);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!data[id];
      } else {
        el.value = _clampToElement(el, data[id]);
      }
      el.dispatchEvent(new Event('input',  { bubbles:true }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    updateLabels();
    setSeedFromUI();
  } finally {
    _suppressUndo = false;
  }
  // Push exactly one snapshot representing the fully-applied state
  const snap = capturePreset();
  const last = _undoStack[_undoStack.length - 1];
  if (!last || JSON.stringify(last) !== JSON.stringify(snap)) {
    _undoStack.push(snap);
    if (_undoStack.length > UNDO_MAX) _undoStack.shift();
  }
}

function savePreset() {
  const blob = new Blob([JSON.stringify(capturePreset(), null, 2)], { type:'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `huff-preset-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  showToast('Preset saved');
}

function loadPresetFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      snapshotForUndo();
      applyPreset(data);
      showToast('Preset loaded');
    } catch {
      showToast('Invalid preset file', true);
    }
  };
  reader.onerror = () => showToast('Could not read preset file', true);
  reader.readAsText(file);
}

// ─── Undo stack ───────────────────────────────────────────────────────────────
// Any slider or checkbox change schedules a debounced snapshot (300 ms).
// Ctrl+Z / Cmd+Z pops and restores the previous snapshot.

const _undoStack = [];
const UNDO_MAX   = 10;
let   _undoTimer = null;

function snapshotForUndo() {
  if (_suppressUndo) return;
  clearTimeout(_undoTimer);
  _undoTimer = setTimeout(() => {
    const snap = capturePreset();
    const last = _undoStack[_undoStack.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
    _undoStack.push(snap);
    if (_undoStack.length > UNDO_MAX) _undoStack.shift();
  }, 300);
}

function undo() {
  if (_undoStack.length === 0) { showToast('Nothing to undo'); return; }
  applyPreset(_undoStack.pop());
  const n = _undoStack.length;
  showToast(`Undo  (${n} step${n !== 1 ? 's' : ''} left)`);
}

// ─── video helpers ────────────────────────────────────────────────────────────

function cloakVideo(p5Vid) {
  const v = p5Vid && (p5Vid.elt || p5Vid);
  if (!v || v._cloaked) return;
  v._cloaked = true;
  v.setAttribute('playsinline', '');
  Object.assign(v.style, {
    position:'fixed', left:'-10000px', top:'0',
    width:'1px', height:'1px', opacity:'0', pointerEvents:'none',
  });
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

// ─── Video frame pump ─────────────────────────────────────────────────────────
// Two separate concerns, now handled separately:
//
//  _syncGCur()   — called every draw() at 60fps. Blits the current decoded
//                  frame from videoEl.elt into gCur. The <video> element always
//                  holds the most recently decoded frame, so this is safe to
//                  call every rAF — it just holds the last frame between video
//                  decode events. This keeps gCur current at 60fps.
//
//  _pushToRing() — called only via requestVideoFrameCallback, which fires once
//                  per genuinely new decoded frame. Pushes a pixel snapshot of
//                  gCur into frameRing at authentic video frame rate.
//
// Previously _blitAndPush did both in one function triggered at video rate.
// That meant gCur was stale for 2–3 draw() calls between video frames, causing
// effects to run against unchanged content and creating visual instability.

let _rafPumpLast = 0;

function _syncGCur() {
  if (!playing || !videoEl?.elt || !gCur) return;
  // Skip drawImage while the browser is seeking — videoEl.elt holds no valid
  // frame during decode and drawImage produces a blank, causing the visible pause.
  // gCur already holds the last good frame, so effects keep running on it.
  // _syncGCur resumes automatically on the next draw() call after seeking completes.
  if (videoEl.elt.seeking) return;
  try {
    const ctx = gCur.drawingContext;
    ctx.clearRect(0, 0, gCur.width, gCur.height);
    ctx.drawImage(videoEl.elt, 0, 0, gCur.width, gCur.height);
  } catch(e) {}
}

function _pushToRing() {
  if (!gCur) return;
  try {
    const Q   = parseFloat(els.quality?.value ?? '1');
    const bpf = gCur.width * gCur.height * 4;
    let cap = Math.max(4, Math.round(60 * (Q * 2)));
    cap = Math.min(cap, Math.max(4, Math.floor(192 * 1024 * 1024 / bpf)));
    frameRing.resize(cap);
    // getImageData returns an owned ImageData directly — no p5 loadPixels()
    // intermediate and no .buffer.slice() copy. One GPU readback, one allocation.
    const imgData = gCur.drawingContext.getImageData(0, 0, gCur.width, gCur.height);
    if (imgData.data.length > 0) { frameRing.push(imgData); _vfc++; }
  } catch(e) {}
}

// Each call to pumpVideoFrames() generates a new session token.
// The old pump chain checks its captured token on every tick and
// terminates if it no longer matches — ensuring only one active pump exists.
let _pumpSession = 0;
let _vfc = 0; // increments once per decoded video frame — used to stabilise scanline ring selection

function pumpVideoFrames() {
  if (!videoEl?.elt) return;
  const v       = videoEl.elt;
  const session = ++_pumpSession; // invalidates any previous pump chain

  if (v.requestVideoFrameCallback) {
    const onFrame = () => {
      if (session !== _pumpSession) return; // stale chain — stop
      if (playing && gCur) {
        try {
          const ctx = gCur.drawingContext;
          ctx.clearRect(0, 0, gCur.width, gCur.height);
          ctx.drawImage(v, 0, 0, gCur.width, gCur.height);
        } catch(e) {}
        _pushToRing();
      }
      if (session === _pumpSession) v.requestVideoFrameCallback(onFrame);
    };
    v.requestVideoFrameCallback(onFrame);
  } else {
    const tick = (ts) => {
      if (session !== _pumpSession) return; // stale chain — stop
      if (ts - _rafPumpLast >= (1000 / 60)) { _rafPumpLast = ts; _pushToRing(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

// ─── p5 setup / resize ───────────────────────────────────────────────────────

// ─── FPS counter ──────────────────────────────────────────────────────────────
// Updated once per second using a manual frame counter rather than p5's
// frameRate() so it reflects real render performance, not a smoothed average.
let _fpsFrames = 0, _fpsLastMs = 0;

function _tickFPS() {
  _fpsFrames++;
  const now = millis();
  if (now - _fpsLastMs >= 1000) {
    const fps = Math.round(_fpsFrames * 1000 / (now - _fpsLastMs));
    _fpsFrames = 0;
    _fpsLastMs = now;
    let el = _$('_fpsDisplay');
    if (!el) {
      el = document.createElement('span');
      el.id = '_fpsDisplay';
      Object.assign(el.style, { marginLeft:'10px', color:'#0f0', fontFamily:'monospace', fontSize:'12px' });
      const status = _$('status');
      if (status) status.parentNode?.insertBefore(el, status.nextSibling);
      else document.body.appendChild(el);
    }
    el.textContent = `${fps} fps`;
  }
}

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  try { canvas.hide(); } catch {}
  pixelDensity(1);
  allocBuffers();
  clearAll();
  hookUI();
  updateLabels();
  setSeedFromUI();
  _syncUIIndicator();
}
window.setup = setup;

function allocBuffers() {
  // Build new buffers BEFORE disposing old ones.
  // draw() may be mid-frame during a resize; this prevents it from accessing
  // a half-rebuilt set. References are swapped atomically after construction.
  const nCur  = createGraphics(width, height);
  const nBuf  = createGraphics(width, height);
  const nWarp = createGraphics(width, height);
  const nTemp = createGraphics(width, height);

  [gCur, gBuf, gWarp, gTemp].forEach(g => { try { if (g) g.remove(); } catch {} });

  gCur = nCur; gBuf = nBuf; gWarp = nWarp; gTemp = nTemp;
  _fbCanvas = null; _fbCtx = null;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  allocBuffers();
  clearAll();
  updateDim();
}
window.windowResized = windowResized;

function clearAll() {
  [gBuf, gWarp, gTemp].forEach(g => { try { g.clear(); } catch {} });
  frameRing.clear();
  seededOnce = false;
  if (typeof resetClusterPhysics === 'function') resetClusterPhysics();
}

function refreshGlitch() {
  clearAll();
  nPhaseX = 0; nPhaseY = 1000;
  nPhaseScanX = 0; nPhaseScanY = 2000;
}

// ─── UI wiring ────────────────────────────────────────────────────────────────
// Split into focused sub-functions so each concern is independently readable.

function hookUI() {
  [
    'file','playBtn','pauseBtn','refreshBtn','resetBtn',
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
    'cluMinSpread','cluMinSpreadVal','cluBias','cluBiasVal','cluDrift','cluDriftVal',
    'cluSpeed','cluSpeedVal','cluInertia','cluInertiaVal',
    'flowOn','flowStrength','flowStrengthVal','flowScale','flowScaleVal',
    'flowPulse','flowPulseVal','flowImpl','flowImplVal',
    'baseOn','baseMix','baseMixVal','seedOnLoad',
    'symOn','symMode','symPos','symPosVal',
    'solarizeOn','solarizeThresh','solarizeThreshVal','solarizeAmt','solarizeAmtVal',
    'solarizeR','solarizeRVal','solarizeG','solarizeGVal','solarizeB','solarizeBVal',
    'scanAlpha','scanAlphaVal','scanShift','scanShiftVal','scanDrift','scanDriftVal',
    'scanSpeed','scanSpeedVal','scanGap','scanGapVal','scanSpacing','scanSpacingVal','scanSkew','scanSkewVal',
    'depthScatter','depthScatterVal','corruptDrift','corruptDriftVal',
    'trailOn','trailLayers','trailLayersVal','trailDepth','trailDepthVal',
    'trailLumaKey','trailLumaKeyVal',
    'scanRandSize','bgMode','dim',
    'cluSpeedVar','cluSpeedVarVal','cluPulse','cluPulseVal',
    'keyMode','keyMix','keyMixVal','keyThresh','keyThreshVal','keyInvert','keyBlend',
  ].forEach(k => els[k] = _$(k));

  hookFile();
  hookTransport();
  hookCamera();
  hookVolume();
  hookSliders();
  hookPresets();
  hookKeyboard();

  updateDim();
  try { listCameras(); } catch {}
}

function hookFile() {
  els.file?.addEventListener('change', onFile);
}

function hookTransport() {
  // ── Play ────────────────────────────────────────────────────────────────────
  els.playBtn?.addEventListener('click', async () => {
    if (!videoEl?.elt) return;
    const v = videoEl.elt;

    // #5: reconcile volume/mute state from slider before unmuting
    const volSlider = _$('volumeSlider');
    const vol = volSlider ? parseFloat(volSlider.value) : 1;
    try { v.volume = vol; v.muted = (vol === 0); } catch {}

    try {
      await v.play();
    } catch {
      // Autoplay blocked — try muted then re-unmute on gesture
      try { v.muted = true; await v.play(); } catch { return; }
    }

    // #6: set playing only after play() resolves successfully
    playing = true;

    // #1: restart pump — previous pump chain self-terminated when playing became false
    pumpVideoFrames();
  });

  // ── Pause ───────────────────────────────────────────────────────────────────
  els.pauseBtn?.addEventListener('click', () => {
    if (!videoEl?.elt) return;
    videoEl.elt.pause();
    playing = false;
    // Incrementing _pumpSession causes the active pump chain to self-terminate
    // on its next tick — no new frames pushed while paused.
    _pumpSession++;
  });

  // ── Refresh ─────────────────────────────────────────────────────────────────
  els.refreshBtn?.addEventListener('click', refreshGlitch);

  // ── Seed ────────────────────────────────────────────────────────────────────
  els.seed?.addEventListener('change', setSeedFromUI);

  // ── Playback rate (#8) ───────────────────────────────────────────────────────
  const rateSelect = _$('playbackRate');
  rateSelect?.addEventListener('change', () => {
    const r = parseFloat(rateSelect.value);
    if (videoEl?.elt) videoEl.elt.playbackRate = r;
  });

  // ── Loop toggle (#9) ─────────────────────────────────────────────────────────
  const loopToggle = _$('loopToggle');
  loopToggle?.addEventListener('change', () => {
    if (videoEl?.elt) videoEl.elt.loop = loopToggle.checked;
  });

  // ── Seek / time display (#7) ─────────────────────────────────────────────────
  const seekBar  = _$('seekBar');
  const timeDisp = _$('timeDisplay');

  // Time formatter
  const _fmt = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

  // Update seek bar and time display while playing.
  // During a drag, show the target time from _seekPending rather than v.currentTime
  // so the readout is live even though the actual decode is throttled.
  function _tickTransport() {
    const v = videoEl?.elt;
    if (v && !isNaN(v.duration) && v.duration > 0) {
      if (seekBar && !seekBar._dragging) {
        seekBar.value = (v.currentTime / v.duration) * 1000;
      }
      if (timeDisp) {
        const display = (seekBar?._dragging && seekBar._seekPending != null)
          ? seekBar._seekPending
          : v.currentTime;
        timeDisp.textContent = `${_fmt(display)} / ${_fmt(v.duration)}`;
      }
    }
    requestAnimationFrame(_tickTransport);
  }
  _tickTransport();

  // Seek interaction
  // fastSeek() jumps to the nearest keyframe — avoids the browser having to
  // decode forward from the keyframe to the exact timestamp, which is what
  // causes the pause. Falls back to currentTime= on browsers that lack it.
  // rAF throttle: during a drag, input fires many times per frame. We store
  // the pending target and only apply the seek once per display frame.
  if (seekBar) {
    let _seekFrame   = null;

    seekBar.addEventListener('mousedown', () => {
      seekBar._dragging = true;
      const v = videoEl?.elt;
      if (!v) return;
      _wasPlaying = !v.paused;
      // Pause while scrubbing so the browser isn't fighting between
      // decode-for-seek and decode-for-playback simultaneously.
      if (_wasPlaying) v.pause();
    });

    seekBar.addEventListener('touchstart', () => {
      seekBar._dragging = true;
      const v = videoEl?.elt;
      if (!v) return;
      _wasPlaying = !v.paused;
      if (_wasPlaying) v.pause();
    }, { passive:true });

    seekBar.addEventListener('input', () => {
      const v = videoEl?.elt;
      if (!v || isNaN(v.duration)) return;
      const target = (seekBar.value / 1000) * v.duration;
      seekBar._seekPending = target;
      _seekPending = true;
      if (_seekFrame) return;
      _seekFrame = requestAnimationFrame(() => {
        _seekFrame = null;
        const vv = videoEl?.elt;
        if (!vv || isNaN(vv.duration)) return;
        const t = seekBar._seekPending ?? (seekBar.value / 1000) * vv.duration;
        if (typeof vv.fastSeek === 'function') vv.fastSeek(t);
        else vv.currentTime = t;
      });
    });

    const endDrag = () => {
      seekBar._dragging    = false;
      seekBar._seekPending = null;
      // If the seeked event already fired before mouseup, resume now.
      // Otherwise _seekPending flag lets the seeked handler resume instead.
      if (!_seekPending && _wasPlaying) {
        const v = videoEl?.elt;
        if (v) v.play().catch(() => {});
        _wasPlaying = false;
      }
    };
    seekBar.addEventListener('mouseup',  endDrag);
    seekBar.addEventListener('touchend', endDrag);
  }
}

function hookCamera() {
  els.camStartBtn?.addEventListener('click',  () => startCamera(els.cams?.value || null));
  els.camStopBtn?.addEventListener('click',   stopCamera);
  els.camRefreshBtn?.addEventListener('click', listCameras);
  els.cams?.addEventListener('change', () => {
    try { if (videoEl?.elt?.srcObject) startCamera(els.cams.value || null); } catch {}
  });
}

function hookVolume() {
  const volSlider = _$('volumeSlider');
  if (!volSlider) return;
  volSlider.addEventListener('input', () => {
    const vol = parseFloat(volSlider.value);
    if (videoEl?.elt) {
      videoEl.elt.volume = vol;
      videoEl.elt.muted  = (vol === 0);
    }
  });
}

function hookSliders() {
  const sliderIds = [
    'quality','depth','corrupt','block','glitchSpeed','glitchSpeedFine',
    'glitchSize','glitchSmear','glitchBaseX','glitchBaseY',
    'feedback','persistence','fbX','fbY','fbZ','fbTheta',
    'spatialGap','clusterCount','clusterRadius','cluCenters','cluSpread',
    'cluMinSpread','cluBias','cluDrift','cluSpeed','cluInertia',
    'scanAlpha','scanShift','scanDrift','scanSpeed','scanGap','scanSpacing','scanSkew',
    'glitchAlpha','glitchJitter','glitchSmearAngle',
    'flowStrength','flowScale','flowPulse','flowImpl','baseMix','symPos','glitchSpeedMul',
    'depthScatter','corruptDrift','trailLayers','trailDepth','trailLumaKey',
    'solarizeThresh','solarizeAmt','solarizeR','solarizeG','solarizeB',
    'cluSpeedVar','cluPulse',
    'keyMix','keyThresh',
  ];

  sliderIds.forEach(id => {
    els[id]?.addEventListener('input', () => { updateLabels(); snapshotForUndo(); });
  });

  // Checkboxes and selects also get snapshotted for undo
  ['corruptOn','clusters','clusterTiles','flowOn','baseOn','symOn','solarizeOn',
   'trailOn','scanRandSize','seedOnLoad','bgMode','symMode'].forEach(id => {
    _$(id)?.addEventListener('change', snapshotForUndo);
  });

  els.baseOn?.addEventListener('change', () => {
    if (els.baseMix) els.baseMix.disabled = !els.baseOn.checked;
    updateLabels();
  });
}

function hookPresets() {
  _$('presetSaveBtn')?.addEventListener('click', savePreset);

  const loadBtn   = _$('presetLoadBtn');
  const loadInput = _$('presetLoadInput');
  if (loadBtn && loadInput) {
    loadBtn.addEventListener('click', () => loadInput.click());
    loadInput.addEventListener('change', () => {
      loadPresetFromFile(loadInput.files?.[0]);
      loadInput.value = '';
    });
  }

  // resetBtn is preset-adjacent — snapshot before wiping
  els.resetBtn?.addEventListener('click', () => { snapshotForUndo(); refreshGlitch(); });
}

function hookKeyboard() {
  window.addEventListener('keydown', e => {
    if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
      toggleUI(); e.preventDefault(); return;
    }
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
      e.preventDefault(); return;
    }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      undo(); e.preventDefault(); return;
    }
  }, true);

  document.addEventListener('fullscreenchange', () => {
    const v = videoEl?.elt;
    if (v && playing && v.paused) v.play().catch(() => {});
  });
}

// ─── label / dim helpers ──────────────────────────────────────────────────────

function updateDim() {
  if (els.dim) els.dim.textContent = `${width}×${height}`;
}

function updateLabels() {
  const f2  = v => (+v).toFixed(2);
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
  set(els.cluMinSpread,     els.cluMinSpreadVal,     v => v);
  set(els.cluBias,          els.cluBiasVal,          f2);
  set(els.cluDrift,         els.cluDriftVal,         f2);
  set(els.cluSpeed,         els.cluSpeedVal,         v => (+v).toFixed(1));
  set(els.cluInertia,       els.cluInertiaVal,       f2);
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
  set(els.scanSpeed,        els.scanSpeedVal,        f2);
  set(els.scanGap,          els.scanGapVal,          v => (v|0));
  set(els.scanSpacing,      els.scanSpacingVal,      v => (v|0));
  set(els.scanSkew,         els.scanSkewVal,         f2);
  set(els.depthScatter,     els.depthScatterVal,     f2);
  set(els.corruptDrift,     els.corruptDriftVal,     f2);
  set(els.trailLayers,      els.trailLayersVal,      v => (v|0));
  set(els.trailDepth,       els.trailDepthVal,       f2);
  set(els.trailLumaKey,     els.trailLumaKeyVal,     f2);
  set(els.symPos,           els.symPosVal,           f2);
  set(els.solarizeThresh,   els.solarizeThreshVal,   f2);
  set(els.solarizeAmt,      els.solarizeAmtVal,      f2);
  set(els.solarizeR,        els.solarizeRVal,        f2);
  set(els.solarizeG,        els.solarizeGVal,        f2);
  set(els.solarizeB,        els.solarizeBVal,        f2);
  set(els.cluSpeedVar,      els.cluSpeedVarVal,      f2);
  set(els.cluPulse,         els.cluPulseVal,         f2);
  set(els.keyMix,           els.keyMixVal,           f2);
  set(els.keyThresh,        els.keyThreshVal,        f2);
  if (els.baseMix && els.baseMixVal) {
    els.baseMixVal.textContent = f2(els.baseMix.value);
    if (els.baseMix) els.baseMix.disabled = !els.baseOn?.checked;
  }
}

function setSeedFromUI() {
  baseSeed = parseInt(els.seed?.value || '1', 10);
  if (isNaN(baseSeed)) baseSeed = 1;
  noiseSeed(baseSeed);
}

// ─── file loading ─────────────────────────────────────────────────────────────

function onFile(ev) {
  const input = ev.target;
  const file  = input.files?.[0]; if (!file) return;
  queueMicrotask(() => { try { input.value = ''; } catch {} });

  try { videoEl?.elt?.srcObject?.getTracks().forEach(t => t.stop()); } catch {}
  try { if (videoEl) videoEl.remove(); } catch {}
  videoEl = null;
  if (currentBlobUrl) { try { URL.revokeObjectURL(currentBlobUrl); } catch {} currentBlobUrl = null; }

  // Invalidate any active pump and clear orphaned gesture listeners
  _pumpSession++;

  playing = false;
  enableTransport(false);

  // seedOnLoad: randomize seed for each new file so visuals feel fresh
  if (els.seedOnLoad?.checked && els.seed) {
    els.seed.value = Math.floor(Math.random() * 99999) + 1;
    setSeedFromUI();
  }

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

  // Track gesture unlock listeners so they can be removed if a new file loads
  // before the user ever triggers a gesture (#4 — orphaned listener bug).
  let _gesturePointer = null;
  let _gestureKey     = null;

  let primed = false;
  let poller;

  const startPlayback = async () => {
    if (primed) return;
    // #3: readyState >= 2 (HAVE_CURRENT_DATA) is sufficient to call play()
    // and get a renderable frame. The original >= 3 blocked valid MP4/MKV files
    // that reported state 2 when first ready and never briefly hit state 3.
    if (v.readyState < 2 || v.videoWidth === 0) return;
    clearInterval(poller);
    primed = true;
    clearAll(); updateDim();
    try { blitVideoInto(gCur); } catch {}

    // Clean up any orphaned gesture listeners from a previous file load (#4)
    if (_gesturePointer) {
      window.removeEventListener('pointerdown', _gesturePointer, true);
      _gesturePointer = null;
    }
    if (_gestureKey) {
      window.removeEventListener('keydown', _gestureKey, true);
      _gestureKey = null;
    }

    try {
      await v.play();
    } catch {
      const gesture = async () => {
        try { await v.play(); } catch {}
        window.removeEventListener('pointerdown', gesture, true);
        window.removeEventListener('keydown',     gesture, true);
        _gesturePointer = null;
        _gestureKey     = null;
      };
      _gesturePointer = gesture;
      _gestureKey     = gesture;
      window.addEventListener('pointerdown', gesture, true);
      window.addEventListener('keydown',     gesture, true);
    }

    // #8: apply playback rate from UI
    const rateSelect = _$('playbackRate');
    try { v.playbackRate = rateSelect ? parseFloat(rateSelect.value) : 1.0; } catch {}

    // #9: apply loop state from UI (default on if no toggle exists)
    const loopToggle = _$('loopToggle');
    try { v.loop = loopToggle ? loopToggle.checked : true; } catch {}

    // After any seek completes, resume play immediately if we were playing
    // before the scrub started. This is what makes the resume seamless —
    // play() is called the moment the browser has a decoded frame ready,
    // not after some timeout or the next user interaction.
    v.addEventListener('seeked', () => {
      _seekPending = false;
      pumpVideoFrames();
      if (_wasPlaying && !seekBar?._dragging) {
        v.play().catch(() => {});
        playing     = true;
        _wasPlaying = false;
      }
    });

    // #6: set playing only after play() has been called successfully
    playing = true;

    // #10: start pump BEFORE enabling transport so there's no window where
    // the user can click Pause before the first requestVideoFrameCallback fires.
    pumpVideoFrames();
    enableTransport(true);

    const volSlider = _$('volumeSlider');
    const vol = volSlider ? parseFloat(volSlider.value) : 1;
    try { v.volume = vol; v.muted = (vol === 0); } catch {}
  };

  v.addEventListener('canplay',        startPlayback, { once:true });
  v.addEventListener('canplaythrough', startPlayback, { once:true });
  v.addEventListener('loadeddata',     startPlayback, { once:true });

  let poll = 0;
  poller = setInterval(() => {
    startPlayback();
    if (primed || ++poll > 40) clearInterval(poller);
  }, 100);

  v.addEventListener('error', () => {
    clearInterval(poller);
    enableTransport(true);
    const code = v.error?.code ?? '?';
    showToast(`Video decode error (code ${code}) — try a different file`, true);
    console.error('[huff] video error', v.error);
  }, { once:true });

  v.load();
}

function enableTransport(en) {
  ['playBtn','pauseBtn','refreshBtn'].forEach(id => {
    const b = _$(id); if (b) b.disabled = !en;
  });
}

// ─── draw loop ────────────────────────────────────────────────────────────────

function draw() {
  _tickFPS();

  const bg = els.bgMode?.value || 'black';
  if      (bg === 'white') background(255);
  else if (bg === 'green') background(0, 255, 0);
  else if (bg === 'blue')  background(0, 0, 255);
  else                     background(0);

  if (!videoEl) { drawWaiting(); return; }

  // Keep gCur current at 60fps. The <video> element always holds the latest
  // decoded frame so this is always safe — between video decode events it just
  // holds the previous frame, which is exactly what we want.
  _syncGCur();

  randomSeed(baseSeed + frameCount);

  if (!seededOnce) {
    gBuf.image(gCur, 0, 0, gBuf.width, gBuf.height);
    seededOnce = true;
  }

  const mul     = parseFloat(els.glitchSpeedMul?.value  ?? '1');
  const coarse  = parseFloat(els.glitchSpeed?.value     ?? '0.8') * mul;
  const fine    = parseFloat(els.glitchSpeedFine?.value ?? '1')   * mul;
  const density = coarse * fine;
  nPhaseX += density * 0.01;
  nPhaseY += density * 0.011;

  // Scanline phase advances independently of glitch density.
  // Previously: nPhaseScanX += density * scanSpeed * 0.01 — if density=0 (glitch off), bands froze.
  // Now: advances every draw() at scanSpeed rate regardless of glitch state.
  const scanSpeed = parseFloat(els.scanSpeed?.value ?? '1.0');
  nPhaseScanX += scanSpeed * 0.008;
  nPhaseScanY += scanSpeed * 0.009;

  const pers = parseFloat(els.persistence?.value ?? '0.7');
  if (pers < 1) {
    const ctx = gBuf.drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${map(1 - pers, 0, 1, 1, 20) / 255})`;
    ctx.fillRect(0, 0, gBuf.width, gBuf.height);
    ctx.restore();
  }

  // ORDER: Trails → Scanlines → Glitch (scanlines must precede glitch; see effects.js)
  applyTrails();
  applyScanlines(density);

  if (els.corruptOn?.checked) {
    applyGlitch(density,
      parseInt(els.glitchBaseX?.value ?? '0', 10),
      parseInt(els.glitchBaseY?.value ?? '0', 10));
  }

  const fb = parseFloat(els.feedback?.value ?? '0');
  if (fb > 0) {
    const fx = parseFloat(els.fbX?.value    ?? '0');
    const fy = parseFloat(els.fbY?.value    ?? '0');
    const fz = parseFloat(els.fbZ?.value    ?? '1');
    const ft = (parseFloat(els.fbTheta?.value ?? '0') * Math.PI) / 180;

    const gCanvas = gBuf.elt || gBuf.drawingContext.canvas;
    if (!_fbCanvas || _fbCanvas.width !== gBuf.width || _fbCanvas.height !== gBuf.height) {
      _fbCanvas = document.createElement('canvas');
      _fbCanvas.width  = gBuf.width;
      _fbCanvas.height = gBuf.height;
      _fbCtx = _fbCanvas.getContext('2d', { alpha:true });
    }
    _fbCtx.clearRect(0, 0, _fbCanvas.width, _fbCanvas.height);
    _fbCtx.drawImage(gCanvas, 0, 0);

    const ctx = gBuf.drawingContext;
    ctx.save();
    ctx.clearRect(0, 0, gBuf.width, gBuf.height);
    ctx.globalAlpha = Math.min(1, fb);
    ctx.translate(gBuf.width / 2 + fx, gBuf.height / 2 + fy);
    ctx.rotate(ft);
    ctx.scale(fz, fz);
    ctx.drawImage(_fbCanvas, -gBuf.width / 2, -gBuf.height / 2, gBuf.width, gBuf.height);
    ctx.restore();
  }

  const flowS = parseInt(els.flowStrength?.value ?? '0', 10);
  if (els.flowOn?.checked && flowS > 0) {
    applyFlowWarp(gBuf, gWarp, flowS,
      parseInt(els.flowScale?.value  ?? '80', 10),
      parseInt(els.flowPulse?.value  ?? '0',  10),
      parseFloat(els.flowImpl?.value ?? '0'));
    [gBuf, gWarp] = [gWarp, gBuf];
  }

  if (els.symOn?.checked) {
    applySymmetry(gBuf, gTemp, els.symMode?.value || 'v', parseFloat(els.symPos?.value ?? '0.5'));
    [gBuf, gTemp] = [gTemp, gBuf];
  }

  if (els.solarizeOn?.checked) {
    applySolarize(gBuf,
      parseFloat(els.solarizeThresh?.value ?? '0.5'),
      parseFloat(els.solarizeAmt?.value    ?? '1.0'),
      parseFloat(els.solarizeR?.value      ?? '1.0'),
      parseFloat(els.solarizeG?.value      ?? '1.0'),
      parseFloat(els.solarizeB?.value      ?? '1.0'));
  }

  const anyFxActive =
    els.corruptOn?.checked || els.trailOn?.checked   ||
    els.clusters?.checked  || els.flowOn?.checked    ||
    els.symOn?.checked     || els.solarizeOn?.checked ||
    parseFloat(els.feedback?.value ?? '0') > 0;

  if (anyFxActive) {
    if (els.baseOn?.checked && parseFloat(els.baseMix?.value ?? '0') > 0) {
      push(); tint(255, parseFloat(els.baseMix.value) * 255);
      image(gCur, 0, 0, width, height); pop();
    }
    image(gBuf, 0, 0, width, height);
  } else {
    image(gCur, 0, 0, width, height);
    gBuf.image(gCur, 0, 0, gBuf.width, gBuf.height);
  }

  // Global key composite — runs after the main composite, keying base against processed.
  const keyMode = els.keyMode?.value ?? 'off';
  const keyMix  = parseFloat(els.keyMix?.value ?? '0');
  if (keyMode !== 'off' && keyMix > 0) {
    applyGlobalKey(
      canvas,                                      // p5 canvas
      gCur,                                        // base (clean video)
      gBuf,                                        // processed output
      keyMode,
      keyMix,
      parseFloat(els.keyThresh?.value ?? '0.5'),
      !!els.keyInvert?.checked,
      els.keyBlend?.value ?? 'screen'
    );
  }
}


function drawWaiting() {
  push();
  noStroke(); fill(255, 20); rect(0, 0, width, height);
  fill(220); textAlign(CENTER, CENTER); textSize(14);
  text('Load a video or start a camera  ·  P: toggle UI  ·  F: fullscreen  ·  Ctrl+Z: undo', width / 2, height / 2);
  pop();
}

// ─── camera ───────────────────────────────────────────────────────────────────

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
  } catch(e) {
    console.warn('enumerateDevices:', e);
    return 0;
  }
}

function stopCamera() {
  try { videoEl?.elt?.srcObject?.getTracks().forEach(t => t.stop()); } catch {}
  try { if (videoEl) videoEl.remove(); } catch {}
  videoEl = null; playing = false;
  try { enableTransport(false); } catch {}
}

function startCamera(deviceId) {
  stopCamera();
  const video = deviceId?.length
    ? { deviceId:{ exact:deviceId }, width:{ ideal:1920 }, height:{ ideal:1080 } }
    : { facingMode:{ ideal:'user'  }, width:{ ideal:1920 }, height:{ ideal:1080 } };
  try {
    videoEl = createCapture({ video, audio:false }, () => {
      try { enableTransport(true); } catch {}
      listCameras();
      const v = videoEl.elt;
      try { v.setAttribute('playsinline', ''); v.muted = true; } catch {}
      const kick = () => {
        try {
          playing = true;
          v.play().catch(() => {});
          pumpVideoFrames();
        } catch {}
      };
      if (v.readyState >= 1) kick();
      else v.addEventListener('loadedmetadata', kick, { once:true });
    });
    try { cloakVideo(videoEl); } catch {}
  } catch(e) {
    console.warn('startCamera:', e);
    const msg = (e?.name === 'NotAllowedError') ? 'Camera permission denied'
              : (e?.name === 'NotFoundError')   ? 'No camera found'
              : `Camera error: ${e?.message ?? e}`;
    showToast(msg, true);
    try { enableTransport(false); } catch {}
  }
}

// ─── ws-mirror ────────────────────────────────────────────────────────────────
// Streams the canvas to canvas.html via a local WebSocket relay.
// JPEG quality and target FPS both follow the quality slider dynamically.

(function() {
  const STREAM_MAX_W = 1280, STREAM_MAX_H = 1280;

  function setWSStatus(txt) { const el = _$('status'); if (el) el.textContent = txt; }

  function findCanvas() {
    try {
      if (typeof canvas !== 'undefined' && canvas?.elt instanceof HTMLCanvasElement) return canvas.elt;
    } catch {}
    return document.querySelector('canvas') || null;
  }

  const wsUrl   = (typeof __getWSURL__ === 'function') ? __getWSURL__() : (window.WS_MIRROR_URL || 'ws://127.0.0.1:8787');
  const openBtn = _$('openCanvasBtn');
  if (openBtn) {
    openBtn.addEventListener('click', () =>
      window.open(
        'canvas.html?ws=' + encodeURIComponent(wsUrl) + '&mode=stretch&autofs=1',
        'canvas-mirror', 'popup=yes,noopener,noreferrer,width=1280,height=720'
      )
    );
  }

  const tcv = document.createElement('canvas');
  const ttx = tcv.getContext('2d', { alpha:false });
  let ws = null, connected = false, sending = false;
  let _wsDelay = 1500;
  const WS_DELAY_MAX = 30000;

  function ensureWS() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    ws.onopen  = () => {
      connected = true;
      _wsDelay = 1500; // reset backoff on successful connection
      setWSStatus('WS: connected');
      try { ws.send(JSON.stringify({ type:'hello', role:'index' })); } catch {}
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      connected = false;
      setWSStatus('WS: disconnected');
      setTimeout(ensureWS, _wsDelay);
      _wsDelay = Math.min(_wsDelay * 2, WS_DELAY_MAX);
    };
  }
  ensureWS();

  // Read quality slider each frame so JPEG compression and FPS adapt in real time.
  function _q() { return parseFloat(_$('quality')?.value ?? '1'); }
  function streamJpegQ() { return Math.max(0.3, Math.min(0.97, 0.5 + _q() * 0.47)); }
  function targetPeriod() { return 1000 / Math.round(15 + _q() * 45); } // 15–60 fps

  async function sendFrame(cnv) {
    if (!connected || !ws || ws.readyState !== 1 || sending) return;
    sending = true;
    try {
      const sw = cnv.width, sh = cnv.height;
      const scale = Math.min(1, STREAM_MAX_W / sw, STREAM_MAX_H / sh);
      const tw = Math.max(1, Math.round(sw * scale));
      const th = Math.max(1, Math.round(sh * scale));
      if (tcv.width !== tw || tcv.height !== th) { tcv.width = tw; tcv.height = th; }
      ttx.drawImage(cnv, 0, 0, tw, th);
      const q = streamJpegQ();
      await new Promise(r => tcv.toBlob(b => { try { if (b) ws.send(b); } catch {} r(); }, 'image/jpeg', q));
    } finally { sending = false; }
  }

  let last = 0;
  requestAnimationFrame(function pump(ts) {
    if (ts - last >= targetPeriod()) {
      last = ts;
      const c = findCanvas();
      if (c) sendFrame(c).catch(() => {});
    }
    requestAnimationFrame(pump);
  });
})();
