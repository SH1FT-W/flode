import type { TraceNodeState } from '@/lib/node-colors';
import { useFlowStore } from '@/store/flow-store';

/**
 * A node's state in the currently-shown HA trace (Phase E overlay) — `null`
 * whenever no trace is being shown. `error` takes priority over `executed`
 * (a step can be in the execution path and still have raised an exception).
 */
export function useTraceNodeState(nodeId: string): TraceNodeState {
  return useFlowStore((state) => {
    if (!state.isShowingTrace) return null;
    if (state.traceNodeErrors[nodeId]) return 'error';
    if (state.traceExecutionPath.includes(nodeId)) return 'executed';
    if (state.traceSkippedNodeIds.includes(nodeId)) return 'skipped';
    return null;
  });
}
