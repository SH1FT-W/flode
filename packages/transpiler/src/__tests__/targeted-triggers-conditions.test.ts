import type { ConditionNode } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { YamlParser } from '../parser/YamlParser';
import {
  TARGETED_AUTOMATION_YAML,
  TARGETED_CHOOSE_CONDITION,
  TARGETED_ROOT_CONDITION,
  TARGETED_TRIGGER,
} from './fixtures/targeted-triggers-conditions';

/** Collect every nested object matching the predicate (depth-first). */
function collectObjects(
  value: unknown,
  predicate: (obj: Record<string, unknown>) => boolean
): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectObjects(item, predicate));
  if (typeof value !== 'object' || value === null) return [];
  const obj = value as Record<string, unknown>;
  const nested = Object.values(obj).flatMap((child) => collectObjects(child, predicate));
  return predicate(obj) ? [obj, ...nested] : nested;
}

const isMoonTrigger = (obj: Record<string, unknown>) => obj.trigger === 'moon.phase_changed';
const isVibrationCondition = (obj: Record<string, unknown>) =>
  obj.condition === 'vibration.is_vibrating';

describe('Target-based triggers and conditions round-trip', () => {
  it('parses them without schema warnings and keeps their types', async () => {
    const parsed = await new YamlParser().parse(TARGETED_AUTOMATION_YAML);
    expect(parsed.success).toBe(true);
    expect(parsed.warnings.filter((w) => w.includes('schema validation'))).toEqual([]);

    const nodes = parsed.graph!.nodes;
    const triggerNodes = nodes.filter((n) => n.type === 'trigger');
    expect(triggerNodes).toHaveLength(1);
    expect(triggerNodes[0].data).toEqual(TARGETED_TRIGGER);

    const conditionNodes = nodes.filter((n): n is ConditionNode => n.type === 'condition');
    const conditionData = conditionNodes.map((n) => n.data);
    expect(conditionData).toContainEqual(expect.objectContaining(TARGETED_ROOT_CONDITION));
    expect(conditionData).toContainEqual(expect.objectContaining(TARGETED_CHOOSE_CONDITION));
    expect(conditionData.some((data) => data.condition === 'template')).toBe(false);
  });

  it('keeps target-based conditions that fail schema validation instead of a template', async () => {
    const yaml = `
alias: Odd targeted condition
triggers:
  - trigger: moon.phase_changed
    target:
      area_id: garden
conditions:
  - condition: vibration.is_vibrating
    target:
      entity_id: binary_sensor.washer_vibration
    options:
actions:
  - if:
      - condition: vibration.is_vibrating
        target:
          device_id: dryer_device
        options:
    then:
      - action: notify.notify
`;
    const parsed = await new YamlParser().parse(yaml);
    expect(parsed.success).toBe(true);

    const conditionData = parsed
      .graph!.nodes.filter((n): n is ConditionNode => n.type === 'condition')
      .map((n) => n.data);
    expect(conditionData).toContainEqual(
      expect.objectContaining({
        condition: 'vibration.is_vibrating',
        target: { entity_id: 'binary_sensor.washer_vibration' },
      })
    );
    expect(conditionData).toContainEqual(
      expect.objectContaining({
        condition: 'vibration.is_vibrating',
        target: { device_id: 'dryer_device' },
      })
    );
    expect(conditionData.some((data) => data.condition === 'template')).toBe(false);
  });

  it('survives YAML → graph → YAML → graph → YAML unchanged', async () => {
    const parser = new YamlParser();
    const transpiler = new FlowTranspiler();
    let yaml = TARGETED_AUTOMATION_YAML;

    for (let pass = 0; pass < 2; pass++) {
      const parsed = await parser.parse(yaml);
      expect(parsed.success).toBe(true);
      expect(parsed.warnings.filter((w) => w.includes('schema validation'))).toEqual([]);

      const result = transpiler.transpile(parsed.graph!);
      expect(result.success).toBe(true);

      const triggers = collectObjects(result.output, isMoonTrigger);
      expect(triggers.length).toBeGreaterThan(0);
      for (const trigger of triggers) {
        expect(trigger).toEqual(TARGETED_TRIGGER);
      }

      const conditions = collectObjects(result.output, isVibrationCondition);
      expect(conditions).toContainEqual(TARGETED_ROOT_CONDITION);
      expect(conditions).toContainEqual(TARGETED_CHOOSE_CONDITION);

      yaml = result.yaml!;
    }
  });
});
