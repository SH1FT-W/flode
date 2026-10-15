import { type FlowEdge, type FlowGraph, type FlowNode, isPlainObject } from '@flode/shared';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { buildAutomationSaveConfig } from '../save-config';
import { loadHaYaml } from '../yaml';

const transpiler = new FlowTranspiler();
const GRAPH_ID = 'a18b0fbb-d966-432c-aba7-4f7361da8d29';

function trigger(id: string, entity = 'binary_sensor.t'): FlowNode {
  return {
    id,
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: { trigger: 'state', entity_id: entity },
  };
}
function condition(id: string, data: Record<string, unknown>): FlowNode {
  return { id, type: 'condition', position: { x: 0, y: 0 }, data };
}
function action(id: string, data: Record<string, unknown> = { service: `script.${id}` }): FlowNode {
  return { id, type: 'action', position: { x: 0, y: 0 }, data };
}
function edge(source: string, target: string, sourceHandle?: 'true' | 'false'): FlowEdge {
  return { id: `${source}->${target}${sourceHandle ?? ''}`, source, target, sourceHandle };
}
function graph(nodes: FlowNode[], edges: FlowEdge[]): FlowGraph {
  return { id: GRAPH_ID, name: 'Test', nodes, edges, version: 1, metadata: { mode: 'single' } };
}
function svc(id: string): Record<string, unknown> {
  return { action: `script.${id}` };
}

/** The saved automation without FLODE's layout. */
function automationOf(yaml: string | undefined): Record<string, unknown> {
  const parsed = load(yaml ?? '');
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
  const { variables, ...rest } = Object.fromEntries(Object.entries(parsed));
  const own = typeof variables === 'object' && variables !== null ? { ...variables } : {};
  delete own._flode_metadata;
  return Object.keys(own).length > 0 ? { ...rest, variables: own } : rest;
}

/** Open (as the panel does) and save again. */
async function resave(yaml: string): Promise<Record<string, unknown>> {
  const parsed = await transpiler.fromYaml(yaml, { keepBlocks: true });
  if (!parsed.success || !parsed.graph) throw new Error(parsed.errors?.join('\n'));
  const out = transpiler.transpile(parsed.graph);
  if (!out.success) throw new Error(out.errors?.join('\n'));
  return automationOf(out.yaml);
}

/** Transpile with the state machine, reopen, and return the reopened graph. */
async function smReopen(flow: FlowGraph): Promise<FlowGraph> {
  const out = transpiler.transpile(flow, { forceStrategy: 'state-machine' });
  const parsed = await transpiler.fromYaml(out.yaml ?? '', { keepBlocks: true });
  if (!parsed.success || !parsed.graph) throw new Error(parsed.errors?.join('\n'));
  return parsed.graph;
}

/** The value at a path of keys and list indexes, or undefined. */
function at(value: unknown, ...path: (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof key === 'number') current = Array.isArray(current) ? current[key] : undefined;
    else current = isPlainObject(current) ? current[key] : undefined;
  }
  return current;
}

/** The actions of an automation as YAML. */
const actionsOf = (yaml: string): unknown => at(loadHaYaml(yaml), 'actions');

const nodeData = (g: FlowGraph, id: string) => g.nodes.find((n) => n.id === id)?.data;

/** The steps of one node's entry in a saved state machine. */
function smEntry(yaml: string | undefined, nodeId: string): unknown {
  const choose = at(automationOf(yaml).actions, 1, 'repeat', 'sequence', 0, 'choose');
  const entry = Array.isArray(choose)
    ? choose.find((option) =>
        at(option, 'conditions', 0, 'value_template')?.toString().includes(`"${nodeId}"`)
      )
    : undefined;
  return at(entry, 'sequence');
}

