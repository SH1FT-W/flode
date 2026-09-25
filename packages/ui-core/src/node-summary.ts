import {
  getRawStep,
  getScriptFields,
  isPlainObject,
  isTargetedPlatform,
  isTemplateString,
  SCRIPT_START_TRIGGER,
} from '@flode/shared';
import type { TFunction } from 'i18next';
import type {
  ActionNodeData,
  ConditionNodeData,
  DelayNodeData,
  SetVariablesNodeData,
  TriggerNodeData,
  WaitNodeData,
} from './node-data';

/**
 * Plain-language summaries for node cards ("Bed light changes to On"
 * instead of `light.bed_light / to: on`). Pure functions — everything that
 * needs Home Assistant (friendly names, state/service translations) comes in
 * through `SummaryContext`, so this is unit-testable without a `hass`.
 */

export type SummaryT = TFunction<['nodes', 'common']>;

export interface SummaryContext {
  t: SummaryT;
  /** Friendly name for an entity id, falls back to the id itself. */
  entityName: (entityId: string) => string;
  /** Translated state value for an entity ("on" → "On"/"An"). */
  stateLabel: (entityId: string, state: string) => string;
  /** Translated service name ("light.turn_on" → "Turn on"). */
  serviceLabel: (service: string) => string;
  /** Translated integration/domain name ("light" → "Light"). */
  domainLabel: (domain: string) => string;
  deviceName: (deviceId: string) => string | null;
  areaName: (areaId: string) => string | null;
  /** HA's own name for a target-based type, e.g. `light.turned_on` → "Light turned on". */
  platformLabel: (kind: 'trigger' | 'condition', type: string) => string;
  /** "Bed light" / "2 areas · 1 device" for a target-based trigger/condition's `target`. */
  targetSummary: (target: unknown) => string;
  /** HA's own name for a building block (`if` → "Wenn-dann"). */
  blockLabel: (type: HaBlockType) => string;
}

export const HA_BLOCK_TYPES = ['if', 'choose', 'repeat', 'parallel', 'sequence'] as const;
export type HaBlockType = (typeof HA_BLOCK_TYPES)[number];

/** Which of HA's building blocks a step is, if any. */
export function haBlockType(step: Record<string, unknown>): HaBlockType | undefined {
  return HA_BLOCK_TYPES.find((type) => type in step);
}

export interface NodeSummary {
  /** Sub-kind shown after the node type in the eyebrow, e.g. "State". */
  kind?: string;
  title: string;
  detail?: string;
  /** Single entity the card can show a live state chip for. */
  entityId?: string;
}

// ---------------------------------------------------------------------------
// Small value helpers
// ---------------------------------------------------------------------------

export function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter((v): v is string => v !== undefined);
  }
  const single = asString(value);
  return single ? [single] : [];
}

function snippet(value: string, max = 42): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function joinDetails(parts: Array<string | undefined>): string | undefined {
  const present = parts.filter((p): p is string => Boolean(p));
  return present.length > 0 ? present.join(' · ') : undefined;
}

/** "06:00:00" → "06:00"; leaves anything that isn't a plain clock time alone. */
export function formatClockTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return value;
  return match[3] && match[3] !== '00'
    ? `${match[1].padStart(2, '0')}:${match[2]}:${match[3]}`
    : `${match[1].padStart(2, '0')}:${match[2]}`;
}

