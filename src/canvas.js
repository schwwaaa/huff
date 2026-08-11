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
 *  - Pass 8: one shared full-resolution scratch buffer for feedback/flow/symmetry
 *  - Pass 31: decoded-frame Glitch-only strobe; Luma Key and all other stages remain live
 *  - Pass 34: Fairlight-style stored Luma Stencil + INDIGO Cleanup/Density + bounded Soft Add
 *  - Pass 36: LIVE Luma stability rebase + stateless stored-stencil mask rebuilds
 *  - Pass 39R: restore exact Pass 38 Feedback controls/behavior; add optional transform-only strobe + clean restore
 *  - Pass 39M: merge additive Feedback enable/range controls without replacing legacy controls; add independent Cluster Speed
 *  - Pass 8: p5.Graphics and pixel-processing scratch canvases resize in place
 *  - Pass 8: final presentation uses direct Canvas2D blits
 *  - Pass 9: ring capture contexts stay in copy mode and capacity math is cached
 *  - Pass 9: mirror encoding pauses without an attached canvas receiver
 *  - Pass 11: neutral stages bypass full-frame work and clean presentation
 *    avoids redundant background/buffer copies while decoded-frame state stays current
 *  - Pass 13S: source-generation guards and owned async cleanup harden file,
 *    camera, autoplay, and shutdown lifecycle without changing frame scheduling
 *  - Pass 14: exact-size Canvas2D copies use the non-scaling draw path;
 *    temporal ring backing stores are explicitly released on shrink/resize/exit
 *  - Pass 15: mirror ImageBitmaps are captured at bounded preview dimensions
 *    before Worker transfer when supported, with automatic legacy fallback
 *  - Pass 25: the exact Pass 22 active route dispatches through a validated,
 *    immutable serial recipe with no new routing controls or render buffers
 */

// ─── Module-local DOM helpers ─────────────────────────────────────────────────
// Not stomped onto window — window.$ preserved for any legacy references.
const _$ = id  => document.getElementById(id);
window.$  = window.$  || _$;
window.$$ = window.$$ || (sel => document.querySelector(sel));

let videoEl, currentBlobUrl = null;

// ─── Dedicated audio thread ───────────────────────────────────────────────────
// Route video audio through Web Audio so it runs on the browser's dedicated
// audio thread, completely independent of the main thread's draw loop.
// When the canvas is heavy (many effects, pixel readbacks) the main thread
// budget tightens and can starve the browser's audio scheduler — causing
// dropouts. The audio thread is never blocked by canvas work.
let _audioCtx  = null;
let _gainNode  = null;
let _audioSrc  = null;   // currently-active MediaElementAudioSourceNode (routed to gain)
// A media element can be wrapped by createMediaElementSource() exactly ONCE for its
// lifetime — a second call on the same element throws InvalidStateError. We therefore
// create the source node once per element and cache it here, reusing it on every
// later call. Keyed weakly so entries vanish when an old <video> element is GC'd.
const _audioSrcMap = new WeakMap();

function _ensureAudioCtx() {
  if (_audioCtx) return;
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _gainNode = _audioCtx.createGain();
    _gainNode.gain.value = 1.0;
    _gainNode.connect(_audioCtx.destination);
  } catch (e) {
    console.warn('[huff audio] AudioContext unavailable:', e);
  }
}

// Idempotent: safe to call on every Play click. Tracks the source node per element
// so a Play → Pause → Play cycle on the same clip never re-wraps the element (which
// would throw) and never disconnects a working source. Audio stays glued to the base
// video element's own playhead — fully decoupled from the visual frame ring.
function connectVideoAudio(videoElement) {
  if (!videoElement) return;
  _ensureAudioCtx();
  if (!_audioCtx || !_gainNode) return;
  try {
    // Resume context — required after a user gesture by autoplay policy
    if (_audioCtx.state === 'suspended') _audioCtx.resume();

    // Reuse this element's existing source node if we already made one; only
    // create on first sight. Creating twice on the same element would throw.
    let src = _audioSrcMap.get(videoElement);
    if (!src) {
      src = _audioCtx.createMediaElementSource(videoElement);
      _audioSrcMap.set(videoElement, src);
    }

    // Re-point the gain node at the current element's source. Disconnect any other
    // source still feeding the gain (e.g. a previous clip's element), then ensure
    // exactly one clean connection from this source into the gain node.
    if (_audioSrc && _audioSrc !== src) { try { _audioSrc.disconnect(_gainNode); } catch {} }
    try { src.disconnect(); } catch {}
    src.connect(_gainNode);
    _audioSrc = src;

    // Level is owned by the gain node; the element stays at unity and unmuted so
    // its full signal reaches the Web Audio graph on the dedicated audio thread.
    const vol = parseFloat(_$('volumeSlider')?.value ?? '1');
    _gainNode.gain.value = vol;
    videoElement.volume  = 1.0;
    videoElement.muted   = false;
  } catch (e) {
    console.warn('[huff audio] connectVideoAudio failed:', e);
  }
}

// ─── Stability-safe media lifecycle ownership ────────────────────────────────
// Preserve the proven File → Blob URL → p5 createVideo() path and all existing
// render, transport, mirror, and profiler clocks. These helpers only own async
// callbacks and cleanup so a replaced source cannot reactivate later.
let _sourceGeneration = 0;
let _sourceReadyPoller = 0;
let _sourceGestureUnlock = null;
let _sourceShutdownComplete = false;

function _clearSourceReadyPoller() {
  if (!_sourceReadyPoller) return;
  clearInterval(_sourceReadyPoller);
  _sourceReadyPoller = 0;
}

function _clearSourceGestureUnlock() {
  const gesture = _sourceGestureUnlock;
  if (!gesture) return;
  window.removeEventListener('pointerdown', gesture, true);
  window.removeEventListener('keydown', gesture, true);
  _sourceGestureUnlock = null;
}

function _disconnectSourceAudio(element) {
  const src = element ? _audioSrcMap.get(element) : null;
  if (!src) return;
  try { src.disconnect(_gainNode); } catch { try { src.disconnect(); } catch {} }
  if (_audioSrc === src) _audioSrc = null;
}

function _sourceIsCurrent(generation, media) {
  return generation === _sourceGeneration && videoEl?.elt === media;
}

function _retireCurrentSource({ revokeBlob = true } = {}) {
  const hadSource = !!videoEl || !!currentBlobUrl;
  const generation = ++_sourceGeneration;
  if (hadSource) _capabilityInstrumentation?.count('sourceRetirements');
  // Invalidate only the decode callback chain. Independent render, transport,
  // mirror, and profiler schedulers remain exactly as they were in Pass 12R.
  _pumpSession++;
  _clearSourceReadyPoller();
  _clearSourceGestureUnlock();

  const wrapper = videoEl;
  const media = wrapper?.elt ?? wrapper ?? null;
  if (media) {
    try { media.pause(); } catch {}
    try { media.srcObject?.getTracks().forEach(track => track.stop()); } catch {}
    try { if (media.srcObject) media.srcObject = null; } catch {}
    _disconnectSourceAudio(media);
  }
  try { wrapper?.remove?.(); } catch {}
  videoEl = null;
  playing = false;
  _wasPlaying = false;
  _seekPending = false;
  _rvfcOwnsGCur = false;
  _resetPlaybackFrameTelemetry();
  _playbackTelemetry.sourceName = '';
  _playbackTelemetry.sourceMime = '';
  _playbackTelemetry.sourceExt = '';
  _playbackTelemetry.sourceBytes = 0;
  _playbackTelemetry.sourceWidth = 0;
  _playbackTelemetry.sourceHeight = 0;
  _resetGlitchStrobeGate('source-retired');
  _resetFeedbackStrobeGate('source-retired');
  window.resetPipelineLumaKeyState?.();
  _updateLumaStencilStatus?.('EMPTY');

  if (revokeBlob && currentBlobUrl) {
    try { URL.revokeObjectURL(currentBlobUrl); } catch {}
    currentBlobUrl = null;
  }
  return generation;
}

function _installSourceGestureUnlock(media, generation) {
  _clearSourceGestureUnlock();
  const gesture = async () => {
    if (!_sourceIsCurrent(generation, media)) {
      _clearSourceGestureUnlock();
      return;
    }
    try { await media.play(); } catch {}
    _clearSourceGestureUnlock();
  };
  _sourceGestureUnlock = gesture;
  window.addEventListener('pointerdown', gesture, true);
  window.addEventListener('keydown', gesture, true);
}

// Profiler-only lifecycle/output counters. They are not sampled from draw().
const _profileTelemetry = {
  decoded: 0,
  ringCaptured: 0,
  mirrorSent: 0,
  mirrorDropped: 0,
  mirrorCaptureMs: 0,
  mirrorCaptureSamples: 0,
  mirrorEncodeMs: 0,
  mirrorEncodeSamples: 0,
  mirrorScaledCaptures: 0,
  mirrorFullCaptures: 0,
};
window.__huffProfilerActive = false;
function _profileCount(name, amount = 1) {
  if (!window.__huffProfilerActive) return;
  _profileTelemetry[name] = (_profileTelemetry[name] || 0) + amount;
}
const _capabilityInstrumentation = window.HuffCapabilityInstrumentation || null;
let gCur, gBuf, gScratch;
let canvas, _mainCanvasEl = null, _mainCtx = null;
let playing = false;
let _wasPlaying  = false; // whether video was playing when a scrub started
let _seekPending = false; // whether a seek is still in flight when drag ends

// HUFF Classic is intentionally a 1080p-class instrument. Sources may decode at
// higher resolution, but the processing canvas is capped to ~2.07 MP and a
// 1920-pixel long edge. HUFF HD owns 4K+ processing.
const CLASSIC_MAX_LONG_EDGE = 1920;
const CLASSIC_MAX_PIXELS = 1920 * 1080;
const FRAME_RING_BUDGET_BYTES = 192 * 1024 * 1024;
const HISTORY_MAX_FRAMES = 120;
window.HUFF_CLASSIC_PROCESS_LIMIT = Object.freeze({
  maxLongEdge: CLASSIC_MAX_LONG_EDGE,
  maxPixels: CLASSIC_MAX_PIXELS,
  label: '1080p-class',
});

function _classicProcessDimensions(rawWidth, rawHeight, mode = 'auto') {
  if (mode === '1080p') return { width:1920, height:1080, scale:1, capped:false, mode };
  if (mode === '720p') return { width:1280, height:720, scale:1, capped:false, mode };
  const w = Math.max(1, Number(rawWidth) || 1);
  const h = Math.max(1, Number(rawHeight) || 1);
  const longScale = CLASSIC_MAX_LONG_EDGE / Math.max(w, h);
  const pixelScale = Math.sqrt(CLASSIC_MAX_PIXELS / (w * h));
  const scale = Math.min(1, longScale, pixelScale);
  // Even dimensions are friendlier to video/output paths while retaining the
  // window aspect ratio. Never upscale a smaller Classic window in AUTO.
  const outW = Math.max(2, Math.floor((w * scale) / 2) * 2);
  const outH = Math.max(2, Math.floor((h * scale) / 2) * 2);
  return { width: outW, height: outH, scale, capped: scale < 0.999999, mode:'auto' };
}

function _selectedProcessResolutionMode() {
  return String(renderState.processResolution || els.processResolution?.value || document.getElementById('processResolution')?.value || 'auto');
}

const _playbackTelemetry = Object.seal({
  sourceName: '', sourceMime: '', sourceExt: '', sourceBytes: 0,
  sourceWidth: 0, sourceHeight: 0,
  processWidth: 0, processHeight: 0,
  sourceFit: 'stretch',
  rvfcSupported: false,
  callbackCount: 0,
  presentedFrames: 0,
  missedPresentedFrames: 0,
  lastPresentedFrames: 0,
  mediaTime: 0,
  expectedDisplayTime: 0,
  processingDurationMs: 0,
  processingDurationMsTotal: 0,
  processingDurationSamples: 0,
  processingDurationMaxMs: 0,
});
window.HUFF_PLAYBACK_TELEMETRY = _playbackTelemetry;

function _resetPlaybackFrameTelemetry() {
  _playbackTelemetry.rvfcSupported = false;
  _playbackTelemetry.callbackCount = 0;
  _playbackTelemetry.presentedFrames = 0;
  _playbackTelemetry.missedPresentedFrames = 0;
  _playbackTelemetry.lastPresentedFrames = 0;
  _playbackTelemetry.mediaTime = 0;
  _playbackTelemetry.expectedDisplayTime = 0;
  _playbackTelemetry.processingDurationMs = 0;
  _playbackTelemetry.processingDurationMsTotal = 0;
  _playbackTelemetry.processingDurationSamples = 0;
  _playbackTelemetry.processingDurationMaxMs = 0;
}

const els = {};

// ─── Event-driven render state ───────────────────────────────────────────────
// The renderer used to parse values directly from dozens of DOM controls on
// every frame. Keep the DOM as the public control surface, but mirror control
// values into a typed state object whenever input/change events occur. MIDI,
// OSC, presets, reset buttons, and normal pointer input already dispatch those
// events, so all control paths remain synchronized without per-frame DOM reads.
const renderState = Object.create(null);
window.HUFF_RENDER_STATE = renderState;

function _readRenderControl(el) {
  if (!el) return undefined;
  if (el.type === 'checkbox') return !!el.checked;
  if (el.type === 'range' || el.type === 'number') {
    const n = Number(el.value);
    return Number.isFinite(n) ? n : 0;
  }
  return el.value ?? '';
}

function _syncRenderControl(id) {
  const el = els[id];
  if (!el) return;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return;
  renderState[id] = _readRenderControl(el);
}

function initRenderStateCache() {
  for (const [id, el] of Object.entries(els)) {
    if (!el) continue;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') continue;
    _syncRenderControl(id);
  }

  // Event delegation keeps synchronization to two listeners rather than adding
  // input/change listeners to every control. All existing interaction paths
  // bubble these events through the document.
  const syncFromEvent = event => {
    const id = event.target?.id;
    if (id && els[id] === event.target) _syncRenderControl(id);
  };
  document.addEventListener('input', syncFromEvent);
  document.addEventListener('change', syncFromEvent);
}

let baseSeed = 1, seededOnce = false;
// When the renderer is in a true bypass state, gBuf only needs to follow gCur
// once per decoded source frame. The previous path copied the same full frame
// on every 60 Hz render tick even when a 24/30 fps source had not changed.
let _bypassSyncedVfc = -1;
let _renderWasBypassed = true;
let nPhaseX = 0, nPhaseY = 1000;
// Pass 38: one explicit Corrupt motion clock. SPEED scales autonomous Corrupt
// movement without changing decoded-frame STROBE / MULTIGRAB timing semantics.
let _corruptClock = 0;
// Pass 40W separates Corrupt's visual-presence clock from its evolution clock.
// CONTINUOUS Corrupt stays composited every render so Scan/Luma cannot erase a
// slowed layer between updates. A decoded-frame source clock advances at the
// active Random/Cluster SPEED and chooses a stable historical age per patch.
let _corruptSourceClock = 0;
let _corruptSourceLastVfc = -1;
const _corruptMotion = Object.seal({ x:0, y:0, z:0, zDir:1, dt:1/60, speed:1, timeSec:0, serial:0, sourceSerial:0, clusterSpeed:1, clusterTimeSec:0 });
window.HUFF_CORRUPT_MOTION = _corruptMotion;
function _resetCorruptAxisMotion() {
  _corruptClock = 0;
  _corruptMotion.x = 0;
  _corruptMotion.y = 0;
  _corruptMotion.z = 0;
  _corruptMotion.zDir = 1;
  _corruptMotion.dt = 1/60;
  _corruptMotion.speed = 1;
  _corruptMotion.timeSec = 0;
  _corruptMotion.serial = 0;
  _corruptSourceClock = 0;
  _corruptSourceLastVfc = -1;
  _corruptMotion.sourceSerial = 0;
  _corruptMotion.clusterSpeed = 1;
  _corruptMotion.clusterTimeSec = 0;
}
let nPhaseScanX = 0, nPhaseScanY = 2000; // independent scanline phase
let _scanSpinAngle = 0;                   // continuous spin accumulator (degrees)
const _scanSpatialMotion = { x:0, y:0, zoomOffset:0, zDir:1 };
function _resetScanSpatialMotion() {
  _scanSpatialMotion.x = 0;
  _scanSpatialMotion.y = 0;
  _scanSpatialMotion.zoomOffset = 0;
  _scanSpatialMotion.zDir = 1;
}

// ─── FrameRing ────────────────────────────────────────────────────────────────
// Replaces the plain array + shift() pattern.
//   push(frame)   — O(1), auto-evicts oldest when at capacity
//   fromEnd(n)    — O(1), n=0 is newest, n=1 is one before, etc.
//   resize(cap)   — adjusts capacity, retaining most-recent frames
//   clear()       — empties the ring
//   .length       — number of frames currently held

class FrameRing {
  constructor(cap) {
    this._cap  = Math.max(1, cap);
    this._buf  = new Array(this._cap).fill(null);
    this._head = 0;
    this._size = 0;
    this._version = 0;
  }

  get length()   { return this._size; }
  get capacity() { return this._cap;  }
  get version()  { return this._version; }

