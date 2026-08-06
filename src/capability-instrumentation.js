/* capability-instrumentation.js — HUFF Classic Pass 27
 *
 * Profiler-gated timing and low-cost lifecycle counters for capability and
 * long-session stability testing. This module does not alter rendering,
 * controls, presets, routing, media ownership, or output pacing.
 */
(() => {
  'use strict';

  const freeze = value => Object.freeze(value);

  const CAPABILITY_PROFILES = freeze({
    '720p30': freeze({ id:'720p30', width:1280, height:720, targetFps:30, frameBudgetMs:33.333 }),
    '720p60': freeze({ id:'720p60', width:1280, height:720, targetFps:60, frameBudgetMs:16.667 }),
    '1080p30': freeze({ id:'1080p30', width:1920, height:1080, targetFps:30, frameBudgetMs:33.333 }),
    '1080p60': freeze({ id:'1080p60', width:1920, height:1080, targetFps:60, frameBudgetMs:16.667 }),
  });

  // These are test definitions only. They never apply parameters automatically.
  const EFFECT_LOAD_SCENES = freeze({
    light: freeze({
      id:'light',
      label:'Light',
      stages:freeze(['glitch']),
      purpose:'single active front-stage effect with outputs disabled',
    }),
    moderate: freeze({
      id:'moderate',
      label:'Moderate',
      stages:freeze(['glitch','scanlines','feedback']),
      purpose:'representative layered Classic performance load',
    }),
    worstCase: freeze({
      id:'worst-case',
      label:'Worst Case',
      stages:freeze(['glitch','pipeline-luma-key','scanlines','global-mix','feedback','flow','symmetry','solarize']),
      purpose:'all expensive visual stages active for capability testing',
    }),
  });

  const telemetry = Object.seal({
    sessionStartedAt: performance.now(),
    profilerSessions: 0,

    sourceRetirements: 0,
    sourceReplacements: 0,
    fileLoads: 0,
    cameraStarts: 0,
    cameraStops: 0,
    sourceReady: 0,
    sourceErrors: 0,
    staleCameraCompletions: 0,

    resizeRequests: 0,
    resizeCommits: 0,
    bufferAllocationPasses: 0,
    bufferDimensionChanges: 0,
    clearAllCalls: 0,

    renderSamples: 0,
    renderMs: 0,
    renderMaxMs: 0,
    renderWaitingSamples: 0,
    renderBypassSamples: 0,
    renderActiveSamples: 0,

    sourceSyncSamples: 0,
    sourceSyncMs: 0,
    sourceSyncMaxMs: 0,
    activePipelineSamples: 0,
    activePipelineMs: 0,
    activePipelineMaxMs: 0,

    lastSourceKind: 'none',
    lastSourceWidth: 0,
    lastSourceHeight: 0,
    lastCanvasWidth: 0,
    lastCanvasHeight: 0,
  });

  function count(name, amount = 1) {
    if (!Object.prototype.hasOwnProperty.call(telemetry, name)) return;
    const next = telemetry[name] + amount;
    if (Number.isFinite(next)) telemetry[name] = next;
  }

  function sample(phase, milliseconds) {
    if (!window.__huffProfilerActive || !Number.isFinite(milliseconds) || milliseconds < 0) return;
    const samplesKey = `${phase}Samples`;
    const totalKey = `${phase}Ms`;
    const maxKey = `${phase}MaxMs`;
    if (!Object.prototype.hasOwnProperty.call(telemetry, samplesKey) ||
        !Object.prototype.hasOwnProperty.call(telemetry, totalKey)) return;
    telemetry[samplesKey] += 1;
    telemetry[totalKey] += milliseconds;
    if (Object.prototype.hasOwnProperty.call(telemetry, maxKey) && milliseconds > telemetry[maxKey]) {
      telemetry[maxKey] = milliseconds;
    }
  }

  function markRenderPath(path) {
    if (!window.__huffProfilerActive) return;
    if (path === 'waiting') telemetry.renderWaitingSamples += 1;
    else if (path === 'bypass') telemetry.renderBypassSamples += 1;
    else if (path === 'active') telemetry.renderActiveSamples += 1;
  }

  function setSource(kind, width = 0, height = 0) {
    telemetry.lastSourceKind = String(kind || 'none');
    telemetry.lastSourceWidth = Math.max(0, Number(width) || 0);
    telemetry.lastSourceHeight = Math.max(0, Number(height) || 0);
  }

  function setCanvas(width, height) {
    telemetry.lastCanvasWidth = Math.max(0, Number(width) || 0);
    telemetry.lastCanvasHeight = Math.max(0, Number(height) || 0);
  }

  function beginProfilerSession() {
    telemetry.profilerSessions += 1;
  }

  function closestProfile(width, height, targetFps = 60) {
    const w = Math.max(0, Number(width) || 0);
    const h = Math.max(0, Number(height) || 0);
    const fps = Number(targetFps) >= 45 ? 60 : 30;
    let best = null;
    let bestScore = Infinity;
    for (const profile of Object.values(CAPABILITY_PROFILES)) {
      const score = Math.abs(profile.width - w) + Math.abs(profile.height - h) +
        Math.abs(profile.targetFps - fps) * 100;
      if (score < bestScore) {
        best = profile;
        bestScore = score;
      }
    }
    return best;
  }

  function snapshot() {
    const now = performance.now();
    const memory = performance.memory;
    return {
      uptimeMs: Math.max(0, now - telemetry.sessionStartedAt),
      profilerSessions: telemetry.profilerSessions,
      sourceRetirements: telemetry.sourceRetirements,
      sourceReplacements: telemetry.sourceReplacements,
      fileLoads: telemetry.fileLoads,
      cameraStarts: telemetry.cameraStarts,
      cameraStops: telemetry.cameraStops,
      sourceReady: telemetry.sourceReady,
      sourceErrors: telemetry.sourceErrors,
      staleCameraCompletions: telemetry.staleCameraCompletions,
      resizeRequests: telemetry.resizeRequests,
      resizeCommits: telemetry.resizeCommits,
      bufferAllocationPasses: telemetry.bufferAllocationPasses,
      bufferDimensionChanges: telemetry.bufferDimensionChanges,
      clearAllCalls: telemetry.clearAllCalls,
      renderSamples: telemetry.renderSamples,
      renderMs: telemetry.renderMs,
      renderMaxMs: telemetry.renderMaxMs,
      renderWaitingSamples: telemetry.renderWaitingSamples,
      renderBypassSamples: telemetry.renderBypassSamples,
      renderActiveSamples: telemetry.renderActiveSamples,
      sourceSyncSamples: telemetry.sourceSyncSamples,
      sourceSyncMs: telemetry.sourceSyncMs,
      sourceSyncMaxMs: telemetry.sourceSyncMaxMs,
      activePipelineSamples: telemetry.activePipelineSamples,
      activePipelineMs: telemetry.activePipelineMs,
      activePipelineMaxMs: telemetry.activePipelineMaxMs,
      lastSourceKind: telemetry.lastSourceKind,
      lastSourceWidth: telemetry.lastSourceWidth,
      lastSourceHeight: telemetry.lastSourceHeight,
      lastCanvasWidth: telemetry.lastCanvasWidth,
      lastCanvasHeight: telemetry.lastCanvasHeight,
      heapUsedBytes: Number(memory?.usedJSHeapSize) || 0,
      heapLimitBytes: Number(memory?.jsHeapSizeLimit) || 0,
    };
  }

  window.__huffCapabilityTelemetry = telemetry;
  window.HuffCapabilityInstrumentation = freeze({
    version: 1,
    profiles: CAPABILITY_PROFILES,
    scenes: EFFECT_LOAD_SCENES,
    count,
    sample,
    markRenderPath,
    setSource,
    setCanvas,
    beginProfilerSession,
    closestProfile,
    snapshot,
  });
})();
