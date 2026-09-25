import {
  buildRawStepAction,
  createRawStepData,
  type FlowNode,
  isDeviceAction,
  isPlainObject,
} from '@flode/shared';
import type { NodeType } from './flow-model';

/**
 * Bridge between FLODE's node data and the step format HA's own automation
 * editors (`ha-automation-trigger-editor` & co.) read and emit. Mirrors what
 * the transpiler writes, so what the user edits is what gets saved.
 */

export type StepKind = 'trigger' | 'condition' | 'action';

export function stepKind(type: NodeType): StepKind {
  return type === 'trigger' || type === 'condition' ? type : 'action';
}

/** FLODE-internal keys HA's editors must not see (and that survive an edit). */
const INTERNAL_CONDITION_KEYS = ['_chooseCase', '_chooseCaseTotal'] as const;

function withoutId(data: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...rest } = data;
  return rest;
}

/**
 * Legacy shorthands HA's own editor rewrites before showing a form (its
 * `migrateAutomationAction`): `scene: x` has no form of its own, it becomes
 * a `scene.turn_on` call — otherwise HA falls back to YAML.
 */
function migrateLegacyAction(step: Record<string, unknown>): Record<string, unknown> {
  if (typeof step.scene === 'string') {
    const { scene, ...rest } = step;
    return { ...rest, action: 'scene.turn_on', target: { entity_id: scene } };
  }
  return step;
}

function actionStep(data: Record<string, unknown>): Record<string, unknown> {
  const raw = buildRawStepAction(data);
  if (raw) return migrateLegacyAction(raw);
  const { alias, enabled } = data;
  const common = {
    ...(typeof alias === 'string' && alias ? { alias } : {}),
    ...(enabled === false ? { enabled: false } : {}),
  };
  if (isDeviceAction(data.data)) return { ...common, ...data.data };
  if (isPlainObject(data.repeat)) return { ...common, repeat: data.repeat };
  if (typeof data.event === 'string' && data.event) {
    return {
      ...common,
      event: data.event,
      ...(isPlainObject(data.event_data) ? { event_data: data.event_data } : {}),
    };
  }
  if ('stop' in data) {
    return { ...common, stop: data.stop ?? '', ...(data.error === true ? { error: true } : {}) };
  }
  const {
    service,
    action: _action,
    id: _id,
    alias: _alias,
    enabled: _enabled,
    data: serviceData,
    ...rest
  } = data;
  return {
    ...common,
    ...rest,
    action: service,
    ...(isPlainObject(serviceData) && Object.keys(serviceData).length > 0
      ? { data: serviceData }
      : {}),
  };
}

/** HA's form validators reject keys that are present but `undefined` (e.g. `data_template`). */
function withoutUndefined(step: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(step).filter(([, value]) => value !== undefined));
}

/** The HA step for a node — what HA's editor element gets as `.trigger` / `.condition` / `.action`. */
export function nodeToStep(node: FlowNode): Record<string, unknown> {
  // A deep copy: HA's nested editors normalise the step they're given in
  // place (e.g. add `data: {}`), which must never reach the graph unseen.
  return structuredClone(withoutUndefined(rawNodeToStep(node)));
}

function rawNodeToStep(node: FlowNode): Record<string, unknown> {
  const data: Record<string, unknown> = isPlainObject(node.data) ? node.data : {};
  switch (node.type) {
    case 'trigger':
      return data;
    case 'condition': {
      const out = { ...data };
      for (const key of INTERNAL_CONDITION_KEYS) delete out[key];
      return out;
    }
    case 'action':
      return actionStep(data);
    default:
      return withoutId(data);
  }
}

/**
 * A step coming back from HA's editor (or its add dialog) as a FLODE node.
 * Anything FLODE has no dedicated node for (choose, if, repeat, device
 * actions, scenes …) is kept verbatim as a raw step — the transpiler writes
 * it back unchanged.
 */
export function stepToNode(
  kind: StepKind,
  step: Record<string, unknown>,
  previous?: FlowNode
): { type: NodeType; data: Record<string, unknown> } {
  if (kind === 'trigger') return { type: 'trigger', data: step };
  if (kind === 'condition' || (typeof step.condition === 'string' && !('action' in step))) {
    const kept: Record<string, unknown> = {};
    if (previous?.type === 'condition' && isPlainObject(previous.data)) {
      for (const key of INTERNAL_CONDITION_KEYS) {
        if (key in previous.data) kept[key] = previous.data[key];
      }
    }
    return { type: 'condition', data: { ...step, ...kept } };
  }
  if ('delay' in step) return { type: 'delay', data: step };
  if ('wait_template' in step || 'wait_for_trigger' in step) return { type: 'wait', data: step };
  if (
    isPlainObject(step.variables) &&
    Object.keys(step).every((k) => ['variables', 'alias', 'enabled'].includes(k))
  ) {
    return { type: 'set_variables', data: step };
  }
  const service = step.action ?? step.service;
  if (typeof service === 'string' && !('device_id' in step)) {
    const { action: _action, service: _service, ...rest } = step;
    return { type: 'action', data: { ...rest, service } };
  }
  return { type: 'action', data: createRawStepData(step) };
}

/** HA's editor element for a step kind. */
export const EDITOR_TAG: Record<StepKind, string> = {
  trigger: 'ha-automation-trigger-editor',
  condition: 'ha-automation-condition-editor',
  action: 'ha-automation-action-editor',
};

/** Which HA sub-editor renders an action (`ha-automation-action-<type>`); mirrors HA's getActionType. */
const ACTION_TYPE_KEYS: readonly [string, string][] = [
  ['condition', 'condition'],
  ['delay', 'delay'],
  ['event', 'event'],
  ['scene', 'activate_scene'],
  ['wait_template', 'wait_template'],
  ['wait_for_trigger', 'wait_for_trigger'],
  ['repeat', 'repeat'],
  ['choose', 'choose'],
  ['if', 'if'],
  ['device_id', 'device_id'],
  ['stop', 'stop'],
  ['sequence', 'sequence'],
  ['parallel', 'parallel'],
  ['variables', 'variables'],
  ['set_conversation_response', 'set_conversation_response'],
  ['action', 'service'],
  ['service', 'service'],
];

/** Whether HA has a form (not only YAML) for this step. */
export function hasUiEditor(kind: StepKind, step: Record<string, unknown>): boolean {
  let type: unknown;
  if (kind === 'trigger') type = step.trigger ?? step.platform;
  else if (kind === 'condition') type = step.condition;
  else type = ACTION_TYPE_KEYS.find(([key]) => key in step)?.[1];
  return (
    typeof type === 'string' && customElements.get(`ha-automation-${kind}-${type}`) !== undefined
  );
}
