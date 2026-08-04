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
  const generation = ++_sourceGeneration;
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
};
window.__huffProfilerActive = false;
function _profileCount(name, amount = 1) {
  if (!window.__huffProfilerActive) return;
  _profileTelemetry[name] = (_profileTelemetry[name] || 0) + amount;
}
let gCur, gBuf, gScratch;
let canvas, _mainCanvasEl = null, _mainCtx = null;
let playing = false;
let _wasPlaying  = false; // whether video was playing when a scrub started
let _seekPending = false; // whether a seek is still in flight when drag ends

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
let nPhaseScanX = 0, nPhaseScanY = 2000; // independent scanline phase
let _scanSpinAngle = 0;                   // continuous spin accumulator (degrees)

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
    return true;
  }

  fromEnd(n) {
    if (n < 0 || n >= this._size) return null;
    return this._buf[(this._head - 1 - n + this._cap * 2) % this._cap]?.canvas ?? null;
  }

  resize(newCap) {
    newCap = Math.max(4, newCap);
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
  'flowOn','flowStrength','flowScale','flowPulse','flowImpl','flowSpeed','flowTurb','flowSwirl','flowSpread',
  'baseOn','baseMix','seedOnLoad',
  'symOn','symMode','symPos',
  'solarizeOn','solarizeThresh','solarizeAmt','solarizeR','solarizeG','solarizeB',
  'scanAlpha','scanShift','scanDrift','scanSpeed','scanGap','scanSkew',
  'scanAngle','scanFocus','scanRoll',
  'scanSpinLeft','scanSpinRight','scanSpinSpeed',
  'bgMode',
  'cluSpeedVar','cluPulse',
  'cluSteer','cluBreathe','cluBounds','cluCohere',
  'layerPriority','layerPulseSpeed',
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
  try { _copyFullFrame(target.drawingContext, source, target.width, target.height); } catch {}
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

// Replace an entire 2D canvas in one operation. Using the `copy` composite mode
// avoids a separate full-surface clear before drawImage(), which otherwise adds
// another memory-bandwidth pass at the render resolution.
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
    _copyFullFrame(gCur.drawingContext, videoEl.elt, gCur.width, gCur.height);
  } catch(e) {}
}

let _ringCapWidth = 0;
let _ringCapHeight = 0;
let _ringCapQuality = NaN;

function _ensureFrameRingCapacity(width, height, quality) {
  if (width === _ringCapWidth && height === _ringCapHeight && quality === _ringCapQuality) return;
  _ringCapWidth = width;
  _ringCapHeight = height;
  _ringCapQuality = quality;

  const bpf = width * height * 4;
  let cap = Math.max(4, Math.round(60 * (quality * 2)));
  cap = Math.min(cap, Math.max(4, Math.floor(192 * 1024 * 1024 / bpf)));
  frameRing.resize(cap);
}

