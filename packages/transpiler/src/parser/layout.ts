import type { FlowEdge, FlowNode } from '@flode/shared';
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

/**
 * Apply heuristic layout to nodes when metadata is missing
 * Uses ELK (Eclipse Layout Kernel) for automatic graph layout
 */
export async function applyHeuristicLayout(
  nodes: FlowNode[],
  edges: FlowEdge[]
): Promise<FlowNode[]> {
  try {
    // Convert to ELK graph format
    const elkNodes = nodes.map((node) => {
      // biome-ignore lint/suspicious/noExplicitAny: ELK types are loose
      const elkNode: any = {
        id: node.id,
        width: getNodeWidth(node.type),
        height: getNodeHeight(node.type),
      };
      // Give condition nodes fixed-order ports so ELK knows true=top, false=bottom
      // and can route edges without crossing them.
      if (node.type === 'condition') {
        elkNode.layoutOptions = { 'elk.portConstraints': 'FIXED_ORDER' };
        elkNode.ports = [
          { id: `${node.id}__true`, properties: { 'port.side': 'EAST', 'port.index': '0' } },
          { id: `${node.id}__false`, properties: { 'port.side': 'EAST', 'port.index': '1' } },
        ];
      }
      return elkNode;
    });

    const elkEdges = edges
      .filter(
        (edge) =>
          edge.type !== 'choose-chain' &&
          edge.type !== 'choose-default' &&
          edge.type !== 'loop-back'
      )
      .map((edge) => {
        // biome-ignore lint/suspicious/noExplicitAny: ELK types are loose
        const elkEdge: any = {
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target],
        };
        // Wire edges from condition nodes to their port so ELK respects ordering
        if (edge.sourceHandle === 'true') {
          elkEdge.sources = [`${edge.source}__true`];
        } else if (edge.sourceHandle === 'false') {
          elkEdge.sources = [`${edge.source}__false`];
        }
        return elkEdge;
      });

    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '60',
        'elk.layered.spacing.nodeNodeBetweenLayers': '120',
        'elk.spacing.edgeNode': '30',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.padding': '[top=40, left=40, bottom=40, right=40]',
      },
      children: elkNodes,
      edges: elkEdges,
    };

    // Compute layout
    const layout = await elk.layout(graph);

    // Apply computed positions back to nodes
    const positionedNodes = nodes.map((node) => {
      const elkNode = layout.children?.find((n) => n.id === node.id);
      if (elkNode && elkNode.x !== undefined && elkNode.y !== undefined) {
        return {
          ...node,
          position: {
            x: elkNode.x,
            y: elkNode.y,
          },
        };
      }
      return node;
    });

    // choose-hint edges help ELK place case 2+ nodes correctly when the choose entry
    // is a condition node. For trigger-entry automations (no choose-hint), fixChooseChainLayout
    // aligns cases vertically as a fallback.
    const afterChain = fixChooseChainLayout(positionedNodes, edges);
    return fixChooseDefaultLayout(afterChain, edges);
  } catch (_error) {
    // Fallback to simple grid layout if ELK fails
    return applyFallbackLayout(nodes);
  }
}

/**
 * Post-process positions to vertically stack choose-chain cases.
 * ELK excludes choose-chain edges, so case 2+ nodes are placed at (0,0) as
 * isolated components. This function aligns them horizontally with their
 * predecessor case and places them below it.
 */
export function fixChooseChainLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const chooseChainEdges = edges.filter((e) => e.type === 'choose-chain');
  if (chooseChainEdges.length === 0) return nodes;

  const posMap = new Map(nodes.map((n) => [n.id, { ...n.position }]));
  const nodeTypeMap = new Map(nodes.map((n) => [n.id, n.type ?? 'action']));

  // Build traversal maps
  const ccBySource = new Map(chooseChainEdges.map((e) => [e.source, e]));
  const ccTargetIds = new Set(chooseChainEdges.map((e) => e.target));

  // Process each chain starting from the first case (source not targeted by any choose-chain)
  const chainStarters = chooseChainEdges.filter((e) => !ccTargetIds.has(e.source));

  for (const starter of chainStarters) {
    let currentEdge: (typeof chooseChainEdges)[number] | undefined = starter;

    while (currentEdge) {
      const { source: sourceId, target: targetId } = currentEdge;

      const sourcePos = posMap.get(sourceId);
      const targetPos = posMap.get(targetId);
      if (!sourcePos || !targetPos) {
        currentEdge = ccBySource.get(targetId);
        continue;
      }

      // Compute the bottom edge of the source case's subtree (current posMap values)
      const sourceSubtreeIds = getSubtreeIds(sourceId, edges);
      let bottomY = sourcePos.y + getNodeHeight(nodeTypeMap.get(sourceId) ?? 'action');
      for (const id of sourceSubtreeIds) {
        const pos = posMap.get(id);
        if (pos) {
          bottomY = Math.max(bottomY, pos.y + getNodeHeight(nodeTypeMap.get(id) ?? 'action'));
        }
      }

      // Shift target's subtree, but NOT nodes shared with the source subtree
      // (those are post-choose actions already correctly positioned by ELK)
      const targetSubtreeIds = getSubtreeIds(targetId, edges);
      const toShift = [...targetSubtreeIds].filter((id) => !sourceSubtreeIds.has(id));

      const dx = sourcePos.x - targetPos.x;
      const dy = bottomY + 60 - targetPos.y;

      for (const id of toShift) {
        const pos = posMap.get(id);
        if (pos) posMap.set(id, { x: pos.x + dx, y: pos.y + dy });
      }

      currentEdge = ccBySource.get(targetId);
    }
  }

  return nodes.map((n) => ({ ...n, position: posMap.get(n.id) ?? n.position }));
}

