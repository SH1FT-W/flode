import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';

const transpiler = new FlowTranspiler();

const automation = {
  alias: 'Blocks',
  triggers: [{ trigger: 'state', entity_id: 'light.a', to: 'on' }],
  conditions: [{ condition: 'state', entity_id: 'sun.sun', state: 'below_horizon' }],
  actions: [
    { action: 'light.turn_on', target: { entity_id: 'light.b' } },
    {
      if: [{ condition: 'state', entity_id: 'light.c', state: 'on' }],
      then: [{ action: 'light.turn_off', target: { entity_id: 'light.c' } }],
      else: [{ delay: '00:00:05' }],
    },
    { choose: [{ conditions: [], sequence: [] }], default: [] },
    { repeat: { count: 3, sequence: [{ action: 'light.toggle' }] } },
    { parallel: [{ action: 'light.turn_on' }, { action: 'light.turn_off' }] },
  ],
};

describe('fromYaml with keepBlocks', () => {
  it("keeps HA's building blocks as one verbatim block each", async () => {
    const result = await transpiler.fromYaml(JSON.stringify(automation), { keepBlocks: true });
    expect(result.success).toBe(true);
    const nodes = result.graph?.nodes ?? [];
    expect(nodes.map((n) => n.type)).toEqual([
      'trigger',
      'condition',
      'action',
      'action',
      'action',
      'action',
      'action',
    ]);
    const blocks = nodes.slice(3).map((n) => Object.keys((n.data as { _raw: object })._raw)[0]);
    expect(blocks).toEqual(['if', 'choose', 'repeat', 'parallel']);
    // One straight line — no branch edges.
    expect(result.graph?.edges.every((e) => !e.type && e.sourceHandle !== 'false')).toBe(true);
  });

  it('writes the blocks back unchanged', async () => {
    const parsed = await transpiler.fromYaml(JSON.stringify(automation), { keepBlocks: true });
    const graph = parsed.graph;
    if (!graph) throw new Error('parse');
    const out = transpiler.transpile(graph);
    expect(out.output?.automation?.actions).toEqual(automation.actions);
  });

  it('leaves the default (FLODE 3) parsing untouched', async () => {
    const result = await transpiler.fromYaml(JSON.stringify(automation));
    const types = result.graph?.nodes.map((n) => n.type) ?? [];
    expect(types.filter((t) => t === 'condition').length).toBeGreaterThan(1);
  });
});
