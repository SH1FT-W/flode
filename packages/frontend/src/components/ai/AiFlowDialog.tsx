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
import { type AiFlowKind, readableAiError } from '@/lib/ai-assist';
import { rawErrorMessage } from '@/lib/error-codes';
import { showSuccessToast, showWarningToast } from '@/lib/haToast';
import { formatShortcut } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui-store';

const EXAMPLE_KEYS = ['example1', 'example2', 'example3'] as const;
const KINDS: readonly AiFlowKind[] = ['automation', 'script'];

type FlowTextKey = 'placeholder' | (typeof EXAMPLE_KEYS)[number];

/** Translation keys per kind: scripts have their own examples and placeholder. */
function kindKey<K extends FlowTextKey>(
  kind: AiFlowKind,
  key: K
): `ui:ai.flow.script.${K}` | `ui:ai.flow.${K}` {
  return kind === 'script' ? (`ui:ai.flow.script.${key}` as const) : (`ui:ai.flow.${key}` as const);
}

interface AiFlowDialogProps {
  onClose: () => void;
}

/** "Create with AI": describe an automation or script, get a draft flow on the canvas. */
export function AiFlowDialog({ onClose }: AiFlowDialogProps) {
  const { t } = useTranslation(['ui', 'common', 'errors']);
  const [kind, setKind] = useState<AiFlowKind>(() => useUiStore.getState().aiFlowKind);
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
      const { unknownEntityIds } = await createDraft(description, kind);
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

        <fieldset className="m-0 flex w-fit gap-1 rounded-full border border-border border-solid bg-muted/40 p-1">
          {KINDS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              disabled={isRunning}
              onClick={() => setKind(option)}
              className={cn(
                'h-7 rounded-full px-3.5 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground',
                kind === option && 'bg-card text-foreground shadow-card'
              )}
            >
              {t(`ui:ai.flow.kinds.${option}`)}
            </button>
          ))}
        </fieldset>

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
          placeholder={t(kindKey(kind, 'placeholder'))}
          className="min-h-28 resize-none border-solid text-sm"
          disabled={isRunning}
        />

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={isRunning}
              onClick={() => setDescription(t(kindKey(kind, key)))}
              className="rounded-full border border-border border-solid bg-muted/50 px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {t(kindKey(kind, key))}
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
