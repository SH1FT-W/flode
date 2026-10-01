import { isPlainObject, toList } from '@flode/shared';

/**
 * Trigger IDs for the "Triggered by" condition (`condition: trigger`).
 *
 * Since 2026.10 HA's condition form no longer lists the IDs of the triggers
 * itself: it lists every trigger and asks its editor (through the Lit context
 * `automationTriggers`) to store an ID on the ones the user picks. These are
 * the rules HA's editor follows (`automation-trigger-id.ts`), applied to a
 * flow's data: trigger nodes in order, plus the data of all other cards,
 * searched for trigger conditions wherever they are nested.
 */

type Step = Record<string, unknown>;

export const GENERATED_TRIGGER_ID_PREFIX = 'generated-';

export interface TriggerIdOption {
  /** The stored ID, or a candidate stored on the trigger when picked. */
  id: string;
  trigger: Step;
  /** Position among the leaf triggers (list wrappers excluded). */
  index: number;
  /** `id` is an unstored candidate. */
  draft: boolean;
  /** Another trigger has the same stored ID. */
  duplicate: boolean;
}

/** A flow's data as far as trigger IDs go: trigger node data in order, everything else. */
export interface TriggerIdFlow {
  triggers: readonly unknown[];
  steps: readonly unknown[];
  /** Read only: more config whose templates may compare `trigger.id` (automation `variables` …). */
  templates?: readonly unknown[];
}

/** Everything in a flow a template comparing `trigger.id` can be in. */
function templateSources(flow: TriggerIdFlow): unknown[] {
  return [flow.steps, flow.triggers, flow.templates ?? []];
}

/** IDs FLODE (or HA) generated and may remove again once nothing refers to them. */
export function isGeneratedTriggerId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(GENERATED_TRIGGER_ID_PREFIX);
}

function isTriggerList(trigger: Step): boolean {
  return 'triggers' in trigger;
}

function leafId(trigger: Step): string | undefined {
  return !isTriggerList(trigger) && typeof trigger.id === 'string' && trigger.id
    ? trigger.id
    : undefined;
}

/** The leaf triggers, with `triggers:` list wrappers expanded. */
export function flattenTriggers(triggers: readonly unknown[]): Step[] {
  return triggers.flatMap((trigger) => {
    if (!isPlainObject(trigger)) return [];
    return isTriggerList(trigger) ? flattenTriggers(toList(trigger.triggers)) : [trigger];
  });
}

function storedIds(triggers: readonly unknown[]): string[] {
  return flattenTriggers(triggers).flatMap((trigger) => leafId(trigger) ?? []);
}

function duplicatesOf(ids: string[]): Set<string> {
  return new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
}

/** nanoid's URL-safe alphabet — 64 characters, so a byte & 63 picks one evenly. */
const ID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (byte) => ID_ALPHABET[byte & 63]).join('');
}

/** A new `generated-xxxx` ID that is in neither set; reserves it in `generated`. */
function generateId(reserved: Set<string>, generated: Set<string>): string {
  let id = `${GENERATED_TRIGGER_ID_PREFIX}${randomSuffix()}`;
  while (reserved.has(id) || generated.has(id)) {
    id = `${GENERATED_TRIGGER_ID_PREFIX}${randomSuffix()}`;
  }
  generated.add(id);
  return id;
}

/** What the condition form lists. Each call makes fresh candidates — keep the result while the triggers stay the same. */
export function getTriggerIdOptions(triggers: readonly unknown[]): TriggerIdOption[] {
  const ids = storedIds(triggers);
  const duplicates = duplicatesOf(ids);
  const reserved = new Set(ids);
  const generated = new Set<string>();
  return flattenTriggers(triggers).map((trigger, index) => {
    const id = leafId(trigger);
    return {
      id: id ?? generateId(reserved, generated),
      trigger,
      index,
      draft: id === undefined,
      duplicate: id !== undefined && duplicates.has(id),
    };
  });
}

/** Replaces leaf triggers via `update`, keeping list wrappers; unchanged parts keep their identity. */
function mapLeafTriggers(
  triggers: readonly unknown[],
  update: (trigger: Step) => Step
): readonly unknown[] {
  const mapOne = (trigger: unknown): unknown => {
    if (!isPlainObject(trigger)) return trigger;
    if (!isTriggerList(trigger)) return update(trigger);
    const inner = trigger.triggers;
    const mapped = Array.isArray(inner)
      ? mapLeafTriggers(inner, update)
      : isPlainObject(inner)
        ? mapOne(inner)
        : inner;
    return mapped === inner ? trigger : { ...trigger, triggers: mapped };
  };
  const mapped = triggers.map(mapOne);
  return mapped.every((trigger, index) => trigger === triggers[index]) ? triggers : mapped;
}

function withoutId(trigger: Step): Step {
  const { id: _id, ...rest } = trigger;
  return rest;
}

function isTriggerCondition(value: Step): boolean {
  return value.condition === 'trigger' && 'id' in value;
}

/**
 * Replaces every trigger condition in `value` (a card's data, at any depth)
 * via `update`. Returns `value` itself when nothing changed. Strings — and
 * so templates — are never touched.
 */
export function mapTriggerConditions(value: unknown, update: (condition: Step) => Step): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map((item) => mapTriggerConditions(item, update));
    return mapped.some((item, index) => item !== value[index]) ? mapped : value;
  }
  if (!isPlainObject(value)) return value;
  if (isTriggerCondition(value)) return update(value);
  let changed = false;
  const entries = Object.entries(value).map(([key, item]) => {
    const mapped = mapTriggerConditions(item, update);
    if (mapped !== item) changed = true;
    return [key, mapped] as const;
  });
  return changed ? Object.fromEntries(entries) : value;
}

