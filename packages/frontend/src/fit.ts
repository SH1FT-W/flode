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
  /** A flow running top to bottom: one too tall to fit starts at its top (#29). */
  startTop?: boolean;
  /** Phones, top to bottom: a flow too wide to fit has this flow x (its first cards' middle) in the middle. */
  startX?: number;
}

/** The viewport that frames `bounds` in the visible part of the pane. */
export function fitViewport(
  bounds: Bounds,
  { width, height, minZoom, covered = 0, startLeft = false, startTop = false, startX }: FitArea
): Viewport {
  const viewport = getViewportForBounds(bounds, width, height * (1 - covered), minZoom, 1, 0.15);
  const cutOffSide = viewport.x + bounds.x * viewport.zoom < 0;
  const cutOffTop = startTop && viewport.y + bounds.y * viewport.zoom < 0;
  const x =
    startX !== undefined ? width / 2 - startX * viewport.zoom : FIT_EDGE - bounds.x * viewport.zoom;
  return {
    ...viewport,
    ...(cutOffSide && (startLeft || startX !== undefined) ? { x } : {}),
    ...(cutOffTop ? { y: FIT_EDGE - bounds.y * viewport.zoom } : {}),
  };
}