function _pushToRing() {
  if (!gCur) return false;
  try {
    const quality = renderState.quality ?? 1;
    _ensureFrameRingCapacity(gCur.width, gCur.height, quality);
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
    const onFrame = () => {
      if (session !== _pumpSession) return; // stale chain — stop
      if (playing && gCur) {
        try {
          if (_copyFullFrame(gCur.drawingContext, v, gCur.width, gCur.height)) {
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
      Object.assign(el.style, { marginLeft:'10px', color:'#0f0', fontFamily:'monospace', fontSize:'12px' });
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
  canvas = createCanvas(windowWidth, windowHeight);
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
  gCur     = _ensureGraphics(gCur,     width, height);
  gBuf     = _ensureGraphics(gBuf,     width, height);
  gScratch = _ensureGraphics(gScratch, width, height);
}

let _resizeRaf = 0;
function windowResized() {
  if (_resizeRaf) cancelAnimationFrame(_resizeRaf);
  _resizeRaf = requestAnimationFrame(() => {
    _resizeRaf = 0;
    resizeCanvas(windowWidth, windowHeight, true);
    _mainCanvasEl = canvas?.elt ?? _mainCanvasEl;
    _mainCtx = _mainCanvasEl?.getContext('2d', { alpha:true, desynchronized:true }) ?? _mainCtx;
    allocBuffers();
    [gBuf, gScratch].forEach(_clearGraphics);
    frameRing.clear(true);
    seededOnce = false;
    _bypassSyncedVfc = -1;
    _renderWasBypassed = true;
    if (typeof resetClusterPhysics === 'function') resetClusterPhysics();
    updateDim();
  });
}
window.windowResized = windowResized;

function clearAll() {
  [gBuf, gScratch].forEach(_clearGraphics);
  frameRing.clear();
  seededOnce = false;
  _bypassSyncedVfc = -1;
  _renderWasBypassed = true;
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
    'file','playBtn','pauseBtn','refreshBtn','resetBtn','clearBufBtn',
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
    'cluSpeed','cluSpeedVal','cluSteer','cluSteerVal','cluInertia','cluInertiaVal','cluCohere','cluCohereVal',
    'flowOn','flowStrength','flowStrengthVal','flowScale','flowScaleVal',
    'flowPulse','flowPulseVal','flowImpl','flowImplVal',
    'flowSpeed','flowSpeedVal','flowTurb','flowTurbVal','flowSwirl','flowSwirlVal','flowSpread','flowSpreadVal',
    'baseOn','baseMix','baseMixVal','seedOnLoad',
    'symOn','symMode','symPos','symPosVal',
    'solarizeOn','solarizeThresh','solarizeThreshVal','solarizeAmt','solarizeAmtVal',
    'solarizeR','solarizeRVal','solarizeG','solarizeGVal','solarizeB','solarizeBVal',
    'scanAlpha','scanAlphaVal','scanShift','scanShiftVal','scanDrift','scanDriftVal',
    'scanSpeed','scanSpeedVal','scanGap','scanGapVal','scanSkew','scanSkewVal',
    'scanAngle','scanAngleVal','scanFocus','scanFocusVal','scanRoll','scanRollVal',
    'scanSpinLeft','scanSpinRight','scanSpinSpeed','scanSpinSpeedVal',
    'depthScatter','depthScatterVal','corruptDrift','corruptDriftVal',
    'scanAngle','bgMode','dim',
    'cluSpeedVar','cluSpeedVarVal','cluPulse','cluPulseVal','cluBreathe','cluBreatheVal','cluBounds',
    'layerPriority','layerPulseSpeed','layerPulseSpeedVal',
    'lumaKeyOn','lumaKeyMix','lumaKeyMixVal','lumaKeyAB','lumaKeyABVal','lumaKeyInvert',
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

function hookSliders() {
  const sliderIds = [
    'quality','depth','corrupt','block','glitchSpeed','glitchSpeedFine',
    'glitchSize','glitchSmear','glitchBaseX','glitchBaseY',
    'feedback','persistence','fbX','fbY','fbZ','fbTheta',
    'spatialGap','clusterCount','clusterRadius','cluCenters','cluSpread',
    'cluMinSpread','cluBias','cluDrift','cluSpeed','cluSteer','cluInertia','cluCohere',
    'scanAlpha','scanShift','scanDrift','scanSpeed','scanGap','scanSkew','scanFocus','scanRoll',
    'glitchAlpha','glitchJitter','glitchSmearAngle',
    'flowStrength','flowScale','flowPulse','flowImpl','flowSpeed','flowTurb','flowSwirl','flowSpread','baseMix','symPos','glitchSpeedMul',
    'depthScatter','corruptDrift',
    'solarizeThresh','solarizeAmt','solarizeR','solarizeG','solarizeB',
    'cluSpeedVar','cluPulse','cluBreathe',
    'lumaKeyMix','lumaKeyAB','globalMixAmt','scanAngle','scanSpinSpeed','layerPulseSpeed',
  ];

  sliderIds.forEach(id => {
    els[id]?.addEventListener('input', () => { updateLabels(); snapshotForUndo(); });
  });

  // Checkboxes and selects also get snapshotted for undo
  ['corruptOn','clusters','clusterTiles','flowOn','baseOn','symOn','solarizeOn',
   'cluBounds','layerPriority','seedOnLoad','bgMode','symMode',
   'lumaKeyOn','globalMixOn','globalMixBlend','globalMixPos','scanSpinLeft','scanSpinRight'].forEach(id => {
    _$(id)?.addEventListener('change', snapshotForUndo);
  });

  els.baseOn?.addEventListener('change', () => {
    if (els.baseMix) els.baseMix.disabled = !els.baseOn.checked;
    updateLabels();
  });
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
  set(els.cluSteer,         els.cluSteerVal,         f2);
  set(els.cluInertia,       els.cluInertiaVal,       f2);
  set(els.cluCohere,        els.cluCohereVal,        f2);
  set(els.flowStrength,     els.flowStrengthVal,     v => v);
  set(els.flowScale,        els.flowScaleVal,        v => v);
  set(els.flowPulse,        els.flowPulseVal,        v => (v|0));
  set(els.flowImpl,         els.flowImplVal,         f2);
  set(els.flowSpeed,        els.flowSpeedVal,        f2);
  set(els.flowSpread,       els.flowSpreadVal,       f2);
  set(els.flowTurb,         els.flowTurbVal,         f2);
  set(els.flowSwirl,        els.flowSwirlVal,        f2);
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
  set(els.scanSkew,         els.scanSkewVal,         f2);
  set(els.scanAngle,        els.scanAngleVal,        v => Math.round(v)+'°');
  set(els.scanFocus,        els.scanFocusVal,        f2);
  set(els.scanRoll,         els.scanRollVal,         f2);
  set(els.scanSpinSpeed,    els.scanSpinSpeedVal,    f2);
  set(els.depthScatter,     els.depthScatterVal,     f2);
  set(els.corruptDrift,     els.corruptDriftVal,     f2);
  set(els.symPos,           els.symPosVal,           f2);
  set(els.solarizeThresh,   els.solarizeThreshVal,   f2);
  set(els.solarizeAmt,      els.solarizeAmtVal,      f2);
  set(els.solarizeR,        els.solarizeRVal,        f2);
  set(els.solarizeG,        els.solarizeGVal,        f2);
  set(els.solarizeB,        els.solarizeBVal,        f2);
  set(els.cluSpeedVar,      els.cluSpeedVarVal,      f2);
  set(els.cluPulse,         els.cluPulseVal,         f2);
  set(els.cluBreathe,       els.cluBreatheVal,       f2);
  set(els.lumaKeyMix,       els.lumaKeyMixVal,       f2);
  set(els.layerPulseSpeed,  els.layerPulseSpeedVal,  v => (+v).toFixed(1));
  set(els.lumaKeyAB,        els.lumaKeyABVal,        f2);
  set(els.globalMixAmt,     els.globalMixAmtVal,     f2);
  if (els.baseMix && els.baseMixVal) {
    els.baseMixVal.textContent = f2(els.baseMix.value);
    if (els.baseMix) els.baseMix.disabled = !els.baseOn?.checked;
  }
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
  const generation = _retireCurrentSource({ revokeBlob: true });
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
    _clearSourceReadyPoller();
    _clearSourceGestureUnlock();
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

// ─── Draw-loop helpers ───────────────────────────────────────────────────────
// Defined once rather than recreated as closures on every render frame.
function _emitGlitchGroup(state, density, glitchPriority, lumaMix) {
  if (state.corruptOn) {
    applyGlitch(density, Math.trunc(state.glitchBaseX), Math.trunc(state.glitchBaseY), glitchPriority, state);
  }
  if (state.lumaKeyOn && lumaMix > 0) {
    applyPipelineLumaKey(state.lumaKeyAB, lumaMix, !!state.lumaKeyInvert, _vfc);
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
  const luma = !!state.lumaKeyOn && state.lumaKeyMix > 0;
  const globalMix = !!state.globalMixOn && state.globalMixAmt > 0;
  const feedback = _feedbackHasVisibleEffect(state);
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

function draw() {
  _tickFPS();
  const s = renderState;
  const bg = s.bgMode || 'black';

  if (!videoEl) {
    _paintMainBackground(bg);
    drawWaiting();
    return;
  }

  // Keep gCur current at 60fps only on WebViews without rVFC. Modern WebViews
  // update it once per genuinely decoded source frame in pumpVideoFrames().
  _syncGCur();

  // Preserve phase progression even when the corresponding stage is currently
  // neutral. Re-enabling an effect therefore resumes at the same temporal point
  // as the pre-optimization renderer.
  const mul     = s.glitchSpeedMul;
  const coarse  = s.glitchSpeed * mul;
  const fine    = s.glitchSpeedFine * mul;
  const density = coarse * fine;
  nPhaseX += density * 0.01;
  nPhaseY += density * 0.011;

  const scanSpeed = s.scanSpeed;
  nPhaseScanX += scanSpeed * 0.008;
  nPhaseScanY += scanSpeed * 0.009;

  // Left and right are separate toggles; right wins if both are active.
  // Continue the accumulator while Scanlines are visually neutral so toggling
  // alpha/count/on-state does not restart or pause the spin.
  const spinSpeed = s.scanSpinSpeed;
  const spinLeft  = !!s.scanSpinLeft;
  const spinRight = !!s.scanSpinRight;
  let scanAngleArg = null;
  if (spinRight) {
    _scanSpinAngle = (_scanSpinAngle + spinSpeed * 0.5) % 360;
    scanAngleArg   = _scanSpinAngle;
  } else if (spinLeft) {
    _scanSpinAngle = ((_scanSpinAngle - spinSpeed * 0.5) % 360 + 360) % 360;
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

  if (activity.glitch) randomSeed(baseSeed + frameCount);

  const pers = s.persistence;
  if (pers < 1) {
    const ctx = gBuf.drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${map(1 - pers, 0, 1, 1, 20) / 255})`;
    ctx.fillRect(0, 0, gBuf.width, gBuf.height);
    ctx.restore();
  }

  // Paint order remains the Classic layer-priority model. Only calculate the
  // ordering state when at least one of the two ordered groups contributes.
  let glitchOnTop = false;
  if (activity.scanlines || activity.glitch || activity.luma) {
    const layerState = s.layerPriority || 'scan';
    const pulseSpd    = s.layerPulseSpeed;
    const pulseFrames = Math.max(1, Math.round(60 / Math.max(0.1, pulseSpd)));
    if      (layerState === 'glitch')  glitchOnTop = true;
    else if (layerState === 'neutral') glitchOnTop = (frameCount & 1) === 0;
    else if (layerState === 'pulse')   glitchOnTop = (Math.floor(frameCount / pulseFrames) & 1) === 0;
  }

  const glitchPriority = 1.0;
  const scanPriority    = 1.0;
  const lumaMix         = s.lumaKeyMix;

  if (glitchOnTop) {
    if (activity.scanlines) applyScanlines(density, scanAngleArg, scanPriority, s);
    if (activity.glitch || activity.luma) {
      _emitGlitchGroup(s, density, glitchPriority, lumaMix);
    }
  } else {
    if (activity.glitch || activity.luma) {
      _emitGlitchGroup(s, density, glitchPriority, lumaMix);
    }
    if (activity.scanlines) applyScanlines(density, scanAngleArg, scanPriority, s);
  }

  const gmPos = s.globalMixPos || 'after';
  if (activity.globalMix && gmPos === 'before') _emitGlobalMix(s);

  const fb = s.feedback;
  if (activity.feedback) {
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

  if (activity.globalMix && gmPos === 'after') _emitGlobalMix(s);

  if (activity.flow) {
    applyFlowWarp(gBuf, gScratch, Math.trunc(s.flowStrength),
      Math.trunc(s.flowScale), Math.trunc(s.flowPulse), s.flowImpl, s.flowSpeed,
      s.flowTurb, s.flowSwirl, s.flowSpread);
    [gBuf, gScratch] = [gScratch, gBuf];
  }

  if (activity.globalMix && gmPos === 'afterflow') _emitGlobalMix(s);

  if (activity.symmetry) {
    applySymmetry(gBuf, gScratch, s.symMode || 'v', s.symPos);
    [gBuf, gScratch] = [gScratch, gBuf];
  }

  if (activity.solarize) {
    applySolarize(gBuf, s.solarizeThresh, s.solarizeAmt,
      s.solarizeR, s.solarizeG, s.solarizeB);
  }

  if (activity.globalMix && gmPos === 'final') _emitGlobalMix(s);

  // Effects may leave transparent regions, so retain the selected background in
  // the active path. The clean bypass path above is a full-frame opaque copy and
  // therefore does not need this fill.
  _paintMainBackground(bg);

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
  _retireCurrentSource({ revokeBlob: true });
  try { enableTransport(false); } catch {}
}

function startCamera(deviceId) {
  const generation = _retireCurrentSource({ revokeBlob: true });
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
// supports it. Older WebViews transparently fall back to the original main-thread
// canvas.toBlob() path. Both paths are latest-frame-wins and bounded.

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
  let ws = null, connected = false, fallbackBusy = false;
  let mirrorShutdown = false;
  let mirrorReceivers = 0;
  let relayFramePending = false;
  let _wsDelay = 1500;
  const WS_DELAY_MAX = 30000;

  // ── Off-main-thread encoder ──────────────────────────────────────────────
  let encoderWorker = null;
  let workerReady = false;
  let workerBusy = false;
  let workerDisabled = false;

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
    ws = new WebSocket(wsUrl);
    window.__huffWS = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen  = () => {
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
      if (!mirrorShutdown) {
        setTimeout(ensureWS, _wsDelay);
        _wsDelay = Math.min(_wsDelay * 2, WS_DELAY_MAX);
      }
    };
  }
  ensureWS();

  // The mirror is an operator preview, not the canonical render clock. Cache
  // its tuning values on control events rather than parsing the DOM and doing
  // quality/FPS math on every animation-frame pump.
  const STREAM_FPS_CAP = 30;
  let _streamJpegQ = 0.97;
  let _streamPeriod = 1000 / STREAM_FPS_CAP;
  function refreshStreamTuning(rawQuality) {
    const q = Number.isFinite(rawQuality) ? rawQuality : 1;
    _streamJpegQ = Math.max(0.3, Math.min(0.97, 0.5 + q * 0.47));
    const fps = Math.max(10, Math.min(STREAM_FPS_CAP, Math.round(15 + q * 45)));
    _streamPeriod = 1000 / fps;
  }
  refreshStreamTuning(renderState.quality ?? Number(_$('quality')?.value ?? 1));
  const updateStreamTuning = event => {
    if (event.target?.id === 'quality') refreshStreamTuning(Number(event.target.value));
  };
  document.addEventListener('input', updateStreamTuning);
  document.addEventListener('change', updateStreamTuning);
  function streamJpegQ() { return _streamJpegQ; }
  function targetPeriod() { return _streamPeriod; }

  // Do not enqueue another encoded frame while the socket is backed up.
  const WS_MAX_BUFFERED = 1 << 19; // ~512KB

  async function sendViaWorker(cnv) {
    if (!workerReady || workerDisabled) return false;
    // Worker already owns a newer frame. Drop this tick instead of falling back
    // to a second main-thread encode in parallel.
    if (workerBusy) { _profileCount('mirrorDropped'); return true; }
    workerBusy = true;
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(cnv);
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
        maxW: STREAM_MAX_W,
        maxH: STREAM_MAX_H,
        quality: streamJpegQ(),
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
      const sw = cnv.width, sh = cnv.height;
      const scale = Math.min(1, STREAM_MAX_W / sw, STREAM_MAX_H / sh);
      const tw = Math.max(1, Math.round(sw * scale));
      const th = Math.max(1, Math.round(sh * scale));
      if (tcv.width !== tw || tcv.height !== th) { tcv.width = tw; tcv.height = th; }
      ttx.globalAlpha = 1;
      ttx.globalCompositeOperation = 'copy';
      ttx.drawImage(cnv, 0, 0, tw, th);
      ttx.globalCompositeOperation = 'source-over';
      const q = streamJpegQ();
      await new Promise(resolve => {
        tcv.toBlob(blob => {
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
  requestAnimationFrame(function pump(ts) {
    if (ts - last >= targetPeriod()) {
      last = ts;
      const c = findCanvas();
      if (c) sendFrame(c).catch(() => {});
    }
    requestAnimationFrame(pump);
  });

  function shutdownMirror() {
    if (mirrorShutdown) return;
    mirrorShutdown = true;
    connected = false;
    mirrorReceivers = 0;
    relayFramePending = false;
    workerBusy = false;
    fallbackBusy = false;
    try { encoderWorker?.terminate(); } catch {}
    encoderWorker = null;
    if (ws) {
      try { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; } catch {}
      try { ws.close(); } catch {}
    }
    ws = null;
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

  // Top-level draw() calls only — NOT their internal sub-calls (e.g. drawRingRegion
  // inside trails/glitch) so nothing is double-counted. _pushToRing runs on the
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
      'color:#0f0', 'background:rgba(0,0,0,0.82)', 'padding:8px 10px',
      'border:1px solid #0a0', 'border-radius:4px', 'white-space:pre',
      'pointer-events:none', 'letter-spacing:0.3px'
    ].join(';');
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
  }

  let frames = 0, lastReport = performance.now();
  let lastTelemetry = { ..._profileTelemetry };

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
      const decodeFps = decodedDelta * 1000 / dt;
      const ringFps = ringDelta * 1000 / dt;
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
        'decode     ' + decodeFps.toFixed(1).padStart(6) + ' fps\n' +
        'ring       ' + ringFps.toFixed(1).padStart(6) + ' fps\n' +
        'ring mem   ' + `${frameRing.allocatedSlots}/${frameRing.capacity}`.padStart(6) + ' slots\n' +
        'ring MiB   ' + (frameRing.estimatedBytes / 1048576).toFixed(1).padStart(6) + '\n' +
        'mirror     ' + `${mirrorSentDelta}/${mirrorDroppedDelta}`.padStart(6) + ' sent/drop\n' +
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
    }
  }

  function loop() { frames++; report(); requestAnimationFrame(loop); }

  function toggle() {
    visible = !visible;
    window.__huffProfilerActive = visible;
    ensureOverlay();
    overlay.style.display = visible ? 'block' : 'none';
    NAMES.forEach(function (n) { acc[n] = 0; });
    frames = 0;
    lastReport = performance.now();
    lastTelemetry = { ..._profileTelemetry };
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
