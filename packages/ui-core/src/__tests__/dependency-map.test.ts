import { describe, expect, it } from 'vitest';
import {
  areOppositeServices,
  buildDependencyMap,
  collectReferences,
  type DependencyItemInput,
  templateEntityIds,
} from '../dependency-map';

function automation(id: string, config: Record<string, unknown>): DependencyItemInput {
  return { kind: 'automation', id, entityId: `automation.${id}`, name: id, config };
}

const known = new Set([
  'binary_sensor.motion',
  'light.hall',
  'sensor.lux',
  'input_boolean.night',
  'script.goodnight',
  'automation.presence',
  'automation.goodnight',
  'automation.chain',
  'cover.living',
]);
const exists = (id: string) => known.has(id);

describe('collectReferences', () => {
  it('finds triggers, conditions and targeted actions', () => {
    const refs = collectReferences({
      triggers: [{ trigger: 'state', entity_id: 'binary_sensor.motion', to: 'on' }],
      conditions: [{ condition: 'numeric_state', entity_id: 'sensor.lux', below: 20 }],
      actions: [{ action: 'light.turn_on', target: { entity_id: ['light.hall'] } }],
    });
    expect(refs).toEqual([
      { entityId: 'binary_sensor.motion', role: 'trigger' },
      { entityId: 'sensor.lux', role: 'condition' },
      { entityId: 'light.hall', role: 'action', service: 'light.turn_on' },
    ]);
  });

  it('reads legacy keys, nested blocks and templates', () => {
    const refs = collectReferences({
      trigger: [
        { platform: 'template', value_template: "{{ is_state('input_boolean.night', 'on') }}" },
      ],
      action: [
        {
          if: [{ condition: 'state', entity_id: 'sensor.lux', state: 'x' }],
          then: [{ service: 'cover.close_cover', entity_id: 'cover.living' }],
          else: [{ choose: [{ conditions: [], sequence: [{ action: 'script.goodnight' }] }] }],
        },
        { repeat: { while: [], sequence: [{ scene: 'scene.evening' }] } },
        {
          action: 'notify.mobile',
          data: { message: '{{ states.sensor.lux.state }} lux' },
        },
      ],
    });
    expect(refs).toContainEqual({ entityId: 'input_boolean.night', role: 'template' });
    expect(refs).toContainEqual({ entityId: 'sensor.lux', role: 'condition' });
    expect(refs).toContainEqual({
      entityId: 'cover.living',
      role: 'action',
      service: 'cover.close_cover',
    });
    expect(refs).toContainEqual({
      entityId: 'script.goodnight',
      role: 'action',
      service: 'script.turn_on',
    });
    expect(refs).toContainEqual({
      entityId: 'scene.evening',
      role: 'action',
      service: 'scene.turn_on',
    });
    expect(refs).toContainEqual({ entityId: 'sensor.lux', role: 'template' });
  });

  it('reads script sequences', () => {
    expect(
      collectReferences({
        sequence: [{ action: 'light.turn_off', target: { entity_id: 'light.hall' } }],
      })
    ).toEqual([{ entityId: 'light.hall', role: 'action', service: 'light.turn_off' }]);
  });
});

describe('templateEntityIds', () => {
  it('ignores plain strings and notify targets', () => {
    expect(templateEntityIds('light.hall')).toEqual([]);
    expect(templateEntityIds("{{ states('sensor.lux') | int }} {{ 'notify.x' }}")).toEqual([
      'sensor.lux',
    ]);
  });
});

describe('areOppositeServices', () => {
  it('matches opposite pairs across domains', () => {
    expect(areOppositeServices('light.turn_on', 'light.turn_off')).toBe(true);
    expect(areOppositeServices('cover.close_cover', 'cover.open_cover')).toBe(true);
    expect(areOppositeServices('light.turn_on', 'light.toggle')).toBe(false);
  });
});

describe('buildDependencyMap', () => {
  const map = buildDependencyMap(
    [
      automation('presence', {
        triggers: [{ trigger: 'state', entity_id: 'binary_sensor.motion' }],
        actions: [{ action: 'light.turn_on', target: { entity_id: 'light.hall' } }],
      }),
      automation('goodnight', {
        triggers: [{ trigger: 'state', entity_id: 'input_boolean.night' }],
        actions: [
          { action: 'light.turn_off', target: { entity_id: 'light.hall' } },
          { action: 'script.goodnight' },
        ],
      }),
      automation('chain', {
        triggers: [{ trigger: 'state', entity_id: 'light.hall' }],
        actions: [
          { action: 'light.turn_on', target: { entity_id: 'light.hall' } },
          { action: 'light.turn_on', target: { entity_id: 'light.renamed_away' } },
        ],
      }),
    ],
    exists
  );

  it('indexes where each entity is used', () => {
    expect(map.usage['light.hall']?.map((u) => `${u.item}:${u.role}`)).toEqual([
      'automation.presence:action',
      'automation.goodnight:action',
      'automation.chain:trigger',
      'automation.chain:action',
    ]);
  });

  it('finds chains between items', () => {
    expect(map.chains).toContainEqual({
      from: 'automation.presence',
      to: 'automation.chain',
      via: 'light.hall',
    });
    expect(map.chains).toContainEqual({
      from: 'automation.goodnight',
      to: 'automation.chain',
      via: 'light.hall',
    });
  });

  it('flags opposite control and self-triggering', () => {
    expect(map.conflicts).toEqual([
      {
        entityId: 'light.hall',
        a: { item: 'automation.presence', service: 'light.turn_on' },
        b: { item: 'automation.goodnight', service: 'light.turn_off' },
      },
      {
        entityId: 'light.hall',
        a: { item: 'automation.goodnight', service: 'light.turn_off' },
        b: { item: 'automation.chain', service: 'light.turn_on' },
      },
    ]);
    expect(map.selfTriggers).toEqual([{ item: 'automation.chain', entityId: 'light.hall' }]);
  });

  it('reports references to unknown entities once per item', () => {
    expect(map.missing).toEqual([
      { item: 'automation.chain', entityId: 'light.renamed_away', role: 'action' },
    ]);
  });
});
