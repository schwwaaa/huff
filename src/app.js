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
  exportCompleted: 0,
  offlineCompleted: 0,
  queueStatuses: new Map(),
  queueInitialized: false,
  parityReport: null,
  parityRefreshTimer: 0,
  controlTargets: [],
  midiMapSignature: '',
  oscMapSignature: '',
  stateModelCatalog: null,
  routingCatalog: null,
  routingPlan: null,
  productionReport: null,
  interopReport: null,
  interopProbe: null,
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

function scheduleParityRefresh(delay = 320) {
  if (!bridgeReady || !byId('parityStatus')) return;
  clearTimeout(appState.parityRefreshTimer);
  appState.parityRefreshTimer = setTimeout(() => {
    refreshParityReport(true).catch(() => {});
  }, delay);
}

function basename(path) {
  return String(path || '').split(/[\\/]/).filter(Boolean).pop() || 'no file selected';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
  scheduleParityRefresh();
}

async function setBatch(values, recordUndo = true, automationLabel = '') {
  if (recordUndo) pushUndo();
  const revision = await call('set_parameter_batch', {
    values,
    automationLabel: automationLabel || null,
  });
  Object.assign(appState.values, values);
  appState.revision = revision;
  scheduleParityRefresh();
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
  if (glitchGroup) glitchGroup.title = "Native glitch, scan, feedback, Flow, history, and final compositing now execute at the requested deterministic export resolution.";
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

function routingBusLabel(value) {
  if (value === 'clean') return 'CLEAN';
  if (value === 'field_store') return 'FIELD STORE';
  return 'PROGRAM';
}

function displayRoutingPlan(plan) {
  appState.routingPlan = plan || null;
  const status = byId('routingStatus');
  if (!status || !plan) return;
  status.textContent = String(plan.summary || 'ROUTING READY').toUpperCase();
  status.title = [
    `Schema: ${plan.schema || 'huff-routing/v1'}`,
    `Topology: ${plan.topology || 'constrained fixed recipe'}`,
    ...(Array.isArray(plan.warnings) ? plan.warnings : []),
  ].join('\n');
  const path = byId('routingPath');
  if (path) {
    path.textContent = `CLEAN → PROCESS → FIELD STORE · PROGRAM ← ${routingBusLabel(plan.programBus)} · HISTORY → PROCESS · MASK → PROCESS · MONITOR ← ${routingBusLabel(plan.monitorBus)}`;
  }
  for (const bus of document.querySelectorAll('#routingBusGrid [data-bus]')) {
    const id = bus.dataset.bus;
    const active = id === plan.programBus || id === plan.monitorBus
      || (id === 'program' && plan.programBus === 'program')
      || id === 'monitor';
    bus.classList.toggle('active', Boolean(active));
  }
}

function displayRoutingFromRenderer(renderer = {}) {
  if (!byId('routingStatus')) return;
  const plan = {
    schema: 'huff-routing/v1',
    topology: 'constrained_named_bus_fixed_recipe',
    programBus: renderer.programBus || appState.values['routing.program_bus'] || 'program',
    monitorBus: renderer.monitorBus || appState.values['routing.monitor_bus'] || 'program',
    flowTarget: renderer.flowTarget || appState.values['flow.flow_target'] || 'final',
    layerPriority: renderer.layerPriority || appState.values['layers.layer_priority'] || 'scan',
    globalMixPosition: renderer.globalMixPosition || appState.values['global_mix.global_mix_pos'] || 'after',
    warnings: [],
  };
  plan.summary = renderer.routingSummary
    || `Program <- ${routingBusLabel(plan.programBus)} | Monitor <- ${routingBusLabel(plan.monitorBus)} | Flow -> ${String(plan.flowTarget).toUpperCase()}`;
  if (plan.monitorBus !== 'program') plan.warnings.push('Native window is monitoring a diagnostic bus; external outputs follow Program.');
  displayRoutingPlan(plan);
}

async function refreshRoutingPlan(silent = false) {
  try {
    const plan = await call('get_routing_plan');
    displayRoutingPlan(plan);
    return plan;
  } catch (error) {
    if (!silent) toast(`Routing inspection failed: ${error}`, true);
    return null;
  }
}

async function wireRouting() {
  const catalog = await call('get_routing_catalog');
  appState.routingCatalog = catalog;
  const select = byId('routingRecipe');
  if (select) {
    select.innerHTML = '<option value="">— routing recipe —</option>'
      + (catalog.recipes || []).map((recipe) => `<option value="${escapeHtml(recipe.id)}" title="${escapeHtml(recipe.description)}">${escapeHtml(recipe.label)}</option>`).join('');
  }
  byId('routingApplyBtn')?.addEventListener('click', async () => {
    const recipeId = select?.value || '';
    if (!recipeId) return toast('Choose a routing recipe first', true);
    const snapshot = await call('apply_routing_recipe', { recipeId });
    applyStateToDom(snapshot);
    await refreshRoutingPlan(true);
    const recipe = (catalog.recipes || []).find((entry) => entry.id === recipeId);
    toast(`Routing recipe applied · ${recipe?.label || recipeId}`);
  });
  byId('routingRefreshBtn')?.addEventListener('click', () => refreshRoutingPlan(false));
  byId('routingExportBtn')?.addEventListener('click', async () => {
    const path = await call('export_routing_plan');
    if (path) toast(`Routing plan exported · ${basename(path)}`);
  });
}

function displayParityReport(report) {
  appState.parityReport = report;
  const status = byId('parityStatus');
  if (!status || !report) return;
  const exact = Number(report.exactContractParameters || 0);
  const contract = Number(report.legacyContractParameters || 0);
  const mismatchFields = Number(report.contractMismatchFields || 0);
  const changed = Number(report.currentValuesDifferentFromLegacyDefaults || 0);
  status.textContent = mismatchFields
    ? `CONTRACT ERROR: ${exact}/${contract} · ${mismatchFields} fields`
    : `CONTRACT ${exact}/${contract} · CURRENT Δ ${changed}`;
  status.classList.toggle('error', mismatchFields > 0);
  status.classList.toggle('warn', mismatchFields === 0 && changed > 0);
  const nativeOnly = Array.isArray(report.nativeOnlyParameters) ? report.nativeOnlyParameters : [];
  const differences = Array.isArray(report.currentDifferences) ? report.currentDifferences : [];
  status.title = [
    `Legacy contract: ${exact}/${contract} exact parameters`,
    `Native registry: ${report.nativeRegistryParameters || 0}`,
    `Native-only: ${nativeOnly.length}${nativeOnly.length ? ` · ${nativeOnly.join(', ')}` : ''}`,
    `Current values away from legacy defaults: ${changed}`,
    differences.length ? `Changed: ${differences.slice(0, 18).map((entry) => entry.legacyId).join(', ')}${differences.length > 18 ? '…' : ''}` : 'Current mapped controls equal legacy defaults',
  ].join('\n');
}

async function refreshParityReport(silent = false) {
  const report = await call('get_parity_report');
  displayParityReport(report);
  if (!silent) {
    const mismatchFields = Number(report.contractMismatchFields || 0);
    const changed = Number(report.currentValuesDifferentFromLegacyDefaults || 0);
    toast(mismatchFields
      ? `Parity contract has ${mismatchFields} mismatched fields`
      : `Legacy contract exact · ${changed} current value${changed === 1 ? '' : 's'} changed`, mismatchFields > 0);
  }
  return report;
}

async function loadCalibrationProfiles() {
  const select = byId('calibrationProfile');
  if (!select) return;
  const profiles = await call('get_calibration_profiles');
  select.replaceChildren();
  for (const profile of profiles) {
    const option = new Option(profile.title, profile.id);
    option.title = profile.description || '';
    select.append(option);
  }
  if (profiles.some((profile) => profile.id === 'legacy-defaults')) select.value = 'legacy-defaults';
  select.title = profiles.map((profile) => `${profile.title}: ${profile.description}`).join('\n\n');
}

function wireParity() {
  byId('calibrationApplyBtn')?.addEventListener('click', async () => {
    const profileId = byId('calibrationProfile')?.value;
    if (!profileId) return;
    try {
      const snapshot = await call('apply_calibration_profile', { profileId });
      applyStateToDom(snapshot);
      const title = byId('calibrationProfile')?.selectedOptions?.[0]?.textContent || profileId;
      toast(`${title} applied · persistent buffers cleared`);
      await refreshParityReport(true);
    } catch (_) {}
  });
  byId('parityCompareBtn')?.addEventListener('click', () => refreshParityReport(false).catch(() => {}));
  byId('parityExportBtn')?.addEventListener('click', async () => {
    try {
      const path = await call('export_parity_report');
      if (path) toast(`Parity report saved · ${basename(path)}`);
    } catch (_) {}
  });
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
    ['verifyBtn', 'productionOverlay', 'productionClose'],
    ['interopBtn', 'interopOverlay', 'interopClose'],
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


function renderProductionReport(report) {
  appState.productionReport = report;
  const summary = byId('productionSummary');
  const status = report?.overallStatus || 'unknown';
  if (summary) {
    summary.className = `production-summary ${status === 'pass' ? '' : status}`.trim();
    summary.textContent = report
      ? `${status.toUpperCase()} · ${report.passed || 0} passed · ${report.warnings || 0} warning(s) · ${report.failures || 0} failure(s) · ${report.informational || 0} informational`
      : 'Production report unavailable.';
  }

  const platform = report?.platform || {};
  const platformBox = byId('productionPlatform');
  if (platformBox) {
    const items = [
      ['Platform', `${platform.os || 'unknown'} / ${platform.arch || 'unknown'}`],
      ['Backend target', platform.expectedBackend || 'unknown'],
      ['Application', `${platform.engineBuild || '—'} / ${platform.appVersion || '—'}`],
      ['Build', platform.debugBuild ? 'Debug' : 'Release'],
      ['Requested backend', platform.requestedBackend || 'Automatic'],
      ['Requested adapter', platform.requestedAdapter || 'Automatic'],
      ['FFmpeg', platform.ffmpegVersion || 'Unavailable'],
      ['FFprobe', platform.ffprobeVersion || 'Unavailable'],
    ];
    platformBox.innerHTML = items
      .map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</div>`)
      .join('');
  }

  const checks = byId('productionChecks');
  if (checks) {
    checks.innerHTML = (report?.checks || []).map((check) => `
      <div class="production-check ${escapeHtml(check.status || 'info')}">
        <div class="status">${escapeHtml(String(check.status || 'info').toUpperCase())}</div>
        <div class="category">${escapeHtml(check.category || '')}</div>
        <div class="label">${escapeHtml(check.label || '')}</div>
        <div class="result">
          <div>${escapeHtml(check.summary || '')}</div>
          <div class="detail">${escapeHtml(check.detail || '')}</div>
        </div>
      </div>
    `).join('');
  }

  const verify = byId('verifyBtn');
  if (verify) {
    verify.textContent = status === 'pass' ? 'VERIFY ✓' : status === 'fail' ? 'VERIFY !' : 'VERIFY △';
    verify.title = report ? `${report.passed || 0} pass · ${report.warnings || 0} warnings · ${report.failures || 0} failures` : 'Production verification';
  }
}

async function runProductionCheck() {
  const button = byId('productionRunBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Checking…';
  }
  try {
    const report = await call('run_production_check');
    renderProductionReport(report);
    return report;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = '▶ Run Check';
    }
  }
}

async function recoverProduction(scope) {
  const status = byId('productionRecoveryStatus');
  if (status) status.textContent = `Recovery ${scope}: working…`;
  const receipt = await call('recover_live_runtime', { scope });
  const actions = receipt?.actions || [];
  const warnings = receipt?.warnings || [];
  if (status) {
    status.textContent = [
      ...actions.map((line) => `✓ ${line}`),
      ...warnings.map((line) => `△ ${line}`),
    ].join('\n') || 'No recovery action was required.';
  }
  toast(actions.length ? `Recovery requested: ${scope}` : `Recovery check: ${scope}`);
  await new Promise((resolve) => setTimeout(resolve, 450));
  await runProductionCheck();
}

function wireProduction() {
  byId('verifyBtn')?.addEventListener('click', () => {
    if (!appState.productionReport) runProductionCheck().catch(() => {});
  });
  byId('productionRunBtn')?.addEventListener('click', () => runProductionCheck().catch(() => {}));
  byId('productionRecoverSurfaceBtn')?.addEventListener('click', () => recoverProduction('surface').catch(() => {}));
  byId('productionRecoverSourceBtn')?.addEventListener('click', () => recoverProduction('source').catch(() => {}));
  byId('productionRecoverOutputsBtn')?.addEventListener('click', () => recoverProduction('outputs').catch(() => {}));
  byId('productionRecoverAllBtn')?.addEventListener('click', () => recoverProduction('all').catch(() => {}));
  byId('productionExportBtn')?.addEventListener('click', async () => {
    const path = await call('export_diagnostics_bundle');
    if (path) toast(`Diagnostics saved: ${path}`);
  });
}


function renderInteropReport(report) {
  appState.interopReport = report;
  const summary = byId('interopSummary');
  if (summary) {
    summary.textContent = report
      ? `${String(report.currentPathStatus || 'unknown').toUpperCase()} · ${report.width || 0}×${report.height || 0} @ ${report.referenceFps || 0} fps · ${Number(report.readbackMibPerSecond || 0).toFixed(1)} MiB/s for each full-frame transfer stage`
      : 'Interoperability report unavailable.';
  }

  const metrics = byId('interopMetrics');
  if (metrics) {
    const platform = report?.platform || {};
    const items = [
      ['Platform', `${platform.os || 'unknown'} / ${platform.arch || 'unknown'}`],
      ['Backend', platform.backend || 'unknown'],
      ['Adapter', platform.adapter || 'unknown'],
      ['Current transport', report?.currentTransport || 'unknown'],
      ['Frame bytes', Number(report?.bytesPerFrame || 0).toLocaleString()],
      ['Reference rate', `${report?.referenceFps || 0} fps`],
      ['Readback traffic', `${Number(report?.readbackMibPerSecond || 0).toFixed(1)} MiB/s`],
      ['Native sharing', 'Research only · disabled'],
    ];
    metrics.innerHTML = items
      .map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</div>`)
      .join('');
  }

  const path = byId('interopPath');
  if (path) {
    path.innerHTML = (report?.currentCopyPath || [])
      .map((stage, index) => `<div class="interop-path-stage"><span>${index + 1}</span>${escapeHtml(stage)}</div>`)
      .join('');
  }

  const candidates = byId('interopCandidates');
  if (candidates) {
    candidates.innerHTML = (report?.candidates || []).map((candidate) => `
      <div class="interop-candidate ${escapeHtml(candidate.status || 'not-applicable')}">
        <div class="interop-candidate-head">
          <strong>${escapeHtml(candidate.label || '')}</strong>
          <span>${escapeHtml(String(candidate.status || '').toUpperCase())}</span>
        </div>
        <div class="interop-candidate-meta">${escapeHtml(candidate.platform || '')} · ${escapeHtml(candidate.backend || '')} · ${escapeHtml(candidate.output || '')}</div>
        <div>CPU round trips: ${escapeHtml(candidate.cpuRoundTrips || '')} · GPU copies: ${escapeHtml(candidate.gpuCopies || '')} · risk: ${escapeHtml(candidate.risk || '')}</div>
        <div class="interop-detail">${escapeHtml(candidate.recommendation || '')}</div>
        <details>
          <summary>Requirements and blockers</summary>
          <div class="interop-detail"><strong>Requirements:</strong> ${escapeHtml((candidate.requirements || []).join(' · '))}</div>
          <div class="interop-detail"><strong>Blockers:</strong> ${escapeHtml((candidate.blockers || []).join(' · '))}</div>
        </details>
      </div>
    `).join('');
  }

  const next = byId('interopNextStep');
  if (next) next.textContent = report?.recommendedNextStep || '';
}

async function runInteropAnalysis() {
  const button = byId('interopRunBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Analyzing…';
  }
  try {
    const report = await call('run_interop_analysis');
    renderInteropReport(report);
    return report;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = '▶ Analyze Current Path';
    }
  }
}

