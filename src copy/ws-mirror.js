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
