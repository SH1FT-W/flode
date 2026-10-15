import {
  axisOf,
  type FlowDirection,
  type FlowEdge,
  type FlowNode,
  LAYER_GAP,
  NODE_GAP,
} from '@flode/shared';
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

/**
 * The cards in the order the flow reads them: each one's followers right after
 * it, a condition's Yes before its No. Top to bottom ELK keeps cards side by
 * side in this order, so Yes stays left of No and their lines don't cross.
 */
function flowOrder(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rank = (edge: FlowEdge) => (edge.sourceHandle === 'false' ? 1 : 0);
  const ordered: FlowNode[] = [];
  const seen = new Set<string>();
  const visit = (node: FlowNode | undefined) => {
    if (!node || seen.has(node.id)) return;
    seen.add(node.id);
    ordered.push(node);
    const next = edges.filter((e) => e.source === node.id).sort((a, b) => rank(a) - rank(b));
    for (const edge of next) visit(byId.get(edge.target));
  };
  for (const node of nodes) visit(node);
  return ordered;
}

/**
 * Apply heuristic layout to nodes when metadata is missing
 * Uses ELK (Eclipse Layout Kernel) for automatic graph layout
 */
export async function applyHeuristicLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  /**
   * Real rendered node sizes by node id (the canvas's card size), used
   * instead of the per-type estimates when present — lets the editor's
   * "tidy up" command lay out the cards as they actually render. Import
   * (YamlParser) never passes it, so its layout is unchanged.
   */
  measuredSizes?: Record<string, { width: number; height: number }>,
  /** Left to right (import, default) or top to bottom (#29). */
  direction: FlowDirection = 'right'
): Promise<FlowNode[]> {
  try {
    // Convert to ELK graph format
    const elkNodes = (direction === 'down' ? flowOrder(nodes, edges) : nodes).map((node) => {
      const measured = measuredSizes?.[node.id];
      // biome-ignore lint/suspicious/noExplicitAny: ELK types are loose
      const elkNode: any = {
        id: node.id,
        width: measured?.width ?? getNodeWidth(node.type),
        height: measured?.height ?? getNodeHeight(node.type),
      };
      // Give condition nodes fixed ports so ELK knows where Yes and No leave and can
      // route edges without crossing them (left to right: true=top, false=bottom).
      if (node.type === 'condition' && direction === 'down') {
        // Top to bottom, Yes leaves below the card's middle and No at five sixths of its
        // width (as the canvas draws them), so a chain of conditions stays in one line.
        // Fixed ports need the input too, top middle — ELK would take the top left corner.
        elkNode.layoutOptions = { 'elk.portConstraints': 'FIXED_POS' };
        elkNode.ports = [
          { id: `${node.id}__in`, x: elkNode.width / 2, y: 0, width: 0, height: 0, side: 'NORTH' },
          { id: `${node.id}__true`, x: elkNode.width / 2, y: elkNode.height, width: 0, height: 0 },
          {
            id: `${node.id}__false`,
            x: (elkNode.width * 5) / 6,
            y: elkNode.height,
            width: 0,
            height: 0,
          },
        ].map(({ side = 'SOUTH', ...port }) => ({ ...port, properties: { 'port.side': side } }));
      } else if (node.type === 'condition') {
        elkNode.layoutOptions = { 'elk.portConstraints': 'FIXED_ORDER' };
        elkNode.ports = [
          { id: `${node.id}__true`, properties: { 'port.side': 'EAST', 'port.index': '0' } },
          { id: `${node.id}__false`, properties: { 'port.side': 'EAST', 'port.index': '1' } },
        ];
      }
      return elkNode;
    });

    // Conditions laid out top to bottom take their lines in at a port of their own.
    const fixedInput = new Set(
      direction === 'down' ? nodes.filter((n) => n.type === 'condition').map((n) => n.id) : []
    );
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
        if (fixedInput.has(edge.target)) elkEdge.targets = [`${edge.target}__in`];
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
        'elk.direction': direction === 'down' ? 'DOWN' : 'RIGHT',
        'elk.spacing.nodeNode': String(NODE_GAP),
        // "Tidy up" (measured sizes): unconnected parts would otherwise pack
        // with ELK's 20px default. Import keeps its layout unchanged.
        ...(measuredSizes ? { 'elk.spacing.componentComponent': String(NODE_GAP) } : {}),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_GAP[direction]),
        'elk.spacing.edgeNode': '30',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        // Top to bottom, cards side by side read left to right in the flow's own order
        // (first trigger left); left to right ELK keeps its usual crossing minimisation.
        ...(direction === 'down'
          ? {
              'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
              'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
              // Its final swapping pass would turn the order round again at conditions' fixed ports.
              'elk.layered.crossingMinimization.greedySwitch.type': 'OFF',
            }
          : {}),
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
    const afterChain = fixChooseChainLayout(positionedNodes, edges, direction);
    const laidOut = fixChooseDefaultLayout(afterChain, edges, direction);
    return direction === 'down' ? wrapTriggerRow(laidOut, elkNodes) : laidOut;
  } catch (_error) {
    // Fallback to simple grid layout if ELK fails
    return applyFallbackLayout(nodes);
  }
}

