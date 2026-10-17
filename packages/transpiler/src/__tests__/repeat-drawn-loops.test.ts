import type { FlowEdge, FlowGraph, FlowNode } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';

/** Loops drawn in FLODE (a connection back to an earlier card) become `repeat` steps (Internals 6.3). */

const trigger: FlowNode = {
  id: 'trigger',
  type: 'trigger',
  position: { x: 0, y: 0 },
  data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
};
const body: FlowNode = {
  id: 'body',
  type: 'action',
  position: { x: 200, y: 0 },
  data: { service: 'light.toggle', target: { entity_id: 'light.a' } },
};
const exit: FlowNode = {
  id: 'exit',
  type: 'action',
  position: { x: 600, y: 0 },
  data: { service: 'notify.notify', data: { message: 'done' } },
};

const graphOf = (nodes: FlowNode[], edges: FlowEdge[]): FlowGraph => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  version: 1,
  name: 'Drawn loop',
  description: '',
  nodes,
  edges,
  metadata: { mode: 'single' },
});

function actionsOf(graph: FlowGraph): unknown[] {
  const result = new FlowTranspiler().transpile(graph);
  expect(result.success).toBe(true);
  expect(result.strategy).toBe('native');
  const actions = result.output?.automation?.actions;
  return Array.isArray(actions) ? actions : [];
}

describe('a loop back from the No output (until)', () => {
  it('carries the alias of its condition', () => {
    const condition: FlowNode = {
      id: 'cond',
      type: 'condition',
      position: { x: 400, y: 0 },
      data: { condition: 'state', entity_id: 'light.a', state: 'on', alias: 'Bis es an ist' },
    };
    const actions = actionsOf(
      graphOf(
        [trigger, body, condition, exit],
        [
          { id: 'e1', source: 'trigger', target: 'body' },
          { id: 'e2', source: 'body', target: 'cond' },
          { id: 'e3', source: 'cond', target: 'body', sourceHandle: 'false' },
          { id: 'e4', source: 'cond', target: 'exit', sourceHandle: 'true' },
        ]
      )
    );
    expect(actions).toEqual([
      {
        alias: 'Bis es an ist',
        repeat: {
          until: [{ condition: 'state', entity_id: 'light.a', state: 'on' }],
          sequence: [{ action: 'light.toggle', target: { entity_id: 'light.a' } }],
        },
      },
      { action: 'notify.notify', data: { message: 'done' } },
    ]);
  });
});

describe('a loop back from the Yes output', () => {
  const init: FlowNode = {
    id: 'init',
    type: 'set_variables',
    position: { x: 100, y: 0 },
    data: { variables: { n: 0 } },
  };
  const increment: FlowNode = {
    id: 'increment',
    type: 'set_variables',
    position: { x: 300, y: 0 },
    data: { variables: { n: '{{ n + 1 }}' } },
  };
  const edges: FlowEdge[] = [
    { id: 'e1', source: 'trigger', target: 'init' },
    { id: 'e2', source: 'init', target: 'body' },
    { id: 'e3', source: 'body', target: 'increment' },
    { id: 'e4', source: 'increment', target: 'cond' },
    { id: 'e5', source: 'cond', target: 'body', sourceHandle: 'true' },
    { id: 'e6', source: 'cond', target: 'exit', sourceHandle: 'false' },
  ];

  it('is a count when the condition counts up to a number', () => {
    const condition: FlowNode = {
      id: 'cond',
      type: 'condition',
      position: { x: 400, y: 0 },
      data: { condition: 'template', value_template: '{{ n < 3 }}' },
    };
    const actions = actionsOf(graphOf([trigger, init, body, increment, condition, exit], edges));
    expect(actions).toEqual([
      {
        repeat: {
          count: 3,
          sequence: [{ action: 'light.toggle', target: { entity_id: 'light.a' } }],
        },
      },
      { action: 'notify.notify', data: { message: 'done' } },
    ]);
  });

  it('repeats until the condition is no longer true when it is not a count', () => {
    const condition: FlowNode = {
      id: 'cond',
      type: 'condition',
      position: { x: 400, y: 0 },
      data: { condition: 'state', entity_id: 'light.a', state: 'off', alias: 'Noch aus?' },
    };
    const actions = actionsOf(graphOf([trigger, init, body, increment, condition, exit], edges));
    expect(actions).toEqual([
      { variables: { n: 0 } },
      {
        alias: 'Noch aus?',
        repeat: {
          until: [
            {
              condition: 'not',
              conditions: [{ condition: 'state', entity_id: 'light.a', state: 'off' }],
            },
          ],
          sequence: [
            { action: 'light.toggle', target: { entity_id: 'light.a' } },
            { variables: { n: '{{ n + 1 }}' } },
          ],
        },
      },
      { action: 'notify.notify', data: { message: 'done' } },
    ]);
  });
});
