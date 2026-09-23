import { isPlainObject } from './guards';

/**
 * Home Assistant scripts in FLODE.
 *
 * A script is edited as a flow whose single entry is a "script start" node —
 * technically a trigger node with this platform — carrying the script's input
 * `fields`. That keeps the transpiler, parser, layout and position metadata
 * working unchanged: saving transpiles the flow as an automation and reshapes
 * it into a script config (`automationToScriptConfig`); opening a script does
 * the reverse (`scriptToAutomationConfig`) before parsing.
 */
export const SCRIPT_START_TRIGGER = 'flode_script_start';

/** Whether a trigger node's data is a script's start node. */
export function isScriptStart(data: unknown): boolean {
  return isPlainObject(data) && data.trigger === SCRIPT_START_TRIGGER;
}

/** Script input fields (`fields:`), keyed by variable name. */
export type ScriptFields = Record<string, Record<string, unknown>>;

/** The start node's fields — only well-formed entries. */
export function getScriptFields(data: unknown): ScriptFields {
  if (!isPlainObject(data) || !isPlainObject(data.fields)) return {};
  return Object.fromEntries(
    Object.entries(data.fields).filter((entry): entry is [string, Record<string, unknown>] =>
      isPlainObject(entry[1])
    )
  );
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

/** Keys an automation has but a script config doesn't. */
const AUTOMATION_ONLY_KEYS = new Set([
  'id',
  'trigger',
  'triggers',
  'condition',
  'conditions',
  'action',
  'actions',
  'trigger_variables',
  'initial_state',
  'hide_entity',
]);

/**
 * Reshapes a transpiled automation into a script config: the start node's
 * fields become `fields:`, top-level conditions lead the `sequence:` as
 * condition steps (a false one stops the script), actions follow. Other keys
 * (alias, description, mode, max, variables with `_flode_metadata`, icon …)
 * are kept.
 */
export function automationToScriptConfig(
  automation: Record<string, unknown>,
  extra: { icon?: string } = {}
): Record<string, unknown> {
  const start = asList(automation.triggers ?? automation.trigger).find(isScriptStart);
  const fields = getScriptFields(start);
  const rest = Object.fromEntries(
    Object.entries(automation).filter(([key]) => !AUTOMATION_ONLY_KEYS.has(key))
  );
  return {
    ...rest,
    ...(extra.icon ? { icon: extra.icon } : {}),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    sequence: [
      ...asList(automation.conditions ?? automation.condition),
      ...asList(automation.actions ?? automation.action),
    ],
  };
}

/**
 * The reverse of `automationToScriptConfig`, for opening a script: a script
 * start trigger (with the fields) in front of its sequence.
 */
export function scriptToAutomationConfig(script: Record<string, unknown>): Record<string, unknown> {
  const { sequence, fields, icon: _icon, ...rest } = script;
  return {
    ...rest,
    triggers: [
      {
        trigger: SCRIPT_START_TRIGGER,
        ...(isPlainObject(fields) && Object.keys(fields).length > 0 ? { fields } : {}),
      },
    ],
    conditions: [],
    actions: asList(sequence),
  };
}