  _makeFrame(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha:false, desynchronized:true });
    if (ctx) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'copy';
    }
    return { canvas, ctx };
  }

  _releaseFrame(frame) {
    if (!frame?.canvas) return;
    // Dropping a canvas reference does not guarantee that WebKit immediately
    // releases its backing store. Collapse retired slots first so resize,
    // quality reduction, and shutdown do not temporarily retain full frames.
    try { frame.canvas.width = 1; frame.canvas.height = 1; } catch {}
    frame.ctx = null;
    frame.canvas = null;
  }

  get allocatedSlots() {
    let count = 0;
    for (let i = 0; i < this._buf.length; i++) {
      if (this._buf[i]?.canvas) count++;
    }
    return count;
  }

  get estimatedBytes() {
    let total = 0;
    for (let i = 0; i < this._buf.length; i++) {
      const canvas = this._buf[i]?.canvas;
      if (canvas) total += canvas.width * canvas.height * 4;
    }
    return total;
  }

  // Store an owned snapshot without GPU→CPU readback. Each ring slot is a
  // reusable canvas backing store. drawImage() copies the decoded frame into the
  // slot once, and temporal effects later sample that canvas directly.
  pushFrom(source, width, height) {
    if (!source || width <= 0 || height <= 0) return false;

    let frame = this._buf[this._head];
    if (!frame) {
      frame = this._makeFrame(width, height);
      this._buf[this._head] = frame;
    } else if (frame.canvas.width !== width || frame.canvas.height !== height) {
      frame.canvas.width  = width;
      frame.canvas.height = height;
      // Resizing resets Canvas2D state. Ring contexts are dedicated overwrite
      // surfaces, so keep them permanently in copy mode between captures.
      frame.ctx.globalAlpha = 1;
      frame.ctx.globalCompositeOperation = 'copy';
    }

    try {
      // Ring captures currently receive gCur's canvas at identical dimensions.
      // Use Canvas2D's exact-size path so the browser does not enter its scaling
      // setup for every decoded frame. Retain the scaled fallback for safety.
      if (source.width === width && source.height === height) {
        frame.ctx.drawImage(source, 0, 0);
      } else {
        frame.ctx.drawImage(source, 0, 0, width, height);
      }
    } catch (e) {
      return false;
    }

    this._head = (this._head + 1) % this._cap;
    if (this._size < this._cap) this._size++;
    this._version++;
    return true;
  }

  fromEnd(n) {
    if (n < 0 || n >= this._size) return null;
    return this._buf[(this._head - 1 - n + this._cap * 2) % this._cap]?.canvas ?? null;
  }

  resize(newCap) {
    newCap = Math.max(1, newCap);
    if (newCap === this._cap) return;

    const keep   = Math.min(this._size, newCap);
    const newBuf = new Array(newCap).fill(null);
    const retained = new Set();
    for (let i = 0; i < keep; i++) {
      const frame = this._buf[(this._head - 1 - i + this._cap * 2) % this._cap];
      newBuf[keep - 1 - i] = frame;
      if (frame) retained.add(frame);
    }

    // Explicitly collapse slots discarded by a lower quality setting or a
    // memory-budget resize. This keeps the newest frames and releases only the
    // retired backing stores.
    for (const frame of this._buf) {
      if (frame && !retained.has(frame)) this._releaseFrame(frame);
    }

    this._buf  = newBuf;
    this._head = keep % newCap;
    this._size = keep;
    this._cap  = newCap;
    this._version++;
  }

  // release=true is used after a render-resolution change so old large backing
  // stores are eligible for collection immediately instead of lingering until
  // every ring slot has been overwritten at the new dimensions.
  clear(release = false) {
    if (release) {
      for (const frame of this._buf) this._releaseFrame(frame);
      this._buf.fill(null);
    }
    this._head = 0;
    this._size = 0;
    this._version++;
  }

  dispose() {
    this.clear(true);
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
  const okStyle  = { background:'#D4D0C8', color:'#000', border:'1px solid #404040' };
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
      background:'#D4D0C8', color:'#000', fontFamily:'monospace',
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
  'quality','historyFrames','processResolution','sourceFit','depth','corrupt','block','glitchSpeed','glitchSpeedFine','glitchSpeedMul',
  'glitchSize','glitchSmear','glitchBaseX','glitchBaseY','glitchBaseZ','corruptMoveX','corruptMoveY','corruptMoveZ',
  'glitchAlpha','glitchJitter','glitchSmearAngle','glitchStrobeEvery',
  'corruptUpdateMode','corruptHoldFrames','corruptLiveFrames','corruptSpeed',
  'corruptMaskMode','corruptMaskThreshold','corruptMaskSide','corruptDistribution','seed',
  'corruptOn','feedbackEnabled','feedback','persistence','feedbackMotionRange','fbX','fbY','fbZ','fbTheta','feedbackStrobe','feedbackStrobeEvery','feedbackRestore',
  'clusters','clusterCount','clusterRadius','spatialGap',
  'cluCenters','cluSpread','cluMinSpread','cluDepth','cluBias','cluDrift','cluSpeed','cluInertia','clusterMasterSpeed','cluMoveX','cluMoveY','cluMoveZ',
  'flowOn','flowStrength','flowScale','flowPulse','flowImpl','flowSpeed','flowTurb','flowSwirl','flowSpread',
  'baseOn','baseMix','seedOnLoad',
  'symOn','symMode','symPos',
  'solarizeOn','solarizeMode','solarizeThresh','solarizeLevel','solarizeSoft','solarizeInvert','solarizeAmt','solarizeR','solarizeG','solarizeB',
  'scanAlpha','scanShift','scanDrift','scanSpeed','scanGap','scanSkew',
  'scanAngle','scanFocus','scanRoll',
  'scanSpinLeft','scanSpinRight','scanSpinSpeed',
  'scanPlaceX','scanPlaceY','scanZoom','scanMoveX','scanMoveY','scanMoveZ',
  'scanPanelLayout','scanFieldSpreadX','scanFieldSpreadY','scanFieldSpreadZ','scanFieldSizeVar','scanFieldDrift','scanFieldDepthDrift',
  'bgMode',
  'cluSpeedVar','cluPulse',
  'cluSteer','cluBreathe','cluBounds','cluCohere',
  'pipelineRecipe','layerPriority','layerPulseSpeed',
  'lumaKeyOn','lumaKeyTarget','lumaKeyMix','lumaKeyAB','lumaKeyInvert','lumaKeyGain','lumaKeySource','lumaKeyFade','lumaKeyCleanup','lumaKeyDensity',
  'globalMixOn','globalMixBlend','globalMixAmt','globalMixPos',
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
  // Presets created before Pass 30 did not contain a route ID. They must load
  // into the exact CLASSIC compatibility recipe, regardless of the route that
  // happens to be active when the preset is recalled. Unknown imported route
  // IDs also recover to CLASSIC before any control events are dispatched.
  const sourceData = { ...data };
  // Pass 41A splits the misleading QUALITY control into explicit decoded-frame
  // HISTORY while keeping `quality` as a hidden compatibility alias. Legacy
  // presets retain the old target-frame intent before the memory clamp.
  if (!('historyFrames' in sourceData)) {
    const legacyQuality = Math.max(0, Number(sourceData.quality ?? 1) || 0);
    sourceData.historyFrames = String(Math.max(4, Math.min(HISTORY_MAX_FRAMES, Math.round(120 * legacyQuality))));
  }
  if (!('processResolution' in sourceData)) sourceData.processResolution = 'auto';
  if (!('sourceFit' in sourceData)) sourceData.sourceFit = 'stretch';
  // Pass 42 extends Solarize without changing the accepted Classic algorithm.
  // Old presets always restore the exact THRESHOLD path; the DaVE-inspired
  // LUMA QUANTIZE controls are additive and receive useful neutral-safe defaults.
  if (!('solarizeMode' in sourceData)) sourceData.solarizeMode = 'threshold';
  if (!('solarizeLevel' in sourceData)) sourceData.solarizeLevel = '75';
  if (!('solarizeSoft' in sourceData)) sourceData.solarizeSoft = '0';
  if (!('solarizeInvert' in sourceData)) sourceData.solarizeInvert = false;
  const validRecipeIds = new Set(['classic', 'crisp-finish']);
  if (!validRecipeIds.has(String(sourceData.pipelineRecipe || ''))) {
    sourceData.pipelineRecipe = 'classic';
  }
  // Pass 37 makes the temporal policy explicit. Legacy Glitch Strobe
  // presets migrate to the equivalent CORRUPT update mode.
  if (!('glitchStrobeEvery' in sourceData)) sourceData.glitchStrobeEvery = '4';
  if (!('corruptUpdateMode' in sourceData)) {
    sourceData.corruptUpdateMode = sourceData.glitchStrobe ? 'strobe' : 'continuous';
  }
  if (!('corruptHoldFrames' in sourceData)) sourceData.corruptHoldFrames = '8';
  if (!('corruptLiveFrames' in sourceData)) sourceData.corruptLiveFrames = '2';
  if (!('corruptSpeed' in sourceData)) sourceData.corruptSpeed = '1';
  if (!('glitchBaseZ' in sourceData)) sourceData.glitchBaseZ = '0';
  if (!('corruptMoveX' in sourceData)) sourceData.corruptMoveX = '0';
  if (!('corruptMoveY' in sourceData)) sourceData.corruptMoveY = '0';
  if (!('corruptMoveZ' in sourceData)) sourceData.corruptMoveZ = '0';

  // Pass 39M is additive: old presets receive neutral Feedback merge controls
  // while FEEDBACK, PERSISTENCE and FB X/Y/Z/theta keep their original IDs, values and equations.
  if (!('feedbackEnabled' in sourceData)) sourceData.feedbackEnabled = true;
  if (!('feedbackMotionRange' in sourceData)) sourceData.feedbackMotionRange = 'classic';
  if (!('feedbackStrobe' in sourceData)) sourceData.feedbackStrobe = false;
  if (!('feedbackStrobeEvery' in sourceData)) sourceData.feedbackStrobeEvery = '4';
  if (!('feedbackRestore' in sourceData)) sourceData.feedbackRestore = '0';

  // Clusters are now a distribution mode rather than a separate effect block.
  if (!('corruptDistribution' in sourceData)) {
    sourceData.corruptDistribution = sourceData.clusterTiles ? 'cluster' : 'random';
  }
  // Legacy presets predate the 2.5D cluster depth plane. Keep them visually
  // flat unless they explicitly store the new parameter. Fresh sessions use
  // the UI default so turning Clusters on immediately reveals depth.
  if (!('cluDepth' in sourceData)) sourceData.cluDepth = '0';
  if (!('clusterMasterSpeed' in sourceData)) sourceData.clusterMasterSpeed = '1';
  if (!('cluMoveX' in sourceData)) sourceData.cluMoveX = '0';
  if (!('cluMoveY' in sourceData)) sourceData.cluMoveY = '0';
  if (!('cluMoveZ' in sourceData)) sourceData.cluMoveZ = '0';
  if (!('corruptMaskMode' in sourceData)) sourceData.corruptMaskMode = 'full';
  if (!('corruptMaskThreshold' in sourceData)) sourceData.corruptMaskThreshold = '128';
  if (!('corruptMaskSide' in sourceData)) sourceData.corruptMaskSide = 'bright';
  // Pass 40S is spatially additive. Legacy presets keep exact Scanlines behavior.
  if (!('scanPlaceX' in sourceData)) sourceData.scanPlaceX = '0';
  if (!('scanPlaceY' in sourceData)) sourceData.scanPlaceY = '0';
  if (!('scanZoom' in sourceData)) sourceData.scanZoom = '1';
  if (!('scanMoveX' in sourceData)) sourceData.scanMoveX = '0';
  if (!('scanMoveY' in sourceData)) sourceData.scanMoveY = '0';
  if (!('scanMoveZ' in sourceData)) sourceData.scanMoveZ = '0';
  // Pass 40U adds an alternate organization of the same Scan panels.
  // Existing presets remain BANDS; FIELD parameters are preloaded with useful
  // values so deliberately switching layout immediately reveals the collage mode.
  if (!('scanPanelLayout' in sourceData)) sourceData.scanPanelLayout = 'bands';
  if (!('scanFieldSpreadX' in sourceData)) sourceData.scanFieldSpreadX = '0.55';
  if (!('scanFieldSpreadY' in sourceData)) sourceData.scanFieldSpreadY = '0.45';
  if (!('scanFieldSpreadZ' in sourceData)) sourceData.scanFieldSpreadZ = '0.50';
  if (!('scanFieldSizeVar' in sourceData)) sourceData.scanFieldSizeVar = '0.20';
  if (!('scanFieldDrift' in sourceData)) sourceData.scanFieldDrift = '0.15';
  if (!('scanFieldDepthDrift' in sourceData)) sourceData.scanFieldDepthDrift = '0.10';
  // Pass 34 removes the rejected GLITCH key source. Legacy/self/glitch key
  // presets migrate safely to LIVE. Stored stencil pixels are intentionally not
  // serialized in presets; only the selected process source is.
  if (!('lumaKeyTarget' in sourceData)) sourceData.lumaKeyTarget = 'composite';
  if (!('lumaKeyGain' in sourceData)) sourceData.lumaKeyGain = '1';
  if (!('lumaKeySource' in sourceData) || sourceData.lumaKeySource === 'glitch') {
    sourceData.lumaKeySource = 'clean';
  }
  if (!('lumaKeyFade' in sourceData)) sourceData.lumaKeyFade = 'xfade';
  if (!('lumaKeyCleanup' in sourceData)) sourceData.lumaKeyCleanup = '0';
  if (!('lumaKeyDensity' in sourceData)) sourceData.lumaKeyDensity = '0';

  _suppressUndo = true;
  try {
    PRESET_IDS.forEach(id => {
      if (!(id in sourceData)) return;
      const el = _$(id);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!sourceData[id];
      } else {
        el.value = _clampToElement(el, sourceData[id]);
      }
      el.dispatchEvent(new Event('input',  { bubbles:true }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
    });
    // RATE is a derived performance view over the exact legacy speed stack.
    // Preset recall leaves SPEED/FINE/MULT byte-for-byte semantically intact.
    _syncCorruptRateFromLegacy();
    _resetScanSpatialMotion();
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

// ─── Preset system — localStorage + JSON export/import ───────────────────────
// Presets are stored by name in localStorage so they persist across sessions
// and are instantly accessible from the dropdown without file dialogs.
// JSON export/import provides portability between machines.

const PRESETS_LS_KEY = 'huff_presets_v1';

function _loadPresetMap() {
  try { return JSON.parse(localStorage.getItem(PRESETS_LS_KEY) || '{}'); } catch { return {}; }
}
function _savePresetMap(map) {
  try { localStorage.setItem(PRESETS_LS_KEY, JSON.stringify(map)); } catch {}
}

function refreshPresetList() {
  const sel = _$('presetList');
  if (!sel) return;
  const map  = _loadPresetMap();
  const prev = sel.value;
  sel.innerHTML = '<option value="">— saved presets —</option>';
  Object.keys(map).sort().forEach(name => {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    sel.appendChild(o);
  });
  if (prev && map[prev]) sel.value = prev;
}

function saveNamedPreset() {
  const nameEl = _$('presetName');
  const name   = (nameEl?.value || '').trim();
  if (!name) { showToast('Enter a preset name first', true); return; }
  const map = _loadPresetMap();
  map[name] = capturePreset();
  _savePresetMap(map);
  refreshPresetList();
  const sel = _$('presetList');
  if (sel) sel.value = name;
  showToast(`Preset "${name}" saved`);
}

function loadNamedPreset() {
  const sel  = _$('presetList');
  const name = sel?.value;
  if (!name) { showToast('Select a preset first', true); return; }
  const map  = _loadPresetMap();
  if (!map[name]) { showToast(`Preset "${name}" not found`, true); return; }
  snapshotForUndo();
  applyPreset(map[name]);
  showToast(`Preset "${name}" loaded`);
}

function deleteNamedPreset() {
  const sel  = _$('presetList');
  const name = sel?.value;
  if (!name) { showToast('Select a preset to delete', true); return; }
  const map  = _loadPresetMap();
  if (!map[name]) return;
  delete map[name];
  _savePresetMap(map);
  refreshPresetList();
  showToast(`Preset "${name}" deleted`);
}

// JSON export — downloads all named presets as one file for sharing/backup
function exportPresetsJSON() {
  const map  = _loadPresetMap();
  const keys = Object.keys(map);
  if (keys.length === 0) { showToast('No presets saved yet', true); return; }
  const blob = new Blob([JSON.stringify(map, null, 2)], { type:'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `huff-presets-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  showToast(`${keys.length} preset${keys.length !== 1 ? 's' : ''} exported`);
}

// JSON import — merges presets from a file into the existing localStorage set
function importPresetsFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const incoming = JSON.parse(e.target.result);
      // Accept either a map of {name: presetData} or a single preset object
      const isSinglePreset = '_v' in incoming && !Object.values(incoming).some(v => v && '_v' in v);
      if (isSinglePreset) {
        // Single preset — ask for a name via the name field
        const nameEl = _$('presetName');
        const name   = (nameEl?.value || '').trim() || `imported-${Date.now()}`;
        const map    = _loadPresetMap();
        map[name]    = incoming;
        _savePresetMap(map);
        refreshPresetList();
        const sel = _$('presetList');
        if (sel) sel.value = name;
        showToast(`Preset imported as "${name}"`);
      } else {
        // Map of named presets — merge all
        const map = _loadPresetMap();
        let count = 0;
        Object.entries(incoming).forEach(([name, data]) => {
          if (data && typeof data === 'object') { map[name] = data; count++; }
        });
        _savePresetMap(map);
        refreshPresetList();
        showToast(`${count} preset${count !== 1 ? 's' : ''} imported`);
      }
    } catch {
      showToast('Invalid preset file', true);
    }
  };
  reader.onerror = () => showToast('Could not read file', true);
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
  if (!target || !videoEl) return;
  const source = videoEl.elt ?? videoEl;
  const fit = renderState.sourceFit || els.sourceFit?.value || 'stretch';
  try { _copySourceFrame(target.drawingContext, source, target.width, target.height, fit); } catch {}
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
let _rvfcOwnsGCur = false;

// Replace an entire 2D canvas in one operation. STRETCH preserves the exact
// historical Classic fast path. FIT/FILL/1:1 are explicit fidelity options and
// therefore clear the uncovered destination before drawing.
function _copyFullFrame(ctx, source, width, height) {
  if (!ctx || !source || width <= 0 || height <= 0) return false;
  const prevOp    = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;
  try {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    const sourceWidth  = source.videoWidth  || source.width  || 0;
    const sourceHeight = source.videoHeight || source.height || 0;
    if (sourceWidth === width && sourceHeight === height) {
      ctx.drawImage(source, 0, 0);
    } else {
      ctx.drawImage(source, 0, 0, width, height);
    }
    return true;
  } finally {
    ctx.globalCompositeOperation = prevOp || 'source-over';
    ctx.globalAlpha = prevAlpha;
  }
}

function _copySourceFrame(ctx, source, width, height, fitMode = 'stretch') {
  if (!ctx || !source || width <= 0 || height <= 0) return false;
  const sw = Number(source.videoWidth || source.width || 0);
  const sh = Number(source.videoHeight || source.height || 0);
  if (!(sw > 0 && sh > 0)) return false;
  const mode = String(fitMode || 'stretch');
  if (mode === 'stretch') return _copyFullFrame(ctx, source, width, height);

  const prevOp = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;
  try {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    if (mode === 'fit') {
      const scale = Math.min(width / sw, height / sh);
      const dw = sw * scale, dh = sh * scale;
      ctx.drawImage(source, (width - dw) * 0.5, (height - dh) * 0.5, dw, dh);
    } else if (mode === 'fill') {
      const scale = Math.max(width / sw, height / sh);
      const cropW = width / scale, cropH = height / scale;
      const sx = (sw - cropW) * 0.5, sy = (sh - cropH) * 0.5;
      ctx.drawImage(source, sx, sy, cropW, cropH, 0, 0, width, height);
    } else if (mode === 'one-to-one') {
      const srcW = Math.min(sw, width), srcH = Math.min(sh, height);
      const sx = Math.max(0, (sw - srcW) * 0.5), sy = Math.max(0, (sh - srcH) * 0.5);
      const dx = Math.max(0, (width - srcW) * 0.5), dy = Math.max(0, (height - srcH) * 0.5);
      ctx.drawImage(source, sx, sy, srcW, srcH, dx, dy, srcW, srcH);
    } else {
      return _copyFullFrame(ctx, source, width, height);
    }
    return true;
  } finally {
    ctx.restore();
    ctx.globalCompositeOperation = prevOp || 'source-over';
    ctx.globalAlpha = prevAlpha;
  }
}

function _graphicsCanvas(g) {
  return g?.elt ?? g?.drawingContext?.canvas ?? null;
}

function _clearGraphics(g) {
  const ctx = g?.drawingContext;
  if (!ctx) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, g.width, g.height);
  ctx.restore();
}

function _copyGraphicsFrame(dst, src) {
  const source = _graphicsCanvas(src);
  if (!dst?.drawingContext || !source) return false;
  return _copyFullFrame(dst.drawingContext, source, dst.width, dst.height);
}

function _configureGraphics(g) {
  if (!g) return g;
  // Newly-created p5.Graphics instances inherit the global density, but mark
  // them explicitly once. Avoid re-running pixelDensity() after each resize,
  // which some p5 builds implement by reallocating the backing canvas.
  if (!g.__huffDensity1) {
    try { g.pixelDensity(1); } catch {}
    g.__huffDensity1 = true;
  }
  try { g.imageMode(CORNER); } catch {}
  const ctx = g.drawingContext;
  if (ctx) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  return g;
}

// Reuse p5.Graphics objects across window resizes. JavaScript resize callbacks
// cannot run concurrently with draw(), so resizing the existing backing stores
// avoids the old eight-surface transient (four old + four new) without exposing
// partially swapped references. A single-buffer replacement remains as fallback.
function _ensureGraphics(g, w, h) {
  if (!g) return _configureGraphics(createGraphics(w, h));
  if (g.width === w && g.height === h) return _configureGraphics(g);
  try {
    g.resizeCanvas(w, h);
    return _configureGraphics(g);
  } catch (error) {
    const replacement = _configureGraphics(createGraphics(w, h));
    try { g.remove(); } catch {}
    return replacement;
  }
}


function _syncGCur() {
  if (!playing || !videoEl?.elt || !gCur) return;
  // requestVideoFrameCallback already updates gCur exactly when a new decoded
  // frame arrives. Re-blitting the same video frame on every render tick adds a
  // full-canvas copy without producing newer pixels. Keep the 60 Hz path only as
  // the compatibility fallback for WebViews without rVFC.
  if (_rvfcOwnsGCur) return;
  // Skip drawImage while the browser is seeking — videoEl.elt holds no valid
  // frame during decode and drawImage produces a blank, causing the visible pause.
  // gCur already holds the last good frame, so effects keep running on it.
  // _syncGCur resumes automatically on the next draw() call after seeking completes.
  if (videoEl.elt.seeking) return;
  try {
    _copySourceFrame(gCur.drawingContext, videoEl.elt, gCur.width, gCur.height, renderState.sourceFit || 'stretch');
  } catch(e) {}
}

let _ringCapWidth = 0;
let _ringCapHeight = 0;
let _ringRequestedFrames = NaN;

function _historyMemoryCapacity(width, height) {
  const bpf = Math.max(1, width * height * 4);
  return Math.max(1, Math.min(HISTORY_MAX_FRAMES, Math.floor(FRAME_RING_BUDGET_BYTES / bpf)));
}

function _ensureFrameRingCapacity(width, height, requestedFrames) {
  const requested = Math.max(1, Math.min(HISTORY_MAX_FRAMES, Math.trunc(Number(requestedFrames) || HISTORY_MAX_FRAMES)));
  if (width === _ringCapWidth && height === _ringCapHeight && requested === _ringRequestedFrames) return;
  _ringCapWidth = width;
  _ringCapHeight = height;
  _ringRequestedFrames = requested;
  const cap = Math.max(1, Math.min(requested, _historyMemoryCapacity(width, height)));
  frameRing.resize(cap);
}

function _pushToRing() {
  if (!gCur) return false;
  try {
    const requestedFrames = renderState.historyFrames ?? HISTORY_MAX_FRAMES;
    _ensureFrameRingCapacity(gCur.width, gCur.height, requestedFrames);
    const src = gCur.elt ?? gCur.drawingContext?.canvas;
    return frameRing.pushFrom(src, gCur.width, gCur.height);
  } catch(e) {
    return false;
  }
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

  _rvfcOwnsGCur = typeof v.requestVideoFrameCallback === 'function';

  if (_rvfcOwnsGCur) {
    _playbackTelemetry.rvfcSupported = true;
    const onFrame = (_now, metadata = {}) => {
      if (session !== _pumpSession) return; // stale chain — stop
      _playbackTelemetry.callbackCount++;
      const presented = Number(metadata.presentedFrames) || 0;
      if (presented > 0) {
        if (_playbackTelemetry.lastPresentedFrames > 0 && presented > _playbackTelemetry.lastPresentedFrames + 1) {
          _playbackTelemetry.missedPresentedFrames += presented - _playbackTelemetry.lastPresentedFrames - 1;
        }
        _playbackTelemetry.presentedFrames = presented;
        _playbackTelemetry.lastPresentedFrames = presented;
      }
      _playbackTelemetry.mediaTime = Number(metadata.mediaTime) || 0;
      _playbackTelemetry.expectedDisplayTime = Number(metadata.expectedDisplayTime) || 0;
      const procMs = Math.max(0, (Number(metadata.processingDuration) || 0) * 1000);
      _playbackTelemetry.processingDurationMs = procMs;
      if (procMs > 0) {
        _playbackTelemetry.processingDurationMsTotal += procMs;
        _playbackTelemetry.processingDurationSamples++;
        _playbackTelemetry.processingDurationMaxMs = Math.max(_playbackTelemetry.processingDurationMaxMs, procMs);
      }
      if (playing && gCur) {
        try {
          if (_copySourceFrame(gCur.drawingContext, v, gCur.width, gCur.height, renderState.sourceFit || 'stretch')) {
            _vfc++;
            _profileCount('decoded');
            if (_pushToRing()) _profileCount('ringCaptured');
          }
        } catch(e) {}
      }
      if (session === _pumpSession) v.requestVideoFrameCallback(onFrame);
    };
    v.requestVideoFrameCallback(onFrame);
  } else {
    _playbackTelemetry.rvfcSupported = false;
    const tick = (ts) => {
      if (session !== _pumpSession) return; // stale chain — stop
      if (ts - _rafPumpLast >= (1000 / 60)) {
        _rafPumpLast = ts;
        _vfc++;
        if (_pushToRing()) _profileCount('ringCaptured');
      }
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
      Object.assign(el.style, { marginLeft:'10px', color:'#000', fontFamily:'monospace', fontSize:'12px' });
      const status = _$('status');
      if (status) status.parentNode?.insertBefore(el, status.nextSibling);
      else document.body.appendChild(el);
    }
    el.textContent = `${fps} fps`;
  }
}

function setup() {
  // Set density before allocation so Retina systems never create a temporary
  // device-pixel-ratio backing store only to resize it immediately afterward.
  pixelDensity(1);
  const processSize = _classicProcessDimensions(windowWidth, windowHeight, document.getElementById('processResolution')?.value || 'auto');
  canvas = createCanvas(processSize.width, processSize.height);
  try { canvas.hide(); } catch {}
  _mainCanvasEl = canvas?.elt ?? document.querySelector('canvas');
  _mainCtx = _mainCanvasEl?.getContext('2d', { alpha:true, desynchronized:true }) ?? null;
  allocBuffers();
  clearAll();
  hookUI();
  updateLabels();
  setSeedFromUI();
  _syncUIIndicator();
}
window.setup = setup;

function allocBuffers() {
  const dimensionsChanged = !gCur || gCur.width !== width || gCur.height !== height ||
    !gBuf || gBuf.width !== width || gBuf.height !== height ||
    !gScratch || gScratch.width !== width || gScratch.height !== height;
  gCur     = _ensureGraphics(gCur,     width, height);
  gBuf     = _ensureGraphics(gBuf,     width, height);
  gScratch = _ensureGraphics(gScratch, width, height);
  _capabilityInstrumentation?.count('bufferAllocationPasses');
  if (dimensionsChanged) _capabilityInstrumentation?.count('bufferDimensionChanges');
  _capabilityInstrumentation?.setCanvas(width, height);
}

function _commitProcessResize(nextWidth, nextHeight, reason = 'resize') {
  const w = Math.max(2, Math.trunc(nextWidth) || 2);
  const h = Math.max(2, Math.trunc(nextHeight) || 2);
  if (width === w && height === h) {
    updateDim();
    return false;
  }
  resizeCanvas(w, h, true);
  _capabilityInstrumentation?.count('resizeCommits');
  _mainCanvasEl = canvas?.elt ?? _mainCanvasEl;
  _mainCtx = _mainCanvasEl?.getContext('2d', { alpha:true, desynchronized:true }) ?? _mainCtx;
  allocBuffers();
  [gBuf, gScratch].forEach(_clearGraphics);
  frameRing.clear(true);
  _resetGlitchStrobeGate(reason);
  _resetFeedbackStrobeGate(reason);
  window.resetPipelineLumaKeyState?.();
  _updateLumaStencilStatus?.('EMPTY');
  seededOnce = false;
  _bypassSyncedVfc = -1;
  _renderWasBypassed = true;
  if (typeof resetClusterPhysics === 'function') resetClusterPhysics();
  if (videoEl?.elt && gCur) {
    try { _copySourceFrame(gCur.drawingContext, videoEl.elt, gCur.width, gCur.height, renderState.sourceFit || 'stretch'); } catch {}
  }
  updateDim();
  return true;
}

let _resizeRaf = 0;
function windowResized() {
  _capabilityInstrumentation?.count('resizeRequests');
  if (_selectedProcessResolutionMode() !== 'auto') {
    updateDim();
    return;
  }
  if (_resizeRaf) cancelAnimationFrame(_resizeRaf);
  _resizeRaf = requestAnimationFrame(() => {
    _resizeRaf = 0;
    const processSize = _classicProcessDimensions(windowWidth, windowHeight, 'auto');
    _commitProcessResize(processSize.width, processSize.height, 'resize');
  });
}
window.windowResized = windowResized;

function clearAll() {
  _capabilityInstrumentation?.count('clearAllCalls');
  [gBuf, gScratch].forEach(_clearGraphics);
  frameRing.clear();
  _resetGlitchStrobeGate('clear');
  _resetFeedbackStrobeGate('clear');
  window.resetPipelineLumaKeyState?.();
  _updateLumaStencilStatus?.('EMPTY');
  seededOnce = false;
  _bypassSyncedVfc = -1;
  _renderWasBypassed = true;
  if (typeof resetClusterPhysics === 'function') resetClusterPhysics();
  _resetCorruptAxisMotion();
}

function refreshGlitch() {
  clearAll();
  nPhaseX = 0; nPhaseY = 1000;
  nPhaseScanX = 0; nPhaseScanY = 2000;
  _resetScanSpatialMotion();
}

// ─── UI wiring ────────────────────────────────────────────────────────────────
// Split into focused sub-functions so each concern is independently readable.

function hookUI() {
  [
    'file','playBtn','pauseBtn','refreshBtn','resetBtn','clearBufBtn',
    'camStartBtn','camStopBtn','camRefreshBtn','cams','corruptOn','sourceInfo',
    'quality','historyFrames','historyFramesVal','processResolution','sourceFit','depth','depthVal','corrupt','corruptVal','block','blockVal',
    'glitchSpeed','glitchSpeedVal','glitchSpeedFine','glitchSpeedFineVal','corruptRate','corruptRateVal','corruptSpeed','corruptSpeedVal',
    'glitchSize','glitchSizeVal','glitchSmear','glitchSmearVal',
    'glitchBaseX','glitchBaseXVal','glitchBaseY','glitchBaseYVal','glitchBaseZ','glitchBaseZVal',
    'corruptMoveX','corruptMoveXVal','corruptMoveY','corruptMoveYVal','corruptMoveZ','corruptMoveZVal','corruptResetXYZBtn',
    'glitchSpeedMul','glitchSpeedMulVal','glitchAlpha','glitchAlphaVal',
    'glitchJitter','glitchJitterVal','glitchSmearAngle','glitchSmearAngleVal',
    'glitchStrobe','glitchStrobeEvery','glitchStrobeEveryVal',
    'corruptUpdateMode','corruptHoldFrames','corruptHoldFramesVal','corruptLiveFrames','corruptLiveFramesVal',
    'corruptDistribution','clusterModeStatus','corruptMaskMode','corruptMaskThreshold','corruptMaskThresholdVal','corruptMaskSide','corruptMaskStatus','seed',
    'feedbackEnabled','feedback','feedbackVal','persistence','persistenceVal','feedbackMotionRange','feedbackStrobe','feedbackStrobeEvery','feedbackStrobeEveryVal','feedbackRestore','feedbackRestoreVal',
    'fbX','fbXVal','fbY','fbYVal','fbZ','fbZVal','fbTheta','fbThetaVal',
    'clusters','clusterTiles','clusterCount','clusterCountVal',
    'clusterRadius','clusterRadiusVal','spatialGap','spatialGapVal',
    'cluCenters','cluCentersVal','cluSpread','cluSpreadVal','cluDepth','cluDepthVal',
    'cluMinSpread','cluMinSpreadVal','cluBias','cluBiasVal','cluDrift','cluDriftVal',
    'clusterMasterSpeed','clusterMasterSpeedVal','cluSpeed','cluSpeedVal','cluSteer','cluSteerVal','cluInertia','cluInertiaVal','cluCohere','cluCohereVal',
    'cluMoveX','cluMoveXVal','cluMoveY','cluMoveYVal','cluMoveZ','cluMoveZVal',
    'flowOn','flowStrength','flowStrengthVal','flowScale','flowScaleVal',
    'flowPulse','flowPulseVal','flowImpl','flowImplVal',
    'flowSpeed','flowSpeedVal','flowTurb','flowTurbVal','flowSwirl','flowSwirlVal','flowSpread','flowSpreadVal',
    'baseOn','baseMix','baseMixVal','seedOnLoad',
    'symOn','symMode','symPos','symPosVal',
    'solarizeOn','solarizeMode','solarizeThresh','solarizeThreshVal','solarizeLevel','solarizeLevelVal','solarizeSoft','solarizeSoftVal','solarizeInvert','solarizeAmt','solarizeAmtVal',
    'solarizeR','solarizeRVal','solarizeG','solarizeGVal','solarizeB','solarizeBVal',
    'scanAlpha','scanAlphaVal','scanShift','scanShiftVal','scanDrift','scanDriftVal',
    'scanSpeed','scanSpeedVal','scanGap','scanGapVal','scanSkew','scanSkewVal',
    'scanAngle','scanAngleVal','scanFocus','scanFocusVal','scanRoll','scanRollVal',
    'scanSpinLeft','scanSpinRight','scanSpinSpeed','scanSpinSpeedVal',
    'scanPlaceX','scanPlaceXVal','scanPlaceY','scanPlaceYVal','scanZoom','scanZoomVal',
    'scanMoveX','scanMoveXVal','scanMoveY','scanMoveYVal','scanMoveZ','scanMoveZVal','scanResetXYZBtn',
    'scanPanelLayout','scanFieldSpreadX','scanFieldSpreadXVal','scanFieldSpreadY','scanFieldSpreadYVal','scanFieldSpreadZ','scanFieldSpreadZVal',
    'scanFieldSizeVar','scanFieldSizeVarVal','scanFieldDrift','scanFieldDriftVal','scanFieldDepthDrift','scanFieldDepthDriftVal','scanFieldResetBtn',
    'depthScatter','depthScatterVal','corruptDrift','corruptDriftVal',
    'scanAngle','bgMode','dim',
    'cluSpeedVar','cluSpeedVarVal','cluPulse','cluPulseVal','cluBreathe','cluBreatheVal','cluBounds',
    'pipelineRecipe','layerPriority','layerPriorityState','layerPulseSpeed','layerPulseSpeedVal',
    'lumaKeyOn','lumaKeyTarget','lumaKeyTargetState','lumaKeyMix','lumaKeyMixVal','lumaKeyAB','lumaKeyABVal','lumaKeyInvert',
    'lumaKeyGain','lumaKeyGainVal','lumaKeySource','lumaKeyFade','lumaKeyCleanup','lumaKeyCleanupVal','lumaKeyDensity','lumaKeyDensityVal','lumaKeyCaptureBtn','lumaKeyStencilState',
    'globalMixOn','globalMixBlend','globalMixAmt','globalMixAmtVal','globalMixPos',
  ].forEach(k => els[k] = _$(k));

  initRenderStateCache();
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
    try {
      await v.play();
    } catch {
      try { v.muted = true; await v.play(); } catch { return; }
    }

    // Route through dedicated audio thread — prevents main thread draw load
    // from causing audio dropouts
    connectVideoAudio(v);

    playing = true;
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
      const v = videoEl?.elt;
      const exactTarget = (v && !isNaN(v.duration))
        ? Math.max(0, Math.min(v.duration, seekBar._seekPending ?? (seekBar.value / 1000) * v.duration))
        : null;
      seekBar._dragging = false;
      if (_seekFrame) {
        cancelAnimationFrame(_seekFrame);
        _seekFrame = null;
      }
      seekBar._seekPending = null;

      // Dragging uses fastSeek() for responsiveness. On release, finish with an
      // exact currentTime seek so transport precision is not permanently tied
      // to the nearest keyframe.
      if (v && exactTarget != null && Math.abs(v.currentTime - exactTarget) > 0.001) {
        _seekPending = true;
        try { v.currentTime = exactTarget; } catch { _seekPending = false; }
      } else {
        _seekPending = false;
      }

      if (!_seekPending && _wasPlaying) {
        if (v) v.play().catch(() => {});
        _wasPlaying = false;
      }
    };
    seekBar.addEventListener('mouseup',  endDrag);
    seekBar.addEventListener('touchend', endDrag);
    seekBar.addEventListener('touchcancel', endDrag);
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
    if (_gainNode) {
      // Route through Web Audio gain — audio thread handles the level
      _gainNode.gain.value = vol;
      if (_audioCtx?.state === 'suspended') _audioCtx.resume();
    } else if (videoEl?.elt) {
      // Fallback if AudioContext unavailable
      videoEl.elt.volume = vol;
      videoEl.elt.muted  = (vol === 0);
    }
  });
}

