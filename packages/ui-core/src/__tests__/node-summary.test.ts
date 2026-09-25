import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { coreResources } from '../locales';
import {
  formatClockTime,
  humanizeDuration,
  type SummaryContext,
  summarizeAction,
  summarizeCondition,
  summarizeDelay,
  summarizeServiceAction,
  summarizeServiceData,
  summarizeTrigger,
  summarizeVariables,
  summarizeWait,
} from '../node-summary';

const NAMESPACES: ['nodes', 'common'] = ['nodes', 'common'];

const i18n = i18next.createInstance();
await i18n.init({
  resources: coreResources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: NAMESPACES,
  interpolation: { escapeValue: false },
});

const FRIENDLY_NAMES: Record<string, string> = {
  'light.bed_light': 'Bettlicht',
  'light.ceiling_lights': 'Deckenlicht',
  'zone.home': 'Zuhause',
  'person.daniel': 'Daniel',
};

function makeContext(lang: 'de' | 'en' = 'de'): SummaryContext {
  return {
    t: i18n.getFixedT(lang, NAMESPACES),
    entityName: (id) => FRIENDLY_NAMES[id] ?? id,
    stateLabel: (_id, state) => ({ on: 'An', off: 'Aus' })[state] ?? state,
    serviceLabel: (service) => ({ 'light.turn_on': 'Einschalten' })[service] ?? service,
    domainLabel: (domain) => ({ light: 'Licht' })[domain] ?? domain,
    deviceName: (id) => (id === 'dev1' ? 'Flur-Taster' : null),
    areaName: (id) => (id === 'kueche' ? 'Küche' : null),
    platformLabel: (_kind, type) =>
      ({ 'light.turned_on': 'Leuchte eingeschaltet', 'light.is_on': 'Leuchte an' })[type] ?? type,
    targetSummary: (target) =>
      typeof target === 'object' && target !== null && 'area_id' in target
        ? '1 Bereich'
        : 'Bettlicht',
    blockLabel: (type) => i18n.getFixedT(lang, NAMESPACES)(`nodes:blocks.${type}`),
  };
}

describe('formatClockTime', () => {
  it('drops zero seconds', () => {
    expect(formatClockTime('06:00:00')).toBe('06:00');
    expect(formatClockTime('6:30')).toBe('06:30');
  });
  it('keeps non-zero seconds and leaves non-times alone', () => {
    expect(formatClockTime('06:00:15')).toBe('06:00:15');
    expect(formatClockTime('input_datetime.wecker')).toBe('input_datetime.wecker');
  });
});

describe('humanizeDuration', () => {
  const t = i18n.getFixedT('de', NAMESPACES);
  it('handles HH:MM:SS strings', () => {
    expect(humanizeDuration('00:00:05', t)).toBe('5 Sekunden');
    expect(humanizeDuration('01:30:00', t)).toBe('1 Stunde 30 Minuten');
  });
  it('handles duration objects and numbers', () => {
    expect(humanizeDuration({ minutes: 1 }, t)).toBe('1 Minute');
    expect(humanizeDuration(90, t)).toBe('90 Sekunden');
  });
  it('passes templates through and ignores empty values', () => {
    expect(humanizeDuration('{{ states("input_number.x") }}', t)).toContain('{{');
    expect(humanizeDuration(undefined, t)).toBeUndefined();
    expect(humanizeDuration('', t)).toBeUndefined();
  });
});

describe('summarizeTrigger', () => {
  it('state trigger with target state reads as a sentence', () => {
    const summary = summarizeTrigger(
      { trigger: 'state', entity_id: 'light.bed_light', to: 'on' },
      makeContext()
    );
    expect(summary.title).toBe('Bettlicht wechselt zu An');
    expect(summary.kind).toBe('Zustandsänderung');
    expect(summary.entityId).toBe('light.bed_light');
  });

  it('state trigger without target state', () => {
    const summary = summarizeTrigger(
      { trigger: 'state', entity_id: 'light.bed_light' },
      makeContext('en')
    );
    expect(summary.title).toBe('Bettlicht changes');
  });

  it('multiple entities: count in title, names in detail, no live chip', () => {
    const summary = summarizeTrigger(
      { trigger: 'state', entity_id: ['light.bed_light', 'light.ceiling_lights'], to: 'off' },
      makeContext()
    );
    expect(summary.title).toBe('2 Entitäten wechseln zu off');
    expect(summary.detail).toContain('Bettlicht, Deckenlicht');
    expect(summary.entityId).toBeUndefined();
  });

  it('numeric_state between thresholds', () => {
    const summary = summarizeTrigger(
      { trigger: 'numeric_state', entity_id: 'sensor.temp', above: 20, below: 25 },
      makeContext()
    );
    expect(summary.title).toBe('sensor.temp zwischen 20 und 25');
  });

  it('time trigger formats the clock time', () => {
    expect(summarizeTrigger({ trigger: 'time', at: '07:00:00' }, makeContext()).title).toBe(
      'Um 07:00'
    );
  });

  it('sun trigger with offset', () => {
    const summary = summarizeTrigger(
      { trigger: 'sun', event: 'sunset', offset: '-00:30:00' },
      makeContext()
    );
    expect(summary.title).toBe('Bei Sonnenuntergang');
    expect(summary.detail).toBe('Versatz -00:30:00');
  });

  it('zone leave uses the zone friendly name', () => {
    const summary = summarizeTrigger(
      { trigger: 'zone', entity_id: 'person.daniel', zone: 'zone.home', event: 'leave' },
      makeContext()
    );
    expect(summary.title).toBe('Daniel verlässt Zuhause');
  });

  it('device trigger uses the device name', () => {
    const summary = summarizeTrigger(
      { trigger: 'device', device_id: 'dev1', type: 'remote_button_short_press' },
      makeContext()
    );
    expect(summary.title).toBe('Flur-Taster');
    expect(summary.detail).toBe('Remote button short press');
  });

  it('unknown platform falls back to a readable label', () => {
    expect(summarizeTrigger({ trigger: 'fancy_new' }, makeContext()).title).toBe('Fancy new');
  });
});

