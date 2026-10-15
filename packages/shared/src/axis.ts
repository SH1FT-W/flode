import type { FlowDirection } from './schemas/base';
import type { FlowGraph } from './schemas/graph';

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/**
 * A flow's two axes (#29): "main" runs along the flow (left to right, or top
 * to bottom), "cross" across it — where branches and parallel paths sit side
 * by side. Layout code works in these, so it is written once for both
 * directions.
 */
export interface Axis {
  readonly direction: FlowDirection;
  main(point: Point): number;
  cross(point: Point): number;
  /** The flow point at `main` along and `cross` across the flow. */
  at(main: number, cross: number): Point;
  /** How far a card of `size` reaches along the flow. */
  length(size: Size): number;
  /** How wide a card of `size` is across the flow. */
  breadth(size: Size): number;
}

const RIGHT: Axis = {
  direction: 'right',
  main: (p) => p.x,
  cross: (p) => p.y,
  at: (main, cross) => ({ x: main, y: cross }),
  length: (s) => s.width,
  breadth: (s) => s.height,
};

const DOWN: Axis = {
  direction: 'down',
  main: (p) => p.y,
  cross: (p) => p.x,
  at: (main, cross) => ({ x: cross, y: main }),
  length: (s) => s.height,
  breadth: (s) => s.width,
};

/** Room between cards side by side (as laid out), and between steps along the flow, per direction. */
export const NODE_GAP = 60;
export const LAYER_GAP: Readonly<Record<FlowDirection, number>> = { right: 120, down: 80 };

export function axisOf(direction: FlowDirection | undefined): Axis {
  return direction === 'down' ? DOWN : RIGHT;
}

/** Which way `graph` runs — left to right unless it was laid out top to bottom. */
export function flowAxis(graph: FlowGraph): Axis {
  return axisOf(graph.direction);
}
