import type { Axis, FlowEdge, FlowGraph } from '@flode/shared';

/**
 * Lines laid by hand (#28): the user drags bends into a line, it then runs
 * at right angles through them (along the flow out of the card, across to
 * each bend, along into the next card) with rounded corners, instead of
 * FLODE's own curve. Bends are kept per drawn line in flow coordinates, in the layout
 * only (`FlowGraph.lineBends`); "Aufräumen" lays every line itself again.
 */

type Point = { x: number; y: number };

const SEPARATOR = '|';

/**
 * Which line bends belong to: where it starts, from which output, and where
 * it ends. Drawn ids, so a line leaving a branch of a block has its own.
 */
export function lineKey(edge: Pick<FlowEdge, 'source' | 'target' | 'sourceHandle'>): string {
  return [edge.source, edge.sourceHandle ?? '', edge.target].join(SEPARATOR);
}

/** The cards a line key joins. */
function lineEnds(key: string): { source: string; target: string } {
  const parts = key.split(SEPARATOR);
  return { source: parts[0] ?? '', target: parts.at(-1) ?? '' };
}

/** The flow with the bends of line `key` set; none lays the line automatically again. */
export function withLineBends(graph: FlowGraph, key: string, bends: readonly Point[]): FlowGraph {
  const { lineBends, ...rest } = graph;
  const next = { ...lineBends };
  if (bends.length > 0) next[key] = bends.map((p) => ({ x: p.x, y: p.y }));
  else delete next[key];
  return Object.keys(next).length > 0 ? { ...rest, lineBends: next } : rest;
}

/** The flow keeping only the bends of lines in `keys` (a line that is gone takes its bends along). */
export function withLinesKept(graph: FlowGraph, keys: ReadonlySet<string>): FlowGraph {
  const { lineBends, ...rest } = graph;
  if (!lineBends) return graph;
  const kept = Object.entries(lineBends).filter(([key]) => keys.has(key));
  return kept.length > 0 ? { ...rest, lineBends: Object.fromEntries(kept) } : rest;
}

/** The bends of lines whose cards both are among `ids` — they move with a selection dragged as one. */
export function bendsBetween(
  graph: FlowGraph,
  ids: ReadonlySet<string>
): Map<string, readonly Point[]> {
  return new Map(
    Object.entries(graph.lineBends ?? {}).filter(([key]) => {
      const { source, target } = lineEnds(key);
      return ids.has(source) && ids.has(target);
    })
  );
}

/**
 * The corners of a line laid through `bends`: out of `from` along the flow,
 * across to each bend (it ends a run across), and along into `to`.
 */
export function laidRoute(axis: Axis, from: Point, bends: readonly Point[], to: Point): Point[] {
  const route = [from];
  let at = from;
  for (const bend of bends) {
    route.push(axis.at(axis.main(bend), axis.cross(at)), bend);
    at = bend;
  }
  route.push(axis.at(axis.main(at), axis.cross(to)), to);
  return route;
}

/**
 * Where a new bend can be pulled out of a line, one per run between its
 * ends and bends — on the line as drawn, so it doesn't jump when picked up.
 * Without bends: the middle between its ends.
 */
export function bendSlots(axis: Axis, from: Point, bends: readonly Point[], to: Point): Point[] {
  const points = [from, ...bends, to];
  if (bends.length === 0) return [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }];
  return points.slice(1).map((next, i) => {
    const at = points[i] ?? next;
    const main = (axis.main(at) + axis.main(next)) / 2;
    // The run along the flow: from a bend at its height, into the target at the target's.
    return axis.at(main, axis.cross(i === bends.length ? next : at));
  });
}

/** A line through `points`: straight runs, each corner rounded by up to `radius`. */
export function roundedPath(points: readonly Point[], radius = 12): string {
  const [first, ...rest] = points;
  if (!first) return '';
  const parts = [`M ${first.x} ${first.y}`];
  rest.forEach((corner, i) => {
    const before = points[i];
    const after = rest[i + 1];
    if (!before || !after) {
      parts.push(`L ${corner.x} ${corner.y}`);
      return;
    }
    const r = Math.min(radius, distance(before, corner) / 2, distance(corner, after) / 2);
    const into = toward(corner, before, r);
    const out = toward(corner, after, r);
    parts.push(`L ${into.x} ${into.y} Q ${corner.x} ${corner.y} ${out.x} ${out.y}`);
  });
  return parts.join(' ');
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The point `length` away from `from` on the way to `to`. */
function toward(from: Point, to: Point, length: number): Point {
  const total = distance(from, to);
  if (total === 0) return from;
  return {
    x: from.x + ((to.x - from.x) * length) / total,
    y: from.y + ((to.y - from.y) * length) / total,
  };
}