describe('target-based triggers and conditions (HA 2026.x)', () => {
  it("uses HA's type name as kind and the target as title", () => {
    const summary = summarizeTrigger(
      { trigger: 'light.turned_on', target: { entity_id: 'light.bed_light' } },
      makeContext()
    );
    expect(summary).toEqual({
      kind: 'Leuchte eingeschaltet',
      title: 'Bettlicht',
      entityId: 'light.bed_light',
    });
  });

  it('area targets get no live-state chip', () => {
    const summary = summarizeCondition(
      { condition: 'light.is_on', target: { area_id: 'kueche' } },
      makeContext()
    );
    expect(summary).toEqual({ kind: 'Leuchte an', title: '1 Bereich', entityId: undefined });
  });
});

describe('summarizeCondition', () => {
  it('time window', () => {
    const summary = summarizeCondition(
      { condition: 'time', after: '06:00:00', before: '22:00:00' },
      makeContext()
    );
    expect(summary.title).toBe('Zwischen 06:00 und 22:00');
  });

  it('state condition', () => {
    expect(
      summarizeCondition(
        { condition: 'state', entity_id: 'light.bed_light', state: 'on' },
        makeContext()
      ).title
    ).toBe('Bettlicht ist An');
  });

  it('groups get a plain-language title', () => {
    expect(summarizeCondition({ condition: 'or', conditions: [] }, makeContext()).title).toBe(
      'Mindestens eine trifft zu'
    );
  });

  it('trigger id condition', () => {
    expect(
      summarizeCondition({ condition: 'trigger', id: ['morgens', 'abends'] }, makeContext()).title
    ).toBe('Ausgelöst von morgens, abends');
  });
});

describe('actions and other steps', () => {
  it('service action with a single target: target is the title, service in detail', () => {
    const summary = summarizeServiceAction(
      {
        service: 'light.turn_on',
        target: { entity_id: 'light.ceiling_lights' },
        data: { brightness_pct: 60, transition: 2 },
      },
      makeContext()
    );
    expect(summary.kind).toBe('Licht');
    expect(summary.title).toBe('Deckenlicht');
    expect(summary.detail).toBe('Einschalten · brightness_pct: 60 · transition: 2');
    expect(summary.entityId).toBe('light.ceiling_lights');
  });

  it('service action without target: service is the title', () => {
    const summary = summarizeServiceAction({ service: 'notify.mobile_app' }, makeContext());
    expect(summary.title).toBe('notify.mobile_app');
    expect(summary.entityId).toBeUndefined();
  });

  it('service action targeting an area', () => {
    expect(
      summarizeServiceAction(
        { service: 'light.turn_on', target: { area_id: 'kueche' } },
        makeContext()
      ).title
    ).toBe('Küche');
  });

  it('service data is truncated after two entries', () => {
    const t = i18n.getFixedT('de', NAMESPACES);
    expect(summarizeServiceData({ a: 1, b: 2, c: 3, d: 4 }, t)).toBe('a: 1 · b: 2 · +2 weitere');
    expect(summarizeServiceData({}, t)).toBeUndefined();
  });

  it('delay, wait and variables', () => {
    const ctx = makeContext();
    expect(summarizeDelay({ delay: '00:00:05' }, ctx).title).toBe('5 Sekunden warten');
    expect(
      summarizeWait({ wait_template: '{{ is_state("x", "on") }}', timeout: '00:01:00' }, ctx)
    ).toEqual({
      title: 'Bis die Vorlage wahr ist',
      detail: '{{ is_state("x", "on") }} · Zeitlimit 1 Minute',
    });
    expect(summarizeVariables({ variables: { a: 1, b: 2 } }, ctx)).toEqual({
      title: '2 Variablen',
      detail: 'a, b',
    });
  });
});

describe('HA building blocks (kept as one block)', () => {
  const raw = (step: Record<string, unknown>) => summarizeAction({ _raw: step }, makeContext());

  it('names the block like HA and sums up what is inside', () => {
    expect(
      raw({
        if: [{ condition: 'state', entity_id: 'light.bed_light', state: 'on' }],
        then: [{ action: 'light.turn_off' }],
        else: [{ delay: 5 }, { delay: 5 }],
      })
    ).toMatchObject({ kind: 'Wenn-dann', detail: 'Dann 1 Aktion · Sonst 2 Aktionen' });
    expect(raw({ choose: [{}, {}], default: [{}] })).toEqual({
      kind: 'Auswählen',
      title: '2 Optionen',
      detail: 'mit Standard',
    });
    expect(raw({ repeat: { count: 3, sequence: [{}] } })).toEqual({
      kind: 'Wiederholen',
      title: '3× Wiederholen',
      detail: '1 Aktion',
    });
    expect(raw({ parallel: [{}, {}] })).toEqual({ kind: 'Parallel ausführen', title: '2 Zweige' });
  });
});
