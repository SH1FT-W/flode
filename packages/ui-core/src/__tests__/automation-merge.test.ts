import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { type MergeAutomationSource, mergeAutomations } from '../automation-merge';

const mergeAutomationGraphs = (sources: MergeAutomationSource[]) => mergeAutomations(sources).graph;

import { renameJinjaVariable } from '../jinja-rename';

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
      { condition: 'trigger', id: ['two_2__keep', 'two_2_2'] },
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

  it('keeps two automations with the same trigger ID apart', () => {
    const source = (name: string, mode: 'single' | 'restart'): FlowGraph => ({
      ...graph(name, ['on']),
      nodes: [
        ...graph(name, ['on']).nodes,
        {
          id: 'c',
          type: 'condition',
          position: { x: 500, y: 0 },
          data: { condition: 'trigger', id: 'on' },
        },
        {
          id: 'v',
          type: 'action',
          position: { x: 700, y: 0 },
          data: {
            action: 'notify.x',
            data: {
              message: "{{ 'An' if trigger.id == 'on' else 'Aus' }} {{ is_state('a.b', 'on') }}",
            },
          },
        },
      ],
      metadata: { mode },
    });
    const { graph: merged, warnings } = mergeAutomations([
      { graph: source('a', 'single'), automationId: 'a', entityId: 'automation.a', alias: 'A' },
      { graph: source('b', 'restart'), automationId: 'b', entityId: 'automation.b', alias: 'B' },
    ]);
    const data = (id: string) => merged.nodes.find((node) => node.id === id)?.data;
    expect(data('a_1__t0')).toMatchObject({ id: 'a_1__on' });
    expect(data('b_2__t0')).toMatchObject({ id: 'b_2__on' });
    expect(data('a_1__trigger_gate')).toEqual({ condition: 'trigger', id: ['a_1__on'] });
    expect(data('b_2__trigger_gate')).toEqual({ condition: 'trigger', id: ['b_2__on'] });
    expect(data('b_2__c')).toMatchObject({ condition: 'trigger', id: 'b_2__on' });
    expect(data('b_2__v')).toMatchObject({
      data: {
        message: "{{ 'An' if trigger.id == 'b_2__on' else 'Aus' }} {{ is_state('a.b', 'on') }}",
      },
    });
    // Different modes: the merged automation runs parallel, and says so.
    expect(merged.metadata?.mode).toBe('parallel');
    expect(warnings).toContainEqual({
      kind: 'modeChanged',
      modes: ['single', 'restart'],
      mode: 'parallel',
    });
  });

  it('renames a clashing variable and the templates that read it', () => {
    const withVariables = (name: string, level: number, message: string): FlowGraph => ({
      ...graph(name, [undefined]),
      nodes: graph(name, [undefined]).nodes.map((node) =>
        node.id === 'a' ? { ...node, data: { action: 'notify.x', data: { message } } } : node
      ),
      userVariables: { level, double: '{{ level * 2 }}' },
    });
    const { graph: merged, warnings } = mergeAutomations([
      {
        graph: withVariables('a', 10, '{{ level }}'),
        automationId: 'a',
        entityId: 'automation.a',
        alias: 'A',
      },
      {
        graph: withVariables('b', 90, "Stufe {{ level }} – {{ trigger.level }} {{ 'level' }}"),
        automationId: 'b',
        entityId: 'automation.b',
        alias: 'B',
      },
    ]);
    expect(merged.userVariables).toEqual({
      level: 10,
      double: '{{ level * 2 }}',
      b_2__level: 90,
      b_2__double: '{{ b_2__level * 2 }}',
    });
    expect(merged.nodes.find((node) => node.id === 'a_1__a')?.data).toMatchObject({
      data: { message: '{{ level }}' },
    });
    expect(merged.nodes.find((node) => node.id === 'b_2__a')?.data).toMatchObject({
      data: { message: "Stufe {{ b_2__level }} – {{ trigger.level }} {{ 'level' }}" },
    });
    expect(warnings).toEqual([
      { kind: 'variableRenamed', source: 'B', name: 'level', renamed: 'b_2__level' },
      { kind: 'variableRenamed', source: 'B', name: 'double', renamed: 'b_2__double' },
    ]);
    expect(merged.metadata?.mode).toBe('single');
  });

  it('asks to check templates that bind the renamed variable themselves', () => {
    expect(renameJinjaVariable('{% set level = 3 %}{{ level }}', 'level', 'x')).toBeNull();
    expect(renameJinjaVariable('{% for level in xs %}{% endfor %}', 'level', 'x')).toBeNull();
    expect(
      renameJinjaVariable('{% if level > 2 %}{{ f(level=level) }}{% endif %}', 'level', 'x')
    ).toBe('{% if x > 2 %}{{ f(level=x) }}{% endif %}');
  });
});
