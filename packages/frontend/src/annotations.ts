import {
  ANNOTATION_COLORS,
  type AnnotationColor,
  type FlowGraph,
  type Frame,
  type Note,
  uniqueId,
} from '@flode/shared';
import { NODE_HEIGHT, NODE_WIDTH } from './flow-model';

/**
 * Notes and frames: drawings on the canvas that are no steps. Pure edit
 * operations on the graph, like `flow-model.ts` — the canvas only renders them
 * and turns pointer input into these calls.
 */

/** Annotations snap to the same grid as cards. */
export function snapToGrid(value: number): number {
  return Math.round(value / 20) * 20;
}

export type AnnotationKind = 'note' | 'frame';
export type Annotation = Note | Frame;

export const NOTE_SIZE = { width: 220, height: 120 } as const;
export const FRAME_SIZE = { width: 600, height: 360 } as const;
export const MIN_SIZE = { width: 80, height: 48 } as const;

/** The colour names the canvas styles, in the order the menu cycles them. */
export const COLORS: readonly AnnotationColor[] = ANNOTATION_COLORS;

export function kindOf(graph: FlowGraph, id: string): AnnotationKind | null {
  if (graph.notes?.some((n) => n.id === id)) return 'note';
  if (graph.frames?.some((f) => f.id === id)) return 'frame';
  return null;
}

export function findAnnotation(graph: FlowGraph, id: string): Annotation | undefined {
  return graph.notes?.find((n) => n.id === id) ?? graph.frames?.find((f) => f.id === id);
}

/** The graph with annotation `id` replaced by `change(it)`. */
function update(
  graph: FlowGraph,
  id: string,
  change: <T extends Annotation>(a: T) => T
): FlowGraph {
  return {
    ...graph,
    ...(graph.notes?.some((n) => n.id === id)
      ? { notes: graph.notes.map((n) => (n.id === id ? change(n) : n)) }
      : {}),
    ...(graph.frames?.some((f) => f.id === id)
      ? { frames: graph.frames.map((f) => (f.id === id ? change(f) : f)) }
      : {}),
  };
}

function newId(graph: FlowGraph, kind: AnnotationKind): string {
  const taken = new Set([...(graph.notes ?? []), ...(graph.frames ?? [])].map((a) => a.id));
  return uniqueId(`${kind}_${Date.now().toString(36)}`, taken);
}

export function addNote(graph: FlowGraph, at: { x: number; y: number }): [FlowGraph, string] {
  const id = newId(graph, 'note');
  const note: Note = { id, x: at.x, y: at.y, ...NOTE_SIZE, text: '', color: 'yellow' };
  return [{ ...graph, notes: [...(graph.notes ?? []), note] }, id];
}

export function addFrame(
  graph: FlowGraph,
  at: { x: number; y: number },
  size: { width: number; height: number } = FRAME_SIZE
): [FlowGraph, string] {
  const id = newId(graph, 'frame');
  const frame: Frame = { id, x: at.x, y: at.y, ...size, title: '', color: 'blue' };
  return [{ ...graph, frames: [...(graph.frames ?? []), frame] }, id];
}

/** A frame around every card of the flow (the starting point for "frame what I have"). */
export function addFrameAround(
  graph: FlowGraph,
  ids: readonly string[]
): [FlowGraph, string] | null {
  const nodes = graph.nodes.filter((n) => ids.includes(n.id));
  if (nodes.length === 0) return null;
  const pad = 40;
  const top = 36; // room for the title
  const left = Math.min(...nodes.map((n) => n.position.x)) - pad;
  const upper = Math.min(...nodes.map((n) => n.position.y)) - pad - top;
  const right = Math.max(...nodes.map((n) => n.position.x + NODE_WIDTH)) + pad;
  const lower = Math.max(...nodes.map((n) => n.position.y + NODE_HEIGHT)) + pad;
  return addFrame(graph, { x: left, y: upper }, { width: right - left, height: lower - upper });
}

