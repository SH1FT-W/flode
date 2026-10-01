import { describe, expect, it } from 'vitest';
import { collectServices } from '../dependency-map';
import { createdEntityIds, stepIssues } from '../step-issues';

const env = {
  hasService: (service: string) => ['light.turn_on', 'notify.notify'].includes(service),
  hasEntity: (entityId: string) => ['light.bed_light', 'person.julia'].includes(entityId),
};

describe('stepIssues', () => {
  it('reports a service Home Assistant does not have', () => {
    expect(
      stepIssues('action', { service: 'notify.gibt_es_nicht', data: { message: 'Test' } }, env)
    ).toEqual([{ kind: 'unknownService', service: 'notify.gibt_es_nicht' }]);
  });

  it('reports missing entities in triggers, conditions and targets', () => {
    expect(
      stepIssues('trigger', { trigger: 'state', entity_id: 'light.weg', to: 'on' }, env)
    ).toEqual([{ kind: 'missingEntity', entityId: 'light.weg' }]);
    expect(
      stepIssues('condition', { condition: 'state', entity_id: 'person.julia', state: 'home' }, env)
    ).toEqual([]);
    expect(
      stepIssues('action', { service: 'light.turn_on', target: { entity_id: 'light.weg' } }, env)
    ).toEqual([{ kind: 'missingEntity', entityId: 'light.weg' }]);
  });

  it('looks inside HA blocks', () => {
    const block = {
      _raw: {
        if: [{ condition: 'state', entity_id: 'light.bed_light', state: 'on' }],
        then: [{ action: 'script.gibt_es_nicht' }],
      },
    };
    expect(stepIssues('action', block, env).map((issue) => issue.kind)).toContain('unknownService');
  });

  it('event data is payload, not a service call', () => {
    expect(
      stepIssues('action', { event: 'my_event', event_data: { action: 'script.foo' } }, env)
    ).toEqual([]);
  });

  it('ignores templates and a correct step', () => {
    expect(
      stepIssues(
        'action',
        { service: '{{ "light.turn_" ~ mode }}', target: { entity_id: 'light.bed_light' } },
        env
      )
    ).toEqual([]);
    expect(
      stepIssues(
        'action',
        { service: 'notify.notify', data: { message: "{{ states('x.weg') }}" } },
        env
      )
    ).toEqual([]);
  });
});

describe('collectServices', () => {
  it('finds nested services but not values inside data', () => {
    expect(
      collectServices({
        choose: [{ conditions: [], sequence: [{ action: 'light.turn_on' }] }],
        default: [{ service: 'notify.notify', data: { action: 'not.a_service' } }],
      })
    ).toEqual(['light.turn_on', 'notify.notify']);
  });
});

describe('no false alarms', () => {
  it('a disabled step is never an issue', () => {
    expect(stepIssues('action', { service: 'notify.weg', enabled: false }, env)).toEqual([]);
  });

  it('repeat.for_each items are data', () => {
    expect(
      stepIssues(
        'action',
        {
          _raw: {
            repeat: {
              for_each: [{ action: 'cover.kueche_auf' }],
              sequence: [{ action: '{{ repeat.item.action }}' }],
            },
          },
        },
        env
      )
    ).toEqual([]);
  });

  it('a missing script is reported once', () => {
    expect(stepIssues('action', { service: 'script.alt_geloescht' }, env)).toEqual([
      { kind: 'unknownService', service: 'script.alt_geloescht' },
    ]);
  });

  it('entities the flow creates itself count as existing', () => {
    const created = createdEntityIds([
      { service: 'scene.create', data: { scene_id: 'vorher', snapshot_entities: [] } },
    ]);
    expect([...created]).toEqual(['scene.vorher']);
  });
});
