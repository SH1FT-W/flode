import {
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  type Frame,
  isFlowStart,
  type Note,
  uniqueId,
} from '@flode/shared';
import { NODE_HEIGHT, NODE_WIDTH, toggleNodeEnabled } from './flow-model';
import { bendsBetween } from './line-bends';

/**
 * A selection of several cards and notes (marquee, shift-click): the pure
 * edits that work on all of them at once. Ids are card ids (`graph.nodes`) or
 * note ids; an id that is neither is ignored.
 */

/** Annotations and selections snap to the same grid as cards. */
export function snapToGrid(value: number): number {
  return Math.round(value / 20) * 20;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a selection holds: the cards (never the hidden start), the notes and the frames. */
export function splitSelection(
  graph: FlowGraph,
  ids: readonly string[]
): { nodes: FlowNode[]; notes: Note[]; frames: Frame[] } {
  return {
    frames: (graph.frames ?? []).filter((f) => ids.includes(f.id)),
    nodes: graph.nodes.filter((n) => ids.includes(n.id) && !isFlowStart(n.data)),
    notes: (graph.notes ?? []).filter((n) => ids.includes(n.id)),
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

/** The cards, notes and frames a marquee `box` touches. `height` is a card's drawn height (it varies top to bottom). */
export function idsInBox(
  graph: FlowGraph,
  box: Rect,
  height: (node: FlowNode) => number = () => NODE_HEIGHT
): string[] {
  const cards = graph.nodes
    .filter((n) => !isFlowStart(n.data))
    .filter((n) =>
      overlaps(box, { x: n.position.x, y: n.position.y, width: NODE_WIDTH, height: height(n) })
    )
    .map((n) => n.id);
  const notes = (graph.notes ?? []).filter((n) => overlaps(box, n)).map((n) => n.id);
  // A frame is picked when the box takes it in whole — a box inside a frame picks what lies in it, not the frame.
  const frames = (graph.frames ?? []).filter((f) => contains(box, f)).map((f) => f.id);
  return [...frames, ...cards, ...notes];
}

/** The box around the selected cards and notes, or null when none is selected. */
export function selectionBox(graph: FlowGraph, ids: readonly string[]): Rect | null {
  const { nodes, notes, frames } = splitSelection(graph, ids);
  const boxes: Rect[] = [
    ...nodes.map((n) => ({ ...n.position, width: NODE_WIDTH, height: NODE_HEIGHT })),
    ...notes,
    ...frames,
  ];
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}

export function removeSelection(graph: FlowGraph, ids: readonly string[]): FlowGraph {
  const { nodes, notes, frames } = splitSelection(graph, ids);
  const gone = new Set(nodes.map((n) => n.id));
  const noteGone = new Set(notes.map((n) => n.id));
  const frameGone = new Set(frames.map((f) => f.id));
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => !gone.has(n.id)),
    edges: graph.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)),
    notes: graph.notes?.filter((n) => !noteGone.has(n.id)),
    frames: graph.frames?.filter((f) => !frameGone.has(f.id)),
  };
}

/**
 * Switches the selected cards on or off together: all on when every one of
 * them is off, otherwise all off (a mixed selection goes off first, like a
 * file manager's "select all, then toggle").
 */
export function toggleSelectionEnabled(graph: FlowGraph, ids: readonly string[]): FlowGraph {
  const { nodes } = splitSelection(graph, ids);
  const isOff = (n: FlowNode) => 'enabled' in n.data && n.data.enabled === false;
  const turnOn = nodes.length > 0 && nodes.every(isOff);
  return nodes
    .filter((n) => isOff(n) === turnOn)
    .reduce((g, n) => toggleNodeEnabled(g, n.id), graph);
}

/** Cards, the connections between them and notes, as copied — independent of the graph they came from. */
export interface SelectionSnapshot {
  nodes: FlowNode[];
  edges: FlowEdge[];
  notes: Note[];
  frames: Frame[];
}

export function snapshotSelection(graph: FlowGraph, ids: readonly string[]): SelectionSnapshot {
  const { nodes, notes, frames } = splitSelection(graph, ids);
  const kept = new Set(nodes.map((n) => n.id));
  return structuredClone({
    nodes,
    edges: graph.edges.filter(
      (e) => kept.has(e.source) && kept.has(e.target) && !e.type?.startsWith('choose')
    ),
    notes,
    frames,
  });
}

/**
 * `snapshot` added to the graph with its top-left corner at `at` (snapped):
 * new ids throughout, connections among the copies kept, nothing connected to
 * the rest of the flow. Returns the ids of the new cards and notes.
 */
