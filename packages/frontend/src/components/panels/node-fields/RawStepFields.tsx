import { getRawStep, RAW_STEP_KEY } from '@flode/shared';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import { Braces } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@/components/ui/textarea';
import { isRecord } from '@/lib/node-summary';
import { useFlowStore } from '@/store/flow-store';

interface RawStepFieldsProps {
  nodeId: string;
  data: Record<string, unknown>;
}

function toYaml(step: Record<string, unknown> | null): string {
  return step ? yamlDump(step, { indent: 2, lineWidth: -1 }).trimEnd() : '';
}

/**
 * Editor for a pass-through step (see `@flode/shared`'s raw-step helpers):
 * the step's own YAML, applied as soon as it parses to a mapping.
 */
export function RawStepFields({ nodeId, data }: RawStepFieldsProps) {
  const { t } = useTranslation(['ui']);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const step = getRawStep(data);
  const [text, setText] = useState(() => toYaml(step));
  const [error, setError] = useState<string | null>(null);

  // Follow external changes (undo/redo, loading another automation) — but
  // not the echo of our own edit, which would reset the cursor while typing.
  const stepYaml = toYaml(step);
  const lastApplied = useRef(stepYaml);
  useEffect(() => {
    if (stepYaml !== lastApplied.current) {
      lastApplied.current = stepYaml;
      setText(stepYaml);
      setError(null);
    }
  }, [stepYaml]);

  const handleChange = (value: string) => {
    setText(value);
    try {
      const parsed = yamlLoad(value);
      if (!isRecord(parsed)) {
        setError(t('ui:rawStep.mustBeObject'));
        return;
      }
      setError(null);
      lastApplied.current = toYaml(parsed);
      updateNodeData(nodeId, { [RAW_STEP_KEY]: parsed });
    } catch {
      setError(t('ui:rawStep.invalid'));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-muted-foreground text-xs">
        <Braces className="mt-0.5 size-4 shrink-0 text-action" />
        <p>{t('ui:rawStep.hint')}</p>
      </div>
      <Textarea
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        spellCheck={false}
        rows={Math.min(14, Math.max(4, text.split('\n').length + 1))}
        className="font-mono text-xs"
        aria-label={t('ui:rawStep.type')}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