describe('1: stale state-machine strategy metadata', () => {
  it('keeps plain actions that were rebuilt in the HA editor', async () => {
    const yaml = `
alias: Rebuilt
triggers:
  - trigger: state
    entity_id: binary_sensor.t
conditions:
  - condition: state
    entity_id: input_boolean.x
    state: "on"
actions:
  - action: light.turn_on
    target:
      entity_id: light.a
mode: single
variables:
  _flode_metadata:
    version: 1
    nodes: {}
    graph_id: ${GRAPH_ID}
    graph_version: 1
    strategy: state-machine
`;
    const out = await resave(yaml);
    expect(out.conditions).toEqual([
      { condition: 'state', entity_id: 'input_boolean.x', state: 'on' },
    ]);
    expect(out.actions).toEqual([{ action: 'light.turn_on', target: { entity_id: 'light.a' } }]);
  });

  it('keeps a top-level condition and an appended action of a real state machine', async () => {
    const flow = graph(
      [trigger('t1', 'a.one'), trigger('t2', 'a.two'), action('A'), action('B')],
      [edge('t1', 'A'), edge('t2', 'B')]
    );
    const generated = load(transpiler.transpile(flow).yaml ?? '');
    const actions = at(generated, 'actions');
    if (!isPlainObject(generated) || !Array.isArray(actions)) throw new Error();
    const edited = {
      ...generated,
      conditions: [{ condition: 'state', entity_id: 'input_boolean.x', state: 'on' }],
      actions: [...actions, svc('appended')],
    };
    const out = await resave(JSON.stringify(edited));
    expect(out.conditions).toEqual(edited.conditions);
    expect(JSON.stringify(out.actions)).toContain('script.appended');
  });

  it("does not take a user's own current_node/flow_context variables for a state machine", async () => {
    const yaml = `
triggers: [{ trigger: state, entity_id: a.b }]
actions:
  - variables: { current_node: x, flow_context: {} }
  - repeat:
      count: 2
      sequence:
        - choose:
            - conditions: [{ condition: template, value_template: "{{ true }}" }]
              sequence: [{ action: script.x }]
`;
    const out = await resave(yaml);
    expect(out.actions).toEqual(actionsOf(yaml));
  });
});

describe('2: reopening a state-machine automation keeps every step whole', () => {
  it('keeps wait_for_trigger, blocks, response_variable, continue_on_error, enabled, stop, event, scene', async () => {
    const steps: Record<string, Record<string, unknown>> = {
      wait: {
        wait_for_trigger: [{ trigger: 'state', entity_id: 'a.b', to: 'on' }],
        timeout: '00:01:00',
        continue_on_timeout: false,
      },
      block: { choose: [{ conditions: [], sequence: [svc('in')] }], default: [svc('d')] },
      call: {
        service: 'weather.get_forecasts',
        target: { entity_id: 'weather.home' },
        response_variable: 'fc',
        continue_on_error: true,
        enabled: false,
      },
      stop: { stop: 'done', error: true },
      event: { event: 'my_event', event_data: { a: 1 } },
      scene: { scene: 'scene.evening' },
    };
    const flow = graph(
      [
        trigger('t1', 'a.one'),
        trigger('t2', 'a.two'),
        { id: 'wait', type: 'wait', position: { x: 0, y: 0 }, data: steps.wait },
        action('block', { _raw: steps.block }),
        action('call', steps.call),
        action('event', steps.event),
        action('scene', { _raw: steps.scene }),
        action('stop', steps.stop),
        condition('cond', { condition: 'state', entity_id: 'a.c', state: 'on', alias: 'Is on' }),
      ],
      [
        edge('t1', 'wait'),
        edge('t2', 'cond'),
        edge('cond', 'block', 'true'),
        edge('wait', 'block'),
        edge('block', 'call'),
        edge('call', 'event'),
        edge('event', 'scene'),
        edge('scene', 'stop'),
      ]
    );
    const reopened = await smReopen(flow);
    expect(nodeData(reopened, 'wait')).toMatchObject(steps.wait);
    expect(nodeData(reopened, 'block')).toMatchObject({ _raw: steps.block });
    expect(nodeData(reopened, 'call')).toMatchObject(steps.call);
    expect(nodeData(reopened, 'event')).toMatchObject(steps.event);
    expect(nodeData(reopened, 'scene')).toMatchObject({ _raw: steps.scene });
    expect(nodeData(reopened, 'stop')).toMatchObject(steps.stop);
    expect(nodeData(reopened, 'cond')).toMatchObject({ alias: 'Is on' });
    // Saving again writes the same state machine
    const save = (g: FlowGraph) =>
      automationOf(transpiler.transpile(g, { forceStrategy: 'state-machine' }).yaml);
    expect(save(reopened)).toEqual(save(flow));
  });
});

