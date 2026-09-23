import { isPlainObject } from '@flode/shared';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

function toYaml(value: Record<string, unknown> | null): string {
  return value ? yamlDump(value, { indent: 2, lineWidth: -1 }).trimEnd() : '';
}

interface YamlObjectEditorProps {
  value: Record<string, unknown> | null;
  /** Called with every edit that parses to a mapping. */
  onChange: (value: Record<string, unknown>) => void;
  label: string;
  maxRows?: number;
  className?: string;
}

/**
 * YAML text editor for one mapping: applies each edit as soon as it parses,
 * shows why it doesn't otherwise, and follows external changes (undo/redo,
 * another node) without resetting the cursor on its own edits.
 */
export function YamlObjectEditor({
  value,
  onChange,
  label,
  maxRows = 14,
  className,
}: YamlObjectEditorProps) {
  const { t } = useTranslation(['ui']);
  const [text, setText] = useState(() => toYaml(value));
  const [error, setError] = useState<string | null>(null);

  const valueYaml = toYaml(value);
  const lastApplied = useRef(valueYaml);
  useEffect(() => {
    if (valueYaml !== lastApplied.current) {
      lastApplied.current = valueYaml;
      setText(valueYaml);
      setError(null);
    }
  }, [valueYaml]);

  const handleChange = (next: string) => {
    setText(next);
    try {
      const parsed = yamlLoad(next);
      if (!isPlainObject(parsed)) {
        setError(t('ui:rawStep.mustBeObject'));
        return;
      }
      setError(null);
      lastApplied.current = toYaml(parsed);
      onChange(parsed);
    } catch {
      setError(t('ui:rawStep.invalid'));
    }
  };

  return (
    <div className="space-y-1">
      <Textarea
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        spellCheck={false}
        rows={Math.min(maxRows, Math.max(3, text.split('\n').length + 1))}
        className={cn('font-mono text-xs', className)}
        aria-label={label}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
