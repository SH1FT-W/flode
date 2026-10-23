import {
  type Axis,
  axisOf,
  dropSupersededManualStart,
  type FlowEdge,
  type FlowGraph,
  type FlowMetadata,
  FlowMetadataSchema,
  type FlowNode,
  flowAxis,
  isFlowStart,
  LAYER_GAP,
  NODE_GAP,
  NodeSchema,
  uniqueId,
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
/** Top to bottom, a card's output names sit in a row at its bottom edge, above the outputs. */
export const PORT_ROW = 20;
/** Top to bottom, the input and output circles sit on the card's edge: their middle on it, like left to right. */
export const HANDLE_OUTSIDE = 6;
/** The default card's size in flow coordinates. */
export const CARD_SIZE = { width: NODE_WIDTH, height: NODE_HEIGHT } as const;

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

/** The connections leaving `source` at `handle` that carry the flow on (not hints or block internals). */
export function outgoing(graph: FlowGraph, source: string, handle: string | null): FlowEdge[] {
  return graph.edges.filter(
    (e) => e.source === source && (e.sourceHandle ?? null) === handle && isFlowEdge(e)
  );
}

/** The connections of the flow leading into `target`. */
export function incoming(graph: FlowGraph, target: string): FlowEdge[] {
  return graph.edges.filter((e) => e.target === target && isFlowEdge(e));
}

/**
 * Leads `source` at `handle` through the card `id`: whatever followed there
 * now follows `id` (a condition's yes), and `id` follows `source`. After a
 * trigger, every trigger leading to the same step goes through `id` too: it
 * comes after the triggers, not after just one of them.
 */
function rewireThrough(
  graph: FlowGraph,
  source: string,
  handle: string | null,
  id: string
): FlowGraph {
  const targets = new Set(outgoing(graph, source, handle).map((e) => e.target));
  const from = graph.nodes.find((n) => n.id === source);
  const sources =
    from?.type === 'trigger'
      ? graph.nodes
          .filter((n) => n.type === 'trigger')
          .filter((n) => outgoing(graph, n.id, null).some((e) => targets.has(e.target)))
          .map((n) => n.id)
      : [source];
  const replaced = graph.edges.filter(
    (e) =>
      sources.includes(e.source) &&
      (e.sourceHandle ?? null) === handle &&
      isFlowEdge(e) &&
      targets.has(e.target)
  );
  const card = graph.nodes.find((n) => n.id === id);
  const out = card ? (sourceHandles(card.type)[0] ?? null) : null;
  const rest: FlowGraph = { ...graph, edges: graph.edges.filter((e) => !replaced.includes(e)) };
  const into = sources.reduce(
    (g, from) => connect(g, { source: from, sourceHandle: handle, target: id }),
    rest
  );
  return [...targets].reduce(
    (g, target) => connect(g, { source: id, sourceHandle: out, target }),
    into
  );
}

/**
 * Puts the new card `id` between `source` (at `handle`) and what followed it:
 * the card takes the first follower's place, and everything further along the
 * flow from there moves one step on to make room. Nothing followed: just after it.
 */
export function insertBetween(
  graph: FlowGraph,
  source: string,
  handle: string | null,
  id: string
): FlowGraph {
  const followers = outgoing(graph, source, handle);
  const from = graph.nodes.find((n) => n.id === source);
  if (!from) return graph;
  if (followers.length === 0) return connect(graph, { source, sourceHandle: handle, target: id });
  const axis = flowAxis(graph);
  const moved = new Set(followers.map((e) => e.target));
  const queue = [...moved];
  for (let next = queue.shift(); next; next = queue.shift()) {
    for (const edge of graph.edges) {
      if (edge.source !== next || !isDrawnEdge(edge) || moved.has(edge.target)) continue;
      moved.add(edge.target);
      queue.push(edge.target);
    }
  }
  // A loop back to the start stays where it is.
  const ahead = (n: FlowNode) => axis.main(n.position) > axis.main(from.position);
  const along = (n: FlowNode) => n.id !== source && n.id !== id && moved.has(n.id) && ahead(n);
  const first = graph.nodes
    .filter((n) => followers.some((e) => e.target === n.id))
    .sort(byFlowOrder(axis))[0];
  // Into a loop back: the new card goes after the source, not onto the earlier card.
  const place =
    first && ahead(first)
      ? first.position
      : freePosition(graph, nextPosition(graph, from.position));
  const step = stepLength(axis);
  const nodes = graph.nodes.map((n) => {
    if (n.id === id) return { ...n, position: place };
    if (!along(n)) return n;
    return { ...n, position: axis.at(axis.main(n.position) + step, axis.cross(n.position)) };
  });
  return rewireThrough({ ...graph, nodes }, source, handle, id);
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

/** A copy of `node` (new id, no connections) next to where it was, or at `at` — paste. */
export function copyNode(
  graph: FlowGraph,
  node: FlowNode,
  at?: { x: number; y: number }
): { graph: FlowGraph; id: string } {
  const position = freePosition(graph, at ?? { x: node.position.x + 40, y: node.position.y + 40 });
  return addNode(graph, node.type, position, undefined, structuredClone(node.data));
}

/** A real connection of the flow (not a drawing aid like hints or loop-backs). */
function isFlowEdge(edge: FlowEdge): boolean {
  return edge.type === undefined || edge.type === 'default' || edge.type === 'deletable';
}

/**
 * ⌘D: a copy of `node` at `position`, right after it in the flow — like HA's
 * "Duplicate", which puts the copy behind the original: what followed the
 * card follows the copy (a condition's Yes path). A trigger's copy starts
 * the same steps as the original.
 */
export function duplicateNode(
  graph: FlowGraph,
  node: FlowNode,
  position: { x: number; y: number }
): { graph: FlowGraph; id: string } {
  const added = copyNode(graph, node, position);
  const { id } = added;
  if (added.graph === graph) return added;
  if (node.type === 'trigger') {
    const next = graph.edges
      .filter((e) => e.source === node.id && isFlowEdge(e))
      .reduce(
        (g, e) =>
          connect(g, { source: id, sourceHandle: e.sourceHandle ?? null, target: e.target }),
        added.graph
      );
    return { graph: next, id };
  }
  return {
    graph: rewireThrough(added.graph, node.id, sourceHandles(node.type)[0] ?? null, id),
    id,
  };
}

/** Removes every connection of a card (the card stays). */
export function disconnectNode(graph: FlowGraph, id: string): FlowGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.source !== id && e.target !== id) };
}

