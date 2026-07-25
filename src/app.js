const byId = (id) => document.getElementById(id);
const invoke = window.__TAURI__?.core?.invoke;
const bridgeReady = typeof invoke === 'function';

const appState = {
  registry: [],
  byLegacy: new Map(),
  byId: new Map(),
  values: {},
  revision: 0,
  info: null,
  timelineDragging: false,
  syncing: false,
  undo: [],
  toastTimer: 0,
  spoutAdaptersLoaded: false,
};

function toast(message, error = false) {
  const element = byId('nativeToast');
  if (!element) return;
  element.textContent = String(message);
  element.classList.toggle('error', error);
  element.style.display = 'block';
  clearTimeout(appState.toastTimer);
  appState.toastTimer = setTimeout(() => { element.style.display = 'none'; }, error ? 6000 : 2600);
}

async function call(command, args = {}) {
  if (!bridgeReady) throw new Error('Tauri bridge unavailable');
  try {
    return await invoke(command, args);
  } catch (error) {
    toast(`${command}: ${error}`, true);
    throw error;
  }
}

function basename(path) {
  return String(path || '').split(/[\\/]/).filter(Boolean).pop() || 'no file selected';
}

function formatTime(seconds) {
  const value = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
  const minutes = Math.floor(value / 60);
  const remaining = Math.floor(value % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function controlValue(element, definition) {
  if (!element) return definition?.default;
  if (definition?.kind === 'bool' || element.type === 'checkbox') return Boolean(element.checked);
  if (definition?.kind === 'number' || element.type === 'range' || element.type === 'number') {
    return Number(element.value);
  }
  return element.value;
}

function setControlValue(element, definition, value) {
  if (!element) return;
  if (definition.kind === 'bool' || element.type === 'checkbox') element.checked = Boolean(value);
  else element.value = String(value);
  updateReadout(element);
}

function updateReadout(element) {
  if (!element?.id) return;
  const output = byId(`${element.id}Val`);
  if (!output) return;
  const number = Number(element.value);
  if (!Number.isFinite(number)) return;
  const step = Number(element.step || 1);
  let digits = 0;
  if (step < 0.01) digits = 3;
  else if (step < 1) digits = 2;
  output.textContent = element.id === 'scanAngle'
    ? `${Math.round(number)}°`
    : number.toFixed(digits);
}

function snapshotDom() {
  const values = {};
  for (const definition of appState.registry) {
    const element = byId(definition.legacyId);
    values[definition.id] = element ? controlValue(element, definition) : appState.values[definition.id] ?? definition.default;
  }
  return values;
}

function pushUndo() {
  // Input/change handlers run after the DOM value has changed. The canonical
  // Rust snapshot still contains the pre-change state, so it is the correct
  // undo boundary.
  const state = structuredClone(appState.values);
  const previous = appState.undo.at(-1);
  if (previous && JSON.stringify(previous) === JSON.stringify(state)) return;
  appState.undo.push(state);
  if (appState.undo.length > 40) appState.undo.shift();
}

async function undo() {
  const previous = appState.undo.pop();
  if (!previous) return;
  await applyPresetValues(previous, false);
  toast('Undo restored');
}

async function setParameter(definition, value, recordUndo = true) {
  if (!definition) return;
  if (recordUndo) pushUndo();
  const revision = await call('set_parameter', { id: definition.id, value });
  appState.values[definition.id] = value;
  appState.revision = revision;
}

async function setBatch(values, recordUndo = true) {
  if (recordUndo) pushUndo();
  const revision = await call('set_parameter_batch', { values });
  Object.assign(appState.values, values);
  appState.revision = revision;
}

function applyStateToDom(snapshot) {
  appState.syncing = true;
  appState.values = { ...snapshot.values };
  appState.revision = snapshot.revision;
  for (const definition of appState.registry) {
    const element = byId(definition.legacyId);
    if (!element) continue;
    setControlValue(element, definition, snapshot.values[definition.id] ?? definition.default);
  }
  updateConditionalInputs();
  appState.syncing = false;
}

async function refreshParameterState() {
  const snapshot = await call('get_parameter_state');
  applyStateToDom(snapshot);
}

function groupPortStatus() {
  for (const group of document.querySelectorAll('.groups .group')) {
    const controls = [...group.querySelectorAll('input[id], select[id]')]
      .map((element) => appState.byLegacy.get(element.id))
      .filter(Boolean);
    if (!controls.length) continue;
    const implemented = controls.filter((definition) => definition.implemented).length;
    group.classList.toggle('native-pending-group', implemented === 0);
    group.classList.toggle('native-partial-group', implemented > 0 && implemented < controls.length);
  }
}

function configureRegistryControls() {
  const deferred = new Set([
    'renderResolution', 'renderCustomW', 'renderCustomH',
    'historyPreset', 'historyResolution', 'historyCustomW', 'historyCustomH',
    'historyCaptureRate', 'historySampling',
  ]);

  for (const definition of appState.registry) {
    const element = byId(definition.legacyId);
    if (!element) continue;
    element.dataset.parameterId = definition.id;
    if (!definition.implemented) {
      element.disabled = true;
      element.classList.add('native-pending');
      element.closest('.ctrl')?.classList.add('native-pending');
      element.title = `Native port pending (${definition.milestone}) · ${definition.id}`;
      continue;
    }
    if (deferred.has(definition.legacyId)) continue;
    const eventName = element.type === 'range' ? 'input' : 'change';
    let queued = false;
    element.addEventListener(eventName, () => {
      updateReadout(element);
      if (appState.syncing || queued) return;
      queued = true;
      requestAnimationFrame(async () => {
        queued = false;
        try { await setParameter(definition, controlValue(element, definition)); }
        catch (_) {}
      });
    });
  }
  groupPortStatus();
  const historyGroup = byId('historyPreset')?.closest('.group');
  if (historyGroup) historyGroup.title = 'Native GPU texture history is active. Resolution or capacity changes clear the ring.';
  const feedbackGroup = byId('feedback')?.closest('.group');
  if (feedbackGroup) {
    feedbackGroup.classList.add('native-partial-group');
    feedbackGroup.title = 'Native HDR feedback is active; final effect-order parity continues with later render-graph milestones.';
  }
  const glitchGroup = byId('corruptOn')?.closest('.group');
  if (glitchGroup) glitchGroup.title = "Milestone 09 includes Huff's native render graph, Syphon/Spout output, and bounded CFR recording from the authoritative wgpu output.";
  const clusterGroup = byId('clusterTiles')?.closest('.group');
  if (clusterGroup) clusterGroup.title = 'Native cluster bodies are active: persistent centers, coherence, speed, steering, variance, pulse, inertia, breathing, bounce/wrap, bias, spread, and minimum spread.';
  const scanGroup = byId('clusters')?.closest('.group');
  if (scanGroup) scanGroup.title = 'Native scanline bands remain active from Milestone 06.';
  const layerGroup = byId('layerPriority')?.closest('.group');
  if (layerGroup) layerGroup.title = 'Native paint ordering between glitch and scanlines. Flow TARGET overrides this order while targeting GLITCH or SCAN; Smoosh supersedes it while enabled.';
  const smooshGroup = byId('smooshOn')?.closest('.group');
  if (smooshGroup) smooshGroup.title = 'Native Smoosh isolates glitch and scanline layers, then blends them with the selected Canvas-style blend mode.';
  const lumaGroup = byId('lumaKeyOn')?.closest('.group');
  if (lumaGroup) lumaGroup.title = 'Native luma key overlays clean source regions onto the persistent effect buffer based on source luminance.';
  const globalMixGroup = byId('globalMixOn')?.closest('.group');
  if (globalMixGroup) globalMixGroup.title = 'Native clean-source mix with selectable blend mode and BEFORE FB / AFTER FB / AFTER FLOW / FINAL placement.';
  const flowGroup = byId('flowOn')?.closest('.group');
  if (flowGroup) flowGroup.title = 'Native cell-quantized flow warp with target routing, historical pulse source, pull, swirl, turbulence, spread, and bounded carry.';
}

function updateConditionalInputs() {
  const renderCustom = byId('renderResolution')?.value === 'custom';
  if (byId('renderCustomW')) byId('renderCustomW').disabled = !renderCustom;
  if (byId('renderCustomH')) byId('renderCustomH').disabled = !renderCustom;
  const historyCustom = byId('historyResolution')?.value === 'custom';
  if (byId('historyCustomW')) byId('historyCustomW').disabled = !historyCustom;
  if (byId('historyCustomH')) byId('historyCustomH').disabled = !historyCustom;
}

async function applyRenderSettings() {
  const values = {
    'render.resolution_mode': byId('renderResolution').value,
    'render.custom_width': Number(byId('renderCustomW').value),
    'render.custom_height': Number(byId('renderCustomH').value),
  };
  await setBatch(values);
  toast('Native render resolution applied');
}

const historyPresets = {
  maximum: { resolution: 'full', capture: 'every', sampling: 'smooth' },
  balanced: { resolution: '50', capture: '24', sampling: 'smooth' },
  performance: { resolution: '25', capture: '15', sampling: 'crisp' },
};

function applyHistoryPresetUi() {
  const preset = historyPresets[byId('historyPreset')?.value];
  if (!preset) return;
  byId('historyResolution').value = preset.resolution;
  byId('historyCaptureRate').value = preset.capture;
  byId('historySampling').value = preset.sampling;
  updateConditionalInputs();
}

async function applyHistorySettings() {
  const values = {
    'history.preset': byId('historyPreset').value,
    'history.resolution': byId('historyResolution').value,
    'history.custom_width': Number(byId('historyCustomW').value),
    'history.custom_height': Number(byId('historyCustomH').value),
    'history.capture_rate': byId('historyCaptureRate').value,
    'history.sampling': byId('historySampling').value,
  };
  await setBatch(values);
  toast('GPU temporal history applied · ring cleared if its allocation changed');
}


async function loadSpoutAdapters(force = false) {
  const select = byId('spoutAdapter');
  if (!select || !appState.info?.spout?.available) return;
  if (appState.spoutAdaptersLoaded && !force) return;
  const previous = select.value || localStorage.getItem('huffSpoutAdapter') || '-1';
  select.disabled = true;
  try {
    const adapters = await call('list_spout_adapters');
    select.replaceChildren(new Option('Automatic / Windows default', '-1'));
    for (const adapter of adapters) {
      select.append(new Option(`${adapter.index}: ${adapter.name}`, String(adapter.index)));
    }
    select.value = [...select.options].some((option) => option.value === previous) ? previous : '-1';
    appState.spoutAdaptersLoaded = true;
  } finally {
    select.disabled = Boolean(appState.info?.spout?.active);
  }
}

function wireGroupsAndModals() {
  for (const label of document.querySelectorAll('.group-label')) {
    label.addEventListener('click', () => label.closest('.group')?.classList.toggle('collapsed'));
  }
  const modalPairs = [
    ['aboutBtn', 'aboutOverlay', 'aboutClose'],
    ['midiBtn', 'midiOverlay', 'midiClose'],
    ['midiPill', 'midiOverlay', 'midiClose'],
    ['oscBtn', 'oscOverlay', 'oscClose'],
    ['oscPill', 'oscOverlay', 'oscClose'],
    ['syphonBtn', 'syphonOverlay', 'syphonClose'],
    ['syphonPill', 'syphonOverlay', 'syphonClose'],
    ['spoutBtn', 'spoutOverlay', 'spoutClose'],
    ['spoutPill', 'spoutOverlay', 'spoutClose'],
  ];
  for (const [openId, overlayId, closeId] of modalPairs) {
    const overlay = byId(overlayId);
    byId(openId)?.addEventListener('click', () => overlay?.classList.add('open'));
    byId(closeId)?.addEventListener('click', () => overlay?.classList.remove('open'));
    overlay?.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.classList.remove('open');
    });
  }
  for (const id of ['spoutBtn', 'spoutPill']) {
    byId(id)?.addEventListener('click', () => loadSpoutAdapters().catch(() => {}));
  }
  byId('spoutAdapterRefresh')?.addEventListener('click', () => loadSpoutAdapters(true).catch(() => {}));
  byId('spoutAdapter')?.addEventListener('change', (event) => {
    localStorage.setItem('huffSpoutAdapter', event.target.value);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') document.querySelectorAll('[id$="Overlay"].open').forEach((element) => element.classList.remove('open'));
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo().catch(() => {});
    }
  }, true);
}

