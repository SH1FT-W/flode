import type { Node } from '@xyflow/react';
import { useCallback } from 'react';
import { summarizeNode } from '@/lib/node-summary';
import type { FlowNodeData } from '@/store/flow-store';
import { useSummaryContext } from './useSummaryContext';

/** Human-readable name for a node: its alias, else the plain-language summary, else its id. */
export function useNodeLabel(): (
  node: Node<FlowNodeData> | undefined,
  fallbackId: string
) => string {
  const context = useSummaryContext();
  return useCallback(
    (node, fallbackId) => {
      if (!node) return fallbackId;
      const alias = typeof node.data.alias === 'string' ? node.data.alias : '';
      return alias || summarizeNode(node.type, node.data, context)?.title || node.id;
    },
    [context]
  );
}
