import {
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  isScriptStart,
  NodeSchema,
} from '@flode/shared';

/**
 * The canvas' document: an immutable FlowGraph plus pure edit operations.
 * Everything here is framework-free — the Lit elements only render it and
 * turn pointer input into these calls, so the editing rules are testable
 * without a DOM (and identical to what the transpiler receives).
 */

export type NodeType = FlowNode['type'];

/** Fixed card size the canvas renders (layout, handles and fit-view use it). */
export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 92;

/** Output handles per node type: conditions branch into yes/no. */
export function sourceHandles(type: NodeType): readonly (string | null)[] {
  return type === 'condition' ? ['true', 'false'] : [null];
}

/** Triggers start the flow — nothing connects into them. */
export function hasTargetHandle(type: NodeType): boolean {
  return type !== 'trigger';
}

export function moveNode(graph: FlowGraph, id: string, x: number, y: number): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)),
  };
}

export interface ConnectRequest {
  source: string;
  sourceHandle: string | null;
  target: string;
}

/** Why a connection is refused (`null` = allowed). */
export function connectionError(graph: FlowGraph, request: ConnectRequest): string | null {
  if (request.source === request.target) return 'self';
  const target = graph.nodes.find((n) => n.id === request.target);
  const source = graph.nodes.find((n) => n.id === request.source);
  if (!source || !target) return 'missing';
  if (!hasTargetHandle(target.type)) return 'trigger-target';
  const duplicate = graph.edges.some(
    (e) =>
      e.source === request.source &&
      e.target === request.target &&
      (e.sourceHandle ?? null) === request.sourceHandle
  );
  return duplicate ? 'duplicate' : null;
}

export function connect(graph: FlowGraph, request: ConnectRequest): FlowGraph {
  if (connectionError(graph, request) !== null) return graph;
  const handle = request.sourceHandle;
  const edge: FlowEdge = {
    id: `e-${request.source}${handle ? `-${handle}` : ''}-${request.target}`,
    source: request.source,
    target: request.target,
    ...(handle ? { sourceHandle: handle } : {}),
  };
  return { ...graph, edges: [...graph.edges, edge] };
}

export function removeNode(graph: FlowGraph, id: string): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
  };
}

export function removeEdge(graph: FlowGraph, id: string): FlowGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== id) };
}

/**
 * Replaces a node's data, validated against the node schema — invalid data
 * (e.g. edited in the YAML field) is refused with the schema's message.
 */
export function updateNodeData(
  graph: FlowGraph,
  id: string,
  data: unknown
): { graph: FlowGraph; error: string | null } {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return { graph, error: 'missing' };
  // HA's editors echo value-changed when they first render — an identical
  // payload must not become an undo step or mark the flow unsaved.
  if (deepEqual(node.data, data)) return { graph, error: null };
  const parsed = NodeSchema.safeParse({ ...node, data });
  if (!parsed.success) return { graph, error: parsed.error.issues[0]?.message ?? 'invalid' };
  return {
    graph: { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? parsed.data : n)) },
    error: null,
  };
}

/** A copy of `node` (new id, no connections) next to where it was, or at `at` — duplicate and paste. */
export function copyNode(
  graph: FlowGraph,
  node: FlowNode,
  at?: { x: number; y: number }
): { graph: FlowGraph; id: string } {
  const position = freePosition(graph, at ?? { x: node.position.x + 40, y: node.position.y + 40 });
  return addNode(
    graph,
    node.type,
    position,
    `${node.type}_${Date.now().toString(36)}`,
    structuredClone(node.data)
  );
}

/** Removes every connection of a card (the card stays). */
export function disconnectNode(graph: FlowGraph, id: string): FlowGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.source !== id && e.target !== id) };
}

/** HA's `enabled: false` on a step — toggled; enabled is the default, so it's just removed. */
export function toggleNodeEnabled(graph: FlowGraph, id: string): FlowGraph {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return graph;
  const data: Record<string, unknown> = { ...node.data };
  if (data.enabled === false) delete data.enabled;
  else data.enabled = false;
  return updateNodeData(graph, id, data).graph;
}

/**
 * Replace a node's type and data (HA's editor can turn e.g. a service call
 * into a device action). Edges stay; an invalid step is reported, not applied.
 */
