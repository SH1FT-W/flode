import { isPlainObject } from '@flode/shared';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HaSelector } from '@/ha';
import { startScript } from '@/hooks/useRunScript';
import { useUiStore } from '@/store/ui-store';

interface RunScriptDialogProps {
  onClose: () => void;
}

/** Asks for a script's input fields (HA's own inputs, defaults prefilled), then starts it. */
export function RunScriptDialog({ onClose }: RunScriptDialogProps) {
  const { t } = useTranslation(['ui', 'common']);
  const target = useUiStore((s) => s.runScriptTarget);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      Object.entries(target?.fields ?? {})
        .filter(([, field]) => field.default !== undefined)
        .map(([key, field]) => [key, field.default])
    )
  );
  if (!target) return null;

  const fields = Object.entries(target.fields);
  const missing = fields.some(
    ([key, field]) => field.required === true && (values[key] === undefined || values[key] === '')
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="size-4 text-primary" />
            {t('ui:scripts.runTitle', { name: target.name })}
          </DialogTitle>
          <DialogDescription>{t('ui:scripts.runDescription')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {fields.map(([key, field]) => (
            <HaSelector
              key={key}
              selector={isPlainObject(field.selector) ? field.selector : { text: {} }}
              value={values[key]}
              label={typeof field.name === 'string' && field.name ? field.name : key}
              helper={typeof field.description === 'string' ? field.description : undefined}
              required={field.required === true}
              onChange={(value) => setValues((prev) => ({ ...prev, [key]: value }))}
            />
          ))}
        </div>

        <DialogFooter className="gap-2 pt-1">
          <Button variant="outline" className="border-solid" onClick={onClose}>
            {t('common:buttons.cancel')}
          </Button>
          <Button
            disabled={missing}
            onClick={() => {
              onClose();
              void startScript(target, values);
            }}
          >
            <Play />
            {t('ui:scripts.run')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
