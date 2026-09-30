import { isPlainObject } from '@flode/shared';
import { dump } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { buildAutomationSaveConfig } from '../save-config';

/**
 * Opens and saves an automation exactly like the panel does (load with
 * `keepBlocks`, save via `buildAutomationSaveConfig`) and returns the saved
 * config without FLODE's layout metadata.
 */
async function panelSave(config: Record<string, unknown>): Promise<Record<string, unknown>> {
  const transpiler = new FlowTranspiler();
  const parsed = await transpiler.fromYaml(dump(config), { keepBlocks: true });
  expect(parsed.errors ?? []).toEqual([]);
  expect(parsed.graph).toBeDefined();
  if (!parsed.graph) return {};
  const saved = buildAutomationSaveConfig(transpiler, parsed.graph, {
    alias: parsed.graph.name,
    description: '',
  });
  expect(saved.errors ?? []).toEqual([]);
  const { variables, ...rest } = saved.config ?? {};
  const { _flode_metadata: _metadata, ...userVariables } = isPlainObject(variables)
    ? variables
    : {};
  return Object.keys(userVariables).length > 0 ? { ...rest, variables: userVariables } : rest;
}

/** Byte-exact comparison (key order included), like a YAML diff would show it. */
function expectExact(actual: unknown, expected: unknown): void {
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
}

describe('panel round trip keeps what HA accepts', () => {
  it('keeps conditions the schema does not model verbatim (A1)', async () => {
    const conditions = [
      { condition: 'time', weekday: 'mon' },
      { condition: 'sun', after: 'sunset', after_offset: { minutes: -30 } },
      { condition: 'state', entity_id: 'input_number.x', state: 5 },
      { condition: 'not', conditions: ['{{ false }}'] },
      { condition: 'time', after: 5, weekday: 'someday' },
    ];
    const guard = { condition: 'time', after: 5, alias: 'Odd guard' };
    const saved = await panelSave({
      alias: 'Conditions',
      triggers: [{ trigger: 'state', entity_id: 'sensor.a' }],
      conditions,
      actions: [{ action: 'light.turn_on' }, guard, { action: 'light.turn_off' }],
    });
    expectExact(saved.conditions, conditions);
    // A guard in the middle of the actions is written as `if` (as for any guard).
    expectExact(saved.actions, [
      { action: 'light.turn_on' },
      { alias: 'Odd guard', if: [guard], then: [{ action: 'light.turn_off' }], else: [] },
    ]);
  });

  it('checks a verbatim condition natively in a state machine (A1)', async () => {
    const condition = { condition: 'time', after: 5, weekday: 'someday' };
    const transpiler = new FlowTranspiler();
    const parsed = await transpiler.fromYaml(
      dump({
        alias: 'State machine',
        triggers: [{ trigger: 'state', entity_id: 'sensor.a' }],
        conditions: [condition],
        actions: [{ action: 'light.turn_on' }],
      }),
      { keepBlocks: true }
    );
    expect(parsed.graph).toBeDefined();
    if (!parsed.graph) return;
    const result = transpiler.transpile(parsed.graph, { forceStrategy: 'state-machine' });
    expect(JSON.stringify(result.output?.automation)).toContain(
      `"if":[${JSON.stringify(condition)}]`
    );
  });

  it('keeps Jinja shorthand conditions as written (A2)', async () => {
    const triggers = [{ trigger: 'state', entity_id: 'sensor.a' }];
    const actions = [{ action: 'light.turn_on' }];
    const conditions = [
      "{{ is_state('sun.sun', 'below_horizon') }}",
      { condition: 'state', entity_id: 'a.b', state: 'on' },
      '{{ 1 == 1 }}',
    ];
    const saved = await panelSave({ alias: 'Shorthand', triggers, conditions, actions });
    expectExact(saved.conditions, conditions);

    const only = await panelSave({ alias: 'Only', triggers, conditions: '{{ true }}', actions });
    expectExact(only.conditions, ['{{ true }}']);
    expectExact(only.actions, actions);
  });

  it('keeps a single wait_for_trigger mapping (A3)', async () => {
    const actions = [
      {
        wait_for_trigger: { trigger: 'state', entity_id: 'a.b', to: 'on' },
        timeout: '00:01:00',
      },
      { wait_for_trigger: [{ trigger: 'state', entity_id: 'a.c', to: 'off' }] },
      { action: 'light.turn_on' },
    ];
    const saved = await panelSave({
      alias: 'Wait',
      triggers: [{ trigger: 'state', entity_id: 'sensor.a' }],
      actions,
    });
    expectExact(saved.actions, actions);
  });

  it('keeps a numeric wait timeout, including 0 (A4)', async () => {
    const actions = [
      { wait_template: '{{ true }}', timeout: 30 },
      { wait_template: '{{ true }}', timeout: 0, continue_on_timeout: false },
      { wait_for_trigger: [{ trigger: 'state', entity_id: 'a.b' }], timeout: 45 },
    ];
    const saved = await panelSave({
      alias: 'Timeout',
      triggers: [{ trigger: 'state', entity_id: 'sensor.a' }],
      actions,
    });
    expectExact(saved.actions, actions);
  });

  it('keeps every log level HA allows for max_exceeded (A5)', async () => {
    const base = {
      triggers: [{ trigger: 'state', entity_id: 'sensor.a' }],
      actions: [{ action: 'light.turn_on' }],
    };
    for (const level of ['info', 'ERROR', 'debug', 'notset', 'silent', 'Warning']) {
      const saved = await panelSave({
        ...base,
        alias: level,
        mode: 'queued',
        max: 10,
        max_exceeded: level,
      });
      expect(saved).toMatchObject({ mode: 'queued', max: 10, max_exceeded: level });
    }
  });

  it('keeps the valid settings when one of them is invalid (A5)', async () => {
    const saved = await panelSave({
      alias: 'Settings',
      triggers: [{ trigger: 'state', entity_id: 'sensor.a' }],
      actions: [{ action: 'light.turn_on' }],
      mode: 'parallel',
      max: 4,
      max_exceeded: 'loudly',
      trace: { stored_traces: 20 },
      initial_state: false,
    });
    expect(saved).toMatchObject({
      mode: 'parallel',
      max: 4,
      trace: { stored_traces: 20 },
      initial_state: false,
    });
    expect(saved.max_exceeded).toBeUndefined();
  });
});
