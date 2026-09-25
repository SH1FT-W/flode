import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { mergeAutomationGraphs } from '../automation-merge';

function graph(name: string, triggerIds: (string | undefined)[]): FlowGraph {
  const triggers = triggerIds.map((id, index) => ({
    id: `t${index}`,
    type: 'trigger' as const,
    position: { x: 0, y: index * 100 },
    data: { trigger: 'state', entity_id: `input_boolean.${name}_${index}`, ...(id ? { id } : {}) },
  }));
  return {
    id: name,
    name,
    nodes: [
      ...triggers,
      {
        id: 'a',
        type: 'action',
        position: { x: 300, y: 0 },
        data: { action: 'light.turn_on' },
      },
    ],
    edges: triggers.map((trigger) => ({ id: `${trigger.id}-a`, source: trigger.id, target: 'a' })),
    metadata: { mode: 'single' },
    version: 1,
  };
}

describe('mergeAutomationGraphs', () => {
  it('gates each automation behind its own triggers', () => {
    const merged = mergeAutomationGraphs([
      {
        graph: graph('one', [undefined]),
        automationId: '1',
        entityId: 'automation.one',
        alias: 'One',
      },
      {
        graph: graph('two', ['keep', undefined]),
        automationId: '2',
        entityId: 'automation.two',
        alias: 'Two',
      },
    ]);
    const gates = merged.nodes.filter((node) => node.type === 'condition');
    expect(gates.map((node) => node.data)).toEqual([
      { condition: 'trigger', id: ['one_1_1'] },
      { condition: 'trigger', id: ['keep', 'two_2_2'] },
    ]);
    for (const gate of gates) {
      const into = merged.edges
        .filter((edge) => edge.target === gate.id)
        .map((edge) => edge.source);
      const out = merged.edges.filter((edge) => edge.source === gate.id);
      expect(
        into.every((id) => merged.nodes.find((node) => node.id === id)?.type === 'trigger')
      ).toBe(true);
      expect(out).toHaveLength(1);
      expect(out[0]?.sourceHandle).toBe('true');
    }
    // No trigger leads straight to an action any more.
    const triggerIds = new Set(merged.nodes.filter((n) => n.type === 'trigger').map((n) => n.id));
    const direct = merged.edges.filter(
      (edge) => triggerIds.has(edge.source) && !edge.target.endsWith('__trigger_gate')
    );
    expect(direct).toEqual([]);
  });
});
