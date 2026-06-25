import type { FlowNode } from '@flode/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldError } from '@/components/forms/FieldError';
import { FormField } from '@/components/forms/FormField';
import { DynamicFieldRenderer } from '@/components/ui/DynamicFieldRenderer';
import { MultiEntitySelector } from '@/components/ui/MultiEntitySelector';
import { getTriggerFields } from '@/config/triggerFields';
import { useHass } from '@/contexts/HassContext';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import type { HassEntity } from '@/types/hass';
import { getNodeDataString } from '@/utils/nodeData';
import { GENERIC_STATES, getStateSuggestions, StateValueCombobox } from './StateValueCombobox';

interface StateTriggerFieldsProps {
  node: FlowNode;
  onChange: (key: string, value: unknown) => void;
  entities: HassEntity[];
}

/**
 * Fields for the `state` trigger platform.
 * Renders entity_id, to/from state selectors with live state suggestions, and the `for` duration.
 */
export function StateTriggerFields({ node, onChange, entities }: StateTriggerFieldsProps) {
  const { t } = useTranslation(['nodes', 'common']);
  const { getFieldError } = useNodeErrors(node.id);
  const { entities: contextEntities } = useHass();

  const allEntities = entities.length > 0 ? entities : contextEntities;

  const entityIdRaw = (node.data as Record<string, unknown>).entity_id;
  const entityIds: string[] = Array.isArray(entityIdRaw)
    ? entityIdRaw
    : typeof entityIdRaw === 'string' && entityIdRaw
      ? [entityIdRaw]
      : [];

  const toValue = getNodeDataString(node, 'to');
  const fromValue = getNodeDataString(node, 'from');

  // Collect state suggestions from all selected entities
  const stateSuggestions = useMemo(() => {
    if (entityIds.length === 0) return GENERIC_STATES;
    const allSuggestions = new Set<string>();
    for (const id of entityIds) {
      for (const s of getStateSuggestions(id, allEntities)) {
        allSuggestions.add(s);
      }
    }
    return Array.from(allSuggestions);
  }, [entityIds, allEntities]);

  // The `for` field uses the existing DynamicFieldRenderer
  const forField = getTriggerFields('state').find((f) => f.name === 'for');

  return (
    <>
      {/* Entity selector */}
      <FormField label={t('nodes:triggers.fields.entityId')} required>
        <MultiEntitySelector
          value={entityIds}
          onChange={(value) => onChange('entity_id', value)}
          entities={allEntities}
          placeholder={t('common:placeholders.selectEntity')}
        />
        <FieldError message={getFieldError('entity_id')} />
      </FormField>

      {/* To State */}
      <FormField label={t('nodes:triggers.fields.toState')}>
        <StateValueCombobox
          value={toValue}
          onChange={(v) => onChange('to', v || undefined)}
          suggestions={stateSuggestions}
          placeholder={t('nodes:triggers.fields.toStatePlaceholder')}
        />
      </FormField>

      {/* From State */}
      <FormField label={t('nodes:triggers.fields.fromState')}>
        <StateValueCombobox
          value={fromValue}
          onChange={(v) => onChange('from', v || undefined)}
          suggestions={stateSuggestions}
          placeholder={t('nodes:triggers.fields.fromStatePlaceholder')}
        />
      </FormField>

      {/* For Duration */}
      {forField && (
        <DynamicFieldRenderer
          field={forField}
          value={(node.data as Record<string, unknown>)[forField.name]}
          onChange={(value) => onChange(forField.name, value)}
          entities={allEntities}
          error={getFieldError(forField.name)}
        />
      )}
    </>
  );
}
