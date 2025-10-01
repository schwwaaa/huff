// ws-mirror.js — robust sender (event-driven + keepalive + auto-open viewer)
(function(){
  const STREAM_MAX_W = 1280;
  const STREAM_MAX_H = 1280;
  const STREAM_Q     = 0.76;            // JPEG/WEBP quality
  const USE_JPEG     = true;            // switch to false to send WEBP
  const AUTO_OPEN_VIEWER = true;        // open canvas.html automatically

  // -------- status helper --------
  function setWSStatus(txt){
    const el = document.getElementById('status');
    if (el) el.textContent = txt;
  }

  // -------- find the p5 canvas --------
  function findCanvas(){
    try {
      if (typeof canvas !== 'undefined' && canvas && canvas.elt instanceof HTMLCanvasElement) return canvas.elt;
    } catch(e){}
    return document.querySelector('canvas');
  }

  // -------- ws url --------
  const wsUrl = (typeof __getWSURL__ === 'function') ? __getWSURL__() : (window.WS_MIRROR_URL || 'ws://127.0.0.1:8787');

  // -------- AudioContext keepalive (prevents background throttling) --------
  let audioCtx;
  function startKeepAlive(){
    try{
      if (audioCtx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.00001; // essentially silent
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      document.addEventListener('visibilitychange', () => { audioCtx.resume().catch(()=>{}); });
      window.addEventListener('focus', () => { audioCtx.resume().catch(()=>{}); });
    }catch(e){}
  }
  startKeepAlive();

  // -------- open viewer window (Tauri/WebView allows this) --------
  function openViewer(){
    const url = 'canvas.html?ws=' + encodeURIComponent(wsUrl) + '&mode=stretch&autofs=0';
    const features = 'popup=yes,noopener,noreferrer,menubar=0,toolbar=0,location=0,status=0,scrollbars=0,resizable=1,width=1280,height=720,left=80,top=60';
    try { window.open(url, 'canvas-mirror', features); } catch(e){}
  }
  if (AUTO_OPEN_VIEWER) {
    setTimeout(openViewer, 250);
  }
  const openBtn = document.getElementById('openCanvasBtn');
  if (openBtn) openBtn.addEventListener('click', openViewer);

  // -------- websocket --------
  let ws = null, connected = false;
  function ensureWS(){
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      connected = true;
      setWSStatus('WS: connected');
      try{ ws.send(JSON.stringify({type:'hello', role:'index'})); }catch(e){}
    };
    ws.onclose = () => { connected = false; setWSStatus('WS: disconnected'); setTimeout(ensureWS, 1200); };
    ws.onerror = () => { /* ignore; reconnect on close */ };
  }
  ensureWS();

  // -------- frame encoding + send --------
  let sending = false;
  async function sendFrameNow(cnv){
    if (!connected || !ws || ws.readyState !== 1 || sending || !cnv) return;
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

  // -------- event-driven kicks from rVFC (installed by canvas.js) --------
  window.__mirrorKick = () => {
    const cnv = findCanvas();
    if (cnv) sendFrameNow(cnv);
  };

  // -------- low-rate safety net if no kicks arrive --------
  setInterval(() => {
    const cnv = findCanvas();
    if (cnv) sendFrameNow(cnv);
  }, 333);
})();
