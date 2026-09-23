import type { FlowNode, TargetIdsSchema } from '@flode/shared';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/forms/FormField';
import { DynamicFieldRenderer } from '@/components/ui/DynamicFieldRenderer';
import { IdList } from '@/components/ui/IdList';
import { MultiEntitySelector } from '@/components/ui/MultiEntitySelector';
import { HaSelector } from '@/ha';
import type { PlatformKind } from '@/hooks/useAutomationPlatformDescriptions';
import { toIdList, usePlatformLabels } from '@/hooks/usePlatformLabels';
import type { HassEntity, PlatformDescription } from '@/types/hass';
import { getNodeDataObject, getNodeDataString } from '@/utils/nodeData';

interface TargetedPlatformFieldsProps {
  kind: PlatformKind;
  node: FlowNode;
  /** HA's description of the node's `<domain>.<name>` type, if known */
  description: PlatformDescription | undefined;
  onChange: (key: string, value: unknown) => void;
  entities: HassEntity[];
}

/**
 * Description-driven editor for HA's target-based triggers and conditions:
 * `target` via HA's target selector, each `options.<field>` via its selector.
 */
export function TargetedPlatformFields({
  kind,
  node,
  description,
  onChange,
  entities,
}: TargetedPlatformFieldsProps) {
  const { t } = useTranslation(['nodes']);
  const { getFieldLabel, getTargetSummary } = usePlatformLabels(kind);
  const platformType = getNodeDataString(node, kind);
  const target = getNodeDataObject(node, 'target');
  const options = getNodeDataObject(node, 'options');

  // Without a description (offline, standalone, older HA) the stored data stays untouched
  if (!description) {
    const targetSummary = getTargetSummary(target);
    return (
      <div className="space-y-1 text-muted-foreground text-xs">
        <p>{t('nodes:targeted.noDescription')}</p>
        {targetSummary && (
          <p>
            {t('nodes:targeted.targetLabel')}
            {': '}
            {targetSummary}
          </p>
        )}
      </div>
    );
  }

  const handleTargetChange = (value: unknown) => onChange('target', value);

  return (
    <>
      {description.target && (
        <FormField label={t('nodes:targeted.targetLabel')}>
          <HaSelector
            selector={{ target: description.target }}
            value={target}
            onChange={handleTargetChange}
            fallback={
              <TargetFallback target={target} onChange={handleTargetChange} entities={entities} />
            }
          />
        </FormField>
      )}
      {Object.entries(description.fields ?? {}).map(([name, field]) => {
        const value = options[name] ?? field.default;
        const handleOptionChange = (next: unknown) =>
          onChange('options', { ...options, [name]: next });
        return (
          <HaSelector
            key={name}
            selector={field.selector ?? { text: {} }}
            value={value}
            label={getFieldLabel(platformType, name)}
            required={field.required}
            onChange={handleOptionChange}
            fallback={
              <DynamicFieldRenderer
                field={{ name, required: field.required, selector: field.selector }}
                value={value}
                onChange={handleOptionChange}
                entities={entities}
              />
            }
          />
        );
      })}
    </>
  );
}

/** One ID list per target key when HA's target selector isn't available. */
function TargetFallback({
  target,
  onChange,
  entities,
}: {
  target: Record<string, unknown>;
  onChange: (target: Record<string, unknown>) => void;
  entities: HassEntity[];
}) {
  const { t } = useTranslation(['nodes']);
  const targetKeyLabels: Record<keyof typeof TargetIdsSchema.shape, string> = {
    entity_id: t('nodes:targeted.targetKeys.entity_id'),
    device_id: t('nodes:targeted.targetKeys.device_id'),
    area_id: t('nodes:targeted.targetKeys.area_id'),
    floor_id: t('nodes:targeted.targetKeys.floor_id'),
    label_id: t('nodes:targeted.targetKeys.label_id'),
  };

  return Object.entries(targetKeyLabels).map(([key, label]) => {
    const values = toIdList(target[key]);
    const update = (next: string[]) => {
      const { [key]: _removed, ...rest } = target;
      onChange(next.length > 0 ? { ...rest, [key]: next } : rest);
    };
    return (
      <FormField key={key} label={label}>
        {key === 'entity_id' ? (
          <MultiEntitySelector value={values} onChange={update} entities={entities} />
        ) : (
          <IdList values={values} onChange={update} />
        )}
      </FormField>
    );
  });
}
