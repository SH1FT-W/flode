// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isTemplateString } from '../schemas/ha-schemas';
import { ActionNodeValidationSchema } from '../schemas/validation';

describe('Templated action name validation', () => {
  it('accepts a fully templated action name', () => {
    const result = ActionNodeValidationSchema.safeParse({ service: '{{ svc }}' });
    expect(result.success).toBe(true);
  });

  it('accepts a partially templated action name', () => {
    const result = ActionNodeValidationSchema.safeParse({
      service: 'alarm_control_panel.alarm_{{ mode }}',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a block-tag template action name', () => {
    const result = ActionNodeValidationSchema.safeParse({
      service: '{% if on %}light.turn_on{% else %}light.turn_off{% endif %}',
    });
    expect(result.success).toBe(true);
  });

  it('still rejects a plain action name without a dot', () => {
    const result = ActionNodeValidationSchema.safeParse({ service: 'light' });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        message: 'errors:validation.action.serviceFormat',
        path: ['service'],
      })
    );
  });
});

describe('isTemplateString', () => {
  it('detects Jinja2 expressions and statements', () => {
    expect(isTemplateString('{{ svc }}')).toBe(true);
    expect(isTemplateString('{% if x %}a{% endif %}')).toBe(true);
    expect(isTemplateString('alarm_control_panel.alarm_{{ mode }}')).toBe(true);
  });

  it('returns false for plain strings and non-strings', () => {
    expect(isTemplateString('light.turn_on')).toBe(false);
    expect(isTemplateString('')).toBe(false);
    expect(isTemplateString(undefined)).toBe(false);
    expect(isTemplateString({ service: '{{ svc }}' })).toBe(false);
  });
});