interface DurationParts {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

function parseDuration(value: unknown): DurationParts | null {
  if (typeof value === 'number') {
    return { hours: 0, minutes: 0, seconds: value, milliseconds: 0 };
  }
  if (typeof value === 'string') {
    const match = /^(\d+):(\d{1,2})(?::(\d{1,2})(?:\.(\d+))?)?$/.exec(value.trim());
    if (!match) return null;
    return {
      hours: Number(match[1]),
      minutes: Number(match[2]),
      seconds: Number(match[3] ?? 0),
      milliseconds: Number((match[4] ?? '0').padEnd(3, '0').slice(0, 3)),
    };
  }
  if (isPlainObject(value)) {
    const num = (v: unknown) => (typeof v === 'number' ? v : Number(asString(v) ?? 0) || 0);
    return {
      hours: num(value.hours) + num(value.days) * 24,
      minutes: num(value.minutes),
      seconds: num(value.seconds),
      milliseconds: num(value.milliseconds),
    };
  }
  return null;
}

/** "00:00:05" / {seconds: 5} → "5 seconds"; templates and unknown shapes pass through. */
export function humanizeDuration(value: unknown, t: SummaryT): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parts = parseDuration(value);
  if (!parts) return typeof value === 'string' ? snippet(value, 28) : undefined;
  const out: string[] = [];
  if (parts.hours) out.push(t('nodes:summary.units.hours', { count: parts.hours }));
  if (parts.minutes) out.push(t('nodes:summary.units.minutes', { count: parts.minutes }));
  if (parts.seconds) out.push(t('nodes:summary.units.seconds', { count: parts.seconds }));
  if (parts.milliseconds) {
    out.push(t('nodes:summary.units.milliseconds', { count: parts.milliseconds }));
  }
  return out.length > 0 ? out.join(' ') : t('nodes:summary.units.seconds', { count: 0 });
}

/** Names for one or many entities — "Bed light" or "3 entities". */
function entitiesLabel(ids: string[], ctx: SummaryContext): string {
  if (ids.length === 1) return ctx.entityName(ids[0]);
  return ctx.t('nodes:summary.entities', { count: ids.length });
}

function entitiesDetail(ids: string[], ctx: SummaryContext): string | undefined {
  return ids.length > 1 ? ids.map(ctx.entityName).join(', ') : undefined;
}

/** Numeric thresholds may be numbers or entity ids (e.g. input_number helpers). */
function thresholdLabel(value: unknown, ctx: SummaryContext): string | undefined {
  const text = asString(value);
  if (!text) return undefined;
  return /^[a-z_]+\.[a-z0-9_]+$/.test(text) ? ctx.entityName(text) : text;
}

function stateList(entityId: string | undefined, states: string[], ctx: SummaryContext): string {
  return states
    .map((state) =>
      entityId && !isTemplateString(state) ? ctx.stateLabel(entityId, state) : state
    )
    .join(' / ');
}

function sunEventLabel(event: string | undefined, t: SummaryT): string | undefined {
  if (event === 'sunrise') return t('nodes:summary.sunrise');
  if (event === 'sunset') return t('nodes:summary.sunset');
  return event;
}

