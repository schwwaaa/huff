/* pipeline-runtime.js — HUFF Classic Pass 30 constrained recipe switching
 *
 * The runtime preserves the exact Pass 22 route as CLASSIC and adds one
 * carefully audited serial alternate: CRISP FINISH. Both recipes use the
 * existing gCur / gBuf / gScratch topology, compile once at startup, and are
 * selected atomically at the start of a rendered frame. No effect algorithm,
 * decoder path, temporal store, output path, or native code is changed here.
 */
(() => {
  'use strict';

  const freezeArray = value => Object.freeze([...value]);
  const freezeObject = value => Object.freeze({ ...value });

  const CLASSIC_RECIPE_ID = 'classic';
  const CRISP_FINISH_RECIPE_ID = 'crisp-finish';

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

  const CRISP_FINISH_ZONE_ORDER = freezeArray([
    'source-sync',
    'persistent-decay',
    'global-mix-before',
    'persistent-transform',
    'global-mix-after',
    'primary-transform',
    'global-mix-afterflow',
    'secondary-transform',
    'color-finish',
    'final-overlays',
    'global-mix-final',
    'presentation',
  ]);

  const STAGE_LEGAL_ZONES = Object.freeze({
    'source-sync': freezeArray(['source-sync']),
    'persistent-decay': freezeArray(['persistent-decay']),
    'front-stage-priority': freezeArray(['front-overlays', 'final-overlays']),
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

  // Pass 48: Layer Priority is intentionally a stable binary routing choice.
  // The former NEUTRAL/ALTERNATE and PULSE modes were render-time order
  // oscillators rather than meaningful layer hierarchy, and are removed.
  const FRONT_STAGE_PRIORITY_MODES = Object.freeze({
    scan: FRONT_STAGE_SCAN_TOP_ORDER,
    glitch: FRONT_STAGE_GLITCH_TOP_ORDER,
  });

  const FRONT_STAGE_PRIORITY_CONTRACT = Object.freeze({
    stateKey: 'layerPriority',
    defaultMode: 'scan',
    fallbackMode: 'scan',
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
    if (Object.keys(contract.modes ?? {}).some(mode => mode !== 'scan' && mode !== 'glitch')) {
      errors.push('front-stage priority contains a non-stable mode');
    }
    if (contract.defaultMode !== 'scan' || contract.fallbackMode !== 'scan') {
      errors.push('front-stage default/fallback must remain SCAN TOP');
    }

    return Object.freeze({
      valid: errors.length === 0,
      errors: freezeArray(errors),
    });
  }

  function resolveFrontStageOrder(mode) {
    if (mode === 'glitch') return FRONT_STAGE_GLITCH_TOP_ORDER;
    // SCAN TOP is both the default and the deterministic migration target for
    // removed legacy ALTERNATE/PULSE values.
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
      execute(frame, mode) {
        const order = resolveFrontStageOrder(mode);
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

  const CRISP_FINISH_SERIAL_RECIPE = freezeArray([
    freezeObject({ zone: 'source-sync', stage: 'source-sync' }),
    freezeObject({ zone: 'persistent-decay', stage: 'persistent-decay' }),
    freezeObject({ zone: 'global-mix-before', stage: 'global-mix', conditionalPosition: 'before' }),
    freezeObject({ zone: 'persistent-transform', stage: 'feedback' }),
    freezeObject({ zone: 'global-mix-after', stage: 'global-mix', conditionalPosition: 'after' }),
    freezeObject({ zone: 'primary-transform', stage: 'flow' }),
    freezeObject({ zone: 'global-mix-afterflow', stage: 'global-mix', conditionalPosition: 'afterflow' }),
    freezeObject({ zone: 'secondary-transform', stage: 'symmetry' }),
    freezeObject({ zone: 'color-finish', stage: 'solarize' }),
    freezeObject({
      zone: 'final-overlays',
      stage: 'front-stage-priority',
      members: freezeArray(['glitch', 'pipeline-luma-key', 'scanlines']),
      priorityContract: FRONT_STAGE_PRIORITY_CONTRACT,
    }),
    freezeObject({ zone: 'global-mix-final', stage: 'global-mix', conditionalPosition: 'final' }),
    freezeObject({ zone: 'presentation', stage: 'presentation' }),
  ]);

  const PIPELINE_RECIPES = Object.freeze({
    [CLASSIC_RECIPE_ID]: Object.freeze({
      id: CLASSIC_RECIPE_ID,
      label: 'CLASSIC',
      description: 'Exact Pass 22 stage order.',
      zoneOrder: ZONE_ORDER,
      steps: PASS22_SERIAL_RECIPE,
      fullResolutionBufferCount: 3,
      scratchResources: freezeArray(['gScratch']),
      declaredCycles: freezeArray([]),
      compatibilityDefault: true,
    }),
    [CRISP_FINISH_RECIPE_ID]: Object.freeze({
      id: CRISP_FINISH_RECIPE_ID,
      label: 'CRISP FINISH',
      description: 'Runs Glitch, Luma Key, and Scanlines after Flow, Symmetry, and Solarize.',
      zoneOrder: CRISP_FINISH_ZONE_ORDER,
      steps: CRISP_FINISH_SERIAL_RECIPE,
      fullResolutionBufferCount: 3,
      scratchResources: freezeArray(['gScratch']),
      declaredCycles: freezeArray([]),
      compatibilityDefault: false,
    }),
  });

  const REQUIRED_STAGE_COUNTS = Object.freeze({
    'source-sync': 1,
    'persistent-decay': 1,
    'front-stage-priority': 1,
    'global-mix': 4,
    'feedback': 1,
    'flow': 1,
    'symmetry': 1,
    'solarize': 1,
    'presentation': 1,
  });

  function validateRecipe(recipe, zoneOrder = ZONE_ORDER) {
    const errors = [];
    if (!Array.isArray(recipe)) {
      return Object.freeze({ valid: false, errors: freezeArray(['recipe must be an array']), stepCount: 0 });
    }
    if (!Array.isArray(zoneOrder)) {
      return Object.freeze({ valid: false, errors: freezeArray(['zone order must be an array']), stepCount: recipe.length });
    }
    if (recipe.length !== zoneOrder.length) {
      errors.push(`expected ${zoneOrder.length} steps, got ${recipe.length}`);
    }

    const stageCounts = Object.create(null);
    const globalMixPositions = [];

    for (let index = 0; index < recipe.length; index++) {
      const step = recipe[index];
      const expectedZone = zoneOrder[index];
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
      stageCounts[step.stage] = (stageCounts[step.stage] || 0) + 1;

      if (step.stage === 'global-mix') {
        const expectedPosition = step.zone.replace('global-mix-', '');
        if (step.conditionalPosition !== expectedPosition) {
          errors.push(`step ${index}: Global Mix position mismatch for ${step.zone}`);
        }
        globalMixPositions.push(step.conditionalPosition);
      }
      if (step.stage === 'front-stage-priority') {
        const expectedMembers = ['glitch', 'pipeline-luma-key', 'scanlines'];
        if (JSON.stringify(step.members) !== JSON.stringify(expectedMembers)) {
          errors.push('front-stage members differ from Pass 22');
        }
        const priorityValidation = validateFrontStagePriorityContract(step.priorityContract);
        if (!priorityValidation.valid) errors.push(...priorityValidation.errors);
      }
    }

    for (const [stage, expectedCount] of Object.entries(REQUIRED_STAGE_COUNTS)) {
      const actualCount = stageCounts[stage] || 0;
      if (actualCount !== expectedCount) {
        errors.push(`${stage}: expected ${expectedCount} occurrence(s), got ${actualCount}`);
      }
    }
    if (JSON.stringify(globalMixPositions) !== JSON.stringify(['before', 'after', 'afterflow', 'final'])) {
      errors.push('Global Mix named positions differ from the Classic contract');
    }

    return Object.freeze({
      valid: errors.length === 0,
      errors: freezeArray(errors),
      stepCount: recipe.length,
    });
  }

  function validateRecipeDefinition(definition) {
    const errors = [];
    if (!definition || typeof definition !== 'object') {
      return Object.freeze({ valid: false, errors: freezeArray(['recipe definition must be an object']) });
    }
    if (!definition.id || typeof definition.id !== 'string') errors.push('recipe id is required');
    if (!definition.label || typeof definition.label !== 'string') errors.push('recipe label is required');
    if (definition.fullResolutionBufferCount !== 3) {
      errors.push(`${definition.id || 'recipe'} must declare exactly three full-resolution buffers`);
    }
    if (JSON.stringify(definition.scratchResources) !== JSON.stringify(['gScratch'])) {
      errors.push(`${definition.id || 'recipe'} must use only the existing gScratch resource`);
    }
    if (!Array.isArray(definition.declaredCycles) || definition.declaredCycles.length !== 0) {
      errors.push(`${definition.id || 'recipe'} may not declare a pipeline cycle`);
    }
    const routeValidation = validateRecipe(definition.steps, definition.zoneOrder);
    if (!routeValidation.valid) errors.push(...routeValidation.errors);

    return Object.freeze({
      valid: errors.length === 0,
      errors: freezeArray(errors),
      stepCount: definition.steps?.length ?? 0,
    });
  }

  function compileRecipe(recipe, handlers, zoneOrder = ZONE_ORDER) {
    const validation = validateRecipe(recipe, zoneOrder);
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

  function compileRecipeRegistry(definitions, handlers) {
    if (!definitions || typeof definitions !== 'object') {
      throw new Error('[HUFF pipeline] recipe definitions are required');
    }
    const plans = Object.create(null);
    const validations = Object.create(null);
    for (const [id, definition] of Object.entries(definitions)) {
      if (definition.id !== id) {
        throw new Error(`[HUFF pipeline] recipe key/id mismatch: ${id}`);
      }
      const definitionValidation = validateRecipeDefinition(definition);
      if (!definitionValidation.valid) {
        throw new Error(`[HUFF pipeline] invalid recipe ${id}: ${definitionValidation.errors.join('; ')}`);
      }
      validations[id] = definitionValidation;
      plans[id] = compileRecipe(definition.steps, handlers, definition.zoneOrder);
    }
    if (!plans[CLASSIC_RECIPE_ID]) {
      throw new Error('[HUFF pipeline] CLASSIC compatibility recipe is required');
    }
    return Object.freeze({
      definitions,
      plans: Object.freeze(plans),
      validations: Object.freeze(validations),
      ids: freezeArray(Object.keys(plans)),
      get(id) {
        return plans[id] || null;
      },
    });
  }

  function createRecipeSwitcher(compiledRegistry, fallbackId = CLASSIC_RECIPE_ID) {
    if (!compiledRegistry?.plans || !compiledRegistry.plans[fallbackId]) {
      throw new Error('[HUFF pipeline] a compiled fallback recipe is required');
    }

    let activeId = fallbackId;
    let activePlan = compiledRegistry.plans[fallbackId];
    let lastRequestedId = fallbackId;
    let fallbackCount = 0;

    return Object.freeze({
      select(requestedId) {
        const normalized = typeof requestedId === 'string' && requestedId
          ? requestedId
          : fallbackId;
        if (normalized === lastRequestedId) return activePlan;
        lastRequestedId = normalized;
        const nextPlan = compiledRegistry.plans[normalized];
        if (nextPlan) {
          activeId = normalized;
          activePlan = nextPlan;
        } else {
          activeId = fallbackId;
          activePlan = compiledRegistry.plans[fallbackId];
          fallbackCount++;
          console.warn(`[HUFF pipeline] unknown recipe "${normalized}"; restored CLASSIC`);
        }
        return activePlan;
      },
      get activeId() {
        return activeId;
      },
      get activePlan() {
        return activePlan;
      },
      get fallbackCount() {
        return fallbackCount;
      },
      fallbackId,
    });
  }

  const frontStageValidation = validateFrontStagePriorityContract(FRONT_STAGE_PRIORITY_CONTRACT);
  if (!frontStageValidation.valid) {
    throw new Error(`[HUFF pipeline] built-in front-stage contract failed validation: ${frontStageValidation.errors.join('; ')}`);
  }

  const validation = validateRecipe(PASS22_SERIAL_RECIPE, ZONE_ORDER);
  if (!validation.valid) {
    throw new Error(`[HUFF pipeline] built-in Pass 22 recipe failed validation: ${validation.errors.join('; ')}`);
  }

  const recipeValidations = Object.freeze(Object.fromEntries(
    Object.entries(PIPELINE_RECIPES).map(([id, definition]) => {
      const result = validateRecipeDefinition(definition);
      if (!result.valid) {
        throw new Error(`[HUFF pipeline] built-in recipe ${id} failed validation: ${result.errors.join('; ')}`);
      }
      return [id, result];
    }),
  ));

  window.HuffPipelineRuntime = Object.freeze({
    version: 2,
    recipeVersion: 1,
    CLASSIC_RECIPE_ID,
    CRISP_FINISH_RECIPE_ID,
    ZONE_ORDER,
    CRISP_FINISH_ZONE_ORDER,
    STAGE_LEGAL_ZONES,
    STAGE_RESOURCE_RULES,
    FRONT_STAGE_PRIORITY_CONTRACT,
    PASS22_SERIAL_RECIPE,
    CRISP_FINISH_SERIAL_RECIPE,
    PIPELINE_RECIPES,
    frontStageValidation,
    validation,
    recipeValidations,
    validateFrontStagePriorityContract,
    resolveFrontStageOrder,
    compileFrontStagePriority,
    validateRecipe,
    validateRecipeDefinition,
    compileRecipe,
    compileRecipeRegistry,
    createRecipeSwitcher,
  });
})();