/**
 * Post-process positions to place choose-default (Sonst/Otherwise) nodes.
 * ELK excludes choose-default edges, so the default node has no ELK position.
 * This function places it below the last case's subtree, aligned horizontally
 * with the last case's source condition node.
 */
export function fixChooseDefaultLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const chooseDefaultEdges = edges.filter((e) => e.type === 'choose-default');
  if (chooseDefaultEdges.length === 0) return nodes;

  const posMap = new Map(nodes.map((n) => [n.id, { ...n.position }]));
  const nodeTypeMap = new Map(nodes.map((n) => [n.id, n.type ?? 'action']));

  for (const edge of chooseDefaultEdges) {
    const sourcePos = posMap.get(edge.source);
    if (!sourcePos) continue;

    // Compute the bottom of the source case's subtree
    const subtreeIds = getSubtreeIds(edge.source, edges);
    let bottomY = sourcePos.y + getNodeHeight(nodeTypeMap.get(edge.source) ?? 'action');
    for (const id of subtreeIds) {
      const pos = posMap.get(id);
      if (pos) {
        bottomY = Math.max(bottomY, pos.y + getNodeHeight(nodeTypeMap.get(id) ?? 'action'));
      }
    }

    // Place the default subtree below the source case, aligned on X
    const defaultSubtreeIds = getSubtreeIds(edge.target, edges);
    const defaultTargetPos = posMap.get(edge.target);
    if (!defaultTargetPos) continue;

    const dx = sourcePos.x - defaultTargetPos.x;
    const dy = bottomY + 60 - defaultTargetPos.y;

    for (const id of [edge.target, ...defaultSubtreeIds]) {
      const pos = posMap.get(id);
      if (pos) posMap.set(id, { x: pos.x + dx, y: pos.y + dy });
    }
  }

  return nodes.map((n) => ({ ...n, position: posMap.get(n.id) ?? n.position }));
}

/**
 * Collect all node IDs reachable from startId following forward edges,
 * excluding choose-chain, loop-back, and hint edges so each case's
 * subtree stays independent.
 */
function getSubtreeIds(startId: string, edges: FlowEdge[]): Set<string> {
  const visited = new Set<string>();
  const stack = [startId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const edge of edges) {
      if (
        edge.source === id &&
        edge.type !== 'choose-chain' &&
        edge.type !== 'loop-back' &&
        edge.type !== 'hint'
      ) {
        stack.push(edge.target);
      }
    }
  }
  return visited;
}

/**
 * Synchronous version that returns nodes with placeholder positions
 * The actual layout will be computed asynchronously
 */
export function applyHeuristicLayoutSync(nodes: FlowNode[], _edges: FlowEdge[]): FlowNode[] {
  // Simple grid layout as fallback
  return applyFallbackLayout(nodes);
}

/**
 * Simple fallback layout when ELK is not available or fails
 */
function applyFallbackLayout(nodes: FlowNode[]): FlowNode[] {
  const x = 100;
  const y = 100;
  const columnWidth = 300;
  const rowHeight = 150;
  const nodesPerRow = 3;

  return nodes.map((node, index) => {
    const col = index % nodesPerRow;
    const row = Math.floor(index / nodesPerRow);

    return {
      ...node,
      position: {
        x: x + col * columnWidth,
        y: y + row * rowHeight,
      },
    };
  });
}

/**
 * Get standard width for node type
 */
function getNodeWidth(type: string): number {
  switch (type) {
    case 'trigger':
      return 200;
    case 'condition':
      return 220;
    case 'action':
      return 200;
    case 'delay':
      return 180;
    case 'wait':
      return 180;
    default:
      return 200;
  }
}

/**
 * Get standard height for node type
 */
function getNodeHeight(type: string): number {
  switch (type) {
    case 'trigger':
      return 80;
    case 'condition':
      return 100;
    case 'action':
      return 80;
    case 'delay':
      return 70;
    case 'wait':
      return 70;
    default:
      return 80;
  }
}
