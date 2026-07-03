import type { FlowNode, TriggerPlatform } from '@flode/shared';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/forms/FormField';
import { DynamicFieldRenderer } from '@/components/ui/DynamicFieldRenderer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getTriggerDefaults,
  getTriggerFields,
  TRIGGER_PLATFORM_FIELDS,
} from '@/config/triggerFields';
import { HaSelect } from '@/ha';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import type { HassEntity } from '@/types/hass';
import { getNodeDataString } from '@/utils/nodeData';
import { DeviceTriggerFields } from './DeviceTriggerFields';
import { StateTriggerFields } from './StateTriggerFields';

const TRIGGER_PLATFORMS: TriggerPlatform[] = [
  'state',
  'numeric_state',
  'time',
  'time_pattern',
  'sun',
  'event',
  'mqtt',
  'webhook',
  'zone',
  'template',
  'homeassistant',
  'device',
  'calendar',
];

interface TriggerFieldsProps {
  node: FlowNode;
  onChange: (key: string, value: unknown) => void;
  entities: HassEntity[];
}

/**
 * Trigger node field component.
 * Handles platform selection and renders appropriate field configuration.
 * Extracts trigger rendering logic from PropertyPanel.
 */
export function TriggerFields({ node, onChange, entities }: TriggerFieldsProps) {
  const { t } = useTranslation(['nodes']);
  const { getFieldError } = useNodeErrors(node.id);
  const triggerType = getNodeDataString(node, 'trigger', 'state');
  const deviceId = getNodeDataString(node, 'device_id');

  // If we have a device_id but trigger isn't 'device', auto-correct it
  const effectiveTriggerType = deviceId && triggerType !== 'device' ? 'device' : triggerType;

  // Auto-correct trigger to 'device' if we detected device_id but trigger type is wrong
  useEffect(() => {
    if (deviceId && triggerType !== 'device') {
      onChange('trigger', 'device');
    }
  }, [deviceId, triggerType, onChange]);

  const handleTriggerTypeChange = (newTriggerType: string) => {
    // Clear all fields from every trigger type to avoid stale values leaking across types
    const allFieldNames = new Set(
      Object.values(TRIGGER_PLATFORM_FIELDS).flatMap((fields) => fields.map((f) => f.name))
    );
    for (const fieldName of allFieldNames) {
      onChange(fieldName, undefined);
    }
    onChange('device_id', undefined);

    // Apply defaults for the new type
    const defaults = getTriggerDefaults(newTriggerType as TriggerPlatform);
    for (const [key, value] of Object.entries(defaults)) {
      onChange(key, value);
    }
  };

  return (
    <>
      <FormField label={t('nodes:triggers.platformLabel')} required>
        <HaSelect
          value={effectiveTriggerType}
          onChange={(v) => handleTriggerTypeChange(String(v))}
          options={TRIGGER_PLATFORMS.map((platform) => ({
            value: platform,
            label: t(`nodes:triggers.platforms.${platform}`),
          }))}
          fallback={
            <Select value={effectiveTriggerType} onValueChange={handleTriggerTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_PLATFORMS.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {t(`nodes:triggers.platforms.${platform}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </FormField>

      {/* Dynamic fields based on trigger type */}
      <TriggerDynamicFields
        effectiveTriggerType={effectiveTriggerType}
        deviceId={deviceId}
        node={node}
        onChange={onChange}
        entities={entities}
        getFieldError={getFieldError}
      />
    </>
  );
}

function TriggerDynamicFields({
  effectiveTriggerType,
  deviceId,
  node,
  onChange,
  entities,
  getFieldError,
}: {
  effectiveTriggerType: string;
  deviceId: string;
  node: FlowNode;
  onChange: (key: string, value: unknown) => void;
  entities: HassEntity[];
  getFieldError: (fieldPath: string) => string | undefined;
}) {
  // Device triggers use API-driven fields
  if (effectiveTriggerType === 'device' || deviceId) {
    return <DeviceTriggerFields node={node} onChange={onChange} entities={entities} />;
  }

  // State trigger uses a dedicated component for entity-aware state suggestions
  if (effectiveTriggerType === 'state') {
    return <StateTriggerFields node={node} onChange={onChange} entities={entities} />;
  }

  // Other trigger types use static field configuration
  const fields = getTriggerFields(effectiveTriggerType as TriggerPlatform);
  return fields.map((field) => (
    <DynamicFieldRenderer
      key={field.name}
      field={field}
      value={(node.data as Record<string, unknown>)[field.name]}
      onChange={(value) => onChange(field.name, value)}
      entities={entities}
      error={getFieldError(field.name)}
    />
  ));
}