function wireTransport() {
  byId('fileOpenBtn')?.addEventListener('click', async () => {
    const path = await call('open_video_file');
    if (!path) return;
    byId('fileName').textContent = basename(path);
    byId('fileName').title = path;
    // open_video_file already starts native video/audio playback. Calling Play
    // here restarted both decoder workers immediately and made source handoff
    // slower and less deterministic.
    toast(`Loaded ${basename(path)} · video source active`);
  });
  byId('playBtn')?.addEventListener('click', () => call('play_video').catch(() => {}));
  byId('pauseBtn')?.addEventListener('click', () => call('pause_video').catch(() => {}));
  byId('refreshBtn')?.addEventListener('click', async () => {
    await call('seek_video', { seconds: 0 });
    await call('play_video');
  });
  byId('volumeSlider')?.addEventListener('input', (event) => {
    call('set_video_audio_preview', { enabled: true }).catch(() => {});
    call('set_video_audio_volume', { volume: Number(event.target.value) }).catch(() => {});
  });
  byId('playbackRate')?.addEventListener('change', (event) => call('set_video_rate', { rate: Number(event.target.value) }).catch(() => {}));
  byId('loopToggle')?.addEventListener('change', (event) => call('set_video_loop', { looping: event.target.checked }).catch(() => {}));

  const seek = byId('seekBar');
  seek?.addEventListener('pointerdown', () => { appState.timelineDragging = true; });
  seek?.addEventListener('input', () => {
    const duration = appState.info?.video?.durationSeconds || 0;
    byId('timeDisplay').textContent = `${formatTime(Number(seek.value) / 1000 * duration)} / ${formatTime(duration)}`;
  });
  seek?.addEventListener('change', async () => {
    const duration = appState.info?.video?.durationSeconds || 0;
    appState.timelineDragging = false;
    await call('seek_video', { seconds: Number(seek.value) / 1000 * duration });
  });
  seek?.addEventListener('pointerup', () => { appState.timelineDragging = false; });
}

