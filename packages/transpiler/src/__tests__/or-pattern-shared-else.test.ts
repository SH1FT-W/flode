import type { FlowEdge, FlowGraph, FlowNode } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';

/**
 * Several conditions whose Yes outputs meet become one `if` with `condition: or`;
 * their No outputs meeting become its `else` (Internals 6.3). Nothing the user
 * drew may be dropped, and nothing may run twice.
 */

const trigger: FlowNode = {
  id: 'trigger',
  type: 'trigger',
  position: { x: 0, y: 0 },
  data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
};

const cond1: FlowNode = {
  id: 'cond1',
  type: 'condition',
  position: { x: 200, y: -100 },
  data: { condition: 'state', entity_id: 'light.living_room', state: 'on' },
};

const cond2: FlowNode = {
  id: 'cond2',
  type: 'condition',
  position: { x: 200, y: 100 },
  data: { condition: 'numeric_state', entity_id: 'sensor.temperature', above: '25' },
};

const actionNode = (id: string, service: string): FlowNode => ({
  id,
  type: 'action',
  position: { x: 400, y: 0 },
  data: { service, target: { entity_id: `light.${id}` } },
});

const yes = actionNode('yes', 'light.turn_on');
const no = actionNode('no', 'light.turn_off');
const before = actionNode('before', 'light.toggle');
const after = actionNode('after', 'notify.notify');

const graphOf = (nodes: FlowNode[], edges: FlowEdge[]): FlowGraph => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  version: 1,
  name: 'OR with shared else',
  description: '',
  nodes,
  edges,
  metadata: { mode: 'single' },
});

const edge = (
  id: string,
  source: string,
  target: string,
  sourceHandle?: 'true' | 'false'
): FlowEdge => ({ id, source, target, ...(sourceHandle ? { sourceHandle } : {}) });

const orOf = (...conditions: Record<string, unknown>[]) => [{ condition: 'or', conditions }];

const cond1Step = { condition: 'state', entity_id: 'light.living_room', state: 'on' };
const cond2Step = { condition: 'numeric_state', entity_id: 'sensor.temperature', above: '25' };
const stepOf = (node: FlowNode) => ({
  action: node.data.service,
  target: node.data.target,
});

function actionsOf(graph: FlowGraph): unknown[] {
  const result = new FlowTranspiler().transpile(graph);
  expect(result.success).toBe(true);
  expect(result.strategy).toBe('native');
  const actions = result.output?.automation?.actions;
  expect(Array.isArray(actions)).toBe(true);
  return Array.isArray(actions) ? actions : [];
}

describe('OR pattern right after the triggers', () => {
  it('writes the shared No path as the else of the or', () => {
    const graph = graphOf(
      [trigger, cond1, cond2, yes, no],
      [
        edge('e1', 'trigger', 'cond1'),
        edge('e2', 'trigger', 'cond2'),
        edge('e3', 'cond1', 'yes', 'true'),
        edge('e4', 'cond2', 'yes', 'true'),
        edge('e5', 'cond1', 'no', 'false'),
        edge('e6', 'cond2', 'no', 'false'),
      ]
    );
    expect(actionsOf(graph)).toEqual([
      { if: orOf(cond1Step, cond2Step), then: [stepOf(yes)], else: [stepOf(no)] },
    ]);
  });

  it('writes converging No paths alone as the else, not as the then', () => {
    const graph = graphOf(
      [trigger, cond1, cond2, no],
      [
        edge('e1', 'trigger', 'cond1'),
        edge('e2', 'trigger', 'cond2'),
        edge('e5', 'cond1', 'no', 'false'),
        edge('e6', 'cond2', 'no', 'false'),
      ]
    );
    expect(actionsOf(graph)).toEqual([
      { if: orOf(cond1Step, cond2Step), then: [], else: [stepOf(no)] },
    ]);
  });

  it('continues once after the or when both paths meet again', () => {
    const graph = graphOf(
      [trigger, cond1, cond2, yes, no, after],
      [
        edge('e1', 'trigger', 'cond1'),
        edge('e2', 'trigger', 'cond2'),
        edge('e3', 'cond1', 'yes', 'true'),
        edge('e4', 'cond2', 'yes', 'true'),
        edge('e5', 'cond1', 'no', 'false'),
        edge('e6', 'cond2', 'no', 'false'),
        edge('e7', 'yes', 'after'),
        edge('e8', 'no', 'after'),
      ]
    );
    expect(actionsOf(graph)).toEqual([
      { if: orOf(cond1Step, cond2Step), then: [stepOf(yes)], else: [stepOf(no)] },
      stepOf(after),
    ]);
  });
});

describe('OR pattern in the middle of the flow', () => {
  const lead = [
    edge('e0', 'trigger', 'before'),
    edge('e1', 'before', 'cond1'),
    edge('e2', 'before', 'cond2'),
  ];

  it('writes Yes and No paths as then and else, each once', () => {
    const graph = graphOf(
      [trigger, before, cond1, cond2, yes, no],
      [
        ...lead,
        edge('e3', 'cond1', 'yes', 'true'),
        edge('e4', 'cond2', 'yes', 'true'),
        edge('e5', 'cond1', 'no', 'false'),
        edge('e6', 'cond2', 'no', 'false'),
      ]
    );
    expect(actionsOf(graph)).toEqual([
      stepOf(before),
      { if: orOf(cond1Step, cond2Step), then: [stepOf(yes)], else: [stepOf(no)] },
    ]);
  });

  it('writes converging Yes paths without a No path as then with an empty else', () => {
    const graph = graphOf(
      [trigger, before, cond1, cond2, yes],
      [...lead, edge('e3', 'cond1', 'yes', 'true'), edge('e4', 'cond2', 'yes', 'true')]
    );
    expect(actionsOf(graph)).toEqual([
      stepOf(before),
      { if: orOf(cond1Step, cond2Step), then: [stepOf(yes)], else: [] },
    ]);
  });

  it('writes converging No paths without a Yes path as the else', () => {
    const graph = graphOf(
      [trigger, before, cond1, cond2, no],
      [...lead, edge('e5', 'cond1', 'no', 'false'), edge('e6', 'cond2', 'no', 'false')]
    );
    expect(actionsOf(graph)).toEqual([
      stepOf(before),
      { if: orOf(cond1Step, cond2Step), then: [], else: [stepOf(no)] },
    ]);
  });

  it('continues once after the or when both paths meet again', () => {
    const graph = graphOf(
      [trigger, before, cond1, cond2, yes, no, after],
      [
        ...lead,
        edge('e3', 'cond1', 'yes', 'true'),
        edge('e4', 'cond2', 'yes', 'true'),
        edge('e5', 'cond1', 'no', 'false'),
        edge('e6', 'cond2', 'no', 'false'),
        edge('e7', 'yes', 'after'),
        edge('e8', 'no', 'after'),
      ]
    );
    expect(actionsOf(graph)).toEqual([
      stepOf(before),
      { if: orOf(cond1Step, cond2Step), then: [stepOf(yes)], else: [stepOf(no)] },
      stepOf(after),
    ]);
  });
});
