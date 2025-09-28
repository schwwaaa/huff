// ws-mirror.js — controls window sender (FULL FILE)
// Foreground: rAF pump
// Background/unfocused/hidden: requestVideoFrameCallback on <video>
// Ensures the <video> keeps playing while hidden (temporarily mutes to satisfy policies)
// Always captures the *p5 canvas* so FX are preserved; backpressure guarded.

(() => {
  const wsUrl = (typeof __getWSURL__ === 'function')
    ? __getWSURL__(8787)
    : (window.WS_MIRROR_URL || 'ws://127.0.0.1:8787');

  const STREAM_MAX_W = 1280;
  const STREAM_MAX_H = 1280;
  const STREAM_FPS   = 30;
  const STREAM_Q     = 0.78;
  const USE_JPEG     = true;
  const MAX_WS_BUFFERED = 1_500_000;

  const statusEl = document.querySelector('#status');
  const openBtn  = document.querySelector('#openCanvasBtn');
  const setWSStatus = t => { if (statusEl) statusEl.textContent = t; };

  function openCanvasWindow() {
    try {
      const u = new URL('canvas.html', location.origin);
      u.searchParams.set('ws', wsUrl);
      u.searchParams.set('mode', 'stretch');
      u.searchParams.set('autofs', '1');
      window.open(u.toString(), 'canvas-mirror', 'popup,width=1280,height=720');
    } catch {}
  }
  openBtn?.addEventListener('click', openCanvasWindow);

  // ---- WebSocket
  let ws = null, wsReady = false;
  function ensureWS() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    try {
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { wsReady = true; setWSStatus('WS: connected');
        try { ws.send(JSON.stringify({ type: 'hello', role: 'index' })); } catch {}
        if (openBtn) openCanvasWindow();
      };
      ws.onclose = () => { wsReady = false; setWSStatus('WS: disconnected'); setTimeout(ensureWS, 500); };
      ws.onerror = () => { wsReady = false; };
    } catch { setTimeout(ensureWS, 500); }
  }
  ensureWS();

  // ---- find sources
  function findP5Canvas() {
    try { if (typeof canvas !== 'undefined' && canvas?.elt instanceof HTMLCanvasElement) return canvas.elt; } catch {}
    return document.querySelector('canvas');
  }
  function findVideoEl() {
    const vids = Array.from(document.querySelectorAll('video'));
    for (const v of vids) {
      if (v.readyState >= 2 && v.videoWidth && v.videoHeight) return v;
    }
    return null;
  }

  // ---- ensure p5 FX pass before capture
  let _renderingFX = false;
  function renderFXOnce(){
    if (_renderingFX) return;
    if (typeof window.draw === 'function') {
      _renderingFX = true;
      try { window.draw(); } finally { _renderingFX = false; }
    }
  }

  // ---- encode & send
  let sending = false;
  const tcv = document.createElement('canvas');
  const ttx = tcv.getContext('2d', { alpha: false });

  async function sendFrameNow(srcCanvas) {
    if (!wsReady || !ws || sending || !srcCanvas) return;
    if (ws.bufferedAmount > MAX_WS_BUFFERED) return;

    sending = true;
    try {
      const sw = srcCanvas.width, sh = srcCanvas.height;
      if (!sw || !sh) return;

      const scale = Math.min(1, Math.min(STREAM_MAX_W / sw, STREAM_MAX_H / sh));
      const tw = Math.max(1, Math.round(sw * scale));
      const th = Math.max(1, Math.round(sh * scale));
      if (tcv.width !== tw || tcv.height !== th) { tcv.width = tw; tcv.height = th; }

      ttx.drawImage(srcCanvas, 0, 0, tw, th);

      const mime = USE_JPEG ? 'image/jpeg' : 'image/webp';
      const ab = await new Promise((resolve) =>
        tcv.toBlob(async (blob) => resolve(blob ? await blob.arrayBuffer() : new ArrayBuffer(0)), mime, STREAM_Q)
      );
      if (ab.byteLength && wsReady && ws.readyState === 1 && ws.bufferedAmount <= MAX_WS_BUFFERED) ws.send(ab);
    } catch {} finally { sending = false; }
  }

  // ---- pumps
  let lastTs = 0, rafId = 0;
  function rafPump(ts) {
    try {
      const period = 1000 / Math.max(1, STREAM_FPS);
      if (!lastTs || ts - lastTs >= period) {
        lastTs = ts;
        const srcCanvas = findP5Canvas();
        if (srcCanvas) { renderFXOnce(); sendFrameNow(srcCanvas); }
      }
    } catch {}
    rafId = requestAnimationFrame(rafPump);
  }
  const startRaf = () => { if (!rafId) rafId = requestAnimationFrame(rafPump); };
  const stopRaf  = () => { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } };
  startRaf();

  let vfcActive = false;
  function startVFC(){
    if (vfcActive) return;
    const v = findVideoEl();
    if (!(v && typeof v.requestVideoFrameCallback === 'function')) return;

    vfcActive = true;
    const step = () => {
      if (!vfcActive) return;
      renderFXOnce();
      const srcCanvas = findP5Canvas();
      if (srcCanvas) sendFrameNow(srcCanvas);
      try { v.requestVideoFrameCallback(step); } catch { vfcActive = false; }
    };
    try { v.requestVideoFrameCallback(step); } catch { vfcActive = false; }
  }
  const stopVFC = () => { vfcActive = false; };

  // ---- focus/visibility policy
  let restoreMute = null; // remembers prior mute state while backgrounded

  function keepVideoAliveMuted() {
    const v = findVideoEl();
    if (!v) return;
    try {
      if (restoreMute === null) restoreMute = v.muted;  // remember current
      v.muted = true;                                   // background-safe
      v.setAttribute('playsinline','');
      if (v.paused) v.play().catch(()=>{});
    } catch {}
  }
  function restoreVideoMute() {
    const v = findVideoEl();
    if (!v) { restoreMute = null; return; }
    try {
      if (restoreMute !== null) v.muted = restoreMute;
    } catch {}
    restoreMute = null;
  }

  function goBackground() {
    stopRaf();
    startVFC();                  // drive from media clock (not throttled)
    keepVideoAliveMuted();       // ensure playback continues
  }
  function goForeground() {
    stopVFC();
    startRaf();
    restoreVideoMute();          // put mute back how user had it
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) goBackground();
    else goForeground();
  });

  // window focus/blur (some WebViews don't update visibility reliably)
  window.addEventListener('blur',  goBackground);
  window.addEventListener('focus', goForeground);

  // Also handle page lifecycle on macOS (just in case)
  window.addEventListener('pagehide', goBackground);
  window.addEventListener('pageshow', goForeground);

  // Expose
  window.WSMirror = { wsUrl, openCanvasWindow };
})();
