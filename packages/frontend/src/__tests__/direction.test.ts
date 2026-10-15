import type { FlowGraph } from '@flode/shared';
import { axisOf } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import {
  branchCardId,
  branchLabelText,
  branchView,
  cardShape,
  storedPosition,
} from '../branch-view';
import {
  ADD_BELOW,
  detour,
  downPoints,
  HANDLE_OUTSIDE,
  handlePosition,
  NODE_HEIGHT,
  NODE_WIDTH,
  nextPosition,
  PORT_ROW,
} from '../flow-model';

/** A trigger, a choose with one option and a default, and a step after it — laid out top to bottom. */
function flow(direction?: 'down'): FlowGraph {
  return {
    id: '00000000-0000-4000-8000-000000000029',
    name: 'Issue 29',
    version: 1,
    nodes: [
      {
        id: 't',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { trigger: 'state', entity_id: 'input_boolean.test' },
      },
      {
        id: 'b',
        type: 'action',
        position: { x: 0, y: 200 },
        data: {
          _raw: {
            choose: [{ conditions: [], sequence: [{ delay: 1 }, { delay: 2 }] }],
            default: [{ delay: 3 }],
          },
        },
      },
      { id: 'n', type: 'action', position: { x: 0, y: 400 }, data: { service: 'notify.notify' } },
    ],
    edges: [
      { id: 'e1', source: 't', target: 'b' },
      { id: 'e2', source: 'b', target: 'n' },
    ],
    ...(direction ? { direction } : {}),
  };
}

const first = branchCardId('b', ['choose', 0, 'sequence', 0]);
const second = branchCardId('b', ['choose', 0, 'sequence', 1]);
const fallback = branchCardId('b', ['default', 0]);

