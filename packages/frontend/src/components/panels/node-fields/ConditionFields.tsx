import type { ConditionType, FlowNode } from '@flode/shared';
import { isTargetedPlatform } from '@flode/shared';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/forms/FormField';
import { ConditionGroupEditor } from '@/components/panels/node-fields/ConditionGroupEditor';
import { DynamicFieldRenderer } from '@/components/ui/DynamicFieldRenderer';
import {
  CONDITION_TYPE_FIELDS,
  getConditionDefaults,
  getConditionFields,
  isLogicalGroupType,
} from '@/config/conditionFields';
import {
  getTargetedPlatformDefaults,
  TARGETED_PLATFORM_KEYS,
  useAutomationPlatformDescriptions,
} from '@/hooks/useAutomationPlatformDescriptions';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import type { ConditionNodeData } from '@/store/flow-store';
import type { HassEntity } from '@/types/hass';
import { getNodeDataString } from '@/utils/nodeData';
import { DeviceConditionFields } from './DeviceConditionFields';
import { PlatformTypeSelect } from './PlatformTypeSelect';
import { StateConditionFields } from './StateConditionFields';
import { TargetedPlatformFields } from './TargetedPlatformFields';

const CONDITION_TYPES: ConditionType[] = [
  'state',
  'numeric_state',
  'template',
  'time',
  'sun',
  'zone',
  'device',
  'trigger',
  'and',
  'or',
  'not',
];

interface ConditionFieldsProps {
  node: FlowNode;
  onChange: (key: string, value: unknown) => void;
  entities: HassEntity[];
}

/**
 * Condition node field component.
 * Router component that dispatches to specific condition type components.
 * Uses a config-based approach similar to TriggerFields for consistency.
 */
export function ConditionFields({ node, onChange, entities }: ConditionFieldsProps) {
  const { t } = useTranslation(['common', 'nodes']);
  const { getFieldError } = useNodeErrors(node.id);
  const descriptions = useAutomationPlatformDescriptions('condition');
  const conditionType = getNodeDataString(node, 'condition', 'state') as ConditionType;
  const nodeData = node.data as Record<string, unknown>;
  const hasNestedConditions = Array.isArray(nodeData.conditions) && nodeData.conditions.length > 0;
  const isGroupType = isLogicalGroupType(conditionType);

  const handleConditionTypeChange = (newType: string) => {
    // Clear all fields from every condition type to avoid stale values
    // (e.g. sun.after="sunrise" leaking into time.after which expects HH:MM)
    const allFieldNames = new Set<string>([
      ...Object.values(CONDITION_TYPE_FIELDS).flatMap((fields) => fields.map((f) => f.name)),
      ...TARGETED_PLATFORM_KEYS,
    ]);
    for (const fieldName of allFieldNames) {
      onChange(fieldName, undefined);
    }
    // Also clear group conditions array
    onChange('conditions', undefined);

    // Apply defaults for the new type
    const defaults = isTargetedPlatform(newType)
      ? getTargetedPlatformDefaults('condition', newType, descriptions[newType])
      : getConditionDefaults(newType as ConditionType);
    for (const [key, value] of Object.entries(defaults)) {
      onChange(key, value);
    }
  };

  const renderConditionFields = () => {
    // Target-based conditions (`<domain>.<name>`) use HA's description
    if (isTargetedPlatform(conditionType)) {
      return (
        <TargetedPlatformFields
          kind="condition"
          node={node}
          description={descriptions[conditionType]}
          onChange={onChange}
          entities={entities}
        />
      );
    }

    // State condition: entity-aware state dropdown + attribute + duration
    if (conditionType === 'state') {
      return <StateConditionFields node={node} onChange={onChange} entities={entities} />;
    }

    // Device conditions use a special component with DeviceSelector
    if (conditionType === 'device') {
      return <DeviceConditionFields node={node} onChange={onChange} />;
    }

    // Logical group types don't have their own fields
    if (isGroupType) {
      return null;
    }

    // All other condition types use static field configuration
    const fields = getConditionFields(conditionType);
    const entityIdValue = nodeData.entity_id;
    const entityIdContext =
      typeof entityIdValue === 'string' || Array.isArray(entityIdValue)
        ? (entityIdValue as string | string[])
        : undefined;
    return fields.map((field) => (
      <DynamicFieldRenderer
        key={field.name}
        field={field}
        value={nodeData[field.name]}
        onChange={(value) => onChange(field.name, value)}
        entities={entities}
        error={getFieldError(field.name)}
        entityIdContext={entityIdContext}
      />
    ));
  };

  return (
    <>
      <PlatformTypeSelect
        kind="condition"
        label={t('nodes:conditions.conditionLabel')}
        value={conditionType}
        staticTypes={CONDITION_TYPES}
        describedTypes={Object.keys(descriptions)}
        onChange={handleConditionTypeChange}
      />

      {renderConditionFields()}

      {/* Render nested conditions if they exist (for group types or when parsed from YAML with multiple conditions) */}
      {(isGroupType || hasNestedConditions) && (
        <FormField label={t('nodes:conditions.nestedConditions')}>
          <ConditionGroupEditor
            conditions={(nodeData.conditions as ConditionNodeData[]) || []}
            onChange={(conds) => onChange('conditions', conds)}
            parentType={isGroupType ? (conditionType as 'and' | 'or' | 'not') : 'and'}
          />
        </FormField>
      )}
    </>
  );
}
