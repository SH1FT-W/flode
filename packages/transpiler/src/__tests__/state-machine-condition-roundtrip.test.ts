import type { ConditionNode, FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { YamlParser } from '../parser/YamlParser';

describe('state-machine condition roundtrip (GH #16 follow-up)', () => {
  it('reconstructs an AND/OR condition instead of collapsing it into a raw template', async () => {
    // Reported alongside the fan-out bug: once the state-machine strategy is
    // forced (by two divergent triggers), an AND/OR condition node's compound
    // Jinja expression came back as a single generic `template` condition on
    // reimport - the AND/OR structure was silently lost.
    const flow: FlowGraph = {
      id: '77777777-8888-4999-8aaa-bbbbbbbbbbbb',
      name: 'AND/OR condition',
      nodes: [
        {
          id: 'trigger_0',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: ['binary_sensor.a'] },
        },
        {
          id: 'trigger_1',
          type: 'trigger',
          position: { x: 0, y: 200 },
          data: { trigger: 'state', entity_id: ['binary_sensor.b'] },
        },
        {
          id: 'cond1',
          type: 'condition',
          position: { x: 300, y: 100 },
          data: {
            condition: 'or',
            alias: 'OR',
            conditions: [
              { condition: 'state', entity_id: 'media_player.tv', state: 'playing' },
              { condition: 'state', entity_id: 'media_player.tv', state: 'paused' },
            ],
          },
        },
        {
          id: 'act_true',
          type: 'action',
          position: { x: 600, y: 0 },
          data: { service: 'light.turn_off' },
        },
        {
          id: 'act_false',
          type: 'action',
          position: { x: 600, y: 200 },
          data: { service: 'light.turn_on' },
        },
      ],
      edges: [
        { id: 'e0', source: 'trigger_0', target: 'cond1' },
        { id: 'e1', source: 'trigger_1', target: 'cond1' },
        { id: 'e2', source: 'cond1', target: 'act_true', sourceHandle: 'true' },
        { id: 'e3', source: 'cond1', target: 'act_false', sourceHandle: 'false' },
      ],
      version: 1,
    };

    const { yaml } = new FlowTranspiler().transpile(flow, { forceStrategy: 'state-machine' });
    if (!yaml) throw new Error('expected generated yaml');
    expect(yaml).toContain(' or ');

    const reimported = await new YamlParser().parse(yaml);
    expect(reimported.success).toBe(true);

    const cond = reimported.graph?.nodes.find((n) => n.id === 'cond1') as ConditionNode | undefined;
    expect(cond?.type).toBe('condition');
    expect(cond?.data.condition).toBe('or');
    expect(cond?.data.conditions).toEqual([
      { condition: 'state', entity_id: 'media_player.tv', state: 'playing' },
      { condition: 'state', entity_id: 'media_player.tv', state: 'paused' },
    ]);

    const trueEdge = reimported.graph?.edges.find(
      (e) => e.source === 'cond1' && e.sourceHandle === 'true'
    );
    const falseEdge = reimported.graph?.edges.find(
      (e) => e.source === 'cond1' && e.sourceHandle === 'false'
    );
    expect(trueEdge?.target).toBe('act_true');
    expect(falseEdge?.target).toBe('act_false');
  });
});
