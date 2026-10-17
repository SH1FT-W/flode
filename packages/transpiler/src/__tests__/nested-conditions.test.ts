import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler, type TranspileResult } from '../FlowTranspiler';
import { YamlParser } from '../parser/YamlParser';

const createBaseGraph = (nodes: FlowGraph['nodes'], edges: FlowGraph['edges']): FlowGraph => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  version: 1,
  name: 'Test Nested Conditions',
  description: '',
  nodes,
  edges,
  metadata: {
    mode: 'single',
    initial_state: false,
  },
});

/** Root conditions (when any were written) and the action list, for a structural comparison. */
function written(result: TranspileResult): { conditions?: unknown; actions?: unknown } {
  const automation = result.output?.automation;
  const conditions = automation?.conditions;
  return {
    ...(Array.isArray(conditions) && conditions.length > 0 ? { conditions } : {}),
    actions: automation?.actions,
  };
}

describe('Nested Conditions', () => {
  it('should combine two sequential condition nodes into a single "and" condition', () => {
    const graph = createBaseGraph(
      [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
        },
        {
          id: 'cond1',
          type: 'condition',
          position: { x: 200, y: 0 },
          data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
        },
        {
          id: 'cond2',
          type: 'condition',
          position: { x: 400, y: 0 },
          data: { condition: 'numeric_state', entity_id: 'sensor.temperature', below: '20' },
        },
        {
          id: 'action_then',
          type: 'action',
          position: { x: 600, y: 0 },
          data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
        },
        {
          id: 'action_else',
          type: 'action',
          position: { x: 400, y: 200 },
          data: { service: 'notify.mobile_app', data: { message: 'Conditions not met' } },
        },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'cond1' },
        { id: 'e2', source: 'cond1', target: 'cond2', sourceHandle: 'true' },
        { id: 'e3', source: 'cond1', target: 'action_else', sourceHandle: 'false' },
        { id: 'e4', source: 'cond2', target: 'action_then', sourceHandle: 'true' },
      ]
    );

    const transpiler = new FlowTranspiler();
    const result = transpiler.transpile(graph);

    expect(result.success).toBe(true);
    expect(result.errors ?? []).toHaveLength(0);

    expect(written(result)).toEqual({
      actions: [
        {
          if: [
            {
              condition: 'state',
              entity_id: 'light.living_room',
              state: 'off',
            },
            {
              condition: 'numeric_state',
              entity_id: 'sensor.temperature',
              below: '20',
            },
          ],
          then: [
            {
              action: 'light.turn_on',
              target: {
                entity_id: 'light.living_room',
              },
            },
          ],
          else: [
            {
              action: 'notify.mobile_app',
              data: {
                message: 'Conditions not met',
              },
            },
          ],
        },
      ],
    });
  });

  it('should combine three sequential condition nodes into a single if block', () => {
    const graph = createBaseGraph(
      [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
        },
        {
          id: 'cond1',
          type: 'condition',
          position: { x: 200, y: 0 },
          data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
        },
        {
          id: 'cond2',
          type: 'condition',
          position: { x: 400, y: 0 },
          data: { condition: 'numeric_state', entity_id: 'sensor.temperature', below: '20' },
        },
        {
          id: 'cond3',
          type: 'condition',
          position: { x: 600, y: 0 },
          data: { condition: 'time', after: '08:00:00', before: '22:00:00' },
        },
        {
          id: 'action_then',
          type: 'action',
          position: { x: 800, y: 0 },
          data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
        },
        {
          id: 'action_else',
          type: 'action',
          position: { x: 400, y: 200 },
          data: { service: 'notify.mobile_app', data: { message: 'Conditions not met' } },
        },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'cond1' },
        { id: 'e2', source: 'cond1', target: 'cond2', sourceHandle: 'true' },
        { id: 'e3', source: 'cond1', target: 'action_else', sourceHandle: 'false' },
        { id: 'e4', source: 'cond2', target: 'cond3', sourceHandle: 'true' },
        { id: 'e5', source: 'cond3', target: 'action_then', sourceHandle: 'true' },
      ]
    );

    const transpiler = new FlowTranspiler();
    const result = transpiler.transpile(graph);

    expect(result.success).toBe(true);
    expect(result.errors ?? []).toHaveLength(0);

    expect(written(result)).toEqual({
      actions: [
        {
          if: [
            {
              condition: 'state',
              entity_id: 'light.living_room',
              state: 'off',
            },
            {
              condition: 'numeric_state',
              entity_id: 'sensor.temperature',
              below: '20',
            },
            {
              condition: 'time',
              after: '08:00:00',
              before: '22:00:00',
            },
          ],
          then: [
            {
              action: 'light.turn_on',
              target: {
                entity_id: 'light.living_room',
              },
            },
          ],
          else: [
            {
              action: 'notify.mobile_app',
              data: {
                message: 'Conditions not met',
              },
            },
          ],
        },
      ],
    });
  });

  it('should not combine conditions when there is only one condition', () => {
    const graph = createBaseGraph(
      [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
        },
        {
          id: 'cond1',
          type: 'condition',
          position: { x: 200, y: 0 },
          data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
        },
        {
          id: 'action_then',
          type: 'action',
          position: { x: 400, y: 0 },
          data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
        },
        {
          id: 'action_else',
          type: 'action',
          position: { x: 400, y: 200 },
          data: { service: 'notify.mobile_app', data: { message: 'Conditions not met' } },
        },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'cond1' },
        { id: 'e2', source: 'cond1', target: 'action_then', sourceHandle: 'true' },
        { id: 'e3', source: 'cond1', target: 'action_else', sourceHandle: 'false' },
      ]
    );

    const transpiler = new FlowTranspiler();
    const result = transpiler.transpile(graph);

    expect(result.success).toBe(true);
    expect(result.errors ?? []).toHaveLength(0);

    expect(written(result)).toEqual({
      actions: [
        {
          if: [
            {
              condition: 'state',
              entity_id: 'light.living_room',
              state: 'off',
            },
          ],
          then: [
            {
              action: 'light.turn_on',
              target: {
                entity_id: 'light.living_room',
              },
            },
          ],
          else: [
            {
              action: 'notify.mobile_app',
              data: {
                message: 'Conditions not met',
              },
            },
          ],
        },
      ],
    });
  });

  it('should promote condition chain with no else path to root conditions block', () => {
    const graph = createBaseGraph(
      [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
        },
        {
          id: 'cond1',
          type: 'condition',
          position: { x: 200, y: 0 },
          data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
        },
        {
          id: 'cond2',
          type: 'condition',
          position: { x: 400, y: 0 },
          data: { condition: 'numeric_state', entity_id: 'sensor.temperature', below: '20' },
        },
        {
          id: 'action_then',
          type: 'action',
          position: { x: 600, y: 0 },
          data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
        },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'cond1' },
        { id: 'e2', source: 'cond1', target: 'cond2', sourceHandle: 'true' },
        { id: 'e3', source: 'cond2', target: 'action_then', sourceHandle: 'true' },
      ]
    );

    const transpiler = new FlowTranspiler();
    const result = transpiler.transpile(graph);

    expect(result.success).toBe(true);
    expect(result.errors ?? []).toHaveLength(0);

    expect(written(result)).toEqual({
      conditions: [
        {
          condition: 'state',
          entity_id: 'light.living_room',
          state: 'off',
        },
        {
          condition: 'numeric_state',
          entity_id: 'sensor.temperature',
          below: '20',
        },
      ],
      actions: [
        {
          action: 'light.turn_on',
          target: {
            entity_id: 'light.living_room',
          },
        },
      ],
    });
  });

  it('should not combine conditions when second condition has a different else path', () => {
    // In this case: trigger → cond1 → (true) → cond2 → (true) → action_then
    //                            ↘ (false) → action_else1
    //                                 cond2 ↘ (false) → action_else2
    // Both conditions have their own else, so we should NOT chain them
    const graph = createBaseGraph(
      [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
        },
        {
          id: 'cond1',
          type: 'condition',
          position: { x: 200, y: 0 },
          data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
        },
        {
          id: 'cond2',
          type: 'condition',
          position: { x: 400, y: 0 },
          data: { condition: 'numeric_state', entity_id: 'sensor.temperature', below: '20' },
        },
        {
          id: 'action_then',
          type: 'action',
          position: { x: 600, y: 0 },
          data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
        },
        {
          id: 'action_else1',
          type: 'action',
          position: { x: 200, y: 200 },
          data: { service: 'notify.mobile_app', data: { message: 'First condition failed' } },
        },
        {
          id: 'action_else2',
          type: 'action',
          position: { x: 400, y: 200 },
          data: { service: 'notify.mobile_app', data: { message: 'Second condition failed' } },
        },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'cond1' },
        { id: 'e2', source: 'cond1', target: 'cond2', sourceHandle: 'true' },
        { id: 'e3', source: 'cond1', target: 'action_else1', sourceHandle: 'false' },
        { id: 'e4', source: 'cond2', target: 'action_then', sourceHandle: 'true' },
        { id: 'e5', source: 'cond2', target: 'action_else2', sourceHandle: 'false' },
      ]
    );

    const transpiler = new FlowTranspiler();
    const result = transpiler.transpile(graph);

    expect(result.success).toBe(true);
    expect(result.errors ?? []).toHaveLength(0);

    expect(written(result)).toEqual({
      actions: [
        {
          if: [
            {
              condition: 'state',
              entity_id: 'light.living_room',
              state: 'off',
            },
          ],
          then: [
            {
              if: [
                {
                  condition: 'numeric_state',
                  entity_id: 'sensor.temperature',
                  below: '20',
                },
              ],
              then: [
                {
                  action: 'light.turn_on',
                  target: {
                    entity_id: 'light.living_room',
                  },
                },
              ],
              else: [
                {
                  action: 'notify.mobile_app',
                  data: {
                    message: 'Second condition failed',
                  },
                },
              ],
            },
          ],
          else: [
            {
              action: 'notify.mobile_app',
              data: {
                message: 'First condition failed',
              },
            },
          ],
        },
      ],
    });
  });

  it('should preserve condition aliases when promoting to root conditions', () => {
    const graph = createBaseGraph(
      [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
        },
        {
          id: 'cond1',
          type: 'condition',
          position: { x: 200, y: 0 },
          data: {
            condition: 'state',
            entity_id: 'light.living_room',
            state: 'off',
            alias: 'Check light is off',
          },
        },
        {
          id: 'cond2',
          type: 'condition',
          position: { x: 400, y: 0 },
          data: {
            condition: 'numeric_state',
            entity_id: 'sensor.temperature',
            below: '20',
            alias: 'Check temperature',
          },
        },
        {
          id: 'action_then',
          type: 'action',
          position: { x: 600, y: 0 },
          data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
        },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'cond1' },
        { id: 'e2', source: 'cond1', target: 'cond2', sourceHandle: 'true' },
        { id: 'e3', source: 'cond2', target: 'action_then', sourceHandle: 'true' },
      ]
    );

    const transpiler = new FlowTranspiler();
    const result = transpiler.transpile(graph);

    expect(result.success).toBe(true);
    expect(result.errors ?? []).toHaveLength(0);

    expect(written(result)).toEqual({
      conditions: [
        {
          condition: 'state',
          entity_id: 'light.living_room',
          state: 'off',
          alias: 'Check light is off',
        },
        {
          condition: 'numeric_state',
          entity_id: 'sensor.temperature',
          below: '20',
          alias: 'Check temperature',
        },
      ],
      actions: [
        {
          action: 'light.turn_on',
          target: {
            entity_id: 'light.living_room',
          },
        },
      ],
    });
  });

  it('should produce valid YAML that can be round-tripped', async () => {
    const graph = createBaseGraph(
      [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
        },
        {
          id: 'cond1',
          type: 'condition',
          position: { x: 200, y: 0 },
          data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
        },
        {
          id: 'cond2',
          type: 'condition',
          position: { x: 400, y: 0 },
          data: { condition: 'numeric_state', entity_id: 'sensor.temperature', below: '20' },
        },
        {
          id: 'action_then',
          type: 'action',
          position: { x: 600, y: 0 },
          data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
        },
        {
          id: 'action_else',
          type: 'action',
          position: { x: 400, y: 200 },
          data: { service: 'notify.mobile_app', data: { message: 'Conditions not met' } },
        },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'cond1' },
        { id: 'e2', source: 'cond1', target: 'cond2', sourceHandle: 'true' },
        { id: 'e3', source: 'cond1', target: 'action_else', sourceHandle: 'false' },
        { id: 'e4', source: 'cond2', target: 'action_then', sourceHandle: 'true' },
      ]
    );

    const transpiler = new FlowTranspiler();
    const result = transpiler.transpile(graph);

    expect(result.success).toBe(true);
    const yaml = result.yaml ?? '';

    // Parse the YAML back into a graph
    const parser = new YamlParser();
    const parseResult = await parser.parse(yaml);

    expect(parseResult.success).toBe(true);
    expect(parseResult.graph).toBeDefined();

    // The parsed graph should have valid structure
    const parsedGraph = parseResult.graph!;
    expect(parsedGraph.nodes.some((n) => n.type === 'trigger')).toBe(true);
    expect(parsedGraph.nodes.some((n) => n.type === 'condition')).toBe(true);
    expect(parsedGraph.nodes.some((n) => n.type === 'action')).toBe(true);
  });

  it('should handle condition chain followed by another action', () => {
    // trigger → cond1 → cond2 → action1 → action2
    //              ↘ else_action
    const graph = createBaseGraph(
      [
        {
          id: 'trigger',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
        },
        {
          id: 'cond1',
          type: 'condition',
          position: { x: 200, y: 0 },
          data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
        },
        {
          id: 'cond2',
          type: 'condition',
          position: { x: 400, y: 0 },
          data: { condition: 'numeric_state', entity_id: 'sensor.temperature', below: '20' },
        },
        {
          id: 'action1',
          type: 'action',
          position: { x: 600, y: 0 },
          data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
        },
        {
          id: 'action2',
          type: 'action',
          position: { x: 800, y: 0 },
          data: { service: 'notify.mobile_app', data: { message: 'Light turned on' } },
        },
        {
          id: 'else_action',
          type: 'action',
          position: { x: 200, y: 200 },
          data: { service: 'notify.mobile_app', data: { message: 'Conditions not met' } },
        },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'cond1' },
        { id: 'e2', source: 'cond1', target: 'cond2', sourceHandle: 'true' },
        { id: 'e3', source: 'cond1', target: 'else_action', sourceHandle: 'false' },
        { id: 'e4', source: 'cond2', target: 'action1', sourceHandle: 'true' },
        { id: 'e5', source: 'action1', target: 'action2' },
      ]
    );

    const transpiler = new FlowTranspiler();
    const result = transpiler.transpile(graph);

    expect(result.success).toBe(true);
    expect(result.errors ?? []).toHaveLength(0);

    expect(written(result)).toEqual({
      actions: [
        {
          if: [
            {
              condition: 'state',
              entity_id: 'light.living_room',
              state: 'off',
            },
            {
              condition: 'numeric_state',
              entity_id: 'sensor.temperature',
              below: '20',
            },
          ],
          then: [
            {
              action: 'light.turn_on',
              target: {
                entity_id: 'light.living_room',
              },
            },
            {
              action: 'notify.mobile_app',
              data: {
                message: 'Light turned on',
              },
            },
          ],
          else: [
            {
              action: 'notify.mobile_app',
              data: {
                message: 'Conditions not met',
              },
            },
          ],
        },
      ],
    });
  });

  describe('Root Conditions Promotion', () => {
    it('should promote a single condition with no else to root conditions', () => {
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'cond1',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
          },
          {
            id: 'action1',
            type: 'action',
            position: { x: 400, y: 0 },
            data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond1' },
          { id: 'e2', source: 'cond1', target: 'action1', sourceHandle: 'true' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);

      expect(written(result)).toEqual({
        conditions: [
          {
            condition: 'state',
            entity_id: 'light.living_room',
            state: 'off',
          },
        ],
        actions: [
          {
            action: 'light.turn_on',
            target: {
              entity_id: 'light.living_room',
            },
          },
        ],
      });
    });

    it('should only promote leading conditions without else paths, keeping conditions with else in actions', () => {
      // trigger → cond1 (no else) → cond2 (has else) → action_then
      //                                     ↘ action_else
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'cond1',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
          },
          {
            id: 'cond2',
            type: 'condition',
            position: { x: 400, y: 0 },
            data: { condition: 'numeric_state', entity_id: 'sensor.temperature', below: '20' },
          },
          {
            id: 'action_then',
            type: 'action',
            position: { x: 600, y: 0 },
            data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
          },
          {
            id: 'action_else',
            type: 'action',
            position: { x: 400, y: 200 },
            data: { service: 'notify.mobile_app', data: { message: 'Too warm' } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond1' },
          { id: 'e2', source: 'cond1', target: 'cond2', sourceHandle: 'true' },
          { id: 'e3', source: 'cond2', target: 'action_then', sourceHandle: 'true' },
          { id: 'e4', source: 'cond2', target: 'action_else', sourceHandle: 'false' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);

      expect(written(result)).toEqual({
        conditions: [
          {
            condition: 'state',
            entity_id: 'light.living_room',
            state: 'off',
          },
        ],
        actions: [
          {
            if: [
              {
                condition: 'numeric_state',
                entity_id: 'sensor.temperature',
                below: '20',
              },
            ],
            then: [
              {
                action: 'light.turn_on',
                target: {
                  entity_id: 'light.living_room',
                },
              },
            ],
            else: [
              {
                action: 'notify.mobile_app',
                data: {
                  message: 'Too warm',
                },
              },
            ],
          },
        ],
      });
    });

    it('should not promote conditions when first condition has else path', () => {
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'cond1',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
          },
          {
            id: 'action_then',
            type: 'action',
            position: { x: 400, y: 0 },
            data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
          },
          {
            id: 'action_else',
            type: 'action',
            position: { x: 400, y: 200 },
            data: { service: 'light.turn_off', target: { entity_id: 'light.living_room' } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond1' },
          { id: 'e2', source: 'cond1', target: 'action_then', sourceHandle: 'true' },
          { id: 'e3', source: 'cond1', target: 'action_else', sourceHandle: 'false' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);

      expect(written(result)).toEqual({
        actions: [
          {
            if: [
              {
                condition: 'state',
                entity_id: 'light.living_room',
                state: 'off',
              },
            ],
            then: [
              {
                action: 'light.turn_on',
                target: {
                  entity_id: 'light.living_room',
                },
              },
            ],
            else: [
              {
                action: 'light.turn_off',
                target: {
                  entity_id: 'light.living_room',
                },
              },
            ],
          },
        ],
      });
    });

    it('should not promote when first node after trigger is not a condition', () => {
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'action1',
            type: 'action',
            position: { x: 200, y: 0 },
            data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
          },
        ],
        [{ id: 'e1', source: 'trigger', target: 'action1' }]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);

      expect(written(result)).toEqual({
        actions: [
          {
            action: 'light.turn_on',
            target: {
              entity_id: 'light.living_room',
            },
          },
        ],
      });
    });

    it('should promote conditions and handle multiple subsequent actions', () => {
      // trigger → cond1 (no else) → action1 → action2
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'cond1',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
          },
          {
            id: 'action1',
            type: 'action',
            position: { x: 400, y: 0 },
            data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
          },
          {
            id: 'action2',
            type: 'action',
            position: { x: 600, y: 0 },
            data: { service: 'notify.mobile_app', data: { message: 'Light turned on' } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond1' },
          { id: 'e2', source: 'cond1', target: 'action1', sourceHandle: 'true' },
          { id: 'e3', source: 'action1', target: 'action2' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);

      expect(written(result)).toEqual({
        conditions: [
          {
            condition: 'state',
            entity_id: 'light.living_room',
            state: 'off',
          },
        ],
        actions: [
          {
            action: 'light.turn_on',
            target: {
              entity_id: 'light.living_room',
            },
          },
          {
            action: 'notify.mobile_app',
            data: {
              message: 'Light turned on',
            },
          },
        ],
      });
    });

    it('should promote inverted condition (false-handle only) as condition: not', () => {
      // trigger → cond1 (false only) → action
      // This represents an inverted condition: execute action when condition is NOT true
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'cond1',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: { condition: 'state', entity_id: 'light.living_room', state: 'on' },
          },
          {
            id: 'action1',
            type: 'action',
            position: { x: 400, y: 0 },
            data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond1' },
          { id: 'e2', source: 'cond1', target: 'action1', sourceHandle: 'false' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);

      expect(written(result)).toEqual({
        conditions: [
          {
            condition: 'not',
            conditions: [
              {
                condition: 'state',
                entity_id: 'light.living_room',
                state: 'on',
              },
            ],
          },
        ],
        actions: [
          {
            action: 'light.turn_on',
            target: {
              entity_id: 'light.living_room',
            },
          },
        ],
      });
    });

    it('should promote chain of mixed true/false-handle conditions to root conditions', () => {
      // trigger → cond1 (false only) → cond2 (true only) → action
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'cond1',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: { condition: 'state', entity_id: 'light.living_room', state: 'on' },
          },
          {
            id: 'cond2',
            type: 'condition',
            position: { x: 400, y: 0 },
            data: { condition: 'numeric_state', entity_id: 'sensor.temperature', below: '20' },
          },
          {
            id: 'action1',
            type: 'action',
            position: { x: 600, y: 0 },
            data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond1' },
          { id: 'e2', source: 'cond1', target: 'cond2', sourceHandle: 'false' },
          { id: 'e3', source: 'cond2', target: 'action1', sourceHandle: 'true' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);

      expect(written(result)).toEqual({
        conditions: [
          {
            condition: 'not',
            conditions: [
              {
                condition: 'state',
                entity_id: 'light.living_room',
                state: 'on',
              },
            ],
          },
          {
            condition: 'numeric_state',
            entity_id: 'sensor.temperature',
            below: '20',
          },
        ],
        actions: [
          {
            action: 'light.turn_on',
            target: {
              entity_id: 'light.living_room',
            },
          },
        ],
      });
    });

    it('should promote multiple false-handle conditions as not wrappers', () => {
      // trigger → cond1 (false) → cond2 (false) → action
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'cond1',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: { condition: 'state', entity_id: 'light.living_room', state: 'on' },
          },
          {
            id: 'cond2',
            type: 'condition',
            position: { x: 400, y: 0 },
            data: { condition: 'state', entity_id: 'light.bedroom', state: 'on' },
          },
          {
            id: 'action1',
            type: 'action',
            position: { x: 600, y: 0 },
            data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond1' },
          { id: 'e2', source: 'cond1', target: 'cond2', sourceHandle: 'false' },
          { id: 'e3', source: 'cond2', target: 'action1', sourceHandle: 'false' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);

      expect(written(result)).toEqual({
        conditions: [
          {
            condition: 'not',
            conditions: [
              {
                condition: 'state',
                entity_id: 'light.living_room',
                state: 'on',
              },
            ],
          },
          {
            condition: 'not',
            conditions: [
              {
                condition: 'state',
                entity_id: 'light.bedroom',
                state: 'on',
              },
            ],
          },
        ],
        actions: [
          {
            action: 'light.turn_on',
            target: {
              entity_id: 'light.living_room',
            },
          },
        ],
      });
    });
  });

  describe('Sibling Conditions (Fan-out)', () => {
    it('should include all sibling conditions connected to the same true handle', () => {
      // This tests the fan-out pattern: one condition branches to multiple conditions on the same handle
      // trigger → cond_parent (true)→ cond_a → action_a
      //                       (true)→ cond_b → action_b
      //                       (true)→ cond_c → action_c
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'media_player.htpc' },
          },
          {
            id: 'cond_parent',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: { condition: 'state', entity_id: 'media_player.htpc', state: 'playing' },
          },
          {
            id: 'cond_a',
            type: 'condition',
            position: { x: 400, y: -100 },
            data: { condition: 'state', entity_id: 'binary_sensor.switch_a', state: 'on' },
          },
          {
            id: 'cond_b',
            type: 'condition',
            position: { x: 400, y: 0 },
            data: { condition: 'state', entity_id: 'binary_sensor.switch_b', state: 'on' },
          },
          {
            id: 'cond_c',
            type: 'condition',
            position: { x: 400, y: 100 },
            data: { condition: 'state', entity_id: 'binary_sensor.switch_c', state: 'on' },
          },
          {
            id: 'action_a',
            type: 'action',
            position: { x: 600, y: -100 },
            data: { service: 'light.turn_off', target: { entity_id: ['light.a'] } },
          },
          {
            id: 'action_b',
            type: 'action',
            position: { x: 600, y: 0 },
            data: { service: 'light.turn_off', target: { entity_id: ['light.b'] } },
          },
          {
            id: 'action_c',
            type: 'action',
            position: { x: 600, y: 100 },
            data: { service: 'light.turn_off', target: { entity_id: ['light.c'] } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond_parent' },
          // All three conditions branch from the same true handle
          { id: 'e2', source: 'cond_parent', target: 'cond_a', sourceHandle: 'true' },
          { id: 'e3', source: 'cond_parent', target: 'cond_b', sourceHandle: 'true' },
          { id: 'e4', source: 'cond_parent', target: 'cond_c', sourceHandle: 'true' },
          // Each condition leads to its own action
          { id: 'e5', source: 'cond_a', target: 'action_a', sourceHandle: 'true' },
          { id: 'e6', source: 'cond_b', target: 'action_b', sourceHandle: 'true' },
          { id: 'e7', source: 'cond_c', target: 'action_c', sourceHandle: 'true' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);
      expect(result.errors ?? []).toHaveLength(0);

      expect(written(result)).toEqual({
        conditions: [
          {
            condition: 'state',
            entity_id: 'media_player.htpc',
            state: 'playing',
          },
        ],
        actions: [
          {
            parallel: [
              {
                if: [
                  {
                    condition: 'state',
                    entity_id: 'binary_sensor.switch_a',
                    state: 'on',
                  },
                ],
                then: [
                  {
                    action: 'light.turn_off',
                    target: {
                      entity_id: ['light.a'],
                    },
                  },
                ],
                else: [],
              },
              {
                if: [
                  {
                    condition: 'state',
                    entity_id: 'binary_sensor.switch_b',
                    state: 'on',
                  },
                ],
                then: [
                  {
                    action: 'light.turn_off',
                    target: {
                      entity_id: ['light.b'],
                    },
                  },
                ],
                else: [],
              },
              {
                if: [
                  {
                    condition: 'state',
                    entity_id: 'binary_sensor.switch_c',
                    state: 'on',
                  },
                ],
                then: [
                  {
                    action: 'light.turn_off',
                    target: {
                      entity_id: ['light.c'],
                    },
                  },
                ],
                else: [],
              },
            ],
          },
        ],
      });
    });

    it('should include all sibling conditions connected to the same false handle', () => {
      // trigger → cond_parent (false)→ cond_a → action_a
      //                       (false)→ cond_b → action_b
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'media_player.htpc' },
          },
          {
            id: 'cond_parent',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: { condition: 'state', entity_id: 'media_player.htpc', state: 'playing' },
          },
          {
            id: 'cond_a',
            type: 'condition',
            position: { x: 400, y: 100 },
            data: { condition: 'state', entity_id: 'binary_sensor.switch_a', state: 'on' },
          },
          {
            id: 'cond_b',
            type: 'condition',
            position: { x: 400, y: 200 },
            data: { condition: 'state', entity_id: 'binary_sensor.switch_b', state: 'on' },
          },
          {
            id: 'action_a',
            type: 'action',
            position: { x: 600, y: 100 },
            data: { service: 'light.turn_on', target: { entity_id: ['light.a'] } },
          },
          {
            id: 'action_b',
            type: 'action',
            position: { x: 600, y: 200 },
            data: { service: 'light.turn_on', target: { entity_id: ['light.b'] } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond_parent' },
          // Both conditions branch from the false handle
          { id: 'e2', source: 'cond_parent', target: 'cond_a', sourceHandle: 'false' },
          { id: 'e3', source: 'cond_parent', target: 'cond_b', sourceHandle: 'false' },
          // Each condition leads to its own action
          { id: 'e4', source: 'cond_a', target: 'action_a', sourceHandle: 'true' },
          { id: 'e5', source: 'cond_b', target: 'action_b', sourceHandle: 'true' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);
      expect(result.errors ?? []).toHaveLength(0);

      expect(written(result)).toEqual({
        conditions: [
          {
            condition: 'not',
            conditions: [
              {
                condition: 'state',
                entity_id: 'media_player.htpc',
                state: 'playing',
              },
            ],
          },
        ],
        actions: [
          {
            parallel: [
              {
                if: [
                  {
                    condition: 'state',
                    entity_id: 'binary_sensor.switch_a',
                    state: 'on',
                  },
                ],
                then: [
                  {
                    action: 'light.turn_on',
                    target: {
                      entity_id: ['light.a'],
                    },
                  },
                ],
                else: [],
              },
              {
                if: [
                  {
                    condition: 'state',
                    entity_id: 'binary_sensor.switch_b',
                    state: 'on',
                  },
                ],
                then: [
                  {
                    action: 'light.turn_on',
                    target: {
                      entity_id: ['light.b'],
                    },
                  },
                ],
                else: [],
              },
            ],
          },
        ],
      });
    });

    it('should handle both true and false fan-out simultaneously', () => {
      // trigger → cond_parent (true)→ cond_t1 → action_t1
      //                       (true)→ cond_t2 → action_t2
      //                       (false)→ cond_f1 → action_f1
      //                       (false)→ cond_f2 → action_f2
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'media_player.htpc' },
          },
          {
            id: 'cond_parent',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: { condition: 'state', entity_id: 'media_player.htpc', state: 'playing' },
          },
          // True branch conditions
          {
            id: 'cond_t1',
            type: 'condition',
            position: { x: 400, y: -100 },
            data: { condition: 'state', entity_id: 'binary_sensor.true_switch_1', state: 'on' },
          },
          {
            id: 'cond_t2',
            type: 'condition',
            position: { x: 400, y: 0 },
            data: { condition: 'state', entity_id: 'binary_sensor.true_switch_2', state: 'on' },
          },
          // False branch conditions
          {
            id: 'cond_f1',
            type: 'condition',
            position: { x: 400, y: 100 },
            data: { condition: 'state', entity_id: 'binary_sensor.false_switch_1', state: 'on' },
          },
          {
            id: 'cond_f2',
            type: 'condition',
            position: { x: 400, y: 200 },
            data: { condition: 'state', entity_id: 'binary_sensor.false_switch_2', state: 'on' },
          },
          // Actions
          {
            id: 'action_t1',
            type: 'action',
            position: { x: 600, y: -100 },
            data: { service: 'light.turn_off', target: { entity_id: ['light.t1'] } },
          },
          {
            id: 'action_t2',
            type: 'action',
            position: { x: 600, y: 0 },
            data: { service: 'light.turn_off', target: { entity_id: ['light.t2'] } },
          },
          {
            id: 'action_f1',
            type: 'action',
            position: { x: 600, y: 100 },
            data: { service: 'light.turn_on', target: { entity_id: ['light.f1'] } },
          },
          {
            id: 'action_f2',
            type: 'action',
            position: { x: 600, y: 200 },
            data: { service: 'light.turn_on', target: { entity_id: ['light.f2'] } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond_parent' },
          // True branch fan-out
          { id: 'e2', source: 'cond_parent', target: 'cond_t1', sourceHandle: 'true' },
          { id: 'e3', source: 'cond_parent', target: 'cond_t2', sourceHandle: 'true' },
          // False branch fan-out
          { id: 'e4', source: 'cond_parent', target: 'cond_f1', sourceHandle: 'false' },
          { id: 'e5', source: 'cond_parent', target: 'cond_f2', sourceHandle: 'false' },
          // Actions
          { id: 'e6', source: 'cond_t1', target: 'action_t1', sourceHandle: 'true' },
          { id: 'e7', source: 'cond_t2', target: 'action_t2', sourceHandle: 'true' },
          { id: 'e8', source: 'cond_f1', target: 'action_f1', sourceHandle: 'true' },
          { id: 'e9', source: 'cond_f2', target: 'action_f2', sourceHandle: 'true' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);
      expect(result.errors ?? []).toHaveLength(0);

      expect(written(result)).toEqual({
        actions: [
          {
            if: [
              {
                condition: 'state',
                entity_id: 'media_player.htpc',
                state: 'playing',
              },
            ],
            then: [
              {
                parallel: [
                  {
                    if: [
                      {
                        condition: 'state',
                        entity_id: 'binary_sensor.true_switch_1',
                        state: 'on',
                      },
                    ],
                    then: [
                      {
                        action: 'light.turn_off',
                        target: {
                          entity_id: ['light.t1'],
                        },
                      },
                    ],
                    else: [],
                  },
                  {
                    if: [
                      {
                        condition: 'state',
                        entity_id: 'binary_sensor.true_switch_2',
                        state: 'on',
                      },
                    ],
                    then: [
                      {
                        action: 'light.turn_off',
                        target: {
                          entity_id: ['light.t2'],
                        },
                      },
                    ],
                    else: [],
                  },
                ],
              },
            ],
            else: [
              {
                parallel: [
                  {
                    if: [
                      {
                        condition: 'state',
                        entity_id: 'binary_sensor.false_switch_1',
                        state: 'on',
                      },
                    ],
                    then: [
                      {
                        action: 'light.turn_on',
                        target: {
                          entity_id: ['light.f1'],
                        },
                      },
                    ],
                    else: [],
                  },
                  {
                    if: [
                      {
                        condition: 'state',
                        entity_id: 'binary_sensor.false_switch_2',
                        state: 'on',
                      },
                    ],
                    then: [
                      {
                        action: 'light.turn_on',
                        target: {
                          entity_id: ['light.f2'],
                        },
                      },
                    ],
                    else: [],
                  },
                ],
              },
            ],
          },
        ],
      });
    });
  });

  describe('OR Conditions', () => {
    it('should combine parallel conditions with converging true paths into OR', () => {
      // Graph: trigger → (cond1, cond2 in parallel) → both true paths to action
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'cond1',
            type: 'condition',
            position: { x: 200, y: -100 },
            data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
          },
          {
            id: 'cond2',
            type: 'condition',
            position: { x: 200, y: 100 },
            data: { condition: 'numeric_state', entity_id: 'sensor.temperature', below: '20' },
          },
          {
            id: 'action_then',
            type: 'action',
            position: { x: 400, y: 0 },
            data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond1' },
          { id: 'e2', source: 'trigger', target: 'cond2' },
          { id: 'e3', source: 'cond1', target: 'action_then', sourceHandle: 'true' },
          { id: 'e4', source: 'cond2', target: 'action_then', sourceHandle: 'true' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);
      expect(result.errors ?? []).toHaveLength(0);

      expect(written(result)).toEqual({
        actions: [
          {
            if: [
              {
                condition: 'or',
                conditions: [
                  {
                    condition: 'state',
                    entity_id: 'light.living_room',
                    state: 'off',
                  },
                  {
                    condition: 'numeric_state',
                    entity_id: 'sensor.temperature',
                    below: '20',
                  },
                ],
              },
            ],
            then: [
              {
                action: 'light.turn_on',
                target: {
                  entity_id: 'light.living_room',
                },
              },
            ],
            else: [],
          },
        ],
      });
    });

    it('should combine parallel conditions with converging false paths into OR', () => {
      // Graph: trigger → (cond1, cond2 in parallel) → both false paths to action
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'cond1',
            type: 'condition',
            position: { x: 200, y: -100 },
            data: { condition: 'state', entity_id: 'light.living_room', state: 'on' },
          },
          {
            id: 'cond2',
            type: 'condition',
            position: { x: 200, y: 100 },
            data: { condition: 'numeric_state', entity_id: 'sensor.temperature', above: '25' },
          },
          {
            id: 'action_else',
            type: 'action',
            position: { x: 400, y: 0 },
            data: { service: 'notify.mobile_app', data: { message: 'Both conditions failed' } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond1' },
          { id: 'e2', source: 'trigger', target: 'cond2' },
          { id: 'e3', source: 'cond1', target: 'action_else', sourceHandle: 'false' },
          { id: 'e4', source: 'cond2', target: 'action_else', sourceHandle: 'false' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);
      expect(result.errors ?? []).toHaveLength(0);

      expect(written(result)).toEqual({
        actions: [
          {
            if: [
              {
                condition: 'or',
                conditions: [
                  {
                    condition: 'state',
                    entity_id: 'light.living_room',
                    state: 'on',
                  },
                  {
                    condition: 'numeric_state',
                    entity_id: 'sensor.temperature',
                    above: '25',
                  },
                ],
              },
            ],
            then: [],
            else: [
              {
                action: 'notify.mobile_app',
                data: {
                  message: 'Both conditions failed',
                },
              },
            ],
          },
        ],
      });
    });

    it('should handle three parallel conditions converging to OR', () => {
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'cond1',
            type: 'condition',
            position: { x: 200, y: -100 },
            data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
          },
          {
            id: 'cond2',
            type: 'condition',
            position: { x: 200, y: 0 },
            data: { condition: 'numeric_state', entity_id: 'sensor.temperature', below: '20' },
          },
          {
            id: 'cond3',
            type: 'condition',
            position: { x: 200, y: 100 },
            data: { condition: 'time', after: '22:00:00', before: '06:00:00' },
          },
          {
            id: 'action_then',
            type: 'action',
            position: { x: 400, y: 0 },
            data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond1' },
          { id: 'e2', source: 'trigger', target: 'cond2' },
          { id: 'e3', source: 'trigger', target: 'cond3' },
          { id: 'e4', source: 'cond1', target: 'action_then', sourceHandle: 'true' },
          { id: 'e5', source: 'cond2', target: 'action_then', sourceHandle: 'true' },
          { id: 'e6', source: 'cond3', target: 'action_then', sourceHandle: 'true' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);
      expect(result.errors ?? []).toHaveLength(0);

      expect(written(result)).toEqual({
        actions: [
          {
            if: [
              {
                condition: 'or',
                conditions: [
                  {
                    condition: 'state',
                    entity_id: 'light.living_room',
                    state: 'off',
                  },
                  {
                    condition: 'numeric_state',
                    entity_id: 'sensor.temperature',
                    below: '20',
                  },
                  {
                    condition: 'time',
                    after: '22:00:00',
                    before: '06:00:00',
                  },
                ],
              },
            ],
            then: [
              {
                action: 'light.turn_on',
                target: {
                  entity_id: 'light.living_room',
                },
              },
            ],
            else: [],
          },
        ],
      });
    });

    it('should handle OR conditions followed by additional actions', () => {
      const graph = createBaseGraph(
        [
          {
            id: 'trigger',
            type: 'trigger',
            position: { x: 0, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.motion' },
          },
          {
            id: 'cond1',
            type: 'condition',
            position: { x: 200, y: -100 },
            data: { condition: 'state', entity_id: 'light.living_room', state: 'off' },
          },
          {
            id: 'cond2',
            type: 'condition',
            position: { x: 200, y: 100 },
            data: { condition: 'numeric_state', entity_id: 'sensor.temperature', below: '20' },
          },
          {
            id: 'action1',
            type: 'action',
            position: { x: 400, y: 0 },
            data: { service: 'light.turn_on', target: { entity_id: 'light.living_room' } },
          },
          {
            id: 'action2',
            type: 'action',
            position: { x: 600, y: 0 },
            data: { service: 'notify.mobile_app', data: { message: 'Light turned on' } },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'cond1' },
          { id: 'e2', source: 'trigger', target: 'cond2' },
          { id: 'e3', source: 'cond1', target: 'action1', sourceHandle: 'true' },
          { id: 'e4', source: 'cond2', target: 'action1', sourceHandle: 'true' },
          { id: 'e5', source: 'action1', target: 'action2' },
        ]
      );

      const transpiler = new FlowTranspiler();
      const result = transpiler.transpile(graph);

      expect(result.success).toBe(true);
      expect(result.errors ?? []).toHaveLength(0);

      expect(written(result)).toEqual({
        actions: [
          {
            if: [
              {
                condition: 'or',
                conditions: [
                  {
                    condition: 'state',
                    entity_id: 'light.living_room',
                    state: 'off',
                  },
                  {
                    condition: 'numeric_state',
                    entity_id: 'sensor.temperature',
                    below: '20',
                  },
                ],
              },
            ],
            then: [
              {
                action: 'light.turn_on',
                target: {
                  entity_id: 'light.living_room',
                },
              },
              {
                action: 'notify.mobile_app',
                data: {
                  message: 'Light turned on',
                },
              },
            ],
            else: [],
          },
        ],
      });
    });
  });
});
