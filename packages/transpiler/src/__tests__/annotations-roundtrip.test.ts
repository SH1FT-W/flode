import { type FlowGraph, isPlainObject } from '@flode/shared';
import { v4 as uuidv4 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { YamlParser } from '../parser/YamlParser';
import { buildAutomationSaveConfig } from '../save-config';

function flow(extra: Partial<FlowGraph> = {}): FlowGraph {
  return {
    id: uuidv4(),
    name: 'Notes',
    description: '',
    nodes: [
      {
        id: 't1',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { trigger: 'state', entity_id: 'sensor.a' },
      },
      {
        id: 'a1',
        type: 'action',
        position: { x: 360, y: 0 },
        data: { service: 'light.turn_on' },
      },
    ],
    edges: [{ id: 'e1', source: 't1', target: 'a1' }],
    metadata: { mode: 'single' },
    version: 1,
    ...extra,
  };
}

const note = {
  id: 'note_1',
  x: 20,
  y: 200,
  width: 220,
  height: 120,
  text: 'Waarom dit zo is',
  color: 'green' as const,
};
const frame = {
  id: 'frame_1',
  x: -40,
  y: -60,
  width: 800,
  height: 300,
  title: 'Licht',
  color: '#ff8000',
};

describe('notes and frames', () => {
  it('survive saving and opening again', async () => {
    const transpiler = new FlowTranspiler();
    const saved = buildAutomationSaveConfig(transpiler, flow({ notes: [note], frames: [frame] }), {
      alias: 'Notes',
      description: '',
    });
    expect(saved.success).toBe(true);
    const yaml = (await import('js-yaml')).dump(saved.config);
    const parsed = await new YamlParser().parse(yaml);
    expect(parsed.graph?.notes).toEqual([note]);
    expect(parsed.graph?.frames).toEqual([frame]);
  });

  it('change nothing in the steps that are written', () => {
    const transpiler = new FlowTranspiler();
    const naming = { alias: 'Notes', description: '' };
    const plain = buildAutomationSaveConfig(transpiler, flow(), naming).config;
    const noted = buildAutomationSaveConfig(
      transpiler,
      flow({ notes: [note], frames: [frame] }),
      naming
    ).config;
    expect(noted?.actions).toEqual(plain?.actions);
    expect(noted?.triggers).toEqual(plain?.triggers);
    const plainMeta = isPlainObject(plain?.variables) ? plain.variables._flode_metadata : undefined;
    expect(plainMeta).toBeDefined();
    expect(plainMeta).not.toHaveProperty('notes');
    expect(plainMeta).not.toHaveProperty('frames');
  });

  it('drop only the entries that are broken', async () => {
    const yaml = `
alias: Notes
triggers:
  - trigger: state
    entity_id: sensor.a
actions:
  - action: light.turn_on
variables:
  _flode_metadata:
    version: 1
    graph_id: ${uuidv4()}
    graph_version: 1
    strategy: native
    nodes: {}
    notes:
      - { id: ok, x: 0, y: 0, width: 100, height: 60, text: hi }
      - { id: broken, x: nope }
    frames: 7
`;
    const parsed = await new YamlParser().parse(yaml);
    expect(parsed.success).toBe(true);
    expect(parsed.graph?.notes?.map((n) => n.id)).toEqual(['ok']);
    expect(parsed.graph?.frames).toBeUndefined();
  });
});

describe('tinted cards and laid lines (#28)', () => {
  it('keep their colour and bends in the layout only, through saving and opening again', async () => {
    const transpiler = new FlowTranspiler();
    const graph = flow({
      cardColors: { a1: 'purple', t1: '#112233' },
      lineBends: { 't1||a1': [{ x: 200, y: -60 }] },
    });
    const saved = buildAutomationSaveConfig(transpiler, graph, { alias: 'Notes', description: '' });
    const plain = buildAutomationSaveConfig(transpiler, flow(), {
      alias: 'Notes',
      description: '',
    });
    expect(saved.config?.actions).toEqual(plain.config?.actions);
    const yaml = (await import('js-yaml')).dump(saved.config);
    const parsed = await new YamlParser().parse(yaml);
    expect(parsed.graph?.cardColors).toEqual({ a1: 'purple', t1: '#112233' });
    expect(parsed.graph?.lineBends).toEqual({ 't1||a1': [{ x: 200, y: -60 }] });
  });
});
