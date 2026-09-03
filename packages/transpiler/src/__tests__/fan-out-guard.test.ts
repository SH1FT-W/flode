import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';

/**
 * These cover the safety guard added alongside the mid-flow fan-out fix
 * (GH #16): inlining a fanned-out branch removes its standalone dispatcher
 * entry, which is only sound when nothing outside the branch set can still
 * jump into it. Ported from the equivalent guard in the upstream C.A.F.E.
 * transpiler (FezVrasta/cafe-hass#240), adapted to FLODE's fan-out model.
 */

const TRIGGERS: FlowGraph['nodes'] = [
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
];

const transpile = (flow: FlowGraph) =>
  new FlowTranspiler().transpile(flow, { forceStrategy: 'state-machine' });

describe('fan-out safety: never delete a dispatcher entry something still jumps to', () => {
  it('does not empty the choose block when a branch loops back to the fan-out source', () => {
    // A -> B, A -> C, B -> A. Naively "consuming" B and C would also try to
    // consume A itself once the back-edge is followed.
    const flow: FlowGraph = {
      id: '55555555-6666-4777-8888-999999999999',
      version: 1,
      name: 'Back edge into fan-out source',
      nodes: [
        ...TRIGGERS,
        { id: 'A', type: 'action', position: { x: 300, y: 100 }, data: { service: 'light.turn_on' } },
        { id: 'B', type: 'action', position: { x: 600, y: 0 }, data: { service: 'switch.turn_on' } },
        { id: 'C', type: 'action', position: { x: 600, y: 200 }, data: { service: 'switch.turn_off' } },
      ],
      edges: [
        { id: 'e0', source: 'trigger_0', target: 'A' },
        { id: 'e1', source: 'trigger_1', target: 'A' },
        { id: 'e2', source: 'A', target: 'B' },
        { id: 'e3', source: 'A', target: 'C' },
        { id: 'e4', source: 'B', target: 'A' },
      ],
    };

    const { yaml, warnings } = transpile(flow);
    if (!yaml) throw new Error('expected generated yaml');

    // Every node keeps a dispatcher entry - the choose block must not lose A.
    for (const id of ['A', 'B', 'C']) {
      expect(yaml).toContain(`current_node == \\"${id}\\"`);
    }
    expect(warnings.some((w) => w.includes('A') && w.toLowerCase().includes('back'))).toBe(true);
  });

  it('keeps a branch node reachable from another trigger addressable', () => {
    // trigger_1 routes straight to B while A also fans out to B. Both paths
    // are legitimate (they belong to different automation runs), so B keeps
    // its own dispatcher entry in addition to being inlined in A's fan-out -
    // no warning needed, nothing here is unsound.
    const flow: FlowGraph = {
      id: '66666666-7777-4888-8999-aaaaaaaaaaaa',
      version: 1,
      name: 'Shared branch target',
      nodes: [
        ...TRIGGERS,
        { id: 'A', type: 'action', position: { x: 300, y: 0 }, data: { service: 'scene.create' } },
        { id: 'B', type: 'action', position: { x: 600, y: 0 }, data: { service: 'light.turn_on' } },
        { id: 'C', type: 'action', position: { x: 600, y: 200 }, data: { service: 'light.turn_off' } },
      ],
      edges: [
        { id: 'e0', source: 'trigger_0', target: 'A' },
        { id: 'e1', source: 'trigger_1', target: 'B' },
        { id: 'e2', source: 'A', target: 'B' },
        { id: 'e3', source: 'A', target: 'C' },
      ],
    };

    const { yaml, warnings } = transpile(flow);
    if (!yaml) throw new Error('expected generated yaml');

    // B is still routed to directly by trigger_1, so it must keep its own entry.
    expect(yaml).toContain('current_node == \\"B\\"');
    // C has no outside entry, so it is safely consumed - only its inlined copy remains.
    expect(yaml).not.toContain('current_node == \\"C\\"');
    // Both channels to B are sound (different runs), so this needs no warning.
    expect(warnings).toEqual([]);
  });

  it('keeps a branch node reachable from an unrelated predecessor addressable', () => {
    const flow: FlowGraph = {
      id: '77777777-8888-4999-8aaa-bbbbbbbbbbbb',
      version: 1,
      name: 'Shared branch target via node',
      nodes: [
        ...TRIGGERS,
        { id: 'A', type: 'action', position: { x: 300, y: 0 }, data: { service: 'scene.create' } },
        { id: 'D', type: 'action', position: { x: 300, y: 300 }, data: { service: 'scene.apply' } },
        { id: 'B', type: 'action', position: { x: 600, y: 0 }, data: { service: 'light.turn_on' } },
        { id: 'C', type: 'action', position: { x: 600, y: 200 }, data: { service: 'light.turn_off' } },
      ],
      edges: [
        { id: 'e0', source: 'trigger_0', target: 'A' },
        { id: 'e1', source: 'trigger_1', target: 'D' },
        { id: 'e2', source: 'A', target: 'B' },
        { id: 'e3', source: 'A', target: 'C' },
        { id: 'e4', source: 'D', target: 'B' },
      ],
    };

    const { yaml } = transpile(flow);
    if (!yaml) throw new Error('expected generated yaml');

    // D transitions to B normally, so B must remain dispatchable.
    expect(yaml).toContain('current_node == \\"B\\"');
  });

  it('warns when parallel branches re-join instead of silently duplicating work', () => {
    const flow: FlowGraph = {
      id: '11111111-2222-4333-8444-555555555555',
      version: 1,
      name: 'Scene then parallel lights that re-join',
      nodes: [
        ...TRIGGERS,
        { id: 'act_scene_create', type: 'action', position: { x: 300, y: 100 }, data: { service: 'scene.create' } },
        { id: 'act_l1', type: 'action', position: { x: 600, y: 0 }, data: { service: 'light.turn_on' } },
        { id: 'act_l2', type: 'action', position: { x: 600, y: 150 }, data: { service: 'light.turn_on' } },
        { id: 'act_join', type: 'action', position: { x: 900, y: 75 }, data: { service: 'notify.notify' } },
      ],
      edges: [
        { id: 'e0', source: 'trigger_0', target: 'act_scene_create' },
        { id: 'e1', source: 'trigger_1', target: 'act_scene_create' },
        { id: 'e2', source: 'act_scene_create', target: 'act_l1' },
        { id: 'e3', source: 'act_scene_create', target: 'act_l2' },
        { id: 'e4', source: 'act_l1', target: 'act_join' },
        { id: 'e5', source: 'act_l2', target: 'act_join' },
      ],
    };

    const { warnings } = transpile(flow);
    expect(warnings.some((w) => w.includes('act_join'))).toBe(true);
  });

  it('round-trips a nested fan-out inside a parallel branch without losing edges', () => {
    // A -> B, A -> C ; B -> D, B -> E (fan-out nested inside a branch)
    const flow: FlowGraph = {
      id: '88888888-9999-4aaa-8bbb-cccccccccccc',
      version: 1,
      name: 'Nested fan-out',
      nodes: [
        ...TRIGGERS,
        { id: 'A', type: 'action', position: { x: 300, y: 100 }, data: { service: 'scene.create' } },
        { id: 'B', type: 'action', position: { x: 600, y: 0 }, data: { service: 'light.turn_on' } },
        { id: 'C', type: 'action', position: { x: 600, y: 300 }, data: { service: 'light.turn_off' } },
        { id: 'D', type: 'action', position: { x: 900, y: -100 }, data: { service: 'switch.turn_on' } },
        { id: 'E', type: 'action', position: { x: 900, y: 100 }, data: { service: 'switch.turn_off' } },
      ],
      edges: [
        { id: 'e0', source: 'trigger_0', target: 'A' },
        { id: 'e1', source: 'trigger_1', target: 'A' },
        { id: 'e2', source: 'A', target: 'B' },
        { id: 'e3', source: 'A', target: 'C' },
        { id: 'e4', source: 'B', target: 'D' },
        { id: 'e5', source: 'B', target: 'E' },
      ],
    };

    const { yaml, warnings } = transpile(flow);
    if (!yaml) throw new Error('expected generated yaml');

    // All five branches survive, nested one level deep.
    for (const service of ['scene.create', 'light.turn_on', 'light.turn_off', 'switch.turn_on', 'switch.turn_off']) {
      expect(yaml).toContain(service);
    }
    // B, C, D, E are fully owned by the fan-out and should not warn.
    expect(warnings.filter((w) => w.includes('only the first branch will run'))).toEqual([]);
  });

  it('treats duplicate edges to the same target as a single branch, not a fan-out', () => {
    const flow: FlowGraph = {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      version: 1,
      name: 'Duplicate edges',
      nodes: [
        ...TRIGGERS,
        { id: 'A', type: 'action', position: { x: 300, y: 100 }, data: { service: 'scene.create' } },
        { id: 'B', type: 'action', position: { x: 600, y: 0 }, data: { service: 'light.turn_on' } },
      ],
      edges: [
        { id: 'e0', source: 'trigger_0', target: 'A' },
        { id: 'e1', source: 'trigger_1', target: 'A' },
        { id: 'e2', source: 'A', target: 'B' },
        { id: 'e3', source: 'A', target: 'B' },
      ],
    };

    const { yaml } = transpile(flow);
    if (!yaml) throw new Error('expected generated yaml');
    // One duplicated target is not a fan-out - no parallel block needed for it.
    expect(yaml).toContain('light.turn_on');
  });
});