describe('3: state-machine conditions are checked by HA itself', () => {
  const matrix: Record<string, Record<string, unknown>> = {
    trigger: { condition: 'trigger', id: 'x' },
    device: {
      condition: 'device',
      device_id: 'abc',
      domain: 'light',
      entity_id: 'light.a',
      type: 'is_on',
    },
    targeted: { condition: 'light.is_on', target: { entity_id: 'light.a' }, options: {} },
    entityList: { condition: 'state', entity_id: ['light.a', 'light.b'], state: 'on' },
    notTwo: {
      condition: 'not',
      conditions: [
        { condition: 'state', entity_id: 'a.x', state: 'on' },
        { condition: 'state', entity_id: 'a.y', state: 'on' },
      ],
    },
    disabled: { condition: 'state', entity_id: 'a.x', state: 'on', enabled: false },
    zone: { condition: 'zone', entity_id: 'person.a', zone: 'zone.home' },
    numericHelper: { condition: 'numeric_state', entity_id: 'sensor.t', above: 'input_number.x' },
    midnight: { condition: 'time', after: '22:00:00', before: '06:00:00' },
    sunOffset: { condition: 'sun', after: 'sunset', after_offset: '-01:00:00' },
    blockScalar: { condition: 'template', value_template: '{{\n  is_state("a.b", "on")\n}}\n' },
    apostrophe: { condition: 'state', entity_id: 'input_select.x', state: "Daniel's" },
  };

  for (const [name, data] of Object.entries(matrix)) {
    it(`${name}: written natively and read back unchanged`, async () => {
      const flow = graph(
        [trigger('t1', 'a.one'), trigger('t2', 'a.two'), condition('c', data), action('A')],
        [edge('t1', 'c'), edge('t2', 'A'), edge('c', 'A', 'true')]
      );
      const out = transpiler.transpile(flow, { forceStrategy: 'state-machine' });
      // No Jinja version of the condition (only the trigger routing is Jinja)
      expect(out.yaml).not.toMatch(/\{% if (?!trigger\.idx)/);
      expect(smEntry(out.yaml, 'c')).toMatchObject([{ if: [data] }]);
      const reopened = await smReopen(flow);
      expect(nodeData(reopened, 'c')).toEqual(data);
      expect(reopened.edges.filter((e) => e.source === 'c')).toMatchObject([
        { target: 'A', sourceHandle: 'true' },
      ]);
    });
  }
});

describe('4: templated data and target', () => {
  const yaml = `
triggers: [{ trigger: state, entity_id: a.b }]
actions:
  - action: light.turn_on
    target: "{{ {'entity_id': states.light | map(attribute='entity_id') | list} }}"
    data: "{{ {'brightness': 10} }}"
`;
  it('keeps them on a native save', async () => {
    expect((await resave(yaml)).actions).toEqual(actionsOf(yaml));
  });
  it('keeps them through the state machine', async () => {
    const parsed = await transpiler.fromYaml(yaml, { keepBlocks: true });
    const g = parsed.graph;
    if (!g) throw new Error();
    const reopened = await smReopen(g);
    const call = reopened.nodes.find((n) => n.type === 'action');
    expect(call?.data).toMatchObject({
      target: "{{ {'entity_id': states.light | map(attribute='entity_id') | list} }}",
      data: "{{ {'brightness': 10} }}",
    });
  });
  it('keeps a templated enabled', async () => {
    const withEnabled = `
triggers: [{ trigger: state, entity_id: a.b }]
actions:
  - action: light.turn_on
    enabled: "{{ is_state('a.c', 'on') }}"
`;
    expect((await resave(withEnabled)).actions).toEqual(actionsOf(withEnabled));
  });
});

describe('5: triggers that each lead to their own condition', () => {
  it('does not run every branch for every trigger', () => {
    const flow = graph(
      [
        trigger('t1', 'a.one'),
        trigger('t2', 'a.two'),
        condition('c1', { condition: 'state', entity_id: 'a.x', state: 'on' }),
        condition('c2', { condition: 'state', entity_id: 'a.y', state: 'on' }),
        action('A1'),
        action('A2'),
      ],
      [edge('t1', 'c1'), edge('t2', 'c2'), edge('c1', 'A1', 'true'), edge('c2', 'A2', 'true')]
    );
    const out = transpiler.transpile(flow);
    expect(out.output?.strategy).toBe('state-machine');
  });

  it('keeps trigger-id routing native', () => {
    const flow = graph(
      [
        trigger('t1', 'a.one'),
        trigger('t2', 'a.two'),
        condition('c1', { condition: 'trigger', id: 'one' }),
        condition('c2', { condition: 'trigger', id: 'two' }),
        action('A1'),
        action('A2'),
      ],
      [edge('t1', 'c1'), edge('t2', 'c2'), edge('c1', 'A1', 'true'), edge('c2', 'A2', 'true')]
    );
    expect(transpiler.transpile(flow).output?.strategy).toBe('native');
  });
});

describe('6: fan-out that merges again runs the merge once', () => {
  const both = [action('A'), action('B'), action('M')];
  it('after a trigger', () => {
    const flow = graph(
      [trigger('t'), ...both],
      [edge('t', 'A'), edge('t', 'B'), edge('A', 'M'), edge('B', 'M')]
    );
    expect(automationOf(transpiler.transpile(flow).yaml).actions).toEqual([
      { parallel: [svc('A'), svc('B')] },
      svc('M'),
    ]);
  });
  it('after a condition', () => {
    const flow = graph(
      [
        trigger('t'),
        condition('c', { condition: 'state', entity_id: 'a.x', state: 'on' }),
        ...both,
      ],
      [
        edge('t', 'c'),
        edge('c', 'A', 'true'),
        edge('c', 'B', 'true'),
        edge('A', 'M'),
        edge('B', 'M'),
      ]
    );
    const out = automationOf(transpiler.transpile(flow).yaml);
    expect(out.actions).toEqual([{ parallel: [svc('A'), svc('B')] }, svc('M')]);
  });
  it('after a condition without a merge, like after a trigger', () => {
    const flow = graph(
      [
        trigger('t'),
        condition('c', { condition: 'state', entity_id: 'a.x', state: 'on' }),
        action('A'),
        action('B'),
      ],
      [edge('t', 'c'), edge('c', 'A', 'true'), edge('c', 'B', 'true')]
    );
    const out = automationOf(transpiler.transpile(flow).yaml);
    expect(out.actions).toEqual([{ parallel: [svc('A'), svc('B')] }]);
  });
});

describe('7: condition steps stay where they were', () => {
  it('keeps a leading condition step in the actions', async () => {
    const yaml = `
triggers: [{ trigger: state, entity_id: a.b }]
actions:
  - condition: state
    entity_id: input_boolean.enabled
    state: "on"
  - stop: Not enabled
`;
    const out = await resave(yaml);
    expect(out.conditions).toBeUndefined();
    expect(out.actions).toEqual(actionsOf(yaml));
  });
  it('keeps a condition step between actions', async () => {
    const yaml = `
triggers: [{ trigger: state, entity_id: a.b }]
conditions: [{ condition: state, entity_id: a.c, state: "on" }]
actions:
  - action: script.one
  - condition: template
    value_template: "{{ true }}"
  - action: script.two
`;
    const out = await resave(yaml);
    expect(out.conditions).toEqual([{ condition: 'state', entity_id: 'a.c', state: 'on' }]);
    expect(out.actions).toEqual(actionsOf(yaml));
  });
});

describe('8: state-machine edge ids', () => {
  it('are unique when both branches lead to the same node', async () => {
    const flow = graph(
      [
        trigger('t1', 'a.one'),
        trigger('t2', 'a.two'),
        condition('c', { condition: 'state', entity_id: 'a.x', state: 'on' }),
        action('B'),
        action('Z'),
      ],
      [edge('t1', 'c'), edge('c', 'B', 'true'), edge('c', 'B', 'false'), edge('t2', 'Z')]
    );
    const ids = (await smReopen(flow)).edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('9: a trigger without a connection', () => {
  const flow = graph(
    [trigger('t1', 'a.one'), trigger('t2', 'a.two'), action('A')],
    [edge('t1', 'A')]
  );
  it('is reported', () => {
    expect(transpiler.validate(flow).warnings.map((w) => w.code)).toContain('UNCONNECTED_TRIGGER');
    expect(transpiler.transpile(flow).warnings.join('\n')).toContain('t2');
  });
  it("does not run another trigger's path", () => {
    const actions = automationOf(transpiler.transpile(flow).yaml).actions;
    const entry = JSON.stringify(Array.isArray(actions) ? actions[0] : null);
    // trigger 1 (index 1) must end at once
    expect(entry).toContain('END');
  });
});

describe('YAML like Home Assistant reads it (1.1)', () => {
  it('reads yes/on/Off, octal, underscores and sexagesimal as HA does', () => {
    expect(
      loadHaYaml('a: yes\nb: on\nc: Off\nd: 0755\ne: 1_000\nf: 1:30\ng: "on"\nh: 1.5')
    ).toEqual({ a: true, b: true, c: false, d: 493, e: 1000, f: 90, g: 'on', h: 1.5 });
  });
});

describe('a list of several automations', () => {
  it('warns that only the first one is opened', async () => {
    const yaml = `
- triggers: [{ trigger: state, entity_id: a.b }]
  actions: [{ action: script.one }]
- triggers: [{ trigger: state, entity_id: a.c }]
  actions: [{ action: script.two }]
`;
    const parsed = await transpiler.fromYaml(yaml, { keepBlocks: true });
    expect(parsed.success).toBe(true);
    expect(parsed.warnings.join('\n')).toMatch(/2 automations/);
  });
});

describe('QA follow-ups', () => {
  it('reads a Jinja shorthand inside and/or/not groups without a warning, and writes it back', async () => {
    const yaml = `
alias: Nested shorthand
triggers:
  - trigger: state
    entity_id: light.bed_light
conditions:
  - condition: or
    conditions:
      - condition: and
        conditions:
          - condition: state
            entity_id: light.bed_light
            state: "off"
          - condition: not
            conditions:
              - condition: state
                entity_id: person.daniel
                state: not_home
              - "{{ false }}"
actions:
  - action: script.a
`;
    const parsed = await transpiler.fromYaml(yaml, { keepBlocks: true });
    expect(parsed.success).toBe(true);
    expect(parsed.warnings).toEqual([]);
    expect((await resave(yaml)).conditions).toEqual(at(loadHaYaml(yaml), 'conditions'));
  });

  it('records the strategy that wrote the YAML in the saved metadata', () => {
    const flow = graph(
      [
        trigger('t1', 'binary_sensor.a'),
        trigger('t2', 'binary_sensor.b'),
        condition('c1', { condition: 'state', entity_id: 'sun.sun', state: 'above_horizon' }),
        condition('c2', { condition: 'state', entity_id: 'sun.sun', state: 'below_horizon' }),
        action('a1'),
        action('a2'),
      ],
      [edge('t1', 'c1'), edge('c1', 'a1', 'true'), edge('t2', 'c2'), edge('c2', 'a2', 'true')]
    );
    const saved = buildAutomationSaveConfig(transpiler, flow, { alias: 'x', description: '' });
    expect(at(saved.config, 'variables', '_flode_metadata', 'strategy')).toBe('state-machine');
  });

  it("takes a graph action's service from `action:` too (HA's own name for it)", () => {
    const flow = graph(
      [trigger('t'), action('a', { action: 'light.turn_on', target: { entity_id: 'light.x' } })],
      [edge('t', 'a')]
    );
    const out = transpiler.transpile(flow);
    expect(at(automationOf(out.yaml), 'actions', 0, 'action')).toBe('light.turn_on');
  });
});
