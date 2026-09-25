import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { configAtPath, type HaTrace, nodeForPath, runMarks, runVariables } from '../trace';

const graph: FlowGraph = {
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Run',
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
      data: { condition: 'state', entity_id: 'sun.sun', state: 'below_horizon' },
    },
    { id: 'a', type: 'action', position: { x: 600, y: 0 }, data: { service: 'light.turn_on' } },
    {
      id: 'b',
      type: 'action',
      position: { x: 900, y: 0 },
      data: { _raw: { if: [], then: [{ delay: 1 }] } },
    },
  ],
  edges: [
    { id: 'e1', source: 't', target: 'c' },
    { id: 'e2', source: 'c', target: 'a', sourceHandle: 'true' },
    { id: 'e3', source: 'a', target: 'b' },
  ],
};

const trace = (steps: Record<string, Partial<HaTrace['trace'][string][number]>[]>): HaTrace => ({
  run_id: 'r',
  state: 'stopped',
  timestamp: { start: '2026-09-25T20:00:00Z' },
  context: { id: 'ctx' },
  config: {
    triggers: [{ trigger: 'state' }],
    conditions: [{ condition: 'state' }],
    actions: [{ action: 'light.turn_on' }, { if: [], then: [{ delay: 1 }] }],
  },
  trace: Object.fromEntries(
    Object.entries(steps).map(([path, list]) => [
      path,
      list.map((s) => ({ path, timestamp: '2026-09-25T20:00:00Z', ...s })),
    ])
  ),
});

describe('trace → cards', () => {
  it('marks what ran; a step inside a HA block marks the block', () => {
    const marks = runMarks(
      graph,
      'automation',
      trace({
        'trigger/0': [{}],
        'condition/0': [{ result: { result: true } }],
        'action/0': [{}],
        'action/1/if/condition/0': [{ result: { result: false } }],
        'action/1/else/0': [{}],
      })
    );
    expect(Object.fromEntries(marks)).toEqual({ t: 'done', c: 'done', a: 'done', b: 'done' });
  });

  it('marks the condition that stopped the run', () => {
    const marks = runMarks(
      graph,
      'automation',
      trace({
        'trigger/0': [{}],
        'condition/0': [{ result: { result: false } }],
        'condition/0/entity_id/0': [{ result: { result: false } }],
      })
    );
    expect(Object.fromEntries(marks)).toEqual({ t: 'done', c: 'failed' });
  });

  it('reads scripts (sequence/N) like automations', () => {
    expect(nodeForPath(graph, 'script', 'sequence/0')).toBe('a');
  });

  it('finds the config of a step for HA’s details', () => {
    const config = trace({}).config;
    expect(configAtPath(config, 'action/1/then/0')).toEqual({ delay: 1 });
    expect(configAtPath(config, 'condition/0')).toEqual({ condition: 'state' });
    expect(configAtPath(config, 'trigger/0')).toEqual({ trigger: 'state' });
  });
});

describe('run variables', () => {
  it('collects what the run knew, up to a step', () => {
    const run = trace({
      'trigger/0': [{ changed_variables: { trigger: { id: '0' } } }],
      'action/0': [{ changed_variables: { x: 1 }, timestamp: '2026-09-25T20:00:01Z' }],
    });
    expect(runVariables(run)).toEqual({ trigger: { id: '0' }, x: 1 });
    expect(runVariables(run, 'trigger/0')).toEqual({ trigger: { id: '0' } });
  });
});
