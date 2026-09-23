import { type FlowGraph, FlowGraphSchema } from '@flode/shared';
import { useFlowStore } from '@/store/flow-store';

/** Downloads the current flow as `<name>.json` (FLODE's own graph format). */
export function exportFlowJson(): void {
  const { toFlowGraph, flowName } = useFlowStore.getState();
  const blob = new Blob([JSON.stringify(toFlowGraph(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${flowName || 'automation'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Lets the user pick a `.json` file previously exported by FLODE and loads it.
 * Resolves `false` when the file isn't a valid flow graph.
 */
export function importFlowJson(): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(false);
        return;
      }
      try {
        const parsed = FlowGraphSchema.safeParse(JSON.parse(await file.text()));
        if (!parsed.success) {
          resolve(false);
          return;
        }
        const graph: FlowGraph = parsed.data;
        useFlowStore.getState().fromFlowGraph(graph);
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    input.click();
  });
}
