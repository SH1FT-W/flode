type OptionWithDomain = ComboboxOption & {
  domainLabel: string;
  domainColor: string;
  deviceLabel?: string;
  areaLabel?: string;
};

// Map domain to color only — labels are resolved via i18n (nodes:serviceDomains.*)
const DOMAIN_COLORS: Record<string, string> = {
  light: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200',
  switch: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200',
  sensor: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200',
  binary_sensor: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200',
  climate: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200',
  cover: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200',
  fan: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-200',
  media_player: 'bg-pink-100 dark:bg-pink-900/50 text-pink-800 dark:text-pink-200',
  automation: 'bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200',
  script: 'bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200',
  scene: 'bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-200',
  input_boolean: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200',
  input_number: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200',
  input_select: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200',
  input_text: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200',
  input_datetime: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200',
  person: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200',
  device_tracker: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200',
  zone: 'bg-lime-100 dark:bg-lime-900/50 text-lime-800 dark:text-lime-200',
  sun: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200',
  weather: 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200',
  camera: 'bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200',
  remote: 'bg-gray-100 dark:bg-gray-700/50 text-gray-800 dark:text-gray-200',
  vacuum: 'bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-200',
  lock: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200',
  alarm_control_panel: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200',
  water_heater: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200',
  humidifier: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-200',
  button: 'bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200',
  number: 'bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200',
  select: 'bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200',
  text: 'bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200',
  update: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200',
};

const DEFAULT_COLOR = 'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300';

function getDomainColor(entityId: string | undefined | null): string {
  if (!entityId || typeof entityId !== 'string') return DEFAULT_COLOR;
  const domain = entityId.split('.')[0];
  return DOMAIN_COLORS[domain] ?? DEFAULT_COLOR;
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox, type ComboboxOption } from '@/components/ui/Combobox';
import { useHass } from '@/contexts/HassContext';
import { cn } from '@/lib/utils';
import type { HassEntity } from '@/types/hass';

interface EntitySelectorProps {
  value: string;
  onChange: (value: string) => void;
  /** Optional entities list. If not provided, auto-fetches from useHass() */
  entities?: HassEntity[];
  placeholder?: string;
  className?: string;
  /** Optional domain filter (e.g., 'light', 'zone') */
  domainFilter?: string | string[];
}

function getEntityName(entity: HassEntity): string {
  return (entity.attributes.friendly_name as string) || entity.entity_id;
}

export function EntitySelector({
  value,
  onChange,
  entities: entitiesProp,
  placeholder,
  className,
  domainFilter,
}: EntitySelectorProps) {
  const { t } = useTranslation(['common', 'nodes']);
  const { entities: contextEntities, getDeviceNameForEntity, getAreaNameForEntity } = useHass();
  const effectivePlaceholder = placeholder ?? t('common:placeholders.selectEntity');

  // Use provided entities or fall back to context entities
  const allEntities = entitiesProp ?? contextEntities;

  // Apply domain filter if provided
  const entities = useMemo(() => {
    if (!domainFilter) return allEntities;

    const filters = Array.isArray(domainFilter) ? domainFilter : [domainFilter];
    return allEntities.filter((entity) => {
      const domain = entity.entity_id.split('.')[0];
      return filters.includes(domain);
    });
  }, [allEntities, domainFilter]);

  // Map entities to ComboboxOption with domain info
  const options: OptionWithDomain[] = useMemo(
    () =>
      entities.map((entity) => {
        const domain = entity.entity_id.split('.')[0];
        const domainLabel = t(`nodes:serviceDomains.${domain}`, {
          defaultValue: domain.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
        });
        return {
          value: entity.entity_id,
          label: getEntityName(entity),
          domainLabel,
          domainColor: getDomainColor(entity.entity_id),
          deviceLabel: getDeviceNameForEntity(entity.entity_id) ?? undefined,
          areaLabel: getAreaNameForEntity(entity.entity_id) ?? undefined,
        };
      }),
    [entities, getDeviceNameForEntity, getAreaNameForEntity, t]
  );

  // Handle case where value might be an array
  const normalizedValue = Array.isArray(value) ? value[0] : value;
  const selectedEntity = entities.find((e) => e.entity_id === normalizedValue);
  //
  const isUnknown = normalizedValue && !selectedEntity;

  const handleChange = (entityId: string) => {
    onChange(entityId);
  };

  return (
    <div className={cn('relative', className)}>
      <Combobox<OptionWithDomain>
        options={options}
        value={normalizedValue || ''}
        onChange={handleChange}
        placeholder={effectivePlaceholder}
        buttonClassName={cn(!normalizedValue && 'text-muted-foreground')}
        disabled={options.length === 0}
        searchKeys={['label', 'value', 'deviceLabel', 'areaLabel']} // Search on friendly name, entity ID, device name, and area
        fuzzyOptions={{
          threshold: 0.3, // More strict for entity selection
          minMatchCharLength: 2, // Require at least 2 characters for search
        }}
        renderOption={(option: OptionWithDomain) => (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span>{option.label}</span>

            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('rounded px-1.5 py-0.5 font-medium text-xs', option.domainColor)}>
                {option.domainLabel}
              </span>
              {option.deviceLabel && (
                <span className="truncate text-muted-foreground text-xs">{option.deviceLabel}</span>
              )}
              {option.areaLabel && (
                <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                  {option.areaLabel}
                </span>
              )}
            </div>
          </div>
        )}
        renderValue={(option?: OptionWithDomain) =>
          option ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('rounded px-1.5 py-0.5 font-medium text-xs', option.domainColor)}>
                {option.domainLabel}
              </span>
              <span className="truncate">{option.label}</span>
            </div>
          ) : null
        }
      />
      {isUnknown && (
        <div className="mt-1 truncate font-mono text-destructive">{normalizedValue}</div>
      )}
    </div>
  );
}
