import { axisOf, CONDITION_STEP_KEY, type FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import {
  acrossPoints,
  addNode,
  backCrossing,
  cardHandles,
  connect,
  connectionError,
  duplicateNode,
  ensureScriptEntry,
  graphBounds,
  handlePosition,
  insertBetween,
  moveNode,
  NODE_HEIGHT,
  NODE_TYPES,
  NODE_WIDTH,
  removeNode,
  runsBack,
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
  it('inserts a card between an output and what follows it, moving the rest on', () => {
    const chain = connect(base, { source: 'c', sourceHandle: 'true', target: 'a' });
    const added = addNode(chain, 'action', { x: 0, y: 400 }, 'n').graph;
    const graph = insertBetween(added, 'c', 'true', 'n');
    expect(graph.edges.map((e) => [e.source, e.sourceHandle ?? null, e.target])).toEqual([
      ['t', null, 'c'],
      ['c', 'true', 'n'],
      ['n', null, 'a'],
    ]);
    const at = (id: string) => graph.nodes.find((n) => n.id === id)?.position;
    expect(at('n')).toEqual({ x: 600, y: 0 });
    expect(at('a')).toEqual({ x: 600 + NODE_WIDTH + 120, y: 0 });
    expect(at('c')).toEqual({ x: 300, y: 0 });
    // Nothing follows the other output: the card just goes after it.
    expect(insertBetween(added, 'c', 'false', 'n').edges.at(-1)).toMatchObject({
      source: 'c',
      sourceHandle: 'false',
      target: 'n',
    });
  });

  it('puts a step inserted after a trigger after every trigger leading to the same step', () => {
    const second = addNode(base, 'trigger', { x: 0, y: 200 }, 't2').graph;
    const both = connect(second, { source: 't2', sourceHandle: null, target: 'c' });
    const added = addNode(both, 'condition', { x: 0, y: 400 }, 'n').graph;
    const graph = insertBetween(added, 't', null, 'n');
    expect(graph.edges.map((e) => [e.source, e.sourceHandle ?? null, e.target])).toEqual([
      ['t', null, 'n'],
      ['t2', null, 'n'],
      ['n', 'true', 'c'],
    ]);
  });

  it('leads on through a new condition by its yes', () => {
    const chain = connect(base, { source: 'c', sourceHandle: 'true', target: 'a' });
    const added = addNode(chain, 'condition', { x: 0, y: 400 }, 'n').graph;
    const graph = insertBetween(added, 'c', 'true', 'n');
    expect(graph.edges.at(-1)).toMatchObject({ source: 'n', sourceHandle: 'true', target: 'a' });
  });

  it('puts a card inserted into a loop back after the source, not onto the earlier card', () => {
    const early = addNode(base, 'action', { x: 0, y: 200 }, 't2').graph;
    const withEarly = connect(early, { source: 'c', sourceHandle: 'false', target: 't2' });
    const added = addNode(withEarly, 'action', { x: 0, y: 600 }, 'n').graph;
    const graph = insertBetween(added, 'c', 'false', 'n');
    const at = (id: string) => graph.nodes.find((n) => n.id === id)?.position;
    expect(at('t2')).toEqual({ x: 0, y: 200 });
    expect(at('n')).not.toEqual(at('t2'));
    expect(at('n')?.x).toBeGreaterThan(300);
  });

  it('inserts top to bottom one row further down, leaving a loop back in place', () => {
    const down: FlowGraph = { ...base, direction: 'down' };
    const looped = connect(connect(down, { source: 'c', sourceHandle: 'true', target: 'a' }), {
      source: 'a',
      sourceHandle: null,
      target: 'c',
    });
    const placed = moveNode(moveNode(looped, 'c', 0, 200), 'a', 0, 400);
    const added = addNode(placed, 'delay', { x: 500, y: 0 }, 'n').graph;
    const graph = insertBetween(added, 'c', 'true', 'n');
    const at = (id: string) => graph.nodes.find((n) => n.id === id)?.position;
    expect(at('n')).toEqual({ x: 0, y: 400 });
    expect(at('a')).toEqual({ x: 0, y: 400 + NODE_HEIGHT + 80 });
    expect(at('c')).toEqual({ x: 0, y: 200 });
  });

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

describe('automation without triggers: hidden start until it gets a trigger', () => {
  const manual: FlowGraph = {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Nur manuell',
    version: 1,
    nodes: [
      {
        id: 's',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { trigger: 'flode_manual_start' },
      },
      { id: 'a', type: 'action', position: { x: 400, y: 0 }, data: { service: 'light.turn_on' } },
    ],
    edges: [{ id: 's-a', source: 's', target: 'a' }],
  };
  const trigger = {
    id: 't',
    type: 'trigger' as const,
    position: { x: -400, y: 0 },
    data: { trigger: 'state', entity_id: 'light.b' },
  };

  it('hides the start like a script', () => {
    expect(visibleGraph(manual).nodes.map((n) => n.id)).toEqual(['a']);
    expect([...scriptEntryIds(manual)]).toEqual(['a']);
    expect(ensureScriptEntry(manual)).toBe(manual);
  });

  it('drops the start once a trigger is added — never wires the start to that trigger', () => {
    const graph = ensureScriptEntry({ ...manual, nodes: [...manual.nodes, trigger] });
    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 't']);
    expect(graph.edges).toEqual([]);
  });
});

