import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';

const YAML_WITH_CHOOSE = `
alias: Test Automation
triggers:
  - trigger: numeric_state
    entity_id: sensor.ipad_battery_level
    below: 25
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

// Simulates what HA API returns: id as array, data: {}
const YAML_HA_API_FORMAT = `
alias: Test Automation
triggers:
  - trigger: numeric_state
    entity_id:
      - sensor.ipad_von_daniel_battery_level
    below: 25
    id: akku_unter_20
  - trigger: numeric_state
    entity_id:
      - sensor.ipad_von_daniel_battery_level
    above: 80
    id: akku_ueber_80
conditions: []
actions:
  - choose:
      - conditions:
          - condition: trigger
            id: akku_unter_20
        sequence:
          - service: switch.turn_on
            target:
              entity_id: switch.ipad_steckdose
            data: {}
      - conditions:
          - condition: trigger
            id:
              - akku_ueber_80
        sequence:
          - service: switch.turn_off
            target:
              entity_id: switch.ipad_steckdose
            data: {}
mode: single
`.trim();

describe('choose id debug', () => {
  it('condition nodes store id as string not array', async () => {
    const t = new FlowTranspiler();
    const parsed = await t.fromYaml(YAML_WITH_CHOOSE);

    const condNodes = parsed.graph!.nodes.filter((n) => n.type === 'condition');
    for (const cn of condNodes) {
      const id = (cn.data as Record<string, unknown>).id;
      expect(Array.isArray(id), `id should not be array, got: ${JSON.stringify(id)}`).toBe(false);
    }

    const result = t.transpile(parsed.graph!, {});
    expect(result.yaml).not.toMatch(/^\s{4,6}id:\s*\n\s+-/m);
  });

  it('normalizes id array from HA API format and removes empty data', async () => {
    const t = new FlowTranspiler();
    const parsed = await t.fromYaml(YAML_HA_API_FORMAT);
    const result = t.transpile(parsed.graph!, {});

    expect(result.yaml).toContain('choose:');
    // id should be string, not array
    expect(result.yaml).not.toMatch(/^\s{4,6}id:\s*\n\s+-/m);
    expect(result.yaml).toContain('id: akku_unter_20');
    expect(result.yaml).toContain('id: akku_ueber_80');
    // data: {} should not appear
    expect(result.yaml).not.toContain('data: {}');
  });
});
