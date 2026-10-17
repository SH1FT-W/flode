import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { normalizeHaConfig } from '../ha-equal';
import { YamlParser } from '../parser/YamlParser';
import { loadHaYaml } from '../yaml';

/** The action list a config holds, in the form two configs are compared in (ha-equal). */
const actionsOf = (config: unknown) => normalizeHaConfig(config).actions;

const FIXTURES_DIR = join(__dirname, '../../../../__tests__/yaml-automation-fixtures');

describe('OR condition roundtrip', () => {
  it('17-nested-condition: or with nested and/not conditions round-trips correctly', async () => {
    const inputYaml = readFileSync(join(FIXTURES_DIR, '17-nested-condition.yaml'), 'utf8');
    const parser = new YamlParser();
    const transpiler = new FlowTranspiler();

    const parsed = await parser.parse(inputYaml);
    expect(parsed.success).toBe(true);
    const result = transpiler.transpile(parsed.graph!);
    expect(result.success).toBe(true);

    // or with nested and/not, then and else as in the fixture; a one-item `id` list is
    // written as the string HA reads it as (Internals 6.6)
    const forThirtySeconds = { hours: 0, minutes: 0, seconds: 30 };
    const supposedState = { entity_id: 'input_boolean.tv_light_supposed_state' };
    expect(actionsOf(result.output?.automation)).toEqual([
      {
        if: [
          {
            condition: 'or',
            conditions: [
              {
                condition: 'and',
                conditions: [
                  { condition: 'trigger', id: 'Occupancy detected' },
                  { condition: 'numeric_state', entity_id: 'sensor.xxx_light_level', below: 60 },
                ],
              },
              {
                condition: 'and',
                conditions: [
                  { condition: 'trigger', id: 'Illuminance below' },
                  {
                    condition: 'not',
                    conditions: [
                      {
                        condition: 'state',
                        entity_id: 'xxx_presence_sensor',
                        state: ['off'],
                        for: forThirtySeconds,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        then: [{ action: 'input_boolean.turn_on', target: supposedState }],
        else: [{ action: 'input_boolean.turn_off', target: supposedState }],
      },
    ]);
  });

  it('or condition with else block: else must NOT be lost on roundtrip', async () => {
    const yaml = `
alias: Test OR with else
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - if:
      - condition: or
        conditions:
          - condition: state
            entity_id: light.living_room
            state: 'off'
          - condition: state
            entity_id: light.bedroom
            state: 'off'
    then:
      - action: light.turn_on
        target:
          entity_id: light.living_room
    else:
      - action: light.turn_off
        target:
          entity_id: light.living_room
mode: single
`;
    const parser = new YamlParser();
    const transpiler = new FlowTranspiler();

    const parsed = await parser.parse(yaml);
    expect(parsed.success).toBe(true);

    const result = transpiler.transpile(parsed.graph!);
    expect(result.success).toBe(true);

    // The or stays in an if block (not promoted to root conditions) with then and else as they were
    expect(actionsOf(result.output?.automation)).toEqual(actionsOf(loadHaYaml(yaml)));
  });

  it('parallel OR graph pattern roundtrip: then re-import gives same functional result', async () => {
    // Graph: two parallel conditions both True → same action
    // This is the "graph OR pattern"
    const yaml = `
alias: Test graph OR
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
actions:
  - if:
      - condition: or
        conditions:
          - condition: state
            entity_id: light.living_room
            state: 'off'
          - condition: state
            entity_id: light.bedroom
            state: 'off'
    then:
      - action: light.turn_on
        target:
          entity_id: light.all
    else: []
mode: single
`;
    const parser = new YamlParser();
    const transpiler = new FlowTranspiler();

    // First import
    const parsed1 = await parser.parse(yaml);
    expect(parsed1.success).toBe(true);
    const result1 = transpiler.transpile(parsed1.graph!);
    expect(result1.success).toBe(true);

    // Second import (roundtrip)
    const parsed2 = await parser.parse(result1.yaml!);
    expect(parsed2.success).toBe(true);
    const result2 = transpiler.transpile(parsed2.graph!);
    expect(result2.success).toBe(true);

    // Without an else, the exploded or is promoted to the root conditions (the same run
    // for HA); both sub-conditions and the then survive two round trips
    const written = normalizeHaConfig(result2.output?.automation);
    expect({ conditions: written.conditions, actions: written.actions }).toEqual({
      conditions: [
        {
          condition: 'or',
          conditions: [
            { condition: 'state', entity_id: 'light.living_room', state: 'off' },
            { condition: 'state', entity_id: 'light.bedroom', state: 'off' },
          ],
        },
      ],
      actions: [{ action: 'light.turn_on', target: { entity_id: 'light.all' } }],
    });
  });
});
