import { dump } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { buildAutomationSaveConfig } from '../save-config';
import { parseScript, transpileScript } from '../script';

/**
 * `_flode_metadata.steps`: a card keeps its id and position across save and
 * reopen even when saving changed the shape of the step list (a drawn
 * condition with Yes and No becomes an `if` block, its branch steps stop
 * being nodes). Before, ids were handed out in the order of `nodes`, so the
 * cards after such a change took a neighbour's old place.
 */

const action = (id: string, x: number, y: number, service: string) => ({
  id,
  type: 'action' as const,
  position: { x, y },
  data: { action: service, target: { entity_id: 'light.x' } },
});

/** Trigger, condition with Yes/No paths, both leading to a last action. Nodes deliberately out of flow order. */
const drawnFlow = {
  id: '3f2c7b1e-1111-4222-8333-444455556666',
  name: 'Drawn',
  version: 1 as const,
  nodes: [
    action('a_yes', 400, 0, 'light.turn_on'),
    {
      id: 'c_test',
      type: 'condition' as const,
      position: { x: 200, y: 0 },
      data: { condition: 'state', entity_id: 'light.y', state: 'on' },
    },
    {
      id: 't_start',
      type: 'trigger' as const,
      position: { x: 0, y: 0 },
      data: { trigger: 'state', entity_id: 'binary_sensor.m', to: 'on' },
    },
    action('a_no', 400, 200, 'light.turn_off'),
    action('a_after', 800, 100, 'notify.notify'),
  ],
  edges: [
    { id: 'e1', source: 't_start', target: 'c_test' },
    { id: 'e2', source: 'c_test', target: 'a_yes', sourceHandle: 'true' },
    { id: 'e3', source: 'c_test', target: 'a_no', sourceHandle: 'false' },
    { id: 'e4', source: 'a_yes', target: 'a_after' },
    { id: 'e5', source: 'a_no', target: 'a_after' },
  ],
};

const byId = (graph: { nodes: { id: string; position: { x: number; y: number } }[] }) =>
  Object.fromEntries(graph.nodes.map((n) => [n.id, n.position]));

describe('_flode_metadata.steps', () => {
  it('records which node each top-level step came from', () => {
    const transpiler = new FlowTranspiler();
    const result = buildAutomationSaveConfig(transpiler, drawnFlow, {
      alias: 'Drawn',
      description: '',
    });
    expect(result.success).toBe(true);
    const variables = result.config?.variables as { _flode_metadata: { steps: unknown } };
    expect(variables._flode_metadata.steps).toEqual({
      'trigger/0': 't_start',
      'action/0': 'c_test', // the drawn condition became the `if` block
      'action/1': 'a_after',
    });
  });

  it('gives the cards their ids and positions back after save and reopen', async () => {
    const transpiler = new FlowTranspiler();
    const saved = buildAutomationSaveConfig(transpiler, drawnFlow, {
      alias: 'Drawn',
      description: '',
    });
    const back = await transpiler.fromYaml(dump(saved.config), { keepBlocks: true });
    expect(back.success).toBe(true);
    const graph = back.graph!;
    expect(graph.nodes.map((n) => [n.id, n.type])).toEqual([
      ['t_start', 'trigger'],
      ['c_test', 'action'], // one block card (`if`, verbatim)
      ['a_after', 'action'],
    ]);
    expect(byId(graph)).toEqual({
      t_start: { x: 0, y: 0 },
      c_test: { x: 200, y: 0 },
      a_after: { x: 800, y: 100 },
    });
    expect(graph.edges.map((e) => `${e.source}>${e.target}`)).toEqual([
      't_start>c_test',
      'c_test>a_after',
    ]);
  });

  it('keeps top-level conditions, triggers and steps on their ids', async () => {
    const transpiler = new FlowTranspiler();
    const flow = {
      ...drawnFlow,
      nodes: [
        action('a_1', 600, 0, 'light.turn_on'),
        {
          id: 'c_lux',
          type: 'condition' as const,
          position: { x: 300, y: 0 },
          data: { condition: 'numeric_state', entity_id: 'sensor.lux', below: 20 },
        },
        {
          id: 't_1',
          type: 'trigger' as const,
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: 'binary_sensor.m', to: 'on' },
        },
        {
          id: 't_2',
          type: 'trigger' as const,
          position: { x: 0, y: 150 },
          data: { trigger: 'state', entity_id: 'binary_sensor.n', to: 'on' },
        },
      ],
      edges: [
        { id: 'e1', source: 't_1', target: 'c_lux' },
        { id: 'e2', source: 't_2', target: 'c_lux' },
        { id: 'e3', source: 'c_lux', target: 'a_1', sourceHandle: 'true' },
      ],
    };
    const saved = buildAutomationSaveConfig(transpiler, flow, { alias: 'x', description: '' });
    const automation = saved.config as { conditions?: unknown[] };
    expect(automation.conditions).toHaveLength(1); // promoted
    const back = await transpiler.fromYaml(dump(saved.config), { keepBlocks: true });
    expect(byId(back.graph!)).toEqual({
      t_1: { x: 0, y: 0 },
      t_2: { x: 0, y: 150 },
      c_lux: { x: 300, y: 0 },
      a_1: { x: 600, y: 0 },
    });
  });

  it('falls back to the order of `nodes` for metadata without `steps`', async () => {
    const transpiler = new FlowTranspiler();
    const saved = buildAutomationSaveConfig(transpiler, drawnFlow, {
      alias: 'Drawn',
      description: '',
    });
    const config = saved.config as { variables: { _flode_metadata: { steps?: unknown } } };
    config.variables._flode_metadata.steps = undefined;
    const back = await transpiler.fromYaml(dump(config), { keepBlocks: true });
    expect(back.success).toBe(true);
    // Positional, as older versions saved it: the first three ids of `nodes` in order
    expect(back.graph!.nodes.map((n) => n.id)).toEqual(['a_yes', 'c_test', 't_start']);
  });

  it('works for scripts, whose conditions become steps of the sequence', async () => {
    const transpiler = new FlowTranspiler();
    const script = {
      ...drawnFlow,
      metadata: { mode: 'single' as const, kind: 'script' as const },
      nodes: [
        action('s_2', 600, 0, 'light.turn_on'),
        {
          id: 's_start',
          type: 'trigger' as const,
          position: { x: 0, y: 0 },
          data: { trigger: 'flode_script_start' },
        },
        {
          id: 's_cond',
          type: 'condition' as const,
          position: { x: 300, y: 0 },
          data: { condition: 'state', entity_id: 'light.y', state: 'on' },
        },
      ],
      edges: [
        { id: 'e1', source: 's_start', target: 's_cond' },
        { id: 'e2', source: 's_cond', target: 's_2', sourceHandle: 'true' },
      ],
    };
    const saved = transpileScript(transpiler, script);
    expect(saved.success).toBe(true);
    const back = await parseScript(transpiler, saved.config!, { keepBlocks: true });
    expect(byId(back.graph!)).toEqual({
      s_start: { x: 0, y: 0 },
      s_cond: { x: 300, y: 0 },
      s_2: { x: 600, y: 0 },
    });
  });
});
