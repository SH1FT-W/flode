import { isPlainObject, isTemplateString } from '@flode/shared';

/**
 * Dependency map over every automation and script: which entities each one
 * listens to, checks and controls, which of them set each other off, where
 * two pull the same entity in opposite directions, and which references point
 * at entities that no longer exist (typically after a rename).
 *
 * Works on the raw HA configs (what `config/automation/config/…` and
 * `config/script/config/…` return), not on FLODE graphs, so it covers
 * automations that were never opened in FLODE too.
 */

export type DependencyItemKind = 'automation' | 'script';

/** Where in the config an entity shows up. */
export type ReferenceRole = 'trigger' | 'condition' | 'action' | 'template';

export interface DependencyItemInput {
  kind: DependencyItemKind;
  /** Config id (`automation_id` / script object id). */
  id: string;
  entityId: string;
  name: string;
  config: Record<string, unknown>;
}

export interface EntityReference {
  entityId: string;
  role: ReferenceRole;
  /** `domain.service` for action references, e.g. `light.turn_on`. */
  service?: string;
}

export interface DependencyItem extends Omit<DependencyItemInput, 'config'> {
  references: EntityReference[];
}

/** `from` changes something `to` is triggered by (or calls/switches `to` directly). */
export interface DependencyChain {
  from: string;
  to: string;
  /** Entity that links them. */
  via: string;
}

/** Two items driving the same entity in opposite directions. */
export interface DependencyConflict {
  entityId: string;
  a: { item: string; service: string };
  b: { item: string; service: string };
}

/** An item that is triggered by an entity it changes itself — may retrigger itself. */
export interface SelfTrigger {
  item: string;
  entityId: string;
}

export interface MissingReference {
  item: string;
  entityId: string;
  role: ReferenceRole;
}

export interface DependencyMap {
  /** Keyed by entity id of the automation/script. */
  items: Record<string, DependencyItem>;
  /** entity id → items using it, per role. */
  usage: Record<string, EntityReferenceUsage[]>;
  chains: DependencyChain[];
  conflicts: DependencyConflict[];
  selfTriggers: SelfTrigger[];
  missing: MissingReference[];
}

