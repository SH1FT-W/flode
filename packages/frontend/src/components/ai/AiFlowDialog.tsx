import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AiErrorBox } from '@/components/ai/AiErrorBox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Textarea } from '@/components/ui/textarea';
import { useAiFlowDraft } from '@/hooks/useAiFlowDraft';
import { useAiTask } from '@/hooks/useAiTask';
import { readableAiError } from '@/lib/ai-assist';
import { rawErrorMessage } from '@/lib/error-codes';
import { showSuccessToast, showWarningToast } from '@/lib/haToast';
import { formatShortcut } from '@/lib/shortcuts';

const EXAMPLE_KEYS = ['example1', 'example2', 'example3'] as const;

interface AiFlowDialogProps {
  onClose: () => void;
}

/** "Create with AI": describe an automation, get a draft flow on the canvas. */
export function AiFlowDialog({ onClose }: AiFlowDialogProps) {
  const { t } = useTranslation(['ui', 'common', 'errors']);
  const [description, setDescription] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const createDraft = useAiFlowDraft();
  const { name: aiName } = useAiTask();

  // Radix autofocus is unreliable inside HA's Shadow DOM.
  useEffect(() => {
    const id = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  const canRun = description.trim().length > 0 && !isRunning;

  const run = async () => {
    if (!canRun) return;
    setIsRunning(true);
    setError(null);
    try {
      const { unknownEntityIds } = await createDraft(description);
      onClose();
      if (unknownEntityIds.length > 0) {
        showWarningToast(t('ui:ai.flow.unknownEntities', { ids: unknownEntityIds.join(', ') }));
      } else {
        showSuccessToast(t('ui:ai.flow.done'));
      }
    } catch (err) {
      setError(readableAiError(rawErrorMessage(err) ?? t('errors:api.unknownError')));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !isRunning && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {t('ui:ai.flow.title')}
          </DialogTitle>
          <DialogDescription>{t('ui:ai.flow.description', { name: aiName })}</DialogDescription>
        </DialogHeader>

        <Textarea
          ref={textareaRef}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void run();
            }
          }}
          placeholder={t('ui:ai.flow.placeholder')}
          className="min-h-28 resize-none border-solid text-sm"
          disabled={isRunning}
        />

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={isRunning}
              onClick={() => setDescription(t(`ui:ai.flow.${key}`))}
              className="rounded-full border border-border border-solid bg-muted/50 px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {t(`ui:ai.flow.${key}`)}
            </button>
          ))}
        </div>

        {error && <AiErrorBox title={t('ui:ai.flow.failed')} message={error} />}

        <DialogFooter className="items-center gap-2 pt-1">
          <p className="mr-auto text-muted-foreground text-xs">{t('ui:ai.flow.draftNote')}</p>
          <Button variant="outline" className="border-solid" onClick={onClose} disabled={isRunning}>
            {t('common:buttons.cancel')}
          </Button>
          <Button onClick={() => void run()} disabled={!canRun}>
            {isRunning ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {isRunning ? t('ui:ai.flow.running') : t('ui:ai.flow.create')}
            {!isRunning && (
              <Kbd className="ml-1 border-primary-foreground/30 bg-transparent text-primary-foreground/80">
                {formatShortcut('ctrl+enter')}
              </Kbd>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
