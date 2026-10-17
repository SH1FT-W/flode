import { getRawStep } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { YamlParser } from '../parser/YamlParser';

/**
 * Triggers Home Assistant accepts but FLODE's trigger schema does not model
 * are kept verbatim (`_raw`), so the automation opens and saves unchanged.
 */

const automationWith = (trigger: string) => `
alias: Raw trigger
triggers:
  - ${trigger.trim().split('\n').join('\n    ')}
actions:
  - action: light.turn_on
    target:
      entity_id: light.kitchen
mode: single
`;

const cases: { name: string; yaml: string; trigger: Record<string, unknown> }[] = [
  {
    name: 'sun trigger with an offset mapping of strings',
    yaml: `
trigger: sun
event: sunset
offset:
  hours: "1"
`,
    trigger: { trigger: 'sun', event: 'sunset', offset: { hours: '1' } },
  },
  {
    name: 'mqtt trigger with a boolean payload',
    yaml: `
trigger: mqtt
topic: home/door
payload: true
`,
    trigger: { trigger: 'mqtt', topic: 'home/door', payload: true },
  },
  {
    name: 'state trigger on an attribute with a mapping as to',
    yaml: `
trigger: state
entity_id: light.kitchen
attribute: color
to:
  r: 255
`,
    trigger: { trigger: 'state', entity_id: 'light.kitchen', attribute: 'color', to: { r: 255 } },
  },
];

describe('triggers FLODE cannot model', () => {
  for (const { name, yaml, trigger } of cases) {
    it(`opens and writes back the ${name} unchanged`, async () => {
      const parsed = await new YamlParser().parse(automationWith(yaml));
      expect(parsed.success).toBe(true);
      expect(parsed.errors ?? []).toEqual([]);
      const nodes = parsed.graph?.nodes.filter((n) => n.type === 'trigger') ?? [];
      expect(nodes).toHaveLength(1);
      expect(nodes[0].data.trigger).toBe(trigger.trigger);
      expect(getRawStep(nodes[0].data)).toEqual(trigger);

      const result = new FlowTranspiler().transpile(parsed.graph!);
      expect(result.success).toBe(true);
      expect(result.output?.automation?.triggers).toEqual([trigger]);
    });
  }

  it('mirrors alias and enabled next to the verbatim trigger', async () => {
    const parsed = await new YamlParser().parse(
      automationWith(`
trigger: sun
alias: Abends
enabled: false
offset:
  hours: "1"
`)
    );
    expect(parsed.success).toBe(true);
    const node = parsed.graph?.nodes.find((n) => n.type === 'trigger');
    expect(node?.data.alias).toBe('Abends');
    expect(node?.data.enabled).toBe(false);
  });
});
