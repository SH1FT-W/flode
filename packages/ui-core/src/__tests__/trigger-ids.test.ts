import { describe, expect, it } from 'vitest';
import {
  cleanupUnusedGeneratedTriggerIds,
  getTriggerIdOptions,
  isGeneratedTriggerId,
  makeDuplicateTriggerIdsUnique,
  mapTriggerConditions,
  selectTriggerIds,
} from '../trigger-ids';

const GENERATED = /^generated-[A-Za-z0-9_-]{4}$/;

describe('getTriggerIdOptions', () => {
  it('lists leaf triggers in order, with candidates for missing IDs', () => {
    const triggers = [
      { trigger: 'state', entity_id: 'light.a', id: 'door' },
      {
        triggers: [
          { trigger: 'sun', event: 'sunset' },
          { trigger: 'time', at: '07:00' },
        ],
      },
    ];
    const options = getTriggerIdOptions(triggers);
    expect(options.map((o) => o.index)).toEqual([0, 1, 2]);
    expect(options[0]).toMatchObject({ id: 'door', draft: false, duplicate: false });
    expect(options[1]?.draft).toBe(true);
    expect(options[1]?.id).toMatch(GENERATED);
    expect(options[1]?.trigger).toBe(triggers[1]?.triggers?.[0]);
    expect(options[1]?.id).not.toBe(options[2]?.id);
  });

  it('marks shared IDs as duplicates', () => {
    const options = getTriggerIdOptions([
      { trigger: 'state', id: 'x' },
      { trigger: 'sun', id: 'x' },
      { trigger: 'time', id: 'y' },
    ]);
    expect(options.map((o) => o.duplicate)).toEqual([true, true, false]);
  });
});

describe('mapTriggerConditions', () => {
  it('finds trigger conditions at any depth and keeps untouched parts', () => {
    const step = {
      if: [{ condition: 'trigger', id: 'a' }],
      then: [{ action: 'light.turn_on', data: { message: '{{ trigger.id }}' } }],
    };
    const result = mapTriggerConditions(step, (c) => ({ ...c, id: 'b' })) as typeof step;
    expect(result.if[0]).toEqual({ condition: 'trigger', id: 'b' });
    expect(result.then).toBe(step.then);
    expect(mapTriggerConditions(step, (c) => c)).toBe(step);
  });

  it('reaches pass-through conditions stored under _raw', () => {
    const data = { condition: 'trigger', _raw: { condition: 'trigger', id: 'a' } };
    const result = mapTriggerConditions(data, (c) => ({ ...c, id: 'b' })) as typeof data;
    expect(result._raw.id).toBe('b');
  });
});

describe('selectTriggerIds', () => {
  it('stores the picked candidate on its trigger and sets the condition — in one result', () => {
    const triggers = [
      { trigger: 'state', id: 'door' },
      { trigger: 'sun', event: 'sunset' },
    ];
    const condition = { condition: 'trigger', id: '' };
    const flow = { triggers, steps: [condition] };
    const options = getTriggerIdOptions(triggers);
    const draft = options[1]?.id ?? '';
    const result = selectTriggerIds(flow, options, condition, ['door', draft]);
    expect(result.triggers[0]).toBe(triggers[0]);
    expect(result.triggers[1]).toEqual({ trigger: 'sun', event: 'sunset', id: draft });
    expect(result.steps[0]).toEqual({ condition: 'trigger', id: ['door', draft] });
  });

  it('only changes the condition object it was given', () => {
    const first = { condition: 'trigger', id: 'a' };
    const second = { condition: 'trigger', id: 'a' };
    const triggers = [
      { trigger: 'state', id: 'a' },
      { trigger: 'sun', id: 'b' },
    ];
    const flow = { triggers, steps: [{ conditions: [first, second] }] };
    const result = selectTriggerIds(flow, getTriggerIdOptions(triggers), second, ['b']);
    expect(result.steps[0]).toEqual({ conditions: [first, { condition: 'trigger', id: ['b'] }] });
  });

  it('drops generated IDs no condition refers to anymore', () => {
    const triggers = [{ trigger: 'state', id: 'generated-abcd' }];
    const condition = { condition: 'trigger', id: ['generated-abcd'] };
    const flow = { triggers, steps: [condition] };
    const result = selectTriggerIds(flow, getTriggerIdOptions(triggers), condition, []);
    expect(result.triggers).toEqual([{ trigger: 'state' }]);
    expect(result.steps).toEqual([{ condition: 'trigger', id: '' }]);
  });

  it('keeps generated IDs another condition still uses, and own IDs always', () => {
    const triggers = [
      { trigger: 'state', id: 'generated-abcd' },
      { trigger: 'sun', id: 'mine' },
    ];
    const edited = { condition: 'trigger', id: ['generated-abcd'] };
    const other = { condition: 'trigger', id: 'generated-abcd' };
    const result = selectTriggerIds(
      { triggers, steps: [edited, other] },
      getTriggerIdOptions(triggers),
      edited,
      []
    );
    expect(result.triggers).toBe(triggers);
  });
});

