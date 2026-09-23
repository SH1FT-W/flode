import { Panel } from '@xyflow/react';
import { Eye, EyeOff, History, Loader2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAiTask } from '@/hooks/useAiTask';
import { useLastRun } from '@/hooks/useLastRun';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';
import { useUiStore } from '@/store/ui-store';

type RunTone = 'success' | 'warning' | 'error' | 'running' | 'neutral';

/** Maps HA's `script_execution` result to a status tone. */
function runTone(execution: string | undefined, hasError: boolean): RunTone {
  if (hasError || execution === 'error') return 'error';
  switch (execution) {
    case 'finished':
      return 'success';
    case 'running':
      return 'running';
    case 'failed_conditions':
    case 'failed_single':
    case 'failed_max_runs':
      return 'warning';
    default:
      return 'neutral';
  }
}

const TONE_DOT: Record<RunTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  running: 'bg-primary animate-pulse',
  neutral: 'bg-muted-foreground',
};

function useStatusLabel(): (execution: string | undefined) => string | undefined {
  const { t } = useTranslation(['ui']);
  return (execution) => {
    switch (execution) {
      case 'finished':
        return t('ui:lastRun.status.finished');
      case 'failed_conditions':
        return t('ui:lastRun.status.failed_conditions');
      case 'error':
        return t('ui:lastRun.status.error');
      case 'cancelled':
        return t('ui:lastRun.status.cancelled');
      case 'aborted':
        return t('ui:lastRun.status.aborted');
      case 'running':
        return t('ui:lastRun.status.running');
      case 'failed_single':
        return t('ui:lastRun.status.failed_single');
      case 'failed_max_runs':
        return t('ui:lastRun.status.failed_max_runs');
      default:
        return execution;
    }
  };
}

/**
 * "● Last run · 5 min ago · Successful  [Show]" — the open automation's most
 * recent real run from HA, overlaid on the canvas on demand. Only for
 * automations that exist in HA.
 */
export function LastRunChip() {
  const { t } = useTranslation(['ui']);
  const automationId = useFlowStore((s) => s.automationId);
  const stepCount = useFlowStore((s) => s.traceExecutionPath.length);
  const unmapped = useFlowStore((s) => s.traceUnmappedStepCount);
  const formatRelativeTime = useRelativeTime();
  const statusText = useStatusLabel();
  const { latest, isLoading, isShowing, show, hide } = useLastRun();
  const { entityId: aiEntityId } = useAiTask();
  if (!automationId) return null;

  const execution = latest?.script_execution;
  const tone = runTone(execution, Boolean(latest?.error));
  const statusLabel = statusText(execution);

  return (
    <Panel position="top-left" className="m-3!">
      <div className="flode-glass flex max-w-[min(34rem,calc(100vw-2rem))] items-center gap-2 rounded-full border border-border py-1 pr-1 pl-3 text-xs shadow-raised">
        {isLoading && !latest ? (
          <>
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">{t('ui:lastRun.loading')}</span>
          </>
        ) : latest ? (
          <>
            <span className={cn('size-2 shrink-0 rounded-full', TONE_DOT[tone])} />
            <span className="font-semibold text-foreground">{t('ui:lastRun.label')}</span>
            <span className="text-muted-foreground">
              {formatRelativeTime(latest.timestamp.start)}
            </span>
            {statusLabel && (
              <span className="truncate text-muted-foreground" title={latest.error}>
                {`· ${statusLabel}`}
              </span>
            )}
            {isShowing && (
              <span
                className="text-muted-foreground"
                title={unmapped > 0 ? t('ui:lastRun.unmapped', { count: unmapped }) : undefined}
              >
                {`· ${t('ui:lastRun.steps', { count: stepCount })}${unmapped > 0 ? ' *' : ''}`}
              </span>
            )}
            <Button
              size="sm"
              variant={isShowing ? 'outline' : 'default'}
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => (isShowing ? hide() : void show())}
            >
              {isShowing ? <EyeOff /> : <Eye />}
              {isShowing ? t('ui:lastRun.hide') : t('ui:lastRun.show')}
            </Button>
            {aiEntityId && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-full px-3 text-xs"
                title={t('ui:ai.explain.title')}
                onClick={() => useUiStore.getState().openExplain(latest.run_id)}
              >
                <Sparkles />
                {t('ui:ai.explain.button')}
              </Button>
            )}
          </>
        ) : (
          <>
            <History className="size-3.5 text-muted-foreground" />
            <span className="py-1 pr-2 text-muted-foreground">{t('ui:lastRun.none')}</span>
          </>
        )}
      </div>
    </Panel>
  );
}
