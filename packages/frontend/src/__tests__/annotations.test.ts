import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import {
  addFrame,
  addFrameAround,
  addNote,
  findAnnotation,
  frameMembers,
  isFrame,
  kindOf,
  moveFrame,
  nextColor,
  removeAnnotation,
  resizedBox,
  setText,
  textOf,
  tintOf,
} from '../annotations';

function graph(): FlowGraph {
  return {
    id: 'g',
    name: 'x',
    description: '',
    version: 1,
    nodes: [
      { id: 'a', type: 'trigger', position: { x: 0, y: 0 }, data: { trigger: 'state' } },
      { id: 'b', type: 'action', position: { x: 1000, y: 0 }, data: { service: 'x.y' } },
    ],
    edges: [],
  } as FlowGraph;
}

describe('annotation colours', () => {
  it('turns a named colour or a wheel colour into r, g, b', () => {
    expect(tintOf('blue', 'yellow')).toBe('59, 130, 246');
    expect(tintOf('#ff8000', 'yellow')).toBe('255, 128, 0');
    // nothing, or something unknown, is the default
    expect(tintOf(undefined, 'yellow')).toBe('250, 204, 21');
    expect(tintOf('nonsense', 'green')).toBe('34, 197, 94');
  });
});

describe('annotations', () => {
  it('adds notes and frames with unique ids', () => {
    const [g1, n] = addNote(graph(), { x: 5, y: 6 });
    const [g2, f] = addFrame(g1, { x: 0, y: 0 });
    expect(n).not.toBe(f);
    expect(kindOf(g2, n)).toBe('note');
    expect(kindOf(g2, f)).toBe('frame');
  });

  it('edits text and title, cycles the colour and removes', () => {
    const [g1, n] = addNote(graph(), { x: 0, y: 0 });
    const [g2, f] = addFrame(g1, { x: 0, y: 0 });
    const g3 = setText(setText(g2, n, 'hallo'), f, 'Licht');
    expect(textOf(findAnnotation(g3, n)!)).toBe('hallo');
    expect(textOf(findAnnotation(g3, f)!)).toBe('Licht');
    expect(findAnnotation(nextColor(g3, n), n)?.color).not.toBe(findAnnotation(g3, n)?.color);
    expect(removeAnnotation(g3, n).notes).toEqual([]);
    expect(removeAnnotation(g3, n).frames).toHaveLength(1);
  });

  it('resizes from a corner and keeps the opposite one in place', () => {
    const start = { x: 100, y: 100, width: 200, height: 100 };
    expect(resizedBox(start, 'se', 50, 20)).toEqual({ x: 100, y: 100, width: 250, height: 120 });
    expect(resizedBox(start, 'nw', 30, 10)).toEqual({ x: 130, y: 110, width: 170, height: 90 });
    // never smaller than the minimum, and the far corner stays put
    const tiny = resizedBox(start, 'nw', 500, 500);
    expect(tiny.x + tiny.width).toBe(300);
    expect(tiny.y + tiny.height).toBe(200);
  });

  it('a frame carries the cards and notes inside it, and only those', () => {
    const [g1, f] = addFrame(graph(), { x: -40, y: -40 }, { width: 400, height: 300 });
    const [g2, n] = addNote(g1, { x: 20, y: 150 });
    const frame = findAnnotation(g2, f);
    if (!frame || !isFrame(frame)) throw new Error('no frame');
    const members = frameMembers(g2, frame);
    expect(members).toEqual({ nodes: ['a'], notes: [n] });
    const moved = moveFrame(
      g2,
      f,
      {
        frame: { x: -40, y: -40 },
        nodes: new Map([['a', { x: 0, y: 0 }]]),
        notes: new Map([[n, { x: 20, y: 150 }]]),
      },
      100,
      20
    );
    expect(moved.nodes.find((c) => c.id === 'a')?.position).toEqual({ x: 100, y: 20 });
    expect(moved.nodes.find((c) => c.id === 'b')?.position).toEqual({ x: 1000, y: 0 });
    expect(moved.notes?.[0]).toMatchObject({ x: 120, y: 170 });
    expect(moved.frames?.[0]).toMatchObject({ x: 60, y: -20 });
  });

  it('frames the given cards', () => {
    const result = addFrameAround(graph(), ['a', 'b']);
    expect(result).not.toBeNull();
    const [g, id] = result!;
    const frame = findAnnotation(g, id)!;
    expect(frame.x).toBeLessThan(0);
    expect(frame.x + frame.width).toBeGreaterThan(1260);
    expect(addFrameAround(graph(), [])).toBeNull();
  });
});
