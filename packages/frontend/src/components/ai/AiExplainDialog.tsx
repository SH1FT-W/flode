import { Loader2, RotateCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
import { useAiTask } from '@/hooks/useAiTask';
import { buildExplainInstructions, readableAiError } from '@/lib/ai-assist';
import { rawErrorMessage } from '@/lib/error-codes';
import { getHomeAssistantAPI } from '@/lib/ha-api';
import { useFlowStore } from '@/store/flow-store';
import { getLatestHass } from '@/store/hass-store';
import { useUiStore } from '@/store/ui-store';

interface AiExplainDialogProps {
  onClose: () => void;
}

/** "Why did it (not) work?" — the AI explains one real run of the open automation. */
export function AiExplainDialog({ onClose }: AiExplainDialogProps) {
  const { t } = useTranslation(['ui', 'common', 'errors']);
  const runId = useUiStore((s) => s.explainRunId);
  const automationId = useFlowStore((s) => s.automationId);
  const { name: aiName, generate } = useAiTask();
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const explain = useCallback(async () => {
    const hass = getLatestHass();
    if (!hass || !automationId || !runId) return;
    setIsRunning(true);
    setError(null);
    setAnswer(null);
    try {
      const details = await getHomeAssistantAPI(hass).getAutomationTraceDetails(
        automationId,
        runId
      );
      if (!details) throw new Error(t('ui:ai.explain.noTrace'));
      const errorStep = Object.values(details.trace)
        .flat()
        .find((step) => step.error);
      const text = await generate(
        'FLODE: explain automation run',
        buildExplainInstructions({
          config: details.config,
          trace: details.trace,
          outcome: details.script_execution,
          error: errorStep?.error,
          language: hass.language ?? 'en',
          timeZone: hass.config?.time_zone,
        })
      );
      setAnswer(text.trim());
    } catch (err) {
      setError(readableAiError(rawErrorMessage(err) ?? t('errors:api.unknownError')));
    } finally {
      setIsRunning(false);
    }
  }, [automationId, runId, generate, t]);

  useEffect(() => {
    void explain();
  }, [explain]);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {t('ui:ai.explain.title')}
          </DialogTitle>
          <DialogDescription>{t('ui:ai.explain.description', { name: aiName })}</DialogDescription>
        </DialogHeader>

        {isRunning && (
          <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            {t('ui:ai.explain.running')}
          </div>
        )}

        {answer && (
          <p className="whitespace-pre-wrap text-foreground text-sm leading-relaxed">{answer}</p>
        )}

        {error && <AiErrorBox title={t('ui:ai.explain.failed')} message={error} />}

        <DialogFooter className="gap-2 pt-1">
          <Button
            variant="outline"
            className="border-solid"
            onClick={() => void explain()}
            disabled={isRunning}
          >
            <RotateCw />
            {t('ui:ai.explain.retry')}
          </Button>
          <Button onClick={onClose}>{t('common:buttons.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