function _updateLumaStencilStatus(forcedText = '') {
  const stateEl = els.lumaKeyStencilState;
  if (!stateEl) return;

  const status = window.getPipelineLumaStencilStatus?.();
  const isReady = forcedText === 'READY' || (!forcedText && !!status?.ready);
  const noSource = forcedText === 'NO SOURCE';
  const wantsStencil = els.lumaKeySource?.value === 'stencil';

  let label = 'EMPTY';
  let color = 'rgba(255,255,255,.45)';
  let glow = 'none';

  if (isReady) {
    const w = status?.width || 0;
    const h = status?.height || 0;
    label = w && h ? `STENCIL STORED ${w}×${h}` : 'STENCIL STORED';
    color = '#000000';
    glow = 'none';
  } else if (noSource) {
    label = 'NO SOURCE';
    color = '#ff9b9b';
  } else if (wantsStencil) {
    label = 'CAPTURE FIRST';
    color = '#ffd48a';
  }

  stateEl.textContent = label;
  stateEl.style.color = color;
  stateEl.style.textShadow = glow;
  stateEl.style.opacity = '1';

  if (els.lumaKeyCaptureBtn) {
    els.lumaKeyCaptureBtn.classList.toggle('active', isReady);
    els.lumaKeyCaptureBtn.setAttribute('aria-pressed', isReady ? 'true' : 'false');
    els.lumaKeyCaptureBtn.style.color = isReady ? '#000000' : '';
    els.lumaKeyCaptureBtn.style.textShadow = 'none';
  }
  if (typeof _syncCorruptContextUI === 'function') _syncCorruptContextUI();
}

// CORRUPT RATE is a semantic performance control layered over the exact legacy
// SPEED × FINE × MULT² contract. The logarithmic knob preserves useful
// low-speed resolution while still spanning the complete legacy 0..5000 range.
let _syncingCorruptRate = false;
function _legacyCorruptEffectiveRate() {
  const speed = Number(els.glitchSpeed?.value ?? 0) || 0;
  const fine = Number(els.glitchSpeedFine?.value ?? 0) || 0;
  const mul = Number(els.glitchSpeedMul?.value ?? 0) || 0;
  return Math.max(0, speed * fine * mul * mul);
}
function _corruptRateKnobToEffective(value) {
  const k = Math.max(0, Math.min(1, Number(value) || 0));
  return 0.5 * (Math.pow(10, 4 * k) - 1);
}
function _corruptEffectiveToRateKnob(rate) {
  const r = Math.max(0, Math.min(4999.5, Number(rate) || 0));
  return Math.max(0, Math.min(1, Math.log10(1 + r / 0.5) / 4));
}
function _setLegacyCorruptRate(rate) {
  const r = Math.max(0, Math.min(5000, Number(rate) || 0));
  let speed = 0, fine = 1, mul = 1;
  if (r <= 5) {
    speed = r;
  } else if (r <= 50) {
    speed = 5;
    fine = r / 5;
  } else {
    speed = 5;
    fine = 10;
    mul = Math.sqrt(r / 50);
  }
  _syncingCorruptRate = true;
  try {
    if (els.glitchSpeed) els.glitchSpeed.value = String(speed);
    if (els.glitchSpeedFine) els.glitchSpeedFine.value = String(fine);
    if (els.glitchSpeedMul) els.glitchSpeedMul.value = String(mul);
    _syncRenderControl('glitchSpeed');
    _syncRenderControl('glitchSpeedFine');
    _syncRenderControl('glitchSpeedMul');
  } finally {
    _syncingCorruptRate = false;
  }
}
function _syncCorruptRateFromLegacy() {
  if (!els.corruptRate || _syncingCorruptRate) return;
  _syncingCorruptRate = true;
  try {
    els.corruptRate.value = String(_corruptEffectiveToRateKnob(_legacyCorruptEffectiveRate()));
  } finally {
    _syncingCorruptRate = false;
  }
}

function _applyFeedbackMotionRange() {
  const wide = String(els.feedbackMotionRange?.value || 'classic') === 'wide';
  const specs = wide
    ? { fbX:[-8,8,0.01], fbY:[-8,8,0.01], fbZ:[0.95,1.05,0.001], fbTheta:[-5,5,0.01] }
    : { fbX:[-1,1,0.001], fbY:[-1,1,0.001], fbZ:[0.98,1.03,0.005], fbTheta:[-2,2,0.005] };
  for (const [id, [min,max,step]] of Object.entries(specs)) {
    const el = els[id];
    if (!el) continue;
    el.min = String(min); el.max = String(max); el.step = String(step);
    const n = Number(el.value);
    if (Number.isFinite(n) && (n < min || n > max)) {
      el.value = String(Math.max(min, Math.min(max, n)));
      el.dispatchEvent(new Event('input', { bubbles:true }));
    }
  }
}

function hookSliders() {
  const sliderIds = [
    'historyFrames','depth','corrupt','block','glitchSpeed','glitchSpeedFine','glitchSpeedMul','corruptSpeed',
    'glitchSize','glitchSmear','glitchBaseX','glitchBaseY','glitchBaseZ','corruptMoveX','corruptMoveY','corruptMoveZ','glitchStrobeEvery',
    'corruptHoldFrames','corruptLiveFrames','corruptMaskThreshold',
    'feedback','persistence','fbX','fbY','fbZ','fbTheta','feedbackStrobeEvery','feedbackRestore',
    'spatialGap','clusterCount','clusterRadius','cluCenters','cluSpread','cluDepth','clusterMasterSpeed','cluMoveX','cluMoveY','cluMoveZ',
    'cluMinSpread','cluBias','cluDrift','cluSpeed','cluSteer','cluInertia','cluCohere',
    'scanAlpha','scanShift','scanDrift','scanSpeed','scanGap','scanSkew','scanFocus','scanRoll','scanPlaceX','scanPlaceY','scanZoom','scanMoveX','scanMoveY','scanMoveZ',
    'scanFieldSpreadX','scanFieldSpreadY','scanFieldSpreadZ','scanFieldSizeVar','scanFieldDrift','scanFieldDepthDrift',
    'glitchAlpha','glitchJitter','glitchSmearAngle',
    'flowStrength','flowScale','flowPulse','flowImpl','flowSpeed','flowTurb','flowSwirl','flowSpread','baseMix','symPos',
    'depthScatter','corruptDrift',
    'solarizeThresh','solarizeLevel','solarizeSoft','solarizeAmt','solarizeR','solarizeG','solarizeB',
    'cluSpeedVar','cluPulse','cluBreathe',
    'lumaKeyMix','lumaKeyAB','lumaKeyGain','lumaKeyCleanup','lumaKeyDensity','globalMixAmt','scanAngle','scanSpinSpeed','layerPulseSpeed',
  ];

  sliderIds.forEach(id => {
    els[id]?.addEventListener('input', () => { updateLabels(); snapshotForUndo(); });
  });

  // HISTORY is the public control. The legacy hidden `quality` ID remains for
  // old MIDI/OSC maps and presets but no longer tunes mirror JPEG/FPS.
  const syncHistoryFromLegacyQuality = () => {
    if (!els.quality || !els.historyFrames) return;
    const q = Math.max(0, Number(els.quality.value) || 0);
    const requested = Math.max(4, Math.min(HISTORY_MAX_FRAMES, Math.round(120 * q)));
    els.historyFrames.value = String(Math.min(requested, Number(els.historyFrames.max) || requested));
    _syncRenderControl('historyFrames');
    updateLabels();
  };
  const syncLegacyQualityFromHistory = () => {
    if (!els.quality || !els.historyFrames) return;
    els.quality.value = String(Math.max(0, Math.min(3, (Number(els.historyFrames.value) || 4) / 120)));
    _syncRenderControl('quality');
  };
  els.quality?.addEventListener('input', syncHistoryFromLegacyQuality);
  els.quality?.addEventListener('change', syncHistoryFromLegacyQuality);
  els.historyFrames?.addEventListener('input', syncLegacyQualityFromHistory);
  els.historyFrames?.addEventListener('change', syncLegacyQualityFromHistory);

  els.processResolution?.addEventListener('change', () => {
    _syncRenderControl('processResolution');
    const mode = _selectedProcessResolutionMode();
    const processSize = _classicProcessDimensions(windowWidth, windowHeight, mode);
    if (_commitProcessResize(processSize.width, processSize.height, 'process-resolution')) {
      showToast(`PROCESS ${processSize.width}×${processSize.height}`, false);
    }
    snapshotForUndo();
  });

  els.sourceFit?.addEventListener('change', () => {
    _syncRenderControl('sourceFit');
    _playbackTelemetry.sourceFit = String(els.sourceFit.value || 'stretch');
    // Repaint the latest decoded source immediately so FIT/FILL/1:1 changes do
    // not wait for the next decoded frame when playback is paused.
    if (videoEl?.elt && gCur) {
      try {
        if (_copySourceFrame(gCur.drawingContext, videoEl.elt, gCur.width, gCur.height, _playbackTelemetry.sourceFit)) {
          _vfc++;
          _pushToRing();
          seededOnce = false;
          _bypassSyncedVfc = -1;
        }
      } catch {}
    }
    _updateSourceInfoStatus();
    snapshotForUndo();
  });

  els.corruptRate?.addEventListener('input', () => {
    if (_syncingCorruptRate) return;
    _setLegacyCorruptRate(_corruptRateKnobToEffective(els.corruptRate.value));
    updateLabels();
    snapshotForUndo();
  });
  for (const id of ['glitchSpeed','glitchSpeedFine','glitchSpeedMul']) {
    els[id]?.addEventListener('input', () => {
      if (_syncingCorruptRate) return;
      _syncCorruptRateFromLegacy();
      updateLabels();
    });
  }

  els.scanResetXYZBtn?.addEventListener('click', () => {
    if (els.scanPlaceX) els.scanPlaceX.value = '0';
    if (els.scanPlaceY) els.scanPlaceY.value = '0';
    if (els.scanZoom) els.scanZoom.value = '1';
    if (els.scanMoveX) els.scanMoveX.value = '0';
    if (els.scanMoveY) els.scanMoveY.value = '0';
    if (els.scanMoveZ) els.scanMoveZ.value = '0';
    for (const id of ['scanPlaceX','scanPlaceY','scanZoom','scanMoveX','scanMoveY','scanMoveZ']) _syncRenderControl(id);
    _resetScanSpatialMotion();
    window.invalidateScanlineCache?.();
    updateLabels();
    snapshotForUndo();
  });

  const syncScanFieldUI = () => {
    const active = String(els.scanPanelLayout?.value || 'bands') === 'field';
    document.querySelectorAll('.scan-field-control').forEach(node => {
      node.style.display = active ? '' : 'none';
    });
  };
  els.scanPanelLayout?.addEventListener('change', () => {
    syncScanFieldUI();
    updateLabels();
    window.invalidateScanlineCache?.();
  });
  els.scanFieldResetBtn?.addEventListener('click', () => {
    const zeros = ['scanFieldSpreadX','scanFieldSpreadY','scanFieldSpreadZ','scanFieldSizeVar','scanFieldDrift','scanFieldDepthDrift'];
    for (const id of zeros) {
      if (!els[id]) continue;
      els[id].value = '0';
      _syncRenderControl(id);
    }
    updateLabels();
    snapshotForUndo();
  });
  syncScanFieldUI();

  const syncLayerPriorityUI = () => {
    const mode = String(els.layerPriority?.value || 'scan');
    if (els.layerPulseSpeed) els.layerPulseSpeed.disabled = mode !== 'pulse';
    if (els.layerPriorityState) {
      els.layerPriorityState.textContent = mode === 'glitch' ? 'STABLE · CORRUPT TOP'
        : mode === 'neutral' ? 'ALTERNATES EVERY FRAME'
        : mode === 'pulse' ? 'ALTERNATES BY PULSE'
        : 'STABLE · SCAN TOP';
      els.layerPriorityState.classList.toggle('warn', mode === 'neutral' || mode === 'pulse');
    }
  };
  els.layerPriority?.addEventListener('change', () => {
    syncLayerPriorityUI();
    updateLabels();
  });
  syncLayerPriorityUI();

  const syncSolarizeModeUI = () => {
    const lumaMode = String(els.solarizeMode?.value || 'threshold') === 'luma-quantize';
    if (els.solarizeThresh) els.solarizeThresh.disabled = lumaMode;
    if (els.solarizeR) els.solarizeR.disabled = lumaMode;
    if (els.solarizeG) els.solarizeG.disabled = lumaMode;
    if (els.solarizeB) els.solarizeB.disabled = lumaMode;
    if (els.solarizeLevel) els.solarizeLevel.disabled = !lumaMode;
    if (els.solarizeSoft) els.solarizeSoft.disabled = !lumaMode;
    if (els.solarizeInvert) els.solarizeInvert.disabled = !lumaMode;
  };
  els.solarizeMode?.addEventListener('change', () => {
    syncSolarizeModeUI();
    updateLabels();
  });
  syncSolarizeModeUI();

  // Checkboxes and selects also get snapshotted for undo
  ['corruptOn','corruptUpdateMode','corruptDistribution','clusterTiles','corruptMaskMode','corruptMaskSide','clusters','feedbackEnabled','feedbackMotionRange','feedbackStrobe','flowOn','baseOn','symOn','solarizeOn','solarizeMode','solarizeInvert',
   'cluBounds','pipelineRecipe','layerPriority','seedOnLoad','bgMode','symMode',
   'lumaKeyOn','lumaKeyTarget','lumaKeyInvert','lumaKeySource','lumaKeyFade','globalMixOn','globalMixBlend','globalMixPos','scanSpinLeft','scanSpinRight','scanPanelLayout'].forEach(id => {
    _$(id)?.addEventListener('change', snapshotForUndo);
  });

  const syncFeedbackExperimentalUI = () => {
    if (els.feedbackStrobeEvery) els.feedbackStrobeEvery.disabled = !els.feedbackStrobe?.checked;
  };
  els.feedbackStrobe?.addEventListener('change', () => {
    _resetFeedbackStrobeGate('toggle');
    syncFeedbackExperimentalUI();
    updateLabels();
  });
  els.feedbackStrobeEvery?.addEventListener('input', () => _resetFeedbackStrobeGate('interval'));
  els.feedbackEnabled?.addEventListener('change', () => {
    _resetFeedbackStrobeGate('enable');
    updateLabels();
  });
  els.feedbackMotionRange?.addEventListener('change', () => {
    _applyFeedbackMotionRange();
    updateLabels();
  });
  _applyFeedbackMotionRange();
  syncFeedbackExperimentalUI();

  els.baseOn?.addEventListener('change', () => {
    if (els.baseMix) els.baseMix.disabled = !els.baseOn.checked;
    updateLabels();
  });

  let _syncingLegacyCorruptControls = false;
  const syncLegacyUpdateAlias = () => {
    if (!els.glitchStrobe || !els.corruptUpdateMode) return;
    _syncingLegacyCorruptControls = true;
    els.glitchStrobe.checked = els.corruptUpdateMode.value === 'strobe';
    _syncingLegacyCorruptControls = false;
  };
  const syncLegacyDistributionAlias = () => {
    if (!els.clusterTiles || !els.corruptDistribution) return;
    _syncingLegacyCorruptControls = true;
    els.clusterTiles.checked = els.corruptDistribution.value === 'cluster';
    _syncingLegacyCorruptControls = false;
  };

  els.corruptUpdateMode?.addEventListener('change', () => {
    syncLegacyUpdateAlias();
    _resetGlitchStrobeGate('mode');
    updateLabels();
  });
  els.glitchStrobe?.addEventListener('change', () => {
    if (_syncingLegacyCorruptControls || !els.corruptUpdateMode) return;
    els.corruptUpdateMode.value = els.glitchStrobe.checked ? 'strobe' : 'continuous';
    els.corruptUpdateMode.dispatchEvent(new Event('change', { bubbles:true }));
  });
  els.glitchStrobeEvery?.addEventListener('input', () => _resetGlitchStrobeGate('interval'));
  els.corruptHoldFrames?.addEventListener('input', () => _resetGlitchStrobeGate('hold'));
  els.corruptLiveFrames?.addEventListener('input', () => _resetGlitchStrobeGate('live'));

  els.corruptDistribution?.addEventListener('change', () => {
    syncLegacyDistributionAlias();
    updateLabels();
  });
  els.clusterTiles?.addEventListener('change', () => {
    if (_syncingLegacyCorruptControls || !els.corruptDistribution) return;
    els.corruptDistribution.value = els.clusterTiles.checked ? 'cluster' : 'random';
    els.corruptDistribution.dispatchEvent(new Event('change', { bubbles:true }));
  });
  els.corruptMaskMode?.addEventListener('change', updateLabels);
  els.corruptMaskSide?.addEventListener('change', updateLabels);
  els.corruptResetXYZBtn?.addEventListener('click', () => {
    snapshotForUndo();
    const neutral = { glitchBaseX:0, glitchBaseY:0, glitchBaseZ:0, corruptMoveX:0, corruptMoveY:0, corruptMoveZ:0 };
    for (const [id, value] of Object.entries(neutral)) {
      if (!els[id]) continue;
      els[id].value = String(value);
      els[id].dispatchEvent(new Event('input', { bubbles:true }));
    }
    _resetCorruptAxisMotion();
    updateLabels();
  });

  // Initialize compatibility aliases after the canonical controls exist.
  syncLegacyUpdateAlias();
  syncLegacyDistributionAlias();

  els.lumaKeyCaptureBtn?.addEventListener('click', () => {
    const ok = window.capturePipelineLumaStencil?.() === true;
    _updateLumaStencilStatus(ok ? 'READY' : 'NO SOURCE');
    updateLabels();
  });

  const syncLumaTargetUI = () => {
    const target = String(els.lumaKeyTarget?.value || 'composite');
    if (els.lumaKeyFade) {
      els.lumaKeyFade.disabled = target !== 'composite';
      els.lumaKeyFade.title = target === 'composite'
        ? 'X-FADE / SOFT ADD for the legacy composite clean-patch key.'
        : 'Fade mode belongs to COMPOSITE target only. CORRUPT/SCAN target the effect objects directly.';
    }
    if (els.lumaKeyTargetState) {
      const active = target === 'scan' ? !!els.clusters?.checked
        : target === 'corrupt' ? !!els.corruptOn?.checked
        : true;
      els.lumaKeyTargetState.textContent = target === 'scan'
        ? (active ? 'SCAN PANELS' : 'SCAN OFF')
        : target === 'corrupt'
          ? (active ? 'CORRUPT PATCHES' : 'CORRUPT OFF')
          : 'COMPOSITE';
      els.lumaKeyTargetState.classList.toggle('warn', !active);
    }
  };

  els.lumaKeyTarget?.addEventListener('change', () => {
    window.invalidatePipelineLumaKeyCache?.();
    syncLumaTargetUI();
    updateLabels();
  });
  els.corruptOn?.addEventListener('change', syncLumaTargetUI);
  els.clusters?.addEventListener('change', syncLumaTargetUI);

  els.lumaKeySource?.addEventListener('change', () => {
    window.invalidatePipelineLumaKeyCache?.();
    _updateLumaStencilStatus();
    syncLumaTargetUI();
  });

  syncLumaTargetUI();

  // Key-shaping changes invalidate only the shaped Luma cache. The decoded
  // LIVE luminance plane is retained, so INVERT / CLIP / GAIN edits do not
  // force an extra synchronous source readback on the same video frame.
  // This also prevents stale shaped alpha from surviving an edit.
  ['lumaKeyAB','lumaKeyGain','lumaKeyCleanup','lumaKeyDensity'].forEach(id => {
    els[id]?.addEventListener('input', () => window.invalidatePipelineLumaKeyCache?.());
  });
  els.lumaKeyInvert?.addEventListener('change', () => window.invalidatePipelineLumaKeyCache?.());
}

