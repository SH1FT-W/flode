import type { FlowNode } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import {
  completeNewStep,
  nodeToStep,
  platformDescription,
  stepKindsFor,
  stepToNode,
} from '../ha-step';

const node = (type: FlowNode['type'], data: Record<string, unknown>) =>
  ({ id: 'n', type, position: { x: 0, y: 0 }, data }) as FlowNode;

describe('ha-step', () => {
  it('turns service calls into HA action steps and back', () => {
    const data = {
      service: 'light.turn_on',
      target: { entity_id: 'light.a' },
      data: {},
      alias: 'Licht',
    };
    const step = nodeToStep(node('action', data));
    expect(step).toEqual({
      alias: 'Licht',
      action: 'light.turn_on',
      target: { entity_id: 'light.a' },
    });
    expect(stepToNode('action', step)).toEqual({
      type: 'action',
      data: { alias: 'Licht', service: 'light.turn_on', target: { entity_id: 'light.a' } },
    });
  });

  it('keeps a trigger FLODE cannot model verbatim and hands HA the original', () => {
    const step = { trigger: 'sun', event: 'sunset', offset: { hours: '1' } };
    const kept = stepToNode('trigger', step);
    expect(kept.type).toBe('trigger');
    expect(kept.data.trigger).toBe('sun');
    expect(kept.data._raw).toEqual(step);
    expect(nodeToStep(node('trigger', kept.data))).toEqual(step);
  });

  it('offers triggers for automations only (a script has no triggers to paste or add)', () => {
    expect(stepKindsFor('automation')).toEqual(['trigger', 'condition', 'action']);
    expect(stepKindsFor('script')).toEqual(['condition', 'action']);
  });

  it('drops keys that are present but undefined (HA forms reject them)', () => {
    const step = nodeToStep(node('action', { service: 'light.turn_on', data_template: undefined }));
    expect(Object.keys(step)).toEqual(['action']);
  });

  it('shows legacy scene shorthands as the scene.turn_on call HA migrates them to', () => {
    const raw = stepToNode('action', { scene: 'scene.movie_night' });
    expect(nodeToStep(node('action', raw.data))).toEqual({
      action: 'scene.turn_on',
      target: { entity_id: 'scene.movie_night' },
    });
  });

  it('hands HA a copy, so in-place edits never touch the graph', () => {
    const raw = { if: [], then: [{ action: 'light.turn_off' }] };
    const step = nodeToStep(node('action', { _raw: raw }));
    (step.then as Record<string, unknown>[])[0].data = {};
    expect(raw.then[0]).toEqual({ action: 'light.turn_off' });
  });

  it('maps HA building blocks to FLODE node types', () => {
    expect(stepToNode('action', { delay: { seconds: 5 } }).type).toBe('delay');
    expect(stepToNode('action', { wait_template: '' }).type).toBe('wait');
    expect(stepToNode('action', { variables: { a: 1 } }).type).toBe('set_variables');
    expect(stepToNode('action', { condition: 'state', entity_id: 'x', state: 'on' }).type).toBe(
      'condition'
    );
  });

  it('reads a delay given as a bare number as seconds, as HA does', () => {
    expect(stepToNode('action', { delay: 3 })).toEqual({
      type: 'delay',
      data: { delay: { seconds: 3 } },
    });
  });

  it('keeps steps without a dedicated node verbatim', () => {
    const choose = { choose: [], default: [] };
    const result = stepToNode('action', choose);
    expect(result).toEqual({ type: 'action', data: { _raw: choose } });
    expect(nodeToStep(node('action', result.data))).toEqual(choose);
    const device = { device_id: 'd', domain: 'light', type: 'turn_on', entity_id: 'e' };
    expect(stepToNode('action', device).data).toEqual({ _raw: device });
  });

  it('shows pass-through conditions to HA as written and keeps unmodelled edits verbatim', () => {
    const condition = { condition: 'time', after: 5, weekday: 'someday' };
    const result = stepToNode('condition', condition);
    expect(result).toEqual({ type: 'condition', data: { _raw: condition, condition: 'time' } });
    expect(nodeToStep(node('condition', result.data))).toEqual(condition);
    expect(stepToNode('condition', { condition: 'state', entity_id: 'x' }).data).toEqual({
      condition: 'state',
      entity_id: 'x',
    });
  });

  it('shows a Jinja shorthand condition as its template condition', () => {
    const shorthand = node('condition', {
      condition: 'template',
      value_template: '{{ x }}',
      _shorthand: true,
    });
    expect(nodeToStep(shorthand)).toEqual({ condition: 'template', value_template: '{{ x }}' });
    expect(
      stepToNode('condition', { condition: 'template', value_template: '{{ y }}' }, shorthand).data
    ).toEqual({ condition: 'template', value_template: '{{ y }}', _shorthand: true });
  });

  it('hides and preserves FLODE-internal condition keys', () => {
    const cond = node('condition', { condition: 'state', entity_id: 'x', _chooseCase: 1 });
    expect(nodeToStep(cond)).toEqual({ condition: 'state', entity_id: 'x' });
    expect(stepToNode('condition', { condition: 'state', entity_id: 'y' }, cond).data).toEqual({
      condition: 'state',
      entity_id: 'y',
      _chooseCase: 1,
    });
  });
});

describe('completeNewStep', () => {
  it('gives a new webhook trigger its id, like HA does', () => {
    const step = completeNewStep({ trigger: 'webhook', webhook_id: '', allowed_methods: ['POST'] });
    expect(step.webhook_id).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(step.allowed_methods).toEqual(['POST']);
    expect(completeNewStep({ platform: 'webhook' }).webhook_id).toBeTypeOf('string');
  });

  it('gives a new delay the 0:00:00.000 HA shows (HA rejects its own `delay: ""`)', () => {
    expect(completeNewStep({ delay: '' })).toEqual({
      delay: { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 },
    });
    const set = { delay: { seconds: 5 } };
    expect(completeNewStep(set)).toBe(set);
  });

  it('leaves other steps and set ids alone', () => {
    const own = { trigger: 'webhook', webhook_id: 'mine' };
    expect(completeNewStep(own)).toBe(own);
    const state = { trigger: 'state', entity_id: 'light.a' };
    expect(completeNewStep(state)).toBe(state);
  });
});

describe('platformDescription', () => {
  const descriptions = { 'motion.detected': { target: {} }, 'sun.is_night': { fields: {} } };

  it('finds the description of an integration trigger or condition', () => {
    expect(platformDescription('trigger', { trigger: 'motion.detected' }, descriptions)).toEqual({
      target: {},
    });
    expect(platformDescription('condition', { condition: 'sun.is_night' }, descriptions)).toEqual({
      fields: {},
    });
  });

  it('has none for built-in steps, actions or unknown keys', () => {
    expect(platformDescription('trigger', { trigger: 'state' }, descriptions)).toBeUndefined();
    expect(platformDescription('action', { action: 'sun.is_night' }, descriptions)).toBeUndefined();
    expect(platformDescription('trigger', { trigger: 'toString' }, descriptions)).toBeUndefined();
  });
});
