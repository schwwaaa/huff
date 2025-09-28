/**
 * canvas.js — Controls window logic (FULL FILE)
 * - Ensures #stage exists before p5 attaches (fixes parent() null)
 * - Robust first-load + autoplay (muted, then unmute on gesture)
 * - rVFC pump drives render cadence
 * - Keeps playback running when page is hidden/unfocused (temporarily mutes)
 * - ADDED: Volume slider (0..1 step 0.01); 0 => muted, >0 => unmuted; applies live
 */

(() => {
  const $ = (sel) => document.querySelector(sel);

  // Gather key elements (others are queried inside hookUI())
  const els = {
    file:     $('#file'),
    playBtn:  $('#playBtn'),
    pauseBtn: $('#pauseBtn'),
    status:   $('#status'),
  };
  const setStatus = (t) => { if (els.status) els.status.textContent = t; };

  // Will be created dynamically if not present:
  let volumeSlider = null;
  let volumeVal    = null;

  // p5 / video state
  let gCur, gBuf, gWarp, gBloomWork, gTemp;
  let playing = false;
  let videoEl = null;         // p5.MediaElement
  let currentBlobUrl = null;

  function setup() {
    // --- FIX: Ensure a container exists and pass the element to parent()
    let stageEl = document.getElementById('stage');
    if (!stageEl) {
      stageEl = document.createElement('div');
      stageEl.id = 'stage';
      stageEl.style.width = '100%';
      stageEl.style.height = '100%';
      document.body.appendChild(stageEl);
    }

    const cnv = createCanvas(windowWidth, windowHeight);
    cnv.parent(stageEl); // pass the actual element
    pixelDensity(1);
    background(0);

    gCur       = createGraphics(width, height);
    gBuf       = createGraphics(width, height);
    gWarp      = createGraphics(width, height);
    gBloomWork = createGraphics(width, height);
    gTemp      = createGraphics(width, height);

    hookUI();

    // FS hotkey + resume if paused during FS transition (WK quirk)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
        e.preventDefault();
      }
    }, true);

    document.addEventListener('fullscreenchange', () => {
      const v = videoEl?.elt;
      if (v && playing && v.paused) v.play().catch(()=>{});
    });
  }
  window.setup = setup;

  function windowResized(){
    resizeCanvas(windowWidth, windowHeight);
    gCur       = createGraphics(width, height);
    gBuf       = createGraphics(width, height);
    gWarp      = createGraphics(width, height);
    gBloomWork = createGraphics(width, height);
    gTemp      = createGraphics(width, height);
    background(0);
  }
  window.windowResized = windowResized;

  function draw(){
    background(0);
    if (videoEl && !videoEl.elt.ended) blitVideoInto(gCur);
    image(gCur, 0, 0, width, height);
  }
  window.draw = draw;

  // ---------- helpers ----------
  function cloakVideo(el){
    try { el.addClass('hidden'); } catch {}
    try { el.hide(); } catch {}
  }
  function blitVideoInto(target){
    const v = videoEl?.elt;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    target.clear();
    target.image(videoEl, 0, 0, target.width, target.height);
  }
  function clearAll(){
    try { gCur.clear(); gBuf.clear(); gWarp.clear(); gBloomWork.clear(); gTemp.clear(); } catch {}
    background(0);
  }
  function enableTransport(enable){
    if (els.playBtn)  els.playBtn.disabled  = !enable;
    if (els.pauseBtn) els.pauseBtn.disabled = !enable;
  }

  // rVFC pump
  function pumpVideoFrames(){
    const v = videoEl?.elt;
    if (!v) return;

    const tick = () => { try { blitVideoInto(gCur); } catch {} };

    if (typeof v.requestVideoFrameCallback === 'function') {
      const step = () => {
        if (!videoEl || videoEl.elt !== v) return;
        tick();
        try { v.requestVideoFrameCallback(step); } catch {}
      };
      try { v.requestVideoFrameCallback(step); } catch {}
    } else {
      const loop = () => {
        if (!videoEl || videoEl.elt !== v) return;
        tick();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  function armAutoplayFallbackOnce() {
    const handler = async () => {
      const v = videoEl?.elt; if (!v) return cleanup();
      try {
        await v.play();
        // Honor slider on first gesture
        const vol = getSliderVolume();
        try { v.volume = vol; v.muted = (vol === 0); } catch {}
        pumpVideoFrames(); playing = true;
      } catch {}
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener('pointerdown', handler, true);
      window.removeEventListener('keydown', handler, true);
    };
    window.addEventListener('pointerdown', handler, true);
    window.addEventListener('keydown',  handler, true);
  }

  // ---------- UI ----------
  function hookUI(){
    // Inject a volume slider into the header/tool area if not present
    installVolumeUI();

    // wire file input if present
    els.file = els.file || $('#file');
    els.file?.addEventListener('change', onFile);

    els.playBtn = els.playBtn || $('#playBtn');
    els.pauseBtn = els.pauseBtn || $('#pauseBtn');

    els.playBtn?.addEventListener('click', async () => {
      if (!videoEl) return;
      const v = videoEl.elt;
      const vol = getSliderVolume();
      try {
        v.volume = vol;
        v.muted  = (vol === 0);
        v.setAttribute('playsinline','');
        await v.play();
      } catch {
        try { v.muted = true; await v.play(); } catch {}
      }
      pumpVideoFrames(); playing = true;
      try { videoEl.loop(); } catch {}
    });

    els.pauseBtn?.addEventListener('click', () => {
      const v = videoEl?.elt; if (!v) return;
      v.pause(); playing = false;
    });
  }

  // Creates <label><span id="volumeVal">…</span></label><input id="volumeSlider">
  function installVolumeUI(){
    // Prefer an existing header; otherwise, make a small toolbar
    let host = document.querySelector('header');
    if (!host) {
      host = document.createElement('div');
      host.style.position = 'fixed';
      host.style.left = '8px';
      host.style.top = '8px';
      host.style.zIndex = '9999';
      host.style.background = 'rgba(0,0,0,0.4)';
      host.style.backdropFilter = 'blur(4px)';
      host.style.padding = '6px 10px';
      host.style.borderRadius = '8px';
      document.body.appendChild(host);
    }

    // If they already exist, reuse
    volumeSlider = document.querySelector('#volumeSlider');
    volumeVal    = document.querySelector('#volumeVal');

    if (!volumeSlider) {
      const label = document.createElement('label');
      label.setAttribute('for', 'volumeSlider');
      label.style.marginLeft = '12px';
      label.style.marginRight = '6px';
      label.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
      label.style.fontSize = '12px';
      label.style.color = '#ddd';
      label.textContent = 'Volume: ';

      volumeVal = document.createElement('span');
      volumeVal.id = 'volumeVal';
      volumeVal.textContent = '100%';
      label.appendChild(volumeVal);

      volumeSlider = document.createElement('input');
      volumeSlider.id = 'volumeSlider';
      volumeSlider.type = 'range';
      volumeSlider.min = '0';
      volumeSlider.max = '1';
      volumeSlider.step = '0.01';
      volumeSlider.value = '1';
      volumeSlider.style.verticalAlign = 'middle';
      volumeSlider.style.marginLeft = '6px';
      volumeSlider.style.width = '140px';

      host.appendChild(label);
      host.appendChild(volumeSlider);
    }

    // Initialize label
    if (volumeVal) volumeVal.textContent = formatVol(volumeSlider.value);

    // Live volume handler
    volumeSlider.addEventListener('input', () => {
      const v = videoEl?.elt;
      const vol = getSliderVolume();
      if (volumeVal) volumeVal.textContent = formatVol(vol);
      if (!v) return;

      try { v.volume = vol; } catch {}
      try {
        if (vol > 0) {
          v.muted = false;
          if (v.paused) v.play().catch(()=>{});
        } else {
          v.muted = true;
        }
      } catch {}
    });
  }

  function getSliderVolume(){
    const raw = volumeSlider?.value ?? '1';
    const vol = parseFloat(raw);
    return Number.isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 1;
  }
  function formatVol(v){ return Math.round((+v || 0) * 100) + '%'; }

  // ---------- Robust first-load + autoplay ----------
  async function onFile(ev){
    const input = ev.target;
    const file = input.files && input.files[0];
    if (!file) return;

    // allow same-file reselect later
    queueMicrotask(() => { try { input.value = ''; } catch {} });

    // cleanup previous
    if (videoEl) { try { videoEl.remove(); } catch {} videoEl = null; }
    if (currentBlobUrl) { try { URL.revokeObjectURL(currentBlobUrl); } catch {} currentBlobUrl = null; }

    const url = URL.createObjectURL(file);
    currentBlobUrl = url;

    videoEl = createVideo([url], () => {});
    videoEl.attribute('preload', 'auto');
    videoEl.attribute('playsinline', '');
    cloakVideo(videoEl);
    const v = videoEl.elt;

    // Apply slider volume now; start muted to satisfy autoplay
    try { v.volume = getSliderVolume(); } catch {}
    v.muted = true;

    let primed = false;
    const primeOnce = () => {
      if (primed) return;
      if (v.readyState >= 1 && v.videoWidth > 0 && v.videoHeight > 0) {
        primed = true;
        clearAll();
        try { blitVideoInto(gCur); } catch {}
        enableTransport(true);

        try { v.currentTime = 0; } catch {}

        (async () => {
          try {
            v.setAttribute('playsinline','');
            await v.play();                   // muted autoplay
            pumpVideoFrames();
            try { videoEl.loop(); } catch {}
            playing = true;

            // After playback starts, honor slider: unmute if >0
            const vol = getSliderVolume();
            try { v.volume = vol; v.muted = (vol === 0); } catch {}

            // Also unmute on first gesture if still muted
            const unmuteOnce = () => {
              const vol2 = getSliderVolume();
              try { v.muted = (vol2 === 0) ? true : false; v.volume = vol2; } catch {}
              window.removeEventListener('pointerdown', unmuteOnce, true);
              window.removeEventListener('keydown',  unmuteOnce, true);
            };
            window.addEventListener('pointerdown', unmuteOnce, true);
            window.addEventListener('keydown',  unmuteOnce, true);
          } catch {
            // If muted autoplay blocked (rare), gesture fallback
            armAutoplayFallbackOnce();
          }
        })();
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

  // ----- Keep playback running when page hidden/unfocused
  let restoreMute = null;

  function goBackground(){
    const v = videoEl?.elt; if (!v) return;
    try {
      if (restoreMute === null) restoreMute = v.muted;
      v.muted = true; // background-safe
      v.setAttribute('playsinline','');
      if (v.paused) v.play().catch(()=>{});
    } catch {}
  }
  function goForeground(){
    const v = videoEl?.elt; if (!v) { restoreMute = null; return; }
    try {
      const vol = getSliderVolume();
      v.volume = vol;
      v.muted  = (vol === 0); // slider governs when we return
    } catch {}
    restoreMute = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) goBackground(); else goForeground();
  });
  window.addEventListener('blur',  goBackground);
  window.addEventListener('focus', goForeground);
  window.addEventListener('pagehide', goBackground);
  window.addEventListener('pageshow', goForeground);

  // expose (optional)
  window.__controls__ = {
    get video(){ return videoEl?.elt || null; },
    isPlaying(){ return !!playing; },
  };
})();
