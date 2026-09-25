import type { FlowEdge, FlowGraph, FlowMetadata, FlowNode, FlowWorkspace } from '@flode/shared';

export interface MergeAutomationSource {
  graph: FlowGraph;
  automationId: string;
  entityId: string;
  alias: string;
  importedAt?: string;
}

interface GraphBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function calculateBounds(nodes: FlowNode[]): GraphBounds {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, width: 0, height: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x);
    maxY = Math.max(maxY, node.position.y);
  }

  return {
    minX,
    minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function sanitizeSourcePrefix(input: string, index: number): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const base = normalized || `source_${index + 1}`;
  return `${base}_${index + 1}`;
}

function mergeUserVariables(
  sources: Array<{ prefix: string; variables?: Record<string, unknown> }>
): Record<string, unknown> | undefined {
  const mergedVariables: Record<string, unknown> = {};

  for (const source of sources) {
    if (!source.variables) {
      continue;
    }

    for (const [key, value] of Object.entries(source.variables)) {
      if (!(key in mergedVariables)) {
        mergedVariables[key] = value;
        continue;
      }

      if (JSON.stringify(mergedVariables[key]) === JSON.stringify(value)) {
        continue;
      }

      mergedVariables[`${source.prefix}__${key}`] = value;
    }
  }

  return Object.keys(mergedVariables).length > 0 ? mergedVariables : undefined;
}

/**
 * Each merged automation keeps reacting only to its own triggers: the
 * triggers get ids and a "triggered by" condition gates the automation's
 * steps (without it, every trigger would run every merged automation).
 */
function gateByTriggers(
  prefix: string,
  nodes: FlowNode[],
  edges: FlowEdge[]
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const triggers = nodes.filter((node) => node.type === 'trigger');
  const triggerIds = new Set(triggers.map((node) => node.id));
  const outgoing = edges.filter((edge) => triggerIds.has(edge.source));
  if (triggers.length === 0 || outgoing.length === 0) return { nodes, edges };

  const ids: string[] = [];
  const idNodes = nodes.map((node, index) => {
    if (node.type !== 'trigger') return node;
    const existing = 'id' in node.data ? node.data.id : undefined;
    const id = typeof existing === 'string' && existing ? existing : `${prefix}_${index + 1}`;
    ids.push(id);
    return { ...node, data: { ...node.data, id } };
  });
  const gateId = `${prefix}__trigger_gate`;
  const gate: FlowNode = {
    id: gateId,
    type: 'condition',
    position: {
      x: Math.max(...triggers.map((node) => node.position.x)) + 180,
      y: triggers.reduce((sum, node) => sum + node.position.y, 0) / triggers.length,
    },
    data: { condition: 'trigger', id: ids },
  };
  const targets = [...new Set(outgoing.map((edge) => edge.target))];
  return {
    nodes: [...idNodes, gate],
    edges: [
      ...edges.filter((edge) => !triggerIds.has(edge.source)),
      ...triggers.map((node) => ({
        id: `${node.id}__to_gate`,
        source: node.id,
        target: gateId,
      })),
      ...targets.map((target) => ({
        id: `${gateId}__${target}`,
        source: gateId,
        target,
        sourceHandle: 'true',
      })),
    ],
  };
}

export function mergeAutomationGraphs(sources: MergeAutomationSource[]): FlowGraph {
  if (sources.length < 2) {
    throw new Error('At least two automations are required for merge.');
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(sources.length)));
  const boundsPerSource = sources.map((source) => calculateBounds(source.graph.nodes));
  const maxWidth = Math.max(...boundsPerSource.map((bounds) => bounds.width), 0);
  const maxHeight = Math.max(...boundsPerSource.map((bounds) => bounds.height), 0);
  const cellWidth = maxWidth + 260;
  const cellHeight = maxHeight + 220;

  const mergedNodes: FlowNode[] = [];
  const mergedEdges: FlowEdge[] = [];
  const workspaceSources: FlowWorkspace['sources'] = [];
  const prefixedVariableSources: Array<{ prefix: string; variables?: Record<string, unknown> }> =
    [];

  sources.forEach((source, index) => {
    const prefix = sanitizeSourcePrefix(
      source.alias || source.automationId || source.entityId,
      index
    );
    const bounds = boundsPerSource[index];
    const col = index % columns;
    const row = Math.floor(index / columns);
    const offsetX = col * cellWidth;
    const offsetY = row * cellHeight;

    const nodeIdMap = new Map<string, string>();
    const sourceNodes: FlowNode[] = [];
    const sourceEdges: FlowEdge[] = [];

    for (const node of source.graph.nodes) {
      const nextNodeId = `${prefix}__${node.id}`;
      nodeIdMap.set(node.id, nextNodeId);
      sourceNodes.push({
        ...node,
        id: nextNodeId,
        position: {
          x: node.position.x - bounds.minX + offsetX,
          y: node.position.y - bounds.minY + offsetY,
        },
      });
    }

    for (const edge of source.graph.edges) {
      const sourceId = nodeIdMap.get(edge.source);
      const targetId = nodeIdMap.get(edge.target);
      if (!sourceId || !targetId) {
        continue;
      }

      sourceEdges.push({
        ...edge,
        id: `${prefix}__${edge.id}`,
        source: sourceId,
        target: targetId,
      });
    }

    const gated = gateByTriggers(prefix, sourceNodes, sourceEdges);
    mergedNodes.push(...gated.nodes);
    mergedEdges.push(...gated.edges);

    workspaceSources.push({
      automation_id: source.automationId,
      entity_id: source.entityId,
      alias: source.alias,
      node_prefix: prefix,
      imported_at: source.importedAt ?? new Date().toISOString(),
    });

    prefixedVariableSources.push({
      prefix,
      variables: source.graph.userVariables,
    });
  });

  const baseMetadata: FlowMetadata = {
    mode: 'single',
    initial_state: true,
    ...(sources[0]?.graph.metadata || {}),
  };

  return {
    id: crypto.randomUUID(),
    name: 'Merged Automation',
    description: `Merged from ${sources.length} automations`,
    nodes: mergedNodes,
    edges: mergedEdges,
    metadata: baseMetadata,
    version: 1,
    workspace: {
      mode: 'merged',
      sources: workspaceSources,
    },
    userVariables: mergeUserVariables(prefixedVariableSources),
  };
}
