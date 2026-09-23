import { getRawStep } from '@flode/shared';
import { load as yamlLoad } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { YamlParser } from '../parser/YamlParser';

/**
 * Steps FLODE has no dedicated node for must survive open → save unchanged
 * (previously they became `action: unknown.unknown` — data loss).
 */
describe('raw (pass-through) action steps', () => {
  const parser = new YamlParser();
  const transpiler = new FlowTranspiler();

  const INPUT = `
alias: Pass-through test
triggers:
  - trigger: state
    entity_id: input_boolean.movie
    to: "on"
actions:
  - scene: scene.movie_night
  - action: light.turn_on
    target:
      entity_id: light.ceiling_lights
  - future_step_from_ha_2030:
      option: 42
    alias: From the future
  - scene: scene.goodnight
    enabled: false
`;

  async function roundtrip(yaml: string) {
    const parsed = await parser.parse(yaml);
    expect(parsed.success).toBe(true);
    const graph = parsed.graph;
    if (!graph) throw new Error('no graph');
    const output = yamlLoad(transpiler.toYaml(graph)) as Record<string, unknown>;
    return { parsed, graph, output };
  }

  it('keeps unknown steps as raw nodes without an import warning', async () => {
    const { parsed, graph } = await roundtrip(INPUT);
    const rawNodes = graph.nodes.filter((n) => getRawStep(n.data));
    expect(rawNodes).toHaveLength(3);
    expect(parsed.warnings).toEqual([]);
  });

  it('writes every step back unchanged, in order', async () => {
    const { output } = await roundtrip(INPUT);
    expect(output.actions).toEqual([
      { scene: 'scene.movie_night' },
      { action: 'light.turn_on', target: { entity_id: 'light.ceiling_lights' } },
      { future_step_from_ha_2030: { option: 42 }, alias: 'From the future' },
      { scene: 'scene.goodnight', enabled: false },
    ]);
  });

  it('a node toggled off in FLODE is written with enabled: false', async () => {
    const { graph } = await roundtrip(INPUT);
    const first = graph.nodes.find((n) => getRawStep(n.data)?.scene === 'scene.movie_night');
    if (!first) throw new Error('raw node missing');
    first.data = { ...first.data, enabled: false };
    const output = yamlLoad(transpiler.toYaml(graph)) as { actions: unknown[] };
    expect(output.actions[0]).toEqual({ scene: 'scene.movie_night', enabled: false });
  });
});
