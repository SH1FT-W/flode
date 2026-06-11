import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { YamlParser } from '../parser/YamlParser';

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

    expect(result.yaml).toContain('condition: or');
    expect(result.yaml).toContain('condition: and');
    expect(result.yaml).toContain('condition: not');
    // else block must be present with content
    expect(result.yaml).toContain('input_boolean.turn_off');
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

    console.log('=== OR with else roundtrip ===');
    console.log(result.yaml);

    // The or condition must remain in an if: block (NOT promoted to root conditions)
    // because there is an else block
    expect(result.yaml).toContain('condition: or');
    expect(result.yaml).toContain('light.turn_on');
    expect(result.yaml).toContain('light.turn_off'); // else must not be lost!
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

    // The key check: or condition and both sub-conditions must survive 2 roundtrips
    expect(result2.yaml).toContain('condition: or');
    expect(result2.yaml).toContain('light.living_room');
    expect(result2.yaml).toContain('light.bedroom');
    expect(result2.yaml).toContain('light.all');
  });
});
