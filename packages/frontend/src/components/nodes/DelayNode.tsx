import type { NodeProps } from '@xyflow/react';
import { Clock } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSummaryContext } from '@/hooks/useSummaryContext';
import { summarizeDelay } from '@/lib/node-summary';
import type { DelayNodeData } from '@/store/flow-store';
import { NodeCard } from './NodeCard';

interface DelayNodeProps extends NodeProps {
  data: DelayNodeData;
}

export const DelayNode = memo(function DelayNode({ id, data, selected }: DelayNodeProps) {
  const { t } = useTranslation(['nodes']);
  const summary = summarizeDelay(data, useSummaryContext());

  return (
    <NodeCard
      id={id}
      selected={selected}
      disabled={data.enabled === false}
      color="delay"
      icon={Clock}
      typeLabel={t('nodes:types.delay')}
      title={data.alias || summary.title}
      detail={data.alias ? summary.title : undefined}
    />
  );
});
