import type { NodeProps } from '@xyflow/react';
import { Variable } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSummaryContext } from '@/hooks/useSummaryContext';
import { summarizeVariables } from '@/lib/node-summary';
import type { SetVariablesNodeData } from '@/store/flow-store';
import { NodeCard } from './NodeCard';

interface SetVariablesNodeProps extends NodeProps {
  data: SetVariablesNodeData;
}

export const SetVariablesNode = memo(function SetVariablesNode({
  id,
  data,
  selected,
}: SetVariablesNodeProps) {
  const { t } = useTranslation(['nodes']);
  const summary = summarizeVariables(data, useSummaryContext());

  return (
    <NodeCard
      id={id}
      selected={selected}
      disabled={data.enabled === false}
      color="variables"
      icon={Variable}
      typeLabel={t('nodes:types.set_variables')}
      title={data.alias || summary.title}
      detail={summary.detail}
    />
  );
});