async function runInteropProbe() {
  const button = byId('interopProbeBtn');
  const status = byId('interopProbeStatus');
  if (button) {
    button.disabled = true;
    button.textContent = 'Probing…';
  }
  if (status) status.textContent = 'Running a bounded host-memory copy probe…';
  try {
    const probe = await call('run_interop_copy_probe');
    appState.interopProbe = probe;
    if (status) {
      status.textContent = `${Number(probe.throughputMibPerSecond || 0).toFixed(0)} MiB/s host memcpy · estimated ${Number(probe.estimatedFullFrameCopyMs || 0).toFixed(3)} ms per ${probe.requestedWidth || 0}×${probe.requestedHeight || 0} RGBA frame · ${Number(probe.estimated60FpsCpuSharePercent || 0).toFixed(1)}% of one second at 60 fps. ${probe.note || ''}`;
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Run CPU Copy Probe';
    }
  }
}

function wireInterop() {
  byId('interopBtn')?.addEventListener('click', () => {
    if (!appState.interopReport) runInteropAnalysis().catch(() => {});
  });
  byId('interopRunBtn')?.addEventListener('click', () => runInteropAnalysis().catch(() => {}));
  byId('interopProbeBtn')?.addEventListener('click', () => runInteropProbe().catch(() => {}));
  byId('interopExportBtn')?.addEventListener('click', async () => {
    const path = await call('export_interop_report');
    if (path) toast(`Interop report saved: ${path}`);
  });
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

function exportDimensionsFromPreset() {
  const preset = byId('exportPreset')?.value || 'native';
  const renderer = appState.info?.renderer || {};
  if (preset === '1080p') return [1920, 1080];
  if (preset === '4k') return [3840, 2160];
  if (preset === '8k') return [7680, 4320];
  if (preset === 'custom') {
    return [
      Math.max(1, Math.min(8192, Math.round(Number(byId('exportW')?.value || 1920)))),
      Math.max(1, Math.min(8192, Math.round(Number(byId('exportH')?.value || 1080)))),
    ];
  }
  return [Math.max(1, Number(renderer.width || 1)), Math.max(1, Number(renderer.height || 1))];
}

function syncExportDimensions(force = false) {
  const preset = byId('exportPreset')?.value || 'native';
  const custom = preset === 'custom';
  const [width, height] = exportDimensionsFromPreset();
  const widthInput = byId('exportW');
  const heightInput = byId('exportH');
  if (widthInput && (force || !custom || document.activeElement !== widthInput)) widthInput.value = String(width);
  if (heightInput && (force || !custom || document.activeElement !== heightInput)) heightInput.value = String(height);
  if (widthInput) widthInput.disabled = !custom;
  if (heightInput) heightInput.disabled = !custom;
}

function wireExport() {
  byId('exportPreset')?.addEventListener('change', () => syncExportDimensions(true));
  byId('exportStillBtn')?.addEventListener('click', async () => {
    const button = byId('exportStillBtn');
    button.disabled = true;
    const [width, height] = exportDimensionsFromPreset();
    try {
      const path = await call('export_still', {
        width,
        height,
        sampling: byId('exportSampling')?.value || 'smooth',
        fitMode: byId('exportFit')?.value || 'fit',
      });
      if (path) toast(`PNG capture queued · ${width}×${height} · ${basename(path)}`);
      else button.disabled = false;
    } catch (_) {
      button.disabled = false;
    }
  });
  syncExportDimensions(true);
}

function selectedOfflineProfile() {
  return byId('offlineProfile')?.value || 'h264';
}

function offlineProfileSupportsAlpha(profile = selectedOfflineProfile()) {
  return ['prores_4444', 'ffv1', 'png_sequence'].includes(profile);
}

function offlineProfileRequiresEvenDimensions(profile = selectedOfflineProfile()) {
  return ['h264', 'prores_hq'].includes(profile);
}

function offlineProfileLabel(profile = selectedOfflineProfile()) {
  return {
    h264: 'H.264 MP4',
    prores_hq: 'ProRes 422 HQ',
    prores_4444: 'ProRes 4444',
    ffv1: 'FFV1 Lossless',
    png_sequence: 'PNG Sequence',
  }[profile] || 'H.264 MP4';
}

function offlineDimensionsFromPreset() {
  const preset = byId('offlinePreset')?.value || 'native';
  const renderer = appState.info?.renderer || {};
  const normalizeDimension = (value) => {
    const bounded = Math.max(1, Math.min(8192, Math.round(Number(value || 1))));
    if (!offlineProfileRequiresEvenDimensions()) return bounded;
    if (bounded % 2 === 0) return bounded;
    return bounded >= 8192 ? 8190 : bounded + 1;
  };
  if (preset === '1080p') return [1920, 1080];
  if (preset === '4k') return [3840, 2160];
  if (preset === '8k') return [7680, 4320];
  if (preset === 'custom') {
    return [normalizeDimension(byId('offlineW')?.value || 1920), normalizeDimension(byId('offlineH')?.value || 1080)];
  }
  return [normalizeDimension(renderer.width || 1), normalizeDimension(renderer.height || 1)];
}

function syncOfflineProfile() {
  const profile = selectedOfflineProfile();
  const alpha = byId('offlineAlpha');
  const alphaSupported = offlineProfileSupportsAlpha(profile);
  if (alpha) {
    alpha.disabled = !alphaSupported;
    if (!alphaSupported) alpha.checked = false;
    if (profile === 'prores_4444' && !alpha.checked) alpha.checked = true;
  }
  const button = byId('offlineExportBtn');
  if (button) button.textContent = profile === 'png_sequence' ? '＋ Queue Frames' : '＋ Queue Video';
  const audio = byId('offlineAudio');
  if (audio) {
    const sourceOption = [...audio.options].find((option) => option.value === 'source');
    if (sourceOption) sourceOption.textContent = profile === 'png_sequence' ? 'SOURCE AUDIO + WAV' : 'SOURCE AUDIO';
  }
  syncOfflineDimensions(true);
}

function syncOfflineDimensions(force = false) {
  const preset = byId('offlinePreset')?.value || 'native';
  const [width, height] = offlineDimensionsFromPreset();
  const widthInput = byId('offlineW');
  const heightInput = byId('offlineH');
  if (force || preset !== 'custom') {
    if (widthInput) widthInput.value = String(width);
    if (heightInput) heightInput.value = String(height);
  }
  const custom = preset === 'custom';
  if (widthInput) widthInput.disabled = !custom;
  if (heightInput) heightInput.disabled = !custom;
  const customStart = byId('offlineStartMode')?.value === 'custom';
  if (byId('offlineStartSeconds')) byId('offlineStartSeconds').disabled = !customStart;
}

function syncOfflineAutomation() {
  const active = byId('offlineAutomation')?.value === 'active';
  const loop = byId('offlineAutomationLoop');
  if (loop) {
    loop.disabled = !active;
    if (!active) loop.checked = false;
  }
}

function queueStatusLabel(status) {
  return {
    queued: 'QUEUED',
    starting: 'STARTING',
    running: 'RUNNING',
    completed: 'COMPLETE',
    failed: 'FAILED',
    cancelled: 'CANCELLED',
    interrupted: 'INTERRUPTED',
  }[status] || String(status || 'UNKNOWN').toUpperCase();
}

function renderExportQueue(queue = {}) {
  const jobs = Array.isArray(queue.jobs) ? queue.jobs : [];
  const summary = byId('exportQueueSummary');
  const waiting = byId('exportQueueWaiting');
  const list = byId('exportQueueList');
  const pause = byId('exportQueuePauseBtn');
  if (summary) {
    const pending = Number(queue.queuedCount || 0);
    const running = Number(queue.runningCount || 0);
    const terminal = Number(queue.completedCount || 0)
      + Number(queue.failedCount || 0)
      + Number(queue.cancelledCount || 0)
      + Number(queue.interruptedCount || 0);
    summary.textContent = jobs.length
      ? `QUEUE: ${pending} WAITING · ${running} ACTIVE · ${terminal} HISTORY`
      : 'QUEUE: EMPTY';
    summary.title = `Durable queue: ${queue.persistencePath || '—'}`;
  }
  if (waiting) waiting.textContent = queue.waitingReason ? `WAIT: ${queue.waitingReason}` : '';
  if (pause) pause.textContent = queue.paused ? '▶ Resume Queue' : 'Ⅱ Pause Queue';
  if (!list) return;
  if (!jobs.length) {
    list.innerHTML = '<div class="export-queue-empty">No deterministic export jobs have been queued.</div>';
  } else {
    list.innerHTML = jobs.map((job) => {
      const status = String(job.status || 'queued');
      const progress = Math.max(0, Math.min(1, Number(job.progress || 0)));
      const percent = status === 'completed' ? 100 : progress * 100;
      const queued = status === 'queued';
      const active = status === 'starting' || status === 'running';
      const retryable = Boolean(job.retryable);
      const completed = status === 'completed';
      const actions = [];
      if (queued) {
        actions.push('<button data-action="up" title="Move earlier">↑</button>');
        actions.push('<button data-action="down" title="Move later">↓</button>');
        actions.push('<button data-action="cancel-job" title="Cancel before it starts">■</button>');
      }
      if (active) actions.push('<button data-action="cancel-active" title="Cancel active export">■ Cancel</button>');
      if (retryable) actions.push('<button data-action="retry" title="Restart from frame zero using the frozen job state">↻ Retry</button>');
      if (completed || retryable) actions.push('<button data-action="repeat" title="Clone this frozen job and choose a new output destination">⧉ Repeat</button>');
      if (job.removable && !queued) actions.push('<button data-action="remove" title="Remove from queue history">✕</button>');
      const warning = !job.sourceExists ? ' · SOURCE MISSING' : '';
      const details = job.lastError || `${job.sourcePath || ''}
${job.outputPath || ''}`;
      return `<div class="export-queue-job" data-status="${escapeHtml(status)}" data-job-id="${escapeHtml(job.id)}" title="${escapeHtml(details)}">
        <div class="export-queue-job-meta">${escapeHtml(queueStatusLabel(status))}${warning} · #${Number(job.attempts || 0)}</div>
        <div class="export-queue-job-path">${escapeHtml(basename(job.outputPath))} · ${escapeHtml(job.profileLabel || job.profile || '')} · ${Number(job.width || 0)}×${Number(job.height || 0)} @ ${Number(job.fps || 0)}${job.automationEnabled ? ` · AUTO ${escapeHtml(job.automationName || 'clip')}${job.automationLoop ? ' ↻' : ''}` : ''}</div>
        <div class="export-queue-progress"><span style="width:${percent.toFixed(2)}%"></span><em>${percent.toFixed(1)}% · ${Number(job.renderedFrames || 0)}/${Number(job.totalFrames || 0)}</em></div>
        <div class="export-queue-actions">${actions.join('')}</div>
      </div>`;
    }).join('');
  }

  const currentStatuses = new Map(jobs.map((job) => [job.id, String(job.status || '')]));
  if (appState.queueInitialized) {
    for (const job of jobs) {
      const previous = appState.queueStatuses.get(job.id);
      const status = String(job.status || '');
      if (previous && previous !== status) {
        if (status === 'completed') toast(`${job.profileLabel || 'Export'} complete · ${basename(job.outputPath)}`);
        else if (status === 'failed') toast(`Export failed · ${basename(job.outputPath)} · ${job.lastError || 'unknown error'}`, true);
        else if (status === 'interrupted') toast(`Export interrupted · ${basename(job.outputPath)}`, true);
      }
    }
  } else {
    appState.queueInitialized = true;
  }
  appState.queueStatuses = currentStatuses;
}

function wireOfflineExport() {
  byId('offlineProfile')?.addEventListener('change', syncOfflineProfile);
  byId('offlinePreset')?.addEventListener('change', () => syncOfflineDimensions(true));
  byId('offlineStartMode')?.addEventListener('change', () => syncOfflineDimensions());
  byId('offlineAutomation')?.addEventListener('change', syncOfflineAutomation);
  byId('offlineExportBtn')?.addEventListener('click', async () => {
    const button = byId('offlineExportBtn');
    button.disabled = true;
    const [width, height] = offlineDimensionsFromPreset();
    const profile = selectedOfflineProfile();
    try {
      const receipt = await call('start_offline_export', {
        fps: Number(byId('offlineFps')?.value || 30),
        durationSeconds: Number(byId('offlineDuration')?.value || 10),
        startMode: byId('offlineStartMode')?.value || 'current',
        startSeconds: Number(byId('offlineStartSeconds')?.value || 0),
        width,
        height,
        sampling: byId('offlineSampling')?.value || 'smooth',
        fitMode: byId('offlineFit')?.value || 'fit',
        audioMode: byId('offlineAudio')?.value || 'source',
        profile,
        preserveAlpha: Boolean(byId('offlineAlpha')?.checked),
        automationMode: byId('offlineAutomation')?.value || 'none',
        automationLoop: Boolean(byId('offlineAutomationLoop')?.checked),
      });
      if (receipt) toast(`${offlineProfileLabel(profile)} queued · position ${receipt.position || 1} · ${basename(receipt.path)}`);
    } finally {
      button.disabled = false;
    }
  });
  byId('offlineCancelBtn')?.addEventListener('click', async () => {
    byId('offlineCancelBtn').disabled = true;
    toast('Cancelling active deterministic export…');
    try {
      await call('cancel_offline_export');
    } catch (_) {
      byId('offlineCancelBtn').disabled = false;
    }
  });
  byId('exportQueuePauseBtn')?.addEventListener('click', async () => {
    const paused = !Boolean(appState.info?.exportQueue?.paused);
    await call('set_export_queue_paused', { paused }).catch(() => {});
  });
  byId('exportQueueClearBtn')?.addEventListener('click', async () => {
    const removed = await call('clear_finished_export_jobs').catch(() => null);
    if (removed !== null) toast(`Removed ${removed} finished export ${removed === 1 ? 'job' : 'jobs'}`);
  });
  byId('exportQueueList')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    const row = event.target.closest('[data-job-id]');
    if (!button || !row) return;
    const jobId = row.dataset.jobId;
    const action = button.dataset.action;
    button.disabled = true;
    try {
      if (action === 'up' || action === 'down') {
        await call('move_export_queue_job', { jobId, direction: action === 'up' ? -1 : 1 });
      } else if (action === 'cancel-job') {
        await call('cancel_export_queue_job', { jobId });
      } else if (action === 'cancel-active') {
        await call('cancel_offline_export');
      } else if (action === 'retry') {
        await call('retry_export_queue_job', { jobId });
        toast('Export restarted from frame zero with its frozen state');
      } else if (action === 'repeat') {
        const receipt = await call('repeat_export_queue_job', { jobId });
        if (receipt) toast(`Repeated export queued · ${basename(receipt.path)}`);
      } else if (action === 'remove') {
        await call('remove_export_queue_job', { jobId });
      }
    } catch (_) {
      button.disabled = false;
    }
  });
  syncOfflineProfile();
  syncOfflineAutomation();
}

