import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { YamlParser } from '../parser/YamlParser';
import { dumpHaYaml, loadHaYaml } from '../yaml';

/** The parser reads YAML the way Home Assistant does: no timestamps, YAML 1.1 booleans. */
describe('YamlParser reads YAML like Home Assistant', () => {
  it('keeps a date and time the text it is, and reads yes as true', async () => {
    const result = await new YamlParser().parse(`
alias: Dates
triggers:
  - trigger: state
    entity_id: light.a
actions:
  - action: calendar.create_event
    data:
      start_date_time: 2026-10-01 10:00:00
      all_day: yes
mode: single
`);
    expect(result.success).toBe(true);
    const action = result.graph?.nodes.find((n) => n.type === 'action');
    expect(action?.data.data).toEqual({ start_date_time: '2026-10-01 10:00:00', all_day: true });
  });
});

describe('YAML FLODE writes', () => {
  // Read by HA (YAML 1.1) and by HA's own YAML editor in the browser (js-yaml's default schema).
  const tricky = {
    datetime: '2026-10-01 10:00:00',
    date: '2026-10-01',
    octal12: '0o17',
    exponent: '1e3',
    separated: '1_000',
    word: 'on',
    empty: 'null',
  };

  it('quotes strings that either reader would take for something else', () => {
    const yaml = dumpHaYaml(tricky);
    expect(loadHaYaml(yaml)).toEqual(tricky);
    expect(load(yaml)).toEqual(tricky);
  });
});
