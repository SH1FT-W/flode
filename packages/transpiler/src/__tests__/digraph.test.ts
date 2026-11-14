import { describe, expect, it } from 'vitest';
import { Digraph } from '../analyzer/digraph';

// Graphs (nodes in the order set, then edges) and what graphlib 2.1.8 gave for
// them — recorded before `Digraph` replaced it, so the topology analysis sees
// the same order.
const cases: [string, string[], [string, string][]][] = [
  ['empty graph', [], []],
  [
    'chain',
    ['t', 'a', 'b'],
    [
      ['t', 'a'],
      ['a', 'b'],
    ],
  ],
  [
    'diamond',
    ['t', 'c', 'yes', 'no', 'end'],
    [
      ['t', 'c'],
      ['c', 'yes'],
      ['c', 'no'],
      ['yes', 'end'],
      ['no', 'end'],
    ],
  ],
  [
    'two triggers into one chain',
    ['t1', 't2', 'a', 'b'],
    [
      ['t2', 'a'],
      ['t1', 'a'],
      ['a', 'b'],
    ],
  ],
  [
    'fan out to several ends',
    ['t', 'x', 'y', 'z'],
    [
      ['t', 'z'],
      ['t', 'x'],
      ['t', 'y'],
    ],
  ],
  [
    'integer-like ids list first, ascending',
    ['t', '10', '2', 'a'],
    [
      ['t', '10'],
      ['t', '2'],
      ['10', 'a'],
      ['2', 'a'],
    ],
  ],
  [
    'disconnected parts',
    ['a', 'b', 'c', 'd'],
    [
      ['c', 'd'],
      ['a', 'b'],
    ],
  ],
  [
    'duplicate edge stays one',
    ['a', 'b'],
    [
      ['a', 'b'],
      ['a', 'b'],
    ],
  ],
  ['edge to a node never set', ['a'], [['a', 'ghost']]],
  [
    'self loop',
    ['a', 'b'],
    [
      ['a', 'a'],
      ['a', 'b'],
    ],
  ],
  [
    'cycle on the way to a sink',
    ['t', 'a', 'b', 'end'],
    [
      ['t', 'a'],
      ['a', 'b'],
      ['b', 'a'],
      ['b', 'end'],
    ],
  ],
  [
    'cycle without a way out',
    ['t', 'a', 'b', 'c'],
    [
      ['a', 'b'],
      ['b', 'a'],
      ['t', 'c'],
    ],
  ],
];

const graphlib: Record<
  string,
  {
    order: string[] | null;
    nodes: string[];
    successors: Record<string, string[]>;
    predecessors: Record<string, string[]>;
  }
> = {
  'empty graph': { order: [], nodes: [], successors: {}, predecessors: {} },
  chain: {
    order: ['t', 'a', 'b'],
    nodes: ['t', 'a', 'b'],
    successors: { t: ['a'], a: ['b'], b: [] },
    predecessors: { t: [], a: ['t'], b: ['a'] },
  },
  diamond: {
    order: ['t', 'c', 'yes', 'no', 'end'],
    nodes: ['t', 'c', 'yes', 'no', 'end'],
    successors: { t: ['c'], c: ['yes', 'no'], yes: ['end'], no: ['end'], end: [] },
    predecessors: { t: [], c: ['t'], yes: ['c'], no: ['c'], end: ['yes', 'no'] },
  },
  'two triggers into one chain': {
    order: ['t2', 't1', 'a', 'b'],
    nodes: ['t1', 't2', 'a', 'b'],
    successors: { t1: ['a'], t2: ['a'], a: ['b'], b: [] },
    predecessors: { t1: [], t2: [], a: ['t2', 't1'], b: ['a'] },
  },
  'fan out to several ends': {
    order: ['t', 'x', 'y', 'z'],
    nodes: ['t', 'x', 'y', 'z'],
    successors: { t: ['z', 'x', 'y'], x: [], y: [], z: [] },
    predecessors: { t: [], x: ['t'], y: ['t'], z: ['t'] },
  },
  'integer-like ids list first, ascending': {
    order: ['t', '2', '10', 'a'],
    nodes: ['2', '10', 't', 'a'],
    successors: { '2': ['a'], '10': ['a'], t: ['2', '10'], a: [] },
    predecessors: { '2': ['t'], '10': ['t'], t: [], a: ['2', '10'] },
  },
  'disconnected parts': {
    order: ['a', 'b', 'c', 'd'],
    nodes: ['a', 'b', 'c', 'd'],
    successors: { a: ['b'], b: [], c: ['d'], d: [] },
    predecessors: { a: [], b: ['a'], c: [], d: ['c'] },
  },
  'duplicate edge stays one': {
    order: ['a', 'b'],
    nodes: ['a', 'b'],
    successors: { a: ['b'], b: [] },
    predecessors: { a: [], b: ['a'] },
  },
  'edge to a node never set': {
    order: ['a', 'ghost'],
    nodes: ['a', 'ghost'],
    successors: { a: ['ghost'], ghost: [] },
    predecessors: { a: [], ghost: ['a'] },
  },
  'self loop': {
    order: null,
    nodes: ['a', 'b'],
    successors: { a: ['a', 'b'], b: [] },
    predecessors: { a: ['a'], b: ['a'] },
  },
  'cycle on the way to a sink': {
    order: null,
    nodes: ['t', 'a', 'b', 'end'],
    successors: { t: ['a'], a: ['b'], b: ['a', 'end'], end: [] },
    predecessors: { t: [], a: ['t', 'b'], b: ['a'], end: ['b'] },
  },
  'cycle without a way out': {
    order: null,
    nodes: ['t', 'a', 'b', 'c'],
    successors: { t: ['c'], a: ['b'], b: ['a'], c: [] },
    predecessors: { t: [], a: ['b'], b: ['a'], c: ['t'] },
  },
};

function build(nodes: string[], edges: [string, string][]): Digraph {
  const graph = new Digraph();
  for (const node of nodes) graph.setNode(node);
  for (const [from, to] of edges) graph.setEdge(from, to);
  return graph;
}

describe('Digraph: the same answers as graphlib', () => {
  it.each(cases)('%s', (name, nodes, edges) => {
    const graph = build(nodes, edges);
    const ids = graph.nodes();
    expect({
      order: graph.topsort(),
      nodes: ids,
      successors: Object.fromEntries(ids.map((id) => [id, graph.successors(id)])),
      predecessors: Object.fromEntries(ids.map((id) => [id, graph.predecessors(id)])),
    }).toEqual(graphlib[name]);
  });

  it('knows no neighbours of a node not in the graph', () => {
    const graph = build(['a'], []);
    expect([graph.successors('b'), graph.predecessors('b')]).toEqual([undefined, undefined]);
  });
});
