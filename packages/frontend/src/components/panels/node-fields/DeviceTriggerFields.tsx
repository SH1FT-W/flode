import type { FlowNode } from '@flode/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/forms/FormField';
import { DeviceSelector } from '@/components/ui/DeviceSelector';
import { DynamicFieldRenderer } from '@/components/ui/DynamicFieldRenderer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHass } from '@/contexts/HassContext';
import { HaSelector } from '@/ha';
import type { DeviceTrigger, TriggerField } from '@/hooks/useDeviceAutomation';
import { useDeviceAutomation } from '@/hooks/useDeviceAutomation';
import { useTranslations } from '@/hooks/useTranslations';
import type { HassEntity } from '@/types/hass';
import { getNodeDataString } from '@/utils/nodeData';

interface DeviceTriggerFieldsProps {
  node: FlowNode;
  onChange: (key: string, value: unknown) => void;
  entities: HassEntity[];
}

/**
 * Build the composite value used as the Select option value.
 * Format: type[::subtype][::entity_id]
 */
function buildCompositeValue(trigger: DeviceTrigger): string {
  const parts = [trigger.type];
  if (trigger.subtype) parts.push(trigger.subtype);
  if (trigger.entity_id) parts.push(trigger.entity_id);
  return parts.join('::');
}

function resolvePlaceholders(
  template: string,
  trigger: DeviceTrigger,
  entities: HassEntity[],
  deviceName: string | null
): string {
  let result = template;
  if (result.includes('{entity_name}')) {
    const entity = trigger.entity_id
      ? entities.find((e) => e.entity_id === trigger.entity_id)
      : undefined;
    const entityName =
      (entity?.attributes?.friendly_name as string) || deviceName || trigger.entity_id || '';
    result = result.replace(/\{entity_name\}/g, entityName);
  }
  return result;
}

function getTriggerLabel(
  trigger: DeviceTrigger,
  translations: Record<string, string>,
  entities: HassEntity[],
  deviceName: string | null
): string {
  const typeKey = `component.${trigger.domain}.device_automation.trigger_type.${trigger.type}`;
  const typeLabel = resolvePlaceholders(
    translations[typeKey] ?? trigger.type,
    trigger,
    entities,
    deviceName
  );

  if (trigger.subtype) {
    const subtypeKey = `component.${trigger.domain}.device_automation.trigger_subtype.${trigger.subtype}`;
    const subtypeLabel = resolvePlaceholders(
      translations[subtypeKey] ?? trigger.subtype,
      trigger,
      entities,
      deviceName
    );
    return `${typeLabel}: ${subtypeLabel}`;
  }

  return typeLabel;
}

/**
 * Component for device trigger fields with dynamic API-based rendering.
 * Moved from PropertyPanel and updated to use new hooks.
 */
