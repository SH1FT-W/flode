import { type NodeProps, useEdges } from '@xyflow/react';
import { GitBranch, GitFork, Repeat, Shuffle } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSummaryContext } from '@/hooks/useSummaryContext';
import { type SummaryContext, summarizeCondition } from '@/lib/node-summary';
import { cn } from '@/lib/utils';
import type { ConditionNodeData } from '@/store/flow-store';
import { AddNextButton, NodeCard, NodeHandle } from './NodeCard';

interface ConditionNodeProps extends NodeProps {
  data: ConditionNodeData;
}

const MAX_VISIBLE = 3;

function getBlockIcon(blockKey: unknown) {
  switch (blockKey) {
    case 'choose':
      return Shuffle;
    case 'if_else':
      return GitFork;
    case 'repeat_while':
      return Repeat;
    default:
      return GitBranch;
  }
}

interface BranchOutputProps {
  nodeId: string;
  handleId: 'true' | 'false';
  top: string;
  label?: string;
}

/** One labelled output (Yes / No) with its handle and "+" button. */
function BranchOutput({ nodeId, handleId, top, label }: BranchOutputProps) {
  return (
    <>
      <NodeHandle
        type="source"
        id={handleId}
        color="condition"
        style={{ top }}
        className={handleId === 'true' ? 'border-success!' : 'border-destructive!'}
      />
      {label && (
        <span
          style={{ top }}
          className={cn(
            'pointer-events-none absolute left-full ml-2 -translate-y-[135%] font-semibold text-[10px]',
            handleId === 'true' ? 'text-success' : 'text-destructive'
          )}
        >
          {label}
        </span>
      )}
      <AddNextButton nodeId={nodeId} handleId={handleId} style={{ top }} />
    </>
  );
}

interface NestedConditionsProps {
  conditions: ConditionNodeData[];
  separator: string;
  context: SummaryContext;
}

/** Compact list of an and/or/not group's sub-conditions, collapsible past three. */
function NestedConditions({ conditions, separator, context }: NestedConditionsProps) {
  const { t } = useTranslation(['nodes']);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? conditions : conditions.slice(0, MAX_VISIBLE);
  const hiddenCount = conditions.length - visible.length;

  return (
    <div className="mt-2.5 space-y-1">
      {visible.map((condition, index) => {
        const summary = summarizeCondition(condition, context);
        return (
          <div key={`${condition.condition}-${index}`}>
            {index > 0 && (
              <div className="py-0.5 text-center font-semibold text-[10px] text-condition uppercase tracking-wide">
                {separator}
              </div>
            )}
            <div className="rounded-lg bg-muted/60 px-2.5 py-1.5">
              <div className="font-semibold text-[10px] text-condition">{summary.kind}</div>
              <div className="truncate text-foreground text-xs">{summary.title}</div>
            </div>
          </div>
        );
      })}
      {conditions.length > MAX_VISIBLE && (
        <button
          type="button"
          className="nodrag w-full rounded-lg py-1 text-center text-[11px] text-muted-foreground hover:bg-muted"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded
            ? t('nodes:conditions.collapse')
            : `+${hiddenCount} ${t('nodes:conditions.more')}`}
        </button>
      )}
    </div>
  );
}

export const ConditionNode = memo(function ConditionNode({
  id,
  data,
  selected,
}: ConditionNodeProps) {
  const { t } = useTranslation(['nodes']);
  const summaryContext = useSummaryContext();
  const edges = useEdges();
  const hasFalseOutput =
    edges.some((e) => e.source === id && e.sourceHandle === 'false') ||
    data._blockKey === 'repeat_while';

  const summary = summarizeCondition(data, summaryContext);
  const isGroup = data.condition === 'or' || data.condition === 'and' || data.condition === 'not';
  const nested = isGroup && Array.isArray(data.conditions) ? data.conditions : [];
  const chooseCase = typeof data._chooseCase === 'number' ? data._chooseCase : undefined;
  const chooseCaseTotal =
    typeof data._chooseCaseTotal === 'number' ? data._chooseCaseTotal : undefined;

  return (
    <NodeCard
      id={id}
      selected={selected}
      disabled={data.enabled === false}
      color="condition"
      icon={getBlockIcon(data._blockKey)}
      typeLabel={t('nodes:types.condition')}
      kind={summary.kind}
      title={data.alias || summary.title}
      detail={data.alias ? summary.title : summary.detail}
      entityId={summary.entityId}
      wide={nested.length > 0}
      output="custom"
      badge={
        chooseCase !== undefined &&
        chooseCaseTotal !== undefined && (
          <div className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 py-0.5 font-semibold text-[10px] text-primary-foreground shadow-card">
            {t('nodes:conditions.caseLabel', { index: chooseCase, total: chooseCaseTotal })}
          </div>
        )
      }
      handles={
        hasFalseOutput ? (
          <>
            <BranchOutput nodeId={id} handleId="true" top="35%" label={t('nodes:conditions.yes')} />
            <BranchOutput nodeId={id} handleId="false" top="70%" label={t('nodes:conditions.no')} />
          </>
        ) : (
          <BranchOutput nodeId={id} handleId="true" top="50%" />
        )
      }
    >
      {nested.length > 0 && (
        <NestedConditions
          conditions={nested}
          separator={summary.kind ?? ''}
          context={summaryContext}
        />
      )}
    </NodeCard>
  );
});
