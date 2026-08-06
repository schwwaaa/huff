/* pipeline-runtime.js — HUFF Classic Pass 25 validated serial recipe
 *
 * This file does not add routing controls or new render resources. It validates
 * and compiles the exact Pass 22 serial route once at startup, then dispatches
 * the existing stage implementations through that immutable plan.
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

  const PASS22_SERIAL_RECIPE = freezeArray([
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

  const validation = validateRecipe(PASS22_SERIAL_RECIPE);
  if (!validation.valid) {
    throw new Error(`[HUFF pipeline] built-in Pass 22 recipe failed validation: ${validation.errors.join('; ')}`);
  }

  window.HuffPipelineRuntime = Object.freeze({
    version: 1,
    ZONE_ORDER,
    STAGE_LEGAL_ZONES,
    STAGE_RESOURCE_RULES,
    PASS22_SERIAL_RECIPE,
    validation,
    validateRecipe,
    compileRecipe,
  });
})();
