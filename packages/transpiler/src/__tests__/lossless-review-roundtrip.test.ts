/**
 * Shapes a review found FLODE rewrote or dropped on open → save. Each one must
 * come back exactly as Home Assistant had it — compared as structure, the
 * subtree of the original against the subtree of what would be saved.
 */
import { isPlainObject } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { YamlParser } from '../parser/YamlParser';
import { buildAutomationSaveConfig } from '../save-config';
import { parseFlowYaml, parseScript, transpileScript } from '../script';
import { dumpHaYaml, loadHaYaml } from '../yaml';

const transpiler = new FlowTranspiler();

function loadConfig(yaml: string): Record<string, unknown> {
  const config = loadHaYaml(yaml);
  if (!isPlainObject(config)) throw new Error('not a mapping');
  return config;
}

/** Opens `config` as the editor does (`keepBlocks`) or as `fromYaml` does by default, and saves it. */
async function openAndSave(
  config: Record<string, unknown>,
  keepBlocks: boolean
): Promise<Record<string, unknown>> {
  const parsed = await new YamlParser({ keepBlocks }).parse(JSON.stringify(config));
  expect(parsed.errors ?? []).toEqual([]);
  if (!parsed.graph) throw new Error('no graph');
  const saved = buildAutomationSaveConfig(transpiler, parsed.graph, {
    alias: parsed.graph.name,
    description: parsed.graph.description ?? '',
  });
  expect(saved.errors ?? []).toEqual([]);
  if (!saved.config) throw new Error('no config');
  return saved.config;
}

const BOTH_MODES = [true, false];

describe('lossless round trip of shapes found in review', () => {
  describe.each(BOTH_MODES)('keepBlocks: %s', (keepBlocks) => {
    it('keeps top-level shorthand logic conditions (and/or/not, with alias)', async () => {
      const config = loadConfig(`
alias: Shorthand logic
triggers:
  - trigger: event
    event_type: x
conditions:
  - and:
      - condition: state
        entity_id: light.a
        state: "on"
  - or:
      - "{{ a }}"
      - "{{ b }}"
    alias: Either
  - not:
      - condition: state
        entity_id: light.c
        state: "off"
actions:
  - action: light.toggle
`);
      const saved = await openAndSave(config, keepBlocks);
      expect(saved.conditions).toEqual(config.conditions);
      expect(saved.actions).toEqual(config.actions);
    });

    it('keeps a nested trigger list without inventing a trigger type', async () => {
      const config = loadConfig(`
alias: Nested triggers
triggers:
  - triggers:
      - trigger: state
        entity_id: light.a
      - trigger: state
        entity_id: light.b
actions:
  - action: light.toggle
`);
      const saved = await openAndSave(config, keepBlocks);
      expect(saved.triggers).toEqual(config.triggers);
    });

    it('keeps top-level conditions as conditions when there are no actions', async () => {
      const config = loadConfig(`
alias: Only conditions
triggers:
  - trigger: event
    event_type: x
conditions:
  - condition: state
    entity_id: light.a
    state: "on"
actions: []
`);
      const saved = await openAndSave(config, keepBlocks);
      expect(saved.conditions).toEqual(config.conditions);
      expect(saved.actions).toEqual([]);
    });

    it('keeps a bare number of seconds as the delay', async () => {
      const config = loadConfig(`
alias: Delay shapes
triggers:
  - trigger: event
    event_type: x
actions:
  - delay: 5
  - delay: "00:00:05"
  - delay:
      seconds: 5
`);
      const saved = await openAndSave(config, keepBlocks);
      expect(saved.actions).toEqual(config.actions);
    });

    it('keeps unknown top-level keys (from a newer Home Assistant)', async () => {
      const config = loadConfig(`
alias: Future keys
foo_unknown: 7
bar_unknown:
  nested: [1, "x"]
triggers:
  - trigger: event
    event_type: x
actions:
  - action: light.toggle
`);
      const saved = await openAndSave(config, keepBlocks);
      expect(saved.foo_unknown).toEqual(7);
      expect(saved.bar_unknown).toEqual({ nested: [1, 'x'] });
    });
  });

  it('reads a choose option whose conditions are one template string as that template (default parser)', async () => {
    const config = loadConfig(`
alias: Choose with template string
triggers:
  - trigger: event
    event_type: x
actions:
  - choose:
      - conditions: "{{ a }}"
        sequence:
          - action: light.toggle
`);
    const parsed = await new YamlParser().parse(JSON.stringify(config));
    const conditions = (parsed.graph?.nodes ?? [])
      .filter((node) => node.type === 'condition')
      .map(({ data }) => ({
        condition: data.condition,
        value_template: data.value_template,
        // Previously the string was spread into character keys ('0': '{', '1': '{', …).
        characterKeys: Object.keys(data).filter((key) => /^\d+$/.test(key)),
      }));
    expect(conditions).toEqual([
      { condition: 'template', value_template: '{{ a }}', characterKeys: [] },
    ]);
  });

  it('keeps choose and if template-string conditions as written with keepBlocks', async () => {
    const config = loadConfig(`
alias: Blocks with template strings
triggers:
  - trigger: event
    event_type: x
actions:
  - choose:
      - conditions: "{{ a }}"
        sequence:
          - action: light.toggle
  - if: "{{ b }}"
    then:
      - action: light.turn_on
`);
    const saved = await openAndSave(config, true);
    expect(saved.actions).toEqual(config.actions);
  });
});