export function pasteSnapshot(
  graph: FlowGraph,
  snapshot: SelectionSnapshot,
  at: { x: number; y: number }
): { graph: FlowGraph; ids: string[] } | null {
  const probe: FlowGraph = { ...graph, nodes: [], notes: [], frames: [] };
  const box = selectionBox(
    { ...probe, nodes: snapshot.nodes, notes: snapshot.notes, frames: snapshot.frames },
    [
      ...snapshot.nodes.map((n) => n.id),
      ...snapshot.notes.map((n) => n.id),
      ...snapshot.frames.map((f) => f.id),
    ]
  );
  if (!box) return null;
  const dx = snapToGrid(at.x) - box.x;
  const dy = snapToGrid(at.y) - box.y;
  const takenNodes = new Set(graph.nodes.map((n) => n.id));
  const takenAll = new Set([
    ...takenNodes,
    ...(graph.notes ?? []).map((n) => n.id),
    ...(graph.frames ?? []).map((f) => f.id),
  ]);
  const stamp = Date.now().toString(36);
  const renamed = new Map<string, string>();
  const nodes = snapshot.nodes.map((n) => {
    const id = uniqueId(`${n.type}_${stamp}`, takenAll);
    renamed.set(n.id, id);
    return { ...n, id, position: { x: n.position.x + dx, y: n.position.y + dy } };
  });
  const takenEdges = new Set(graph.edges.map((e) => e.id));
  const edges = snapshot.edges.flatMap((e) => {
    const source = renamed.get(e.source);
    const target = renamed.get(e.target);
    if (!source || !target) return [];
    const id = uniqueId(
      `e-${source}${e.sourceHandle ? `-${e.sourceHandle}` : ''}-${target}`,
      takenEdges
    );
    return [{ ...e, id, source, target }];
  });
  const notes = snapshot.notes.map((n) => ({
    ...n,
    id: uniqueId(`note_${stamp}`, takenAll),
    x: n.x + dx,
    y: n.y + dy,
  }));
  const frames = snapshot.frames.map((f) => ({
    ...f,
    id: uniqueId(`frame_${stamp}`, takenAll),
    x: f.x + dx,
    y: f.y + dy,
  }));
  return {
    graph: {
      ...graph,
      nodes: [...graph.nodes, ...nodes],
      edges: [...graph.edges, ...edges],
      ...(notes.length > 0 ? { notes: [...(graph.notes ?? []), ...notes] } : {}),
      ...(frames.length > 0 ? { frames: [...(graph.frames ?? []), ...frames] } : {}),
    },
    ids: [...frames.map((f) => f.id), ...nodes.map((n) => n.id), ...notes.map((n) => n.id)],
  };
}

type Point = { x: number; y: number };

interface Starts {
  nodes: ReadonlyMap<string, Point>;
  notes: ReadonlyMap<string, Point>;
  frames?: ReadonlyMap<string, Point>;
  /** Bends of lines between two of the cards: they move along (#28). */
  lines?: ReadonlyMap<string, readonly Point[]>;
}

/** The selected cards, notes and frames moved by (`dx`, `dy`) from where `start` has them. */
export function moveSelection(graph: FlowGraph, start: Starts, dx: number, dy: number): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const from = start.nodes.get(n.id);
      return from ? { ...n, position: { x: from.x + dx, y: from.y + dy } } : n;
    }),
    notes: graph.notes?.map((n) => {
      const from = start.notes.get(n.id);
      return from ? { ...n, x: from.x + dx, y: from.y + dy } : n;
    }),
    frames: graph.frames?.map((f) => {
      const from = start.frames?.get(f.id);
      return from ? { ...f, x: from.x + dx, y: from.y + dy } : f;
    }),
    ...(graph.lineBends
      ? {
          lineBends: Object.fromEntries(
            Object.entries(graph.lineBends).map(([key, bends]) => [
              key,
              start.lines?.get(key)?.map((p) => ({ x: p.x + dx, y: p.y + dy })) ?? bends,
            ])
          ),
        }
      : {}),
  };
}

/** Where each selected card, note and frame is now — the `start` of a move. */
export function positionsOf(graph: FlowGraph, ids: readonly string[]): Required<Starts> {
  const { nodes, notes, frames } = splitSelection(graph, ids);
  return {
    nodes: new Map(nodes.map((n) => [n.id, { ...n.position }])),
    notes: new Map(notes.map((n) => [n.id, { x: n.x, y: n.y }])),
    frames: new Map(frames.map((f) => [f.id, { x: f.x, y: f.y }])),
    lines: bendsBetween(graph, new Set(nodes.map((n) => n.id))),
  };
}