function hookPresets() {
  // Named preset controls
  _$('presetSaveBtn')?.addEventListener('click', saveNamedPreset);
  _$('presetLoadBtn')?.addEventListener('click', loadNamedPreset);
  _$('presetDeleteBtn')?.addEventListener('click', deleteNamedPreset);

  // Double-clicking a preset in the list loads it immediately
  _$('presetList')?.addEventListener('dblclick', loadNamedPreset);

  // JSON export/import
  _$('presetExportBtn')?.addEventListener('click', exportPresetsJSON);
  const importBtn   = _$('presetImportBtn');
  const importInput = _$('presetLoadInput');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', () => {
      importPresetsFromFile(importInput.files?.[0]);
      importInput.value = '';
    });
  }

  // Allow Enter key in name field to trigger save
  _$('presetName')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveNamedPreset(); }
  });

  // Populate list on startup
  refreshPresetList();

  // Reset btn
  els.resetBtn?.addEventListener('click', () => { snapshotForUndo(); refreshGlitch(); });
  els.clearBufBtn?.addEventListener('click', () => clearAll());
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

function _updateHistoryControlBounds() {
  const el = els.historyFrames;
  if (!el) return;
  const maxFrames = _historyMemoryCapacity(Math.max(1, width), Math.max(1, height));
  el.max = String(maxFrames);
  if (Number(el.value) > maxFrames) el.value = String(maxFrames);
  if (Number(el.value) < 1) el.value = String(Math.min(maxFrames, 4));
  _syncRenderControl('historyFrames');
  const actual = Math.min(Math.max(1, Math.trunc(Number(el.value) || maxFrames)), maxFrames);
  const mib = actual * width * height * 4 / 1048576;
  if (els.historyFramesVal) els.historyFramesVal.textContent = `${actual} fr · ${mib.toFixed(0)} MiB`;
}

function _updateSourceInfoStatus() {
  _playbackTelemetry.processWidth = width || 0;
  _playbackTelemetry.processHeight = height || 0;
  _playbackTelemetry.sourceFit = String(renderState.sourceFit || els.sourceFit?.value || 'stretch');
  const el = els.sourceInfo;
  if (!el) return;
  const sw = _playbackTelemetry.sourceWidth || videoEl?.elt?.videoWidth || 0;
  const sh = _playbackTelemetry.sourceHeight || videoEl?.elt?.videoHeight || 0;
  const ext = (_playbackTelemetry.sourceExt || '').toUpperCase();
  const src = sw && sh ? `${sw}×${sh}` : '—';
  const proc = `${width || 0}×${height || 0}`;
  const capped = sw > 0 && sh > 0 && (sw > width || sh > height) ? ' ↓' : ' →';
  const processMode = _selectedProcessResolutionMode().toUpperCase();
  el.textContent = `SRC ${src}${capped}${proc}${ext ? ` · ${ext}` : ''} · ${processMode} · ${_playbackTelemetry.sourceFit.toUpperCase()}`;
  el.title = `Source ${src} → Classic processing ${proc} (1080p-class maximum). Process mode: ${_selectedProcessResolutionMode()}. Source fit: ${_playbackTelemetry.sourceFit}.`;
}

function updateDim() {
  if (els.dim) els.dim.textContent = `${width}×${height}`;
  _updateHistoryControlBounds();
  _updateSourceInfoStatus();
}

function _syncCorruptContextUI() {
  const mode = els.corruptUpdateMode?.value || 'continuous';
  document.querySelectorAll('.strobe-only').forEach(el => {
    el.style.display = mode === 'strobe' ? '' : 'none';
  });
  document.querySelectorAll('.multigrab-only').forEach(el => {
    el.style.display = mode === 'multigrab' ? '' : 'none';
  });

  const clustered = !!els.clusterTiles?.checked;
  document.querySelectorAll('.cluster-only').forEach(el => {
    el.style.display = clustered ? '' : 'none';
  });
  document.querySelectorAll('.random-speed-only').forEach(el => {
    el.style.display = clustered ? 'none' : '';
  });
  document.querySelectorAll('.cluster-speed-only').forEach(el => {
    el.style.display = clustered ? '' : 'none';
  });
  if (els.clusterModeStatus) {
    els.clusterModeStatus.classList.remove('ready', 'warn');
    els.clusterModeStatus.textContent = clustered ? 'CLUSTER EVOLUTION ACTIVE' : 'RANDOM EVOLUTION ACTIVE';
    if (clustered) els.clusterModeStatus.classList.add('ready');
  }

  const stencilMask = els.corruptMaskMode?.value === 'stencil';
  document.querySelectorAll('.corrupt-stencil-only').forEach(el => {
    el.style.display = stencilMask ? '' : 'none';
  });

  if (els.glitchStrobeEvery) els.glitchStrobeEvery.disabled = mode !== 'strobe';
  if (els.corruptHoldFrames) els.corruptHoldFrames.disabled = mode !== 'multigrab';
  if (els.corruptLiveFrames) els.corruptLiveFrames.disabled = mode !== 'multigrab';

  const statusEl = els.corruptMaskStatus;
  if (statusEl) {
    statusEl.classList.remove('ready', 'warn');
    if (!stencilMask) {
      statusEl.textContent = 'FULL FRAME';
    } else {
      const status = window.getPipelineLumaStencilStatus?.();
      if (status?.ready) {
        statusEl.textContent = `STENCIL ${status.width || 0}×${status.height || 0}`;
        statusEl.classList.add('ready');
      } else {
        statusEl.textContent = 'CAPTURE IN LUMA KEY';
        statusEl.classList.add('warn');
      }
    }
  }
}

function updateLabels() {
  _syncCorruptRateFromLegacy();
  const f2  = v => (+v).toFixed(2);
  const pct = v => `${Math.round((+v) * 100)}%`;
  const set = (el, valEl, fmt) => { if (el && valEl) valEl.textContent = fmt(el.value); };

  _updateHistoryControlBounds();
  set(els.depth,            els.depthVal,            pct);
  set(els.corrupt,          els.corruptVal,          v => `${(+v).toFixed(2)}×`);
  set(els.corruptSpeed,     els.corruptSpeedVal,     v => `${(+v).toFixed(2)}×`);
  set(els.block,            els.blockVal,            v => `${Math.round(+v)} px`);
  if (els.corruptRateVal) els.corruptRateVal.textContent = `${_legacyCorruptEffectiveRate().toFixed(2)}×`;
  set(els.glitchSize,       els.glitchSizeVal,       v => `${(+v / 20).toFixed(2)}×`);
  set(els.glitchSmear,      els.glitchSmearVal,      v => String(Math.max(0, Math.trunc(+v || 0))));
  set(els.feedback,         els.feedbackVal,         f2);
  set(els.persistence,      els.persistenceVal,      f2);
  set(els.feedbackStrobeEvery, els.feedbackStrobeEveryVal, v => `${Math.max(1, Math.trunc(+v || 1))} fr`);
  set(els.feedbackRestore,  els.feedbackRestoreVal,  pct);
  set(els.clusterMasterSpeed, els.clusterMasterSpeedVal, v => `${(+v).toFixed(2)}×`);
  set(els.fbX,              els.fbXVal,              f2);
  set(els.fbY,              els.fbYVal,              f2);
  set(els.fbZ,              els.fbZVal,              f2);
  set(els.fbTheta,          els.fbThetaVal,          v => v);
  set(els.spatialGap,       els.spatialGapVal,       v => `${Math.round(+v)} px`);
  set(els.clusterCount,     els.clusterCountVal,     v => v);
  set(els.clusterRadius,    els.clusterRadiusVal,    v => v);
  set(els.cluCenters,       els.cluCentersVal,       v => String(Math.max(1, Math.trunc(+v || 1))));
  set(els.cluSpread,        els.cluSpreadVal,        v => `${Math.round(+v)} px`);
  set(els.cluDepth,         els.cluDepthVal,         pct);
  set(els.cluMinSpread,     els.cluMinSpreadVal,     v => `${Math.round(+v)} px`);
  set(els.cluBias,          els.cluBiasVal,          pct);
  set(els.cluDrift,         els.cluDriftVal,         f2);
  set(els.cluSpeed,         els.cluSpeedVal,         v => (+v).toFixed(1));
  set(els.cluSteer,         els.cluSteerVal,         f2);
  set(els.cluInertia,       els.cluInertiaVal,       pct);
  set(els.cluCohere,        els.cluCohereVal,        pct);
  set(els.cluMoveX,         els.cluMoveXVal,         v => `${Math.trunc(+v || 0)} px/s`);
  set(els.cluMoveY,         els.cluMoveYVal,         v => `${Math.trunc(+v || 0)} px/s`);
  set(els.cluMoveZ,         els.cluMoveZVal,         v => `${(+v).toFixed(2)} z/s`);
  set(els.flowStrength,     els.flowStrengthVal,     v => v);
  set(els.flowScale,        els.flowScaleVal,        v => v);
  set(els.flowPulse,        els.flowPulseVal,        v => (v|0));
  set(els.flowImpl,         els.flowImplVal,         f2);
  set(els.flowSpeed,        els.flowSpeedVal,        f2);
  set(els.flowSpread,       els.flowSpreadVal,       f2);
  set(els.flowTurb,         els.flowTurbVal,         f2);
  set(els.flowSwirl,        els.flowSwirlVal,        f2);
  set(els.glitchBaseX,      els.glitchBaseXVal,      v => `${Math.trunc(+v || 0)} px`);
  set(els.glitchBaseY,      els.glitchBaseYVal,      v => `${Math.trunc(+v || 0)} px`);
  set(els.glitchBaseZ,      els.glitchBaseZVal,      v => `${Math.round((+v || 0) * 100)}%`);
  set(els.corruptMoveX,     els.corruptMoveXVal,     v => `${Math.trunc(+v || 0)} px/s`);
  set(els.corruptMoveY,     els.corruptMoveYVal,     v => `${Math.trunc(+v || 0)} px/s`);
  set(els.corruptMoveZ,     els.corruptMoveZVal,     v => `${(+v).toFixed(2)} z/s`);
  set(els.glitchSpeedFine,  els.glitchSpeedFineVal,  f2);
  set(els.glitchSpeedMul,   els.glitchSpeedMulVal,   f2);
  set(els.glitchAlpha,      els.glitchAlphaVal,      pct);
  set(els.glitchJitter,     els.glitchJitterVal,     pct);
  set(els.glitchSmearAngle, els.glitchSmearAngleVal, v => Math.trunc(+v || 0) === 0 ? 'AUTO' : `${Math.trunc(+v)}°`);
  set(els.glitchStrobeEvery, els.glitchStrobeEveryVal, v => `${Math.max(1, Math.trunc(+v || 1))} fr`);
  set(els.corruptHoldFrames, els.corruptHoldFramesVal, v => `${Math.max(1, Math.trunc(+v || 1))} fr`);
  set(els.corruptLiveFrames, els.corruptLiveFramesVal, v => `${Math.max(1, Math.trunc(+v || 1))} fr`);
  set(els.corruptMaskThreshold, els.corruptMaskThresholdVal, v => String(Math.max(0, Math.min(255, Math.trunc(+v || 0)))));
  set(els.scanAlpha,        els.scanAlphaVal,        f2);
  set(els.scanShift,        els.scanShiftVal,        f2);
  set(els.scanDrift,        els.scanDriftVal,        f2);
  set(els.scanSpeed,        els.scanSpeedVal,        v => { const n=+v; return `${(n < 0.1 ? n.toFixed(3) : n.toFixed(2))}×`; });
  set(els.scanPlaceX,       els.scanPlaceXVal,       v => `${Math.trunc(+v || 0)} px`);
  set(els.scanPlaceY,       els.scanPlaceYVal,       v => `${Math.trunc(+v || 0)} px`);
  set(els.scanZoom,         els.scanZoomVal,         v => `${(+v).toFixed(2)}×`);
  set(els.scanMoveX,        els.scanMoveXVal,        v => `${Math.trunc(+v || 0)} px/s`);
  set(els.scanMoveY,        els.scanMoveYVal,        v => `${Math.trunc(+v || 0)} px/s`);
  set(els.scanMoveZ,        els.scanMoveZVal,        v => `${(+v).toFixed(2)}×/s`);
  set(els.scanFieldSpreadX, els.scanFieldSpreadXVal, pct);
  set(els.scanFieldSpreadY, els.scanFieldSpreadYVal, pct);
  set(els.scanFieldSpreadZ, els.scanFieldSpreadZVal, pct);
  set(els.scanFieldSizeVar, els.scanFieldSizeVarVal, pct);
  set(els.scanFieldDrift, els.scanFieldDriftVal, pct);
  set(els.scanFieldDepthDrift, els.scanFieldDepthDriftVal, pct);
  set(els.scanGap,          els.scanGapVal,          v => (v|0));
  set(els.scanSkew,         els.scanSkewVal,         f2);
  set(els.scanAngle,        els.scanAngleVal,        v => Math.round(v)+'°');
  set(els.scanFocus,        els.scanFocusVal,        f2);
  set(els.scanRoll,         els.scanRollVal,         f2);
  set(els.scanSpinSpeed,    els.scanSpinSpeedVal,    f2);
  set(els.depthScatter,     els.depthScatterVal,     pct);
  set(els.corruptDrift,     els.corruptDriftVal,     pct);
  set(els.symPos,           els.symPosVal,           f2);
  set(els.solarizeThresh,   els.solarizeThreshVal,   f2);
  set(els.solarizeLevel,    els.solarizeLevelVal,    v => `${Math.round(+v || 0)}%`);
  set(els.solarizeSoft,     els.solarizeSoftVal,     v => `${Math.round(+v || 0)}%`);
  set(els.solarizeAmt,      els.solarizeAmtVal,      f2);
  set(els.solarizeR,        els.solarizeRVal,        f2);
  set(els.solarizeG,        els.solarizeGVal,        f2);
  set(els.solarizeB,        els.solarizeBVal,        f2);
  set(els.cluSpeedVar,      els.cluSpeedVarVal,      pct);
  set(els.cluPulse,         els.cluPulseVal,         v => (+v).toFixed(1));
  set(els.cluBreathe,       els.cluBreatheVal,       pct);
  set(els.lumaKeyMix,       els.lumaKeyMixVal,       f2);
  set(els.layerPulseSpeed,  els.layerPulseSpeedVal,  v => (+v).toFixed(1));
  set(els.lumaKeyAB,        els.lumaKeyABVal,        f2);
  set(els.lumaKeyGain,      els.lumaKeyGainVal,      f2);
  set(els.lumaKeyCleanup,   els.lumaKeyCleanupVal,   f2);
  set(els.lumaKeyDensity,   els.lumaKeyDensityVal,   f2);
  set(els.globalMixAmt,     els.globalMixAmtVal,     f2);
  if (els.baseMix && els.baseMixVal) {
    els.baseMixVal.textContent = f2(els.baseMix.value);
    if (els.baseMix) els.baseMix.disabled = !els.baseOn?.checked;
  }
  _updateLumaStencilStatus();
  _syncCorruptContextUI();
}

function setSeedFromUI() {
  baseSeed = parseInt(els.seed?.value || '1', 10);
  if (isNaN(baseSeed)) baseSeed = 1;
  noiseSeed(baseSeed);
  window.invalidateScanlineCache?.();
}

// ─── file loading ─────────────────────────────────────────────────────────────