function wireRecording() {
  byId('recordBtn')?.addEventListener('click', async () => {
    const button = byId('recordBtn');
    button.disabled = true;
    try {
      const path = await call('start_recording', {
        fps: Number(byId('recordFps')?.value || 30),
        audioMode: byId('recordAudio')?.value || 'auto',
      });
      if (path) toast(`Recording started · ${basename(path)}`);
    } catch (_) {
      button.disabled = false;
    }
  });
  byId('recordStopBtn')?.addEventListener('click', async () => {
    const button = byId('recordStopBtn');
    button.disabled = true;
    toast('Finalizing recording…');
    try {
      await call('stop_recording');
      toast('Recording finalized');
    } catch (_) {
      button.disabled = false;
    }
  });
}

function wireCamera() {
  byId('camRefreshBtn')?.addEventListener('click', () => call('refresh_cameras').catch(() => {}));
  byId('camStartBtn')?.addEventListener('click', async () => {
    try {
      await call('start_camera', {
        slot: Number(byId('cams')?.value || 0),
        profile: 'speed',
      });
      toast('Camera source active · file playback paused');
    } catch (_) {}
  });
  byId('camStopBtn')?.addEventListener('click', async () => {
    try {
      await call('stop_camera');
      toast('Camera stopped · loaded video restored paused');
    } catch (_) {}
  });
}

