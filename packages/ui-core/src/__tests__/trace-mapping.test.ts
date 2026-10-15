import { describe, expect, it } from 'vitest';
import { configShape, createTracePathResolver } from '../trace-mapping';

const n = (id: string, type: string) => ({ id, type });
const e = (source: string, target: string, sourceHandle?: string) => ({
  source,
  target,
  sourceHandle,
});

describe('createTracePathResolver', () => {
  it('linear flow: top-level condition, then delay and action share the action index', () => {
    // Time Condition & Delay: trigger → condition(yes only) → delay → action
    const resolve = createTracePathResolver(
      [n('t', 'trigger'), n('c', 'condition'), n('d', 'delay'), n('a', 'action')],
      [e('t', 'c'), e('c', 'd', 'true'), e('d', 'a')]
    );
    expect(resolve('trigger/0')).toBe('t');
    expect(resolve('condition/0')).toBe('c');
    expect(resolve('condition/0/entity_id/0')).toBe('c');
    expect(resolve('action/0')).toBe('d');
    expect(resolve('action/1')).toBe('a');
    expect(resolve('action/2')).toBeUndefined();
  });

  it('a leading condition continuing only via No is a top-level (not) condition', () => {
    // The transpiler writes it as `conditions: [{condition: not, …}]`.
    const resolve = createTracePathResolver(
      [n('t', 'trigger'), n('c', 'condition'), n('a', 'action')],
      [e('t', 'c'), e('c', 'a', 'false')]
    );
    expect(resolve('condition/0')).toBe('c');
    expect(resolve('action/0')).toBe('a');
  });

  it('a leading condition with an unlabelled output is a step, as in the transpiler', () => {
    const resolve = createTracePathResolver(
      [n('t', 'trigger'), n('c', 'condition'), n('a', 'action')],
      [e('t', 'c'), e('c', 'a')]
    );
    expect(resolve('condition/0')).toBeUndefined();
    expect(resolve('action/0')).toBe('c');
  });

  it('if/else in the sequence: branches nest, flow continues at the merge node', () => {
    // trigger → cond(yes: x, no: y) → both → z
    const resolve = createTracePathResolver(
      [n('t', 'trigger'), n('c', 'condition'), n('x', 'action'), n('y', 'action'), n('z', 'delay')],
      [e('t', 'c'), e('c', 'x', 'true'), e('c', 'y', 'false'), e('x', 'z'), e('y', 'z')]
    );
    expect(resolve('action/0')).toBe('c');
    expect(resolve('action/0/if/condition/0')).toBe('c');
    expect(resolve('action/0/then/0')).toBe('x');
    expect(resolve('action/0/else/0')).toBe('y');
    expect(resolve('action/1')).toBe('z');
    expect(resolve('condition/0')).toBeUndefined();
  });

  it('mid-flow condition with only a Yes branch nests the rest under then', () => {
    // trigger → a → cond(yes) → b → c2
    const resolve = createTracePathResolver(
      [
        n('t', 'trigger'),
        n('a', 'action'),
        n('c', 'condition'),
        n('b', 'action'),
        n('b2', 'action'),
      ],
      [e('t', 'a'), e('a', 'c'), e('c', 'b', 'true'), e('b', 'b2')]
    );
    expect(resolve('action/0')).toBe('a');
    expect(resolve('action/1')).toBe('c');
    expect(resolve('action/1/then/0')).toBe('b');
    expect(resolve('action/1/then/1')).toBe('b2');
    expect(resolve('action/2')).toBeUndefined();
  });

  it('ignores visual-only edges and unknown roots', () => {
    const resolve = createTracePathResolver(
      [n('t', 'trigger'), n('a', 'action')],
      [e('t', 'a'), { source: 'a', target: 't', type: 'hint' }]
    );
    expect(resolve('action/0')).toBe('a');
    expect(resolve('sequence/0')).toBeUndefined();
  });
});

describe('configShape', () => {
  const config = {
    alias: 'Flur',
    triggers: [{ trigger: 'state', entity_id: 'binary_sensor.a' }],
    conditions: [{ condition: 'state', entity_id: 'sun.sun', state: 'below_horizon' }],
    actions: [
      { action: 'light.turn_on', target: { entity_id: 'light.a' } },
      { if: [{ condition: 'template', value_template: '{{ x }}' }], then: [{ delay: 5 }] },
    ],
    variables: { _flode_metadata: { nodes: {} } },
  };

  it('ignores values, metadata and old key spellings', () => {
    expect(
      configShape({
        alias: 'Anders',
        mode: 'restart',
        trigger: { platform: 'state', entity_id: 'binary_sensor.b' },
        condition: [{ condition: 'state', entity_id: 'sun.sun', state: 'above_horizon' }],
        action: [
          { service: 'light.turn_off', target: { entity_id: 'light.b' } },
          { then: [{ delay: '00:00:09' }], if: [{ condition: 'template', value_template: '1' }] },
        ],
      })
    ).toBe(configShape(config));
  });

  it('differs when steps were added, removed or moved', () => {
    expect(configShape({ ...config, actions: config.actions.slice(1) })).not.toBe(
      configShape(config)
    );
    expect(configShape({ ...config, actions: [...config.actions].reverse() })).not.toBe(
      configShape(config)
    );
    expect(configShape({ ...config, conditions: [] })).not.toBe(configShape(config));
  });
});

describe('createTracePathResolver: condition steps of the actions', () => {
  it('keeps them in the actions; the steps after them are siblings', () => {
    // As the transpiler writes it: `actions: [{condition: …}, {action: …}]`.
    const resolve = createTracePathResolver(
      [
        n('t', 'trigger'),
        { id: 'c', type: 'condition', data: { condition: 'state', _step: true } },
        n('a', 'action'),
      ],
      [e('t', 'c'), e('c', 'a', 'true')]
    );
    expect(resolve('condition/0')).toBeUndefined();
    expect(resolve('action/0')).toBe('c');
    expect(resolve('action/0/entity_id/0')).toBe('c');
    expect(resolve('action/1')).toBe('a');
  });
});
