import type { FlowEdge, FlowGraph, FlowNode } from '@flode/shared';
import { isPlainObject } from '@flode/shared';
import type { FlowTranspiler, YamlOptions } from './FlowTranspiler';

/** Id of the synthetic trigger `buildSequenceFlow` puts in front of the start nodes. */
export const SEQUENCE_ENTRY_ID = '__flode_sequence_entry__';

export interface SequenceResult {
  success: boolean;
  /** The HA action sequence (script `sequence:` / `execute_script`). */
  sequence?: Record<string, unknown>[];
  errors?: string[];
  warnings: string[];
  /** The steps read `trigger.*`, which only exists when an automation fires. */
  usesTriggerData: boolean;
}

/** Everything reachable from `startIds` along the flow's edges (including loop-backs). */
function reachableFrom(flow: FlowGraph, startIds: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...startIds];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    for (const edge of flow.edges) {
      if (edge.source === id) queue.push(edge.target);
    }
  }
  return seen;
}

/**
 * The part of `flow` that runs from `startNodeIds` on, entered by a single
 * synthetic trigger instead of the flow's own triggers. A trigger among the
 * start nodes stands for "everything after this trigger".
 */
export function buildSequenceFlow(flow: FlowGraph, startNodeIds: readonly string[]): FlowGraph {
  const byId = new Map(flow.nodes.map((node) => [node.id, node]));
  const entryTargets = [
    ...new Set(
      startNodeIds.flatMap((id) =>
        byId.get(id)?.type === 'trigger'
          ? flow.edges.filter((e) => e.source === id).map((e) => e.target)
          : [id]
      )
    ),
  ];
  const keep = reachableFrom(flow, entryTargets);
  const nodes: FlowNode[] = flow.nodes.filter(
    (node) => keep.has(node.id) && node.type !== 'trigger'
  );
  const edges: FlowEdge[] = flow.edges.filter(
    (edge) => keep.has(edge.source) && keep.has(edge.target)
  );
  const entry: FlowNode = {
    id: SEQUENCE_ENTRY_ID,
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: { trigger: 'event', event_type: 'flode_sequence_entry' },
  };
  return {
    ...flow,
    nodes: [entry, ...nodes],
    edges: [
      ...entryTargets.map((target) => ({
        id: `${SEQUENCE_ENTRY_ID}->${target}`,
        source: SEQUENCE_ENTRY_ID,
        target,
      })),
      ...edges,
    ],
  };
}

function asSteps(value: unknown): Record<string, unknown>[] {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return list.filter(isPlainObject);
}

/**
 * Turns (part of) a flow into a plain HA action sequence — what a script's
 * `sequence:` or the WebSocket `execute_script` command runs. Uses the
 * regular strategies on `buildSequenceFlow`'s sub-flow, then unwraps the
 * automation: its top-level conditions become condition steps (a false one
 * stops the sequence, just like in an automation) and its variables a
 * leading `variables:` step.
 */
export function transpileSequence(
  transpiler: FlowTranspiler,
  flow: FlowGraph,
  startNodeIds: readonly string[],
  options: YamlOptions = {}
): SequenceResult {
  const result = transpiler.transpile(buildSequenceFlow(flow, startNodeIds), options);
  const automation = result.output?.automation;
  if (!result.success || !automation) {
    return {
      success: false,
      errors: result.errors ?? ['Transpilation failed'],
      warnings: result.warnings,
      usesTriggerData: false,
    };
  }

  const variables = {
    ...(flow.userVariables ?? {}),
    ...(isPlainObject(automation.variables) ? automation.variables : {}),
  };
  const sequence = [
    ...(Object.keys(variables).length > 0 ? [{ variables }] : []),
    ...asSteps(automation.conditions ?? automation.condition),
    ...asSteps(automation.actions ?? automation.action),
  ];
  return {
    success: true,
    sequence,
    warnings: result.warnings,
    usesTriggerData: /\btrigger\./.test(JSON.stringify(sequence)),
  };
}