function wireNativeActions() {
  byId('status')?.addEventListener('click', () => call('focus_renderer').catch(() => {}));
  byId('resetBtn')?.addEventListener('click', async () => {
    pushUndo();
    await call('reset_parameters');
    await refreshParameterState();
    toast('Native parameters reset');
  });
  byId('clearBufBtn')?.addEventListener('click', () => {
    call('clear_native_buffers').then(() => toast('Native feedback + GPU history cleared')).catch(() => {});
  });
  byId('flowPulseFire')?.addEventListener('click', () => {
    call('fire_flow_pulse').then(() => toast('Flow pulse fired')).catch(() => {});
  });
  byId('resetMotionBtn')?.addEventListener('click', async () => {
    const values = {
      'feedback.translate_x': 0,
      'feedback.translate_y': 0,
      'feedback.scale': 1,
      'feedback.rotation': 0,
    };
    try {
      await setBatch(values);
      await refreshParameterState();
      toast('Feedback motion reset');
    } catch (_) {}
  });
  for (const [buttonId, angle] of [['scanAngleReset', 0], ['scanAngle90n', -90], ['scanAngle90p', 90]]) {
    byId(buttonId)?.addEventListener('click', async () => {
      const element = byId('scanAngle');
      const definition = appState.byLegacy.get('scanAngle');
      if (!element || !definition) return;
      element.value = String(angle);
      updateReadout(element);
      try { await setParameter(definition, angle); } catch (_) {}
    });
  }
  byId('renderResolution')?.addEventListener('change', updateConditionalInputs);
  byId('renderApplyBtn')?.addEventListener('click', () => applyRenderSettings().catch(() => {}));
  byId('historyPreset')?.addEventListener('change', applyHistoryPresetUi);
  byId('historyResolution')?.addEventListener('change', () => {
    byId('historyPreset').value = 'custom';
    updateConditionalInputs();
  });
  byId('historyCaptureRate')?.addEventListener('change', () => { byId('historyPreset').value = 'custom'; });
  byId('historySampling')?.addEventListener('change', () => { byId('historyPreset').value = 'custom'; });
  byId('historyApplyBtn')?.addEventListener('click', () => applyHistorySettings().catch(() => {}));

  byId('syphonToggleBtn')?.addEventListener('click', async () => {
    const current = appState.info?.syphon || {};
    try {
      if (current.active) {
        await call('stop_syphon_output');
        toast('Syphon output stopped');
      } else {
        const renderer = appState.info?.renderer || {};
        const width = Number(renderer.width || byId('syphW')?.value || 1280);
        const height = Number(renderer.height || byId('syphH')?.value || 720);
        byId('syphW').value = String(width);
        byId('syphH').value = String(height);
        await call('start_syphon_output', {
          width,
          height,
          fps: Number(byId('syphFps')?.value || 30),
        });
        toast(`Syphon started · ${width}×${height}`);
      }
    } catch (error) {
      toast(String(error), true);
    }
  });
  byId('spoutToggleBtn')?.addEventListener('click', async () => {
    const current = appState.info?.spout || {};
    try {
      if (current.active) {
        await call('stop_spout_output');
        toast('Spout output stopped');
      } else {
        const renderer = appState.info?.renderer || {};
        const width = Number(renderer.width || byId('spoutW')?.value || 1280);
        const height = Number(renderer.height || byId('spoutH')?.value || 720);
        byId('spoutW').value = String(width);
        byId('spoutH').value = String(height);
        await loadSpoutAdapters().catch(() => {});
        await call('start_spout_output', {
          width,
          height,
          fps: Number(byId('spoutFps')?.value || 30),
          adapterIndex: Number(byId('spoutAdapter')?.value ?? -1),
        });
        toast(`Spout started · ${width}×${height}`);
      }
    } catch (error) {
      toast(String(error), true);
    }
  });
}

