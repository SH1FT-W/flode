import { Handle, type NodeProps, Position } from '@xyflow/react';
import { AlertCircle, Ban, Variable } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import { useTraceNodeState } from '@/hooks/useTraceNodeState';
import { getTraceStateClass, NODE_COLORS, NODE_STATE_CLASSES } from '@/lib/node-colors';
import { cn } from '@/lib/utils';
import type { SetVariablesNodeData } from '@/store/flow-store';
import { useFlowStore } from '@/store/flow-store';

const COLORS = NODE_COLORS.variables;

interface SetVariablesNodeProps extends NodeProps {
  data: SetVariablesNodeData;
}

export const SetVariablesNode = memo(function SetVariablesNode({
  id,
  data,
  selected,
}: SetVariablesNodeProps) {
  const { t } = useTranslation(['nodes']);
  const activeNodeId = useFlowStore((s) => s.activeNodeId);
  const getExecutionStepNumber = useFlowStore((s) => s.getExecutionStepNumber);
  const { hasErrors, errorMessages } = useNodeErrors(id);
  const traceState = useTraceNodeState(id);
  const isActive = activeNodeId === id;
  const stepNumber = getExecutionStepNumber(id);
  const isDisabled = data.enabled === false;

  const variableCount = Object.keys(data.variables || {}).length;

  return (
    <div
      className={cn(
        'relative min-w-[160px] rounded-lg border-2 px-4 py-3',
        COLORS.border,
        COLORS.bg,
        'transition-all duration-200',
        selected && cn('ring-2 ring-offset-2', COLORS.ring),
        isActive && NODE_STATE_CLASSES.active,
        isDisabled && 'border-dashed opacity-50 grayscale',
        hasErrors && NODE_STATE_CLASSES.error,
        getTraceStateClass(traceState)
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
          <Variable className={cn('h-4 w-4', COLORS.text)} />
        </div>
        <span className={cn('font-semibold text-sm', COLORS.text)}>
          {data.alias || t('nodes:types.set_variables')}
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

      <div className={cn('text-xs', COLORS.text)}>
        <div className="font-medium opacity-75">
          {t('nodes:variables.variableCount', { count: variableCount })}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className={cn('w-3! h-3!', COLORS.handle)} />
    </div>
  );
});
