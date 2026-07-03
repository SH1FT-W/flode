import { Handle, type NodeProps, Position } from '@xyflow/react';
import { AlertCircle, Ban, Columns2, Hash, OctagonX, Play, RotateCcw } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import { NODE_COLORS, NODE_STATE_CLASSES } from '@/lib/node-colors';
import { cn } from '@/lib/utils';
import type { ActionNodeData } from '@/store/flow-store';
import { useFlowStore } from '@/store/flow-store';

const ACTION_COLORS = NODE_COLORS.action;
// stop-action reuses the "wait" token, repeat-action reuses "delay" — same
// visual family already established for those semantics elsewhere.
const STOP_COLORS = NODE_COLORS.wait;
const REPEAT_COLORS = NODE_COLORS.delay;

interface ActionNodeProps extends NodeProps {
  data: ActionNodeData;
}

export const ActionNode = memo(function ActionNode({ id, data, selected }: ActionNodeProps) {
  const { t } = useTranslation(['nodes']);
  const activeNodeId = useFlowStore((s) => s.activeNodeId);
  const getExecutionStepNumber = useFlowStore((s) => s.getExecutionStepNumber);
  const { hasErrors, errorMessages } = useNodeErrors(id);
  const isActive = activeNodeId === id;
  const stepNumber = getExecutionStepNumber(id);
  const isDisabled = data.enabled === false;

  const isStopAction = typeof data.stop === 'string';
  const stopMessage = isStopAction ? (data.stop as string) : undefined;
  const isStopError = isStopAction && data.error === true;

  // Parse service into domain and service name, handle undefined
  let domain: string | undefined;
  let serviceName: string | undefined;
  if (!isStopAction && typeof data.service === 'string' && data.service.includes('.')) {
    [domain, serviceName] = data.service.split('.');
  }

  const isEventAction = !isStopAction && typeof data.event === 'string' && data.event.trim() !== '';

  const repeatData =
    !isStopAction && data.repeat !== null && typeof data.repeat === 'object'
      ? (data.repeat as Record<string, unknown>)
      : null;
  const isRepeatAction = repeatData !== null && repeatData.count !== undefined;
  const repeatCount = isRepeatAction ? repeatData.count : undefined;
  const repeatSeqLength = isRepeatAction
    ? Array.isArray(repeatData.sequence)
      ? repeatData.sequence.length
      : 0
    : 0;

  // Get target entity display
  const targetDisplay = (() => {
    if (isStopAction || !data.target) return null;
    const entityId = data.target.entity_id;
    if (Array.isArray(entityId)) {
      return t('nodes:actions.entitiesSelected', { count: entityId.length });
    }
    return entityId;
  })();

  if (isStopAction) {
    return (
      <div
        className={cn(
          'relative min-w-[180px] rounded-lg border-2 px-4 py-3',
          STOP_COLORS.border,
          STOP_COLORS.bg,
          'transition-all duration-200',
          selected && cn('ring-2 ring-offset-2', STOP_COLORS.ring),
          isActive && NODE_STATE_CLASSES.active,
          isDisabled && 'border-dashed opacity-50 grayscale',
          hasErrors && NODE_STATE_CLASSES.error
        )}
      >
        {hasErrors && (
          <div
            className={cn(
              'absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full shadow-sm',
              NODE_STATE_CLASSES.errorBadge
            )}
            title={errorMessages.join('\n')}
          >
            <AlertCircle className="h-3 w-3" />
          </div>
        )}
        {isDisabled && !hasErrors && (
          <div
            className={cn(
              'absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full shadow-sm',
              NODE_STATE_CLASSES.disabledBadge
            )}
          >
            <Ban className="h-3 w-3" />
          </div>
        )}
        <Handle
          type="target"
          position={Position.Left}
          className={cn('w-3! h-3!', STOP_COLORS.handle)}
        />
        <div className="mb-1 flex items-center gap-2">
          <div className={cn('rounded p-1', STOP_COLORS.chip)}>
            <OctagonX className={cn('h-4 w-4', STOP_COLORS.text)} />
          </div>
          <span className={cn('font-semibold text-sm', STOP_COLORS.text)}>
            {data.alias || t('nodes:types.stop')}
          </span>
          {stepNumber && (
            <div
              className={cn(
                'ml-auto flex h-5 w-5 items-center justify-center rounded-full font-bold text-xs',
                STOP_COLORS.badge
              )}
            >
              {stepNumber}
            </div>
          )}
        </div>
        <div className={cn('text-xs', STOP_COLORS.text)}>
          <div className="font-medium opacity-70">
            {isStopError ? t('nodes:actions.stopError') : t('nodes:actions.stopExecution')}
          </div>
          {stopMessage && <div className="truncate opacity-75 italic">{stopMessage}</div>}
        </div>
      </div>
    );
  }

  if (isRepeatAction) {
    return (
      <div
        className={cn(
          'relative min-w-[180px] rounded-lg border-2 px-4 py-3',
          REPEAT_COLORS.border,
          REPEAT_COLORS.bg,
          'transition-all duration-200',
          selected && cn('ring-2 ring-offset-2', REPEAT_COLORS.ring),
          isActive && NODE_STATE_CLASSES.active,
          isDisabled && 'border-dashed opacity-50 grayscale',
          hasErrors && NODE_STATE_CLASSES.error
        )}
      >
        {hasErrors && (
          <div
            className={cn(
              'absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full shadow-sm',
              NODE_STATE_CLASSES.errorBadge
            )}
            title={errorMessages.join('\n')}
          >
            <AlertCircle className="h-3 w-3" />
          </div>
        )}
        {isDisabled && !hasErrors && (
          <div
            className={cn(
              'absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full shadow-sm',
              NODE_STATE_CLASSES.disabledBadge
            )}
          >
            <Ban className="h-3 w-3" />
          </div>
        )}
        <Handle
          type="target"
          position={Position.Left}
          className={cn('w-3! h-3!', REPEAT_COLORS.handle)}
        />
        <div className="mb-1 flex items-center gap-2">
          <div className={cn('rounded p-1', REPEAT_COLORS.chip)}>
            {data._blockKey === 'repeat_count' ? (
              <Hash className={cn('h-4 w-4', REPEAT_COLORS.text)} />
            ) : (
              <RotateCcw className={cn('h-4 w-4', REPEAT_COLORS.text)} />
            )}
          </div>
          <span className={cn('font-semibold text-sm', REPEAT_COLORS.text)}>
            {data.alias || t('nodes:actions.repeatLabel', { n: String(repeatCount) })}
          </span>
          {stepNumber && (
            <div
              className={cn(
                'ml-auto flex h-5 w-5 items-center justify-center rounded-full font-bold text-xs',
                REPEAT_COLORS.badge
              )}
            >
              {stepNumber}
            </div>
          )}
        </div>
        {repeatSeqLength > 0 && (
          <div className={cn('text-xs font-medium opacity-70', REPEAT_COLORS.text)}>
            {t('nodes:actions.repeatActions', { count: repeatSeqLength })}
          </div>
        )}
        <Handle
          type="source"
          position={Position.Right}
          className={cn('w-3! h-3!', REPEAT_COLORS.handle)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative min-w-[180px] rounded-lg border-2 px-4 py-3',
        ACTION_COLORS.border,
        ACTION_COLORS.bg,
        'transition-all duration-200',
        selected && cn('ring-2 ring-offset-2', ACTION_COLORS.ring),
        isActive && NODE_STATE_CLASSES.active,
        isDisabled && 'border-dashed opacity-50 grayscale',
        hasErrors && NODE_STATE_CLASSES.error
      )}
    >
      {hasErrors && (
        <div
          className={cn(
            'absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full shadow-sm',
            NODE_STATE_CLASSES.errorBadge
          )}
          title={errorMessages.join('\n')}
        >
          <AlertCircle className="h-3 w-3" />
        </div>
      )}
      {isDisabled && !hasErrors && (
        <div
          className={cn(
            'absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full shadow-sm',
            NODE_STATE_CLASSES.disabledBadge
          )}
        >
          <Ban className="h-3 w-3" />
        </div>
      )}
      <Handle type="target" position={Position.Left} className={cn('w-3! h-3!', ACTION_COLORS.handle)} />

      <div className="mb-1 flex items-center gap-2">
        <div className={cn('rounded p-1', ACTION_COLORS.chip)}>
          {data._blockKey === 'parallel' ? (
            <Columns2 className={cn('h-4 w-4', ACTION_COLORS.text)} />
          ) : (
            <Play className={cn('h-4 w-4', ACTION_COLORS.text)} />
          )}
        </div>
        <span className={cn('font-semibold text-sm', ACTION_COLORS.text)}>
          {data.alias || (isEventAction ? data.event : serviceName) || t('nodes:types.action')}
        </span>
        {stepNumber && (
          <div
            className={cn(
              'ml-auto flex h-5 w-5 items-center justify-center rounded-full font-bold text-xs',
              ACTION_COLORS.badge
            )}
          >
            {stepNumber}
          </div>
        )}
      </div>

      <div className={cn('space-y-0.5 text-xs', ACTION_COLORS.text)}>
        <div className="font-medium">
          {isEventAction ? (
            <span className="opacity-60">{t('nodes:actions.fireEvent')}</span>
          ) : (
            <>
              <span className="opacity-60">
                {domain}
                {'.'}
              </span>
              {serviceName}
            </>
          )}
        </div>
        {targetDisplay && <div className="truncate opacity-75">{targetDisplay}</div>}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className={cn('w-3! h-3!', ACTION_COLORS.handle)}
      />
    </div>
  );
});
