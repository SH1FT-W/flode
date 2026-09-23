import type { ConditionNode, FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { YamlParser } from '../parser/YamlParser';

/**
 * Upstream C.A.F.E. #256: in the state-machine format a time condition is a
 * Jinja `{% if now().strftime('%H:%M:%S') >= '21:00' %}` transition. The
 * parser stopped at the `%` inside `strftime('%H…')`, so on reimport the
 * condition lost its outgoing edge ("has no outgoing edges") and came back
 * as a raw template condition.
 */
describe('state-machine time condition roundtrip (C.A.F.E. #256)', () => {
  const flow: FlowGraph = {
    id: '256a0000-0000-4000-8000-000000000256',
    name: 'Time condition',
    nodes: [
      {
        id: 'trigger_0',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { trigger: 'state', entity_id: ['sensor.battery_state'], to: 'Charging' },
      },
      {
        id: 'trigger_1',
        type: 'trigger',
        position: { x: 0, y: 200 },
        data: { trigger: 'time', at: '08:00:00' },
      },
      {
        id: 'cond_time',
        type: 'condition',
        position: { x: 300, y: 0 },
        data: {
          condition: 'time',
          after: '21:00:00',
          before: '23:30:00',
          weekday: ['mon', 'fri'],
        },
      },
      {
        id: 'act_tv',
        type: 'action',
        position: { x: 600, y: 100 },
        data: { service: 'script.turn_on_the_tv' },
      },
    ],
    edges: [
      // Divergent triggers force the state-machine strategy.
      { id: 'e0', source: 'trigger_0', target: 'cond_time' },
      { id: 'e1', source: 'trigger_1', target: 'act_tv' },
      { id: 'e2', source: 'cond_time', target: 'act_tv', sourceHandle: 'true' },
    ],
    version: 1,
  };

  it('keeps the condition connected and restores it as a time condition', async () => {
    const { yaml } = new FlowTranspiler().transpile(flow, { forceStrategy: 'state-machine' });
    if (!yaml) throw new Error('expected generated yaml');
    expect(yaml).toContain("strftime('%H:%M:%S')");

    const reimported = await new YamlParser().parse(yaml);
    expect(reimported.success).toBe(true);

    const cond = reimported.graph?.nodes.find((n) => n.id === 'cond_time') as
      | ConditionNode
      | undefined;
    expect(cond?.data).toMatchObject({
      condition: 'time',
      after: '21:00:00',
      before: '23:30:00',
      weekday: ['mon', 'fri'],
    });

    const trueEdge = reimported.graph?.edges.find(
      (e) => e.source === 'cond_time' && e.sourceHandle === 'true'
    );
    expect(trueEdge?.target).toBe('act_tv');
  });
});

/**
 * Upstream C.A.F.E. #247: a state condition with a duration ("switch on for
 * 10 minutes") was inlined as `is_state(...)` in the state-machine format —
 * the `for` was dropped, so the condition passed the moment the switch
 * turned on and the flow always took the same branch.
 */
describe('state-machine condition with duration (C.A.F.E. #247)', () => {
  const flow: FlowGraph = {
    id: '247a0000-0000-4000-8000-000000000247',
    name: 'Duration condition',
    nodes: [
      {
        id: 'trigger_0',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { trigger: 'numeric_state', entity_id: ['sensor.solar'], below: 0 },
      },
      {
        id: 'trigger_1',
        type: 'trigger',
        position: { x: 0, y: 200 },
        data: { trigger: 'time', at: '23:00:00' },
      },
      {
        id: 'cond_for',
        type: 'condition',
        position: { x: 300, y: 0 },
        data: {
          condition: 'state',
          entity_id: 'switch.boiler',
          state: 'on',
          for: { minutes: 10 },
        },
      },
      {
        id: 'act_on',
        type: 'action',
        position: { x: 600, y: 0 },
        data: { service: 'climate.set_temperature', data: { temperature: 40 } },
      },
      {
        id: 'act_off',
        type: 'action',
        position: { x: 600, y: 200 },
        data: { service: 'switch.turn_off' },
      },
    ],
    edges: [
      { id: 'e0', source: 'trigger_0', target: 'cond_for' },
      { id: 'e1', source: 'trigger_1', target: 'act_off' },
      { id: 'e2', source: 'cond_for', target: 'act_on', sourceHandle: 'true' },
      { id: 'e3', source: 'cond_for', target: 'act_off', sourceHandle: 'false' },
    ],
    version: 1,
  };

  it('lets HA check the duration natively and reads it back', async () => {
    const { yaml } = new FlowTranspiler().transpile(flow, { forceStrategy: 'state-machine' });
    if (!yaml) throw new Error('expected generated yaml');
    // Native condition with the duration, not an inlined is_state() template.
    expect(yaml).not.toContain("is_state('switch.boiler'");
    expect(yaml).toMatch(/for:\s*\n\s*minutes: 10/);

    const reimported = await new YamlParser().parse(yaml);
    expect(reimported.success).toBe(true);

    const cond = reimported.graph?.nodes.find((n) => n.id === 'cond_for') as
      | ConditionNode
      | undefined;
    expect(cond?.data).toMatchObject({
      condition: 'state',
      entity_id: 'switch.boiler',
      state: 'on',
      for: { minutes: 10 },
    });
    const targets = Object.fromEntries(
      (reimported.graph?.edges ?? [])
        .filter((e) => e.source === 'cond_for')
        .map((e) => [e.sourceHandle ?? 'true', e.target])
    );
    expect(targets).toEqual({ true: 'act_on', false: 'act_off' });
  });
});
