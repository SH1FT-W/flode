import type { FlowGraph } from '@flode/shared';
import type { TopologyAnalysis } from '../analyzer/topology';

/**
 * Output format from a transpiler strategy
 */
export interface HAYamlOutput {
  /**
   * Generated automation config (for native strategy)
   */
  automation?: Record<string, unknown>;
  /**
   * Generated script config (for state machine strategy)
   */
  script?: Record<string, unknown>;
  /**
   * Warnings generated during transpilation
   */
  warnings: string[];
  /**
   * The strategy used for transpilation
   */
  strategy: string;
}

/**
 * The automation-level keys after `mode` that every strategy keeps from the
 * original automation — user variables, run limits, initial state, traces.
 */
export function buildAutomationSettings(flow: FlowGraph): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  // Preserve top-level variables from original YAML (round-trip)
  if (flow.userVariables && Object.keys(flow.userVariables).length > 0) {
    settings.variables = flow.userVariables;
  }
  if (flow.metadata?.max) {
    settings.max = flow.metadata.max;
  }
  if (flow.metadata?.max_exceeded) {
    settings.max_exceeded = flow.metadata.max_exceeded;
  }
  // Written whenever the automation has it — `true` also matters (on after every restart).
  if (typeof flow.metadata?.initial_state === 'boolean') {
    settings.initial_state = flow.metadata.initial_state;
  }
  if (flow.metadata?.trace) {
    settings.trace = flow.metadata.trace;
  }
  if (flow.userTriggerVariables && Object.keys(flow.userTriggerVariables).length > 0) {
    settings.trigger_variables = flow.userTriggerVariables;
  }
  return settings;
}

/**
 * Base interface for transpiler strategies
 */
export interface TranspilerStrategy {
  /**
   * Unique name for this strategy
   */
  readonly name: string;

  /**
   * Description of when this strategy should be used
   */
  readonly description: string;

  /**
   * Check if this strategy can handle the given topology
   */
  canHandle(analysis: TopologyAnalysis): boolean;

  /**
   * Generate Home Assistant YAML from a flow graph
   */
  generate(flow: FlowGraph, analysis: TopologyAnalysis): HAYamlOutput;
}

/**
 * Base class with common utility methods for strategies
 */
export abstract class BaseStrategy implements TranspilerStrategy {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract canHandle(analysis: TopologyAnalysis): boolean;
  abstract generate(flow: FlowGraph, analysis: TopologyAnalysis): HAYamlOutput;

  /**
   * Find the entry node(s) of a flow
   */
  protected findEntryNodes(flow: FlowGraph): string[] {
    const targetNodes = new Set(flow.edges.map((e) => e.target));
    return flow.nodes.filter((n) => !targetNodes.has(n.id)).map((n) => n.id);
  }

  /**
   * Get outgoing edges from a node
   */
  protected getOutgoingEdges(flow: FlowGraph, nodeId: string) {
    return flow.edges.filter((e) => e.source === nodeId);
  }

  /**
   * Get incoming edges to a node
   */
  protected getIncomingEdges(flow: FlowGraph, nodeId: string) {
    return flow.edges.filter((e) => e.target === nodeId);
  }

  /**
   * Get a node by ID
   */
  protected getNode(flow: FlowGraph, nodeId: string) {
    return flow.nodes.find((n) => n.id === nodeId);
  }
}
