import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { draftFlowWithAi } from '../ai-draft';

const graph: FlowGraph = {
  id: 'g',
  name: 'Draft',
  nodes: [
    {
      id: 'a',
      type: 'action',
      position: { x: 0, y: 0 },
      data: { action: 'light.turn_on', target: { entity_id: 'light.ghost' } },
    },
  ],
  edges: [],
  metadata: { mode: 'single' },
  version: 1,
};

describe('draftFlowWithAi', () => {
  it('returns what is still wrong after the repair round', async () => {
    const asked: string[] = [];
    const result = await draftFlowWithAi(
      { description: 'Licht an', kind: 'automation', language: 'de', entities: [] },
      {
        generate: async (taskName) => {
          asked.push(taskName);
          return 'yaml';
        },
        parse: async () => ({ success: true, graph }),
        validate: () => ['The automation has no trigger'],
      }
    );
    expect(asked).toEqual(['FLODE: build automation', 'FLODE: fix automation']);
    expect(result.problems).toEqual(['The automation has no trigger']);
    expect(result.unknownEntityIds).toEqual(['light.ghost']);
  });
});
