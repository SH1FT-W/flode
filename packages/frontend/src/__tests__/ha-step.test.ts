import type { FlowNode } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { nodeToStep, stepToNode } from '../ha-step';

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

  it('keeps steps without a dedicated node verbatim', () => {
    const choose = { choose: [], default: [] };
    const result = stepToNode('action', choose);
    expect(result).toEqual({ type: 'action', data: { _raw: choose } });
    expect(nodeToStep(node('action', result.data))).toEqual(choose);
    const device = { device_id: 'd', domain: 'light', type: 'turn_on', entity_id: 'e' };
    expect(stepToNode('action', device).data).toEqual({ _raw: device });
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
