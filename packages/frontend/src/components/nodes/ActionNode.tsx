import type { NodeProps } from '@xyflow/react';
import { getRawStep } from '@flode/shared';
import { Braces, Columns2, Hash, OctagonX, Play, RotateCcw } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSummaryContext } from '@/hooks/useSummaryContext';
import { isRecord, summarizeAction } from '@/lib/node-summary';
import type { ActionNodeData } from '@/store/flow-store';
import { NodeCard } from './NodeCard';

interface ActionNodeProps extends NodeProps {
  data: ActionNodeData;
}

export const ActionNode = memo(function ActionNode({ id, data, selected }: ActionNodeProps) {
  const { t } = useTranslation(['nodes', 'ui']);
  const summary = summarizeAction(data, useSummaryContext());
  const common = {
    id,
    selected,
    disabled: data.enabled === false,
    title: data.alias || summary.title,
  };

  // pass-through step: FLODE keeps its YAML verbatim.
  if (getRawStep(data)) {
    return (
      <NodeCard
        {...common}
        color="action"
        icon={Braces}
        typeLabel={t('ui:rawStep.type')}
        detail={data.alias ? summary.title : undefined}
      />
    );
  }

  // stop: ends the run — no outgoing handle.
  if (typeof data.stop === 'string') {
    return (
      <NodeCard
        {...common}
        color="wait"
        icon={OctagonX}
        typeLabel={t('nodes:types.stop')}
        detail={summary.detail}
        output="none"
      />
    );
  }

  // repeat (count) — the loop body lives inside the node's own data.
  if (isRecord(data.repeat) && data.repeat.count !== undefined) {
    return (
      <NodeCard
        {...common}
        color="delay"
        icon={data._blockKey === 'repeat_count' ? Hash : RotateCcw}
        typeLabel={t('nodes:types.repeat_count')}
        detail={summary.detail}
      />
    );
  }

  return (
    <NodeCard
      {...common}
      color="action"
      icon={data._blockKey === 'parallel' ? Columns2 : Play}
      typeLabel={t('nodes:types.action')}
      kind={summary.kind}
      detail={data.alias ? summary.title : summary.detail}
      entityId={summary.entityId}
    />
  );
});
