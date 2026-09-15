import type { FlowNode, TriggerPlatform } from '@flode/shared';
import { isTargetedPlatform } from '@flode/shared';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DynamicFieldRenderer } from '@/components/ui/DynamicFieldRenderer';
import {
  getTriggerDefaults,
  getTriggerFields,
  TRIGGER_PLATFORM_FIELDS,
} from '@/config/triggerFields';
import {
  getTargetedPlatformDefaults,
  TARGETED_PLATFORM_KEYS,
  useAutomationPlatformDescriptions,
} from '@/hooks/useAutomationPlatformDescriptions';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import type { HassEntity, PlatformDescriptions } from '@/types/hass';
import { getNodeDataString } from '@/utils/nodeData';
import { DeviceTriggerFields } from './DeviceTriggerFields';
import { PlatformTypeSelect } from './PlatformTypeSelect';
import { StateTriggerFields } from './StateTriggerFields';
import { TargetedPlatformFields } from './TargetedPlatformFields';

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
  const descriptions = useAutomationPlatformDescriptions('trigger');
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
    const allFieldNames = new Set<string>([
      ...Object.values(TRIGGER_PLATFORM_FIELDS).flatMap((fields) => fields.map((f) => f.name)),
      ...TARGETED_PLATFORM_KEYS,
    ]);
    for (const fieldName of allFieldNames) {
      onChange(fieldName, undefined);
    }
    onChange('device_id', undefined);

    // Apply defaults for the new type
    const defaults = isTargetedPlatform(newTriggerType)
      ? getTargetedPlatformDefaults('trigger', newTriggerType, descriptions[newTriggerType])
      : getTriggerDefaults(newTriggerType as TriggerPlatform);
    for (const [key, value] of Object.entries(defaults)) {
      onChange(key, value);
    }
  };

  return (
    <>
      <PlatformTypeSelect
        kind="trigger"
        label={t('nodes:triggers.platformLabel')}
        value={effectiveTriggerType}
        staticTypes={TRIGGER_PLATFORMS}
        describedTypes={Object.keys(descriptions)}
        onChange={handleTriggerTypeChange}
      />

      {/* Dynamic fields based on trigger type */}
      <TriggerDynamicFields
        effectiveTriggerType={effectiveTriggerType}
        deviceId={deviceId}
        node={node}
        onChange={onChange}
        entities={entities}
        getFieldError={getFieldError}
        descriptions={descriptions}
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
  descriptions,
}: {
  effectiveTriggerType: string;
  deviceId: string;
  node: FlowNode;
  onChange: (key: string, value: unknown) => void;
  entities: HassEntity[];
  getFieldError: (fieldPath: string) => string | undefined;
  descriptions: PlatformDescriptions;
}) {
  // Device triggers use API-driven fields
  if (effectiveTriggerType === 'device' || deviceId) {
    return <DeviceTriggerFields node={node} onChange={onChange} entities={entities} />;
  }

  // Target-based triggers (`<domain>.<name>`) use HA's description
  if (isTargetedPlatform(effectiveTriggerType)) {
    return (
      <TargetedPlatformFields
        kind="trigger"
        node={node}
        description={descriptions[effectiveTriggerType]}
        onChange={onChange}
        entities={entities}
      />
    );
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
