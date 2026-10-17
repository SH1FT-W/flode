import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { YamlParser } from '../parser/YamlParser';

/**
 * Issue #219: a trigger in a shape FLODE's schema does not model must still open
 * (as a trigger card, not as an action) and must come back unchanged when the
 * automation is saved. The old fallback rebuilt the trigger from guessed fields and
 * the graph check then rejected it; today it is kept verbatim. These tests therefore
 * compare the whole written trigger list with the input, not just that a card exists.
 */

const automationWith = (trigger: string) => `
alias: Test
triggers:
  - ${trigger.trim().split('\n').join('\n    ')}
conditions: []
actions:
  - action: light.turn_on
    target:
      entity_id: light.kitchen
mode: single
`;

/** `written` is what FLODE must write back; by default the trigger as it came. */
const cases: {
  name: string;
  yaml: string;
  trigger: Record<string, unknown>;
  written?: Record<string, unknown>;
}[] = [
  {
    name: 'event_type as a list (several events in one trigger)',
    yaml: `
trigger: event
event_type:
  - ha_started
  - homeassistant_started
`,
    trigger: { trigger: 'event', event_type: ['ha_started', 'homeassistant_started'] },
  },
  {
    name: 'for as a number of seconds',
    yaml: `
trigger: state
entity_id: sensor.temperature
to: "on"
for: 300
`,
    trigger: { trigger: 'state', entity_id: 'sensor.temperature', to: 'on', for: 300 },
  },
  {
    name: 'dict-keyed trigger (the type as the key)',
    yaml: `
state:
  entity_id: sensor.temperature
  to: "on"
`,
    trigger: { state: { entity_id: 'sensor.temperature', to: 'on' } },
    // HA itself rejects a trigger without a type; FLODE names it a state trigger and keeps its fields.
    written: { trigger: 'state', state: { entity_id: 'sensor.temperature', to: 'on' } },
  },
  {
    name: 'for with a template inside the duration mapping',
    yaml: `
trigger: state
entity_id: sensor.temperature
to: "on"
for:
  minutes: "{{ states('input_number.delay') | int }}"
`,
    trigger: {
      trigger: 'state',
      entity_id: 'sensor.temperature',
      to: 'on',
      for: { minutes: "{{ states('input_number.delay') | int }}" },
    },
  },
];

describe('Issue #219: triggers outside the schema open as a trigger card and save unchanged', () => {
  for (const { name, yaml, trigger, written = trigger } of cases) {
    it(`${name}: opens without errors, exactly one trigger card`, async () => {
      const parsed = await new YamlParser().parse(automationWith(yaml));
      expect(parsed.success).toBe(true);
      expect(parsed.errors ?? []).toEqual([]);
      expect(parsed.graph?.nodes.filter((n) => n.type === 'trigger')).toHaveLength(1);
      expect(parsed.graph?.nodes.filter((n) => n.type === 'action')).toHaveLength(1);
    });

    it(`${name}: is written back as the same trigger`, async () => {
      const parsed = await new YamlParser().parse(automationWith(yaml));
      expect(parsed.graph).toBeDefined();
      if (!parsed.graph) throw new Error('no graph');
      const result = new FlowTranspiler().transpile(parsed.graph);
      expect(result.success).toBe(true);
      expect(result.output?.automation?.triggers).toEqual([written]);
      expect(result.output?.automation?.actions).toEqual([
        { action: 'light.turn_on', target: { entity_id: 'light.kitchen' } },
      ]);
    });
  }
});
