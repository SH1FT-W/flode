import type { FlodeMetadata, FlowGraph } from '@flode/shared';
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

/** `_flode_metadata`: the layout (node positions, moved branch steps) and the graph's id. */
export function flodeMetadata(
  graph: FlowGraph,
  strategy: FlodeMetadata['strategy']
): FlodeMetadata {
  const offsets = graph.branchOffsets ?? {};
  return {
    version: 1,
    nodes: Object.fromEntries(
      graph.nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }])
    ),
    ...(Object.keys(offsets).length > 0 ? { branch_offsets: offsets } : {}),
    ...(graph.direction ? { direction: graph.direction } : {}),
    graph_id: graph.id,
    graph_version: graph.version,
    strategy,
  };
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
        _flode_metadata: flodeMetadata(graph, result.strategy ?? 'native'),
      },
    },
  };
}
