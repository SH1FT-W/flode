import { type FlowGraph, isScriptStart, type NodeValidationError } from '@flode/shared';
import { validateFlowGraph } from '@flode/transpiler';

export type FlowIssueKind =
  | 'field' // a node's own field validation (entity missing, …)
  | 'orphaned' // not reachable from any trigger
  | 'conditionNoEdges' // condition with no outgoing connection
  | 'invalidService' // action service not "domain.service"
  | 'noTrigger'
  | 'noAction'
  | 'scriptTrigger' // a real trigger inside a script
  | 'scriptStartCount' // a script needs exactly one start node
  | 'scriptStartInAutomation'
  | 'other'; // anything else the engine reports (message passed through)

export interface FlowIssue {
  /** Stable key for lists. */
  id: string;
  kind: FlowIssueKind;
  /** Node the issue belongs to — clicking the issue jumps there. */
  nodeId?: string;
  /** i18n key (field issues) or raw engine message (`other`). */
  message?: string;
  /** Extra detail, e.g. the invalid service name. */
  detail?: string;
}

function nodeIdFromPath(path: string[] | undefined): string | undefined {
  return path && path[0] === 'nodes' ? path[1] : undefined;
}

/** Script/automation mix-ups: triggers in a script, script starts in an automation. */
function scriptIssues(graph: FlowGraph): FlowIssue[] {
  const triggers = graph.nodes.filter((n) => n.type === 'trigger');
  const starts = triggers.filter((n) => isScriptStart(n.data));
  if (graph.metadata?.kind !== 'script') {
    return starts.map((n) => ({
      id: `scriptStartInAutomation:${n.id}`,
      kind: 'scriptStartInAutomation',
      nodeId: n.id,
    }));
  }
  return [
    ...triggers
      .filter((n) => !isScriptStart(n.data))
      .map(
        (n): FlowIssue => ({ id: `scriptTrigger:${n.id}`, kind: 'scriptTrigger', nodeId: n.id })
      ),
    ...(triggers.length > 0 && starts.length !== 1
      ? [{ id: 'scriptStartCount', kind: 'scriptStartCount' } satisfies FlowIssue]
      : []),
  ];
}

/**
 * Everything that currently prevents saving, in one list: per-node field
 * validation plus the engine's structural checks (the same `validateFlowGraph`
 * the save path runs). Pure, so it's unit-testable; translation and node
 * labels are added by the UI (`useFlowIssues`).
 */
export function computeFlowIssues(
  graph: FlowGraph,
  nodeErrors: ReadonlyMap<string, NodeValidationError[]>
): FlowIssue[] {
  if (graph.nodes.length === 0) return [];
  const issues: FlowIssue[] = [];

  for (const [nodeId, errors] of nodeErrors) {
    errors.forEach((error, index) => {
      issues.push({
        id: `field:${nodeId}:${index}`,
        kind: 'field',
        nodeId,
        message: error.message,
      });
    });
  }

  if (!graph.nodes.some((n) => n.type === 'trigger')) {
    issues.push({ id: 'noTrigger', kind: 'noTrigger' });
  }
  issues.push(...scriptIssues(graph));
  if (!graph.nodes.some((n) => n.type === 'action')) {
    issues.push({ id: 'noAction', kind: 'noAction' });
  }

  const validation = validateFlowGraph(graph);
  validation.errors.forEach((error, index) => {
    const nodeId = nodeIdFromPath(error.path);
    switch (error.code) {
      case 'ORPHANED_NODE':
        issues.push({ id: `orphaned:${nodeId}`, kind: 'orphaned', nodeId });
        break;
      case 'CONDITION_NO_EDGES':
        issues.push({ id: `noEdges:${nodeId}`, kind: 'conditionNoEdges', nodeId });
        break;
      case 'INVALID_SERVICE': {
        const node = graph.nodes.find((n) => n.id === nodeId);
        const service =
          node?.type === 'action' && typeof node.data.service === 'string' ? node.data.service : '';
        issues.push({ id: `service:${nodeId}`, kind: 'invalidService', nodeId, detail: service });
        break;
      }
      default:
        // "at least one trigger" is already covered by noTrigger above
        if (error.message.includes('at least one trigger')) break;
        issues.push({ id: `other:${index}`, kind: 'other', nodeId, message: error.message });
    }
  });

  return issues;
}
