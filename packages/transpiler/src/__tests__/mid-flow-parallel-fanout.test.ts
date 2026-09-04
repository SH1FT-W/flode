import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { YamlParser } from '../parser/YamlParser';

describe('Mid-flow parallel fan-out (state-machine strategy)', () => {
  it('keeps every branch when an action node fans out to multiple targets (GH #16)', async () => {
    // Reproduces the reported bug: a scene.create action links to three
    // light.turn_on nodes, and a second, unrelated trigger chain forces the
    // state-machine strategy (divergent triggers). Only the first-declared
    // edge used to survive; the other two branches silently vanished.
    const flow: FlowGraph = {
      id: 'c1a2b3d4-e5f6-4789-a012-3456789abcde',
      name: 'Cinema Mode',
      nodes: [
        {
          id: 'trigger_on',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: ['input_boolean.cinema_mode'], to: 'on' },
        },
        {
          id: 'trigger_off',
          type: 'trigger',
          position: { x: 0, y: 300 },
          data: { trigger: 'state', entity_id: ['input_boolean.cinema_mode'], to: 'off' },
        },
        {
          id: 'action_scene_turn_on',
          type: 'action',
          position: { x: 300, y: 300 },
          data: { service: 'scene.turn_on', target: { entity_id: ['scene.living_room'] } },
        },
        {
          id: 'action_scene_create',
          type: 'action',
          position: { x: 300, y: 0 },
          data: {
            service: 'scene.create',
            data: { scene_id: 'cinema_before', snapshot_entities: ['light.hue_play'] },
          },
        },
        {
          id: 'action_light_1',
          type: 'action',
          position: { x: 600, y: -60 },
          data: {
            service: 'light.turn_on',
            target: { entity_id: ['light.hue_play'] },
            data: { brightness_pct: 20 },
          },
        },
        {
          id: 'action_light_2',
          type: 'action',
          position: { x: 600, y: 0 },
          data: { service: 'light.turn_on', target: { entity_id: ['light.living_room'] } },
        },
        {
          id: 'action_light_3',
          type: 'action',
          position: { x: 600, y: 60 },
          data: { service: 'light.turn_on', target: { entity_id: ['light.hallway'] } },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger_off', target: 'action_scene_turn_on' },
        { id: 'e2', source: 'trigger_on', target: 'action_scene_create' },
        { id: 'e3', source: 'action_scene_create', target: 'action_light_1' },
        { id: 'e4', source: 'action_scene_create', target: 'action_light_2' },
        { id: 'e5', source: 'action_scene_create', target: 'action_light_3' },
      ],
      metadata: { mode: 'single', initial_state: true },
      version: 1,
    };

    const transpiler = new FlowTranspiler();
    const result = transpiler.transpile(flow);

    expect(result.success).toBe(true);
    expect(result.output?.strategy).toBe('state-machine');

    // scene.create itself must still run.
    expect(result.yaml).toContain('scene.create');

    // All three light.turn_on branches must survive - not just the first.
    expect(result.yaml).toContain('light.hue_play');
    expect(result.yaml).toContain('light.living_room');
    expect(result.yaml).toContain('light.hallway');

    // They must run via a parallel block, not sequentially chained through
    // current_node (HA has no way to express "continue to 3 different next
    // states" through one shared variable).
    expect(result.yaml).toContain('parallel:');
  });

  it('reconstructs every fanned-out branch as a real node when the YAML is reimported (GH #16)', async () => {
    // The generation-only test above only checked the generated YAML text.
    // NullScope's follow-up report showed the actual gap: reimporting that
    // very YAML back into FLODE silently dropped the whole `parallel:` block
    // — the branch nodes never existed on the canvas after Save, only the
    // scene.create node with zero outgoing connections. This proves the
    // round trip, not just the one-way generation.
    const flow: FlowGraph = {
      id: 'c1a2b3d4-e5f6-4789-a012-3456789abcde',
      name: 'Cinema Mode',
      nodes: [
        {
          id: 'trigger_on',
          type: 'trigger',
          position: { x: 0, y: 0 },
          data: { trigger: 'state', entity_id: ['input_boolean.cinema_mode'], to: 'on' },
        },
        {
          id: 'trigger_off',
          type: 'trigger',
          position: { x: 0, y: 300 },
          data: { trigger: 'state', entity_id: ['input_boolean.cinema_mode'], to: 'off' },
        },
        {
          id: 'action_scene_turn_on',
          type: 'action',
          position: { x: 300, y: 300 },
          data: { service: 'scene.turn_on', target: { entity_id: ['scene.living_room'] } },
        },
        {
          id: 'action_scene_create',
          type: 'action',
          position: { x: 300, y: 0 },
          data: {
            service: 'scene.create',
            data: { scene_id: 'cinema_before', snapshot_entities: ['light.hue_play'] },
          },
        },
        {
          id: 'action_light_1',
          type: 'action',
          position: { x: 600, y: -60 },
          data: {
            service: 'light.turn_on',
            target: { entity_id: ['light.hue_play'] },
            data: { brightness_pct: 20 },
          },
        },
        {
          id: 'action_light_2',
          type: 'action',
          position: { x: 600, y: 0 },
          data: { service: 'light.turn_on', target: { entity_id: ['light.living_room'] } },
        },
        {
          id: 'action_light_3',
          type: 'action',
          position: { x: 600, y: 60 },
          data: { service: 'light.turn_on', target: { entity_id: ['light.hallway'] } },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger_off', target: 'action_scene_turn_on' },
        { id: 'e2', source: 'trigger_on', target: 'action_scene_create' },
        { id: 'e3', source: 'action_scene_create', target: 'action_light_1' },
        { id: 'e4', source: 'action_scene_create', target: 'action_light_2' },
        { id: 'e5', source: 'action_scene_create', target: 'action_light_3' },
      ],
      metadata: { mode: 'single', initial_state: true },
      version: 1,
    };

    const { yaml } = new FlowTranspiler().transpile(flow);
    if (!yaml) throw new Error('expected generated yaml');

    const reimported = await new YamlParser().parse(yaml);
    expect(reimported.success).toBe(true);

    const nodeIds = new Set(reimported.graph?.nodes.map((n) => n.id));
    for (const id of [
      'action_scene_create',
      'action_light_1',
      'action_light_2',
      'action_light_3',
      'action_scene_turn_on',
    ]) {
      expect(nodeIds.has(id)).toBe(true);
    }

    // scene.create must fan out to all three lights, not zero or one.
    const fanOutEdges =
      reimported.graph?.edges.filter((e) => e.source === 'action_scene_create') ?? [];
    expect(fanOutEdges.map((e) => e.target).sort()).toEqual(
      ['action_light_1', 'action_light_2', 'action_light_3'].sort()
    );
  });
});