describe('strings that look like YAML 1.1 numbers stay strings', () => {
  const DATA = {
    a: '1_000',
    b: '2026_11_14',
    c: '10_20',
    d: '0x_1F',
    e: '+1_0',
    f: '0_7',
  };
  const STEPS = [{ action: 'notify.x', data: DATA }];

  it('through a script open and save', async () => {
    const parsed = await parseScript(transpiler, { alias: 'Numbers', sequence: STEPS });
    if (!parsed.graph) throw new Error('no graph');
    const saved = transpileScript(transpiler, parsed.graph);
    expect(saved.config?.sequence).toEqual(STEPS);
  });

  it('through an automation opened from YAML text', async () => {
    const yaml = dumpHaYaml({
      alias: 'Numbers',
      triggers: [{ trigger: 'event', event_type: 'x' }],
      actions: STEPS,
    });
    const parsed = await parseFlowYaml(transpiler, yaml, 'automation');
    if (!parsed.graph) throw new Error('no graph');
    const saved = buildAutomationSaveConfig(transpiler, parsed.graph, {
      alias: 'Numbers',
      description: '',
    });
    expect(saved.config?.actions).toEqual(STEPS);
  });

  it('in the YAML the transpiler writes', async () => {
    const parsed = await new YamlParser().parse(
      JSON.stringify({
        alias: 'Numbers',
        triggers: [{ trigger: 'event', event_type: 'x' }],
        actions: STEPS,
      })
    );
    if (!parsed.graph) throw new Error('no graph');
    const result = transpiler.transpile(parsed.graph);
    const written = loadHaYaml(result.yaml ?? '');
    expect(isPlainObject(written) ? written.actions : undefined).toEqual(STEPS);
  });
});

describe("Home Assistant's own YAML tags", () => {
  it.each([
    '!secret api_key',
    '!input light',
    '!include other.yaml',
    '!env_var HOME',
  ])('%s gives a clear error instead of "unknown tag"', (value) => {
    const tag = value.split(' ')[0];
    expect(() => loadHaYaml(`alias: Tags\nkey: ${value}\n`)).toThrowError(
      `Line 2: ${tag} is a tag only Home Assistant's YAML files understand. FLODE saves through Home Assistant's editor, which cannot store it: put the value itself (or a template) there instead.`
    );
  });
});
