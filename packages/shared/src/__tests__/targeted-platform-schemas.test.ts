// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isTargetedPlatform } from '../schemas/ha-entities';
import { HAConditionSchema, HATriggerSchema } from '../schemas/ha-schemas';
import { ConditionNodeValidationSchema, TriggerNodeValidationSchema } from '../schemas/validation';

describe('Target-based triggers and conditions', () => {
  it('detects <domain>.<name> types', () => {
    expect(isTargetedPlatform('light.turned_on')).toBe(true);
    expect(isTargetedPlatform('vibration.is_detected')).toBe(true);
    expect(isTargetedPlatform('state')).toBe(false);
    expect(isTargetedPlatform('numeric_state')).toBe(false);
  });

  it('HATriggerSchema accepts an area-only target with options', () => {
    const trigger = {
      trigger: 'light.turned_on',
      target: { area_id: 'garden' },
      options: { behavior: 'each' },
    };

    const result = HATriggerSchema.safeParse(trigger);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(trigger);
  });

  it('HATriggerSchema accepts device, floor and label targets without entity_id', () => {
    const targets = [
      { device_id: 'abc123' },
      { floor_id: ['ground_floor'] },
      { label_id: 'outdoor' },
    ];
    for (const target of targets) {
      expect(HATriggerSchema.safeParse({ trigger: 'button.pressed', target }).success).toBe(true);
    }
  });

  it('HATriggerSchema still normalizes legacy platform keys', () => {
    const result = HATriggerSchema.parse({ platform: 'state', entity_id: 'light.kitchen' });
    expect(result).toEqual({ trigger: 'state', entity_id: 'light.kitchen' });
  });

  it('HAConditionSchema keeps target and options', () => {
    const condition = {
      condition: 'vibration.is_detected',
      target: { device_id: ['washer'] },
      options: { behavior: 'any' },
    };

    const result = HAConditionSchema.safeParse(condition);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(condition);
  });

  it('node validation skips classic rules for targeted types', () => {
    const triggerResult = TriggerNodeValidationSchema.safeParse({
      trigger: 'button.pressed',
      target: { entity_id: 'input_button.doorbell' },
    });
    const conditionResult = ConditionNodeValidationSchema.safeParse({
      condition: 'vibration.is_detected',
      target: { area_id: 'laundry' },
    });
    expect(triggerResult.success).toBe(true);
    expect(conditionResult.success).toBe(true);
  });
});