describe('duplicating a card', () => {
  const chain: FlowGraph = {
    ...base,
    edges: [
      { id: 'e1', source: 't', target: 'c' },
      { id: 'e2', source: 'c', target: 'a', sourceHandle: 'true' },
    ],
  };

  it('puts the copy right after the card, on its Yes path', () => {
    const { graph, id } = duplicateNode(chain, chain.nodes[1]!, { x: 300, y: 300 });
    const edges = graph.edges.map((e) => `${e.source}-${e.sourceHandle ?? ''}-${e.target}`);
    expect(edges).toEqual(['t--c', `c-true-${id}`, `${id}-true-a`]);
  });

  it('lets a trigger’s copy start the same steps', () => {
    const { graph, id } = duplicateNode(chain, chain.nodes[0]!, { x: 0, y: 300 });
    expect(graph.edges.filter((e) => e.source === id).map((e) => e.target)).toEqual(['c']);
    expect(graph.edges.filter((e) => e.source === 't').map((e) => e.target)).toEqual(['c']);
  });
});

describe('lines left to right (#31)', () => {
  it('leaves out a lane bend where a moved branch step now starts', () => {
    const from = { x: 680, y: 258 };
    const lane = { x: 780, y: 258 };
    const to = { x: 780, y: 306 };
    expect(acrossPoints([from, lane, to])).toEqual([from, to]);
  });

  it('leaves out the lane when the step was moved back before its branch output', () => {
    const from = { x: 280, y: 437 };
    const lane = { x: 410, y: 375 };
    const to = { x: 185, y: 141 };
    expect(acrossPoints([from, lane, to])).toEqual([from, to]);
  });

  it('keeps bends well before the target and those of a loop back', () => {
    const forward = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 300, y: 40 },
    ];
    expect(acrossPoints(forward)).toEqual(forward);
    const loop = [
      { x: 500, y: 0 },
      { x: 520, y: 120 },
      { x: 80, y: 120 },
      { x: 100, y: 0 },
    ];
    expect(acrossPoints(loop, true)).toEqual(loop);
  });
});