/**
 * Maps the IDs a trigger condition refers to (`undefined` drops one). Keeps
 * the condition when nothing changed; a single remaining ID stays a string
 * unless it was a list.
 */
function mapReferencedIds(
  condition: Step,
  mapper: (id: string) => string | string[] | undefined
): Step {
  let changed = false;
  const ids = toList(condition.id).flatMap((id) => {
    if (typeof id !== 'string') return [id];
    const mapped = mapper(id);
    if (mapped !== id) changed = true;
    return mapped ?? [];
  });
  if (!changed) return condition;
  const unique = Array.from(new Set(ids));
  return {
    ...condition,
    id: Array.isArray(condition.id) || unique.length > 1 ? unique : (unique[0] ?? ''),
  };
}

function referencedIds(steps: readonly unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const step of steps) {
    mapTriggerConditions(step, (condition) => {
      for (const id of toList(condition.id)) if (typeof id === 'string') ids.add(id);
      return condition;
    });
  }
  return ids;
}

/**
 * Which of `ids` a template compares `trigger.id` with
 * (`{{ trigger.id == 'motion' }}`) — FLODE can't rewrite those, so such IDs
 * must stay as they are.
 */
function templateReferencedIds(value: unknown, ids: ReadonlySet<string>): Set<string> {
  const found = new Set<string>();
  const walk = (item: unknown) => {
    if (typeof item === 'string') {
      if (!item.includes('trigger.id')) return;
      for (const id of ids) {
        if (item.includes(`'${id}'`) || item.includes(`"${id}"`)) found.add(id);
      }
    } else if (Array.isArray(item)) {
      item.forEach(walk);
    } else if (isPlainObject(item)) {
      Object.values(item).forEach(walk);
    }
  };
  walk(value);
  return found;
}

/** Removes generated IDs no trigger condition or template refers to (anymore). */
export function cleanupUnusedGeneratedTriggerIds(flow: TriggerIdFlow): TriggerIdFlow {
  const used = referencedIds(flow.steps);
  for (const id of templateReferencedIds(
    templateSources(flow),
    new Set(storedIds(flow.triggers))
  )) {
    used.add(id);
  }
  let changed = false;
  const triggers = mapLeafTriggers(flow.triggers, (trigger) => {
    const id = leafId(trigger);
    if (!isGeneratedTriggerId(id) || used.has(id)) return trigger;
    changed = true;
    return withoutId(trigger);
  });
  return changed ? { ...flow, triggers } : flow;
}

/**
 * Picking triggers in a "Triggered by" condition: stores the candidate IDs of
 * the picked triggers, sets the condition (found by identity, so two equal
 * conditions stay apart) and drops generated IDs nothing uses anymore.
 */
export function selectTriggerIds(
  flow: TriggerIdFlow,
  options: readonly TriggerIdOption[],
  condition: Step,
  ids: readonly string[]
): TriggerIdFlow {
  const picked = new Set(ids);
  const assign = new Map<Step, string>();
  for (const option of options) {
    if (option.draft && picked.has(option.id)) assign.set(option.trigger, option.id);
  }
  const triggers =
    assign.size > 0
      ? mapLeafTriggers(flow.triggers, (trigger) => {
          const id = assign.get(trigger);
          return id === undefined ? trigger : { ...trigger, id };
        })
      : flow.triggers;
  const updated = { ...condition, id: ids.length > 0 ? [...ids] : '' };
  const steps = flow.steps.map((step) =>
    mapTriggerConditions(step, (found) => (found === condition ? updated : found))
  );
  // The condition isn't in the flow (HA handed over a copy): store nothing rather than half.
  if (steps.every((step, index) => step === flow.steps[index])) return flow;
  return cleanupUnusedGeneratedTriggerIds({ ...flow, triggers, steps });
}

/**
 * Gives every trigger that shares a referenced ID an ID of its own, and lets
 * each condition that referred to the shared ID refer to all of the new ones
 * (it meant "any of these triggers"). Shared IDs nothing refers to are
 * removed. A shared ID a template reads (`trigger.id == 'motion'`) stays
 * untouched — FLODE can't rewrite templates, and changing it would break them.
 */
export function makeDuplicateTriggerIdsUnique(flow: TriggerIdFlow): TriggerIdFlow {
  const ids = storedIds(flow.triggers);
  const inTemplates = templateReferencedIds(templateSources(flow), duplicatesOf(ids));
  const duplicates = new Set([...duplicatesOf(ids)].filter((id) => !inTemplates.has(id)));
  if (duplicates.size === 0) return flow;
  const used = referencedIds(flow.steps);
  const reserved = new Set(ids.filter((id) => !duplicates.has(id)));
  const generated = new Set<string>();
  const replacements = new Map<string, string[]>();
  const triggers = mapLeafTriggers(flow.triggers, (trigger) => {
    const id = leafId(trigger);
    if (id === undefined || !duplicates.has(id)) return trigger;
    if (!used.has(id)) return withoutId(trigger);
    const fresh = generateId(reserved, generated);
    replacements.set(id, [...(replacements.get(id) ?? []), fresh]);
    return { ...trigger, id: fresh };
  });
  const steps =
    replacements.size > 0
      ? flow.steps.map((step) =>
          mapTriggerConditions(step, (condition) =>
            mapReferencedIds(condition, (id) => replacements.get(id) ?? id)
          )
        )
      : flow.steps;
  return { ...flow, triggers, steps };
}
