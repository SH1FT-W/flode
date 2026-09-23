import type { SequenceResult } from '@flode/transpiler';
import { AlertTriangle, Loader2, PlayCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { useNodeLabel } from '@/hooks/useNodeLabel';
import { rawErrorMessage } from '@/lib/error-codes';
import { showErrorToast, showSuccessToast, showToast } from '@/lib/haToast';
import { useFlowStore } from '@/store/flow-store';
import { getLatestHass } from '@/store/hass-store';
import { useUiStore } from '@/store/ui-store';

interface RunFromDialogProps {
  onClose: () => void;
}

/** Builds the HA action sequence for "run from `nodeId`" (transpiler loaded lazily). */
async function buildRunFromSequence(nodeId: string): Promise<SequenceResult> {
  const { transpiler, transpileSequence } = await import('@flode/transpiler');
  return transpileSequence(transpiler, useFlowStore.getState().toFlowGraph(), [nodeId]);
}

/**
 * Confirmation for "run from here": shows what will run, warns about steps
 * that need trigger data, then executes the sequence in Home Assistant via
 * `execute_script` (the same command HA's own editor uses for "Run action").
 */
export function RunFromDialog({ onClose }: RunFromDialogProps) {
  const { t } = useTranslation(['ui', 'common', 'errors']);
  const nodeId = useUiStore((s) => s.runFromNodeId);
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === nodeId));
  const nodeLabel = useNodeLabel();
  const [result, setResult] = useState<SequenceResult | null>(null);

  useEffect(() => {
    if (!nodeId) return;
    let cancelled = false;
    void buildRunFromSequence(nodeId).then((built) => {
      if (!cancelled) setResult(built);
    });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  const label = nodeLabel(node, nodeId ?? '');
  const sequence = result?.success ? result.sequence : undefined;

  const run = () => {
    const hass = getLatestHass();
    if (!hass || !sequence) return;
    onClose();
    showToast(t('ui:runFrom.started', { name: label }));
    // execute_script resolves when the sequence has finished (incl. delays).
    hass
      .callWS({ type: 'execute_script', sequence })
      .then(() => showSuccessToast(t('ui:runFrom.done', { name: label })))
      .catch((error: unknown) =>
        showErrorToast(
          t('ui:runFrom.failed', {
            error: rawErrorMessage(error) ?? t('errors:api.unknownError'),
          })
        )
      );
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="size-4 text-primary" />
            {t('ui:runFrom.title')}
          </DialogTitle>
          <DialogDescription>{t('ui:runFrom.description', { name: label })}</DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            {t('ui:runFrom.preparing')}
          </div>
        )}
        {result && !result.success && (
          <p className="text-destructive text-sm">
            {t('ui:runFrom.invalid', { errors: (result.errors ?? []).join(' · ') })}
          </p>
        )}
        {sequence && (
          <p className="text-muted-foreground text-sm">
            {t('ui:runFrom.steps', { count: sequence.length })}
          </p>
        )}
        {result?.usesTriggerData && (
          <div className="flex gap-2 rounded-control border border-warning/40 border-solid bg-warning/10 p-3 text-foreground text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>{t('ui:runFrom.triggerData')}</span>
          </div>
        )}

        <DialogFooter className="gap-2 pt-1">
          <Button variant="outline" className="border-solid" onClick={onClose}>
            {t('common:buttons.cancel')}
          </Button>
          <Button onClick={run} disabled={!sequence}>
            <PlayCircle />
            {t('ui:runFrom.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
