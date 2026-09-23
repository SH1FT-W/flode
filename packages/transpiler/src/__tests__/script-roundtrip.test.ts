import { SCRIPT_START_TRIGGER } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { parseScript, transpileScript } from '../script';

const transpiler = new FlowTranspiler();

/** A script as HA stores it in scripts.yaml / config/script/config/<id>. */
const script = {
  alias: 'Guten Morgen',
  description: 'Weckt das Haus',
  mode: 'restart',
  icon: 'mdi:weather-sunset-up',
  fields: {
    brightness: {
      name: 'Helligkeit',
      required: true,
      default: 60,
      selector: { number: { min: 1, max: 100 } },
    },
  },
  sequence: [
    { condition: 'state', entity_id: 'input_boolean.guests', state: 'off' },
    {
      action: 'light.turn_on',
      target: { entity_id: 'light.bedroom' },
      data: { brightness_pct: '{{ brightness }}' },
    },
    { delay: '00:01:00' },
    { action: 'cover.open_cover', target: { entity_id: 'cover.bedroom' } },
  ],
};

describe('script round trip', () => {
  it('opens a script as a flow with a script start carrying the fields', async () => {
    const parsed = await parseScript(transpiler, script);
    expect(parsed.success).toBe(true);
    const graph = parsed.graph;
    expect(graph?.metadata).toMatchObject({ kind: 'script', icon: 'mdi:weather-sunset-up' });
    const start = graph?.nodes.find((n) => n.type === 'trigger');
    expect(start?.data).toMatchObject({ trigger: SCRIPT_START_TRIGGER, fields: script.fields });
    expect(graph?.nodes.filter((n) => n.type === 'trigger')).toHaveLength(1);
  });

  it('saves it back as the same script', async () => {
    const parsed = await parseScript(transpiler, script);
    if (!parsed.graph) throw new Error('parse failed');
    const saved = transpileScript(transpiler, parsed.graph);
    expect(saved.success).toBe(true);
    const { variables, ...config } = saved.config ?? {};
    expect(config).toEqual({
      alias: 'Guten Morgen',
      description: 'Weckt das Haus',
      mode: 'restart',
      icon: 'mdi:weather-sunset-up',
      fields: script.fields,
      sequence: [
        { condition: 'state', entity_id: 'input_boolean.guests', state: 'off' },
        {
          action: 'light.turn_on',
          target: { entity_id: 'light.bedroom' },
          data: { brightness_pct: '{{ brightness }}' },
        },
        { delay: '00:01:00' },
        { action: 'cover.open_cover', target: { entity_id: 'cover.bedroom' } },
      ],
    });
    // Node positions travel in variables, like for automations.
    expect(variables).toHaveProperty('_flode_metadata');
    expect(saved.yaml).not.toContain('triggers:');
  });
});