describe('lines running back (#31)', () => {
  const right = axisOf('right');
  const down = axisOf('down');
  const card = (x: number, y: number, height = 92) => ({ x, y, width: 260, height });

  it('runs back when the input is not clearly past the output', () => {
    expect(runsBack(right, { x: 500, y: 100 }, { x: 540, y: 300 })).toBe(true);
    expect(runsBack(right, { x: 500, y: 100 }, { x: 200, y: 100 })).toBe(true);
    expect(runsBack(right, { x: 500, y: 100 }, { x: 620, y: 300 })).toBe(false);
    expect(runsBack(down, { x: 100, y: 500 }, { x: 300, y: 520 })).toBe(true);
    expect(runsBack(down, { x: 100, y: 500 }, { x: 300, y: 600 })).toBe(false);
  });

  it('crosses over in the middle of the gap between the cards', () => {
    // Source card 100..192, target card above it at -100..-8: the gap is -8..100.
    expect(
      backCrossing(right, { x: 360, y: 150 }, { x: 50, y: -60 }, card(100, 100), card(50, -100))
    ).toBe(46);
    // Top to bottom the gap is across in x.
    expect(
      backCrossing(down, { x: 230, y: 192 }, { x: 530, y: 100 }, card(100, 100), card(400, 100))
    ).toBe(380);
  });

  it('goes round both cards where they overlap across the flow', () => {
    // Target beside the source, lower: below both (the lower card's bottom plus the lane).
    expect(
      backCrossing(right, { x: 360, y: 150 }, { x: 50, y: 180 }, card(100, 100), card(50, 140))
    ).toBe(262);
    // Target higher: above both.
    expect(
      backCrossing(right, { x: 360, y: 150 }, { x: 50, y: 120 }, card(100, 100), card(50, 80))
    ).toBe(50);
  });
});

describe('ids of added cards', () => {
  const base: FlowGraph = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    version: 1,
    name: 'ids',
    nodes: [
      {
        id: 't',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { trigger: 'state', entity_id: 'light.a' },
      },
    ],
    edges: [],
  };

  it('stay unique when many cards are added within the same millisecond', () => {
    let graph = base;
    for (let i = 0; i < 100; i++) {
      graph = addNode(graph, 'action', { x: 0, y: 100 * (i + 1) }).graph;
    }
    expect(graph.nodes).toHaveLength(101);
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(101);
  });

  it('stay unique when a card is duplicated twice in a row', () => {
    const once = duplicateNode(base, base.nodes[0], { x: 0, y: 200 });
    const twice = duplicateNode(once.graph, base.nodes[0], { x: 0, y: 400 });
    expect(twice.graph.nodes).toHaveLength(3);
    expect(new Set(twice.graph.nodes.map((n) => n.id)).size).toBe(3);
  });
});

describe('gate conditions: no No where HA has no else (#40)', () => {
  const handlesOf = (graph: FlowGraph, id: string) => {
    const node = graph.nodes.find((n) => n.id === id);
    return node ? cardHandles(graph, node) : [];
  };
  const chain = connect(base, { source: 'c', sourceHandle: 'true', target: 'a' });

  it('a condition right after the triggers only goes on', () => {
    expect(handlesOf(chain, 'c')).toEqual(['true']);
  });

  it('so does one after another gate condition, through its Yes', () => {
    const added = addNode(chain, 'condition', { x: 0, y: 400 }, 'c2').graph;
    const graph = insertBetween(added, 'c', 'true', 'c2');
    expect(handlesOf(graph, 'c2')).toEqual(['true']);
  });

  it('keeps Yes and No once No leads somewhere (an if / else, or an inverted one)', () => {
    const added = addNode(chain, 'action', { x: 0, y: 400 }, 'n').graph;
    const graph = connect(added, { source: 'c', sourceHandle: 'false', target: 'n' });
    expect(handlesOf(graph, 'c')).toEqual(['true', 'false']);
  });

  it('a condition step of the actions is a gate, an if among the actions is not', () => {
    const step = addNode(chain, 'condition', { x: 900, y: 0 }, 's').graph;
    const after = connect(step, { source: 'a', sourceHandle: null, target: 's' });
    expect(handlesOf(after, 's')).toEqual(['true', 'false']);
    const asStep = updateNodeData(after, 's', {
      condition: 'state',
      entity_id: 'light.a',
      state: 'on',
      [CONDITION_STEP_KEY]: true,
    }).graph;
    expect(handlesOf(asStep, 's')).toEqual(['true']);
  });

  it('only conditions are gates', () => {
    expect(handlesOf(chain, 'a')).toEqual([null]);
  });
});