function onFile(ev) {
  const input = ev.target;
  const file  = input.files?.[0]; if (!file) return;
  queueMicrotask(() => { try { input.value = ''; } catch {} });

  // Preserve the stable Pass 12R decoder and scheduler. Only retire ownership
  // of the previous source and invalidate callbacks that may arrive later.
  const replacingSource = !!videoEl;
  _capabilityInstrumentation?.count('fileLoads');
  if (replacingSource) _capabilityInstrumentation?.count('sourceReplacements');
  _capabilityInstrumentation?.setSource('file-pending');
  const generation = _retireCurrentSource({ revokeBlob: true });
  enableTransport(false);
  const extMatch = String(file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  _playbackTelemetry.sourceName = String(file.name || '');
  _playbackTelemetry.sourceMime = String(file.type || '');
  _playbackTelemetry.sourceExt = extMatch ? extMatch[1] : '';
  _playbackTelemetry.sourceBytes = Math.max(0, Number(file.size) || 0);
  _playbackTelemetry.sourceFit = String(renderState.sourceFit || els.sourceFit?.value || 'stretch');
  _updateSourceInfoStatus();

  const knownContainers = new Set(['mp4','m4v','mov','webm']);
  if (_playbackTelemetry.sourceExt && !knownContainers.has(_playbackTelemetry.sourceExt)) {
    showToast(`.${_playbackTelemetry.sourceExt.toUpperCase()} is not in the Classic tested container set; decode depends on the system WebView`, false);
  }

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

  let primed = false;
  const sourceIsCurrent = () => _sourceIsCurrent(generation, v);

  const startPlayback = async () => {
    if (primed || !sourceIsCurrent()) return;
    // readyState >= 2 (HAVE_CURRENT_DATA) remains the proven HUFF Classic gate.
    if (v.readyState < 2 || v.videoWidth === 0) return;
    _clearSourceReadyPoller();
    primed = true;
    clearAll(); updateDim();
    try {
      blitVideoInto(gCur);
      _vfc++; // invalidate decoded-frame-dependent effect caches for the new source
    } catch {}

    _clearSourceGestureUnlock();
    try {
      await v.play();
    } catch {
      _installSourceGestureUnlock(v, generation);
    }
    // play() may resolve after another file or camera has replaced this source.
    if (!sourceIsCurrent()) return;
    _capabilityInstrumentation?.count('sourceReady');
    _capabilityInstrumentation?.setSource('file', v.videoWidth, v.videoHeight);
    _playbackTelemetry.sourceWidth = Math.max(0, Number(v.videoWidth) || 0);
    _playbackTelemetry.sourceHeight = Math.max(0, Number(v.videoHeight) || 0);
    _playbackTelemetry.processWidth = width;
    _playbackTelemetry.processHeight = height;
    _playbackTelemetry.rvfcSupported = typeof v.requestVideoFrameCallback === 'function';
    _updateSourceInfoStatus();
    if (_playbackTelemetry.sourceWidth > width || _playbackTelemetry.sourceHeight > height) {
      showToast(`Source ${_playbackTelemetry.sourceWidth}×${_playbackTelemetry.sourceHeight} → Classic ${width}×${height} processing`, false);
    }

    // #8: apply playback rate from UI
    const rateSelect = _$('playbackRate');
    try { v.playbackRate = rateSelect ? parseFloat(rateSelect.value) : 1.0; } catch {}

    // #9: apply loop state from UI (default on if no toggle exists)
    const loopToggle = _$('loopToggle');
    try { v.loop = loopToggle ? loopToggle.checked : true; } catch {}

    // Resume immediately when a scrubbed frame becomes available. Ignore a
    // late seeked event from any source that is no longer authoritative.
    v.addEventListener('seeked', () => {
      if (!sourceIsCurrent()) return;
      _seekPending = false;
      pumpVideoFrames();
      if (_wasPlaying && !seekBar?._dragging) {
        v.play().catch(() => {});
        playing     = true;
        _wasPlaying = false;
      }
    });

    playing = true;
    pumpVideoFrames();
    enableTransport(true);

    const volSlider = _$('volumeSlider');
    const vol = volSlider ? parseFloat(volSlider.value) : 1;
    try { v.volume = vol; v.muted = (vol === 0); } catch {}
  };

  v.addEventListener('canplay',        startPlayback, { once:true });
  v.addEventListener('canplaythrough', startPlayback, { once:true });
  v.addEventListener('loadeddata',     startPlayback, { once:true });

  let polls = 0;
  _sourceReadyPoller = setInterval(() => {
    if (!sourceIsCurrent()) {
      _clearSourceReadyPoller();
      return;
    }
    startPlayback();
    if (primed || ++polls > 40) _clearSourceReadyPoller();
  }, 100);

  v.addEventListener('error', () => {
    if (!sourceIsCurrent()) return;
    _capabilityInstrumentation?.count('sourceErrors');
    _capabilityInstrumentation?.setSource('file-error', v.videoWidth, v.videoHeight);
    _clearSourceReadyPoller();
    _clearSourceGestureUnlock();
    enableTransport(true);
    const code = v.error?.code ?? '?';
    const kind = _playbackTelemetry.sourceExt ? `.${_playbackTelemetry.sourceExt.toUpperCase()}` : (_playbackTelemetry.sourceMime || 'media');
    showToast(`Video decode error (code ${code}) for ${kind}. Classic recommends H.264/AAC MP4.`, true);
    console.error('[huff] video error', v.error);
  }, { once:true });

  v.load();
}

function enableTransport(en) {
  ['playBtn','pauseBtn','refreshBtn'].forEach(id => {
    const b = _$(id); if (b) b.disabled = !en;
  });
}

// ─── Pass 37 CORRUPT update-policy gate ──────────────────────────────────────
// Fairlight treats freeze/sample/strobe behavior as update policies applied to
// image memory. Magic DaVE's MultiGrab separates frozen time from live time.
// HUFF adapts those ideas only to the CORRUPT layer: the rest of the pipeline,
// Luma Key, Scanlines, Flow, playback, and outputs continue independently.
const _glitchStrobeGate = Object.seal({
  wasGlitchActive: false,
  lastMode: 'continuous',
  lastRate: 4,
  lastHold: 8,
  lastLive: 2,
  lastBucket: -1,
  lastCycle: -1,
  lastContinuousSpeed: 1,
  lastClustered: false,
  continuousAccumulator: 0,
  updates: 0,
  heldRenders: 0,
  resets: 0,
  lastResetReason: 'startup',
});
window.HUFF_GLITCH_STROBE_TELEMETRY = _glitchStrobeGate; // compatibility name
window.HUFF_CORRUPT_UPDATE_TELEMETRY = _glitchStrobeGate;

function _glitchStrobeRate(value) {
  const rate = Math.trunc(Number(value));
  return Number.isFinite(rate) ? Math.max(1, Math.min(30, rate)) : 4;
}

function _corruptFrameCount(value, fallback, max) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.max(1, Math.min(max, n)) : fallback;
}

function _resetGlitchStrobeGate(reason = 'reset') {
  _glitchStrobeGate.wasGlitchActive = false;
  _glitchStrobeGate.lastMode = 'continuous';
  _glitchStrobeGate.lastRate = 4;
  _glitchStrobeGate.lastHold = 8;
  _glitchStrobeGate.lastLive = 2;
  _glitchStrobeGate.lastBucket = -1;
  _glitchStrobeGate.lastCycle = -1;
  _glitchStrobeGate.lastContinuousSpeed = 1;
  _glitchStrobeGate.lastClustered = false;
  _glitchStrobeGate.continuousAccumulator = 0;
  _glitchStrobeGate.resets++;
  _glitchStrobeGate.lastResetReason = String(reason);
}

function _shouldApplyGlitchThisRender(state) {
  const gate = _glitchStrobeGate;
  const glitchActive = !!state.corruptOn;
  if (!glitchActive) {
    gate.wasGlitchActive = false;
    return false;
  }

  const mode = String(state.corruptUpdateMode || (state.glitchStrobe ? 'strobe' : 'continuous'));

  if (mode === 'continuous') {
    const clustered = !!state.clusterTiles;
    const rawSpeed = clustered ? Number(state.clusterMasterSpeed) : Number(state.corruptSpeed);
    const speed = Math.max(0, Math.min(4, Number.isFinite(rawSpeed) ? rawSpeed : 1));

    gate.wasGlitchActive = true;
    gate.lastMode = 'continuous';
    gate.lastBucket = -1;
    gate.lastCycle = -1;
    gate.lastClustered = clustered;
    gate.lastContinuousSpeed = speed;
    gate.continuousAccumulator = 0;

    // Pass 40W layering repair: CONTINUOUS describes layer presence, not a
    // sample/hold compositor gate. Corrupt is therefore redrawn every render so
    // SCAN TOP / CORRUPT TOP remain stable when both effects are active. SPEED
    // controls geometry, motion, cluster evolution, and historical-age choice.
    // At 0x the patch layout and chosen age stay fixed while the delayed video
    // inside those patches remains live. STROBE and MULTIGRAB remain the explicit
    // temporal hold/update policies.
    gate.updates++;
    return true;
  }

  if (mode === 'strobe') {
    gate.continuousAccumulator = 0;
    const rate = _glitchStrobeRate(state.glitchStrobeEvery);
    const bucket = Math.floor(Math.max(0, _vfc) / rate);
    const shouldUpdate =
      !gate.wasGlitchActive ||
      gate.lastMode !== 'strobe' ||
      gate.lastRate !== rate ||
      gate.lastBucket !== bucket;

    gate.wasGlitchActive = true;
    gate.lastMode = 'strobe';
    gate.lastRate = rate;

    if (shouldUpdate) {
      gate.lastBucket = bucket;
      gate.updates++;
      return true;
    }

    gate.heldRenders++;
    return false;
  }

  if (mode === 'multigrab') {
    gate.continuousAccumulator = 0;
    const hold = _corruptFrameCount(state.corruptHoldFrames, 8, 60);
    const live = _corruptFrameCount(state.corruptLiveFrames, 2, 30);
    const cycleLen = hold + live;
    const decoded = Math.max(0, _vfc);
    const cycle = Math.floor(decoded / cycleLen);
    const phase = decoded % cycleLen;
    const inLiveWindow = phase >= hold;
    const enteringMode = !gate.wasGlitchActive || gate.lastMode !== 'multigrab';
    const timingChanged = gate.lastHold !== hold || gate.lastLive !== live;

    gate.wasGlitchActive = true;
    gate.lastMode = 'multigrab';
    gate.lastHold = hold;
    gate.lastLive = live;
    gate.lastCycle = cycle;

    // Always render once when entering MULTIGRAB so the hold begins with a
    // visible Corrupt state instead of an empty/non-updated layer.
    if (enteringMode || timingChanged || inLiveWindow) {
      gate.updates++;
      return true;
    }

    gate.heldRenders++;
    return false;
  }

  // Unknown policy is deliberately safe: CONTINUOUS, never a silent freeze.
  gate.wasGlitchActive = true;
  gate.lastMode = 'continuous';
  gate.updates++;
  return true;
}

// ─── draw loop ────────────────────────────────────────────────────────────────

// ─── Pass 39M Feedback merge: transform-only strobe ─────────────────────────
// IMPORTANT: this gate never touches PERSISTENCE. The established Pass 38
// persistent-decay stage remains independent and executes at its original
// cadence. Only the existing snapshot/transform/redraw Feedback operation is
// optionally sampled by decoded-frame interval.
const _feedbackStrobeGate = Object.seal({
  wasActive: false,
  lastRate: 4,
  lastBucket: -1,
  updates: 0,
  heldRenders: 0,
  resets: 0,
  lastResetReason: 'startup',
});
window.HUFF_FEEDBACK_STROBE_TELEMETRY = _feedbackStrobeGate;

function _resetFeedbackStrobeGate(reason = 'reset') {
  _feedbackStrobeGate.wasActive = false;
  _feedbackStrobeGate.lastRate = 4;
  _feedbackStrobeGate.lastBucket = -1;
  _feedbackStrobeGate.resets++;
  _feedbackStrobeGate.lastResetReason = String(reason);
}

function _shouldApplyFeedbackTransformThisRender(state) {
  const gate = _feedbackStrobeGate;
  if (!state.feedbackStrobe) {
    gate.wasActive = false;
    gate.lastBucket = -1;
    gate.updates++;
    return true;
  }

  const rate = _glitchStrobeRate(state.feedbackStrobeEvery);
  const bucket = Math.floor(Math.max(0, _vfc) / rate);
  const shouldUpdate =
    !gate.wasActive ||
    gate.lastRate !== rate ||
    gate.lastBucket !== bucket;

  gate.wasActive = true;
  gate.lastRate = rate;
  if (shouldUpdate) {
    gate.lastBucket = bucket;
    gate.updates++;
    return true;
  }
  gate.heldRenders++;
  return false;
}

// ─── Draw-loop helpers ───────────────────────────────────────────────────────
// Defined once rather than recreated as closures on every render frame.
function _emitGlitchGroup(state, density, glitchPriority, lumaMix) {
  const lumaTarget = String(state.lumaKeyTarget || 'composite');
  const targetedCorruptLuma = !!state.lumaKeyOn && lumaMix > 0 && lumaTarget === 'corrupt';
  if (targetedCorruptLuma) {
    // Prime the bounded luminance source once before the Corrupt hot loop. Tile
    // sampling then stays CPU-local and adds no mask upload/full-resolution pass.
    window.preparePipelineLumaObjectSource?.(_vfc, state.lumaKeySource, state.lumaKeyAB, !!state.lumaKeyInvert, state.lumaKeyGain, state.lumaKeyCleanup, state.lumaKeyDensity, lumaMix);
  }

  const glitchUpdated = _shouldApplyGlitchThisRender(state);
  if (glitchUpdated) {
    applyGlitch(density, Math.trunc(state.glitchBaseX), Math.trunc(state.glitchBaseY), glitchPriority, state);
  }

  // COMPOSITE is the legacy Luma behavior. Targeted CORRUPT/SCAN modes do not
  // also paint the clean key patch, so a user can unambiguously choose which
  // front-stage effect the key is processing.
  if (state.lumaKeyOn && lumaMix > 0 && lumaTarget === 'composite') {
    applyPipelineLumaKey(
      state.lumaKeyAB, lumaMix, !!state.lumaKeyInvert, _vfc,
      state.lumaKeyGain, state.lumaKeySource, state.lumaKeyFade,
      state.lumaKeyCleanup, state.lumaKeyDensity,
    );
  }
}

function _emitGlobalMix(state) {
  if (!state.globalMixOn || state.globalMixAmt <= 0) return;
  const gCurEl = gCur.elt ?? gCur.drawingContext?.canvas;
  if (!gCurEl) return;
  const ctx = gBuf.drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = state.globalMixBlend || 'screen';
  ctx.globalAlpha = state.globalMixAmt;
  ctx.drawImage(gCurEl, 0, 0, gBuf.width, gBuf.height);
  ctx.restore();
}

function _paintMainBackground(bg) {
  if (_mainCtx) {
    _mainCtx.save();
    _mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    _mainCtx.globalAlpha = 1;
    _mainCtx.globalCompositeOperation = 'source-over';
    _mainCtx.fillStyle = bg === 'white' ? '#fff'
      : bg === 'green' ? '#00ff00'
      : bg === 'blue'  ? '#0000ff'
      : '#000';
    _mainCtx.fillRect(0, 0, width, height);
    _mainCtx.restore();
    return;
  }

  if      (bg === 'white') background(255);
  else if (bg === 'green') background(0, 255, 0);
  else if (bg === 'blue')  background(0, 0, 255);
  else                     background(0);
}

function _feedbackHasVisibleEffect(state) {
  const amount = state.feedback;
  if (!(amount > 0)) return false;

  // Feedback clears gBuf and redraws the snapshot with alpha clamped to one.
  // At full opacity with an identity transform, the result is pixel-for-pixel
  // the same buffer, so the full-resolution snapshot/clear/redraw is redundant.
  const angle = ((state.fbTheta % 360) + 360) % 360;
  const identityTransform =
    state.fbX === 0 &&
    state.fbY === 0 &&
    state.fbZ === 1 &&
    angle === 0;

  return amount < 1 || !identityTransform;
}

function _symmetryHasVisibleEffect(state) {
  if (!state.symOn) return false;
  const mode = state.symMode || 'v';
  const pos = state.symPos;
  const x0 = Math.max(0, Math.min(width, Math.round(width * pos)));
  const y0 = Math.max(0, Math.min(height, Math.round(height * pos)));

  const verticalChanges = (mode === 'v' || mode === 'hv') && x0 < width;
  const horizontalChanges = (mode === 'h' || mode === 'hv') && y0 < height;
  return verticalChanges || horizontalChanges;
}

function _solarizeHasVisibleEffect(state) {
  if (!state.solarizeOn) return false;

  const mode = String(state.solarizeMode || 'threshold');
  if (mode === 'luma-quantize') {
    // AMOUNT remains the shared wet/dry strength for both Solarize modes.
    if (state.solarizeAmt === 0) return false;
    const level = Math.max(0, Math.min(100, Number(state.solarizeLevel) || 0));
    const soft = Math.max(0, Math.min(100, Number(state.solarizeSoft) || 0));
    const invert = !!state.solarizeInvert;
    // LEVEL 0 is normal luminance; SOFT 100 restores unquantized luminance.
    // INVERT remains independently visible in either case.
    if (!invert && (level <= 0 || soft >= 100)) return false;
    return true;
  }

  // THRESHOLD is the exact accepted HUFF Classic Solarize path.
  // Threshold 1 maps to 255 and the effect uses a strict `lum > threshold`
  // comparison, so no possible pixel is modified.
  if (state.solarizeThresh >= 1) return false;

  // With zero inversion amount and unity channel multipliers, every lookup maps
  // each channel to itself. Avoid the synchronous readback entirely.
  return !(
    state.solarizeAmt === 0 &&
    state.solarizeR === 1 &&
    state.solarizeG === 1 &&
    state.solarizeB === 1
  );
}

const _frameActivity = Object.seal({
  glitch: false,
  scanlines: false,
  luma: false,
  globalMix: false,
  feedback: false,
  flow: false,
  symmetry: false,
  solarize: false,
  baseMix: false,
  any: false,
});

function _resolveFrameActivity(state) {
  const glitch = !!state.corruptOn;
  const scanlines =
    !!state.clusters &&
    Math.trunc(state.clusterCount) > 0 &&
    state.scanAlpha > 0;
  const lumaRequested = !!state.lumaKeyOn && state.lumaKeyMix > 0;
  const lumaTarget = String(state.lumaKeyTarget || 'composite');
  const luma = lumaRequested && (
    lumaTarget === 'composite' ||
    (lumaTarget === 'corrupt' && glitch) ||
    (lumaTarget === 'scan' && scanlines)
  );
  const globalMix = !!state.globalMixOn && state.globalMixAmt > 0;
  // FEEDBACK ENABLE bypasses only the transform/Restore layer. Keep the original
  // Feedback activity decision intact so PERSISTENCE remains on the established
  // persistent-buffer path rather than being accidentally tied to the new switch.
  const feedback = _feedbackHasVisibleEffect(state) || (state.feedbackEnabled !== false && (Number(state.feedbackRestore) || 0) > 0);
  const flow = !!state.flowOn && Math.trunc(state.flowStrength) > 0;
  const symmetry = _symmetryHasVisibleEffect(state);
  const solarize = _solarizeHasVisibleEffect(state);
  const baseMix = !!state.baseOn && state.baseMix > 0;

  const activity = _frameActivity;
  activity.glitch = glitch;
  activity.scanlines = scanlines;
  activity.luma = luma;
  activity.globalMix = globalMix;
  activity.feedback = feedback;
  activity.flow = flow;
  activity.symmetry = symmetry;
  activity.solarize = solarize;
  activity.baseMix = baseMix;
  activity.any =
    glitch || scanlines || luma || globalMix ||
    feedback || flow || symmetry || solarize;
  return activity;
}

function _syncBypassBuffer() {
  // Preserve the prior bypass-state contract: gBuf follows the clean source.
  // Decode-driven WebViews only need one copy per genuinely new video frame,
  // rather than repeating the same copy on every 60 Hz render tick.
  if (seededOnce && _bypassSyncedVfc === _vfc) return;
  if (_copyGraphicsFrame(gBuf, gCur)) {
    seededOnce = true;
    _bypassSyncedVfc = _vfc;
  }
}

function _presentCleanFrame(curCanvas) {
  if (_mainCtx && curCanvas) {
    _mainCtx.save();
    _mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    _mainCtx.globalAlpha = 1;
    _mainCtx.globalCompositeOperation = 'copy';
    _mainCtx.drawImage(curCanvas, 0, 0, width, height);
    _mainCtx.restore();
    return;
  }
  image(gCur, 0, 0, width, height);
}


// ─── Pass 30 validated serial recipe switching ─────────────────────────────
// CLASSIC is the exact Pass 22 route. CRISP FINISH moves only the existing
// Glitch/Luma/Scanline ordered group into the validated final-overlays zone.
// Both plans compile once and use the same three full-resolution buffers.
const _pipelineRuntime = window.HuffPipelineRuntime;
if (!_pipelineRuntime?.validation?.valid || !_pipelineRuntime?.recipeValidations) {
  throw new Error('[HUFF pipeline] validated serial recipe registry is unavailable');
}

const _pipelineFrame = Object.seal({
  state: null,
  bg: 'black',
  activity: null,
  density: 0,
  scanAngleArg: null,
  frontStageActive: false,
  layerPriority: 'scan',
  layerPulseSpeed: 2,
  renderFrame: 0,
  glitchPriority: 1,
  scanPriority: 1,
  lumaMix: 0,
  gmPos: 'after',
});

function _runSourceSyncStage() {
  _syncGCur();
}