describe('flows top to bottom (#29)', () => {
  it('draws branches side by side below the block, their steps going down', () => {
    const view = branchView(flow('down'));
    const at = new Map(view.graph.nodes.map((n) => [n.id, n.position]));
    const block = at.get('b') ?? { x: 0, y: 0 };
    // Steps below the block, the option left of the default …
    expect(at.get(first)?.y).toBeGreaterThan(block.y + NODE_HEIGHT);
    expect(at.get(first)?.x).toBeLessThan(at.get(fallback)?.x ?? 0);
    expect(at.get(first)?.y).toBe(at.get(fallback)?.y);
    // … one after the other in the option's lane …
    expect(at.get(second)?.x).toBe(at.get(first)?.x);
    expect(at.get(second)?.y).toBeGreaterThan((at.get(first)?.y ?? 0) + NODE_HEIGHT);
    // … the branches as wide apart as a card, and the next step moved down past them.
    expect((at.get(fallback)?.x ?? 0) - (at.get(first)?.x ?? 0)).toBeGreaterThanOrEqual(NODE_WIDTH);
    expect(at.get('n')?.y).toBeGreaterThan((at.get(second)?.y ?? 0) + NODE_HEIGHT);
    expect(at.get('n')?.x).toBe(0);
    // Stored where the user put it, not where it is drawn.
    expect(storedPosition(view, 'n', at.get('n') ?? { x: 0, y: 0 })).toEqual({ x: 0, y: 400 });
  });

  it('runs the lines of a branch straight down to the end of the block', () => {
    const view = branchView(flow('down'));
    const into = view.graph.edges.filter((e) => e.target === 'n');
    // The default (one step) runs on in its lane to the end of the longer option.
    const short = into.find((e) => e.source === fallback);
    const via = short ? view.via.get(short.id) : undefined;
    const lane = view.graph.nodes.find((n) => n.id === fallback)?.position.x ?? 0;
    expect(via?.at(-1)?.x).toBe(lane + NODE_WIDTH / 2);
  });

  it('puts the input at the top and the outputs along the bottom, with room for their names', () => {
    const view = branchView(flow('down'));
    const block = view.graph.nodes.find((n) => n.id === 'b');
    if (!block) throw new Error('no block');
    const shape = cardShape(view, block);
    expect(shape.height).toBe(NODE_HEIGHT + PORT_ROW);
    // The line ends at the input circle's edge, just above the card.
    expect(handlePosition(block, 'target', null, shape, view.axis)).toEqual({
      x: NODE_WIDTH / 2,
      y: 200 - HANDLE_OUTSIDE,
    });
    const out = shape.handles.map((h) => handlePosition(block, 'source', h, shape, view.axis));
    expect(out.map((p) => p.y)).toEqual([200 + shape.height, 200 + shape.height]);
    expect(out.map((p) => p.x)).toEqual([NODE_WIDTH / 3, (NODE_WIDTH * 2) / 3]);
  });

  it('lets Yes run straight on below a condition, No branch off to the side', () => {
    const view = branchView(flow('down'));
    const condition = {
      id: 'c',
      type: 'condition' as const,
      position: { x: 0, y: 0 },
      data: { condition: 'state', entity_id: 'sun.sun', state: 'above_horizon' },
    };
    const shape = { handles: ['true', 'false'], height: NODE_HEIGHT + PORT_ROW };
    expect(handlePosition(condition, 'source', 'true', shape, view.axis).x).toBe(NODE_WIDTH / 2);
    expect(handlePosition(condition, 'source', 'false', shape, view.axis).x).toBeCloseTo(
      (NODE_WIDTH * 5) / 6
    );
  });

  it('leaves left-to-right flows exactly as they were drawn', () => {
    const view = branchView(flow());
    const block = view.graph.nodes.find((n) => n.id === 'b');
    if (!block) throw new Error('no block');
    expect(view.axis.direction).toBe('right');
    expect(handlePosition(block, 'target', null, cardShape(view, block), view.axis)).toEqual(
      handlePosition(block, 'target', null, cardShape(view, block))
    );
    expect(nextPosition(flow(), { x: 0, y: 0 })).toEqual({ x: NODE_WIDTH + 120, y: 0 });
    expect(nextPosition(flow('down'), { x: 0, y: 0 })).toEqual({ x: 0, y: NODE_HEIGHT + 80 });
  });

  it('saves and reads back the direction with the layout', async () => {
    const { FlowTranspiler, buildAutomationSaveConfig } = await import('@flode/transpiler');
    const naming = { alias: 'x', description: '' };
    const down = buildAutomationSaveConfig(new FlowTranspiler(), flow('down'), naming);
    expect(down.config?.variables).toMatchObject({ _flode_metadata: { direction: 'down' } });
    const right = buildAutomationSaveConfig(new FlowTranspiler(), flow(), naming);
    expect(JSON.stringify(right.config)).not.toContain('direction');

    const { dump } = await import('js-yaml');
    const parsed = await new FlowTranspiler().fromYaml(dump(down.config), { keepBlocks: true });
    expect(parsed.graph?.direction).toBe('down');
    const plain = await new FlowTranspiler().fromYaml(dump(right.config), { keepBlocks: true });
    expect(plain.graph?.direction).toBeUndefined();
  });

  it('keeps a flow arranged left to right on purpose so, when flows open top to bottom', async () => {
    const { FlowTranspiler, buildAutomationSaveConfig } = await import('@flode/transpiler');
    const { dump } = await import('js-yaml');
    const graph: FlowGraph = { ...flow(), direction: 'right' };
    const saved = buildAutomationSaveConfig(new FlowTranspiler(), graph, {
      alias: 'x',
      description: '',
    });
    expect(saved.config?.variables).toMatchObject({ _flode_metadata: { direction: 'right' } });
    const parsed = await new FlowTranspiler().fromYaml(dump(saved.config), { keepBlocks: true });
    expect(parsed.graph?.direction).toBe('right');
  });

  it('stays top to bottom when a step added in HA makes the saved layout unusable', async () => {
    const { FlowTranspiler, buildAutomationSaveConfig } = await import('@flode/transpiler');
    const { dump } = await import('js-yaml');
    const saved = buildAutomationSaveConfig(new FlowTranspiler(), flow('down'), {
      alias: 'x',
      description: '',
    });
    const config = saved.config ?? {};
    const actions = Array.isArray(config.actions) ? config.actions : [];
    expect(actions.length).toBeGreaterThan(0);
    const edited = { ...config, actions: [...actions, { delay: 9 }] };
    const parsed = await new FlowTranspiler().fromYaml(dump(edited), { keepBlocks: true });
    expect(parsed.graph?.direction).toBe('down');
    const nodes = parsed.graph?.nodes ?? [];
    const trigger = nodes.find((n) => n.type === 'trigger');
    // Laid out again — top to bottom.
    expect(Math.max(...nodes.map((n) => n.position.y))).toBeGreaterThan(trigger?.position.y ?? 0);
    expect(new Set(nodes.map((n) => n.position.x)).size).toBeLessThan(nodes.length);
  });

  it('offers a "+" after a block nothing follows, past its branches (both directions)', () => {
    for (const direction of ['down', undefined] as const) {
      const graph = flow(direction);
      const last = { ...graph, edges: graph.edges.filter((e) => e.id !== 'e2') };
      const view = branchView(last);
      const tail = view.tails.get('b');
      expect(tail?.exits.length).toBe(2);
      const ends = view.graph.nodes.filter((n) => n.id === second || n.id === fallback);
      const along = (p: { x: number; y: number }) => (direction === 'down' ? p.y : p.x);
      for (const card of ends)
        expect(along(tail?.at ?? { x: 0, y: 0 })).toBeGreaterThan(along(card.position));
      // With a step after it, the block needs none.
      expect(branchView(graph).tails.has('b')).toBe(false);
    }
  });

  it('shortens the names of many options to their number', () => {
    expect(branchLabelText('de', { kind: 'option', number: 3, alias: 'Abends' }, true)).toBe('3');
    expect(branchLabelText('de', { kind: 'default' }, true)).toBe('Standard');
    expect(branchLabelText('de', { kind: 'default' })).toBe('Standard');
  });

  it('routes a line past cards in its way top to bottom, never left to right', () => {
    const card = (id: string, x: number, y: number) => ({
      id,
      type: 'trigger' as const,
      position: { x, y },
      data: { trigger: 'state' },
    });
    const below = [card('t5', 0, 172)];
    const from = { x: NODE_WIDTH / 2, y: NODE_HEIGHT };
    const to = { x: 400, y: 600 };
    const none = new Set<string>();
    const bends = detour(axisOf('down'), from, to, below, none, () => NODE_HEIGHT);
    // Into the gap right of the card in the way, along it, past its bottom.
    expect(bends.at(-2)).toEqual({ x: NODE_WIDTH + 30, y: 172 });
    expect(bends.at(-1)?.x).toBe(NODE_WIDTH + 30);
    expect(bends.at(-1)?.y).toBeGreaterThan(172 + NODE_HEIGHT);
    expect(detour(axisOf('right'), from, to, below, none, () => NODE_HEIGHT)).toEqual([]);
    expect(
      detour(axisOf('down'), from, to, [card('x', 600, 172)], none, () => NODE_HEIGHT)
    ).toEqual([]);
  });

  it.each([
    5, 6, 9, 12,
  ])('leads the lines of %i triggers in rows past every card', async (count) => {
    const { applyHeuristicLayout } = await import('@flode/transpiler');
    const ids = Array.from({ length: count }, (_, i) => `t${i}`);
    const nodes = await applyHeuristicLayout(
      [
        ...ids.map((id) => ({
          id,
          type: 'trigger' as const,
          position: { x: 0, y: 0 },
          data: { trigger: 'state' },
        })),
        { id: 'a', type: 'action', position: { x: 0, y: 0 }, data: { service: 'light.turn_on' } },
      ],
      ids.map((id) => ({ id: `e-${id}`, source: id, target: 'a' })),
      Object.fromEntries(
        [...ids, 'a'].map((id) => [id, { width: NODE_WIDTH, height: NODE_HEIGHT }])
      ),
      'down'
    );
    const axis = axisOf('down');
    const shape = { handles: [null], height: NODE_HEIGHT };
    const target = nodes.find((n) => n.id === 'a');
    if (!target) throw new Error('no action');
    const to = handlePosition(target, 'target', null, shape, axis);
    for (const id of ids) {
      const source = nodes.find((n) => n.id === id);
      if (!source) throw new Error(id);
      const from = handlePosition(source, 'source', null, shape, axis);
      const others = nodes.filter((n) => n.id !== id && n.id !== 'a');
      const points = [
        from,
        ...detour(axis, from, to, nodes, new Set([id, 'a']), () => NODE_HEIGHT),
        to,
      ];
      // Along each straight piece of the line: never inside another card.
      for (const [i, p] of points.slice(1).entries()) {
        const q = points[i] ?? p;
        for (let step = 0; step <= 20; step++) {
          const x = q.x + ((p.x - q.x) * step) / 20;
          const y = q.y + ((p.y - q.y) * step) / 20;
          const hit = others.find(
            (n) =>
              x > n.position.x &&
              x < n.position.x + NODE_WIDTH &&
              y > n.position.y &&
              y < n.position.y + NODE_HEIGHT
          );
          expect(hit?.id, `${id} runs through ${hit?.id}`).toBeUndefined();
        }
      }
    }
  });

  it('offers the "+" after a block with empty branches, a nested block last, or only a hint after it', () => {
    const block = (raw: Record<string, unknown>, hint = false): FlowGraph => ({
      ...flow('down'),
      nodes: [
        { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { trigger: 'state' } },
        { id: 'b', type: 'action', position: { x: 0, y: 200 }, data: { _raw: raw } },
      ],
      edges: [
        { id: 'e1', source: 't', target: 'b' },
        ...(hint ? [{ id: 'h', source: 'b', target: 't', type: 'hint' as const }] : []),
      ],
    });
    const empty = branchView(block({ choose: [{ conditions: [], sequence: [] }] }));
    expect(empty.tails.get('b')?.exits.length).toBeGreaterThan(0);
    const nested = branchView(
      block({
        if: [],
        then: [{ choose: [{ conditions: [], sequence: [{ delay: 1 }] }], default: [{ delay: 2 }] }],
      })
    );
    const inner = nested.graph.nodes.filter((n) => n.id !== 'b' && n.id !== 't');
    const tail = nested.tails.get('b');
    expect(tail).toBeDefined();
    for (const card of inner) expect(tail?.at.y ?? 0).toBeGreaterThan(card.position.y);
    // The block last in "then" has its own "+" (a step after it stays in "then"), its
    // branches meeting there; the flow runs on from it to the outer "+".
    const innerTail = nested.tails.get(branchCardId('b', ['then', 0]));
    expect(innerTail?.through).toBe(true);
    expect(innerTail?.exits.length).toBe(2);
    expect(innerTail?.at).not.toEqual(tail?.at);
    expect(tail?.exits.some((exit) => exit.start === innerTail?.at)).toBe(true);
    expect(branchView(block({ if: [], then: [{ delay: 1 }] }, true)).tails.has('b')).toBe(true);
  });

  it('runs a line straight down through its "+" first, and joins lines into one card just above it', () => {
    const from = { x: 0, y: 100 };
    const to = { x: 200, y: 300 };
    const [, straight] = downPoints([from, to], false);
    expect(straight?.x).toBe(0);
    expect(straight?.y).toBeGreaterThan(from.y + ADD_BELOW);
    const joined = downPoints([from, to], true);
    expect(joined.at(-2)).toEqual({ x: 200, y: 300 - 24 });
    // A branch lane ending at the card's edge (below the input) is left out.
    expect(downPoints([from, { x: 200, y: 306 }, to], false)).not.toContainEqual({
      x: 200,
      y: 306,
    });
    // Straight below: nothing added.
    expect(downPoints([from, { x: 0, y: 300 }], true)).toEqual([from, { x: 0, y: 300 }]);
  });

  it('keeps the "+" after a block last in a branch clear of what follows the outer block', () => {
    const inner = {
      choose: [
        { conditions: [], sequence: [{ delay: 1 }] },
        { conditions: [], sequence: [] },
      ],
      default: [],
    };
    for (const direction of ['down', undefined] as const) {
      const graph: FlowGraph = {
        ...flow(direction),
        nodes: [
          { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { trigger: 'state' } },
          {
            id: 'b',
            type: 'action',
            position: { x: 0, y: 200 },
            data: { _raw: { if: [], then: [inner], else: [] } },
          },
          {
            id: 'n',
            type: 'action',
            position: { x: 0, y: 400 },
            data: { service: 'notify.notify' },
          },
        ],
      };
      const view = branchView(graph);
      const tail = view.tails.get(branchCardId('b', ['then', 0]));
      const next = view.graph.nodes.find((n) => n.id === 'n');
      if (!tail || !next) throw new Error('missing');
      const inside =
        tail.at.x > next.position.x - 11 &&
        tail.at.x < next.position.x + NODE_WIDTH + 11 &&
        tail.at.y > next.position.y - 11 &&
        tail.at.y < next.position.y + NODE_HEIGHT + 11;
      expect(inside).toBe(false);
    }
  });
});
