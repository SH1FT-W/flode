import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../index';
import { YamlParser } from '../parser/YamlParser';

describe('Top-level variables round-trip (CAFE #210)', () => {
  const parser = new YamlParser();
  const transpiler = new FlowTranspiler();

  it('preserves top-level variables in round-trip', async () => {
    const yaml = `
alias: Variables Test
variables:
  target_light: light.living_room
  brightness: 80
  lookup:
    morning: "06:00:00"
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    to: "on"
actions:
  - action: light.turn_on
    target:
      entity_id: "{{ target_light }}"
    data:
      brightness_pct: "{{ brightness }}"
mode: single
`;
    const parseResult = await parser.parse(yaml);
    expect(parseResult.success).toBe(true);
    expect(parseResult.graph?.userVariables).toEqual({
      target_light: 'light.living_room',
      brightness: 80,
      lookup: { morning: '06:00:00' },
    });

    const result = transpiler.transpile(parseResult.graph!);
    expect(result.success).toBe(true);

    const automation = result.output?.automation as Record<string, unknown>;
    expect(automation.variables).toEqual({
      target_light: 'light.living_room',
      brightness: 80,
      lookup: { morning: '06:00:00' },
    });
  });

  it('does not add variables key when none in original', async () => {
    const yaml = `
alias: No Variables
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    to: "on"
actions:
  - action: light.turn_on
    target:
      entity_id: light.kitchen
mode: single
`;
    const parseResult = await parser.parse(yaml);
    expect(parseResult.success).toBe(true);

    const result = transpiler.transpile(parseResult.graph!);
    expect(result.success).toBe(true);

    const automation = result.output?.automation as Record<string, unknown>;
    expect(automation.variables).toBeUndefined();
  });

  it('stop action is parsed and round-tripped correctly', async () => {
    const yaml = `
alias: Stop Action Test
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    to: "on"
actions:
  - condition: state
    entity_id: input_boolean.enabled
    state: "on"
  - stop: "Not enabled"
mode: single
`;
    const parseResult = await parser.parse(yaml);
    expect(parseResult.success).toBe(true);

    const result = transpiler.transpile(parseResult.graph!);
    expect(result.success).toBe(true);

    const automation = result.output?.automation as Record<string, unknown>;
    const actions = automation.actions as unknown[];
    const stopAction = actions[actions.length - 1] as Record<string, unknown>;
    expect(stopAction.stop).toBe('Not enabled');
    expect(stopAction.service).toBeUndefined();
  });
});
