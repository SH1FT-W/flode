import { getRawStep, isPlainObject } from '@flode/shared';

/**
 * Whether a step runs at all: a card's data (also a pass-through card, whose
 * own toggle wins over its step's, see `buildRawStepAction`) or a raw HA step.
 * A templated `enabled` may skip the step, so it does not count as on.
 */
export function stepIsOn(step: unknown): boolean {
  if (!isPlainObject(step)) return false;
  const raw = getRawStep(step);
  const enabled =
    'enabled' in step || !raw ? step.enabled : raw.enabled === false ? undefined : raw.enabled;
  return enabled === undefined || enabled === true;
}

/**
 * How HA's `stop:` step ends the run (card data or a raw step): as planned or
 * as a failure (`error: true`); null when it is no stop or does not run (#38).
 */
export function stopKind(step: unknown): 'done' | 'error' | null {
  const raw = getRawStep(step) ?? step;
  if (!isPlainObject(raw) || !('stop' in raw) || !stepIsOn(step)) return null;
  return raw.error === true ? 'error' : 'done';
}
