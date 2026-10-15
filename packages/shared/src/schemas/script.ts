import type { FlowGraph } from './graph';
import { isPlainObject, toList } from './guards';

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

/**
 * An automation without triggers (HA allows it: it runs only when started by
 * hand, by a script or another automation) is opened like a script: a hidden
 * start node in front of its steps (`withManualStart`), which saving drops
 * again (`withoutManualStart`) — `triggers: []` stays `triggers: []`.
 */
export const MANUAL_START_TRIGGER = 'flode_manual_start';

/** Whether a trigger node's data is the start node of an automation without triggers. */
export function isManualStart(data: unknown): boolean {
  return isPlainObject(data) && data.trigger === MANUAL_START_TRIGGER;
}

/** A flow's hidden start node: a script's start or that of an automation without triggers. */
export function isFlowStart(data: unknown): boolean {
  return isScriptStart(data) || isManualStart(data);
}

/** An automation config without triggers gets the hidden start node (others are returned as they are). */
export function withManualStart(config: Record<string, unknown>): Record<string, unknown> {
  if (toList(config.triggers ?? config.trigger).length > 0) return config;
  const { trigger: _trigger, ...rest } = config;
  return { ...rest, triggers: [{ trigger: MANUAL_START_TRIGGER }] };
}

/** The reverse of `withManualStart` on a transpiled automation. */
export function withoutManualStart(automation: Record<string, unknown>): Record<string, unknown> {
  const triggers = toList(automation.triggers);
  if (!triggers.some(isManualStart)) return automation;
  return { ...automation, triggers: triggers.filter((trigger) => !isManualStart(trigger)) };
}

/**
 * Once an automation without triggers gets a trigger of its own, its hidden
 * start has done its job: it goes, with its connections — the steps it led
 * to then need a connection to a real trigger, like any other card.
 */
export function dropSupersededManualStart(graph: FlowGraph): FlowGraph {
  const start = graph.nodes.find((node) => isManualStart(node.data));
  if (!start || !graph.nodes.some((node) => node.type === 'trigger' && node !== start)) {
    return graph;
  }
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node !== start),
    edges: graph.edges.filter((edge) => edge.source !== start.id && edge.target !== start.id),
  };
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
  const start = toList(automation.triggers ?? automation.trigger).find(isScriptStart);
  const fields = getScriptFields(start);
  const rest = Object.fromEntries(
    Object.entries(automation).filter(([key]) => !AUTOMATION_ONLY_KEYS.has(key))
  );
  return {
    ...rest,
    ...(extra.icon ? { icon: extra.icon } : {}),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    sequence: [
      ...toList(automation.conditions ?? automation.condition),
      ...toList(automation.actions ?? automation.action),
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
    actions: toList(sequence),
  };
}