export function DeviceTriggerFields({ node, onChange, entities }: DeviceTriggerFieldsProps) {
  const { t } = useTranslation(['common', 'nodes', 'errors']);
  const { getDeviceTriggers, getTriggerCapabilities } = useDeviceAutomation();
  const { translations } = useTranslations();
  const { entities: allEntities, getDeviceNameById } = useHass();

  const [availableDeviceTriggers, setAvailableDeviceTriggers] = useState<DeviceTrigger[]>([]);
  const [triggerCapabilities, setTriggerCapabilities] = useState<TriggerField[]>([]);
  const [loadingTriggers, setLoadingTriggers] = useState(false);

  const deviceId = getNodeDataString(node, 'device_id');
  const deviceName = deviceId ? getDeviceNameById(deviceId) : null;
  const selectedTriggerType = getNodeDataString(node, 'type');
  const domain = getNodeDataString(node, 'domain');
  const entityId = getNodeDataString(node, 'entity_id');
  const selectedSubtype = getNodeDataString(node, 'subtype');

  // Build the composite value that uniquely identifies the selected trigger
  const selectedCompositeValue = (() => {
    const parts = [selectedTriggerType].filter(Boolean);
    if (selectedSubtype) parts.push(selectedSubtype);
    if (entityId) parts.push(entityId);
    return parts.join('::');
  })();

  // Fetch triggers when device is selected
  useEffect(() => {
    if (!deviceId) {
      setAvailableDeviceTriggers([]);
      return;
    }

    setLoadingTriggers(true);
    getDeviceTriggers(deviceId)
      .then((triggers) => {
        setAvailableDeviceTriggers(triggers);
      })
      .catch((error) => {
        console.error(t('errors:api.loadDeviceTriggersFailed'), error);
        setAvailableDeviceTriggers([]);
      })
      .finally(() => {
        setLoadingTriggers(false);
      });
  }, [deviceId, getDeviceTriggers, t]);

  // Fetch capabilities when trigger type is selected
  useEffect(() => {
    if (!deviceId || !selectedTriggerType) {
      setTriggerCapabilities([]);
      return;
    }

    // Find the full trigger object from the list - HA API needs the complete trigger
    const trigger = availableDeviceTriggers.find(
      (tr) =>
        tr.type === selectedTriggerType &&
        tr.domain === domain &&
        (tr.subtype ?? '') === (selectedSubtype ?? '') &&
        (tr.entity_id ?? '') === (entityId ?? '')
    );

    if (!trigger) {
      setTriggerCapabilities([]);
      return;
    }

    getTriggerCapabilities(trigger)
      .then((capabilities) => {
        setTriggerCapabilities(capabilities.extra_fields || []);
      })
      .catch((error) => {
        console.error(t('errors:api.loadTriggerCapabilitiesFailed'), error);
        setTriggerCapabilities([]);
      });
  }, [
    deviceId,
    selectedTriggerType,
    selectedSubtype,
    entityId,
    domain,
    availableDeviceTriggers,
    getTriggerCapabilities,
    t,
  ]);

  return (
    <>
      {/* Device selector */}
      <HaSelector
        selector={{ device: {} }}
        value={deviceId}
        onChange={(val) => onChange('device_id', typeof val === 'string' ? val : '')}
        label={t('labels.device')}
        required
        fallback={
          <DeviceSelector
            value={deviceId}
            onChange={(val) => onChange('device_id', val)}
            label={t('labels.device')}
            required
            placeholder={t('placeholders.selectDevice')}
          />
        }
      />

      {/* Trigger type selector - show dropdown if API data available, otherwise show as text */}
      {deviceId && availableDeviceTriggers.length > 0 ? (
        <FormField label={t('labels.triggerType')} required>
          <Select
            value={selectedCompositeValue}
            onValueChange={(value) => {
              // Find the trigger by its composite value
              const trigger = availableDeviceTriggers.find(
                (tr) => buildCompositeValue(tr) === value
              );
              if (trigger) {
                onChange('type', trigger.type);
                onChange('domain', trigger.domain);
                onChange('subtype', trigger.subtype ?? undefined);
                // Set entity_id from the trigger — required by HA for device automation triggers
                onChange('entity_id', trigger.entity_id ?? undefined);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('placeholders.selectTriggerType')} />
            </SelectTrigger>
            <SelectContent>
              {availableDeviceTriggers.map((trigger) => (
                <SelectItem key={buildCompositeValue(trigger)} value={buildCompositeValue(trigger)}>
                  {getTriggerLabel(trigger, translations, allEntities, deviceName)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      ) : (
        /* Show existing type/domain as read-only when API not available */
        deviceId &&
        selectedTriggerType && (
          <FormField label="Trigger Type">
            <div className="truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {selectedTriggerType}
              {selectedSubtype && (
                <span className="text-muted-foreground">
                  {' \u00B7 '}
                  {selectedSubtype}
                </span>
              )}
              {domain && <span className="text-muted-foreground"> {`(${domain})`}</span>}
            </div>
          </FormField>
        )
      )}

      {/* Loading state */}
      {loadingTriggers && (
        <div className="text-muted-foreground text-sm">{t('status.loadingTriggers')}</div>
      )}

      {/* Dynamic fields from capabilities API */}
      {triggerCapabilities.map((field) => (
        <DynamicFieldRenderer
          key={field.name}
          field={field}
          value={(node.data as Record<string, unknown>)[field.name]}
          onChange={(value) => onChange(field.name, value)}
          entities={entities}
          domain={domain}
          translations={translations}
        />
      ))}
    </>
  );
}
