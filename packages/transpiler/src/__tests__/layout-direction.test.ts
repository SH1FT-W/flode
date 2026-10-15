import type { FlowEdge, FlowNode } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { applyHeuristicLayout } from '../parser/layout';

const nodes: FlowNode[] = [
  { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { trigger: 'state' } },
  {
    id: 'c',
    type: 'condition',
    position: { x: 0, y: 0 },
    data: { condition: 'state', entity_id: 'sun.sun', state: 'above_horizon' },
  },
  { id: 'yes', type: 'action', position: { x: 0, y: 0 }, data: { service: 'light.turn_on' } },
  { id: 'no', type: 'action', position: { x: 0, y: 0 }, data: { service: 'light.turn_off' } },
];
const edges: FlowEdge[] = [
  { id: 'e1', source: 't', target: 'c' },
  { id: 'e2', source: 'c', target: 'yes', sourceHandle: 'true' },
  { id: 'e3', source: 'c', target: 'no', sourceHandle: 'false' },
];

function at(laidOut: FlowNode[], id: string) {
  const node = laidOut.find((n) => n.id === id);
  if (!node) throw new Error(id);
  return node.position;
}

describe('layout direction (#29)', () => {
  it('lays a flow out left to right by default', async () => {
    const laidOut = await applyHeuristicLayout(nodes, edges);
    expect(at(laidOut, 'c').x).toBeGreaterThan(at(laidOut, 't').x);
    expect(at(laidOut, 'yes').x).toBeGreaterThan(at(laidOut, 'c').x);
    // Yes above No.
    expect(at(laidOut, 'yes').y).toBeLessThan(at(laidOut, 'no').y);
  });

  it('lays a flow out top to bottom, Yes left of No', async () => {
    const laidOut = await applyHeuristicLayout(nodes, edges, undefined, 'down');
    expect(at(laidOut, 'c').y).toBeGreaterThan(at(laidOut, 't').y);
    expect(at(laidOut, 'yes').y).toBeGreaterThan(at(laidOut, 'c').y);
    expect(at(laidOut, 'yes').x).toBeLessThan(at(laidOut, 'no').x);
  });
});

describe('layout direction: order of parallel cards (#29)', () => {
  it('puts many triggers in reading order, four to a row, above the flow (top to bottom)', async () => {
    // Like a real morning routine: twelve triggers into a chain of conditions.
    const ids = Array.from({ length: 12 }, (_, i) => `t${i}`);
    const triggers: FlowNode[] = ids.map((id) => ({
      id,
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { trigger: 'state' },
    }));
    const chain: FlowNode[] = ['c1', 'c2'].map((id) => ({
      id,
      type: 'condition',
      position: { x: 0, y: 0 },
      data: { condition: 'state', entity_id: 'sun.sun', state: 'above_horizon' },
    }));
    const laidOut = await applyHeuristicLayout(
      [...triggers, ...chain],
      [
        ...ids.map((id) => ({ id: `e-${id}`, source: id, target: 'c1' })),
        { id: 'e-c', source: 'c1', target: 'c2', sourceHandle: 'true' },
      ],
      // Sizes as "Aufräumen" measures them.
      Object.fromEntries([...ids, 'c1', 'c2'].map((id) => [id, { width: 260, height: 92 }])),
      'down'
    );
    const places = ids.map((id) => at(laidOut, id));
    // Reading order: row by row, left to right within a row.
    const reading = [...places].sort((a, b) => a.y - b.y || a.x - b.x);
    expect(places).toEqual(reading);
    const rows = new Set(places.map((p) => p.y));
    expect(rows.size).toBe(3);
    const lastRow = Math.max(...rows);
    expect(at(laidOut, 'c1').y).toBeGreaterThan(lastRow + 92);
  });

  it('keeps a chain of conditions in one line top to bottom (Yes runs straight on)', async () => {
    const chain: FlowNode[] = [
      { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { trigger: 'state' } },
      ...['c1', 'c2', 'c3'].map(
        (id): FlowNode => ({
          id,
          type: 'condition',
          position: { x: 0, y: 0 },
          data: { condition: 'state', entity_id: 'sun.sun', state: 'above_horizon' },
        })
      ),
    ];
    const laidOut = await applyHeuristicLayout(
      chain,
      [
        { id: 'e0', source: 't', target: 'c1' },
        { id: 'e1', source: 'c1', target: 'c2', sourceHandle: 'true' },
        { id: 'e2', source: 'c2', target: 'c3', sourceHandle: 'true' },
      ],
      Object.fromEntries(['t', 'c1', 'c2', 'c3'].map((id) => [id, { width: 260, height: 112 }])),
      'down'
    );
    expect(new Set(['t', 'c1', 'c2', 'c3'].map((id) => at(laidOut, id).x)).size).toBe(1);
  });

  it('keeps Yes left of No top to bottom, whichever line was drawn first', async () => {
    const card = (id: string, type: FlowNode['type']): FlowNode =>
      type === 'condition'
        ? {
            id,
            type,
            position: { x: 0, y: 0 },
            data: { condition: 'state', entity_id: 'sun.sun', state: 'on' },
          }
        : { id, type: 'action', position: { x: 0, y: 0 }, data: { service: 'light.turn_on' } };
    const laidOut = await applyHeuristicLayout(
      [card('c', 'condition'), card('no', 'action'), card('yes', 'action')],
      [
        { id: 'e1', source: 'c', target: 'no', sourceHandle: 'false' },
        { id: 'e2', source: 'c', target: 'yes', sourceHandle: 'true' },
      ],
      undefined,
      'down'
    );
    expect(at(laidOut, 'yes').x).toBeLessThan(at(laidOut, 'no').x);
  });
});
