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
});
