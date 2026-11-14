import { axisOf, type FlowGraph, type FlowNode, NODE_GAP } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { branchView, cardShape, viewCardRows } from '../branch-view';
import {
  cardRows,
  detour,
  detourAmong,
  graphIndex,
  isGateCondition,
  moveNode,
  NODE_HEIGHT,
  NODE_WIDTH,
  outgoing,
  PAST_ADD,
  updateNodeData,
} from '../flow-model';
import type { HomeAssistant } from '../ha';
import { summaryContext } from '../i18n';
import { nodeIssues, summarize } from '../node-meta';

const card = (id: string, x: number, y: number): FlowNode => ({
  id,
  type: 'action',
  position: { x, y },
  data: { action: 'light.turn_on' },
});

/** `detour` as it was before `cardRows`: every card checked for every line (the oracle). */
function naiveDetour(
  from: { x: number; y: number },
  to: { x: number; y: number },
  cards: readonly FlowNode[],
  skip: ReadonlySet<string>,
  height: (node: FlowNode) => number
): { x: number; y: number }[] {
  if (to.y <= from.y) return [];
  const lane = NODE_GAP / 2;
  const crossAt = (y: number) => from.x + ((to.x - from.x) * (y - from.y)) / (to.y - from.y);
  const between = cards.filter(
    (n) => !skip.has(n.id) && n.position.y > from.y && n.position.y + height(n) < to.y
  );
  const inWay = between.some((n) => {
    const a = crossAt(n.position.y);
    const b = crossAt(n.position.y + height(n));
    return (
      Math.max(a, b) > n.position.x - lane && Math.min(a, b) < n.position.x + NODE_WIDTH + lane
    );
  });
  if (!inWay) return [];
  const free = (x: number) =>
    between.every((n) => x <= n.position.x - lane / 2 || x >= n.position.x + NODE_WIDTH + lane / 2);
  const cost = (x: number) => Math.abs(x - from.x) + Math.abs(x - to.x);
  const best = between
    .flatMap((n) => [n.position.x - lane, n.position.x + NODE_WIDTH + lane])
    .filter(free)
    .reduce((b, x) => (cost(x) < cost(b) ? x : b), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(best)) return [];
  const top = Math.min(...between.map((n) => n.position.y));
  const bottom = Math.max(...between.map((n) => n.position.y + height(n)));
  const below = from.y + PAST_ADD;
  const leave = Math.min(bottom + PAST_ADD, to.y - 24);
  return [
    ...(below < top ? [{ x: from.x, y: below }] : []),
    { x: best, y: top },
    ...(leave > bottom ? [{ x: best, y: leave }] : []),
  ];
}

describe('detourAmong (cards sorted once per picture)', () => {
  it('finds the same bends as checking every card, for many lines through a grid', () => {
    // A grid with gaps and equal-cost lanes, cards out of order, two heights.
    const cards: FlowNode[] = [];
    for (let row = 5; row >= 0; row--) {
      for (let col = 0; col < 6; col++) {
        if ((row + col) % 4 !== 3) cards.push(card(`c${row}-${col}`, col * 300, row * 200));
      }
    }
    const height = (n: FlowNode) => (n.id.endsWith('-2') ? NODE_HEIGHT + 20 : NODE_HEIGHT);
    const rows = cardRows(cards, height);
    const axis = axisOf('down');
    let bent = 0;
    for (const source of cards) {
      for (const target of cards) {
        const from = { x: source.position.x + 130, y: source.position.y + height(source) };
        const to = { x: target.position.x + 130, y: target.position.y };
        const skip = new Set([source.id, target.id]);
        const expected = naiveDetour(from, to, cards, skip, height);
        if (expected.length > 0) bent++;
        expect(detourAmong(axis, from, to, rows, skip)).toEqual(expected);
        expect(detour(axis, from, to, cards, skip, height)).toEqual(expected);
      }
    }
    // The grid really has lines that go round cards.
    expect(bent).toBeGreaterThan(50);
  });
});

/** A flow with a gate condition, a choose block and steps after it. */
function flow(): FlowGraph {
  return {
    id: '00000000-0000-4000-8000-000000000101',
    name: 'Caches',
    version: 1,
    nodes: [
      {
        id: 't',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { trigger: 'state', entity_id: 'binary_sensor.door' },
      },
      {
        id: 'g',
        type: 'condition',
        position: { x: 300, y: 0 },
        data: { condition: 'state', entity_id: 'sun.sun', state: 'above_horizon' },
      },
      {
        id: 'b',
        type: 'action',
        position: { x: 600, y: 0 },
        data: {
          _raw: {
            choose: [
              {
                conditions: [{ condition: 'state', entity_id: 'sensor.mode', state: 'on' }],
                sequence: [{ action: 'light.turn_on', target: { entity_id: 'light.hall' } }],
              },
            ],
            default: [{ action: 'light.turn_off', target: { entity_id: 'light.gone' } }],
          },
        },
      },
      { id: 'n', type: 'action', position: { x: 1000, y: 0 }, data: { action: 'notify.notify' } },
    ],
    edges: [
      { id: 'e1', source: 't', target: 'g' },
      { id: 'e2', source: 'g', target: 'b', sourceHandle: 'true' },
      { id: 'e3', source: 'b', target: 'n' },
    ],
  };
}

const branchCards = (graph: FlowGraph) => {
  const view = branchView(graph);
  return view.graph.nodes.filter((n) => view.cards.has(n.id));
};