/** Top to bottom, at most this many triggers side by side — more wrap into further rows. */
const TRIGGERS_PER_ROW = 4;

/**
 * Top to bottom, many triggers would make one row far wider than the screen:
 * they wrap into rows of `TRIGGERS_PER_ROW` around the same middle, and
 * everything below moves down to make room (#29).
 */
function wrapTriggerRow(
  nodes: FlowNode[],
  sizes: readonly { id: string; width: number; height: number }[]
): FlowNode[] {
  // The row ELK put first — a trigger it placed further down stays where it is.
  const first = Math.min(...nodes.filter((n) => n.type === 'trigger').map((n) => n.position.y));
  const triggers = nodes
    .filter((n) => n.type === 'trigger' && n.position.y === first)
    .sort((a, b) => a.position.x - b.position.x);
  if (triggers.length <= TRIGGERS_PER_ROW) return nodes;
  const size = (id: string) => sizes.find((s) => s.id === id) ?? DEFAULT_NODE_SIZE;
  const width = Math.max(...triggers.map((n) => size(n.id).width));
  const height = Math.max(...triggers.map((n) => size(n.id).height));
  const left = Math.min(...triggers.map((n) => n.position.x));
  const middle = (left + Math.max(...triggers.map((n) => n.position.x)) + width) / 2;
  const rows = Math.ceil(triggers.length / TRIGGERS_PER_ROW);
  const down = (rows - 1) * (height + LAYER_GAP.down);
  const placed = new Map(
    triggers.map((node, i) => {
      const row = Math.floor(i / TRIGGERS_PER_ROW);
      const inRow = Math.min(TRIGGERS_PER_ROW, triggers.length - row * TRIGGERS_PER_ROW);
      const rowWidth = inRow * width + (inRow - 1) * NODE_GAP;
      const column = i % TRIGGERS_PER_ROW;
      return [
        node.id,
        {
          x: middle - rowWidth / 2 + column * (width + NODE_GAP),
          y: first + row * (height + LAYER_GAP.down),
        },
      ];
    })
  );
  return nodes.map((node) => ({
    ...node,
    position: placed.get(node.id) ?? { x: node.position.x, y: node.position.y + down },
  }));
}

/**
 * The axis cases stack along — across the flow (`Axis` from @flode/shared):
 * below each other left to right, beside each other top to bottom.
 */
function stackAxis(direction: FlowDirection) {
  const axis = axisOf(direction);
  return {
    /** Where a card starts on the stacking axis, and how far it reaches along it. */
    start: (p: { x: number; y: number }) => axis.cross(p),
    size: (type: string) =>
      axis.breadth({ width: getNodeWidth(type), height: getNodeHeight(type) }),
    /** The move that puts `target` at `start` on the stacking axis, level with `level` on the other. */
    move: (
      level: { x: number; y: number },
      target: { x: number; y: number },
      start: number
    ): { dx: number; dy: number } => {
      const to = axis.at(axis.main(level), start);
      return { dx: to.x - target.x, dy: to.y - target.y };
    },
  };
}