function presetStorage() {
  try { return JSON.parse(localStorage.getItem('huffNativePresetsV2') || '{}'); }
  catch (_) { return {}; }
}

function writePresetStorage(presets) {
  localStorage.setItem('huffNativePresetsV2', JSON.stringify(presets));
}

function refreshPresetList(selected = '') {
  const select = byId('presetList');
  if (!select) return;
  const presets = presetStorage();
  select.replaceChildren(new Option('— saved presets —', ''));
  for (const name of Object.keys(presets).sort()) select.append(new Option(name, name));
  if (selected && presets[selected]) select.value = selected;
}

async function applyPresetValues(values, recordUndo = true) {
  const updates = {};
  for (const definition of appState.registry) {
    if (!(definition.id in values) && !(definition.legacyId in values)) continue;
    const value = values[definition.id] ?? values[definition.legacyId];
    updates[definition.id] = value;
    setControlValue(byId(definition.legacyId), definition, value);
  }
  if (Object.keys(updates).length) await setBatch(updates, recordUndo);
  updateConditionalInputs();
}

function wirePresets() {
  refreshPresetList();
  byId('presetSaveBtn')?.addEventListener('click', () => {
    const name = byId('presetName')?.value.trim();
    if (!name) return toast('Enter a preset name', true);
    const presets = presetStorage();
    presets[name] = { _v: 2, engine: 'huff-native-wgpu', values: snapshotDom() };
    writePresetStorage(presets);
    refreshPresetList(name);
    toast(`Saved preset: ${name}`);
  });
  byId('presetLoadBtn')?.addEventListener('click', async () => {
    const name = byId('presetList')?.value;
    const preset = presetStorage()[name];
    if (!preset) return;
    await applyPresetValues(preset.values || preset);
    toast(`Loaded preset: ${name}`);
  });
  byId('presetDeleteBtn')?.addEventListener('click', () => {
    const name = byId('presetList')?.value;
    if (!name) return;
    const presets = presetStorage();
    delete presets[name];
    writePresetStorage(presets);
    refreshPresetList();
    toast(`Deleted preset: ${name}`);
  });
  byId('presetExportBtn')?.addEventListener('click', () => {
    const payload = { _v: 2, engine: 'huff-native-wgpu', values: snapshotDom() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${byId('presetName')?.value.trim() || 'huff-native-preset'}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const input = document.querySelector('#presetLoadInput');
  byId('presetImportBtn')?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      await applyPresetValues(payload.values || payload);
      toast(`Imported ${file.name}`);
    } catch (error) {
      toast(`Preset import failed: ${error}`, true);
    }
    input.value = '';
  });
}

function wireMidiOsc() {
  byId('midiRefreshBtn')?.addEventListener('click', () => call('refresh_midi_ports').catch(() => {}));
  byId('midiConnectBtn')?.addEventListener('click', () => call('connect_midi', { name: byId('midiPortSelect')?.value || '' }).catch(() => {}));
  byId('midiDisconnectBtn')?.addEventListener('click', () => call('disconnect_midi').catch(() => {}));
  byId('midiDebugBtn')?.addEventListener('click', () => console.info('Huff MIDI info', appState.info?.midi));
  for (const id of ['midiLoadMapBtn', 'midiClearMapBtn', 'oscLoadMapBtn', 'oscClearMapBtn']) {
    const button = byId(id);
    if (button) {
      button.disabled = true;
      button.classList.add('native-pending');
      button.title = 'Canonical native mapping editor arrives after parameter parity';
    }
  }
}

