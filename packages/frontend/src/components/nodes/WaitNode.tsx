import { Handle, type NodeProps, Position } from '@xyflow/react';
import { AlertCircle, Ban, Hourglass } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import { NODE_COLORS, NODE_STATE_CLASSES } from '@/lib/node-colors';
import { cn } from '@/lib/utils';
import type { WaitNodeData } from '@/store/flow-store';
import { useFlowStore } from '@/store/flow-store';
import { formatDuration } from './formatDuration';

const COLORS = NODE_COLORS.wait;

interface WaitNodeProps extends NodeProps {
  data: WaitNodeData;
}

export const WaitNode = memo(function WaitNode({ id, data, selected }: WaitNodeProps) {
  const { t } = useTranslation(['common', 'nodes']);
  const activeNodeId = useFlowStore((s) => s.activeNodeId);
  const getExecutionStepNumber = useFlowStore((s) => s.getExecutionStepNumber);
  const { hasErrors, errorMessages } = useNodeErrors(id);
  const isActive = activeNodeId === id;
  const stepNumber = getExecutionStepNumber(id);
  const isDisabled = data.enabled === false;

  // Format timeout for display (reuse shared util)
  const timeoutDisplay = formatDuration(data.timeout);

  return (
    <div
      className={cn(
        'relative min-w-[140px] rounded-lg border-2 px-4 py-3',
        COLORS.border,
        COLORS.bg,
        'transition-all duration-200',
        selected && cn('ring-2 ring-offset-2', COLORS.ring),
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
      <Handle type="target" position={Position.Left} className={cn('w-3! h-3!', COLORS.handle)} />

      <div className="mb-1 flex items-center gap-2">
        <div className={cn('rounded p-1', COLORS.chip)}>
          <Hourglass className={cn('h-4 w-4', COLORS.text)} />
        </div>
        <span className={cn('font-semibold text-sm', COLORS.text)}>
          {data.alias || t('nodes:types.wait')}
        </span>
        {stepNumber && (
          <div
            className={cn(
              'ml-auto flex h-5 w-5 items-center justify-center rounded-full font-bold text-xs',
              COLORS.badge
            )}
          >
            {stepNumber}
          </div>
        )}
      </div>

      <div className={cn('space-y-0.5 text-xs', COLORS.text)}>
        {data.wait_template && (
          <div className="truncate font-mono text-[10px] opacity-75">
            {data.wait_template.slice(0, 30)}
            {'...'}
          </div>
        )}
        {data.wait_for_trigger && (
          <div className="truncate text-[10px] opacity-75">
            {t('nodes:wait.waitsForNTrigger', { count: data.wait_for_trigger.length })}
          </div>
        )}
        {timeoutDisplay && (
          <div className="opacity-75">
            {t('nodes:wait.timeoutLabel')} {timeoutDisplay}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className={cn('w-3! h-3!', COLORS.handle)} />
    </div>
  );
});