describe('cleanupUnusedGeneratedTriggerIds', () => {
  it('returns the flow itself when nothing is unused', () => {
    const flow = { triggers: [{ trigger: 'state', id: 'mine' }], steps: [] };
    expect(cleanupUnusedGeneratedTriggerIds(flow)).toBe(flow);
  });
});

describe('makeDuplicateTriggerIdsUnique', () => {
  it('splits a shared referenced ID and expands the references', () => {
    const flow = {
      triggers: [
        { trigger: 'state', id: 'x' },
        { trigger: 'sun', id: 'x' },
        { trigger: 'time', id: 'y' },
      ],
      steps: [{ choose: [{ conditions: [{ condition: 'trigger', id: 'x' }] }] }],
    };
    const result = makeDuplicateTriggerIdsUnique(flow);
    const [a, b, c] = result.triggers as { id: string }[];
    expect(isGeneratedTriggerId(a?.id)).toBe(true);
    expect(isGeneratedTriggerId(b?.id)).toBe(true);
    expect(a?.id).not.toBe(b?.id);
    expect(c).toBe(flow.triggers[2]);
    expect(result.steps[0]).toEqual({
      choose: [{ conditions: [{ condition: 'trigger', id: [a?.id, b?.id] }] }],
    });
  });

  it('removes a shared ID nothing refers to', () => {
    const flow = {
      triggers: [
        { trigger: 'state', id: 'x' },
        { trigger: 'sun', id: 'x' },
      ],
      steps: [],
    };
    expect(makeDuplicateTriggerIdsUnique(flow).triggers).toEqual([
      { trigger: 'state' },
      { trigger: 'sun' },
    ]);
  });

  it('returns the flow itself without duplicates', () => {
    const flow = { triggers: [{ trigger: 'state', id: 'x' }], steps: [] };
    expect(makeDuplicateTriggerIdsUnique(flow)).toBe(flow);
  });
});

describe('trigger IDs read by templates', () => {
  const template = { choose: [{ conditions: "{{ trigger.id == 'motion' }}", sequence: [] }] };

  it('Fix leaves a shared ID alone that a template reads', () => {
    const flow = {
      triggers: [
        { trigger: 'state', entity_id: 'binary_sensor.a', id: 'motion' },
        { trigger: 'state', entity_id: 'binary_sensor.b', id: 'motion' },
      ],
      steps: [template],
    };
    expect(makeDuplicateTriggerIdsUnique(flow)).toBe(flow);
  });

  it('a generated ID a template reads is not cleaned up', () => {
    const flow = {
      triggers: [{ trigger: 'state', entity_id: 'binary_sensor.a', id: 'generated-ab12' }],
      steps: [{ if: '{{ trigger.id == "generated-ab12" }}', then: [] }],
    };
    expect(cleanupUnusedGeneratedTriggerIds(flow)).toBe(flow);
  });
});

describe('trigger IDs read by automation variables', () => {
  it('Fix leaves a shared ID alone that a top-level variable reads', () => {
    const flow = {
      triggers: [
        { trigger: 'state', entity_id: 'binary_sensor.a', id: 'motion' },
        { trigger: 'state', entity_id: 'binary_sensor.b', id: 'motion' },
      ],
      steps: [{ condition: 'trigger', id: 'motion' }],
      templates: [{ room: "{{ 'kueche' if trigger.id == 'motion' else 'bad' }}" }],
    };
    expect(makeDuplicateTriggerIdsUnique(flow)).toBe(flow);
  });
});

describe('selectTriggerIds with an unknown condition', () => {
  it('changes nothing when the condition is not in the flow', () => {
    const flow = {
      triggers: [{ trigger: 'state', entity_id: 'binary_sensor.a' }],
      steps: [{ condition: 'trigger', id: '' }],
    };
    const options = getTriggerIdOptions(flow.triggers);
    const copy = { condition: 'trigger', id: '' };
    expect(selectTriggerIds(flow, options, copy, [options[0].id])).toBe(flow);
  });
});
