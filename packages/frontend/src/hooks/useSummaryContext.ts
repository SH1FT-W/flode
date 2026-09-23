import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatformLabels } from '@/hooks/usePlatformLabels';
import type { SummaryContext } from '@/lib/node-summary';
import { getLatestHass, useHassLocalize, useHassStore } from '@/store/hass-store';

function humanize(value: string): string {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Builds the `SummaryContext` for `lib/node-summary.ts` from the live `hass`
 * object — friendly names and HA's own translations for states, services and
 * integration names (via `hass.localize`, panel mode only; remote/dev mode
 * falls back to readable ids).
 */
export function useSummaryContext(): SummaryContext {
  const { t } = useTranslation(['nodes', 'common']);
  // Deliberately not `useHass()`: that re-renders on every state change in the
  // house. Only `localize` and the registry lookups make summaries change;
  // friendly names are read from the latest `hass` on demand.
  const localizeFn = useHassLocalize();
  const getServiceDefinition = useHassStore((s) => s.getServiceDefinition);
  const getDeviceNameById = useHassStore((s) => s.getDeviceNameById);
  const getAreaNameById = useHassStore((s) => s.getAreaNameById);
  const triggerLabels = usePlatformLabels('trigger');
  const conditionLabels = usePlatformLabels('condition');

  return useMemo<SummaryContext>(() => {
    const localize = (key: string): string | undefined => {
      const value = localizeFn?.(key);
      return value ? value : undefined;
    };

    return {
      t,
      entityName: (entityId) => {
        const name = getLatestHass()?.states?.[entityId]?.attributes?.friendly_name;
        return typeof name === 'string' && name ? name : entityId;
      },
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
          getServiceDefinition(service)?.name ??
          humanize(name ?? service)
        );
      },
      domainLabel: (domain) => localize(`component.${domain}.title`) ?? humanize(domain),
      deviceName: getDeviceNameById,
      areaName: getAreaNameById,
      platformLabel: (kind, type) =>
        (kind === 'trigger' ? triggerLabels : conditionLabels).getLabel(type),
      targetSummary: triggerLabels.getTargetSummary,
    };
  }, [
    t,
    localizeFn,
    getDeviceNameById,
    getAreaNameById,
    getServiceDefinition,
    triggerLabels,
    conditionLabels,
  ]);
}
