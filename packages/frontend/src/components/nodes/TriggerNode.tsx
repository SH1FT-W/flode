import type { NodeProps } from '@xyflow/react';
import { Zap } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSummaryContext } from '@/hooks/useSummaryContext';
import { summarizeTrigger } from '@/lib/node-summary';
import type { TriggerNodeData } from '@/store/flow-store';
import { NodeCard } from './NodeCard';

interface TriggerNodeProps extends NodeProps {
  data: TriggerNodeData;
}

export const TriggerNode = memo(function TriggerNode({ id, data, selected }: TriggerNodeProps) {
  const { t } = useTranslation(['nodes']);
  const summary = summarizeTrigger(data, useSummaryContext());

  return (
    <NodeCard
      id={id}
      selected={selected}
      disabled={data.enabled === false}
      color="trigger"
      icon={Zap}
      typeLabel={t('nodes:types.trigger')}
      kind={summary.kind}
      title={data.alias || summary.title}
      detail={data.alias ? summary.title : summary.detail}
      entityId={summary.entityId}
      hasInput={false}
    />
  );
});
