import { isTargetedPlatform, TargetIdsSchema } from '@flode/shared';
import type { SummaryContext, SummaryT } from './node-summary';

/**
 * Builds a `SummaryContext` from what any FLODE UI has at hand — the React
 * app from its stores, FLODE 3 straight from `hass`. Everything HA-specific
 * (friendly names, HA's own translations) comes in through `SummaryHost`.
 */

export type PlatformKind = 'trigger' | 'condition';

/**
 * HA backend translation categories the summaries read through `localize`
 * (service, trigger and condition names, integration titles). HA only loads
 * them on demand — call `hass.loadBackendTranslation(category)` for each.
 */
export const SUMMARY_TRANSLATION_CATEGORIES = [
  'services',
  'triggers',
  'conditions',
  'title',
] as const;

export interface SummaryHost {
  t: SummaryT;
  /** `hass.localize`; `undefined` (or an empty result) falls back to readable ids. */
  localize?: (key: string) => string | undefined;
  /** Friendly name of an entity, read fresh on every call. */
  friendlyName: (entityId: string) => string | undefined;
  /** Name from the service registry, when HA has no translation for it. */
  serviceName?: (service: string) => string | undefined;
  deviceName: (deviceId: string) => string | null;
  areaName: (areaId: string) => string | null;
}

const PLATFORM_TRANSLATION_PREFIX: Record<PlatformKind, string> = {
  trigger: 'nodes:triggers.platforms',
  condition: 'nodes:conditions.types',
};

const COUNTED_TARGET_KEYS = ['area_id', 'device_id', 'floor_id', 'label_id'] as const;

/** `turn_on` → `Turn on` */
export function humanize(value: string): string {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `moon.phase_changed` → `Moon: Phase changed`, `behavior` → `Behavior` */
export function prettifyPlatformKey(key: string): string {
  return key.split('.').map(humanize).join(': ');
}

/** Normalize a target value (`string | string[]`) to a list of IDs. */
export function toIdList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string');
}

/** HA's translation for a target-based platform (`light.turned_on`), e.g. its name or a field label. */
export function localizeTargetedPlatform(
  localize: SummaryHost['localize'],
  kind: PlatformKind,
  type: string,
  suffix: string,
  fallback: string
): string {
  const [domain, ...name] = type.split('.');
  return localize?.(`component.${domain}.${kind}s.${name.join('.')}.${suffix}`) || fallback;
}

/** Display name of a trigger platform / condition type. */
export function platformLabel(
  host: Pick<SummaryHost, 't' | 'localize'>,
  kind: PlatformKind,
  type: string
): string {
  if (!type) return '';
  if (isTargetedPlatform(type)) {
    return localizeTargetedPlatform(host.localize, kind, type, 'name', prettifyPlatformKey(type));
  }
  return host.t(`${PLATFORM_TRANSLATION_PREFIX[kind]}.${type}`, { defaultValue: type });
}

/** Short target description: entity names, or counts of areas/devices/floors/labels. */
export function targetSummary(
  host: Pick<SummaryHost, 't' | 'friendlyName'>,
  target: unknown
): string {
  const parsed = TargetIdsSchema.safeParse(target);
  if (!parsed.success) return '';
  const parts: string[] = [];
  const entityNames = toIdList(parsed.data.entity_id).map(
    (entityId) => host.friendlyName(entityId) ?? entityId
  );
  if (entityNames.length > 0) parts.push(entityNames.join(', '));
  for (const key of COUNTED_TARGET_KEYS) {
    const count = toIdList(parsed.data[key]).length;
    if (count > 0) parts.push(host.t(`nodes:targeted.summary.${key}`, { count }));
  }
  return parts.join(' · ');
}

export function createSummaryContext(host: SummaryHost): SummaryContext {
  const localize = (key: string): string | undefined => host.localize?.(key) || undefined;
  return {
    t: host.t,
    entityName: (entityId) => host.friendlyName(entityId) || entityId,
    stateLabel: (entityId, state) => {
      const domain = entityId.split('.')[0];
      return (
        localize(`component.${domain}.entity_component._.state.${state}`) ??
        localize(`state.default.${state}`) ??
        state
      );
    },
    serviceLabel: (service) => {
      const [domain, name] = service.split('.');
      return (
        localize(`component.${domain}.services.${name}.name`) ??
        host.serviceName?.(service) ??
        humanize(name ?? service)
      );
    },
    domainLabel: (domain) => localize(`component.${domain}.title`) ?? humanize(domain),
    deviceName: host.deviceName,
    areaName: host.areaName,
    platformLabel: (kind, type) => platformLabel(host, kind, type),
    targetSummary: (target) => targetSummary(host, target),
    blockLabel: (type) =>
      localize(`ui.panel.config.automation.editor.actions.type.${type}.label`) ??
      host.t(`nodes:blocks.${type}`),
  };
}
