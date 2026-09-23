import { isTargetedPlatform, TargetIdsSchema } from '@flode/shared';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getLatestHass, useHassLocalize } from '@/store/hass-store';
import type { PlatformKind } from './useAutomationPlatformDescriptions';

const TRANSLATION_PREFIX: Record<PlatformKind, string> = {
  trigger: 'nodes:triggers.platforms',
  condition: 'nodes:conditions.types',
};

const COUNTED_TARGET_KEYS = ['area_id', 'device_id', 'floor_id', 'label_id'] as const;

/** `moon.phase_changed` → `Moon: Phase changed`, `behavior` → `Behavior` */
export function prettifyPlatformKey(key: string): string {
  return key
    .split('.')
    .map((part) => {
      const words = part.replace(/_/g, ' ');
      return words.charAt(0).toUpperCase() + words.slice(1);
    })
    .join(': ');
}

/** Normalize a target value (`string | string[]`) to a list of IDs. */
export function toIdList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string');
}

/**
 * Display labels for trigger/condition types. Classic types use FLODE's own
 * translations; target-based `<domain>.<name>` types use HA's translations
 * (`component.<domain>.triggers.<name>.name`) with a prettified key as fallback.
 */
export function usePlatformLabels(kind: PlatformKind) {
  const { t } = useTranslation(['nodes']);
  // Not `useHass()`: labels only change with translations, not with states.
  const localize = useHassLocalize();

  const localizeTargeted = useCallback(
    (type: string, suffix: string, fallback: string): string => {
      const [domain, ...name] = type.split('.');
      const key = `component.${domain}.${kind}s.${name.join('.')}.${suffix}`;
      return localize?.(key) || fallback;
    },
    [localize, kind]
  );

  const getLabel = useCallback(
    (type: string): string => {
      if (!type) return '';
      if (isTargetedPlatform(type)) {
        return localizeTargeted(type, 'name', prettifyPlatformKey(type));
      }
      return t(`${TRANSLATION_PREFIX[kind]}.${type}`, { defaultValue: type });
    },
    [kind, localizeTargeted, t]
  );

  const getFieldLabel = useCallback(
    (type: string, field: string): string =>
      localizeTargeted(type, `fields.${field}.name`, prettifyPlatformKey(field)),
    [localizeTargeted]
  );

  /** Short target description: entity names, or counts of areas/devices/floors/labels. */
  const getTargetSummary = useCallback(
    (target: unknown): string => {
      const parsed = TargetIdsSchema.safeParse(target);
      if (!parsed.success) return '';

      const parts: string[] = [];
      const entityNames = toIdList(parsed.data.entity_id).map((entityId) => {
        const name = getLatestHass()?.states[entityId]?.attributes.friendly_name;
        return typeof name === 'string' ? name : entityId;
      });
      if (entityNames.length > 0) {
        parts.push(entityNames.join(', '));
      }
      for (const key of COUNTED_TARGET_KEYS) {
        const count = toIdList(parsed.data[key]).length;
        if (count > 0) {
          parts.push(t(`nodes:targeted.summary.${key}`, { count }));
        }
      }
      return parts.join(' · ');
    },
    [t]
  );

  return useMemo(
    () => ({ getLabel, getFieldLabel, getTargetSummary }),
    [getLabel, getFieldLabel, getTargetSummary]
  );
}