const AUTOMATION_STORAGE_KEY = 'huffNativeAutomationClipV1';

function persistAutomationClip(clip) {
  if (clip) localStorage.setItem(AUTOMATION_STORAGE_KEY, JSON.stringify(clip));
  else localStorage.removeItem(AUTOMATION_STORAGE_KEY);
}

async function restoreAutomationClip() {
  const raw = localStorage.getItem(AUTOMATION_STORAGE_KEY);
  if (!raw) return;
  try {
    const clip = JSON.parse(raw);
    await call('set_active_automation_clip', { clip });
  } catch (error) {
    localStorage.removeItem(AUTOMATION_STORAGE_KEY);
    toast(`Stored automation could not be restored: ${error}`, true);
  }
}

function wireAutomation() {
  byId('automationRecordBtn')?.addEventListener('click', async () => {
    try {
      await call('start_automation_recording', {
        name: byId('automationName')?.value.trim() || 'HUFF Performance',
        interpolation: byId('automationInterpolation')?.value || 'linear',
      });
      toast('Automation recording started · move controls or recall presets');
    } catch (_) {}
  });
  byId('automationStopBtn')?.addEventListener('click', async () => {
    try {
      const clip = await call('stop_automation_recording');
      persistAutomationClip(clip);
      if (byId('offlineAutomation')) byId('offlineAutomation').value = 'active';
      syncOfflineAutomation();
      toast(`Automation captured · ${clip.events?.length || 0} events · ${Number(clip.durationSeconds || 0).toFixed(2)} s`);
    } catch (_) {}
  });
  byId('automationClearBtn')?.addEventListener('click', async () => {
    await call('clear_active_automation_clip').catch(() => {});
    persistAutomationClip(null);
    if (byId('offlineAutomation')) byId('offlineAutomation').value = 'none';
    syncOfflineAutomation();
    toast('Active automation cleared');
  });
  byId('automationExportBtn')?.addEventListener('click', async () => {
    const clip = await call('get_active_automation_clip').catch(() => null);
    if (!clip) return toast('No active automation clip to export', true);
    const blob = new Blob([JSON.stringify(clip, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${String(clip.name || 'huff-automation').replace(/[^a-z0-9_-]+/gi, '-')}.huff-automation.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const input = byId('automationLoadInput');
  byId('automationImportBtn')?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const clip = JSON.parse(await file.text());
      const summary = await call('set_active_automation_clip', { clip });
      persistAutomationClip(await call('get_active_automation_clip'));
      if (byId('offlineAutomation')) byId('offlineAutomation').value = 'active';
      syncOfflineAutomation();
      toast(`Imported automation: ${summary.name} · ${summary.eventCount} events`);
    } catch (error) {
      toast(`Automation import failed: ${error}`, true);
    }
    input.value = '';
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

async function applyPresetValues(values, recordUndo = true, automationLabel = 'preset_recall') {
  const updates = {};
  for (const definition of appState.registry) {
    if (!(definition.id in values) && !(definition.legacyId in values)) continue;
    const value = values[definition.id] ?? values[definition.legacyId];
    updates[definition.id] = value;
    setControlValue(byId(definition.legacyId), definition, value);
  }
  if (Object.keys(updates).length) await setBatch(updates, recordUndo, automationLabel);
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
    await applyPresetValues(preset.values || preset, true, `preset:${name}`);
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
      await applyPresetValues(payload.values || payload, true, `preset_import:${file.name}`);
      toast(`Imported ${file.name}`);
    } catch (error) {
      toast(`Preset import failed: ${error}`, true);
    }
    input.value = '';
  });
}

const STATE_SCOPE_IDS = {
  look: 'stateScopeLook',
  source: 'stateScopeSource',
  temporal: 'stateScopeTemporal',
  routing: 'stateScopeRouting',
  render: 'stateScopeRender',
  transport: 'stateScopeTransport',
  automation: 'stateScopeAutomation',
  controlMaps: 'stateScopeMaps',
  persistentPixels: 'stateScopePixels',
};

const STATE_KIND_ALLOWED = {
  preset: { look: true, source: true, temporal: true, routing: true, render: false, transport: false, automation: false, controlMaps: false, persistentPixels: false },
  snapshot: { look: true, source: true, temporal: true, routing: true, render: true, transport: true, automation: true, controlMaps: false, persistentPixels: false },
  sequence: { look: false, source: false, temporal: false, routing: false, render: false, transport: false, automation: true, controlMaps: false, persistentPixels: false },
  project: { look: true, source: true, temporal: true, routing: true, render: true, transport: true, automation: true, controlMaps: true, persistentPixels: false },
};

const STATE_KIND_DEFAULTS = {
  preset: { look: true, source: false, temporal: true, routing: true, render: false, transport: false, automation: false, controlMaps: false, persistentPixels: false },
  snapshot: { look: true, source: true, temporal: true, routing: true, render: true, transport: true, automation: true, controlMaps: false, persistentPixels: false },
  sequence: { look: false, source: false, temporal: false, routing: false, render: false, transport: false, automation: true, controlMaps: false, persistentPixels: false },
  project: { look: true, source: true, temporal: true, routing: true, render: true, transport: true, automation: true, controlMaps: true, persistentPixels: false },
};

function stateScopeFromUi() {
  const scope = {};
  for (const [key, id] of Object.entries(STATE_SCOPE_IDS)) scope[key] = Boolean(byId(id)?.checked);
  return scope;
}

function applyStateScopeDefaults(kind = byId('stateDocumentKind')?.value || 'preset') {
  const defaults = STATE_KIND_DEFAULTS[kind] || STATE_KIND_DEFAULTS.preset;
  const allowed = STATE_KIND_ALLOWED[kind] || STATE_KIND_ALLOWED.preset;
  for (const [key, id] of Object.entries(STATE_SCOPE_IDS)) {
    const element = byId(id);
    if (!element) continue;
    element.checked = Boolean(defaults[key]);
    element.disabled = !allowed[key];
    element.title = allowed[key] ? '' : `${kind.toUpperCase()} documents do not capture this domain.`;
  }
  const pixels = byId('stateScopePixels');
  if (pixels) {
    pixels.checked = false;
    pixels.disabled = true;
    pixels.title = 'Persistent GPU pixel contents are deliberately separate and are not embedded by huff-state/v1.';
  }
  const saveButton = byId('stateSaveBtn');
  if (saveButton) saveButton.textContent = `💾 Save ${kind[0].toUpperCase()}${kind.slice(1)}`;
  const note = byId('stateScopeNote');
  if (note) {
    note.textContent = kind === 'preset'
      ? 'Preset = reusable artistic condition. Source files, transport, render allocation, automation, maps, and GPU pixels remain untouched.'
      : kind === 'snapshot'
        ? 'Snapshot = broad current-state capture. Recall remains explicitly scoped and does not silently embed GPU pixel memory.'
        : kind === 'sequence'
          ? 'Sequence = the active canonical automation clip. It is source-independent state motion, not rendered video.'
          : 'Project = selected parameters, source/transport references, automation, and controller maps in one portable container.';
  }
}

async function loadStateModelCatalog() {
  appState.stateModelCatalog = await call('get_state_model_catalog');
  const catalog = appState.stateModelCatalog;
  const status = byId('stateModelStatus');
  if (status) {
    status.textContent = `${catalog.schema} · ${catalog.parameterCount} params · ${catalog.presettableCount} preset · ${catalog.sequenceableCount} sequence`;
  }
}

function wireStateDocuments() {
  byId('stateDocumentKind')?.addEventListener('change', () => applyStateScopeDefaults());
  applyStateScopeDefaults();

  byId('stateSaveBtn')?.addEventListener('click', async () => {
    const kind = byId('stateDocumentKind')?.value || 'preset';
    const name = byId('stateDocumentName')?.value.trim() || `HUFF ${kind}`;
    try {
      const receipt = await call('save_state_document', {
        kind,
        name,
        scope: stateScopeFromUi(),
      });
      if (!receipt) return;
      byId('stateDocumentStatus').textContent = `SAVED ${String(receipt.kind).toUpperCase()} · ${receipt.parameterCount} PARAMS · ${basename(receipt.path)}`;
      toast(`${receipt.name} saved · ${basename(receipt.path)}`);
    } catch (_) {}
  });

  byId('stateLoadBtn')?.addEventListener('click', async () => {
    try {
      const result = await call('load_state_document', { scope: stateScopeFromUi() });
      if (!result) return;
      pushUndo();
      applyStateToDom(result.parameterSnapshot);
      if (result.automation) {
        const clip = await call('get_active_automation_clip').catch(() => null);
        persistAutomationClip(clip);
        if (byId('offlineAutomation')) byId('offlineAutomation').value = clip ? 'active' : 'none';
        syncOfflineAutomation();
      }
      const warnings = result.warnings || [];
      const status = byId('stateDocumentStatus');
      if (status) {
        status.textContent = `LOADED ${String(result.kind).toUpperCase()} · ${result.appliedParameterCount} PARAMS${warnings.length ? ` · ${warnings.length} WARNING${warnings.length === 1 ? '' : 'S'}` : ''}`;
        status.title = warnings.join('\n');
        status.classList.toggle('warning', warnings.length > 0);
      }
      toast(`${result.name} loaded${warnings.length ? ` · ${warnings[0]}` : ''}`, warnings.length > 0);
      await poll();
    } catch (_) {}
  });

  byId('stateModelExportBtn')?.addEventListener('click', async () => {
    try {
      const path = await call('export_state_model_catalog');
      if (path) toast(`State model exported · ${basename(path)}`);
    } catch (_) {}
  });
}

function mappingTargetOptions(selected = '') {
  const groups = new Map();
  for (const target of appState.controlTargets.filter((item) => item.mappable)) {
    if (!groups.has(target.group)) groups.set(target.group, []);
    groups.get(target.group).push(target);
  }
  return [...groups.entries()].map(([group, targets]) =>
    `<optgroup label="${escapeHtml(group)}">${targets.map((target) =>
      `<option value="${escapeHtml(target.id)}" ${target.id === selected ? 'selected' : ''}>${escapeHtml(target.label)} · ${escapeHtml(target.id)}</option>`
    ).join('')}</optgroup>`
  ).join('');
}

function populateMappingTargetSelects() {
  for (const id of ['midiTargetSelect', 'oscTargetSelect']) {
    const select = byId(id);
    if (!select) continue;
    const previous = select.value;
    select.innerHTML = mappingTargetOptions(previous);
    if (previous && [...select.options].some((option) => option.value === previous)) select.value = previous;
  }
}

function mappingWarnings(elementId, warnings = []) {
  const element = byId(elementId);
  if (!element) return;
  element.textContent = warnings.length ? warnings.join('\n') : '';
}

function renderMidiMappings(midi = {}) {
  const mappings = midi.mappings || [];
  const signature = JSON.stringify([mappings, midi.validationWarnings, midi.learnTarget, midi.mapName]);
  if (signature === appState.midiMapSignature) return;
  if (document.activeElement?.closest?.('#midiMapTable')) return;
  appState.midiMapSignature = signature;
  if (byId('midiMapName')) byId('midiMapName').textContent = `${midi.mapName || 'Custom'} · ${mappings.length}`;
  mappingWarnings('midiMapWarnings', midi.validationWarnings || []);
  const learn = byId('midiLearnStatus');
  if (learn) {
    learn.textContent = midi.learnTarget ? `ARMED: move a MIDI control for ${midi.learnTarget}` : 'Select a canonical target, then move a control.';
    learn.classList.toggle('armed', Boolean(midi.learnTarget));
  }
  const body = byId('midiMapTbody');
  if (!body) return;
  body.innerHTML = mappings.length ? mappings.map((mapping) => `
    <tr data-id="${mapping.id}">
      <td><input data-field="enabled" type="checkbox" ${mapping.enabled !== false ? 'checked' : ''}></td>
      <td>
        <select data-field="sourceKind" class="map-source">
          ${['cc','note_on','pitch_bend','channel_pressure','poly_aftertouch','program_change'].map((kind) => `<option value="${kind}" ${mapping.sourceKind === kind ? 'selected' : ''}>${kind}</option>`).join('')}
        </select>
        ch<input data-field="channel" class="map-mini" type="number" min="0" max="16" value="${mapping.channel ?? 1}">
        #<input data-field="number" class="map-mini" type="number" min="0" max="127" value="${mapping.number ?? 0}">
      </td>
      <td><select data-field="target" class="map-target">${mappingTargetOptions(mapping.target)}</select></td>
      <td><select data-field="behavior" class="map-mode">${['absolute','gate','toggle','trigger'].map((mode) => `<option ${mapping.behavior === mode ? 'selected' : ''}>${mode}</option>`).join('')}</select></td>
      <td><input data-field="min" class="map-mini" type="number" min="0" max="1" step="0.01" value="${mapping.min ?? 0}">–<input data-field="max" class="map-mini" type="number" min="0" max="1" step="0.01" value="${mapping.max ?? 1}"></td>
      <td><select data-field="curve">${['linear','smooth','square','cube','sqrt'].map((curve) => `<option ${mapping.curve === curve ? 'selected' : ''}>${curve}</option>`).join('')}</select></td>
      <td><input data-field="invert" type="checkbox" ${mapping.invert ? 'checked' : ''}></td>
      <td><input data-field="smoothing" class="map-mini" type="number" min="0" max="0.98" step="0.01" value="${mapping.smoothing ?? 0.18}"></td>
      <td><input data-field="threshold" class="map-mini" type="number" min="0" max="1" step="0.01" value="${mapping.threshold ?? 0.5}"></td>
      <td><input data-field="note" class="map-note" value="${escapeHtml(mapping.note || '')}"></td>
      <td><button data-action="save">Save</button> <button data-action="delete">×</button></td>
    </tr>`).join('') : '<tr><td colspan="11">No MIDI mappings. Learn a control or add a row.</td></tr>';
}

function renderOscMappings(osc = {}) {
  const mappings = osc.mappings || [];
  const signature = JSON.stringify([mappings, osc.validationWarnings, osc.learnTarget, osc.mapName]);
  if (signature === appState.oscMapSignature) return;
  if (document.activeElement?.closest?.('#oscMapTable')) return;
  appState.oscMapSignature = signature;
  if (byId('oscMapName')) byId('oscMapName').textContent = `${osc.mapName || 'Custom'} · ${mappings.length}`;
  mappingWarnings('oscMapWarnings', osc.validationWarnings || []);
  const learn = byId('oscLearnStatus');
  if (learn) {
    learn.textContent = osc.learnTarget ? `ARMED: send an OSC value for ${osc.learnTarget}` : 'Select a canonical target, then send an OSC message.';
    learn.classList.toggle('armed', Boolean(osc.learnTarget));
  }
  const body = byId('oscMapTbody');
  if (!body) return;
  body.innerHTML = mappings.length ? mappings.map((mapping) => `
    <tr data-id="${mapping.id}">
      <td><input data-field="enabled" type="checkbox" ${mapping.enabled !== false ? 'checked' : ''}></td>
      <td><input data-field="address" class="map-source" value="${escapeHtml(mapping.address || '/huff/control')}"> [<input data-field="argumentIndex" class="map-mini" type="number" min="0" max="31" value="${mapping.argumentIndex ?? 0}">]</td>
      <td><select data-field="target" class="map-target">${mappingTargetOptions(mapping.target)}</select></td>
      <td><select data-field="behavior" class="map-mode">${['absolute','gate','toggle','trigger'].map((mode) => `<option ${mapping.behavior === mode ? 'selected' : ''}>${mode}</option>`).join('')}</select></td>
      <td><input data-field="inputMin" class="map-mini" type="number" step="0.01" value="${mapping.inputMin ?? 0}">–<input data-field="inputMax" class="map-mini" type="number" step="0.01" value="${mapping.inputMax ?? 1}"></td>
      <td><input data-field="outputMin" class="map-mini" type="number" min="0" max="1" step="0.01" value="${mapping.outputMin ?? 0}">–<input data-field="outputMax" class="map-mini" type="number" min="0" max="1" step="0.01" value="${mapping.outputMax ?? 1}"></td>
      <td><select data-field="curve">${['linear','smooth','square','cube','sqrt'].map((curve) => `<option ${mapping.curve === curve ? 'selected' : ''}>${curve}</option>`).join('')}</select></td>
      <td><input data-field="invert" type="checkbox" ${mapping.invert ? 'checked' : ''}></td>
      <td><input data-field="smoothing" class="map-mini" type="number" min="0" max="0.98" step="0.01" value="${mapping.smoothing ?? 0.18}"></td>
      <td><input data-field="threshold" class="map-mini" type="number" min="0" max="1" step="0.01" value="${mapping.threshold ?? 0.5}"></td>
      <td><button data-action="save">Save</button> <button data-action="delete">×</button></td>
    </tr>`).join('') : '<tr><td colspan="11">No OSC mappings. Learn an address or add a row.</td></tr>';
}

function rowValue(row, field, fallback = '') {
  const element = row.querySelector(`[data-field="${field}"]`);
  if (!element) return fallback;
  if (element.type === 'checkbox') return element.checked;
  if (element.type === 'number') return Number(element.value);
  return element.value;
}

function midiMappingFromRow(row) {
  return {
    id: Number(row.dataset.id || 0), target: rowValue(row, 'target'), sourceKind: rowValue(row, 'sourceKind'),
    channel: rowValue(row, 'channel', 1), number: rowValue(row, 'number', 0),
    min: rowValue(row, 'min', 0), max: rowValue(row, 'max', 1), invert: rowValue(row, 'invert', false), smoothing: rowValue(row, 'smoothing', 0.18),
    enabled: rowValue(row, 'enabled', true), behavior: rowValue(row, 'behavior', 'absolute'),
    curve: rowValue(row, 'curve', 'linear'), threshold: rowValue(row, 'threshold', 0.5), note: rowValue(row, 'note', ''),
  };
}

function oscMappingFromRow(row) {
  return {
    id: Number(row.dataset.id || 0), target: rowValue(row, 'target'), address: rowValue(row, 'address'),
    argumentIndex: rowValue(row, 'argumentIndex', 0), inputMin: rowValue(row, 'inputMin', 0), inputMax: rowValue(row, 'inputMax', 1),
    outputMin: rowValue(row, 'outputMin', 0), outputMax: rowValue(row, 'outputMax', 1), invert: rowValue(row, 'invert', false), smoothing: rowValue(row, 'smoothing', 0.18),
    enabled: rowValue(row, 'enabled', true), behavior: rowValue(row, 'behavior', 'absolute'),
    curve: rowValue(row, 'curve', 'linear'), threshold: rowValue(row, 'threshold', 0.5), note: '',
  };
}

function wireMidiOsc() {
  byId('midiRefreshBtn')?.addEventListener('click', () => call('refresh_midi_ports').catch(() => {}));
  byId('midiConnectBtn')?.addEventListener('click', () => call('connect_midi', { name: byId('midiPortSelect')?.value || '' }).catch(() => {}));
  byId('midiDisconnectBtn')?.addEventListener('click', () => call('disconnect_midi').catch(() => {}));
  byId('midiLearnBtn')?.addEventListener('click', () => call('arm_midi_learn', { target: byId('midiTargetSelect')?.value || '' }).catch(() => {}));
  byId('midiCancelLearnBtn')?.addEventListener('click', () => call('cancel_midi_learn').catch(() => {}));
  byId('midiAddBtn')?.addEventListener('click', () => call('update_midi_mapping', { mapping: {
    id: 0, target: byId('midiTargetSelect')?.value || 'feedback.amount', sourceKind: 'cc', channel: 1, number: 1,
    min: 0, max: 1, invert: false, smoothing: 0.18, enabled: true, behavior: 'absolute', curve: 'linear', threshold: 0.5, note: 'New mapping',
  }}).catch(() => {}));
  byId('midiLoadMapBtn')?.addEventListener('click', async () => { const result = await call('load_midi_map'); if (result) toast(`Loaded ${result.name}`); });
  byId('midiSaveMapBtn')?.addEventListener('click', async () => { const result = await call('save_midi_map'); if (result) toast(`Saved ${basename(result.path)}`); });
  byId('midiFactoryMapBtn')?.addEventListener('click', () => call('load_factory_midi_map').catch(() => {}));
  byId('midiClearMapBtn')?.addEventListener('click', () => call('clear_midi_mappings').catch(() => {}));
  byId('midiMapTbody')?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const row = button.closest('tr[data-id]'); if (!row) return;
    if (button.dataset.action === 'delete') call('delete_midi_mapping', { id: Number(row.dataset.id) }).catch(() => {});
    else call('update_midi_mapping', { mapping: midiMappingFromRow(row) }).then(() => toast('MIDI mapping saved')).catch(() => {});
  });

  byId('oscStartBtn')?.addEventListener('click', () => call('bind_osc', { host: byId('oscHost')?.value || '0.0.0.0', port: Number(byId('oscPort')?.value || 9000) }).catch(() => {}));
  byId('oscStopBtn')?.addEventListener('click', () => call('stop_osc').catch(() => {}));
  byId('oscTestBtn')?.addEventListener('click', () => call('send_osc_test', { host: '127.0.0.1', port: Number(byId('oscPort')?.value || 9000), address: '/huff/feedback', value: 0.65 }).catch(() => {}));
  byId('oscLearnBtn')?.addEventListener('click', () => call('arm_osc_learn', { target: byId('oscTargetSelect')?.value || '' }).catch(() => {}));
  byId('oscCancelLearnBtn')?.addEventListener('click', () => call('cancel_osc_learn').catch(() => {}));
  byId('oscAddBtn')?.addEventListener('click', () => call('update_osc_mapping', { mapping: {
    id: 0, target: byId('oscTargetSelect')?.value || 'feedback.amount', address: '/huff/control', argumentIndex: 0,
    inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1, invert: false, smoothing: 0.18,
    enabled: true, behavior: 'absolute', curve: 'linear', threshold: 0.5, note: 'New mapping',
  }}).catch(() => {}));
  byId('oscLoadMapBtn')?.addEventListener('click', async () => { const result = await call('load_osc_map'); if (result) toast(`Loaded ${result.name}`); });
  byId('oscSaveMapBtn')?.addEventListener('click', async () => { const result = await call('save_osc_map'); if (result) toast(`Saved ${basename(result.path)}`); });
  byId('oscFactoryMapBtn')?.addEventListener('click', () => call('load_factory_osc_map').catch(() => {}));
  byId('oscClearMapBtn')?.addEventListener('click', () => call('clear_osc_mappings').catch(() => {}));
  byId('oscMapTbody')?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const row = button.closest('tr[data-id]'); if (!row) return;
    if (button.dataset.action === 'delete') call('delete_osc_mapping', { id: Number(row.dataset.id) }).catch(() => {});
    else call('update_osc_mapping', { mapping: oscMappingFromRow(row) }).then(() => toast('OSC mapping saved')).catch(() => {});
  });
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
  displayRoutingFromRenderer(renderer);
  const video = info.video || {};
  const camera = info.camera || {};
  const videoAudio = info.audio?.video || {};
  const midi = info.midi || {};
  const osc = info.osc || {};
  const syphon = info.syphon || {};
  const spout = info.spout || {};
  const recording = info.recording || {};
  const exportInfo = info.export || {};
  const offlineExport = info.offlineExport || {};
  const exportQueue = info.exportQueue || {};
  const automation = info.automation || {};

  setOptions(byId('cams'), info.cameraDevices || [], (item) => item.slot, (item) => item.name);
  setOptions(byId('midiPortSelect'), midi.ports || [], (item) => item, (item) => item);

  const loaded = Boolean(video.loaded);
  byId('playBtn').disabled = !loaded;
  byId('pauseBtn').disabled = !loaded;
  byId('refreshBtn').disabled = !loaded;
  if (loaded && byId('fileName').textContent === 'no file selected') byId('fileName').textContent = video.fileName || 'video';

  const stateText = video.playing ? 'PLAY' : (loaded ? 'PAUSE' : 'IDLE');
  byId('status').textContent = `NATIVE: ${stateText} · ${(renderer.fps || 0).toFixed(0)} fps`;
  byId('status').title = `${renderer.backend || 'GPU'} · ${renderer.adapter || ''}\nSource: ${info.activeSource || renderer.activeSource || 'automatic'}\nRender ${renderer.width || 0}×${renderer.height || 0}\nSurface ${renderer.surfaceWidth || 0}×${renderer.surfaceHeight || 0}\nGlitch: ${renderer.glitchBaseTiles || 0} tiles · ${renderer.glitchInstances || 0}/${renderer.glitchInstanceCapacity || 0} instances · ${(renderer.glitchGenerationMs || 0).toFixed(2)} ms\nScanlines: ${renderer.scanlinesEnabled ? 'on' : 'off'} · ${renderer.scanBandCount || 0} bands · ${(renderer.scanGenerationMs || 0).toFixed(2)} ms · angle ${(renderer.scanAngle || 0).toFixed(1)}° · layer ${renderer.layerPriority || 'scan'}\nSmoosh: ${renderer.smooshEnabled ? renderer.smooshBlend : 'off'} · Luma: ${renderer.lumaKeyEnabled ? 'on' : 'off'}\nGlobal Mix: ${renderer.globalMixEnabled ? renderer.globalMixPosition : 'off'} · Flow: ${renderer.flowEnabled ? `${renderer.flowTarget} @ ${Number(renderer.flowStrength || 0).toFixed(1)}` : 'off'} · fires ${renderer.flowPulseFires || 0}
Routing: ${renderer.routingSummary || 'Program <- PROGRAM | Monitor <- PROGRAM'}\nClusters: ${renderer.clusterTilesEnabled ? 'on' : 'off'} · ${renderer.clusterCentersActive || 0} centers · ${renderer.clusterBiasTiles || 0} biased tiles · ${renderer.clusterRerolledOffsets || 0} rerolls · ${renderer.clusterPulses || 0} pulses\nGlitch drops: ${renderer.glitchDroppedInstances || 0}\nVideo decode: ${(video.decodeFps || 0).toFixed(1)} fps · stalls ${video.decoderStalls || 0} · recoveries ${video.watchdogRestarts || 0}\nAudio decode: ${(videoAudio.bufferedMs || 0).toFixed(0)} ms buffered · stalls ${videoAudio.decoderStalls || 0} · recoveries ${videoAudio.watchdogRestarts || 0}\nSurface skips: ${renderer.surfaceSkips || 0} · recoveries: ${renderer.surfaceRecoveries || 0}\nNative output readback: ${renderer.outputReadbacks || 0} frames · ${renderer.outputReadbackDrops || 0} busy drops · ${renderer.outputMapErrors || 0} map errors · ${(renderer.outputCopyMs || 0).toFixed(2)} ms · ${renderer.outputPendingSlots || 0} pending\nClick to focus output`;

  byId('midiPill').textContent = midi.connected ? `MIDI: ${midi.connectedPort}` : 'MIDI: OFF';
  byId('oscPill').textContent = osc.listening ? `OSC :${osc.port}` : 'OSC: OFF';
  byId('syphonPill').textContent = syphon.active
    ? `SYPHON: ${syphon.publishedFrames || 0}`
    : (syphon.available ? 'SYPHON: OFF' : 'SYPHON: N/A');
  byId('spoutPill').textContent = spout.active
    ? (spout.initialized ? `SPOUT: ${spout.publishedFrames || 0}` : 'SPOUT: ARMING')
    : (spout.available ? 'SPOUT: OFF' : 'SPOUT: N/A');

  const recordingBusy = Boolean(recording.active || recording.finalizing);
  const offlineBusy = Boolean(offlineExport.active);
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
  if (byId('recordBtn')) byId('recordBtn').disabled = recordingBusy || offlineBusy || !recording.ffmpegAvailable;
  if (byId('recordStopBtn')) byId('recordStopBtn').disabled = !recording.active;
  if (byId('recordFps')) byId('recordFps').disabled = recordingBusy || offlineBusy;
  if (byId('recordAudio')) byId('recordAudio').disabled = recordingBusy || offlineBusy;
  if (byId('renderApplyBtn')) byId('renderApplyBtn').disabled = recordingBusy;
  if (byId('resetBtn')) byId('resetBtn').disabled = recordingBusy;
  if (byId('presetLoadBtn')) byId('presetLoadBtn').disabled = recordingBusy;
  if (byId('presetImportBtn')) byId('presetImportBtn').disabled = recordingBusy;
  if (byId('stateLoadBtn')) byId('stateLoadBtn').disabled = recordingBusy || Boolean(automation.recording);
  if (byId('stateSaveBtn')) byId('stateSaveBtn').disabled = Boolean(automation.recording);

  const exportBusy = Boolean(exportInfo.active);
  const exportPill = byId('exportPill');
  if (exportPill) {
    exportPill.classList.toggle('export-active', exportBusy);
    exportPill.classList.toggle('export-complete', !exportBusy && exportInfo.phase === 'complete');
    exportPill.textContent = exportBusy
      ? `EXPORT: ${String(exportInfo.phase || 'active').toUpperCase()}`
      : (exportInfo.phase === 'complete'
        ? `EXPORT: ${exportInfo.width || 0}×${exportInfo.height || 0} ✓`
        : (exportInfo.phase === 'error' ? 'EXPORT: ERROR' : 'EXPORT: READY'));
    exportPill.title = exportInfo.lastError || `${exportInfo.path || 'Native PNG still export'}
${exportInfo.width || 0}×${exportInfo.height || 0} from ${exportInfo.sourceWidth || 0}×${exportInfo.sourceHeight || 0}
Sampling: ${exportInfo.sampling || 'smooth'} · Aspect: ${exportInfo.fitMode || 'fit'}
Phase: ${exportInfo.phase || 'ready'} · ${(Number(exportInfo.durationSeconds || 0)).toFixed(2)} s · ${((exportInfo.bytesWritten || 0) / 1048576).toFixed(1)} MiB
Metadata: ${exportInfo.metadataPath || 'written beside PNG'}`;
  }
  if (Number(exportInfo.completedExports || 0) > appState.exportCompleted) {
    appState.exportCompleted = Number(exportInfo.completedExports || 0);
    toast(`PNG export complete · ${basename(exportInfo.path)}`);
  }
  if (byId('exportStillBtn')) byId('exportStillBtn').disabled = exportBusy || recordingBusy || offlineBusy || !exportInfo.ffmpegAvailable;
  if (byId('exportPreset')) byId('exportPreset').disabled = exportBusy || recordingBusy || offlineBusy;
  if (byId('exportSampling')) byId('exportSampling').disabled = exportBusy || recordingBusy || offlineBusy;
  if (byId('exportFit')) byId('exportFit').disabled = exportBusy || recordingBusy || offlineBusy;
  syncExportDimensions();
  const customExport = byId('exportPreset')?.value === 'custom';
  if (byId('exportW')) byId('exportW').disabled = exportBusy || recordingBusy || offlineBusy || !customExport;
  if (byId('exportH')) byId('exportH').disabled = exportBusy || recordingBusy || offlineBusy || !customExport;
  if (byId('recordBtn')) byId('recordBtn').disabled = recordingBusy || exportBusy || offlineBusy || !recording.ffmpegAvailable;

  const offlinePill = byId('offlineExportPill');
  if (offlinePill) {
    offlinePill.classList.toggle('offline-active', offlineBusy);
    offlinePill.classList.toggle('offline-complete', !offlineBusy && offlineExport.phase === 'complete');
    const progress = Math.max(0, Math.min(1, Number(offlineExport.progress || 0)));
    offlinePill.textContent = offlineBusy
      ? `OFFLINE: ${(progress * 100).toFixed(1)}% · ${offlineExport.renderedFrames || 0}/${offlineExport.totalFrames || 0}`
      : (offlineExport.phase === 'complete'
        ? `OFFLINE: ${offlineExport.width || 0}×${offlineExport.height || 0} ✓`
        : (offlineExport.phase === 'cancelled'
          ? 'OFFLINE: CANCELLED'
          : (offlineExport.phase === 'error' ? 'OFFLINE: ERROR' : 'OFFLINE: READY')));
    const audioDescription = offlineExport.includeAudio
      ? (offlineExport.outputKind === 'image_sequence' ? 'source PCM WAV' : 'source audio')
      : 'silent';
    offlinePill.title = offlineExport.lastError || `${offlineExport.path || 'Deterministic production export'}
Profile: ${offlineExport.profileLabel || offlineExport.profile || 'H.264 MP4'} · ${offlineExport.outputKind || 'video'}${offlineExport.preserveAlpha ? ' · alpha' : ''}
Source: ${offlineExport.sourcePath || '—'}
${offlineExport.width || 0}×${offlineExport.height || 0} @ ${offlineExport.fps || 0} FPS · ${(offlineExport.durationSeconds || 0).toFixed(2)} s · rate ${(offlineExport.playbackRate || 1).toFixed(2)}×
Phase: ${offlineExport.phase || 'ready'} · ${(progress * 100).toFixed(2)}%
Frames: ${offlineExport.renderedFrames || 0}/${offlineExport.totalFrames || 0}
Elapsed: ${(offlineExport.elapsedSeconds || 0).toFixed(2)} s · remaining ≈ ${(offlineExport.estimatedRemainingSeconds || 0).toFixed(2)} s
Audio: ${audioDescription} · ${((offlineExport.encodedBytes || 0) / 1048576).toFixed(1)} MiB
Graph: ${(offlineExport.graphMode || 'full_resolution').replaceAll('_', ' ').toUpperCase()} · ${offlineExport.width || 0}×${offlineExport.height || 0}
History: ${offlineExport.graphHistoryWidth || 0}×${offlineExport.graphHistoryHeight || 0} × ${offlineExport.graphHistoryCapacity || 0} frames · resource floor ${(Number(offlineExport.graphEstimatedGpuBytes || 0) / 1073741824).toFixed(2)} GiB
Automation: ${offlineExport.automationEnabled ? `${offlineExport.automationName || 'clip'} · ${offlineExport.automationEventCount || 0} events · ${Number(offlineExport.automationDurationSeconds || 0).toFixed(2)} s${offlineExport.automationLoop ? ' · loop' : ''}` : 'static state'}
Frame pattern: ${offlineExport.framePattern || '—'}
Metadata: ${offlineExport.metadataPath || '—'}
Manifest: ${offlineExport.manifestPath || '—'}`;
  }
  if (Number(offlineExport.completedExports || 0) > appState.offlineCompleted) {
    appState.offlineCompleted = Number(offlineExport.completedExports || 0);
  }
  renderExportQueue(exportQueue);
  const automationPanel = byId('automationPanel');
  const automationClip = automation.activeClip || null;
  const automationRecording = Boolean(automation.recording);
  automationPanel?.classList.toggle('recording', automationRecording);
  if (byId('automationStatus')) {
    byId('automationStatus').textContent = automationRecording
      ? `RECORDING · ${Number(automation.elapsedSeconds || 0).toFixed(2)} s`
      : (automationClip
        ? `${automationClip.name} · ${automationClip.eventCount || 0} events · ${Number(automationClip.durationSeconds || 0).toFixed(2)} s`
        : 'NO ACTIVE CLIP');
    byId('automationStatus').title = automation.lastError || (automationClip
      ? `Parameters: ${automationClip.parameterEvents || 0} · Actions: ${automationClip.actionEvents || 0}`
      : 'Record or import a canonical automation clip for deterministic export replay.');
  }
  if (byId('automationRecordBtn')) byId('automationRecordBtn').disabled = automationRecording || offlineBusy;
  if (byId('automationStopBtn')) byId('automationStopBtn').disabled = !automationRecording;
  if (byId('automationImportBtn')) byId('automationImportBtn').disabled = automationRecording || offlineBusy;
  if (byId('automationClearBtn')) byId('automationClearBtn').disabled = automationRecording || offlineBusy || !automationClip;
  if (byId('automationExportBtn')) byId('automationExportBtn').disabled = automationRecording || !automationClip;
  if (byId('automationName')) byId('automationName').disabled = automationRecording || offlineBusy;
  if (byId('automationInterpolation')) byId('automationInterpolation').disabled = automationRecording || offlineBusy;
  if (byId('offlineAutomation')) {
    const requestedActive = byId('offlineAutomation').value === 'active';
    byId('offlineAutomation').disabled = !automationClip;
    if (!automationClip && requestedActive) byId('offlineAutomation').value = 'none';
  }
  syncOfflineAutomation();
  const alphaControl = byId('offlineAlpha');
  if (alphaControl) alphaControl.disabled = !offlineProfileSupportsAlpha();
  if (byId('offlineExportBtn')) {
    byId('offlineExportBtn').disabled = !offlineExport.ffmpegAvailable || !video.loaded || automationRecording;
  }
  if (byId('offlineCancelBtn')) byId('offlineCancelBtn').disabled = !offlineBusy;
  syncOfflineDimensions();
  for (const id of ['fileOpenBtn', 'playBtn', 'pauseBtn', 'refreshBtn', 'camStartBtn', 'camStopBtn', 'camRefreshBtn', 'resetBtn', 'clearBufBtn', 'renderApplyBtn', 'presetLoadBtn', 'presetImportBtn']) {
    if (byId(id) && offlineBusy) byId(id).disabled = true;
  }

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
    ? `${midi.connectedPort} · ${(midi.messagesPerSecond || 0).toFixed(1)} msg/s · ${midi.mappings?.length || 0} mappings`
    : (midi.lastError || 'Not connected');
  renderMidiMappings(midi);
  renderOscMappings(osc);
  if (byId('oscHost') && document.activeElement !== byId('oscHost')) byId('oscHost').value = osc.bindHost || '0.0.0.0';
  if (byId('oscPort') && document.activeElement !== byId('oscPort')) byId('oscPort').value = String(osc.port || 9000);
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
  wireProduction();
  wireInterop();
  if (!bridgeReady) {
    byId('status').textContent = 'NATIVE: BRIDGE ERROR';
    toast('Tauri bridge unavailable', true);
    return;
  }
  appState.registry = await call('get_parameter_registry');
  appState.controlTargets = await call('get_control_target_catalog');
  appState.byLegacy = new Map(appState.registry.map((definition) => [definition.legacyId, definition]));
  appState.byId = new Map(appState.registry.map((definition) => [definition.id, definition]));
  configureRegistryControls();
  populateMappingTargetSelects();
  wireTransport();
  wireRecording();
  wireExport();
  wireOfflineExport();
  wireAutomation();
  wireParity();
  wireCamera();
  wireNativeActions();
  wirePresets();
  wireStateDocuments();
  await wireRouting();
  wireMidiOsc();
  await call('set_video_audio_preview', { enabled: true }).catch(() => {});
  await restoreAutomationClip();
  await loadStateModelCatalog();
  await loadCalibrationProfiles();
  await refreshParameterState();
  await refreshRoutingPlan(true);
  await refreshParityReport(true);
  await poll();
  setInterval(poll, 250);
  console.info('Huff Native wgpu Milestone 21 loaded', {
    parameters: appState.registry.length,
    implemented: appState.registry.filter((definition) => definition.implemented).length,
  });
}

boot().catch((error) => toast(`Startup failed: ${error}`, true));
