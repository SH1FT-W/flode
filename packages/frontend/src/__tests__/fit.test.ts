import { getViewportForBounds } from '@xyflow/system';
import { describe, expect, it } from 'vitest';
import { fitViewport } from '../fit';

const wide = { x: 100, y: 0, width: 3000, height: 100 };
const small = { x: 0, y: 0, width: 300, height: 100 };

describe('fitViewport', () => {
  it('is xyflow’s own fit when nothing is covered (desktop)', () => {
    expect(fitViewport(wide, { width: 1400, height: 800, minZoom: 0.2 })).toEqual(
      getViewportForBounds(wide, 1400, 800, 0.2, 1, 0.15)
    );
  });

  it('starts a too wide flow at its left edge on phones', () => {
    const viewport = fitViewport(wide, { width: 390, height: 600, minZoom: 0.55, startLeft: true });
    expect(viewport.zoom).toBe(0.55);
    expect(viewport.x + wide.x * viewport.zoom).toBe(24);
  });

  it('keeps a flow that fits centred, also on phones', () => {
    const phone = { width: 390, height: 600, minZoom: 0.55 };
    expect(fitViewport(small, { ...phone, startLeft: true })).toEqual(fitViewport(small, phone));
  });

  it('frames the flow above a bottom sheet', () => {
    const viewport = fitViewport(small, { width: 390, height: 1000, minZoom: 0.55, covered: 0.6 });
    const centre = viewport.y + (small.y + small.height / 2) * viewport.zoom;
    expect(centre).toBeCloseTo(200);
  });
});
