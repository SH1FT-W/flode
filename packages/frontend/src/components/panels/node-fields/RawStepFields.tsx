import { getRawStep, RAW_STEP_KEY } from '@flode/shared';
import { Braces } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { YamlObjectEditor } from '@/components/ui/YamlObjectEditor';
import { useFlowStore } from '@/store/flow-store';

interface RawStepFieldsProps {
  nodeId: string;
  data: Record<string, unknown>;
}

/**
 * Editor for a pass-through step (see `@flode/shared`'s raw-step helpers):
 * the step's own YAML, applied as soon as it parses to a mapping.
 */
export function RawStepFields({ nodeId, data }: RawStepFieldsProps) {
  const { t } = useTranslation(['ui']);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);

  return (
    <div className="space-y-2">
      <div className="flex gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-muted-foreground text-xs">
        <Braces className="mt-0.5 size-4 shrink-0 text-action" />
        <p>{t('ui:rawStep.hint')}</p>
      </div>
      <YamlObjectEditor
        value={getRawStep(data)}
        onChange={(step) => updateNodeData(nodeId, { [RAW_STEP_KEY]: step })}
        label={t('ui:rawStep.type')}
      />
    </div>
  );
}
