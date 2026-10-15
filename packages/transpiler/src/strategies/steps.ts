import type {
  ActionNode,
  ConditionNode,
  DelayNode,
  FlowNode,
  SetVariablesNode,
  TriggerNode,
  WaitNode,
} from '@flode/shared';
import {
  buildRawCondition,
  buildRawStepAction,
  getShorthandCondition,
  hasTimeout,
  INTERNAL_CONDITION_KEYS,
  isDeviceAction,
  isPlainObject,
  mapOneOrMany,
} from '@flode/shared';

/**
 * How each node is written as a Home Assistant step — shared by every
 * strategy, so a node means the same thing to HA whichever one writes it.
 */

/** State/event trigger keys where `null` means something in HA (`to: null` = state changes only, no attribute changes). */
const MEANINGFUL_NULL_KEYS = new Set(['from', 'to', 'not_from', 'not_to']);

/** A trigger without empty form leftovers — keeps the `null`s HA gives a meaning to. */
export function cleanTrigger(data: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) =>
        value !== undefined && value !== '' && (value !== null || MEANINGFUL_NULL_KEYS.has(key))
    )
  );
}

/** The trigger a trigger node stands for. */
export function buildTrigger(node: TriggerNode): Record<string, unknown> {
  return cleanTrigger(node.data);
}

const INTERNAL_KEYS = new Set<string>(INTERNAL_CONDITION_KEYS);

/**
 * One condition as HA reads it: FLODE's internal keys and empty form fields
 * dropped, the legacy `template` key written as `value_template`, nested
 * and/or/not conditions converted the same way (with their own alias).
 */
function mapCondition(data: Record<string, unknown>, keepAlias: boolean): Record<string, unknown> {
  // `condition` first, as HA's editor writes it
  const out: Record<string, unknown> =
    data.condition === undefined ? {} : { condition: data.condition };
  for (const [key, value] of Object.entries(data)) {
    if (INTERNAL_KEYS.has(key) || value === undefined || value === '') continue;
    if (key === 'alias' && !keepAlias) continue;
    if (key === 'template') continue;
    if (key === 'conditions' && Array.isArray(value)) {
      const nested = value.flatMap(nestedCondition);
      if (nested.length > 0) out.conditions = nested;
      continue;
    }
    out[key] = value;
  }
  if (data.condition === 'template' && !out.value_template && data.template) {
    out.value_template = data.template;
  }
  // `id: ["x"]` → `"x"` — HA's API sometimes returns a trigger condition's id as a one-item list
  if (Array.isArray(out.id) && out.id.length === 1) {
    out.id = out.id[0];
  }
  return out;
}

/**
 * One condition inside an and/or/not group: a Jinja shorthand stays a string
 * (also when FLODE read it into its long form), an empty group is dropped.
 */
function nestedCondition(condition: unknown): (Record<string, unknown> | string)[] {
  if (typeof condition === 'string') return [condition];
  if (!isPlainObject(condition)) return [];
  const shorthand = getShorthandCondition(condition);
  if (shorthand !== null) return [shorthand];
  const mapped = mapCondition(condition, true);
  return Array.isArray(mapped.conditions) && mapped.conditions.length === 0 ? [] : [mapped];
}

/** A condition node's condition (its alias belongs to the step around it). */
export function buildCondition(node: ConditionNode): Record<string, unknown> {
  // Pass-through condition (kept verbatim at import) — write it back unchanged
  return buildRawCondition(node.data) ?? mapCondition(node.data, false);
}

/** A condition with its alias — as a root condition or a condition step. */
export function buildConditionWithAlias(node: ConditionNode): Record<string, unknown> {
  const condition = buildCondition(node);
  if (node.data.alias) {
    condition.alias = node.data.alias;
  }
  return condition;
}

/** Device action fields FLODE keeps in the node's `data`. */
const DEVICE_ACTION_KEYS = ['type', 'device_id', 'domain', 'entity_id', 'subtype'];

