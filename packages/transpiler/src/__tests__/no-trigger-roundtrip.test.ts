import { isManualStart, MANUAL_START_TRIGGER } from '@flode/shared';
import { load as yamlLoad } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';

const transpiler = new FlowTranspiler();

/** C.A.F.E. #248: HA allows automations without triggers (started by hand or by other automations). */
const automation = {
  alias: 'Nur manuell',
  description: '',
  triggers: [],
  conditions: [{ condition: 'state', entity_id: 'input_boolean.guests', state: 'off' }],
  actions: [
    { action: 'light.turn_on', target: { entity_id: 'light.kitchen' } },
    { delay: { hours: 0, minutes: 0, seconds: 5, milliseconds: 0 } },
    { action: 'light.turn_off', target: { entity_id: 'light.kitchen' } },
  ],
  mode: 'single',
};

function savedConfig(yaml: string | undefined): Record<string, unknown> {
  const loaded = yamlLoad(yaml ?? '');
  if (typeof loaded !== 'object' || loaded === null || Array.isArray(loaded)) {
    throw new Error('no config');
  }
  const { variables: _variables, ...rest } = Object.fromEntries(Object.entries(loaded));
  return rest;
}

describe('automation without triggers', () => {
  it.each([
    ['triggers: []', automation],
    ['no triggers key', { ...automation, triggers: undefined }],
  ])('opens (%s) with a hidden start node', async (_name, config) => {
    const parsed = await transpiler.fromYaml(JSON.stringify(config));
    expect(parsed.errors).toBeUndefined();
    expect(parsed.success).toBe(true);
    const triggers = parsed.graph?.nodes.filter((node) => node.type === 'trigger') ?? [];
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.data).toEqual({ trigger: MANUAL_START_TRIGGER });
    expect(parsed.warnings).not.toContain('No triggers found in automation');
  });

  it('saves back without triggers, everything else unchanged', async () => {
    const parsed = await transpiler.fromYaml(JSON.stringify(automation));
    if (!parsed.graph) throw new Error('parse failed');
    const saved = transpiler.transpile(parsed.graph);
    expect(saved.success).toBe(true);
    expect(savedConfig(saved.yaml)).toEqual(automation);
    // …and again: stable on the second round
    const reparsed = await transpiler.fromYaml(saved.yaml ?? '');
    if (!reparsed.graph) throw new Error('reparse failed');
    expect(savedConfig(transpiler.transpile(reparsed.graph).yaml)).toEqual(automation);
  });

  it('keeps a trigger added later and drops the hidden start', async () => {
    const parsed = await transpiler.fromYaml(JSON.stringify(automation));
    const graph = parsed.graph;
    if (!graph) throw new Error('parse failed');
    const start = graph.nodes.find((node) => isManualStart(node.data));
    const first = graph.edges.find((edge) => edge.source === start?.id)?.target;
    if (!first) throw new Error('no entry');
    const withTrigger = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: 'trigger_new',
          type: 'trigger' as const,
          position: { x: -300, y: 0 },
          data: { trigger: 'state', entity_id: 'binary_sensor.door', to: 'on' },
        },
      ],
      edges: [...graph.edges, { id: 'e_new', source: 'trigger_new', target: first }],
    };
    const saved = savedConfig(transpiler.transpile(withTrigger).yaml);
    expect(saved.triggers).toEqual([
      { trigger: 'state', entity_id: 'binary_sensor.door', to: 'on' },
    ]);
    expect(saved.actions).toEqual(automation.actions);
  });

  it('drops the hidden start once a trigger leads elsewhere (no stale trigger index)', async () => {
    const parsed = await transpiler.fromYaml(JSON.stringify(automation));
    const graph = parsed.graph;
    if (!graph) throw new Error('parse failed');
    const last = graph.nodes.find(
      (node) => node.type === 'action' && !graph.edges.some((edge) => edge.source === node.id)
    );
    if (!last) throw new Error('no last step');
    const saved = savedConfig(
      transpiler.transpile({
        ...graph,
        nodes: [
          ...graph.nodes,
          {
            id: 'trigger_new',
            type: 'trigger' as const,
            position: { x: -300, y: 0 },
            data: { trigger: 'state', entity_id: 'binary_sensor.door', to: 'on' },
          },
        ],
        edges: [...graph.edges, { id: 'e_new', source: 'trigger_new', target: last.id }],
      }).yaml
    );
    expect(saved.triggers).toEqual([
      { trigger: 'state', entity_id: 'binary_sensor.door', to: 'on' },
    ]);
    expect(JSON.stringify(saved)).not.toContain('trigger.idx');
  });
});
