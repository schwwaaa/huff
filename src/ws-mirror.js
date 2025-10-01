// ws-mirror.js — robust sender (event-driven + keepalive)
(function(){
  const STREAM_MAX_W = 1280;
  const STREAM_MAX_H = 1280;
  const STREAM_Q     = 0.76;
  const USE_JPEG     = true;

  // --- utilities ------------------------------------------------------------
  function setWSStatus(txt){
    const el = document.getElementById('status');
    if (el) el.textContent = txt;
  }
  function findCanvas(){
    try { if (typeof canvas !== 'undefined' && canvas && canvas.elt instanceof HTMLCanvasElement) return canvas.elt; } catch(e){}
    return document.querySelector('canvas');
  }
  const wsUrl = (typeof __getWSURL__ === 'function') ? __getWSURL__() : (window.WS_MIRROR_URL || 'ws://127.0.0.1:8787');

  // --- keepalive: prevents background throttling ---------------------------
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

  // --- websocket ------------------------------------------------------------
  let ws = null, connected = false;
  function ensureWS(){
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { connected = true; setWSStatus('WS: connected'); try{ ws.send(JSON.stringify({type:'hello', role:'index'})); }catch(e){}; };
    ws.onclose = () => { connected = false; setWSStatus('WS: disconnected'); setTimeout(ensureWS, 1200); };
  }
  ensureWS();

  // --- frame encoding and send ---------------------------------------------
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

  // --- rVFC-driven hook from the sketch (installed here, invoked from canvas.js)
  window.__mirrorKick = () => {
    const cnv = findCanvas();
    if (cnv) sendFrameNow(cnv);
  };

  // --- safety net fallback (very low rate if no kicks arrive) --------------
  let lastKick = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (now - lastKick > 350) { // no kicks for a bit—send a maintenance frame
      const cnv = findCanvas();
      if (cnv) sendFrameNow(cnv);
    }
    lastKick = now;
  }, 333);

  // optional launcher button
  const openBtn = document.getElementById('openCanvasBtn');
  if (openBtn) openBtn.addEventListener('click', () => {
    const url = 'canvas.html?ws=' + encodeURIComponent(wsUrl) + '&mode=stretch&autofs=1';
    const features = 'popup=yes,noopener,noreferrer,menubar=0,toolbar=0,location=0,status=0,scrollbars=0,resizable=1,width=1280,height=720,left=80,top=60';
    window.open(url, 'canvas-mirror', features);
  });
})();
