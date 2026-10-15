import { getViewportForBounds, type Viewport } from '@xyflow/system';
import type { Bounds } from './flow-model';

/** Phones: a flow too wide to show whole starts this far from the left edge (px). */
const FIT_EDGE = 24;

export interface FitArea {
  width: number;
  height: number;
  minZoom: number;
  /** Share of the height a bottom sheet hides — the bounds are framed above it. */
  covered?: number;
  /** Phones: a flow too wide to fit starts at its left (the trigger), not in its middle. */
  startLeft?: boolean;
}

/** The viewport that frames `bounds` in the visible part of the pane. */
export function fitViewport(
  bounds: Bounds,
  { width, height, minZoom, covered = 0, startLeft = false }: FitArea
): Viewport {
  const viewport = getViewportForBounds(bounds, width, height * (1 - covered), minZoom, 1, 0.15);
  const cutOffLeft = startLeft && viewport.x + bounds.x * viewport.zoom < 0;
  return cutOffLeft ? { ...viewport, x: FIT_EDGE - bounds.x * viewport.zoom } : viewport;
}
