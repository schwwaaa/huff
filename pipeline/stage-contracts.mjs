/**
 * HUFF Classic Pass 24 — Stage Contract Registry
 *
 * This module is deliberately not loaded by the Pass 22 runtime. It is the
 * machine-readable contract foundation for the validated serial recipe work
 * planned for Pass 25. Keeping it detached in Pass 24 guarantees that no
 * render dispatch, effect algorithm, control, preset, clock, or output path
 * changes merely because the contracts now exist.
 */

const freezeArray = (value) => Object.freeze([...value]);
const freezeObject = (value) => Object.freeze({ ...value });

export const PIPELINE_RESOURCES = freezeArray([
  'video-source',
  'gCur',
  'gBuf',
  'gScratch',
  'FrameRing',
  'main-canvas',
]);

export const PIPELINE_ZONES = freezeArray([
  'source-sync',
  'persistent-decay',
  'front-overlays',
  'global-mix-before',
  'persistent-transform',
  'global-mix-after',
  'primary-transform',
  'global-mix-afterflow',
  'secondary-transform',
  'color-finish',
  'global-mix-final',
  'presentation',
]);

const defineContract = (contract) => Object.freeze({
  ...contract,
  legalZones: freezeArray(contract.legalZones),
  reads: freezeArray(contract.reads),
  writes: freezeArray(contract.writes),
  scratch: freezeArray(contract.scratch ?? []),
});

export const STAGE_CONTRACTS = freezeArray([
  defineContract({
    id: 'source-sync',
    label: 'Decoded Source Synchronization',
    stageClass: 'source-sync',
    legalZones: ['source-sync'],
    reads: ['video-source'],
    writes: ['gCur'],
    scratch: [],
    clearsDestination: false,
    swapsBuffers: false,
    stateful: true,
    requiresCleanSource: false,
    requiresFrameRing: false,
    routingPresettable: false,
    liveSafeRouting: false,
    defaultOrder: 10,
    frozen: true,
  }),
  defineContract({
    id: 'persistent-decay',
    label: 'Persistent Composite Decay',
    stageClass: 'in-place-persistence',
    legalZones: ['persistent-decay'],
    reads: ['gBuf'],
    writes: ['gBuf'],
    scratch: [],
    clearsDestination: false,
    swapsBuffers: false,
    stateful: true,
    requiresCleanSource: false,
    requiresFrameRing: false,
    routingPresettable: false,
    liveSafeRouting: false,
    defaultOrder: 20,
    frozen: true,
  }),
  defineContract({
    id: 'glitch',
    label: 'Glitch',
    stageClass: 'clean-overlay',
    legalZones: ['front-overlays'],
    reads: ['gCur', 'FrameRing'],
    writes: ['gBuf'],
    scratch: [],
    clearsDestination: false,
    swapsBuffers: false,
    stateful: true,
    requiresCleanSource: true,
    requiresFrameRing: true,
    routingPresettable: true,
    liveSafeRouting: true,
    orderingGroup: 'glitch-luma-group',
    defaultOrder: 30,
    frozen: false,
  }),
  defineContract({
    id: 'pipeline-luma-key',
    label: 'Pipeline Luma Key',
    stageClass: 'clean-overlay',
    legalZones: ['front-overlays'],
    reads: ['gCur'],
    writes: ['gBuf'],
    scratch: [],
    clearsDestination: false,
    swapsBuffers: false,
    stateful: false,
    requiresCleanSource: true,
    requiresFrameRing: false,
    routingPresettable: true,
    liveSafeRouting: true,
    orderingGroup: 'glitch-luma-group',
    defaultOrder: 31,
    frozen: false,
  }),
  defineContract({
    id: 'scanlines',
    label: 'Scanlines',
    stageClass: 'clean-overlay',
    legalZones: ['front-overlays'],
    reads: ['gCur'],
    writes: ['gBuf'],
    scratch: [],
    clearsDestination: false,
    swapsBuffers: false,
    stateful: true,
    requiresCleanSource: true,
    requiresFrameRing: false,
    routingPresettable: true,
    liveSafeRouting: true,
    orderingGroup: 'scanline-group',
    defaultOrder: 32,
    frozen: false,
  }),
  defineContract({
    id: 'global-mix',
    label: 'Global Mix',
    stageClass: 'clean-overlay',
    legalZones: [
      'global-mix-before',
      'global-mix-after',
      'global-mix-afterflow',
      'global-mix-final',
    ],
    reads: ['gCur'],
    writes: ['gBuf'],
    scratch: [],
    clearsDestination: false,
    swapsBuffers: false,
    stateful: false,
    requiresCleanSource: true,
    requiresFrameRing: false,
    routingPresettable: true,
    liveSafeRouting: true,
    defaultOrder: 40,
    frozen: false,
  }),
  defineContract({
    id: 'feedback',
    label: 'Feedback',
    stageClass: 'snapshot-transform',
    legalZones: ['persistent-transform'],
    reads: ['gBuf'],
    writes: ['gScratch', 'gBuf'],
    scratch: ['gScratch'],
    clearsDestination: true,
    swapsBuffers: false,
    stateful: true,
    requiresCleanSource: false,
    requiresFrameRing: false,
    routingPresettable: false,
    liveSafeRouting: false,
    defaultOrder: 50,
    frozen: true,
  }),
  defineContract({
    id: 'flow',
    label: 'Flow',
    stageClass: 'ping-pong-transform',
    legalZones: ['primary-transform'],
    reads: ['gBuf', 'FrameRing'],
    writes: ['gScratch'],
    scratch: ['gScratch'],
    clearsDestination: true,
    swapsBuffers: true,
    stateful: true,
    requiresCleanSource: false,
    requiresFrameRing: true,
    routingPresettable: false,
    liveSafeRouting: false,
    defaultOrder: 60,
    frozen: true,
  }),
  defineContract({
    id: 'symmetry',
    label: 'Symmetry',
    stageClass: 'ping-pong-transform',
    legalZones: ['secondary-transform'],
    reads: ['gBuf'],
    writes: ['gScratch'],
    scratch: ['gScratch'],
    clearsDestination: true,
    swapsBuffers: true,
    stateful: false,
    requiresCleanSource: false,
    requiresFrameRing: false,
    routingPresettable: false,
    liveSafeRouting: false,
    defaultOrder: 70,
    frozen: true,
  }),
  defineContract({
    id: 'solarize',
    label: 'Solarize',
    stageClass: 'in-place-readback',
    legalZones: ['color-finish'],
    reads: ['gBuf'],
    writes: ['gBuf'],
    scratch: [],
    clearsDestination: false,
    swapsBuffers: false,
    stateful: true,
    requiresCleanSource: false,
    requiresFrameRing: false,
    routingPresettable: false,
    liveSafeRouting: false,
    defaultOrder: 80,
    frozen: true,
  }),
  defineContract({
    id: 'presentation',
    label: 'Program Presentation',
    stageClass: 'presentation',
    legalZones: ['presentation'],
    reads: ['gCur', 'gBuf'],
    writes: ['main-canvas'],
    scratch: [],
    clearsDestination: false,
    swapsBuffers: false,
    stateful: false,
    requiresCleanSource: true,
    requiresFrameRing: false,
    routingPresettable: false,
    liveSafeRouting: false,
    defaultOrder: 90,
    frozen: true,
  }),
]);

