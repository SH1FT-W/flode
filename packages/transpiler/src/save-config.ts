import type { FlowGraph } from '@flode/shared';
import type { FlowTranspiler } from './FlowTranspiler';

/** Name and description the saved automation gets. */
export interface FlowNaming {
  alias: string;
  description: string;
}

export interface AutomationSaveResult {
  success: boolean;
  /** The config to POST to `config/automation/config/<id>`. */
  config?: Record<string, unknown>;
  errors?: string[];
}

/**
 * The automation config FLODE writes to Home Assistant for `graph`: the
 * transpiled automation plus `_flode_metadata` (node positions, graph id) so
 * the layout survives the round trip. Shared by every FLODE UI.
 */
export function buildAutomationSaveConfig(
  transpiler: FlowTranspiler,
  graph: FlowGraph,
  naming: FlowNaming
): AutomationSaveResult {
  const result = transpiler.transpile(graph);
  if (!result.success || !result.output?.automation) {
    return {
      success: false,
      errors: result.errors ?? ['Failed to transpile flow to automation config'],
    };
  }
  const automation = result.output.automation;
  return {
    success: true,
    config: {
      ...naming,
      ...automation,
      variables: {
        ...(automation.variables || {}),
        _flode_metadata: {
          version: 1,
          strategy: 'native' as const,
          nodes: Object.fromEntries(
            graph.nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }])
          ),
          graph_id: graph.id,
          graph_version: 1,
        },
      },
    },
  };
}