/** Where the subtree of `id` ends on the stacking axis. */
function subtreeEnd(
  id: string,
  subtree: ReadonlySet<string>,
  posMap: ReadonlyMap<string, { x: number; y: number }>,
  types: ReadonlyMap<string, string>,
  axis: ReturnType<typeof stackAxis>
): number {
  let end = Number.NEGATIVE_INFINITY;
  for (const node of [id, ...subtree]) {
    const pos = posMap.get(node);
    if (pos) end = Math.max(end, axis.start(pos) + axis.size(types.get(node) ?? 'action'));
  }
  return end;
}

/**
 * Post-process positions to vertically stack choose-chain cases.
 * ELK excludes choose-chain edges, so case 2+ nodes are placed at (0,0) as
 * isolated components. This function aligns them with their predecessor
 * case and places them below it (beside it when the flow runs top to bottom).
 */
export function fixChooseChainLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: FlowDirection = 'right'
): FlowNode[] {
  const chooseChainEdges = edges.filter((e) => e.type === 'choose-chain');
  if (chooseChainEdges.length === 0) return nodes;

  const posMap = new Map(nodes.map((n) => [n.id, { ...n.position }]));
  const nodeTypeMap = new Map(nodes.map((n) => [n.id, n.type ?? 'action']));
  const axis = stackAxis(direction);

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

      // Where the source case's subtree ends on the stacking axis (current posMap values)
      const sourceSubtreeIds = getSubtreeIds(sourceId, edges);
      const stackEnd = subtreeEnd(sourceId, sourceSubtreeIds, posMap, nodeTypeMap, axis);

      // Shift target's subtree, but NOT nodes shared with the source subtree
      // (those are post-choose actions already correctly positioned by ELK)
      const targetSubtreeIds = getSubtreeIds(targetId, edges);
      const toShift = [...targetSubtreeIds].filter((id) => !sourceSubtreeIds.has(id));

      const { dx, dy } = axis.move(sourcePos, targetPos, stackEnd + NODE_GAP);

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
 * This function places it below (top to bottom: beside) the last case's subtree, aligned
 * with the last case's source condition node.
 */
export function fixChooseDefaultLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: FlowDirection = 'right'
): FlowNode[] {
  const chooseDefaultEdges = edges.filter((e) => e.type === 'choose-default');
  if (chooseDefaultEdges.length === 0) return nodes;

  const posMap = new Map(nodes.map((n) => [n.id, { ...n.position }]));
  const nodeTypeMap = new Map(nodes.map((n) => [n.id, n.type ?? 'action']));
  const axis = stackAxis(direction);

  for (const edge of chooseDefaultEdges) {
    const sourcePos = posMap.get(edge.source);
    if (!sourcePos) continue;

    // Where the source case's subtree ends on the stacking axis
    const subtreeIds = getSubtreeIds(edge.source, edges);
    const stackEnd = subtreeEnd(edge.source, subtreeIds, posMap, nodeTypeMap, axis);

    // Place the default subtree after the source case on the stacking axis, aligned on the other
    const defaultSubtreeIds = getSubtreeIds(edge.target, edges);
    const defaultTargetPos = posMap.get(edge.target);
    if (!defaultTargetPos) continue;

    const { dx, dy } = axis.move(sourcePos, defaultTargetPos, stackEnd + NODE_GAP);

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
 * Estimated rendered size per node type — matches the FLODE 2.0 node cards
 * (components/nodes/NodeCard.tsx: 260px wide; height depends on the detail
 * line and live-state chip). Used when no real measurements are passed in.
 */
const NODE_SIZE_ESTIMATES: Record<string, { width: number; height: number }> = {
  trigger: { width: 260, height: 100 },
  condition: { width: 260, height: 110 },
  action: { width: 260, height: 100 },
  delay: { width: 260, height: 72 },
  wait: { width: 260, height: 90 },
  set_variables: { width: 260, height: 90 },
};
const DEFAULT_NODE_SIZE = { width: 260, height: 100 };

function getNodeWidth(type: string): number {
  return (NODE_SIZE_ESTIMATES[type] ?? DEFAULT_NODE_SIZE).width;
}

function getNodeHeight(type: string): number {
  return (NODE_SIZE_ESTIMATES[type] ?? DEFAULT_NODE_SIZE).height;
}
