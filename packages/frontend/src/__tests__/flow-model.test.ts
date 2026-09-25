import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import {
  addNode,
  connect,
  connectionError,
  ensureScriptEntry,
  graphBounds,
  handlePosition,
  moveNode,
  NODE_HEIGHT,
  NODE_TYPES,
  NODE_WIDTH,
  removeNode,
  scriptEntryIds,
  updateNodeData,
  visibleGraph,
} from '../flow-model';

const base: FlowGraph = {
  id: '00000000-0000-4000-8000-000000000000',
  name: 'Test',
  version: 1,
  nodes: [
    {
      id: 't',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { trigger: 'state', entity_id: 'light.a' },
    },
    {
      id: 'c',
      type: 'condition',
      position: { x: 300, y: 0 },
      data: { condition: 'state', entity_id: 'light.a', state: 'on' },
    },
    { id: 'a', type: 'action', position: { x: 600, y: 0 }, data: { service: 'light.turn_on' } },
  ],
  edges: [{ id: 'e1', source: 't', target: 'c' }],
};

describe('flow-model', () => {
  it('adds every node type with schema-valid defaults', () => {
    let graph = base;
    for (const type of NODE_TYPES)
      graph = addNode(graph, type, { x: 0, y: 200 }, `new_${type}`).graph;
    expect(graph.nodes.map((n) => n.id).slice(3)).toEqual(NODE_TYPES.map((t) => `new_${t}`));
  });

  it('connects with branch handles and refuses bad connections', () => {
    const graph = connect(base, { source: 'c', sourceHandle: 'true', target: 'a' });
    expect(graph.edges.at(-1)).toEqual({
      id: 'e-c-true-a',
      source: 'c',
      target: 'a',
      sourceHandle: 'true',
    });
    expect(connectionError(graph, { source: 'c', sourceHandle: 'true', target: 'a' })).toBe(
      'duplicate'
    );
    expect(connectionError(graph, { source: 'a', sourceHandle: null, target: 't' })).toBe(
      'trigger-target'
    );
    expect(connectionError(graph, { source: 'a', sourceHandle: null, target: 'a' })).toBe('self');
  });

  it('removes a node with its edges and moves nodes', () => {
    expect(removeNode(base, 'c').edges).toEqual([]);
    expect(moveNode(base, 'a', 10, 20).nodes[2]?.position).toEqual({ x: 10, y: 20 });
  });

  it('validates edited data against the node schema', () => {
    expect(updateNodeData(base, 'a', { service: 'light.turn_off' }).error).toBeNull();
    expect(updateNodeData(base, 't', 42).error).not.toBeNull();
  });

  it('treats keys holding undefined as absent (HA editors send them)', () => {
    const same = updateNodeData(base, 't', {
      trigger: 'state',
      entity_id: 'light.a',
      description: undefined,
    });
    expect(same.graph).toBe(base);
  });

  it('ignores an identical data echo from the editor', () => {
    const same = updateNodeData(base, 't', { entity_id: 'light.a', trigger: 'state' });
    expect(same.error).toBeNull();
    expect(same.graph).toBe(base);
  });

  it('computes bounds and handle anchors', () => {
    expect(graphBounds(base)).toEqual({ x: 0, y: 0, width: 600 + NODE_WIDTH, height: NODE_HEIGHT });
    const condition = base.nodes[1];
    if (!condition) throw new Error('fixture');
    expect(handlePosition(condition, 'source', 'false').y).toBeGreaterThan(
      handlePosition(condition, 'source', 'true').y
    );
    expect(handlePosition(condition, 'target')).toEqual({ x: 300, y: NODE_HEIGHT / 2 });
  });
});

describe('freePosition', () => {
  it('moves a new card below occupied spots', async () => {
    const { freePosition } = await import('../flow-model');
    expect(freePosition(base, { x: 10, y: 10 })).toEqual({ x: 10, y: 10 + NODE_HEIGHT + 40 });
    expect(freePosition(base, { x: 0, y: 500 })).toEqual({ x: 0, y: 500 });
  });
});

describe('scripts: hidden start, first card is the beginning', () => {
  const script: FlowGraph = {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Skript',
    version: 1,
    nodes: [
      {
        id: 's',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { trigger: 'flode_script_start' },
      },
      { id: 'b', type: 'delay', position: { x: 800, y: 0 }, data: { delay: '00:00:01' } },
      { id: 'a', type: 'action', position: { x: 400, y: 0 }, data: { service: 'light.turn_on' } },
    ],
    edges: [],
  };

  it('never shows the start node or its edges', () => {
    const shown = visibleGraph(ensureScriptEntry(script));
    expect(shown.nodes.map((n) => n.id)).toEqual(['b', 'a']);
    expect(shown.edges).toEqual([]);
  });

  it('makes the left-most card without predecessor the beginning', () => {
    const graph = ensureScriptEntry(script);
    expect([...scriptEntryIds(graph)]).toEqual(['a']);
    expect(ensureScriptEntry(graph)).toBe(graph);
  });

  it('leaves automations alone', () => {
    expect(ensureScriptEntry(base)).toBe(base);
    expect(visibleGraph(base)).toBe(base);
  });
});
