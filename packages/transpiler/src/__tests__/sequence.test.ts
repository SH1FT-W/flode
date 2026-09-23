import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { transpileSequence } from '../sequence';

const transpiler = new FlowTranspiler();

const flow: FlowGraph = {
  id: '5e000000-0000-4000-8000-000000000001',
  name: 'Sequence',
  nodes: [
    {
      id: 'trigger',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { trigger: 'state', entity_id: ['binary_sensor.door'], to: 'on' },
    },
    {
      id: 'cond',
      type: 'condition',
      position: { x: 200, y: 0 },
      data: { condition: 'state', entity_id: 'sun.sun', state: 'below_horizon' },
    },
    {
      id: 'light_on',
      type: 'action',
      position: { x: 400, y: 0 },
      data: { service: 'light.turn_on', target: { entity_id: ['light.hall'] } },
    },
    { id: 'wait', type: 'delay', position: { x: 600, y: 0 }, data: { delay: '00:05:00' } },
    {
      id: 'light_off',
      type: 'action',
      position: { x: 800, y: 0 },
      data: { service: 'light.turn_off', target: { entity_id: ['light.hall'] } },
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger', target: 'cond' },
    { id: 'e2', source: 'cond', target: 'light_on', sourceHandle: 'true' },
    { id: 'e3', source: 'light_on', target: 'wait' },
    { id: 'e4', source: 'wait', target: 'light_off' },
  ],
  version: 1,
};

describe('transpileSequence', () => {
  it('runs from a middle node: only that node and what follows', () => {
    const result = transpileSequence(transpiler, flow, ['wait']);
    expect(result.success).toBe(true);
    expect(result.sequence).toEqual([
      { delay: '00:05:00' },
      { action: 'light.turn_off', target: { entity_id: ['light.hall'] } },
    ]);
    expect(result.usesTriggerData).toBe(false);
  });

  it('keeps a leading condition as a condition step', () => {
    const result = transpileSequence(transpiler, flow, ['cond']);
    expect(result.sequence?.[0]).toEqual({
      condition: 'state',
      entity_id: 'sun.sun',
      state: 'below_horizon',
    });
    expect(result.sequence).toHaveLength(4);
  });

  it('treats a trigger as "everything after it"', () => {
    const fromTrigger = transpileSequence(transpiler, flow, ['trigger']);
    const fromCondition = transpileSequence(transpiler, flow, ['cond']);
    expect(fromTrigger.sequence).toEqual(fromCondition.sequence);
  });

  it('flags steps that read trigger data', () => {
    const withTemplate: FlowGraph = {
      ...flow,
      nodes: flow.nodes.map((n) =>
        n.id === 'light_off'
          ? {
              ...n,
              data: { service: 'notify.notify', data: { message: '{{ trigger.to_state.name }}' } },
            }
          : n
      ),
    };
    expect(transpileSequence(transpiler, withTemplate, ['wait']).usesTriggerData).toBe(true);
  });
});
