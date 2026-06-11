import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';

const CHOOSE_YAML = `
alias: Akku iPad
triggers:
  - trigger: numeric_state
    entity_id: sensor.ipad_battery_level
    below: 20
    id: akku_unter_20
  - trigger: numeric_state
    entity_id: sensor.ipad_battery_level
    above: 80
    id: akku_ueber_80
conditions: []
actions:
  - choose:
      - conditions:
          - condition: trigger
            id: akku_unter_20
        sequence:
          - action: switch.turn_on
            target:
              entity_id: switch.ipad_steckdose
      - conditions:
          - condition: trigger
            id: akku_ueber_80
        sequence:
          - action: switch.turn_off
            target:
              entity_id: switch.ipad_steckdose
mode: single
`.trim();

describe('choose roundtrip', () => {
  it('exports choose: not if/else for choose-chain pattern', async () => {
    const transpiler = new FlowTranspiler();
    const parseResult = await transpiler.fromYaml(CHOOSE_YAML);
    expect(parseResult.graph).toBeDefined();

    const result = transpiler.transpile(parseResult.graph!, {});
    expect(result.success).toBe(true);

    expect(result.yaml).toContain('choose:');
    expect(result.yaml).toContain('akku_unter_20');
    expect(result.yaml).toContain('akku_ueber_80');
    expect(result.yaml).not.toMatch(/^\s+if:/m);
    expect(result.yaml).not.toMatch(/^\s+else:/m);
  });

  it('exports _flode_metadata not _cafe_metadata', async () => {
    const transpiler = new FlowTranspiler();
    const parseResult = await transpiler.fromYaml(CHOOSE_YAML);
    const result = transpiler.transpile(parseResult.graph!, {});
    expect(result.yaml).toContain('_flode_metadata');
    expect(result.yaml).not.toContain('_cafe_metadata');
  });
});
