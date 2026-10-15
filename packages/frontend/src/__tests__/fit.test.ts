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

  it('starts a too tall flow running top to bottom at its top on phones (#29)', () => {
    const tall = { x: 0, y: 100, width: 300, height: 3000 };
    const viewport = fitViewport(tall, { width: 390, height: 600, minZoom: 0.55, startTop: true });
    expect(viewport.zoom).toBe(0.55);
    expect(viewport.y + tall.y * viewport.zoom).toBe(24);
  });

  it('puts the first row of a too wide flow running top to bottom in the middle on phones (#29)', () => {
    const viewport = fitViewport(wide, { width: 390, height: 600, minZoom: 0.55, startX: 900 });
    expect(viewport.x + 900 * viewport.zoom).toBe(195);
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
