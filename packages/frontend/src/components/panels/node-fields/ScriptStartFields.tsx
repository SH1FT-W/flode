import { type FlowNode, getScriptFields, isPlainObject, type ScriptFields } from '@flode/shared';
import { Plus, Trash2, Variable } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/forms/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { YamlObjectEditor } from '@/components/ui/YamlObjectEditor';
import { HaSelector } from '@/ha';
import { omitKey, renameKey, uniqueKey } from '@/lib/record-keys';

interface ScriptStartFieldsProps {
  node: FlowNode;
  onChange: (key: string, value: unknown) => void;
}

/** Text setting of a field (name, description) — HA's text field, plain input outside HA. */
function TextSetting({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
}) {
  return (
    <FormField label={label}>
      <HaSelector
        selector={{ text: {} }}
        value={value}
        onChange={(v) => onChange(typeof v === 'string' ? v : '')}
        fallback={
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={mono ? 'font-mono text-sm' : 'text-sm'}
          />
        }
      />
    </FormField>
  );
}

/**
 * Editor for a script's input fields (`fields:`) on its start node — the
 * same settings as Home Assistant's own script editor: variable name, label,
 * description, required, the input type (HA's selector picker) and a default
 * entered with that very selector.
 */
export function ScriptStartFields({ node, onChange }: ScriptStartFieldsProps) {
  const { t } = useTranslation(['nodes']);
  const fields = getScriptFields(node.data);
  const entries = Object.entries(fields);

  const setFields = (next: ScriptFields) => onChange('fields', next);
  const updateField = (key: string, patch: Record<string, unknown>) => {
    const next = Object.fromEntries(
      Object.entries({ ...fields[key], ...patch }).filter(([, v]) => v !== undefined && v !== '')
    );
    setFields({ ...fields, [key]: next });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-muted-foreground text-xs">
        <Variable className="mt-0.5 size-4 shrink-0 text-trigger" />
        <p>{t('nodes:scriptStart.hint', { example: '{{ brightness }}' })}</p>
      </div>

      {entries.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('nodes:scriptStart.empty')}</p>
      )}

      {entries.map(([key, field], index) => {
        const selector = isPlainObject(field.selector) ? field.selector : { text: {} };
        return (
          <div
            // Position, not the variable name: renaming while typing must not
            // remount the row (and drop the text field's focus).
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={index}
            className="space-y-3 rounded-lg border border-border border-solid bg-muted/30 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium font-mono text-muted-foreground text-xs">{`{{ ${key} }}`}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFields(omitKey(fields, key))}
                aria-label={t('nodes:scriptStart.remove', { name: key })}
                className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <TextSetting
              label={t('nodes:scriptStart.variable')}
              value={key}
              mono
              onChange={(next) => {
                const cleaned = next.trim().replace(/[^A-Za-z0-9_]/g, '_');
                if (cleaned && cleaned !== key && !(cleaned in fields)) {
                  setFields(renameKey(fields, key, cleaned));
                }
              }}
            />
            <TextSetting
              label={t('nodes:scriptStart.name')}
              value={typeof field.name === 'string' ? field.name : ''}
              onChange={(name) => updateField(key, { name })}
            />
            <TextSetting
              label={t('nodes:scriptStart.description')}
              value={typeof field.description === 'string' ? field.description : ''}
              onChange={(description) => updateField(key, { description })}
            />
            <FormField label={t('nodes:scriptStart.required')}>
              <HaSelector
                selector={{ boolean: {} }}
                value={field.required === true}
                onChange={(v) => updateField(key, { required: v === true ? true : undefined })}
              />
            </FormField>
            <FormField label={t('nodes:scriptStart.type')}>
              <HaSelector
                selector={{ selector: {} }}
                value={selector}
                onChange={(v) => {
                  if (isPlainObject(v)) updateField(key, { selector: v });
                }}
                fallback={
                  <YamlObjectEditor
                    value={selector}
                    onChange={(v) => updateField(key, { selector: v })}
                    label={t('nodes:scriptStart.type')}
                    className="border-solid"
                  />
                }
              />
            </FormField>
            <FormField label={t('nodes:scriptStart.default')}>
              <HaSelector
                selector={selector}
                value={field.default}
                onChange={(v) => updateField(key, { default: v ?? undefined })}
              />
            </FormField>
          </div>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 border-solid"
        onClick={() =>
          setFields({
            ...fields,
            [uniqueKey(Object.keys(fields), 'field')]: { selector: { text: {} } },
          })
        }
      >
        <Plus className="h-4 w-4" />
        {t('nodes:scriptStart.add')}
      </Button>
    </div>
  );
}
