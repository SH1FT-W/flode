/**
 * "Raw" (pass-through) action steps.
 *
 * When the parser meets an action step FLODE has no dedicated node for (e.g.
 * the `scene: scene.x` shorthand, or a step from a newer HA version), the
 * original step is kept verbatim under `RAW_STEP_KEY` in an action node's
 * data. The transpiler writes it back unchanged, so opening and saving such
 * an automation in FLODE never loses or rewrites that step.
 */
export const RAW_STEP_KEY = '_raw';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The verbatim HA step stored on an action node, or `null` for regular nodes. */
export function getRawStep(data: unknown): Record<string, unknown> | null {
  if (!isPlainObject(data)) return null;
  const raw = data[RAW_STEP_KEY];
  return isPlainObject(raw) ? raw : null;
}

/** Action node data for a pass-through step. */
export function createRawStepData(step: Record<string, unknown>): Record<string, unknown> {
  return {
    [RAW_STEP_KEY]: step,
    ...(typeof step.alias === 'string' ? { alias: step.alias } : {}),
    ...(step.enabled === false ? { enabled: false } : {}),
  };
}

/**
 * The HA step to write for a pass-through node. The node's own `enabled`
 * toggle (set in FLODE) wins over whatever the original step said.
 */
export function buildRawStepAction(data: Record<string, unknown>): Record<string, unknown> | null {
  const raw = getRawStep(data);
  if (!raw) return null;
  const { enabled: _originalEnabled, ...rest } = raw;
  return data.enabled === false ? { ...rest, enabled: false } : rest;
}