export const PASS22_ROUTE_SKELETON = freezeArray([
  freezeObject({ zone: 'source-sync', stage: 'source-sync' }),
  freezeObject({ zone: 'persistent-decay', stage: 'persistent-decay' }),
  freezeObject({
    zone: 'front-overlays',
    stage: 'front-stage-priority',
    members: freezeArray(['glitch', 'pipeline-luma-key', 'scanlines']),
  }),
  freezeObject({ zone: 'global-mix-before', stage: 'global-mix', conditionalPosition: 'before' }),
  freezeObject({ zone: 'persistent-transform', stage: 'feedback' }),
  freezeObject({ zone: 'global-mix-after', stage: 'global-mix', conditionalPosition: 'after' }),
  freezeObject({ zone: 'primary-transform', stage: 'flow' }),
  freezeObject({ zone: 'global-mix-afterflow', stage: 'global-mix', conditionalPosition: 'afterflow' }),
  freezeObject({ zone: 'secondary-transform', stage: 'symmetry' }),
  freezeObject({ zone: 'color-finish', stage: 'solarize' }),
  freezeObject({ zone: 'global-mix-final', stage: 'global-mix', conditionalPosition: 'final' }),
  freezeObject({ zone: 'presentation', stage: 'presentation' }),
]);

export const FRONT_STAGE_PRIORITY_CONTRACT = Object.freeze({
  stateKey: 'layerPriority',
  pulseSpeedKey: 'layerPulseSpeed',
  groups: Object.freeze({
    'glitch-luma-group': freezeArray(['glitch', 'pipeline-luma-key']),
    'scanline-group': freezeArray(['scanlines']),
  }),
  modes: Object.freeze({
    scan: freezeArray(['glitch-luma-group', 'scanline-group']),
    glitch: freezeArray(['scanline-group', 'glitch-luma-group']),
    neutral: 'alternate-each-render-frame',
    pulse: 'alternate-by-layer-pulse-speed',
  }),
  defaultMode: 'scan',
});

export function validateStageContractRegistry() {
  const errors = [];
  const resources = new Set(PIPELINE_RESOURCES);
  const zones = new Set(PIPELINE_ZONES);
  const ids = new Set();

  for (const contract of STAGE_CONTRACTS) {
    if (!contract.id || ids.has(contract.id)) errors.push(`duplicate or missing stage id: ${contract.id}`);
    ids.add(contract.id);

    for (const zone of contract.legalZones) {
      if (!zones.has(zone)) errors.push(`${contract.id}: unknown zone ${zone}`);
    }
    for (const resource of [...contract.reads, ...contract.writes, ...contract.scratch]) {
      if (!resources.has(resource)) errors.push(`${contract.id}: unknown resource ${resource}`);
    }
    if (contract.swapsBuffers && !contract.scratch.includes('gScratch')) {
      errors.push(`${contract.id}: buffer swap requires gScratch`);
    }
    if (contract.requiresFrameRing && !contract.reads.includes('FrameRing')) {
      errors.push(`${contract.id}: requiresFrameRing without FrameRing read`);
    }
  }

  for (const step of PASS22_ROUTE_SKELETON) {
    if (!zones.has(step.zone)) errors.push(`route: unknown zone ${step.zone}`);
    if (step.stage !== 'front-stage-priority' && !ids.has(step.stage)) {
      errors.push(`route: unknown stage ${step.stage}`);
    }
    if (step.members) {
      for (const member of step.members) {
        if (!ids.has(member)) errors.push(`route: unknown front-stage member ${member}`);
      }
    }
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: freezeArray(errors),
    contractCount: STAGE_CONTRACTS.length,
    routeStepCount: PASS22_ROUTE_SKELETON.length,
  });
}
