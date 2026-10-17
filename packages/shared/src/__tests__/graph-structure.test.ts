// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { FlowGraph } from '../schemas/graph';
import { validateGraphStructure } from '../schemas/graph';
import { uniqueId, withUniqueEdgeIds } from '../unique-id';

const graphWith = (edges: FlowGraph['edges']): FlowGraph => ({
  id: '55555555-6666-4777-8888-999999999999',
  version: 1,
  name: 'Edges',
  nodes: [
    {
      id: 'trigger_0',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { trigger: 'state', entity_id: ['binary_sensor.a'] },
    },
    { id: 'a', type: 'action', position: { x: 300, y: 0 }, data: { service: 'light.turn_on' } },
    { id: 'b', type: 'action', position: { x: 600, y: 0 }, data: { service: 'light.turn_off' } },
  ],
  edges,
});

describe('validateGraphStructure: edge ids', () => {
  it('rejects two edges with the same id', () => {
    const result = validateGraphStructure(
      graphWith([
        { id: 'e0', source: 'trigger_0', target: 'a' },
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e1', source: 'b', target: 'a' },
      ])
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Duplicate edge ID detected: e1']);
  });

  it('accepts the same connection drawn twice under different ids', () => {
    const result = validateGraphStructure(
      graphWith([
        { id: 'e0', source: 'trigger_0', target: 'a' },
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'b' },
      ])
    );
    expect(result.valid).toBe(true);
  });
});

describe('uniqueId', () => {
  it('adds a counter while the id is taken and records what it handed out', () => {
    const taken = new Set(['x']);
    expect(uniqueId('x', taken)).toBe('x_1');
    expect(uniqueId('x', taken)).toBe('x_2');
    expect(uniqueId('y', taken)).toBe('y');
    expect([...taken]).toEqual(['x', 'x_1', 'x_2', 'y']);
  });
});

describe('withUniqueEdgeIds', () => {
  it('renames repeated ids and leaves unique edges untouched', () => {
    const edges: FlowGraph['edges'] = [
      { id: 'e', source: 'trigger_0', target: 'a' },
      { id: 'e', source: 'trigger_0', target: 'a', type: 'hint' },
      { id: 'f', source: 'a', target: 'b' },
    ];
    const unique = withUniqueEdgeIds(edges);
    expect(unique.map((edge) => edge.id)).toEqual(['e', 'e_1', 'f']);
    expect(unique[0]).toBe(edges[0]);
    expect(unique[2]).toBe(edges[2]);
    expect(validateGraphStructure(graphWith(unique)).valid).toBe(true);
  });
});
