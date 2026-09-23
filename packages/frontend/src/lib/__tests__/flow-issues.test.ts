import type { FlowGraph, NodeValidationError } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { computeFlowIssues } from '../flow-issues';

function graph(nodes: FlowGraph['nodes'], edges: FlowGraph['edges'] = []): FlowGraph {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'Test',
    nodes,
    edges,
    metadata: { mode: 'single', initial_state: true },
    version: 1,
  };
}

const trigger = {
  id: 't1',
  type: 'trigger' as const,
  position: { x: 0, y: 0 },
  data: { trigger: 'state', entity_id: 'light.a' },
};
const action = (id: string, service = 'light.turn_on') => ({
  id,
  type: 'action' as const,
  position: { x: 0, y: 0 },
  data: { service },
});
const edge = (source: string, target: string) => ({
  id: `e-${source}-${target}`,
  source,
  target,
});

describe('computeFlowIssues', () => {
  it('reports nothing for an empty canvas or a valid flow', () => {
    expect(computeFlowIssues(graph([]), new Map())).toEqual([]);
    expect(
      computeFlowIssues(graph([trigger, action('a1')], [edge('t1', 'a1')]), new Map())
    ).toEqual([]);
  });

  it('flags steps not connected to any trigger', () => {
    const issues = computeFlowIssues(
      graph([trigger, action('a1'), action('a2')], [edge('t1', 'a1')]),
      new Map()
    );
    expect(issues).toEqual([{ id: 'orphaned:a2', kind: 'orphaned', nodeId: 'a2' }]);
  });

  it('flags a missing trigger / action once each', () => {
    const kinds = computeFlowIssues(graph([action('a1')]), new Map()).map((i) => i.kind);
    expect(kinds).toContain('noTrigger');
    expect(kinds.filter((k) => k === 'noTrigger')).toHaveLength(1);
    expect(computeFlowIssues(graph([trigger]), new Map()).map((i) => i.kind)).toEqual(['noAction']);
  });

  it('reports an invalid service with its name', () => {
    const issues = computeFlowIssues(
      graph([trigger, action('a1', 'notaservice')], [edge('t1', 'a1')]),
      new Map()
    );
    expect(issues).toContainEqual({
      id: 'service:a1',
      kind: 'invalidService',
      nodeId: 'a1',
      detail: 'notaservice',
    });
  });

  it('includes per-node field errors', () => {
    const errors = new Map<string, NodeValidationError[]>([
      ['a1', [{ path: ['entity_id'], message: 'errors:validation.x' }]],
    ]);
    const issues = computeFlowIssues(graph([trigger, action('a1')], [edge('t1', 'a1')]), errors);
    expect(issues).toEqual([
      { id: 'field:a1:0', kind: 'field', nodeId: 'a1', message: 'errors:validation.x' },
    ]);
  });
});