export function setText(graph: FlowGraph, id: string, text: string): FlowGraph {
  return update(graph, id, (a) => ('text' in a ? { ...a, text } : { ...a, title: text }));
}

export function textOf(a: Annotation): string {
  return 'text' in a ? a.text : a.title;
}

export function nextColor(graph: FlowGraph, id: string): FlowGraph {
  return update(graph, id, (a) => {
    const at = COLORS.indexOf(a.color ?? COLORS[0]);
    return { ...a, color: COLORS[(at + 1) % COLORS.length] };
  });
}

export function setColor(graph: FlowGraph, id: string, color: AnnotationColor): FlowGraph {
  return update(graph, id, (a) => ({ ...a, color }));
}

export function removeAnnotation(graph: FlowGraph, id: string): FlowGraph {
  return {
    ...graph,
    notes: graph.notes?.filter((n) => n.id !== id),
    frames: graph.frames?.filter((f) => f.id !== id),
  };
}

export function moveAnnotation(graph: FlowGraph, id: string, x: number, y: number): FlowGraph {
  return update(graph, id, (a) => ({ ...a, x, y }));
}

export function resizeAnnotation(
  graph: FlowGraph,
  id: string,
  box: { x: number; y: number; width: number; height: number }
): FlowGraph {
  return update(graph, id, (a) => ({
    ...a,
    ...box,
    width: Math.max(MIN_SIZE.width, box.width),
    height: Math.max(MIN_SIZE.height, box.height),
  }));
}

/** Which corner a resize handle sits on. */
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** `start` dragged by (`dx`, `dy`) at `corner`; the opposite corner stays where it is. */
export function resizedBox(
  start: { x: number; y: number; width: number; height: number },
  corner: Corner,
  dx: number,
  dy: number
): { x: number; y: number; width: number; height: number } {
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';
  const width = Math.max(MIN_SIZE.width, start.width + (west ? -dx : dx));
  const height = Math.max(MIN_SIZE.height, start.height + (north ? -dy : dy));
  return {
    x: west ? start.x + start.width - width : start.x,
    y: north ? start.y + start.height - height : start.y,
    width,
    height,
  };
}

/**
 * What moves along with a frame: the cards whose middle lies inside it, and
 * the notes that do, taken when the drag starts. Frames inside it are not
 * taken (a frame in a frame is moved on its own).
 */
export function frameMembers(graph: FlowGraph, frame: Frame): { nodes: string[]; notes: string[] } {
  const inside = (x: number, y: number) =>
    x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height;
  return {
    nodes: graph.nodes
      .filter((n) => inside(n.position.x + NODE_WIDTH / 2, n.position.y + NODE_HEIGHT / 2))
      .map((n) => n.id),
    notes: (graph.notes ?? [])
      .filter((n) => inside(n.x + n.width / 2, n.y + n.height / 2))
      .map((n) => n.id),
  };
}

/** The frame at (`dx`, `dy`) from `start`, with its members moved by the same amount. */
export function moveFrame(
  graph: FlowGraph,
  id: string,
  start: {
    frame: { x: number; y: number };
    nodes: Map<string, { x: number; y: number }>;
    notes: Map<string, { x: number; y: number }>;
  },
  dx: number,
  dy: number
): FlowGraph {
  return {
    ...graph,
    frames: graph.frames?.map((f) =>
      f.id === id ? { ...f, x: start.frame.x + dx, y: start.frame.y + dy } : f
    ),
    nodes: graph.nodes.map((n) => {
      const from = start.nodes.get(n.id);
      return from ? { ...n, position: { x: from.x + dx, y: from.y + dy } } : n;
    }),
    notes: graph.notes?.map((n) => {
      const from = start.notes.get(n.id);
      return from ? { ...n, x: from.x + dx, y: from.y + dy } : n;
    }),
  };
}