function _runPersistentDecayStage(frame) {
  const pers = frame.state.persistence;
  if (pers < 1) {
    const ctx = gBuf.drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${(((1 - pers) * (20 - 1)) + 1) / 255})`;
    ctx.fillRect(0, 0, gBuf.width, gBuf.height);
    ctx.restore();
  }
}

function _runGlitchLumaFrontGroup(frame) {
  const activity = frame.activity;
  if (activity.glitch || activity.luma) {
    _emitGlitchGroup(frame.state, frame.density, frame.glitchPriority, frame.lumaMix);
  }
}

function _runScanlineFrontGroup(frame) {
  if (!frame.activity.scanlines) return;
  const s = frame.state;
  if (
    s.lumaKeyOn && frame.lumaMix > 0 &&
    String(s.lumaKeyTarget || 'composite') === 'scan'
  ) {
    // Prepare once before the panel loop. FIELD mode samples this bounded plane
    // per panel, avoiding the old COMPOSITE handoff and its mask upload.
    window.preparePipelineLumaObjectSource?.(_vfc, s.lumaKeySource, s.lumaKeyAB, !!s.lumaKeyInvert, s.lumaKeyGain, s.lumaKeyCleanup, s.lumaKeyDensity, frame.lumaMix);
  }
  applyScanlines(frame.density, frame.scanAngleArg, frame.scanPriority, s);
}

const _frontStageGroupHandlers = Object.freeze({
  'glitch-luma-group': _runGlitchLumaFrontGroup,
  'scanline-group': _runScanlineFrontGroup,
});

const _frontStagePriorityPlan = _pipelineRuntime.compileFrontStagePriority(
  _frontStageGroupHandlers,
);

function _runFrontStagePriority(frame) {
  if (!frame.frontStageActive) return;
  _frontStagePriorityPlan.execute(
    frame,
    frame.layerPriority,
    frame.layerPulseSpeed,
    frame.renderFrame,
  );
}

function _runGlobalMixStage(frame, step) {
  const activity = frame.activity;
  const gmPos = frame.gmPos;
  if (activity.globalMix && gmPos === step.conditionalPosition) {
    _emitGlobalMix(frame.state);
  }
}

function _runFeedbackStage(frame) {
  const activity = frame.activity;
  if (frame.state.feedbackEnabled === false || !activity.feedback) return;

  const s = frame.state;

  // Exact Pass 38 Feedback transform. The only new condition is the optional
  // transform-only strobe gate. With FB STROBE off this executes identically
  // to Pass 38; PERSISTENCE remains a separate, untouched pipeline stage.
  if (_feedbackHasVisibleEffect(s) && _shouldApplyFeedbackTransformThisRender(s)) {
    const fb = s.feedback;
    const fx = s.fbX;
    const fy = s.fbY;
    const fz = s.fbZ;
    const ft = (s.fbTheta * Math.PI) / 180;

    _copyGraphicsFrame(gScratch, gBuf);
    const feedbackSource = _graphicsCanvas(gScratch);

    const ctx = gBuf.drawingContext;
    ctx.save();
    ctx.clearRect(0, 0, gBuf.width, gBuf.height);
    ctx.globalAlpha = Math.min(1, fb);
    ctx.translate(gBuf.width / 2 + fx, gBuf.height / 2 + fy);
    ctx.rotate(ft);
    ctx.scale(fz, fz);
    ctx.drawImage(feedbackSource, -gBuf.width / 2, -gBuf.height / 2, gBuf.width, gBuf.height);
    ctx.restore();
  }

  // Optional Fairlight-inspired catch-up/restore experiment. It is additive,
  // defaults to zero, and does not alter FEEDBACK/PERSISTENCE semantics.
  // Restore remains live even while the Feedback transform itself is strobed.
  const restore = Math.max(0, Math.min(1, Number(s.feedbackRestore) || 0));
  if (restore > 0) {
    const clean = _graphicsCanvas(gCur);
    if (clean) {
      const ctx = gBuf.drawingContext;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = restore;
      ctx.drawImage(clean, 0, 0, gBuf.width, gBuf.height);
      ctx.restore();
    }
  }
}

function _runFlowStage(frame) {
  const activity = frame.activity;
  if (activity.flow) {
    const s = frame.state;
    applyFlowWarp(gBuf, gScratch, Math.trunc(s.flowStrength),
      Math.trunc(s.flowScale), Math.trunc(s.flowPulse), s.flowImpl, s.flowSpeed,
      s.flowTurb, s.flowSwirl, s.flowSpread);
    [gBuf, gScratch] = [gScratch, gBuf];
  }
}

function _runSymmetryStage(frame) {
  const activity = frame.activity;
  if (activity.symmetry) {
    const s = frame.state;
    applySymmetry(gBuf, gScratch, s.symMode || 'v', s.symPos);
    [gBuf, gScratch] = [gScratch, gBuf];
  }
}

function _runSolarizeStage(frame) {
  const activity = frame.activity;
  if (activity.solarize) {
    const s = frame.state;
    applySolarize(gBuf, s.solarizeThresh, s.solarizeAmt,
      s.solarizeR, s.solarizeG, s.solarizeB,
      s.solarizeMode || 'threshold', s.solarizeLevel, s.solarizeSoft, s.solarizeInvert);
  }
}

function _runPresentationStage(frame) {
  const s = frame.state;
  const activity = frame.activity;

  // Effects may leave transparent regions, so retain the selected background in
  // the active path. The clean bypass path is a full-frame opaque copy.
  _paintMainBackground(frame.bg);

  const curCanvas = _graphicsCanvas(gCur);
  const bufCanvas = _graphicsCanvas(gBuf);
  if (_mainCtx && curCanvas) {
    _mainCtx.save();
    _mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    _mainCtx.globalCompositeOperation = 'source-over';
    if (activity.baseMix) {
      _mainCtx.globalAlpha = s.baseMix;
      _mainCtx.drawImage(curCanvas, 0, 0, width, height);
    }
    if (bufCanvas) {
      _mainCtx.globalAlpha = 1;
      _mainCtx.drawImage(bufCanvas, 0, 0, width, height);
    }
    _mainCtx.restore();
  } else {
    if (activity.baseMix) {
      push();
      tint(255, s.baseMix * 255);
      image(gCur, 0, 0, width, height);
      pop();
    }
    image(gBuf, 0, 0, width, height);
  }
}

const _pipelineStageHandlers = Object.freeze({
  'source-sync': _runSourceSyncStage,
  'persistent-decay': _runPersistentDecayStage,
  'front-stage-priority': _runFrontStagePriority,
  'global-mix': _runGlobalMixStage,
  'feedback': _runFeedbackStage,
  'flow': _runFlowStage,
  'symmetry': _runSymmetryStage,
  'solarize': _runSolarizeStage,
  'presentation': _runPresentationStage,
});

const _pipelineRecipeRegistry = _pipelineRuntime.compileRecipeRegistry(
  _pipelineRuntime.PIPELINE_RECIPES,
  _pipelineStageHandlers,
);
const _pipelineRecipeSwitcher = _pipelineRuntime.createRecipeSwitcher(
  _pipelineRecipeRegistry,
  _pipelineRuntime.CLASSIC_RECIPE_ID,
);
window.HUFF_ACTIVE_PIPELINE_RECIPE = _pipelineRuntime.CLASSIC_RECIPE_ID;

function _finishCapabilityRender(startedAt, path) {
  if (!window.__huffProfilerActive || !startedAt) return;
  _capabilityInstrumentation?.sample('render', performance.now() - startedAt);
  _capabilityInstrumentation?.markRenderPath(path);
}

function draw() {
  const capabilityRenderStarted = window.__huffProfilerActive ? performance.now() : 0;
  _tickFPS();
  const s = renderState;
  const bg = s.bgMode || 'black';
  // Select exactly one precompiled plan before any stage executes. The same
  // immutable plan is then used for source, persistence, effects, and
  // presentation for the complete frame. Unknown IDs recover to CLASSIC.
  const pipelinePlan = _pipelineRecipeSwitcher.select(s.pipelineRecipe || 'classic');
  if (window.HUFF_ACTIVE_PIPELINE_RECIPE !== _pipelineRecipeSwitcher.activeId) {
    window.HUFF_ACTIVE_PIPELINE_RECIPE = _pipelineRecipeSwitcher.activeId;
  }

  if (!videoEl) {
    _paintMainBackground(bg);
    drawWaiting();
    _finishCapabilityRender(capabilityRenderStarted, 'waiting');
    return;
  }

  // Keep gCur current at 60fps only on WebViews without rVFC. Modern WebViews
  // update it once per genuinely decoded source frame in pumpVideoFrames().
  _pipelineFrame.state = s;
  _pipelineFrame.bg = bg;
  const sourceSyncStarted = window.__huffProfilerActive ? performance.now() : 0;
  pipelinePlan.executeSource(_pipelineFrame);
  if (sourceSyncStarted) {
    _capabilityInstrumentation?.sample('sourceSync', performance.now() - sourceSyncStarted);
  }

  // Preserve phase progression even when the corresponding stage is currently
  // neutral. Re-enabling an effect therefore resumes at the same temporal point
  // as the pre-optimization renderer.
  // FIELD RATE controls the internal corruption field. RANDOM SPEED owns the
  // RANDOM Corrupt clock; CLUSTER SPEED owns the CLUSTER Corrupt clock. Only the
  // active mode advances autonomous Corrupt phase/XYZ motion.
  // Hidden FINE/MULT aliases remain at 1 for
  // normal UI/preset use, but the exact legacy multiplication path stays alive
  // for old custom MIDI/OSC mappings that still target those stable IDs.
  const legacyMul = Number(s.glitchSpeedMul) || 0;
  const density = Math.max(0, (Number(s.glitchSpeed) || 0) * (Number(s.glitchSpeedFine) || 0) * legacyMul * legacyMul);
  const corruptSpeed = Math.max(0, Math.min(4, Number.isFinite(Number(s.corruptSpeed)) ? Number(s.corruptSpeed) : 1));
  const clusterMasterSpeed = Math.max(0, Math.min(4, Number.isFinite(Number(s.clusterMasterSpeed)) ? Number(s.clusterMasterSpeed) : 1));
  const clusteredCorrupt = !!s.clusterTiles;
  const activeCorruptSpeed = clusteredCorrupt ? clusterMasterSpeed : corruptSpeed;
  const corruptDt = Math.max(0, Math.min(0.05, (Number(deltaTime) || 16.6667) / 1000));
  _corruptMotion.dt = corruptDt;
  _corruptMotion.speed = activeCorruptSpeed;
  _corruptClock += activeCorruptSpeed * corruptDt * 60;
  _corruptMotion.timeSec = _corruptClock / 60;
  _corruptMotion.serial = Math.floor(_corruptClock);

  // Slow the *selection* of historical patch ages without removing the Corrupt
  // layer from the compositor. At 1x this follows decoded source frames; below
  // 1x the selected delay changes more slowly; at 0x it stays fixed. The source
  // video inside a fixed-delay patch remains live, matching Scan's stable-panel
  // behavior and avoiding the one-frame flash caused by the old render gate.
  if (_corruptSourceLastVfc < 0) {
    _corruptSourceLastVfc = _vfc;
    _corruptSourceClock = _vfc;
  } else if (_vfc !== _corruptSourceLastVfc) {
    const decodedDelta = Math.max(0, _vfc - _corruptSourceLastVfc);
    _corruptSourceClock += decodedDelta * activeCorruptSpeed;
    _corruptSourceLastVfc = _vfc;
  }
  _corruptMotion.sourceSerial = Math.floor(_corruptSourceClock);
  _corruptMotion.clusterSpeed = clusterMasterSpeed;
  if (clusteredCorrupt) _corruptMotion.clusterTimeSec += clusterMasterSpeed * corruptDt;
  nPhaseX += density * activeCorruptSpeed * 0.01;
  nPhaseY += density * activeCorruptSpeed * 0.011;

  if (s.corruptOn) {
    const moveX = Number(s.corruptMoveX) || 0;
    const moveY = Number(s.corruptMoveY) || 0;
    const moveZ = Number(s.corruptMoveZ) || 0;
    if (width > 0) _corruptMotion.x = ((_corruptMotion.x + moveX * activeCorruptSpeed * corruptDt) % width + width) % width;
    if (height > 0) _corruptMotion.y = ((_corruptMotion.y + moveY * activeCorruptSpeed * corruptDt) % height + height) % height;
    if (moveZ !== 0 && activeCorruptSpeed > 0) {
      let nz = _corruptMotion.z + moveZ * activeCorruptSpeed * corruptDt * _corruptMotion.zDir;
      while (nz > 1 || nz < -1) {
        if (nz > 1) { nz = 2 - nz; _corruptMotion.zDir *= -1; }
        if (nz < -1) { nz = -2 - nz; _corruptMotion.zDir *= -1; }
      }
      _corruptMotion.z = nz;
    }
  }

  // Pass 40S: one SPEED control owns Scanlines motion. It preserves the
  // established Pass 39N band generator at 1x, but 0x now means actual motion
  // stability: noise phases, roll, spin and added XYZ movement all stop while
  // applyScanlines() still writes live gCur pixels through the held geometry.
  const scanSpeed = Math.max(0, Number(s.scanSpeed) || 0);
  nPhaseScanX += scanSpeed * 0.008;
  nPhaseScanY += scanSpeed * 0.009;

  const scanDt = Math.max(0, Math.min(0.05, (Number(deltaTime) || 16.6667) / 1000));
  const scanMoveX = Number(s.scanMoveX) || 0;
  const scanMoveY = Number(s.scanMoveY) || 0;
  const scanMoveZ = Number(s.scanMoveZ) || 0;
  if (width > 0) {
    const spanX = width * 2;
    _scanSpatialMotion.x = (((_scanSpatialMotion.x + scanMoveX * scanSpeed * scanDt + width) % spanX) + spanX) % spanX - width;
  }
  if (height > 0) {
    const spanY = height * 2;
    _scanSpatialMotion.y = (((_scanSpatialMotion.y + scanMoveY * scanSpeed * scanDt + height) % spanY) + spanY) % spanY - height;
  }
  if (scanMoveZ !== 0 && scanSpeed > 0) {
    const baseZoom = Math.max(0.25, Math.min(4, Number.isFinite(Number(s.scanZoom)) ? Number(s.scanZoom) : 1));
    let nz = baseZoom + _scanSpatialMotion.zoomOffset + scanMoveZ * scanSpeed * scanDt * _scanSpatialMotion.zDir;
    while (nz > 4 || nz < 0.25) {
      if (nz > 4) { nz = 8 - nz; _scanSpatialMotion.zDir *= -1; }
      if (nz < 0.25) { nz = 0.5 - nz; _scanSpatialMotion.zDir *= -1; }
    }
    _scanSpatialMotion.zoomOffset = nz - baseZoom;
  }
  s.__scanMotionX = _scanSpatialMotion.x;
  s.__scanMotionY = _scanSpatialMotion.y;
  s.__scanMotionZoomOffset = _scanSpatialMotion.zoomOffset;

  // Left and right remain the established toggles. SPEED now scales their
  // automatic motion too, so SPEED=0 is a true stable spatial state.
  const spinSpeed = s.scanSpinSpeed;
  const spinLeft  = !!s.scanSpinLeft;
  const spinRight = !!s.scanSpinRight;
  let scanAngleArg = null;
  if (spinRight) {
    _scanSpinAngle = (_scanSpinAngle + spinSpeed * scanSpeed * 0.5) % 360;
    scanAngleArg   = _scanSpinAngle;
  } else if (spinLeft) {
    _scanSpinAngle = ((_scanSpinAngle - spinSpeed * scanSpeed * 0.5) % 360 + 360) % 360;
    scanAngleArg   = _scanSpinAngle;
  } else {
    _scanSpinAngle = s.scanAngle;
  }

  const activity = _resolveFrameActivity(s);

  // True bypass: direct clean presentation, no background fill, no persistent
  // decay, no effect dispatch, and no repeated gBuf copy for unchanged decoded
  // frames. gBuf still follows each new source frame for immediate re-entry.
  if (!activity.any) {
    _syncBypassBuffer();
    _renderWasBypassed = true;
    _presentCleanFrame(_graphicsCanvas(gCur));
    _finishCapabilityRender(capabilityRenderStarted, 'bypass');
    return;
  }

  // Entering the active pipeline from bypass starts from the current clean
  // decoded frame. During an active run, gBuf retains its persistent state.
  if (!seededOnce || _renderWasBypassed) {
    _copyGraphicsFrame(gBuf, gCur);
    seededOnce = true;
  }
  _renderWasBypassed = false;
  _bypassSyncedVfc = -1;

  if (activity.glitch) randomSeed(baseSeed + _corruptMotion.serial);

  _pipelineFrame.activity = activity;
  const activePipelineStarted = window.__huffProfilerActive ? performance.now() : 0;
  pipelinePlan.executePersistent(_pipelineFrame);

  // Paint order remains the exact Classic layer-priority model. The validated
  // priority plan resolves only the four modes already present in Pass 22.
  _pipelineFrame.frontStageActive = activity.scanlines || activity.glitch || activity.luma;
  _pipelineFrame.layerPriority = s.layerPriority || 'scan';
  _pipelineFrame.layerPulseSpeed = s.layerPulseSpeed;
  _pipelineFrame.renderFrame = frameCount;
  _pipelineFrame.density = density;
  _pipelineFrame.scanAngleArg = scanAngleArg;
  _pipelineFrame.glitchPriority = 1.0;
  _pipelineFrame.scanPriority = 1.0;
  _pipelineFrame.lumaMix = s.lumaKeyMix;
  _pipelineFrame.gmPos = s.globalMixPos || 'after';
  pipelinePlan.executeEffectsAndPresentation(_pipelineFrame);
  if (activePipelineStarted) {
    _capabilityInstrumentation?.sample('activePipeline', performance.now() - activePipelineStarted);
  }
  _finishCapabilityRender(capabilityRenderStarted, 'active');
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
  _capabilityInstrumentation?.count('cameraStops');
  _capabilityInstrumentation?.setSource('none');
  _retireCurrentSource({ revokeBlob: true });
  try { enableTransport(false); } catch {}
}

function startCamera(deviceId) {
  const replacingSource = !!videoEl;
  _capabilityInstrumentation?.count('cameraStarts');
  if (replacingSource) _capabilityInstrumentation?.count('sourceReplacements');
  _capabilityInstrumentation?.setSource('camera-pending');
  const generation = _retireCurrentSource({ revokeBlob: true });
  _playbackTelemetry.sourceName = 'Camera';
  _playbackTelemetry.sourceMime = 'video/camera';
  _playbackTelemetry.sourceExt = 'CAM';
  _playbackTelemetry.sourceFit = String(renderState.sourceFit || els.sourceFit?.value || 'stretch');
  _updateSourceInfoStatus();
  try { enableTransport(false); } catch {}

  const video = deviceId?.length
    ? { deviceId:{ exact:deviceId }, width:{ ideal:1920 }, height:{ ideal:1080 } }
    : { facingMode:{ ideal:'user'  }, width:{ ideal:1920 }, height:{ ideal:1080 } };
  try {
    let capture = null;
    capture = createCapture({ video, audio:false }, () => {
      const v = capture?.elt;
      // createCapture may finish after the user has selected a file, stopped
      // the camera, or requested another device. Retire that stale stream
      // immediately instead of allowing a second hidden capture to remain live.
      if (!v || generation !== _sourceGeneration || videoEl !== capture) {
        _capabilityInstrumentation?.count('staleCameraCompletions');
        try { v?.srcObject?.getTracks().forEach(track => track.stop()); } catch {}
        try { if (v?.srcObject) v.srcObject = null; } catch {}
        try { capture?.remove?.(); } catch {}
        return;
      }
      try { enableTransport(true); } catch {}
      listCameras();
      try { v.setAttribute('playsinline', ''); v.muted = true; } catch {}
      const kick = () => {
        if (generation !== _sourceGeneration || videoEl !== capture) return;
        try {
          _capabilityInstrumentation?.count('sourceReady');
          _capabilityInstrumentation?.setSource('camera', v.videoWidth, v.videoHeight);
          _playbackTelemetry.sourceWidth = Math.max(0, Number(v.videoWidth) || 0);
          _playbackTelemetry.sourceHeight = Math.max(0, Number(v.videoHeight) || 0);
          _playbackTelemetry.processWidth = width;
          _playbackTelemetry.processHeight = height;
          _playbackTelemetry.rvfcSupported = typeof v.requestVideoFrameCallback === 'function';
          _updateSourceInfoStatus();
          playing = true;
          v.play().catch(() => {});
          connectVideoAudio(v);
          pumpVideoFrames();
        } catch {}
      };
      if (v.readyState >= 1) kick();
      else v.addEventListener('loadedmetadata', kick, { once:true });
    });
    videoEl = capture;
    try { cloakVideo(videoEl); } catch {}
  } catch(e) {
    if (generation === _sourceGeneration) {
      _capabilityInstrumentation?.count('sourceErrors');
      _capabilityInstrumentation?.setSource('camera-error');
      _retireCurrentSource({ revokeBlob: true });
      console.warn('startCamera:', e);
      const msg = (e?.name === 'NotAllowedError') ? 'Camera permission denied'
                : (e?.name === 'NotFoundError')   ? 'No camera found'
                : `Camera error: ${e?.message ?? e}`;
      showToast(msg, true);
      try { enableTransport(false); } catch {}
    }
  }
}

function _shutdownMediaLifecycle() {
  if (_sourceShutdownComplete) return;
  _sourceShutdownComplete = true;
  _retireCurrentSource({ revokeBlob: true });
  try { _audioSrc?.disconnect?.(); } catch {}
  try { _gainNode?.disconnect?.(); } catch {}
  try { _audioCtx?.close?.(); } catch {}
  try { frameRing?.dispose?.(); } catch {}
  _audioSrc = null;
  _gainNode = null;
  _audioCtx = null;
}
window.addEventListener('pagehide', _shutdownMediaLifecycle, { once:true });
window.addEventListener('beforeunload', _shutdownMediaLifecycle, { once:true });


// ─── ws-mirror ────────────────────────────────────────────────────────────────
// Streams the canvas to canvas.html via a local WebSocket relay.
// JPEG scale/encode work is moved to a Worker + OffscreenCanvas when the WebView
// supports it. Pass 15 requests a bounded-size ImageBitmap before transferring it
// to the Worker, avoiding full-resolution bitmap transfer for large render canvases.
// Unsupported WebViews automatically retain the prior full-bitmap Worker path, and
// older WebViews retain the main-thread canvas.toBlob() fallback. All paths remain
// latest-frame-wins, receiver-aware, one-frame-in-flight, and independently paced.

(function() {
  const STREAM_MAX_W = 1280, STREAM_MAX_H = 1280;

  function setWSStatus(txt) { const el = _$('status'); if (el) el.textContent = txt; }

  let cachedRenderCanvas = null;
  function findCanvas() {
    if (cachedRenderCanvas?.isConnected) return cachedRenderCanvas;
    try {
      if (typeof canvas !== 'undefined' && canvas?.elt instanceof HTMLCanvasElement) {
        cachedRenderCanvas = canvas.elt;
        return cachedRenderCanvas;
      }
    } catch {}
    cachedRenderCanvas = document.querySelector('canvas') || null;
    return cachedRenderCanvas;
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
  const ttx = tcv.getContext('2d', { alpha:false, desynchronized:true });

  // Cache mirror output dimensions until the authoritative render canvas changes
  // size. This same rounding policy is used by Worker and fallback encoding paths.
  let _mirrorSourceW = 0, _mirrorSourceH = 0;
  let _mirrorTargetW = 1, _mirrorTargetH = 1;
  function mirrorTargetSize(cnv) {
    const sw = Math.max(1, cnv?.width | 0);
    const sh = Math.max(1, cnv?.height | 0);
    if (sw !== _mirrorSourceW || sh !== _mirrorSourceH) {
      const scale = Math.min(1, STREAM_MAX_W / sw, STREAM_MAX_H / sh);
      _mirrorSourceW = sw;
      _mirrorSourceH = sh;
      _mirrorTargetW = Math.max(1, Math.round(sw * scale));
      _mirrorTargetH = Math.max(1, Math.round(sh * scale));
    }
    return { width: _mirrorTargetW, height: _mirrorTargetH };
  }

  let ws = null, connected = false, fallbackBusy = false;
  let mirrorShutdown = false;
  let mirrorReceivers = 0;
  let relayFramePending = false;
  let _wsDelay = 1500;
  const WS_DELAY_MAX = 30000;
  let reconnectTimer = 0;
  let pumpRafId = 0;

  function clearReconnectTimer() {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }

  function scheduleReconnect() {
    if (mirrorShutdown || reconnectTimer) return;
    const delay = _wsDelay;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = 0;
      ensureWS();
    }, delay);
    _wsDelay = Math.min(_wsDelay * 2, WS_DELAY_MAX);
  }

  // ── Off-main-thread encoder ──────────────────────────────────────────────
  let encoderWorker = null;
  let workerReady = false;
  let workerBusy = false;
  let workerDisabled = false;
  // Optimistically use createImageBitmap resize options. A WebView that rejects
  // or ignores them is detected once and permanently falls back to the proven
  // full-size bitmap transfer path for the rest of the session.
  let resizedBitmapCapture = true;
  let resizedBitmapWarningShown = false;

  function disableWorker(reason) {
    if (workerDisabled) return;
    workerDisabled = true;
    workerReady = false;
    workerBusy = false;
    try { encoderWorker?.terminate(); } catch {}
    encoderWorker = null;
    if (reason) console.warn('[huff mirror] worker encoder disabled:', reason);
  }

  function initWorker() {
    if (workerDisabled || encoderWorker) return;
    if (typeof Worker !== 'function' || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
      disableWorker('Worker / ImageBitmap / OffscreenCanvas unsupported');
      return;
    }
    try {
      encoderWorker = new Worker('mirror-encoder-worker.js');
      encoderWorker.onmessage = (event) => {
        const msg = event.data || {};
        if (msg.type === 'ready') {
          workerReady = true;
          return;
        }
        if (msg.type === 'encoded') {
          workerBusy = false;
          if (window.__huffProfilerActive && Number.isFinite(msg.encodeMs)) {
            _profileCount('mirrorEncodeMs', msg.encodeMs);
            _profileCount('mirrorEncodeSamples');
          }
          if (!connected || mirrorReceivers <= 0 || !ws || ws.readyState !== WebSocket.OPEN) return;
          if (relayFramePending || ws.bufferedAmount > WS_MAX_BUFFERED) {
            _profileCount('mirrorDropped');
            return;
          }
          try {
            relayFramePending = true;
            ws.send(msg.buffer);
            _profileCount('mirrorSent');
          } catch {
            relayFramePending = false;
            _profileCount('mirrorDropped');
          }
          return;
        }
        if (msg.type === 'error') {
          workerBusy = false;
          disableWorker(msg.message || 'encoding failed');
        }
      };
      encoderWorker.onerror = (event) => {
        disableWorker(event?.message || 'worker error');
      };
    } catch (error) {
      disableWorker(error?.message || error);
    }
  }
  initWorker();

  function updateMirrorReceiverState(count) {
    mirrorReceivers = Math.max(0, Number(count) || 0);
    if (mirrorReceivers === 0) {
      relayFramePending = false;
      setWSStatus(connected ? 'WS: waiting for canvas' : 'WS: disconnected');
    } else {
      setWSStatus(`WS: streaming to ${mirrorReceivers} canvas${mirrorReceivers === 1 ? '' : 'es'}`);
    }
  }

  function ensureWS() {
    if (mirrorShutdown) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    clearReconnectTimer();
    ws = new WebSocket(wsUrl);
    window.__huffWS = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen  = () => {
      clearReconnectTimer();
      connected = true;
      relayFramePending = false;
      _wsDelay = 1500;
      setWSStatus('WS: waiting for canvas');
      try { ws.send(JSON.stringify({ type:'hello', role:'index' })); } catch {}
    };
    ws.onmessage = event => {
      if (typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'mirror-state') {
          updateMirrorReceiverState(message.receivers);
        } else if (message.type === 'mirror-ack') {
          relayFramePending = false;
          updateMirrorReceiverState(message.receivers);
        }
      } catch {}
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      connected = false;
      relayFramePending = false;
      mirrorReceivers = 0;
      setWSStatus('WS: disconnected');
      scheduleReconnect();
    };
  }
  ensureWS();

  // The mirror is an operator preview, not the canonical render clock. Pass 41A
  // fully decouples preview transport from temporal-history depth: changing
  // HISTORY cannot lower JPEG quality or alter preview cadence.
  const STREAM_FPS_CAP = 30;
  const STREAM_JPEG_Q = 0.97;
  const STREAM_PERIOD = 1000 / STREAM_FPS_CAP;
  function streamJpegQ() { return STREAM_JPEG_Q; }
  function targetPeriod() { return STREAM_PERIOD; }

  // Do not enqueue another encoded frame while the socket is backed up.
  const WS_MAX_BUFFERED = 1 << 19; // ~512KB

  async function captureMirrorBitmap(cnv, target) {
    const profile = window.__huffProfilerActive;
    const started = profile ? performance.now() : 0;
    const needsScale = cnv.width !== target.width || cnv.height !== target.height;
    let bitmap = null;

    if (needsScale && resizedBitmapCapture) {
      try {
        bitmap = await createImageBitmap(cnv, 0, 0, cnv.width, cnv.height, {
          resizeWidth: target.width,
          resizeHeight: target.height,
          resizeQuality: 'low',
        });
        // Some older implementations may accept but ignore resize options.
        if (bitmap.width !== target.width || bitmap.height !== target.height) {
          resizedBitmapCapture = false;
          if (!resizedBitmapWarningShown) {
            resizedBitmapWarningShown = true;
            console.warn('[huff mirror] resized ImageBitmap capture ignored; using legacy full-size transfer');
          }
          _profileCount('mirrorFullCaptures');
        } else {
          _profileCount('mirrorScaledCaptures');
        }
      } catch (error) {
        resizedBitmapCapture = false;
        if (!resizedBitmapWarningShown) {
          resizedBitmapWarningShown = true;
          console.warn('[huff mirror] resized ImageBitmap capture unsupported; using legacy full-size transfer:', error?.message || error);
        }
      }
    }

    if (!bitmap) {
      bitmap = await createImageBitmap(cnv);
      _profileCount('mirrorFullCaptures');
    } else if (!needsScale) {
      _profileCount('mirrorFullCaptures');
    }

    if (profile) {
      _profileCount('mirrorCaptureMs', performance.now() - started);
      _profileCount('mirrorCaptureSamples');
    }
    return bitmap;
  }

  async function sendViaWorker(cnv) {
    if (!workerReady || workerDisabled) return false;
    // Worker already owns a newer frame. Drop this tick instead of falling back
    // to a second main-thread encode in parallel.
    if (workerBusy) { _profileCount('mirrorDropped'); return true; }
    workerBusy = true;
    let bitmap = null;
    try {
      const target = mirrorTargetSize(cnv);
      bitmap = await captureMirrorBitmap(cnv, target);
      if (!connected || mirrorReceivers <= 0 || !ws || ws.readyState !== WebSocket.OPEN) {
        bitmap.close?.();
        workerBusy = false;
        return true;
      }
      if (relayFramePending || ws.bufferedAmount > WS_MAX_BUFFERED) {
        bitmap.close?.();
        workerBusy = false;
        _profileCount('mirrorDropped');
        return true;
      }
      encoderWorker.postMessage({
        type: 'frame',
        bitmap,
        width: target.width,
        height: target.height,
        quality: streamJpegQ(),
        profile: window.__huffProfilerActive,
      }, [bitmap]);
      return true;
    } catch (error) {
      try { bitmap?.close?.(); } catch {}
      workerBusy = false;
      disableWorker(error?.message || error);
      return false;
    }
  }

  async function sendFallback(cnv) {
    if (fallbackBusy) { _profileCount('mirrorDropped'); return; }
    fallbackBusy = true;
    try {
      const target = mirrorTargetSize(cnv);
      const tw = target.width, th = target.height;
      if (tcv.width !== tw || tcv.height !== th) { tcv.width = tw; tcv.height = th; }
      const profile = window.__huffProfilerActive;
      const captureStarted = profile ? performance.now() : 0;
      ttx.globalAlpha = 1;
      ttx.globalCompositeOperation = 'copy';
      if (cnv.width === tw && cnv.height === th) ttx.drawImage(cnv, 0, 0);
      else ttx.drawImage(cnv, 0, 0, tw, th);
      ttx.globalCompositeOperation = 'source-over';
      if (profile) {
        _profileCount('mirrorCaptureMs', performance.now() - captureStarted);
        _profileCount('mirrorCaptureSamples');
      }
      const q = streamJpegQ();
      const encodeStarted = profile ? performance.now() : 0;
      await new Promise(resolve => {
        tcv.toBlob(blob => {
          if (profile) {
            _profileCount('mirrorEncodeMs', performance.now() - encodeStarted);
            _profileCount('mirrorEncodeSamples');
          }
          try {
            if (blob && connected && mirrorReceivers > 0 && !relayFramePending && ws?.readyState === WebSocket.OPEN && ws.bufferedAmount <= WS_MAX_BUFFERED) {
              relayFramePending = true;
              try { ws.send(blob); _profileCount('mirrorSent'); }
              catch { relayFramePending = false; _profileCount('mirrorDropped'); }
            }
          } catch {}
          resolve();
        }, 'image/jpeg', q);
      });
    } finally {
      fallbackBusy = false;
    }
  }

  async function sendFrame(cnv) {
    if (!connected || mirrorReceivers <= 0 || relayFramePending || !ws || ws.readyState !== WebSocket.OPEN) {
      if (connected && mirrorReceivers > 0 && relayFramePending) _profileCount('mirrorDropped');
      return;
    }
    if (ws.bufferedAmount > WS_MAX_BUFFERED) {
      _profileCount('mirrorDropped');
      return;
    }
    if (workerReady && !workerDisabled) {
      const accepted = await sendViaWorker(cnv);
      if (accepted) return;
    }
    await sendFallback(cnv);
  }

  let last = 0;
  pumpRafId = requestAnimationFrame(function pump(ts) {
    if (mirrorShutdown) return;
    if (ts - last >= targetPeriod()) {
      last = ts;
      const c = findCanvas();
      if (c) sendFrame(c).catch(() => {});
    }
    pumpRafId = requestAnimationFrame(pump);
  });

  function shutdownMirror() {
    if (mirrorShutdown) return;
    mirrorShutdown = true;
    connected = false;
    mirrorReceivers = 0;
    relayFramePending = false;
    workerBusy = false;
    fallbackBusy = false;
    clearReconnectTimer();
    if (pumpRafId) {
      cancelAnimationFrame(pumpRafId);
      pumpRafId = 0;
    }
    document.removeEventListener('input', updateStreamTuning);
    document.removeEventListener('change', updateStreamTuning);
    if (encoderWorker) {
      try { encoderWorker.onmessage = encoderWorker.onerror = null; } catch {}
      try { encoderWorker.postMessage({ type:'release' }); } catch {}
      try { encoderWorker.terminate(); } catch {}
    }
    encoderWorker = null;
    if (ws) {
      try { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; } catch {}
      try { ws.close(); } catch {}
    }
    ws = null;
    cachedRenderCanvas = null;
    tcv.width = 1;
    tcv.height = 1;
  }
  window.addEventListener('pagehide', shutdownMirror, { once:true });
  window.addEventListener('beforeunload', shutdownMirror, { once:true });
})();

// ─── Performance profiler — toggle with the backtick ` key ────────────────────
// Measures the REAL per-frame cost of each effect on THIS machine with THIS
// footage, so optimization is driven by numbers, not guesses. Renders to a fixed
// DOM overlay (NOT the canvas), so it never reaches Syphon or the mirror feed.
// While hidden it costs one boolean check per wrapped call — safe to leave in.
(function () {
  let visible = false;

  // Top-level draw() calls only — NOT their internal Canvas2D tile blits, so
  // nothing is double-counted. _pushToRing runs on the
  // video-decode callback, so its number
  // is the ring-snapshot cost amortised across render frames.
  const NAMES = [
    '_syncGCur', '_pushToRing',
    'applyGlitch', 'applyPipelineLumaKey', 'applyScanlines',
    'applyFlowWarp', 'applySymmetry', 'applySolarize',
  ];
  const acc = Object.create(null);
  NAMES.forEach(function (n) { acc[n] = 0; });

  function wrap(name) {
    const fn = window[name];
    if (typeof fn !== 'function' || fn.__huffProf) return;
    const wrapped = function () {
      if (!visible) return fn.apply(this, arguments);   // zero measurement cost when hidden
      const t0 = performance.now();
      try { return fn.apply(this, arguments); }
      finally { acc[name] += performance.now() - t0; }
    };
    wrapped.__huffProf = true;
    window[name] = wrapped;
  }
  function wrapAll() { NAMES.forEach(wrap); }

  let overlay = null;
  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'top:8px', 'right:8px', 'z-index:99999',
      'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace',
      'color:#000', 'background:#D4D0C8', 'padding:8px 10px',
      'border:1px solid #404040', 'border-radius:4px', 'white-space:pre',
      'pointer-events:none', 'letter-spacing:0.3px'
    ].join(';');
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
  }

  function solarTelemetrySnapshot() {
    const t = window.__huffSolarizeTelemetry || {};
    return {
      readbackMs: t.readbackMs || 0,
      readbackSamples: t.readbackSamples || 0,
      transformMs: t.transformMs || 0,
      transformSamples: t.transformSamples || 0,
      uploadMs: t.uploadMs || 0,
      uploadSamples: t.uploadSamples || 0,
      presentMs: t.presentMs || 0,
      presentSamples: t.presentSamples || 0,
      processedFrames: t.processedFrames || 0,
      reusedFrames: t.reusedFrames || 0,
    };
  }

  function lumaTelemetrySnapshot() {
    const t = window.__huffLumaKeyTelemetry || {};
    return {
      readbackMs: t.readbackMs || 0,
      readbackSamples: t.readbackSamples || 0,
      sourceReuses: t.sourceReuses || 0,
      objectReadbackMs: t.objectReadbackMs || 0,
      objectReadbackSamples: t.objectReadbackSamples || 0,
      objectSourceReuses: t.objectSourceReuses || 0,
      objectSamples: t.objectSamples || 0,
      transformMs: t.transformMs || 0,
      transformSamples: t.transformSamples || 0,
      uploadMs: t.uploadMs || 0,
      uploadSamples: t.uploadSamples || 0,
      presentMs: t.presentMs || 0,
      presentSamples: t.presentSamples || 0,
      rebuiltFrames: t.rebuiltFrames || 0,
      reusedFrames: t.reusedFrames || 0,
      stencilCaptureMs: t.stencilCaptureMs || 0,
      stencilCaptureSamples: t.stencilCaptureSamples || 0,
      stencilCaptures: t.stencilCaptures || 0,
      stencilReuses: t.stencilReuses || 0,
    };
  }

  function glitchTelemetrySnapshot() {
    const t = window.__huffGlitchTelemetry || {};
    return {
      frames: t.frames || 0,
      tiles: t.tiles || 0,
      drawCalls: t.drawCalls || 0,
      ringRebuilds: t.ringRebuilds || 0,
      ringReuses: t.ringReuses || 0,
    };
  }

  function scanlineTelemetrySnapshot() {
    const t = window.__huffScanlineTelemetry || {};
    return {
      frames: t.frames || 0,
      bands: t.bands || 0,
      drawCalls: t.drawCalls || 0,
      geometryRebuilds: t.geometryRebuilds || 0,
      geometryReuses: t.geometryReuses || 0,
      bandRebuilds: t.bandRebuilds || 0,
      bandReuses: t.bandReuses || 0,
      directFrames: t.directFrames || 0,
      transformedFrames: t.transformedFrames || 0,
    };
  }

  function flowTelemetrySnapshot() {
    const t = window.__huffFlowTelemetry || {};
    return {
      frames: t.frames || 0,
      tiles: t.tiles || 0,
      drawCalls: t.drawCalls || 0,
      gridRebuilds: t.gridRebuilds || 0,
      gridReuses: t.gridReuses || 0,
      frequencyRebuilds: t.frequencyRebuilds || 0,
      frequencyReuses: t.frequencyReuses || 0,
      swirlRebuilds: t.swirlRebuilds || 0,
      swirlReuses: t.swirlReuses || 0,
    };
  }

  function syphonTelemetrySnapshot() {
    const t = window.__huffSyphonTelemetry || {};
    return {
      captureMs: t.captureMs || 0,
      captureSamples: t.captureSamples || 0,
      workerDrawMs: t.workerDrawMs || 0,
      workerReadMs: t.workerReadMs || 0,
      workerSamples: t.workerSamples || 0,
      endToEndMs: t.endToEndMs || 0,
      endToEndSamples: t.endToEndSamples || 0,
      nativeUploadMs: t.nativeUploadMs || 0,
      nativePublishMs: t.nativePublishMs || 0,
      nativeSamples: t.nativeSamples || 0,
      inFlightSkips: t.inFlightSkips || 0,
      bufferedSkips: t.bufferedSkips || 0,
      uiUpdates: t.uiUpdates || 0,
    };
  }

  function spoutTelemetrySnapshot() {
    const t = window.__huffSpoutTelemetry || {};
    return {
      drawMs: t.drawMs || 0,
      drawSamples: t.drawSamples || 0,
      readMs: t.readMs || 0,
      readSamples: t.readSamples || 0,
      sendMs: t.sendMs || 0,
      sendSamples: t.sendSamples || 0,
      sentFrames: t.sentFrames || 0,
      bufferedSkips: t.bufferedSkips || 0,
      socketMisses: t.socketMisses || 0,
      surfaceRebuilds: t.surfaceRebuilds || 0,
      statusPolls: t.statusPolls || 0,
      outputWidth: t.outputWidth || 0,
      outputHeight: t.outputHeight || 0,
      running: !!t.running,
    };
  }

  function capabilityTelemetrySnapshot() {
    return _capabilityInstrumentation?.snapshot?.() || {
      uptimeMs: 0, renderSamples: 0, renderMs: 0, renderMaxMs: 0,
      sourceSyncSamples: 0, sourceSyncMs: 0, sourceSyncMaxMs: 0,
      activePipelineSamples: 0, activePipelineMs: 0, activePipelineMaxMs: 0,
    };
  }

  function formatUptime(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  let frames = 0, lastReport = performance.now();
  let lastTelemetry = { ..._profileTelemetry };
  let lastSolarTelemetry = solarTelemetrySnapshot();
  let lastLumaTelemetry = lumaTelemetrySnapshot();
  let lastGlitchTelemetry = glitchTelemetrySnapshot();
  let lastScanlineTelemetry = scanlineTelemetrySnapshot();
  let lastFlowTelemetry = flowTelemetrySnapshot();
  let lastSyphonTelemetry = syphonTelemetrySnapshot();
  let lastSpoutTelemetry = spoutTelemetrySnapshot();
  let lastCapabilityTelemetry = capabilityTelemetrySnapshot();

  function report() {
    const now = performance.now();
    const dt  = now - lastReport;
    if (dt >= 500 && visible) {
      const f       = Math.max(1, frames);
      const frameMs = dt / f;
      const fps     = 1000 / frameMs;
      const decodedDelta = _profileTelemetry.decoded - lastTelemetry.decoded;
      const ringDelta = _profileTelemetry.ringCaptured - lastTelemetry.ringCaptured;
      const mirrorSentDelta = _profileTelemetry.mirrorSent - lastTelemetry.mirrorSent;
      const mirrorDroppedDelta = _profileTelemetry.mirrorDropped - lastTelemetry.mirrorDropped;
      const mirrorCaptureMsDelta = _profileTelemetry.mirrorCaptureMs - lastTelemetry.mirrorCaptureMs;
      const mirrorCaptureSamplesDelta = _profileTelemetry.mirrorCaptureSamples - lastTelemetry.mirrorCaptureSamples;
      const mirrorEncodeMsDelta = _profileTelemetry.mirrorEncodeMs - lastTelemetry.mirrorEncodeMs;
      const mirrorEncodeSamplesDelta = _profileTelemetry.mirrorEncodeSamples - lastTelemetry.mirrorEncodeSamples;
      const mirrorScaledDelta = _profileTelemetry.mirrorScaledCaptures - lastTelemetry.mirrorScaledCaptures;
      const mirrorFullDelta = _profileTelemetry.mirrorFullCaptures - lastTelemetry.mirrorFullCaptures;
      const mirrorCaptureAvg = mirrorCaptureSamplesDelta > 0 ? mirrorCaptureMsDelta / mirrorCaptureSamplesDelta : 0;
      const mirrorEncodeAvg = mirrorEncodeSamplesDelta > 0 ? mirrorEncodeMsDelta / mirrorEncodeSamplesDelta : 0;
      const solarNow = solarTelemetrySnapshot();
      const solarReadbackSamples = solarNow.readbackSamples - lastSolarTelemetry.readbackSamples;
      const solarTransformSamples = solarNow.transformSamples - lastSolarTelemetry.transformSamples;
      const solarUploadSamples = solarNow.uploadSamples - lastSolarTelemetry.uploadSamples;
      const solarPresentSamples = solarNow.presentSamples - lastSolarTelemetry.presentSamples;
      const solarReadbackAvg = solarReadbackSamples > 0
        ? (solarNow.readbackMs - lastSolarTelemetry.readbackMs) / solarReadbackSamples : 0;
      const solarTransformAvg = solarTransformSamples > 0
        ? (solarNow.transformMs - lastSolarTelemetry.transformMs) / solarTransformSamples : 0;
      const solarUploadAvg = solarUploadSamples > 0
        ? (solarNow.uploadMs - lastSolarTelemetry.uploadMs) / solarUploadSamples : 0;
      const solarPresentAvg = solarPresentSamples > 0
        ? (solarNow.presentMs - lastSolarTelemetry.presentMs) / solarPresentSamples : 0;
      const solarProcessedDelta = solarNow.processedFrames - lastSolarTelemetry.processedFrames;
      const solarReusedDelta = solarNow.reusedFrames - lastSolarTelemetry.reusedFrames;
      const lumaNow = lumaTelemetrySnapshot();
      const lumaReadbackSamples = lumaNow.readbackSamples - lastLumaTelemetry.readbackSamples;
      const lumaTransformSamples = lumaNow.transformSamples - lastLumaTelemetry.transformSamples;
      const lumaUploadSamples = lumaNow.uploadSamples - lastLumaTelemetry.uploadSamples;
      const lumaPresentSamples = lumaNow.presentSamples - lastLumaTelemetry.presentSamples;
      const lumaReadbackAvg = lumaReadbackSamples > 0
        ? (lumaNow.readbackMs - lastLumaTelemetry.readbackMs) / lumaReadbackSamples : 0;
      const lumaSourceReuseDelta = lumaNow.sourceReuses - lastLumaTelemetry.sourceReuses;
      const lumaObjectReadbackSamples = lumaNow.objectReadbackSamples - lastLumaTelemetry.objectReadbackSamples;
      const lumaObjectReadbackAvg = lumaObjectReadbackSamples > 0
        ? (lumaNow.objectReadbackMs - lastLumaTelemetry.objectReadbackMs) / lumaObjectReadbackSamples : 0;
      const lumaObjectSourceReuseDelta = lumaNow.objectSourceReuses - lastLumaTelemetry.objectSourceReuses;
      const lumaObjectSamplesDelta = lumaNow.objectSamples - lastLumaTelemetry.objectSamples;
      const lumaTransformAvg = lumaTransformSamples > 0
        ? (lumaNow.transformMs - lastLumaTelemetry.transformMs) / lumaTransformSamples : 0;
      const lumaUploadAvg = lumaUploadSamples > 0
        ? (lumaNow.uploadMs - lastLumaTelemetry.uploadMs) / lumaUploadSamples : 0;
      const lumaPresentAvg = lumaPresentSamples > 0
        ? (lumaNow.presentMs - lastLumaTelemetry.presentMs) / lumaPresentSamples : 0;
      const lumaRebuiltDelta = lumaNow.rebuiltFrames - lastLumaTelemetry.rebuiltFrames;
      const lumaReusedDelta = lumaNow.reusedFrames - lastLumaTelemetry.reusedFrames;
      const lumaStencilCaptureSamples = lumaNow.stencilCaptureSamples - lastLumaTelemetry.stencilCaptureSamples;
      const lumaStencilCaptureAvg = lumaStencilCaptureSamples > 0
        ? (lumaNow.stencilCaptureMs - lastLumaTelemetry.stencilCaptureMs) / lumaStencilCaptureSamples : 0;
      const lumaStencilCaptureDelta = lumaNow.stencilCaptures - lastLumaTelemetry.stencilCaptures;
      const lumaStencilReuseDelta = lumaNow.stencilReuses - lastLumaTelemetry.stencilReuses;
      const glitchNow = glitchTelemetrySnapshot();
      const glitchFramesDelta = glitchNow.frames - lastGlitchTelemetry.frames;
      const glitchTilesDelta = glitchNow.tiles - lastGlitchTelemetry.tiles;
      const glitchDrawCallsDelta = glitchNow.drawCalls - lastGlitchTelemetry.drawCalls;
      const glitchRingRebuildDelta = glitchNow.ringRebuilds - lastGlitchTelemetry.ringRebuilds;
      const glitchRingReuseDelta = glitchNow.ringReuses - lastGlitchTelemetry.ringReuses;
      const glitchTilesAvg = glitchFramesDelta > 0 ? glitchTilesDelta / glitchFramesDelta : 0;
      const glitchDrawCallsAvg = glitchFramesDelta > 0 ? glitchDrawCallsDelta / glitchFramesDelta : 0;
      const scanlineNow = scanlineTelemetrySnapshot();
      const scanlineFramesDelta = scanlineNow.frames - lastScanlineTelemetry.frames;
      const scanlineBandsDelta = scanlineNow.bands - lastScanlineTelemetry.bands;
      const scanlineDrawCallsDelta = scanlineNow.drawCalls - lastScanlineTelemetry.drawCalls;
      const scanlineGeometryRebuildDelta = scanlineNow.geometryRebuilds - lastScanlineTelemetry.geometryRebuilds;
      const scanlineGeometryReuseDelta = scanlineNow.geometryReuses - lastScanlineTelemetry.geometryReuses;
      const scanlineBandRebuildDelta = scanlineNow.bandRebuilds - lastScanlineTelemetry.bandRebuilds;
      const scanlineBandReuseDelta = scanlineNow.bandReuses - lastScanlineTelemetry.bandReuses;
      const scanlineDirectDelta = scanlineNow.directFrames - lastScanlineTelemetry.directFrames;
      const scanlineTransformedDelta = scanlineNow.transformedFrames - lastScanlineTelemetry.transformedFrames;
      const scanlineBandsAvg = scanlineFramesDelta > 0 ? scanlineBandsDelta / scanlineFramesDelta : 0;
      const scanlineDrawCallsAvg = scanlineFramesDelta > 0 ? scanlineDrawCallsDelta / scanlineFramesDelta : 0;
      const flowNow = flowTelemetrySnapshot();
      const flowFramesDelta = flowNow.frames - lastFlowTelemetry.frames;
      const flowTilesDelta = flowNow.tiles - lastFlowTelemetry.tiles;
      const flowDrawCallsDelta = flowNow.drawCalls - lastFlowTelemetry.drawCalls;
      const flowGridRebuildDelta = flowNow.gridRebuilds - lastFlowTelemetry.gridRebuilds;
      const flowGridReuseDelta = flowNow.gridReuses - lastFlowTelemetry.gridReuses;
      const flowFrequencyRebuildDelta = flowNow.frequencyRebuilds - lastFlowTelemetry.frequencyRebuilds;
      const flowFrequencyReuseDelta = flowNow.frequencyReuses - lastFlowTelemetry.frequencyReuses;
      const flowSwirlRebuildDelta = flowNow.swirlRebuilds - lastFlowTelemetry.swirlRebuilds;
      const flowSwirlReuseDelta = flowNow.swirlReuses - lastFlowTelemetry.swirlReuses;
      const flowTilesAvg = flowFramesDelta > 0 ? flowTilesDelta / flowFramesDelta : 0;
      const flowDrawCallsAvg = flowFramesDelta > 0 ? flowDrawCallsDelta / flowFramesDelta : 0;
      const syphonNow = syphonTelemetrySnapshot();
      const syphonCaptureSamples = syphonNow.captureSamples - lastSyphonTelemetry.captureSamples;
      const syphonWorkerSamples = syphonNow.workerSamples - lastSyphonTelemetry.workerSamples;
      const syphonEndToEndSamples = syphonNow.endToEndSamples - lastSyphonTelemetry.endToEndSamples;
      const syphonNativeSamples = syphonNow.nativeSamples - lastSyphonTelemetry.nativeSamples;
      const syphonCaptureAvg = syphonCaptureSamples > 0
        ? (syphonNow.captureMs - lastSyphonTelemetry.captureMs) / syphonCaptureSamples : 0;
      const syphonWorkerDrawAvg = syphonWorkerSamples > 0
        ? (syphonNow.workerDrawMs - lastSyphonTelemetry.workerDrawMs) / syphonWorkerSamples : 0;
      const syphonWorkerReadAvg = syphonWorkerSamples > 0
        ? (syphonNow.workerReadMs - lastSyphonTelemetry.workerReadMs) / syphonWorkerSamples : 0;
      const syphonEndToEndAvg = syphonEndToEndSamples > 0
        ? (syphonNow.endToEndMs - lastSyphonTelemetry.endToEndMs) / syphonEndToEndSamples : 0;
      const syphonNativeUploadAvg = syphonNativeSamples > 0
        ? (syphonNow.nativeUploadMs - lastSyphonTelemetry.nativeUploadMs) / syphonNativeSamples : 0;
      const syphonNativePublishAvg = syphonNativeSamples > 0
        ? (syphonNow.nativePublishMs - lastSyphonTelemetry.nativePublishMs) / syphonNativeSamples : 0;
      const syphonInFlightSkips = syphonNow.inFlightSkips - lastSyphonTelemetry.inFlightSkips;
      const syphonBufferedSkips = syphonNow.bufferedSkips - lastSyphonTelemetry.bufferedSkips;
      const syphonUiUpdates = syphonNow.uiUpdates - lastSyphonTelemetry.uiUpdates;
      const spoutNow = spoutTelemetrySnapshot();
      const spoutDrawSamples = spoutNow.drawSamples - lastSpoutTelemetry.drawSamples;
      const spoutReadSamples = spoutNow.readSamples - lastSpoutTelemetry.readSamples;
      const spoutSendSamples = spoutNow.sendSamples - lastSpoutTelemetry.sendSamples;
      const spoutDrawAvg = spoutDrawSamples > 0
        ? (spoutNow.drawMs - lastSpoutTelemetry.drawMs) / spoutDrawSamples : 0;
      const spoutReadAvg = spoutReadSamples > 0
        ? (spoutNow.readMs - lastSpoutTelemetry.readMs) / spoutReadSamples : 0;
      const spoutSendAvg = spoutSendSamples > 0
        ? (spoutNow.sendMs - lastSpoutTelemetry.sendMs) / spoutSendSamples : 0;
      const spoutSentDelta = spoutNow.sentFrames - lastSpoutTelemetry.sentFrames;
      const spoutBufferedDelta = spoutNow.bufferedSkips - lastSpoutTelemetry.bufferedSkips;
      const spoutSocketMissDelta = spoutNow.socketMisses - lastSpoutTelemetry.socketMisses;
      const capabilityNow = capabilityTelemetrySnapshot();
      const capabilityRenderSamples = capabilityNow.renderSamples - lastCapabilityTelemetry.renderSamples;
      const capabilitySourceSamples = capabilityNow.sourceSyncSamples - lastCapabilityTelemetry.sourceSyncSamples;
      const capabilityPipelineSamples = capabilityNow.activePipelineSamples - lastCapabilityTelemetry.activePipelineSamples;
      const capabilityRenderAvg = capabilityRenderSamples > 0
        ? (capabilityNow.renderMs - lastCapabilityTelemetry.renderMs) / capabilityRenderSamples : 0;
      const capabilitySourceAvg = capabilitySourceSamples > 0
        ? (capabilityNow.sourceSyncMs - lastCapabilityTelemetry.sourceSyncMs) / capabilitySourceSamples : 0;
      const capabilityPipelineAvg = capabilityPipelineSamples > 0
        ? (capabilityNow.activePipelineMs - lastCapabilityTelemetry.activePipelineMs) / capabilityPipelineSamples : 0;
      const targetProfile = _capabilityInstrumentation?.closestProfile?.(width, height, fps);
      const heapMiB = capabilityNow.heapUsedBytes > 0 ? capabilityNow.heapUsedBytes / 1048576 : 0;
      const decodeFps = decodedDelta * 1000 / dt;
      const ringFps = ringDelta * 1000 / dt;
      const sourceW = _playbackTelemetry.sourceWidth || capabilityNow.lastSourceWidth || 0;
      const sourceH = _playbackTelemetry.sourceHeight || capabilityNow.lastSourceHeight || 0;
      const scaleX = sourceW > 0 ? width / sourceW : 0;
      const scaleY = sourceH > 0 ? height / sourceH : 0;
      const decodeProcAvg = _playbackTelemetry.processingDurationSamples > 0
        ? _playbackTelemetry.processingDurationMsTotal / _playbackTelemetry.processingDurationSamples : 0;
      let droppedVideoFrames = 0, totalVideoFrames = 0;
      try {
        const quality = videoEl?.elt?.getVideoPlaybackQuality?.();
        droppedVideoFrames = Math.max(0, Number(quality?.droppedVideoFrames) || 0);
        totalVideoFrames = Math.max(0, Number(quality?.totalVideoFrames) || 0);
      } catch {}
      const rows = NAMES.map(function (n) { return [n, acc[n] / f]; })
                        .filter(function (r) { return r[1] > 0.005; })
                        .sort(function (a, b) { return b[1] - a[1]; });
      let measured = 0; rows.forEach(function (r) { measured += r[1]; });
      const fmt = function (n, ms) {
        return n.replace(/^apply|^_/, '').padEnd(13) + ms.toFixed(2).padStart(6) + ' ms';
      };
      ensureOverlay();
      overlay.textContent =
        'HUFF PROFILER  (toggle: ` )\n' +
        'fps        ' + fps.toFixed(1).padStart(6) + '\n' +
        'frame      ' + frameMs.toFixed(2).padStart(6) + ' ms\n' +
        'profile    ' + String(targetProfile?.id || 'custom').padStart(6) + '\n' +
        'uptime     ' + formatUptime(capabilityNow.uptimeMs).padStart(8) + '\n' +
        'render     ' + capabilityRenderAvg.toFixed(2).padStart(6) + ' ms avg\n' +
        'render max ' + capabilityNow.renderMaxMs.toFixed(2).padStart(6) + ' ms\n' +
        'src sync   ' + capabilitySourceAvg.toFixed(2).padStart(6) + ' ms\n' +
        'pipeline   ' + capabilityPipelineAvg.toFixed(2).padStart(6) + ' ms\n' +
        'paths      ' + `${capabilityNow.renderWaitingSamples}/${capabilityNow.renderBypassSamples}/${capabilityNow.renderActiveSamples}`.padStart(11) + ' wait/bypass/active\n' +
        'source     ' + `${capabilityNow.lastSourceKind || 'none'} ${sourceW}×${sourceH}`.padStart(18) + '\n' +
        'process    ' + `${width}×${height}`.padStart(18) + ' Classic max\n' +
        'src fit    ' + String(_playbackTelemetry.sourceFit || 'stretch').padStart(18) + '\n' +
        (sourceW > 0 && sourceH > 0 ? 'src scale  ' + `${scaleX.toFixed(3)}×/${scaleY.toFixed(3)}×`.padStart(18) + ' x/y\n' : '') +
        'rvfc       ' + String(_playbackTelemetry.rvfcSupported ? 'yes' : 'fallback').padStart(18) + '\n' +
        'presented  ' + String(_playbackTelemetry.presentedFrames || 0).padStart(18) + '\n' +
        'rvfc gaps  ' + String(_playbackTelemetry.missedPresentedFrames || 0).padStart(18) + '\n' +
        'video drop ' + `${droppedVideoFrames}/${totalVideoFrames}`.padStart(18) + ' dropped/total\n' +
        'dec proc   ' + decodeProcAvg.toFixed(2).padStart(6) + ' ms avg / ' + _playbackTelemetry.processingDurationMaxMs.toFixed(2) + ' max\n' +
        'media time ' + (_playbackTelemetry.mediaTime || 0).toFixed(3).padStart(18) + ' s\n' +
        'src life   ' + `${capabilityNow.sourceReplacements}/${capabilityNow.sourceReady}/${capabilityNow.sourceErrors}`.padStart(11) + ' replace/ready/error\n' +
        'resize     ' + `${capabilityNow.resizeRequests}/${capabilityNow.resizeCommits}`.padStart(6) + ' request/commit\n' +
        'buffers    ' + `${capabilityNow.bufferAllocationPasses}/${capabilityNow.bufferDimensionChanges}`.padStart(6) + ' alloc/resize\n' +
        (heapMiB > 0 ? 'heap MiB   ' + heapMiB.toFixed(1).padStart(6) + '\n' : '') +
        'decode     ' + decodeFps.toFixed(1).padStart(6) + ' fps\n' +
        'ring       ' + ringFps.toFixed(1).padStart(6) + ' fps\n' +
        'ring mem   ' + `${frameRing.allocatedSlots}/${frameRing.capacity}`.padStart(6) + ' slots\n' +
        'ring MiB   ' + (frameRing.estimatedBytes / 1048576).toFixed(1).padStart(6) + '\n' +
        'mirror     ' + `${mirrorSentDelta}/${mirrorDroppedDelta}`.padStart(6) + ' sent/drop\n' +
        'mir cap    ' + mirrorCaptureAvg.toFixed(2).padStart(6) + ' ms\n' +
        'mir enc    ' + mirrorEncodeAvg.toFixed(2).padStart(6) + ' ms\n' +
        'mir stage  ' + `${mirrorScaledDelta}/${mirrorFullDelta}`.padStart(6) + ' scaled/full\n' +
        'sy cap     ' + syphonCaptureAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sy draw    ' + syphonWorkerDrawAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sy read    ' + syphonWorkerReadAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sy pipe    ' + syphonEndToEndAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sy upload  ' + syphonNativeUploadAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sy publish ' + syphonNativePublishAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sy skips   ' + `${syphonInFlightSkips}/${syphonBufferedSkips}`.padStart(6) + ' flight/buffer\n' +
        'sy ui      ' + syphonUiUpdates.toFixed(0).padStart(6) + ' updates\n' +
        'sp draw    ' + spoutDrawAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sp read    ' + spoutReadAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sp send    ' + spoutSendAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sp frames  ' + `${spoutSentDelta}/${spoutBufferedDelta}`.padStart(6) + ' sent/skip\n' +
        'sp socket  ' + spoutSocketMissDelta.toFixed(0).padStart(6) + ' misses\n' +
        'sol read   ' + solarReadbackAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sol xform  ' + solarTransformAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sol upload ' + solarUploadAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sol present' + solarPresentAvg.toFixed(2).padStart(6) + ' ms\n' +
        'sol cache  ' + `${solarProcessedDelta}/${solarReusedDelta}`.padStart(6) + ' process/reuse\n' +
        'luma read  ' + lumaReadbackAvg.toFixed(2).padStart(6) + ' ms\n' +
        'luma src   ' + `${lumaReadbackSamples}/${lumaSourceReuseDelta}`.padStart(6) + ' read/reuse\n' +
        'luma obj rd' + lumaObjectReadbackAvg.toFixed(2).padStart(6) + ' ms\n' +
        'luma obj   ' + `${lumaObjectReadbackSamples}/${lumaObjectSourceReuseDelta}/${lumaObjectSamplesDelta}`.padStart(10) + ' read/reuse/sample\n' +
        'luma xform ' + lumaTransformAvg.toFixed(2).padStart(6) + ' ms\n' +
        'luma upload' + lumaUploadAvg.toFixed(2).padStart(6) + ' ms\n' +
        'luma pres  ' + lumaPresentAvg.toFixed(2).padStart(6) + ' ms\n' +
        'luma cache ' + `${lumaRebuiltDelta}/${lumaReusedDelta}`.padStart(6) + ' rebuild/reuse\n' +
        'luma stenc ' + lumaStencilCaptureAvg.toFixed(2).padStart(6) + ' ms capture\n' +
        'stencil    ' + `${lumaStencilCaptureDelta}/${lumaStencilReuseDelta}`.padStart(6) + ' capture/reuse\n' +
        'gl tiles   ' + glitchTilesAvg.toFixed(0).padStart(6) + ' / frame\n' +
        'gl draws   ' + glitchDrawCallsAvg.toFixed(0).padStart(6) + ' / frame\n' +
        'gl ring    ' + `${glitchRingRebuildDelta}/${glitchRingReuseDelta}`.padStart(6) + ' rebuild/reuse\n' +
        'scan bands ' + scanlineBandsAvg.toFixed(0).padStart(6) + ' / frame\n' +
        'scan draws ' + scanlineDrawCallsAvg.toFixed(0).padStart(6) + ' / frame\n' +
        'scan geom  ' + `${scanlineGeometryRebuildDelta}/${scanlineGeometryReuseDelta}`.padStart(6) + ' rebuild/reuse\n' +
        'scan prep  ' + `${scanlineBandRebuildDelta}/${scanlineBandReuseDelta}`.padStart(6) + ' rebuild/reuse\n' +
        'scan path  ' + `${scanlineDirectDelta}/${scanlineTransformedDelta}`.padStart(6) + ' direct/xform\n' +
        'flow tiles ' + flowTilesAvg.toFixed(0).padStart(6) + ' / frame\n' +
        'flow draws ' + flowDrawCallsAvg.toFixed(0).padStart(6) + ' / frame\n' +
        'flow grid  ' + `${flowGridRebuildDelta}/${flowGridReuseDelta}`.padStart(6) + ' rebuild/reuse\n' +
        'flow freq  ' + `${flowFrequencyRebuildDelta}/${flowFrequencyReuseDelta}`.padStart(6) + ' rebuild/reuse\n' +
        'flow swirl ' + `${flowSwirlRebuildDelta}/${flowSwirlReuseDelta}`.padStart(6) + ' rebuild/reuse\n' +
        '──────────────────────\n' +
        (rows.length ? rows.map(function (r) { return fmt(r[0], r[1]); }).join('\n')
                     : '(no effects active)') + '\n' +
        '──────────────────────\n' +
        fmt('effects', measured) + '\n' +
        fmt('other',   Math.max(0, frameMs - measured));
    }
    if (dt >= 500) {
      NAMES.forEach(function (n) { acc[n] = 0; });
      frames = 0;
      lastReport = now;
      lastTelemetry = { ..._profileTelemetry };
      lastSolarTelemetry = solarTelemetrySnapshot();
      lastLumaTelemetry = lumaTelemetrySnapshot();
      lastGlitchTelemetry = glitchTelemetrySnapshot();
      lastScanlineTelemetry = scanlineTelemetrySnapshot();
      lastFlowTelemetry = flowTelemetrySnapshot();
      lastSyphonTelemetry = syphonTelemetrySnapshot();
      lastSpoutTelemetry = spoutTelemetrySnapshot();
      lastCapabilityTelemetry = capabilityTelemetrySnapshot();
    }
  }

  function loop() { frames++; report(); requestAnimationFrame(loop); }

  function toggle() {
    visible = !visible;
    window.__huffProfilerActive = visible;
    if (visible) _capabilityInstrumentation?.beginProfilerSession?.();
    ensureOverlay();
    overlay.style.display = visible ? 'block' : 'none';
    NAMES.forEach(function (n) { acc[n] = 0; });
    frames = 0;
    lastReport = performance.now();
    lastTelemetry = { ..._profileTelemetry };
    lastSolarTelemetry = solarTelemetrySnapshot();
    lastLumaTelemetry = lumaTelemetrySnapshot();
    lastGlitchTelemetry = glitchTelemetrySnapshot();
    lastScanlineTelemetry = scanlineTelemetrySnapshot();
    lastFlowTelemetry = flowTelemetrySnapshot();
    lastSyphonTelemetry = syphonTelemetrySnapshot();
    lastSpoutTelemetry = spoutTelemetrySnapshot();
    lastCapabilityTelemetry = capabilityTelemetrySnapshot();
    if (!visible) overlay.textContent = '';
  }

  window.addEventListener('keydown', function (e) {
    if (e.key !== '`' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    toggle();
  });

  if (document.readyState === 'complete') wrapAll();
  window.addEventListener('load', wrapAll);
  setTimeout(wrapAll, 0);
  requestAnimationFrame(loop);
})();