/** HA's `enabled: false` on a step — toggled; enabled is the default, so it's just removed. */
export function toggleNodeEnabled(graph: FlowGraph, id: string): FlowGraph {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) return graph;
  return updateNodeData(graph, id, withEnabledToggled(node.data)).graph;
}

/** HA's `enabled: false` switched: added to an active step, dropped from a disabled one. */
export function withEnabledToggled(data: Record<string, unknown>): Record<string, unknown> {
  const { enabled, ...rest } = data;
  return enabled === false ? rest : { ...rest, enabled: false };
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

/** Rectangle around every node (for fit-view); `height` = a card's drawn height when not the default. */
export function graphBounds(
  graph: FlowGraph,
  height: (node: FlowNode) => number = () => NODE_HEIGHT
): Bounds {
  if (graph.nodes.length === 0) return { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT };
  const xs = graph.nodes.map((n) => n.position.x);
  const minX = Math.min(...xs);
  const minY = Math.min(...graph.nodes.map((n) => n.position.y));
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) + NODE_WIDTH - minX,
    height: Math.max(...graph.nodes.map((n) => n.position.y + height(n))) - minY,
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

/**
 * Anchor points of a node's handles in flow coordinates: the input where the
 * flow comes in (left / top), the outputs spread over the opposite side.
 */
export function handlePosition(
  node: FlowNode,
  side: 'source' | 'target',
  handle: string | null = null,
  /** A card's own outputs and height when they differ from its type's (expanded HA blocks). */
  shape: { handles: readonly (string | null)[]; height: number } = {
    handles: sourceHandles(node.type),
    height: NODE_HEIGHT,
  },
  axis: Axis = axisOf('right')
): { x: number; y: number } {
  const { handles, height } = shape;
  const size = { width: NODE_WIDTH, height };
  const main = axis.main(node.position);
  const cross = axis.cross(node.position);
  if (side === 'target') {
    // Top to bottom the line ends at the input circle's edge, so its arrow stays visible.
    const before = axis.direction === 'down' ? HANDLE_OUTSIDE : 0;
    return axis.at(main - before, cross + axis.breadth(size) / 2);
  }
  const index = Math.max(0, handles.indexOf(handle));
  const offsets = outputOffsets(axis, handles, axis.breadth(size));
  return axis.at(main + axis.length(size), cross + (offsets[index] ?? 0));
}

/**
 * Where a card's outputs sit across it (from its left / top edge): spread
 * evenly — except top to bottom on a condition, where Yes runs straight on
 * below the card's middle and No branches off to the side, so a chain of
 * conditions stays in one line (#29).
 */
export function outputOffsets(
  axis: Axis,
  handles: readonly (string | null)[],
  breadth: number
): number[] {
  if (axis.direction === 'down' && handles[0] === 'true' && handles[1] === 'false') {
    return [breadth / 2, (breadth * 5) / 6];
  }
  const step = breadth / (handles.length + 1);
  return handles.map((_, index) => step * (index + 1));
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

/**
 * The id of a new card of `type`: the time in base 36, with a counter when a
 * card of the graph has that id already (several cards within one millisecond).
 */
export function newNodeId(graph: FlowGraph, type: NodeType): string {
  return uniqueId(`${type}_${Date.now().toString(36)}`, new Set(graph.nodes.map((n) => n.id)));
}

/** Adds a node of `type` at `position` (snapped); returns the new graph and the node's id. */
export function addNode(
  graph: FlowGraph,
  type: NodeType,
  position: { x: number; y: number },
  id?: string,
  data: Record<string, unknown> = DEFAULT_DATA[type]
): { graph: FlowGraph; id: string } {
  const nodeId = id ?? newNodeId(graph, type);
  const parsed = NodeSchema.safeParse({ id: nodeId, type, position, data });
  if (!parsed.success) return { graph, id: nodeId };
  return { graph: { ...graph, nodes: [...graph.nodes, parsed.data] }, id: nodeId };
}

/** `position`, moved across the flow (down, or right when it runs top to bottom) until the card overlaps no other card. */
export function freePosition(
  graph: FlowGraph,
  position: { x: number; y: number }
): { x: number; y: number } {
  const axis = flowAxis(graph);
  // Top to bottom, a condition or block card is a row of output names taller.
  const tallest = NODE_HEIGHT + (axis.direction === 'down' ? PORT_ROW : 0);
  const overlaps = (p: { x: number; y: number }) =>
    graph.nodes.some(
      (n) => Math.abs(n.position.x - p.x) < NODE_WIDTH && Math.abs(n.position.y - p.y) < tallest
    );
  let next = position;
  while (overlaps(next)) {
    next = axis.at(axis.main(next), axis.cross(next) + axis.breadth(CARD_SIZE) + 40);
  }
  return next;
}

/** Where a card goes whose input should be at `point` (a drop, a "+"). */
export function cardAtInput(axis: Axis, point: { x: number; y: number }): { x: number; y: number } {
  return axis.at(axis.main(point), axis.cross(point) - axis.breadth(CARD_SIZE) / 2);
}

/** Where a card goes that follows the card at `position` (one step further along the flow). */
export function nextPosition(
  graph: FlowGraph,
  position: { x: number; y: number }
): { x: number; y: number } {
  const axis = flowAxis(graph);
  return axis.at(axis.main(position) + stepLength(axis), axis.cross(position));
}

/** How far one step along the flow reaches: a card and the gap after it. */
function stepLength(axis: Axis): number {
  return axis.length(CARD_SIZE) + LAYER_GAP[axis.direction];
}

/** Sorts cards the way the flow reads: along it first, then across. */
export function byFlowOrder(axis: Axis): (a: FlowNode, b: FlowNode) => number {
  return (a, b) =>
    axis.main(a.position) - axis.main(b.position) ||
    axis.cross(a.position) - axis.cross(b.position);
}

// ---- scripts: the start node exists for the transpiler but is never shown ---------

/**
 * The hidden start node: a script's (it carries the `fields`), or that of an
 * automation without triggers — both begin with their first step, like in HA.
 */
export function scriptStartId(graph: FlowGraph): string | undefined {
  return graph.nodes.find((node) => isFlowStart(node.data))?.id;
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
 * card deleted), the left-most card without a predecessor becomes the
 * beginning. An automation without triggers loses its hidden start as soon
 * as it has a trigger of its own.
 */
export function ensureScriptEntry(next: FlowGraph): FlowGraph {
  const graph = dropSupersededManualStart(next);
  const startId = scriptStartId(graph);
  if (!startId || graph.edges.some((edge) => edge.source === startId)) return graph;
  const hasPredecessor = new Set(graph.edges.map((edge) => edge.target));
  // Never a trigger (one added to an automation without triggers is an entry of its own).
  const first = graph.nodes
    .filter(
      (node) => node.id !== startId && node.type !== 'trigger' && !hasPredecessor.has(node.id)
    )
    .sort(byFlowOrder(flowAxis(graph)))[0];
  return first ? connect(graph, { source: startId, sourceHandle: null, target: first.id }) : graph;
}

// ---- assistant proposals -------------------------------------------------

/** What the YAML parser fills in for a flow without `alias:` (not a name the reply gave). */
const PARSER_DEFAULT_NAME = 'Imported Automation';

/** Flow settings a reply's YAML can set (top-level keys = metadata keys). */
const PROPOSAL_METADATA_KEYS = [
  'mode',
  'max',
  'max_exceeded',
  'icon',
  'initial_state',
  'hide_entity',
  'trace',
] as const satisfies readonly (keyof FlowMetadata)[];

/**
 * Whether the reply set top-level key `key`. `present` = the top-level keys
 * of the reply's YAML; without it only a value other than the parser's
 * default (`fallback`) counts as set.
 */
function proposalSets(
  present: ReadonlySet<string> | undefined,
  key: string,
  fallback: boolean
): boolean {
  return present ? present.has(key) : fallback;
}

/**
 * The assistant's proposal applied to the open flow: its cards, plus the
 * name, description, settings and variables the reply actually wrote — a
 * reply without `alias:` keeps the flow's name instead of the parser's
 * "Imported Automation". The flow's kind never changes.
 */
export function applyProposal(
  current: FlowGraph,
  proposal: FlowGraph,
  present?: ReadonlySet<string>
): FlowGraph {
  const proposed = proposal.metadata;
  const metadata: Record<string, unknown> = { ...current.metadata };
  for (const key of PROPOSAL_METADATA_KEYS) {
    const value = proposed?.[key];
    const set = proposalSets(
      present,
      key,
      value !== undefined && !(key === 'mode' && value === 'single')
    );
    if (set) metadata[key] = value;
  }
  metadata.kind = current.metadata?.kind;
  const parsed = FlowMetadataSchema.safeParse(metadata);
  const name = proposalSets(present, 'alias', proposal.name !== PARSER_DEFAULT_NAME)
    ? proposal.name
    : '';
  return {
    ...current,
    nodes: proposal.nodes,
    edges: proposal.edges,
    name: name || current.name,
    description: proposalSets(present, 'description', Boolean(proposal.description))
      ? (proposal.description ?? '')
      : current.description,
    userVariables: proposalSets(present, 'variables', proposal.userVariables !== undefined)
      ? proposal.userVariables
      : current.userVariables,
    userTriggerVariables: proposalSets(
      present,
      'trigger_variables',
      proposal.userTriggerVariables !== undefined
    )
      ? proposal.userTriggerVariables
      : current.userTriggerVariables,
    ...(parsed.success ? { metadata: parsed.data } : {}),
  };
}

/** A card's "+" (its size), and top to bottom how far below the card it ends. */
export const ADD_BUTTON = 22;
export const ADD_BELOW = 36;
/** Top to bottom, how far a line runs straight on below its output (through its "+") before it turns. */
const OUT_STRAIGHT = ADD_BELOW + 4;
/** Top to bottom, lines into a card several lead to meet this far above it and arrive as one. */
const MERGE_ABOVE = 24;

/** Top to bottom, a line passing cards runs in the middle of the gap beside them. */
const LANE = NODE_GAP / 2;

/** Room a line keeps past an output's "+" before it turns away. */
export const PAST_ADD = ADD_BELOW + LANE / 2;

/** Where the straight line from `from` to `to` is, across the flow, at `y` (top to bottom). */
function crossAt(from: { x: number; y: number }, to: { x: number; y: number }, y: number): number {
  return from.x + ((to.x - from.x) * (y - from.y)) / (to.y - from.y);
}

/**
 * Bends for a line from `from` to `to` that would run through other cards
 * (top to bottom, e.g. from a trigger in the first of several rows): down past
 * its "+", aside into a gap that is free all the way down past the cards
 * between, along it, then on to its target. Left to right, and with nothing
 * in the way: none.
 */
export function detour(
  axis: Axis,
  from: { x: number; y: number },
  to: { x: number; y: number },
  cards: readonly FlowNode[],
  skip: ReadonlySet<string>,
  height: (node: FlowNode) => number
): { x: number; y: number }[] {
  if (axis.direction !== 'down' || to.y <= from.y) return [];
  // The cards between the two ends, along the flow.
  const between = cards.filter(
    (n) => !skip.has(n.id) && n.position.y > from.y && n.position.y + height(n) < to.y
  );
  const inWay = between.some((n) => {
    // Where the line runs while level with the card (it bends, so a lane's width to spare).
    const a = crossAt(from, to, n.position.y);
    const b = crossAt(from, to, n.position.y + height(n));
    return (
      Math.max(a, b) > n.position.x - LANE && Math.min(a, b) < n.position.x + NODE_WIDTH + LANE
    );
  });
  if (!inWay) return [];
  // Beside one of them, clear of all of them; the one nearest the way from one end to the other.
  const free = (x: number) =>
    between.every((n) => x <= n.position.x - LANE / 2 || x >= n.position.x + NODE_WIDTH + LANE / 2);
  const cost = (x: number) => Math.abs(x - from.x) + Math.abs(x - to.x);
  const lane = between
    .flatMap((n) => [n.position.x - LANE, n.position.x + NODE_WIDTH + LANE])
    .filter(free)
    .reduce((best, x) => (cost(x) < cost(best) ? x : best), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(lane)) return [];
  const top = Math.min(...between.map((n) => n.position.y));
  const bottom = Math.max(...between.map((n) => n.position.y + height(n)));
  const below = from.y + PAST_ADD;
  // Out of the lane in time to turn to the target (and never below its input).
  const leave = Math.min(bottom + PAST_ADD, to.y - MERGE_ABOVE);
  return [
    ...(below < top ? [{ x: from.x, y: below }] : []),
    { x: lane, y: top },
    ...(leave > bottom ? [{ x: lane, y: leave }] : []),
  ];
}

/** Left to right: room a line keeps before a card's input to turn into it (#31). */
const INTO_LEFT = 24;

/**
 * Left to right: bends at or past a card's input are left out (a branch lane
 * ending where its moved step now is) — the line would end in a curve of no
 * length or run on past the card and back to it (#31). A loop back bends
 * past its target on purpose.
 */
export function acrossPoints(
  points: readonly { x: number; y: number }[],
  loop = false
): { x: number; y: number }[] {
  const from = points[0];
  const to = points.at(-1);
  if (!from || !to || points.length < 3 || loop) return [...points];
  const middle = points.slice(1, -1).filter((p) => p.x <= to.x - INTO_LEFT);
  return [from, ...middle, to];
}

/** How far along the flow a line needs past its start to reach its target as a plain curve. */
export function lineRoom(axis: Axis): number {
  return axis.direction === 'down' ? OUT_STRAIGHT + MERGE_ABOVE : 2 * INTO_LEFT;
}

/**
 * Along the flow, a line runs back when its target's input is not clearly past
 * its source's output (#31: a branch step dragged beside or before its block).
 * Drawn as a curve it would hook back through the cards.
 */
export function runsBack(
  axis: Axis,
  from: { x: number; y: number },
  to: { x: number; y: number }
): boolean {
  return axis.main(to) < axis.main(from) + lineRoom(axis);
}

/**
 * Where a line running back crosses over, across the flow: in the middle of
 * the gap between its two cards, or, where they overlap there, clear of both
 * on the side its target lies.
 */
export function backCrossing(
  axis: Axis,
  from: { x: number; y: number },
  to: { x: number; y: number },
  source: Bounds,
  target: Bounds
): number {
  const near = (b: Bounds) => axis.cross(b);
  const far = (b: Bounds) => axis.cross(b) + axis.breadth(b);
  const gapStart = Math.min(far(source), far(target));
  const gapEnd = Math.max(near(source), near(target));
  if (gapEnd - gapStart >= LANE) return (gapStart + gapEnd) / 2;
  return axis.cross(to) < axis.cross(from)
    ? Math.min(near(source), near(target)) - LANE
    : Math.max(far(source), far(target)) + LANE;
}

/**
 * Top to bottom: a line leaves its output straight down through its "+", and
 * lines meeting at a card (`merge`) join just above it into one arrow. A bend
 * at the card's own edge (a branch lane ending there) is left out — the line
 * would run on into the card and back to the input circle.
 */
export function downPoints(
  points: readonly { x: number; y: number }[],
  merge: boolean
): { x: number; y: number }[] {
  const from = points[0];
  const to = points.at(-1);
  if (!from || !to || points.length < 2) return [...points];
  const middle = points.slice(1, -1).filter((p) => !(p.x === to.x && p.y >= to.y));
  const next = middle[0] ?? to;
  const out = from.y + OUT_STRAIGHT;
  const start = next.x !== from.x && next.y > out ? [{ x: from.x, y: out }] : [];
  const last = middle.at(-1) ?? start.at(-1) ?? from;
  const into = to.y - MERGE_ABOVE;
  // A lane already level with the meeting point joins it straight across.
  const join = merge && last.x !== to.x && last.y <= into ? [{ x: to.x, y: into }] : [];
  return [from, ...start, ...middle, ...join, to];
}