function humanizeId(value: string): string {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function numericTitle(
  entity: string,
  above: string | undefined,
  below: string | undefined,
  t: SummaryT
): string {
  if (above && below) return t('nodes:summary.numericBetween', { entity, above, below });
  if (above) return t('nodes:summary.numericAbove', { entity, above });
  if (below) return t('nodes:summary.numericBelow', { entity, below });
  return entity;
}

/**
 * HA's target-based triggers/conditions (`trigger: light.turned_on` + `target`
 * + `options`): the type's HA name as the kind, the target as the title.
 */
function summarizeTargeted(
  kind: 'trigger' | 'condition',
  type: string,
  target: unknown,
  ctx: SummaryContext
): NodeSummary {
  const typeLabel = ctx.platformLabel(kind, type);
  const targetText = ctx.targetSummary(target);
  const entities = isPlainObject(target) ? asStringList(target.entity_id) : [];
  const onlyEntity =
    entities.length === 1 && isPlainObject(target) && Object.keys(target).length === 1
      ? entities[0]
      : undefined;
  return {
    kind: typeLabel,
    title: targetText || typeLabel,
    entityId: onlyEntity,
  };
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

function triggerKind(platform: string, t: SummaryT): string {
  switch (platform) {
    case 'state':
      return t('nodes:triggers.platforms.state');
    case 'numeric_state':
      return t('nodes:triggers.platforms.numeric_state');
    case 'time':
      return t('nodes:triggers.platforms.time');
    case 'time_pattern':
      return t('nodes:triggers.platforms.time_pattern');
    case 'sun':
      return t('nodes:triggers.platforms.sun');
    case 'event':
      return t('nodes:triggers.platforms.event');
    case 'mqtt':
      return t('nodes:triggers.platforms.mqtt');
    case 'webhook':
      return t('nodes:triggers.platforms.webhook');
    case 'zone':
      return t('nodes:triggers.platforms.zone');
    case 'template':
      return t('nodes:triggers.platforms.template');
    case 'homeassistant':
      return t('nodes:triggers.platforms.homeassistant');
    case 'device':
      return t('nodes:triggers.platforms.device');
    case 'calendar':
      return t('nodes:triggers.platforms.calendar');
    case 'geo_location':
      return t('nodes:triggers.platforms.geo_location');
    case 'tag':
      return t('nodes:triggers.platforms.tag');
    case 'conversation':
      return t('nodes:triggers.platforms.conversation');
    case 'persistent_notification':
      return t('nodes:triggers.platforms.persistent_notification');
    default:
      return platform ? humanizeId(platform) : t('nodes:types.trigger');
  }
}

function formatTimeValue(value: unknown, ctx: SummaryContext): string | undefined {
  if (isPlainObject(value)) {
    const entity = asString(value.entity_id);
    const offset = asString(value.offset);
    if (!entity) return undefined;
    return offset ? `${ctx.entityName(entity)} (${offset})` : ctx.entityName(entity);
  }
  const list = asStringList(value);
  if (list.length === 0) return undefined;
  return list
    .map((v) => (v.includes('.') && !v.includes(':') ? ctx.entityName(v) : formatClockTime(v)))
    .join(', ');
}

/** A script's start node: which input fields it asks for. */
function summarizeScriptStart(data: TriggerNodeData, ctx: SummaryContext): NodeSummary {
  const { t } = ctx;
  const fields = Object.entries(getScriptFields(data)).map(([key, field]) =>
    typeof field.name === 'string' && field.name ? field.name : key
  );
  return {
    kind: t('nodes:scriptStart.kind'),
    title:
      fields.length > 0
        ? t('nodes:scriptStart.withFields', { count: fields.length, fields: fields.join(', ') })
        : t('nodes:scriptStart.noFields'),
  };
}

export function summarizeTrigger(data: TriggerNodeData, ctx: SummaryContext): NodeSummary {
  const { t } = ctx;
  const platform = data.trigger;
  if (platform === SCRIPT_START_TRIGGER) return summarizeScriptStart(data, ctx);
  if (isTargetedPlatform(platform)) return summarizeTargeted('trigger', platform, data.target, ctx);
  const kind = triggerKind(platform, t);
  const ids = asStringList(data.entity_id);
  const single = ids.length === 1 ? ids[0] : undefined;
  const forDuration = humanizeDuration(data.for, t);
  const forDetail = forDuration
    ? t('nodes:summary.forDuration', { duration: forDuration })
    : undefined;

  switch (platform) {
    case 'state': {
      if (ids.length === 0) return { kind, title: kind };
      const entity = entitiesLabel(ids, ctx);
      const to = asStringList(data.to);
      const from = asStringList(data.from);
      const state = stateList(single, to, ctx);
      const count = ids.length;
      const title = single
        ? to.length > 0
          ? t('nodes:summary.stateTo', { entity, state })
          : t('nodes:summary.stateChanges', { entity })
        : to.length > 0
          ? t('nodes:summary.stateToMany', { count, state })
          : t('nodes:summary.stateChangesMany', { count });
      return {
        kind,
        title,
        detail: joinDetails([
          entitiesDetail(ids, ctx),
          from.length > 0 ? `${stateList(single, from, ctx)} →` : undefined,
          asString(data.attribute),
          forDetail,
        ]),
        entityId: single,
      };
    }
    case 'numeric_state': {
      if (ids.length === 0) return { kind, title: kind };
      return {
        kind,
        title: numericTitle(
          entitiesLabel(ids, ctx),
          thresholdLabel(data.above, ctx),
          thresholdLabel(data.below, ctx),
          t
        ),
        detail: joinDetails([entitiesDetail(ids, ctx), asString(data.attribute), forDetail]),
        entityId: single,
      };
    }
    case 'time': {
      const time = formatTimeValue(data.at, ctx);
      return { kind, title: time ? t('nodes:summary.timeAt', { time }) : kind };
    }
    case 'time_pattern': {
      const pattern = [data.hours, data.minutes, data.seconds]
        .map((v) => asString(v) ?? '*')
        .join(':');
      return { kind, title: t('nodes:summary.timePattern', { pattern }) };
    }
    case 'sun': {
      const event = sunEventLabel(asString(data.event), t);
      const offset = asString(data.offset);
      return {
        kind,
        title: event ? t('nodes:summary.sunEvent', { event }) : kind,
        detail: offset ? t('nodes:summary.offset', { offset }) : undefined,
      };
    }
    case 'event': {
      const event = asString(data.event_type);
      return { kind, title: event ? t('nodes:summary.event', { event }) : kind };
    }
    case 'homeassistant':
      return {
        kind,
        title:
          asString(data.event) === 'shutdown'
            ? t('nodes:summary.haShutdown')
            : t('nodes:summary.haStart'),
      };
    case 'zone': {
      const zone = asString(data.zone);
      if (ids.length === 0 || !zone) return { kind, title: kind };
      const entity = entitiesLabel(ids, ctx);
      const zoneName = ctx.entityName(zone);
      return {
        kind,
        title:
          asString(data.event) === 'leave'
            ? t('nodes:summary.zoneLeave', { entity, zone: zoneName })
            : t('nodes:summary.zoneEnter', { entity, zone: zoneName }),
        entityId: single,
      };
    }
    case 'template': {
      const template = asString(data.value_template);
      return {
        kind,
        title: t('nodes:summary.templateTrue'),
        detail: joinDetails([template ? snippet(template) : undefined, forDetail]),
      };
    }
    case 'webhook':
      return { kind, title: t('nodes:summary.webhook', { id: asString(data.webhook_id) ?? '' }) };
    case 'mqtt':
      return { kind, title: t('nodes:summary.mqtt', { topic: asString(data.topic) ?? '' }) };
    case 'tag':
      return { kind, title: t('nodes:summary.tag'), detail: asString(data.tag_id) };
    case 'calendar': {
      const calendar = asString(data.entity_id);
      return {
        kind,
        title:
          asString(data.event) === 'end'
            ? t('nodes:summary.calendarEnd')
            : t('nodes:summary.calendarStart'),
        detail: calendar ? ctx.entityName(calendar) : undefined,
      };
    }
    case 'conversation': {
      const commands = asStringList(data.command);
      return {
        kind,
        title: commands[0] ? `“${commands[0]}”` : t('nodes:summary.conversation'),
        detail:
          commands.length > 1
            ? t('nodes:summary.moreData', { count: commands.length - 1 })
            : undefined,
      };
    }
    case 'device': {
      const deviceId = asString(data.device_id);
      const type = asString(data.type);
      return {
        kind,
        title: (deviceId && ctx.deviceName(deviceId)) || kind,
        detail: joinDetails([type ? humanizeId(type) : undefined, asString(data.subtype)]),
      };
    }
    default:
      return { kind, title: kind, entityId: single };
  }
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

function conditionKind(condition: string, t: SummaryT): string {
  switch (condition) {
    case 'state':
      return t('nodes:conditions.types.state');
    case 'numeric_state':
      return t('nodes:conditions.types.numeric_state');
    case 'time':
      return t('nodes:conditions.types.time');
    case 'sun':
      return t('nodes:conditions.types.sun');
    case 'zone':
      return t('nodes:conditions.types.zone');
    case 'template':
      return t('nodes:conditions.types.template');
    case 'device':
      return t('nodes:conditions.types.device');
    case 'trigger':
      return t('nodes:conditions.types.trigger');
    case 'and':
      return t('nodes:conditions.types.and');
    case 'or':
      return t('nodes:conditions.types.or');
    case 'not':
      return t('nodes:conditions.types.not');
    default:
      return condition ? humanizeId(condition) : t('nodes:types.condition');
  }
}

export function summarizeCondition(data: ConditionNodeData, ctx: SummaryContext): NodeSummary {
  const { t } = ctx;
  const condition = data.condition;
  if (isTargetedPlatform(condition)) {
    return summarizeTargeted('condition', condition, data.target, ctx);
  }
  const kind = conditionKind(condition, t);
  const ids = asStringList(data.entity_id);
  const single = ids.length === 1 ? ids[0] : undefined;
  const forDuration = humanizeDuration(data.for, t);
  const forDetail = forDuration
    ? t('nodes:summary.forDuration', { duration: forDuration })
    : undefined;

  switch (condition) {
    case 'state': {
      if (ids.length === 0) return { kind, title: kind };
      const state = stateList(single, asStringList(data.state), ctx) || '–';
      return {
        kind,
        title: single
          ? t('nodes:summary.condState', { entity: ctx.entityName(single), state })
          : t('nodes:summary.condStateMany', { count: ids.length, state }),
        detail: joinDetails([entitiesDetail(ids, ctx), asString(data.attribute), forDetail]),
        entityId: single,
      };
    }
    case 'numeric_state': {
      if (ids.length === 0) return { kind, title: kind };
      return {
        kind,
        title: numericTitle(
          entitiesLabel(ids, ctx),
          thresholdLabel(data.above, ctx),
          thresholdLabel(data.below, ctx),
          t
        ),
        detail: joinDetails([entitiesDetail(ids, ctx), asString(data.attribute)]),
        entityId: single,
      };
    }
    case 'time': {
      const after = formatTimeValue(data.after, ctx);
      const before = formatTimeValue(data.before, ctx);
      const weekdays = asStringList(data.weekday);
      const title =
        after && before
          ? t('nodes:summary.condTimeBetween', { after, before })
          : after
            ? t('nodes:summary.condTimeAfter', { after })
            : before
              ? t('nodes:summary.condTimeBefore', { before })
              : kind;
      return { kind, title, detail: weekdays.length > 0 ? weekdays.join(', ') : undefined };
    }
    case 'sun': {
      const after = sunEventLabel(asString(data.after), t);
      const before = sunEventLabel(asString(data.before), t);
      const parts = [
        after ? t('nodes:summary.condSunAfter', { event: after }) : undefined,
        before ? t('nodes:summary.condSunBefore', { event: before }) : undefined,
      ].filter((p): p is string => Boolean(p));
      return {
        kind,
        title: parts.length > 0 ? parts.join(' · ') : kind,
        detail: joinDetails([asString(data.after_offset), asString(data.before_offset)]),
      };
    }
    case 'zone': {
      const zone = asString(data.zone);
      if (ids.length === 0 || !zone) return { kind, title: kind };
      return {
        kind,
        title: t('nodes:summary.condZone', {
          entity: entitiesLabel(ids, ctx),
          zone: ctx.entityName(zone),
        }),
        entityId: single,
      };
    }
    case 'template': {
      const template = asString(data.value_template) ?? asString(data.template);
      return {
        kind,
        title: t('nodes:summary.condTemplate'),
        detail: template ? snippet(template) : undefined,
      };
    }
    case 'trigger': {
      const triggerIds = asStringList(data.id);
      return {
        kind,
        title:
          triggerIds.length > 0
            ? t('nodes:summary.condTrigger', { id: triggerIds.join(', ') })
            : kind,
      };
    }
    case 'and':
      return { kind, title: t('nodes:summary.condAnd') };
    case 'or':
      return { kind, title: t('nodes:summary.condOr') };
    case 'not':
      return { kind, title: t('nodes:summary.condNot') };
    case 'device': {
      const deviceId = asString(data.device_id);
      const type = asString(data.type);
      return {
        kind,
        title: (deviceId && ctx.deviceName(deviceId)) || kind,
        detail: type ? humanizeId(type) : undefined,
      };
    }
    default:
      return { kind, title: kind, entityId: single };
  }
}

// ---------------------------------------------------------------------------
// Actions & other steps
// ---------------------------------------------------------------------------

function formatDataValue(value: unknown): string {
  if (typeof value === 'string') return snippet(value, 24);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length}]`;
  return '{…}';
}

/** "brightness_pct: 60 · transition: 2 · +1 more" */
export function summarizeServiceData(
  data: Record<string, unknown> | undefined,
  t: SummaryT,
  max = 2
): string | undefined {
  if (!data) return undefined;
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return undefined;
  const shown = entries.slice(0, max).map(([k, v]) => `${k}: ${formatDataValue(v)}`);
  if (entries.length > max) {
    shown.push(t('nodes:summary.moreData', { count: entries.length - max }));
  }
  return shown.join(' · ');
}

function targetNames(target: ActionNodeData['target'], ctx: SummaryContext): string[] {
  if (!target) return [];
  return [
    ...asStringList(target.entity_id).map(ctx.entityName),
    ...asStringList(target.device_id).map((id) => ctx.deviceName(id) ?? id),
    ...asStringList(target.area_id).map((id) => ctx.areaName(id) ?? id),
  ];
}

export function summarizeServiceAction(data: ActionNodeData, ctx: SummaryContext): NodeSummary {
  const service = asString(data.service);
  // Templated action names are resolved by HA at runtime — never split them.
  const isTemplated = isTemplateString(service);
  const [domain] = service && !isTemplated ? service.split('.') : [];
  const kind = isTemplated
    ? ctx.t('nodes:actions.templateToggle')
    : domain
      ? ctx.domainLabel(domain)
      : undefined;
  const serviceLabel = service
    ? isTemplated
      ? snippet(service, 40)
      : ctx.serviceLabel(service)
    : ctx.t('nodes:types.action');
  const targets = targetNames(data.target, ctx);
  const targetIds = asStringList(data.target?.entity_id);
  const dataSummary = summarizeServiceData(data.data, ctx.t);

  if (targets.length === 0) {
    return { kind, title: serviceLabel, detail: dataSummary };
  }
  const title = targets.length === 1 ? targets[0] : `${targets[0]} +${String(targets.length - 1)}`;
  return {
    kind,
    title,
    detail: joinDetails([serviceLabel, dataSummary]),
    entityId: targetIds.length === 1 && targets.length === 1 ? targetIds[0] : undefined,
  };
}

export function summarizeEventAction(data: ActionNodeData, ctx: SummaryContext): NodeSummary {
  return {
    kind: ctx.t('nodes:actions.fireEvent'),
    title: ctx.t('nodes:summary.actionEvent', { event: asString(data.event) ?? '' }),
    detail: summarizeServiceData(data.event_data, ctx.t),
  };
}

export function summarizeDelay(
  data: Pick<DelayNodeData, 'delay'> | { delay?: unknown },
  ctx: SummaryContext
): NodeSummary {
  const duration = humanizeDuration(data.delay, ctx.t);
  return {
    title: duration ? ctx.t('nodes:summary.delayFor', { duration }) : ctx.t('nodes:types.delay'),
  };
}

export function summarizeWait(data: WaitNodeData, ctx: SummaryContext): NodeSummary {
  const { t } = ctx;
  const timeout = humanizeDuration(data.timeout, t);
  const triggers = Array.isArray(data.wait_for_trigger) ? data.wait_for_trigger.length : 0;
  const template = asString(data.wait_template);
  return {
    title:
      triggers > 0
        ? t('nodes:summary.waitTrigger', { count: triggers })
        : t('nodes:summary.waitTemplate'),
    detail: joinDetails([
      template && triggers === 0 ? snippet(template) : undefined,
      timeout ? t('nodes:summary.timeout', { duration: timeout }) : undefined,
    ]),
  };
}

export function summarizeVariables(
  data: Pick<SetVariablesNodeData, 'variables'> | { variables?: unknown },
  ctx: SummaryContext
): NodeSummary {
  const names = isPlainObject(data.variables) ? Object.keys(data.variables) : [];
  return {
    title: ctx.t('nodes:summary.variables', { count: names.length }),
    detail: names.length > 0 ? snippet(names.join(', ')) : undefined,
  };
}

/** Action steps: stop, repeat (count), fire event, or call a service. */
/** "scene: Movie night" — the first meaningful key of a pass-through step. */
function stepCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  return value === undefined || value === null ? 0 : 1;
}

/** Short text for a block's (first) condition, "+N" for the rest. */
function conditionsText(value: unknown, ctx: SummaryContext): string {
  const list = (Array.isArray(value) ? value : [value]).filter(isPlainObject);
  const [first] = list;
  if (!first) return '';
  const text = summarizeCondition(
    { ...first, condition: asString(first.condition) ?? '' },
    ctx
  ).title;
  return list.length > 1
    ? ctx.t('nodes:blocks.conditionsMore', { first: text, more: list.length - 1 })
    : text;
}

/** HA building blocks shown as one card: HA's name, then what's inside. */
function summarizeHaBlock(
  type: HaBlockType,
  step: Record<string, unknown>,
  ctx: SummaryContext
): NodeSummary {
  const { t } = ctx;
  const kind = ctx.blockLabel(type);
  const parts = (...items: (string | false | undefined)[]) =>
    items.filter((item): item is string => !!item).join(' · ') || undefined;
  switch (type) {
    case 'if':
      return {
        kind,
        title: conditionsText(step.if, ctx) || kind,
        detail: parts(
          t('nodes:blocks.then', { count: stepCount(step.then) }),
          stepCount(step.else) > 0 && t('nodes:blocks.else', { count: stepCount(step.else) })
        ),
      };
    case 'choose':
      return {
        kind,
        title: t('nodes:blocks.options', { count: stepCount(step.choose) }),
        detail: stepCount(step.default) > 0 ? t('nodes:blocks.withDefault') : undefined,
      };
    case 'repeat': {
      const repeat = isPlainObject(step.repeat) ? step.repeat : {};
      const title =
        repeat.count !== undefined
          ? `${t('nodes:blocks.times', { n: String(repeat.count) })} ${kind}`
          : repeat.while !== undefined
            ? t('nodes:blocks.while', { condition: conditionsText(repeat.while, ctx) })
            : repeat.until !== undefined
              ? t('nodes:blocks.until', { condition: conditionsText(repeat.until, ctx) })
              : repeat.for_each !== undefined
                ? t('nodes:blocks.forEach')
                : kind;
      return {
        kind,
        title,
        detail: t('nodes:blocks.steps', { count: stepCount(repeat.sequence) }),
      };
    }
    case 'parallel':
      return { kind, title: t('nodes:blocks.branches', { count: stepCount(step.parallel) }) };
    case 'sequence':
      return { kind, title: t('nodes:blocks.steps', { count: stepCount(step.sequence) }) };
  }
}

function summarizeRawStep(step: Record<string, unknown>, ctx: SummaryContext): NodeSummary {
  const block = haBlockType(step);
  if (block) return summarizeHaBlock(block, step, ctx);
  const entry = Object.entries(step).find(([key]) => key !== 'alias' && key !== 'enabled');
  const [key, value] = entry ?? ['', undefined];
  const text = asString(value);
  const shown = text
    ? /^[a-z_]+\.[a-z0-9_]+$/.test(text)
      ? ctx.entityName(text)
      : snippet(text, 32)
    : '…';
  return { title: key ? `${key}: ${shown}` : ctx.t('nodes:types.action') };
}

export function summarizeAction(data: ActionNodeData, ctx: SummaryContext): NodeSummary {
  const { t } = ctx;
  const rawStep = getRawStep(data);
  if (rawStep) return summarizeRawStep(rawStep, ctx);
  if (typeof data.stop === 'string') {
    return {
      title: data.error === true ? t('nodes:actions.stopError') : t('nodes:actions.stopExecution'),
      detail: asString(data.stop),
    };
  }
  const repeat = isPlainObject(data.repeat) ? data.repeat : null;
  if (repeat !== null && repeat.count !== undefined) {
    const bodyLength = Array.isArray(repeat.sequence) ? repeat.sequence.length : 0;
    return {
      title: t('nodes:actions.repeatLabel', { n: String(repeat.count) }),
      detail: bodyLength > 0 ? t('nodes:actions.repeatActions', { count: bodyLength }) : undefined,
    };
  }
  if (typeof data.event === 'string' && data.event.trim() !== '') {
    return summarizeEventAction(data, ctx);
  }
  return summarizeServiceAction(data, ctx);
}

/**
 * Summary for any node by its React Flow `type` — used where the node type
 * isn't known statically (e.g. the inspector header).
 */
export function summarizeNode(
  type: string | undefined,
  data: Record<string, unknown>,
  ctx: SummaryContext
): NodeSummary | null {
  switch (type) {
    case 'trigger':
      return summarizeTrigger({ ...data, trigger: asString(data.trigger) ?? '' }, ctx);
    case 'condition':
      return summarizeCondition({ ...data, condition: asString(data.condition) ?? '' }, ctx);
    case 'action':
      return summarizeAction(data, ctx);
    case 'delay':
      return summarizeDelay(data, ctx);
    case 'wait':
      return summarizeWait(data, ctx);
    case 'set_variables':
      return summarizeVariables(data, ctx);
    default:
      return null;
  }
}
