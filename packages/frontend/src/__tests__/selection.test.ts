import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { addFrameAround, findAnnotation } from '../annotations';
import {
  idsInBox,
  moveSelection,
  pasteSnapshot,
  positionsOf,
  removeSelection,
  selectionBox,
  snapshotSelection,
  toggleSelectionEnabled,
} from '../selection';

function graph(): FlowGraph {
  return {
    id: 'g',
    name: 'x',
    description: '',
    version: 1,
    nodes: [
      { id: 'a', type: 'trigger', position: { x: 0, y: 0 }, data: { trigger: 'state' } },
      { id: 'b', type: 'action', position: { x: 360, y: 0 }, data: { service: 'x.y' } },
      { id: 'c', type: 'action', position: { x: 1000, y: 400 }, data: { service: 'x.z' } },
    ],
    edges: [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ],
    notes: [{ id: 'n', x: 20, y: 200, width: 200, height: 100, text: 'hi' }],
  } as FlowGraph;
}

describe('selection', () => {
  it('finds the cards and notes a box touches', () => {
    expect(idsInBox(graph(), { x: -10, y: -10, width: 700, height: 400 }).sort()).toEqual([
      'a',
      'b',
      'n',
    ]);
    expect(idsInBox(graph(), { x: 900, y: 380, width: 50, height: 50 })).toEqual([]);
    expect(idsInBox(graph(), { x: 990, y: 390, width: 50, height: 50 })).toEqual(['c']);
  });

  it('boxes the selection', () => {
    expect(selectionBox(graph(), ['a', 'n'])).toEqual({ x: 0, y: 0, width: 260, height: 300 });
    expect(selectionBox(graph(), [])).toBeNull();
  });

  it('removes cards with their connections, and notes', () => {
    const next = removeSelection(graph(), ['b', 'n']);
    expect(next.nodes.map((n) => n.id)).toEqual(['a', 'c']);
    expect(next.edges).toEqual([]);
    expect(next.notes).toEqual([]);
  });

  it('switches cards off together, and on again when all are off', () => {
    const off = toggleSelectionEnabled(graph(), ['a', 'b']);
    expect(
      off.nodes.filter((n) => 'enabled' in n.data && n.data.enabled === false).map((n) => n.id)
    ).toEqual(['a', 'b']);
    const on = toggleSelectionEnabled(off, ['a', 'b']);
    expect(on.nodes.some((n) => 'enabled' in n.data && n.data.enabled === false)).toBe(false);
    // mixed: everything goes off first
    const mixed = toggleSelectionEnabled(off, ['a', 'b', 'c']);
    expect(mixed.nodes.every((n) => 'enabled' in n.data && n.data.enabled === false)).toBe(true);
  });

  it('copies cards with the connections among them only, under new ids', () => {
    const snapshot = snapshotSelection(graph(), ['a', 'b', 'n']);
    expect(snapshot.edges.map((e) => e.id)).toEqual(['e1']);
    const pasted = pasteSnapshot(graph(), snapshot, { x: 0, y: 500 });
    expect(pasted).not.toBeNull();
    const { graph: next, ids } = pasted!;
    expect(ids).toHaveLength(3);
    expect(next.nodes).toHaveLength(5);
    expect(next.edges).toHaveLength(3);
    expect(new Set(next.nodes.map((n) => n.id)).size).toBe(5);
    const copy = next.nodes.find((n) => n.id === ids[0])!;
    expect(copy.position).toEqual({ x: 0, y: 500 });
    // the new edge joins the copies, not the originals
    const added = next.edges.at(-1)!;
    expect(ids).toContain(added.source);
    expect(ids).toContain(added.target);
  });

  it('moves a selection as one', () => {
    const start = positionsOf(graph(), ['a', 'n']);
    const next = moveSelection(graph(), start, 20, 40);
    expect(next.nodes.find((n) => n.id === 'a')?.position).toEqual({ x: 20, y: 40 });
    expect(next.nodes.find((n) => n.id === 'b')?.position).toEqual({ x: 360, y: 0 });
    expect(next.notes?.[0]).toMatchObject({ x: 40, y: 240 });
  });

  it('puts a frame around the selection', () => {
    const [g, id] = addFrameAround(graph(), ['a', 'b'])!;
    const frame = findAnnotation(g, id)!;
    expect(frame.x).toBeLessThan(0);
    expect(frame.y).toBeLessThan(0);
    expect(frame.x + frame.width).toBeGreaterThan(620);
    expect(frame.y + frame.height).toBeGreaterThan(92);
  });
});
