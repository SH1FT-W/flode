import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../index';
import { YamlParser } from '../parser/YamlParser';

describe('Templated action names round-trip', () => {
  const parser = new YamlParser();
  const transpiler = new FlowTranspiler();

  const yaml = `
alias: Templated Action Names
triggers:
  - trigger: state
    entity_id: input_select.alarm_mode
conditions: []
actions:
  - action: alarm_control_panel.alarm_{{ mode }}
    target:
      entity_id: alarm_control_panel.home
    data:
      code: "1234"
  - action: "{{ svc }}"
    target:
      area_id: living_room
    data:
      brightness_pct: 50
mode: single
`;

  const expectedActions = [
    {
      action: 'alarm_control_panel.alarm_{{ mode }}',
      target: { entity_id: 'alarm_control_panel.home' },
      data: { code: '1234' },
    },
    {
      action: '{{ svc }}',
      target: { area_id: 'living_room' },
      data: { brightness_pct: 50 },
    },
  ];

  it('passes transpiler validation', async () => {
    const parseResult = await parser.parse(yaml);
    expect(parseResult.success).toBe(true);

    const validation = transpiler.validate(parseResult.graph);
    expect(validation.errors).toEqual([]);
  });

  it('keeps templated action names, data and target unchanged (native)', async () => {
    const parseResult = await parser.parse(yaml);
    const result = transpiler.transpile(parseResult.graph!);
    expect(result.success).toBe(true);

    const automation = result.output?.automation as Record<string, unknown>;
    const actions = automation.actions as Record<string, unknown>[];
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject(expectedActions[0]);
    expect(actions[1]).toMatchObject(expectedActions[1]);
  });

  it('does not split or normalize templated action names (state-machine)', async () => {
    const parseResult = await parser.parse(yaml);
    const result = transpiler.transpile(parseResult.graph!, { forceStrategy: 'state-machine' });
    expect(result.success).toBe(true);

    const serialized = JSON.stringify(result.output?.automation);
    expect(serialized).toContain('"action":"alarm_control_panel.alarm_{{ mode }}"');
    expect(serialized).toContain('"action":"{{ svc }}"');
  });
});