export interface EntityReferenceUsage {
  item: string;
  role: ReferenceRole;
  service?: string;
}

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
/** Entity ids inside Jinja: `states('x.y')`, `is_state("x.y", …)`, `states.x.y`, `expand('x.y')` … */
const TEMPLATE_ENTITY =
  /(?:['"]([a-z0-9_]+\.[a-z0-9_]+)['"])|(?:states\.([a-z0-9_]+\.[a-z0-9_]+))/g;

/** Pairs of services that undo each other, per service name (domain-independent). */
const OPPOSITES: readonly (readonly [string, string])[] = [
  ['turn_on', 'turn_off'],
  ['open_cover', 'close_cover'],
  ['open_valve', 'close_valve'],
  ['lock', 'unlock'],
  ['start', 'return_to_base'],
  ['media_play', 'media_pause'],
  ['media_play', 'media_stop'],
  ['alarm_arm_away', 'alarm_disarm'],
  ['alarm_arm_home', 'alarm_disarm'],
  ['alarm_arm_night', 'alarm_disarm'],
];

/** Domains that are not real entities (a service like `notify.mobile_app_x` or `persistent_notification`). */
const NON_ENTITY_DOMAINS = new Set(['notify', 'tts', 'persistent_notification', 'homeassistant']);

function serviceName(service: string): string {
  return service.slice(service.indexOf('.') + 1);
}

export function areOppositeServices(a: string, b: string): boolean {
  const x = serviceName(a);
  const y = serviceName(b);
  return OPPOSITES.some(([p, q]) => (x === p && y === q) || (x === q && y === p));
}

function toList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function entityIdsIn(value: unknown): string[] {
  return toList(value).flatMap((v) =>
    typeof v === 'string'
      ? v
          .split(',')
          .map((part) => part.trim())
          .filter((part) => ENTITY_ID.test(part))
      : []
  );
}

export function templateEntityIds(text: string): string[] {
  if (!isTemplateString(text)) return [];
  const found = new Set<string>();
  for (const match of text.matchAll(TEMPLATE_ENTITY)) {
    const id = match[1] ?? match[2];
    if (id && !NON_ENTITY_DOMAINS.has(id.split('.')[0] ?? '')) found.add(id);
  }
  return [...found];
}

function stepService(step: Record<string, unknown>): string | undefined {
  const service = step.action ?? step.service;
  return typeof service === 'string' && service.includes('.') && !isTemplateString(service)
    ? service
    : undefined;
}

/**
 * Collects all entity references of one config. `role` is the section the
 * walk is in; conditions nested inside actions (`if`, `choose`, `condition:`
 * steps) count as conditions.
 */
export function collectReferences(config: Record<string, unknown>): EntityReference[] {
  const refs: EntityReference[] = [];
  const seen = new Set<string>();
  const add = (ref: EntityReference) => {
    const key = `${ref.entityId}|${ref.role}|${ref.service ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  };

  const walkTemplates = (value: unknown) => {
    if (typeof value === 'string') {
      for (const entityId of templateEntityIds(value)) add({ entityId, role: 'template' });
    } else if (Array.isArray(value)) {
      value.forEach(walkTemplates);
    } else if (isPlainObject(value)) {
      Object.values(value).forEach(walkTemplates);
    }
  };

  const walkTrigger = (trigger: unknown) => {
    if (!isPlainObject(trigger)) return;
    for (const entityId of entityIdsIn(trigger.entity_id)) add({ entityId, role: 'trigger' });
    if (isPlainObject(trigger.target)) {
      for (const entityId of entityIdsIn(trigger.target.entity_id)) {
        add({ entityId, role: 'trigger' });
      }
    }
    // `zone` triggers: the person/device is `entity_id`, the zone is a trigger input too.
    for (const entityId of entityIdsIn(trigger.zone)) add({ entityId, role: 'trigger' });
    walkTemplates(trigger);
  };

  const walkCondition = (condition: unknown) => {
    if (typeof condition === 'string') {
      walkTemplates(condition);
      return;
    }
    if (!isPlainObject(condition)) return;
    for (const entityId of entityIdsIn(condition.entity_id)) add({ entityId, role: 'condition' });
    if (isPlainObject(condition.target)) {
      for (const entityId of entityIdsIn(condition.target.entity_id)) {
        add({ entityId, role: 'condition' });
      }
    }
    for (const entityId of entityIdsIn(condition.zone)) add({ entityId, role: 'condition' });
    toList(condition.conditions).forEach(walkCondition);
    walkTemplates(condition);
  };

  const walkActions = (actions: unknown) => {
    for (const step of toList(actions)) walkAction(step);
  };

  const walkAction = (step: unknown) => {
    if (!isPlainObject(step)) return;
    const service = stepService(step);
    if (service) {
      const targets = [
        ...entityIdsIn(step.entity_id),
        ...(isPlainObject(step.target) ? entityIdsIn(step.target.entity_id) : []),
        ...(isPlainObject(step.data) ? entityIdsIn(step.data.entity_id) : []),
      ];
      const [domain] = service.split('.');
      // `script.my_script` / `automation.trigger` style: the called script is the target.
      if (
        domain === 'script' &&
        !['turn_on', 'turn_off', 'toggle', 'reload'].includes(serviceName(service))
      ) {
        add({ entityId: service, role: 'action', service: 'script.turn_on' });
      }
      for (const entityId of targets) add({ entityId, role: 'action', service });
    }
    if (typeof step.scene === 'string' && ENTITY_ID.test(step.scene)) {
      add({ entityId: step.scene, role: 'action', service: 'scene.turn_on' });
    }
    // A bare condition step (`- condition: state …`).
    if (typeof step.condition === 'string') walkCondition(step);
    // Wait-for-trigger / wait-template
    toList(step.wait_for_trigger).forEach(walkTrigger);
    if (typeof step.wait_template === 'string') walkTemplates(step.wait_template);
    // if / then / else
    if (step.if !== undefined) {
      toList(step.if).forEach(walkCondition);
      walkActions(step.then);
      walkActions(step.else);
    }
    // choose
    for (const option of toList(step.choose)) {
      if (!isPlainObject(option)) continue;
      toList(option.conditions).forEach(walkCondition);
      walkActions(option.sequence);
    }
    walkActions(step.default);
    // repeat
    if (isPlainObject(step.repeat)) {
      toList(step.repeat.while).forEach(walkCondition);
      toList(step.repeat.until).forEach(walkCondition);
      walkActions(step.repeat.sequence);
      walkTemplates(step.repeat.for_each);
    }
    // parallel / sequence blocks
    for (const branch of toList(step.parallel)) {
      if (isPlainObject(branch) && branch.sequence !== undefined) walkActions(branch.sequence);
      else walkAction(branch);
    }
    walkActions(step.sequence);
    // Templates inside data/variables/messages still count as reads.
    walkTemplates(step.data);
    walkTemplates(step.variables);
    walkTemplates(step.value_template);
  };

  toList(config.triggers ?? config.trigger).forEach(walkTrigger);
  toList(config.conditions ?? config.condition).forEach(walkCondition);
  walkActions(config.actions ?? config.action ?? config.sequence);
  walkTemplates(config.variables);
  return refs;
}

/**
 * Builds the whole map. `exists(entityId)` answers whether HA knows an
 * entity — references to unknown ones are reported as missing.
 */
export function buildDependencyMap(
  inputs: readonly DependencyItemInput[],
  exists: (entityId: string) => boolean
): DependencyMap {
  const items: Record<string, DependencyItem> = {};
  const usage: Record<string, EntityReferenceUsage[]> = {};
  const missing: MissingReference[] = [];

  for (const input of inputs) {
    const references = collectReferences(input.config);
    items[input.entityId] = {
      kind: input.kind,
      id: input.id,
      entityId: input.entityId,
      name: input.name,
      references,
    };
    const reportedMissing = new Set<string>();
    for (const ref of references) {
      const uses = usage[ref.entityId] ?? [];
      uses.push({ item: input.entityId, role: ref.role, service: ref.service });
      usage[ref.entityId] = uses;
      if (!exists(ref.entityId) && !reportedMissing.has(ref.entityId)) {
        reportedMissing.add(ref.entityId);
        missing.push({ item: input.entityId, entityId: ref.entityId, role: ref.role });
      }
    }
  }

  const chains: DependencyChain[] = [];
  const selfTriggers: SelfTrigger[] = [];
  const chainKeys = new Set<string>();
  for (const item of Object.values(items)) {
    const controlled = new Set(
      item.references.filter((r) => r.role === 'action').map((r) => r.entityId)
    );
    for (const entityId of controlled) {
      // Calling / switching another automation or script directly.
      if (items[entityId] && entityId !== item.entityId) {
        const key = `${item.entityId}>${entityId}`;
        if (!chainKeys.has(key)) {
          chainKeys.add(key);
          chains.push({ from: item.entityId, to: entityId, via: entityId });
        }
      }
      for (const use of usage[entityId] ?? []) {
        if (use.role !== 'trigger') continue;
        if (use.item === item.entityId) {
          selfTriggers.push({ item: item.entityId, entityId });
          continue;
        }
        const key = `${item.entityId}>${use.item}`;
        if (chainKeys.has(key)) continue;
        chainKeys.add(key);
        chains.push({ from: item.entityId, to: use.item, via: entityId });
      }
    }
  }

  const conflicts: DependencyConflict[] = [];
  const conflictKeys = new Set<string>();
  for (const [entityId, uses] of Object.entries(usage)) {
    const actions = uses.filter((u) => u.role === 'action' && u.service);
    for (let i = 0; i < actions.length; i++) {
      for (let j = i + 1; j < actions.length; j++) {
        const a = actions[i];
        const b = actions[j];
        if (!a?.service || !b?.service || a.item === b.item) continue;
        if (!areOppositeServices(a.service, b.service)) continue;
        const key = [entityId, ...[a.item, b.item].sort()].join('|');
        if (conflictKeys.has(key)) continue;
        conflictKeys.add(key);
        conflicts.push({
          entityId,
          a: { item: a.item, service: a.service },
          b: { item: b.item, service: b.service },
        });
      }
    }
  }

  return { items, usage, chains, conflicts, selfTriggers, missing };
}