function setOptions(select, items, valueOf, labelOf) {
  if (!select) return;
  const values = items.map(valueOf);
  const signature = JSON.stringify(values);
  if (select.dataset.signature === signature) return;
  const previous = select.value;
  select.dataset.signature = signature;
  select.replaceChildren();
  for (const item of items) select.append(new Option(labelOf(item), String(valueOf(item))));
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function displayInfo(info) {
  appState.info = info;
  const renderer = info.renderer || {};
  const video = info.video || {};
  const camera = info.camera || {};
  const videoAudio = info.audio?.video || {};
  const midi = info.midi || {};
  const osc = info.osc || {};
  const syphon = info.syphon || {};
  const spout = info.spout || {};
  const recording = info.recording || {};

  setOptions(byId('cams'), info.cameraDevices || [], (item) => item.slot, (item) => item.name);
  setOptions(byId('midiPortSelect'), midi.ports || [], (item) => item, (item) => item);

  const loaded = Boolean(video.loaded);
  byId('playBtn').disabled = !loaded;
  byId('pauseBtn').disabled = !loaded;
  byId('refreshBtn').disabled = !loaded;
  if (loaded && byId('fileName').textContent === 'no file selected') byId('fileName').textContent = video.fileName || 'video';

  const stateText = video.playing ? 'PLAY' : (loaded ? 'PAUSE' : 'IDLE');
  byId('status').textContent = `NATIVE: ${stateText} · ${(renderer.fps || 0).toFixed(0)} fps`;
  byId('status').title = `${renderer.backend || 'GPU'} · ${renderer.adapter || ''}\nSource: ${info.activeSource || renderer.activeSource || 'automatic'}\nRender ${renderer.width || 0}×${renderer.height || 0}\nSurface ${renderer.surfaceWidth || 0}×${renderer.surfaceHeight || 0}\nGlitch: ${renderer.glitchBaseTiles || 0} tiles · ${renderer.glitchInstances || 0}/${renderer.glitchInstanceCapacity || 0} instances · ${(renderer.glitchGenerationMs || 0).toFixed(2)} ms\nScanlines: ${renderer.scanlinesEnabled ? 'on' : 'off'} · ${renderer.scanBandCount || 0} bands · ${(renderer.scanGenerationMs || 0).toFixed(2)} ms · angle ${(renderer.scanAngle || 0).toFixed(1)}° · layer ${renderer.layerPriority || 'scan'}\nSmoosh: ${renderer.smooshEnabled ? renderer.smooshBlend : 'off'} · Luma: ${renderer.lumaKeyEnabled ? 'on' : 'off'}\nGlobal Mix: ${renderer.globalMixEnabled ? renderer.globalMixPosition : 'off'} · Flow: ${renderer.flowEnabled ? `${renderer.flowTarget} @ ${Number(renderer.flowStrength || 0).toFixed(1)}` : 'off'} · fires ${renderer.flowPulseFires || 0}\nClusters: ${renderer.clusterTilesEnabled ? 'on' : 'off'} · ${renderer.clusterCentersActive || 0} centers · ${renderer.clusterBiasTiles || 0} biased tiles · ${renderer.clusterRerolledOffsets || 0} rerolls · ${renderer.clusterPulses || 0} pulses\nGlitch drops: ${renderer.glitchDroppedInstances || 0}\nVideo decode: ${(video.decodeFps || 0).toFixed(1)} fps · stalls ${video.decoderStalls || 0} · recoveries ${video.watchdogRestarts || 0}\nAudio decode: ${(videoAudio.bufferedMs || 0).toFixed(0)} ms buffered · stalls ${videoAudio.decoderStalls || 0} · recoveries ${videoAudio.watchdogRestarts || 0}\nSurface skips: ${renderer.surfaceSkips || 0} · recoveries: ${renderer.surfaceRecoveries || 0}\nNative output readback: ${renderer.outputReadbacks || 0} frames · ${renderer.outputReadbackDrops || 0} busy drops · ${renderer.outputMapErrors || 0} map errors · ${(renderer.outputCopyMs || 0).toFixed(2)} ms · ${renderer.outputPendingSlots || 0} pending\nClick to focus output`;

  byId('midiPill').textContent = midi.connected ? `MIDI: ${midi.connectedPort}` : 'MIDI: OFF';
  byId('oscPill').textContent = osc.listening ? `OSC :${osc.port}` : 'OSC: OFF';
  byId('syphonPill').textContent = syphon.active
    ? `SYPHON: ${syphon.publishedFrames || 0}`
    : (syphon.available ? 'SYPHON: OFF' : 'SYPHON: N/A');
  byId('spoutPill').textContent = spout.active
    ? (spout.initialized ? `SPOUT: ${spout.publishedFrames || 0}` : 'SPOUT: ARMING')
    : (spout.available ? 'SPOUT: OFF' : 'SPOUT: N/A');

  const recordingBusy = Boolean(recording.active || recording.finalizing);
  const recordPill = byId('recordPill');
  if (recordPill) {
    recordPill.classList.toggle('recording-active', Boolean(recording.active));
    recordPill.classList.toggle('recording-finalizing', Boolean(recording.finalizing));
    recordPill.textContent = recording.active
      ? `REC: ${formatTime(recording.durationSeconds || 0)} · ${recording.fps || 0}`
      : (recording.finalizing ? 'REC: FINALIZING' : 'REC: OFF');
    recordPill.title = recording.active
      ? `${recording.path || ''}
${recording.width || 0}×${recording.height || 0} @ ${recording.fps || 0} CFR
Audio: ${recording.audioSource || 'none'} ${recording.audioSampleRate || 0} Hz · ${recording.audioChannels || 0} ch
Video: ${recording.videoFrames || 0} encoded · ${recording.duplicatedFrames || 0} duplicated · ${recording.skippedFrames || 0} skipped · ${recording.rejectedFrames || 0} rejected
Submission drops: ${recording.videoSubmissionDrops || 0}
Audio: ${recording.audioSamples || 0} samples · ${recording.audioDroppedChunks || 0} dropped chunks · ${recording.audioQueueDepth || 0} queued
Approx: ${((recording.estimatedBytes || 0) / 1048576).toFixed(1)} MiB`
      : (recording.lastError || (recording.ffmpegAvailable ? 'Native MP4 recording ready' : 'FFmpeg unavailable'));
  }
  if (byId('recordBtn')) byId('recordBtn').disabled = recordingBusy || !recording.ffmpegAvailable;
  if (byId('recordStopBtn')) byId('recordStopBtn').disabled = !recording.active;
  if (byId('recordFps')) byId('recordFps').disabled = recordingBusy;
  if (byId('recordAudio')) byId('recordAudio').disabled = recordingBusy;
  if (byId('renderApplyBtn')) byId('renderApplyBtn').disabled = recordingBusy;
  if (byId('resetBtn')) byId('resetBtn').disabled = recordingBusy;
  if (byId('presetLoadBtn')) byId('presetLoadBtn').disabled = recordingBusy;
  if (byId('presetImportBtn')) byId('presetImportBtn').disabled = recordingBusy;

  const syphonButton = byId('syphonToggleBtn');
  if (syphonButton) {
    syphonButton.disabled = !syphon.available;
    syphonButton.textContent = syphon.active ? '■ Stop' : '▶ Start';
    syphonButton.classList.toggle('active', Boolean(syphon.active));
  }
  const spoutButton = byId('spoutToggleBtn');
  if (spoutButton) {
    spoutButton.disabled = !spout.available;
    spoutButton.textContent = spout.active ? '■ Stop' : '▶ Start';
    spoutButton.classList.toggle('active', Boolean(spout.active));
  }
  if (byId('spoutAdapter')) {
    byId('spoutAdapter').disabled = !spout.available || Boolean(spout.active);
  }
  if (byId('spoutAdapterRefresh')) byId('spoutAdapterRefresh').disabled = !spout.available || Boolean(spout.active);

  const renderWidth = Number(renderer.width || 0);
  const renderHeight = Number(renderer.height || 0);
  for (const [widthId, heightId, active] of [
    ['syphW', 'syphH', syphon.active],
    ['spoutW', 'spoutH', spout.active],
  ]) {
    const widthInput = byId(widthId);
    const heightInput = byId(heightId);
    if (!active && document.activeElement !== widthInput && renderWidth) widthInput.value = String(renderWidth);
    if (!active && document.activeElement !== heightInput && renderHeight) heightInput.value = String(renderHeight);
  }

  if (byId('syphonStatus')) {
    byId('syphonStatus').textContent = syphon.active
      ? `Active · ${syphon.width}×${syphon.height} @ ${syphon.fps} fps · ${syphon.publishedFrames || 0} published · ${syphon.replacedFrames || 0} replaced · ${Number(syphon.lastUploadUs || 0)} µs upload`
      : (syphon.lastError || (syphon.available ? 'Not started — native output follows the current R: render size.' : 'Unavailable on this platform.'));
    byId('syphonStatus').className = syphon.active ? 'active' : (syphon.lastError && syphon.available ? 'error' : '');
  }
  if (byId('spoutStatus')) {
    byId('spoutStatus').textContent = spout.active
      ? `${spout.initialized ? 'Active' : 'Armed — waiting for first frame'} · ${spout.senderName || 'huff'} · ${spout.width}×${spout.height} @ ${spout.fps} fps cap · ${spout.publishedFrames || 0} sent · ${spout.replacedFrames || 0} replaced · ${Number(spout.lastUploadUs || 0)} µs upload`
      : (spout.lastError || (spout.available ? 'Not started — choose the receiver GPU adapter, then start native Spout output.' : 'Unavailable on this platform.'));
    byId('spoutStatus').className = spout.active ? 'active' : (spout.lastError && spout.available ? 'error' : '');
  }
  if (byId('syphonFrameCount')) byId('syphonFrameCount').textContent = syphon.active
    ? `${syphon.receivedFrames || 0} readbacks · ${Number(syphon.lastFrameAgeMs || 0).toFixed(1)} ms age`
    : '';
  if (byId('spoutFrameCount')) byId('spoutFrameCount').textContent = spout.active
    ? `${spout.receivedFrames || 0} readbacks · ${Number(spout.lastFrameAgeMs || 0).toFixed(1)} ms age · DX ${(spout.senderFps || 0).toFixed(1)} fps · adapter ${spout.adapterIndex ?? -1}${spout.adapterName ? ` (${spout.adapterName})` : ''}`
    : '';

  if (byId('midiBridgeStatus')) byId('midiBridgeStatus').textContent = midi.connected
    ? `${midi.connectedPort} · ${(midi.messagesPerSecond || 0).toFixed(1)} msg/s`
    : (midi.lastError || 'Not connected');
  if (byId('oscStatusBox')) {
    byId('oscStatusBox').textContent = osc.listening
      ? `Listening on ${osc.localAddress || `0.0.0.0:${osc.port}`}`
      : (osc.lastError || 'OSC stopped');
    byId('oscStatusBox').className = osc.listening ? 'ok' : 'error';
  }

  if (!appState.timelineDragging && loaded) {
    const duration = Math.max(Number(video.durationSeconds || 0), 0.001);
    byId('seekBar').value = String(Math.round(Number(video.positionSeconds || 0) / duration * 1000));
    byId('timeDisplay').textContent = `${formatTime(video.positionSeconds)} / ${formatTime(duration)}`;
  }
  if (loaded) {
    byId('playbackRate').value = String(video.playbackRate || 1);
    byId('loopToggle').checked = Boolean(video.looping);
  }
  if (videoAudio.volume != null && document.activeElement !== byId('volumeSlider')) byId('volumeSlider').value = String(videoAudio.volume);

  byId('dim').textContent = `R: ${renderer.width || 0}×${renderer.height || 0}`;
  byId('dim').title = `Internal native render size\nSurface: ${renderer.surfaceWidth || 0}×${renderer.surfaceHeight || 0}\nMode: ${renderer.renderMode || 'match'}`;
  byId('historyDim').textContent = `H: ${renderer.historyWidth || 0}×${renderer.historyHeight || 0}`;
  byId('historyDim').title = `${renderer.historyStatus || 'configured'}\nCapture: ${renderer.historyCaptureRate || 'every'}\nSampling: ${renderer.historySampling || 'smooth'}\nGlitch tiles: ${renderer.glitchBaseTiles || 0} · instances: ${renderer.glitchInstances || 0}\nClusters: ${renderer.clusterTilesEnabled ? 'on' : 'off'} · ${renderer.clusterCentersActive || 0} centers · ${renderer.clusterBiasTiles || 0} biased\nScanlines: ${renderer.scanlinesEnabled ? 'on' : 'off'} · ${renderer.scanBandCount || 0} bands\nSmoosh: ${renderer.smooshEnabled ? renderer.smooshBlend : 'off'} · Luma: ${renderer.lumaKeyEnabled ? 'on' : 'off'}\nGlobal Mix: ${renderer.globalMixEnabled ? renderer.globalMixPosition : 'off'} · Flow: ${renderer.flowEnabled ? renderer.flowTarget : 'off'}`;

  if (camera.streaming) byId('camStartBtn').textContent = `⬤ ${camera.captureFps?.toFixed?.(0) || ''}fps`;
  else byId('camStartBtn').textContent = '⬤ Cam';
}

async function poll() {
  try {
    const info = await call('get_app_info');
    displayInfo(info);
    if (info.parameterRevision !== appState.revision && !appState.syncing) await refreshParameterState();
  } catch (_) {}
}

async function boot() {
  const form = byId('controlsForm');
  if (form) {
    form.addEventListener('submit', (event) => event.preventDefault());
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) {
        event.preventDefault();
        event.target.blur();
      }
    });
  }
  wireGroupsAndModals();
  if (!bridgeReady) {
    byId('status').textContent = 'NATIVE: BRIDGE ERROR';
    toast('Tauri bridge unavailable', true);
    return;
  }
  appState.registry = await call('get_parameter_registry');
  appState.byLegacy = new Map(appState.registry.map((definition) => [definition.legacyId, definition]));
  appState.byId = new Map(appState.registry.map((definition) => [definition.id, definition]));
  configureRegistryControls();
  wireTransport();
  wireRecording();
  wireCamera();
  wireNativeActions();
  wirePresets();
  wireMidiOsc();
  await call('set_video_audio_preview', { enabled: true }).catch(() => {});
  await refreshParameterState();
  await poll();
  setInterval(poll, 250);
  console.info('Huff Native wgpu Milestone 09 loaded', {
    parameters: appState.registry.length,
    implemented: appState.registry.filter((definition) => definition.implemented).length,
  });
}

boot().catch((error) => toast(`Startup failed: ${error}`, true));
