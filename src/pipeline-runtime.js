/* pipeline-runtime.js — HUFF Classic Pass 26 constrained priority foundation
 *
 * This file keeps the one accepted Pass 22 serial route, formalizes the exact
 * existing Glitch/Luma versus Scanline priority modes, and compiles both plans
 * once at startup. It adds no routing controls, effect positions, render
 * resources, or visual behavior.
 */
(() => {
  'use strict';

  const freezeArray = value => Object.freeze([...value]);
  const freezeObject = value => Object.freeze({ ...value });

  const ZONE_ORDER = freezeArray([
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

  const STAGE_LEGAL_ZONES = Object.freeze({
    'source-sync': freezeArray(['source-sync']),
    'persistent-decay': freezeArray(['persistent-decay']),
    'front-stage-priority': freezeArray(['front-overlays']),
    'global-mix': freezeArray([
      'global-mix-before',
      'global-mix-after',
      'global-mix-afterflow',
      'global-mix-final',
    ]),
    'feedback': freezeArray(['persistent-transform']),
    'flow': freezeArray(['primary-transform']),
    'symmetry': freezeArray(['secondary-transform']),
    'solarize': freezeArray(['color-finish']),
    'presentation': freezeArray(['presentation']),
  });

  const STAGE_RESOURCE_RULES = Object.freeze({
    'source-sync': freezeObject({ scratch: false, swap: false }),
    'persistent-decay': freezeObject({ scratch: false, swap: false }),
    'front-stage-priority': freezeObject({ scratch: false, swap: false }),
    'global-mix': freezeObject({ scratch: false, swap: false }),
    'feedback': freezeObject({ scratch: true, swap: false }),
    'flow': freezeObject({ scratch: true, swap: true }),
    'symmetry': freezeObject({ scratch: true, swap: true }),
    'solarize': freezeObject({ scratch: false, swap: false }),
    'presentation': freezeObject({ scratch: false, swap: false }),
  });

  const FRONT_STAGE_GROUPS = Object.freeze({
    'glitch-luma-group': freezeArray(['glitch', 'pipeline-luma-key']),
    'scanline-group': freezeArray(['scanlines']),
  });

  // Array order is paint order. The last group is visually on top.
  const FRONT_STAGE_SCAN_TOP_ORDER = freezeArray([
    'glitch-luma-group',
    'scanline-group',
  ]);
  const FRONT_STAGE_GLITCH_TOP_ORDER = freezeArray([
    'scanline-group',
    'glitch-luma-group',
  ]);

  const FRONT_STAGE_PRIORITY_MODES = Object.freeze({
    scan: FRONT_STAGE_SCAN_TOP_ORDER,
    glitch: FRONT_STAGE_GLITCH_TOP_ORDER,
    neutral: 'alternate-each-render-frame',
    pulse: 'alternate-by-layer-pulse-speed',
  });

  const FRONT_STAGE_PRIORITY_CONTRACT = Object.freeze({
    stateKey: 'layerPriority',
    pulseSpeedKey: 'layerPulseSpeed',
    renderFrameKey: 'frameCount',
    defaultMode: 'scan',
    fallbackMode: 'scan',
    renderRateBasis: 60,
    pulseMinimumSpeed: 0.1,
    pulseMinimumFrames: 1,
    groups: FRONT_STAGE_GROUPS,
    modes: FRONT_STAGE_PRIORITY_MODES,
  });

  function validateFrontStagePriorityContract(contract) {
    const errors = [];
    if (!contract || typeof contract !== 'object') {
      return Object.freeze({ valid: false, errors: freezeArray(['front-stage contract must be an object']) });
    }

    const expectedGroupIds = ['glitch-luma-group', 'scanline-group'];
    const actualGroupIds = Object.keys(contract.groups ?? {});
    if (JSON.stringify(actualGroupIds) !== JSON.stringify(expectedGroupIds)) {
      errors.push('front-stage group IDs differ from Pass 22');
    }
    if (JSON.stringify(contract.groups?.['glitch-luma-group']) !== JSON.stringify(['glitch', 'pipeline-luma-key'])) {
      errors.push('Glitch/Luma group differs from Pass 22');
    }
    if (JSON.stringify(contract.groups?.['scanline-group']) !== JSON.stringify(['scanlines'])) {
      errors.push('Scanline group differs from Pass 22');
    }
    if (JSON.stringify(contract.modes?.scan) !== JSON.stringify(FRONT_STAGE_SCAN_TOP_ORDER)) {
      errors.push('SCAN TOP order differs from Pass 22');
    }
    if (JSON.stringify(contract.modes?.glitch) !== JSON.stringify(FRONT_STAGE_GLITCH_TOP_ORDER)) {
      errors.push('GLITCH TOP order differs from Pass 22');
    }
    if (contract.modes?.neutral !== 'alternate-each-render-frame') {
      errors.push('NEUTRAL mode differs from Pass 22');
    }
    if (contract.modes?.pulse !== 'alternate-by-layer-pulse-speed') {
      errors.push('PULSE mode differs from Pass 22');
    }
    if (contract.defaultMode !== 'scan' || contract.fallbackMode !== 'scan') {
      errors.push('front-stage default/fallback mode differs from Pass 22');
    }
    if (contract.renderRateBasis !== 60 || contract.pulseMinimumSpeed !== 0.1 || contract.pulseMinimumFrames !== 1) {
      errors.push('front-stage pulse timing constants differ from Pass 22');
    }

    return Object.freeze({
      valid: errors.length === 0,
      errors: freezeArray(errors),
    });
  }

  function resolveFrontStageOrder(mode, pulseSpeed, renderFrame) {
    if (mode === 'glitch') return FRONT_STAGE_GLITCH_TOP_ORDER;
    if (mode === 'neutral') {
      return (renderFrame & 1) === 0
        ? FRONT_STAGE_GLITCH_TOP_ORDER
        : FRONT_STAGE_SCAN_TOP_ORDER;
    }
    if (mode === 'pulse') {
      // Preserve the exact Pass 22 pulse calculation and 60fps timing basis.
      const pulseFrames = Math.max(
        FRONT_STAGE_PRIORITY_CONTRACT.pulseMinimumFrames,
        Math.round(
          FRONT_STAGE_PRIORITY_CONTRACT.renderRateBasis /
          Math.max(FRONT_STAGE_PRIORITY_CONTRACT.pulseMinimumSpeed, pulseSpeed),
        ),
      );
      return (Math.floor(renderFrame / pulseFrames) & 1) === 0
        ? FRONT_STAGE_GLITCH_TOP_ORDER
        : FRONT_STAGE_SCAN_TOP_ORDER;
    }
    // "scan", an empty value, and unknown legacy values retain SCAN TOP.
    return FRONT_STAGE_SCAN_TOP_ORDER;
  }

  function compileFrontStagePriority(groupHandlers) {
    const contractValidation = validateFrontStagePriorityContract(FRONT_STAGE_PRIORITY_CONTRACT);
    if (!contractValidation.valid) {
      throw new Error(`[HUFF pipeline] invalid front-stage priority contract: ${contractValidation.errors.join('; ')}`);
    }
    if (!groupHandlers || typeof groupHandlers !== 'object') {
      throw new Error('[HUFF pipeline] front-stage group handlers are required');
    }

    const glitchLumaHandler = groupHandlers['glitch-luma-group'];
    const scanlineHandler = groupHandlers['scanline-group'];
    if (typeof glitchLumaHandler !== 'function') {
      throw new Error('[HUFF pipeline] missing front-stage handler for glitch-luma-group');
    }
    if (typeof scanlineHandler !== 'function') {
      throw new Error('[HUFF pipeline] missing front-stage handler for scanline-group');
    }

    const compiledHandlers = Object.freeze({
      'glitch-luma-group': glitchLumaHandler,
      'scanline-group': scanlineHandler,
    });

    return Object.freeze({
      contract: FRONT_STAGE_PRIORITY_CONTRACT,
      validation: contractValidation,
      resolveOrder: resolveFrontStageOrder,
      execute(frame, mode, pulseSpeed, renderFrame) {
        const order = resolveFrontStageOrder(mode, pulseSpeed, renderFrame);
        compiledHandlers[order[0]](frame);
        compiledHandlers[order[1]](frame);
      },
    });
  }

  const PASS22_SERIAL_RECIPE = freezeArray([
    freezeObject({ zone: 'source-sync', stage: 'source-sync' }),
    freezeObject({ zone: 'persistent-decay', stage: 'persistent-decay' }),
    freezeObject({
      zone: 'front-overlays',
      stage: 'front-stage-priority',
      members: freezeArray(['glitch', 'pipeline-luma-key', 'scanlines']),
      priorityContract: FRONT_STAGE_PRIORITY_CONTRACT,
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

  function validateRecipe(recipe) {
    const errors = [];
    if (!Array.isArray(recipe)) {
      return Object.freeze({ valid: false, errors: freezeArray(['recipe must be an array']), stepCount: 0 });
    }
    if (recipe.length !== ZONE_ORDER.length) {
      errors.push(`expected ${ZONE_ORDER.length} steps, got ${recipe.length}`);
    }

    for (let index = 0; index < recipe.length; index++) {
      const step = recipe[index];
      const expectedZone = ZONE_ORDER[index];
      if (!step || typeof step !== 'object') {
        errors.push(`step ${index} is not an object`);
        continue;
      }
      if (step.zone !== expectedZone) {
        errors.push(`step ${index}: expected zone ${expectedZone}, got ${step.zone}`);
      }
      const legalZones = STAGE_LEGAL_ZONES[step.stage];
      if (!legalZones) {
        errors.push(`step ${index}: unknown stage ${step.stage}`);
      } else if (!legalZones.includes(step.zone)) {
        errors.push(`step ${index}: ${step.stage} is illegal in ${step.zone}`);
      }
      const resourceRule = STAGE_RESOURCE_RULES[step.stage];
      if (!resourceRule) {
        errors.push(`step ${index}: missing resource rule for ${step.stage}`);
      }
      if (step.stage === 'global-mix') {
        const expectedPosition = step.zone.replace('global-mix-', '');
        if (step.conditionalPosition !== expectedPosition) {
          errors.push(`step ${index}: Global Mix position mismatch for ${step.zone}`);
        }
      }
      if (step.stage === 'front-stage-priority') {
        const expectedMembers = ['glitch', 'pipeline-luma-key', 'scanlines'];
        if (JSON.stringify(step.members) !== JSON.stringify(expectedMembers)) {
          errors.push('front-stage members differ from Pass 22');
        }
        const priorityValidation = validateFrontStagePriorityContract(step.priorityContract);
        if (!priorityValidation.valid) {
          errors.push(...priorityValidation.errors);
        }
      }
    }

    return Object.freeze({
      valid: errors.length === 0,
      errors: freezeArray(errors),
      stepCount: recipe.length,
    });
  }

  function compileRecipe(recipe, handlers) {
    const validation = validateRecipe(recipe);
    if (!validation.valid) {
      throw new Error(`[HUFF pipeline] invalid serial recipe: ${validation.errors.join('; ')}`);
    }
    if (!handlers || typeof handlers !== 'object') {
      throw new Error('[HUFF pipeline] stage handlers are required');
    }

    const compiled = new Array(recipe.length);
    for (let index = 0; index < recipe.length; index++) {
      const step = recipe[index];
      const handler = handlers[step.stage];
      if (typeof handler !== 'function') {
        throw new Error(`[HUFF pipeline] missing handler for ${step.stage}`);
      }
      compiled[index] = Object.freeze({ handler, step });
    }
    Object.freeze(compiled);

    return Object.freeze({
      validation,
      recipe,
      executeSource(frame) {
        const entry = compiled[0];
        entry.handler(frame, entry.step);
      },
      executePersistent(frame) {
        const entry = compiled[1];
        entry.handler(frame, entry.step);
      },
      executeEffectsAndPresentation(frame) {
        for (let index = 2; index < compiled.length; index++) {
          const entry = compiled[index];
          entry.handler(frame, entry.step);
        }
      },
      executeActive(frame) {
        for (let index = 1; index < compiled.length; index++) {
          const entry = compiled[index];
          entry.handler(frame, entry.step);
        }
      },
    });
  }

  const frontStageValidation = validateFrontStagePriorityContract(FRONT_STAGE_PRIORITY_CONTRACT);
  if (!frontStageValidation.valid) {
    throw new Error(`[HUFF pipeline] built-in front-stage contract failed validation: ${frontStageValidation.errors.join('; ')}`);
  }

  const validation = validateRecipe(PASS22_SERIAL_RECIPE);
  if (!validation.valid) {
    throw new Error(`[HUFF pipeline] built-in Pass 22 recipe failed validation: ${validation.errors.join('; ')}`);
  }

  window.HuffPipelineRuntime = Object.freeze({
    version: 2,
    ZONE_ORDER,
    STAGE_LEGAL_ZONES,
    STAGE_RESOURCE_RULES,
    FRONT_STAGE_PRIORITY_CONTRACT,
    PASS22_SERIAL_RECIPE,
    frontStageValidation,
    validation,
    validateFrontStagePriorityContract,
    resolveFrontStageOrder,
    compileFrontStagePriority,
    validateRecipe,
    compileRecipe,
  });
})();