export function setNodeStep(
  graph: FlowGraph,
  id: string,
  type: NodeType,
  data: Record<string, unknown>
): { graph: FlowGraph; error: string | null } {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return { graph, error: 'missing' };
  if (node.type === type) return updateNodeData(graph, id, data);
  const parsed = NodeSchema.safeParse({ ...node, type, data });
  if (!parsed.success) return { graph, error: parsed.error.issues[0]?.message ?? 'invalid' };
  return {
    graph: { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? parsed.data : n)) },
    error: null,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  // A key holding `undefined` is the same as no key (HA's editors send such keys; JSON drops them).
  const defined = (o: object) =>
    Object.entries(o)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
  const ka = defined(a);
  const kb = defined(b);
  return (
    ka.length === kb.length &&
    ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rectangle around every node (for fit-view). */
export function graphBounds(graph: FlowGraph): Bounds {
  if (graph.nodes.length === 0) return { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT };
  const xs = graph.nodes.map((n) => n.position.x);
  const ys = graph.nodes.map((n) => n.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) + NODE_WIDTH - minX,
    height: Math.max(...ys) + NODE_HEIGHT - minY,
  };
}

/** The smallest box around both. */
export function unionBounds(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** Anchor points of a node's handles in flow coordinates. */
export function handlePosition(
  node: FlowNode,
  side: 'source' | 'target',
  handle: string | null = null
): { x: number; y: number } {
  if (side === 'target') return { x: node.position.x, y: node.position.y + NODE_HEIGHT / 2 };
  const handles = sourceHandles(node.type);
  const index = Math.max(0, handles.indexOf(handle));
  const step = NODE_HEIGHT / (handles.length + 1);
  return { x: node.position.x + NODE_WIDTH, y: node.position.y + step * (index + 1) };
}

/** Edge types that are drawn (visual hints the transpiler adds are skipped). */
export function isDrawnEdge(edge: FlowEdge): boolean {
  return edge.type !== 'hint' && edge.type !== 'choose-hint';
}

/** Starting data per type — the smallest config the node schema accepts. */
const DEFAULT_DATA: Record<NodeType, Record<string, unknown>> = {
  trigger: { trigger: 'state', entity_id: '' },
  condition: { condition: 'state', entity_id: '', state: '' },
  action: { service: 'light.turn_on' },
  delay: { delay: '00:00:05' },
  wait: { wait_template: '' },
  set_variables: { variables: {} },
};

export const NODE_TYPES: readonly NodeType[] = [
  'trigger',
  'condition',
  'action',
  'delay',
  'wait',
  'set_variables',
];

/** Adds a node of `type` at `position` (snapped); returns the new graph and the node's id. */
export function addNode(
  graph: FlowGraph,
  type: NodeType,
  position: { x: number; y: number },
  id = `${type}_${Date.now().toString(36)}`,
  data: Record<string, unknown> = DEFAULT_DATA[type]
): { graph: FlowGraph; id: string } {
  const parsed = NodeSchema.safeParse({ id, type, position, data });
  if (!parsed.success) return { graph, id };
  return { graph: { ...graph, nodes: [...graph.nodes, parsed.data] }, id };
}

/** `position`, moved down until the card overlaps no other card. */
export function freePosition(
  graph: FlowGraph,
  position: { x: number; y: number }
): { x: number; y: number } {
  const overlaps = (p: { x: number; y: number }) =>
    graph.nodes.some(
      (n) => Math.abs(n.position.x - p.x) < NODE_WIDTH && Math.abs(n.position.y - p.y) < NODE_HEIGHT
    );
  let next = position;
  while (overlaps(next)) next = { x: next.x, y: next.y + NODE_HEIGHT + 40 };
  return next;
}

// ---- scripts: the start node exists for the transpiler but is never shown ---------

/** The script's start node (it carries the `fields`), if this flow is a script. */
export function scriptStartId(graph: FlowGraph): string | undefined {
  return graph.nodes.find((node) => isScriptStart(node.data))?.id;
}

/** What the canvas shows: a script without its start node (like HA — a script begins with its first action). */
export function visibleGraph(graph: FlowGraph): FlowGraph {
  const startId = scriptStartId(graph);
  if (!startId) return graph;
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== startId),
    edges: graph.edges.filter((edge) => edge.source !== startId && edge.target !== startId),
  };
}

/** The cards a script begins with (what its hidden start leads to). */
export function scriptEntryIds(graph: FlowGraph): Set<string> {
  const startId = scriptStartId(graph);
  return new Set(
    startId ? graph.edges.filter((edge) => edge.source === startId).map((edge) => edge.target) : []
  );
}

/**
 * Keeps a script startable: when its start leads nowhere (new script, first
 * card deleted), the left-most card without a predecessor becomes the beginning.
 */
export function ensureScriptEntry(graph: FlowGraph): FlowGraph {
  const startId = scriptStartId(graph);
  if (!startId || graph.edges.some((edge) => edge.source === startId)) return graph;
  const hasPredecessor = new Set(graph.edges.map((edge) => edge.target));
  const first = graph.nodes
    .filter((node) => node.id !== startId && !hasPredecessor.has(node.id))
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)[0];
  return first ? connect(graph, { source: startId, sourceHandle: null, target: first.id }) : graph;
}
