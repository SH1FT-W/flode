import { Handle, type NodeProps, Position, useEdges } from '@xyflow/react';
import { AlertCircle, Ban, GitBranch } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNodeErrors } from '@/hooks/useNodeErrors';
import { cn } from '@/lib/utils';
import type { ConditionNodeData } from '@/store/flow-store';
import { useFlowStore } from '@/store/flow-store';

interface ConditionNodeProps extends NodeProps {
  data: ConditionNodeData;
}

const MAX_VISIBLE = 3;

function getConditionSummary(cond: ConditionNodeData, labelOf: (type: string) => string): string {
  const entity = Array.isArray(cond.entity_id) ? cond.entity_id[0] : cond.entity_id;
  const entityShort = entity ? (entity.split('.').pop() ?? entity) : null;

  switch (cond.condition) {
    case 'state':
      return entityShort
        ? `${entityShort}${cond.state ? ` = ${cond.state}` : ''}`
        : labelOf('state');
    case 'numeric_state': {
      const parts = [
        cond.above !== undefined ? `> ${cond.above}` : null,
        cond.below !== undefined ? `< ${cond.below}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      return entityShort ? `${entityShort}${parts ? ` ${parts}` : ''}` : labelOf('numeric_state');
    }
    case 'zone':
      return entityShort
        ? `${entityShort} in ${cond.zone ?? 'zone'}`
        : (cond.zone ?? labelOf('zone'));
    case 'template':
      return cond.template
        ? cond.template.slice(0, 28) + (cond.template.length > 28 ? '…' : '')
        : labelOf('template');
    case 'time':
      return cond.after
        ? `after ${cond.after}`
        : cond.before
          ? `before ${cond.before}`
          : labelOf('time');
    case 'sun':
      return labelOf('sun');
    case 'device':
      return cond.type ?? labelOf('device');
    case 'trigger':
      return labelOf('trigger');
    case 'or':
    case 'and':
    case 'not': {
      const subs = cond.conditions ?? [];
      if (subs.length === 0) return labelOf(cond.condition);
      const labels = subs.map((c) => {
        const e = Array.isArray(c.entity_id) ? c.entity_id[0] : c.entity_id;
        if (e) return e.split('.').pop() ?? e;
        return c.condition;
      });
      return labels.join(' · ');
    }
    default:
      return cond.condition;
  }
}

export const ConditionNode = memo(function ConditionNode({
  id,
  data,
  selected,
}: ConditionNodeProps) {
  const { t } = useTranslation(['nodes']);
  const activeNodeId = useFlowStore((s) => s.activeNodeId);
  const getExecutionStepNumber = useFlowStore((s) => s.getExecutionStepNumber);
  const { hasErrors, errorMessages } = useNodeErrors(id);
  const isActive = activeNodeId === id;
  const stepNumber = getExecutionStepNumber(id);
  const isDisabled = data.enabled === false;
  const edges = useEdges();
  const hasFalseEdge = edges.some((e) => e.source === id && e.sourceHandle === 'false');
  const [expanded, setExpanded] = useState(false);

  const conditionTypeLabels: Record<string, string> = {
    state: t('nodes:conditions.types.state'),
    numeric_state: t('nodes:conditions.types.numeric_state'),
    time: t('nodes:conditions.types.time'),
    sun: t('nodes:conditions.types.sun'),
    zone: t('nodes:conditions.types.zone'),
    template: t('nodes:conditions.types.template'),
    device: t('nodes:conditions.types.device'),
    trigger: t('nodes:conditions.types.trigger'),
    and: t('nodes:conditions.types.and'),
    or: t('nodes:conditions.types.or'),
    not: t('nodes:conditions.types.not'),
  };
  const getConditionLabel = (type: string) => conditionTypeLabels[type] ?? type;

  const isGroup = data.condition === 'or' || data.condition === 'and' || data.condition === 'not';
  const nestedConditions = isGroup && Array.isArray(data.conditions) ? data.conditions : [];
  const hasNested = nestedConditions.length > 0;
  const separator = getConditionLabel(data.condition);

  const visibleCount = expanded
    ? nestedConditions.length
    : Math.min(nestedConditions.length, MAX_VISIBLE);
  const hiddenCount = nestedConditions.length - visibleCount;

  return (
    <div
      className={cn(
        'group relative rounded-lg border-2 border-blue-400 bg-blue-50 px-4 py-3',
        hasNested ? 'min-w-[220px]' : 'min-w-[180px]',
        'transition-all duration-200',
        selected && 'ring-2 ring-blue-500 ring-offset-2',
        isActive && 'node-active ring-4 ring-green-500',
        isDisabled && 'border-dashed opacity-50 grayscale',
        hasErrors && 'border-red-500 ring-2 ring-red-400'
      )}
    >
      {hasErrors && (
        <div
          className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm"
          title={errorMessages.join('\n')}
        >
          <AlertCircle className="h-3 w-3" />
        </div>
      )}
      {isDisabled && !hasErrors && (
        <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-500 text-white shadow-sm">
          <Ban className="h-3 w-3" />
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-blue-500 !border-blue-700"
      />

      <div className="mb-1 flex items-center gap-2">
        <div className="rounded bg-blue-200 p-1">
          <GitBranch className="h-4 w-4 text-blue-700" />
        </div>
        <span className="font-semibold text-blue-900 text-sm">
          {data.alias || getConditionLabel(data.condition)}
        </span>
        {stepNumber && (
          <div className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 font-bold text-white text-xs">
            {stepNumber}
          </div>
        )}
      </div>

      {!hasNested && (
        <div className="space-y-0.5 text-blue-700 text-xs">
          <div className="font-medium">{getConditionLabel(data.condition)}</div>
          {data.entity_id && (
            <div className="truncate opacity-75">
              {Array.isArray(data.entity_id) ? data.entity_id.join(', ') : data.entity_id}
            </div>
          )}
          {data.state && (
            <div className="opacity-75">
              {'= '}
              {data.state}
            </div>
          )}
          {data.above !== undefined && (
            <div className="opacity-75">
              {'> '}
              {data.above}
            </div>
          )}
          {data.below !== undefined && (
            <div className="opacity-75">
              {'< '}
              {data.below}
            </div>
          )}
          {data.after && (
            <div className="opacity-75">
              {'after: '}
              {typeof data.after === 'string' ? data.after : String(data.after)}
            </div>
          )}
          {data.before && (
            <div className="opacity-75">
              {'before: '}
              {typeof data.before === 'string' ? data.before : String(data.before)}
            </div>
          )}
          {data.zone && (
            <div className="opacity-75">
              {'zone: '}
              {data.zone}
            </div>
          )}
          {data.attribute && (
            <div className="opacity-75">
              {'attr: '}
              {data.attribute}
            </div>
          )}
          {data.for && (
            <div className="opacity-75">
              {'for: '}
              {typeof data.for === 'string'
                ? data.for
                : `${data.for.hours || 0}h ${data.for.minutes || 0}m ${data.for.seconds || 0}s`}
            </div>
          )}
          {data.template && (
            <div className="truncate font-mono text-[10px] opacity-75">
              {data.template.slice(0, 30)}
              {'...'}
            </div>
          )}
          {data.value_template && (
            <div className="truncate font-mono text-[10px] opacity-75">
              {data.value_template.slice(0, 30)}
              {'...'}
            </div>
          )}
          {data.id !== undefined && data.id !== null && (
            <div className="opacity-75">
              {'id: '}
              {Array.isArray(data.id) ? (data.id as string[]).join(', ') : String(data.id)}
            </div>
          )}
          {isGroup && (
            <div className="opacity-75">{t('nodes:conditions.nestedConditions', { count: 0 })}</div>
          )}
        </div>
      )}

      {hasNested && (
        <div className="mt-2 space-y-1">
          {nestedConditions.slice(0, visibleCount).map((cond, idx) => (
            <div key={idx}>
              {idx > 0 && (
                <div className="flex items-center gap-1 py-0.5">
                  <div className="h-px flex-1 bg-blue-200" />
                  <span className="rounded bg-blue-200 px-1.5 font-bold text-[10px] text-blue-600">
                    {separator}
                  </span>
                  <div className="h-px flex-1 bg-blue-200" />
                </div>
              )}
              <div className="rounded border border-blue-200 bg-white px-2 py-1">
                <div className="font-semibold text-[11px] text-blue-800">
                  {getConditionLabel(cond.condition)}
                </div>
                <div className="truncate text-[10px] text-blue-500">
                  {getConditionSummary(cond, getConditionLabel)}
                </div>
              </div>
            </div>
          ))}
          {hiddenCount > 0 && !expanded && (
            <button
              type="button"
              className="nodrag w-full rounded border border-blue-200 bg-white px-2 py-0.5 text-center text-[10px] text-blue-500 hover:bg-blue-50"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
            >
              {`+${hiddenCount} `}{t('nodes:conditions.more')}
            </button>
          )}
          {expanded && nestedConditions.length > MAX_VISIBLE && (
            <button
              type="button"
              className="nodrag w-full rounded border border-blue-200 bg-white px-2 py-0.5 text-center text-[10px] text-blue-500 hover:bg-blue-50"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
              }}
            >
              {t('nodes:conditions.collapse')}
            </button>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: hasFalseEdge ? '30%' : '50%' }}
        className="!w-3 !h-3 !bg-green-500 !border-green-700"
      />
      {hasFalseEdge && (
        <Handle
          type="source"
          position={Position.Right}
          id="false"
          style={{ top: '70%' }}
          className="!w-3 !h-3 !bg-red-500 !border-red-700"
        />
      )}

      {hasFalseEdge && (
        <div className="absolute top-[30%] right-[-40px] -translate-y-1/2 transform rounded border border-green-200 bg-white px-1 py-0.5 font-medium text-[10px] text-green-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          {t('nodes:conditions.yes')}
        </div>
      )}
      {hasFalseEdge && (
        <div className="absolute top-[70%] right-[-36px] -translate-y-1/2 transform rounded border border-red-200 bg-white px-1 py-0.5 font-medium text-[10px] text-red-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          {t('nodes:conditions.no')}
        </div>
      )}
    </div>
  );
});
