import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { buildAutomationSaveConfig } from '../save-config';

const graph: FlowGraph = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Save',
  version: 1,
  nodes: [
    {
      id: 't',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { trigger: 'state', entity_id: 'light.a', to: 'on' },
    },
    {
      id: 'a',
      type: 'action',
      position: { x: 320, y: 40 },
      data: { service: 'light.turn_off', target: { entity_id: 'light.b' } },
    },
  ],
  edges: [{ id: 'e', source: 't', target: 'a' }],
};

describe('buildAutomationSaveConfig', () => {
  it('returns the automation with layout metadata', () => {
    const result = buildAutomationSaveConfig(new FlowTranspiler(), graph, {
      alias: 'Hall',
      description: 'desc',
    });
    expect(result.success).toBe(true);
    // The graph's own name wins over `naming` (same order as before the move).
    expect(result.config).toMatchObject({
      alias: 'Save',
      triggers: [{ trigger: 'state', entity_id: 'light.a', to: 'on' }],
      actions: [{ action: 'light.turn_off', target: { entity_id: 'light.b' } }],
      variables: {
        _flode_metadata: {
          version: 1,
          strategy: 'native',
          graph_id: graph.id,
          nodes: { t: { x: 0, y: 0 }, a: { x: 320, y: 40 } },
        },
      },
    });
  });

  it('reports transpile failures instead of throwing', () => {
    const result = buildAutomationSaveConfig(
      new FlowTranspiler(),
      { ...graph, nodes: [] },
      {
        alias: 'x',
        description: '',
      }
    );
    expect(result.success).toBe(false);
  });
});