/** A service call, device action, event, stop or kept-verbatim step. */
export function buildActionCall(node: ActionNode): Record<string, unknown> {
  // Pass-through step (kept verbatim at import) — write it back unchanged
  const rawStep = buildRawStepAction(node.data);
  if (rawStep) return rawStep;

  const common: Record<string, unknown> = {};
  if (node.data.alias) common.alias = node.data.alias;
  const disabled = node.data.enabled === false ? { enabled: false } : {};

  if (isDeviceAction(node.data.data)) {
    const { device_id, domain, type, entity_id, subtype } = node.data.data;
    const extra = Object.entries(node.data.data).filter(
      ([key, value]) => !DEVICE_ACTION_KEYS.includes(key) && value !== undefined
    );
    return {
      device_id,
      domain,
      type,
      ...common,
      ...(entity_id ? { entity_id } : {}),
      ...(subtype ? { subtype } : {}),
      ...Object.fromEntries(extra),
      ...disabled,
    };
  }

  // A repeat block FLODE could not take apart
  if (node.data.repeat) {
    const { count, while: whileConditions, until, sequence } = node.data.repeat;
    return {
      repeat: {
        ...(count !== undefined ? { count } : {}),
        ...(whileConditions ? { while: whileConditions } : {}),
        ...(until ? { until } : {}),
        sequence: sequence ?? [],
      },
      ...common,
      ...disabled,
    };
  }

  if (typeof node.data.event === 'string' && node.data.event.trim() !== '') {
    const { event_data } = node.data;
    return {
      event: node.data.event,
      ...common,
      ...(event_data && Object.keys(event_data).length > 0 ? { event_data } : {}),
      ...disabled,
    };
  }

  if ('stop' in node.data) {
    return {
      stop: node.data.stop ?? '',
      ...common,
      ...(node.data.error === true ? { error: true } : {}),
      ...disabled,
    };
  }

  // A service call — written as `action:` (HA 2024.8+). `id` is dropped: HA's
  // action-step schemas reject it ("extra keys not allowed"), only triggers have one.
  const {
    alias,
    service,
    action: actionKey,
    id: _id,
    target,
    data,
    data_template,
    response_variable,
    continue_on_error,
    enabled: _enabled,
    repeat: _repeat,
    ...extraProps
  } = node.data;
  // A graph written by hand (FLODE's JSON) may name the service as HA does, `action:`
  const name = service ?? (typeof actionKey === 'string' ? actionKey : undefined);
  const action: Record<string, unknown> = { ...extraProps, alias, action: name };
  if (target) action.target = target;
  // A template (`data: "{{ … }}"`) is kept as written; an empty mapping is left out
  if (typeof data === 'string' || (data && Object.keys(data).length > 0)) action.data = data;
  if (data_template) action.data_template = data_template;
  if (response_variable) action.response_variable = response_variable;
  if (continue_on_error) action.continue_on_error = continue_on_error;
  return { ...action, ...disabled };
}

/** A delay step (`id` dropped — HA's action steps don't take one). */
export function buildDelay(node: DelayNode): Record<string, unknown> {
  const { alias, delay, id: _id, ...extraProps } = node.data;
  return { ...extraProps, alias, delay };
}

/** A wait step (`id` dropped — HA's action steps don't take one). */
export function buildWait(node: WaitNode): Record<string, unknown> {
  const {
    alias,
    id: _id,
    wait_template,
    wait_for_trigger,
    timeout,
    continue_on_timeout,
    ...extraProps
  } = node.data;
  const wait: Record<string, unknown> = { ...extraProps, alias };
  if (wait_template) {
    wait.wait_template = wait_template;
  } else if (wait_for_trigger) {
    wait.wait_for_trigger = mapOneOrMany(wait_for_trigger, cleanTrigger);
  }
  if (hasTimeout(timeout)) wait.timeout = timeout;
  if (continue_on_timeout !== undefined) wait.continue_on_timeout = continue_on_timeout;
  return wait;
}

/** A variables step (`id` dropped — HA's action steps don't take one). */
export function buildSetVariables(node: SetVariablesNode): Record<string, unknown> {
  const { alias, id: _id, variables, ...extraProps } = node.data;
  return { ...extraProps, variables, ...(alias ? { alias } : {}) };
}

/** The step a non-condition node stands for (`null` for a trigger). */
export function buildNodeStep(
  node: Exclude<FlowNode, ConditionNode>
): Record<string, unknown> | null {
  switch (node.type) {
    case 'action':
      return buildActionCall(node);
    case 'delay':
      return buildDelay(node);
    case 'wait':
      return buildWait(node);
    case 'set_variables':
      return buildSetVariables(node);
    default:
      return null;
  }
}