describe('picture caches', () => {
  it('indexes a graph once, in graph order, the first card of an id winning', () => {
    const graph = flow();
    const twice: FlowGraph = {
      ...graph,
      nodes: [...graph.nodes, { ...card('n', 0, 0) }],
      edges: [...graph.edges, { id: 'e4', source: 'b', target: 't' }],
    };
    const index = graphIndex(twice);
    expect(graphIndex(twice)).toBe(index);
    expect(index.nodes.get('n')).toBe(graph.nodes[3]);
    expect(outgoing(twice, 'b', null).map((e) => e.id)).toEqual(['e3', 'e4']);
    expect(isGateCondition(twice, twice.nodes[1] ?? card('x', 0, 0))).toBe(true);
  });

  it('keeps a card shape per picture and works it out like before for a new one', () => {
    const view = branchView(flow());
    const gate = view.graph.nodes.find((n) => n.id === 'g');
    if (!gate) throw new Error('no gate');
    const shape = cardShape(view, gate);
    expect(cardShape(view, gate)).toBe(shape);
    expect(shape.handles).toEqual(['true']);
    // Something on its No: no gate any more, in the next picture.
    const withNo = branchView({
      ...flow(),
      edges: [...flow().edges, { id: 'e5', source: 'g', target: 'n', sourceHandle: 'false' }],
    });
    const nowTwoWay = withNo.graph.nodes.find((n) => n.id === 'g');
    if (!nowTwoWay) throw new Error('no gate');
    expect(cardShape(withNo, nowTwoWay).handles).toEqual(['true', 'false']);
    expect(viewCardRows(view)).toBe(viewCardRows(view));
  });

  it("keeps a branch card's data while its step stays, and a fresh one once it changed", () => {
    const graph = flow();
    const before = branchCards(graph);
    // Dragging another card: a new graph and picture, the branch steps unchanged.
    const moved = branchCards(moveNode(graph, 'n', 1200, 40));
    expect(moved.map((n) => n.data)).toEqual(before.map((n) => n.data));
    for (const [i, node] of moved.entries()) expect(node.data).toBe(before[i]?.data);
    expect(moved.map((n) => n.position)).toEqual(before.map((n) => n.position));
    // The block's step edited: its branch cards are read again.
    const edited = branchCards(
      updateNodeData(graph, 'b', {
        _raw: {
          choose: [
            {
              conditions: [{ condition: 'state', entity_id: 'sensor.mode', state: 'on' }],
              sequence: [{ action: 'light.toggle', target: { entity_id: 'light.hall' } }],
            },
          ],
        },
      }).graph
    );
    expect(edited[0]?.data).not.toBe(before[0]?.data);
    expect(edited[0]?.data).toMatchObject({ service: 'light.toggle' });
  });
});

function hass(states: HomeAssistant['states'], base?: HomeAssistant): HomeAssistant {
  return {
    states,
    language: 'en',
    themes: { darkMode: false },
    localize: base?.localize ?? ((key) => key),
    callApi: () => Promise.reject(new Error('no REST')),
    callWS: () => Promise.reject(new Error('no WS')),
    services: base?.services ?? { light: { turn_on: { name: 'Turn on' } } },
  };
}

const light = (name: string) => ({
  entity_id: 'light.hall',
  state: 'on',
  attributes: { friendly_name: name },
});
const lightCard: FlowNode = {
  id: 'l',
  type: 'action',
  position: { x: 0, y: 0 },
  data: { action: 'light.turn_on', target: { entity_id: 'light.hall' } },
};

describe('caches across HA state changes', () => {
  it('keeps card texts while only other entities change, and reads a renamed one again', () => {
    const first = hass({ 'light.hall': light('Hall') });
    const summary = summarize(lightCard, first);
    expect(JSON.stringify(summary)).toContain('Hall');
    // HA hands in a new hass for another entity's state: same context, same text.
    const other = hass(
      { 'light.hall': first.states['light.hall'] ?? light('Hall'), 'sensor.x': light('X') },
      first
    );
    expect(summaryContext(other)).toBe(summaryContext(first));
    expect(summaryContext(other, true)).toBe(summaryContext(first, true));
    expect(summarize(lightCard, other)).toBe(summary);
    // The card's own entity renamed: a new context and the new name.
    const renamed = hass({ 'light.hall': light('Corridor') }, first);
    expect(summaryContext(renamed)).not.toBe(summaryContext(first));
    expect(JSON.stringify(summarize(lightCard, renamed))).toContain('Corridor');
    // New services (HA loaded an integration): read again.
    const services = hass(renamed.states, { ...renamed, services: { light: {} } });
    expect(summaryContext(services)).not.toBe(summaryContext(renamed));
  });

  it("keeps a card's issues while only other entities change, and finds a removed one", () => {
    const created = new Set<string>();
    const first = hass({ 'light.hall': light('Hall') });
    const issues = nodeIssues(lightCard, first, created);
    expect(issues).toEqual([]);
    const other = hass({ ...first.states, 'sensor.x': light('X') }, first);
    expect(nodeIssues(lightCard, other, created)).toBe(issues);
    const gone = hass({ 'sensor.x': light('X') }, first);
    expect(nodeIssues(lightCard, gone, created)).toEqual([
      { kind: 'missingEntity', entityId: 'light.hall' },
    ]);
    // A service that went away counts too.
    const noService = hass(first.states, { ...first, services: {} });
    expect(nodeIssues(lightCard, noService, created)).toEqual([
      { kind: 'unknownService', service: 'light.turn_on' },
    ]);
  });
});
