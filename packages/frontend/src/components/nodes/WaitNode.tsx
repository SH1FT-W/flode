import type { NodeProps } from '@xyflow/react';
import { Hourglass } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSummaryContext } from '@/hooks/useSummaryContext';
import { summarizeWait } from '@/lib/node-summary';
import type { WaitNodeData } from '@/store/flow-store';
import { NodeCard } from './NodeCard';

interface WaitNodeProps extends NodeProps {
  data: WaitNodeData;
}

export const WaitNode = memo(function WaitNode({ id, data, selected }: WaitNodeProps) {
  const { t } = useTranslation(['nodes']);
  const summary = summarizeWait(data, useSummaryContext());

  return (
    <NodeCard
      id={id}
      selected={selected}
      disabled={data.enabled === false}
      color="wait"
      icon={Hourglass}
      typeLabel={t('nodes:types.wait')}
      title={data.alias || summary.title}
      detail={summary.detail}
    />
  );
});