describe('fan-out now also covers condition handles and trigger routing', () => {
  it('keeps both targets when a condition handle fans out to two nodes', () => {
    const flow: FlowGraph = {
      id: 'cccccccc-dddd-4eee-8fff-000000000010',
      version: 1,
      name: 'Condition handle fan-out',
      nodes: [
        ...TRIGGERS,
        {
          id: 'cond_1',
          type: 'condition',
          position: { x: 300, y: 100 },
          data: { condition: 'state', entity_id: 'binary_sensor.c', state: 'on' },
        },
        { id: 'act_true_1', type: 'action', position: { x: 600, y: 0 }, data: { service: 'light.turn_on' } },
        { id: 'act_true_2', type: 'action', position: { x: 600, y: 100 }, data: { service: 'switch.turn_on' } },
        { id: 'act_false', type: 'action', position: { x: 600, y: 300 }, data: { service: 'light.turn_off' } },
      ],
      edges: [
        { id: 'e0', source: 'trigger_0', target: 'cond_1' },
        { id: 'e1', source: 'trigger_1', target: 'cond_1' },
        { id: 'e2', source: 'cond_1', target: 'act_true_1', sourceHandle: 'true' },
        { id: 'e3', source: 'cond_1', target: 'act_true_2', sourceHandle: 'true' },
        { id: 'e4', source: 'cond_1', target: 'act_false', sourceHandle: 'false' },
      ],
    };

    const { yaml } = transpile(flow);
    if (!yaml) throw new Error('expected generated yaml');

    // Before this port, only the first edge on the "true" handle survived.
    expect(yaml).toContain('light.turn_on');
    expect(yaml).toContain('switch.turn_on');
    expect(yaml).toContain('light.turn_off');
    expect(yaml).toContain('__parallel_cond_cond_1__true');
  });

  it('warns instead of dropping branches when a trigger fan-out target loops back', () => {
    // trigger_0 (single) -> A -> B, A -> C, C -> A (back-edge)
    // trigger_1 forces the state-machine strategy.
    const flow: FlowGraph = {
      id: 'cccccccc-dddd-4eee-8fff-000000000011',
      version: 1,
      name: 'Trigger fan-out with back-edge',
      nodes: [
        ...TRIGGERS,
        { id: 'other', type: 'action', position: { x: 300, y: 400 }, data: { service: 'notify.notify' } },
        { id: 'A', type: 'action', position: { x: 300, y: 0 }, data: { service: 'light.turn_on' } },
        { id: 'B', type: 'action', position: { x: 600, y: 0 }, data: { service: 'switch.turn_on' } },
      ],
      edges: [
        { id: 'e0', source: 'trigger_1', target: 'other' },
        { id: 'e1', source: 'trigger_0', target: 'A' },
        { id: 'e2', source: 'trigger_0', target: 'B' },
        { id: 'e3', source: 'B', target: 'A' },
      ],
    };

    const { yaml, warnings } = transpile(flow);
    if (!yaml) throw new Error('expected generated yaml');

    // A must keep its own dispatcher entry since B loops back into it.
    expect(yaml).toContain('current_node == \\"A\\"');
    expect(warnings.some((w) => w.toLowerCase().includes('trigger'))).toBe(true);
  });
});
