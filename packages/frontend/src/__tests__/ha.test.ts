import { afterEach, describe, expect, it } from 'vitest';
import {
  type AutomationListItem,
  applyRegistryUpdate,
  configFingerprint,
  ensureAutomationEditors,
  type HomeAssistant,
  listScripts,
  newScriptId,
  sameFlow,
  syncScriptIds,
  usesBlueprint,
} from '../ha';

/** A `hass` with these entities that answers websocket calls with `ws`. */
function fakeHass(
  entityIds: string[],
  ws: (message: Record<string, unknown>) => unknown
): HomeAssistant {
  return {
    states: Object.fromEntries(
      entityIds.map((id) => [id, { entity_id: id, state: 'off', attributes: {} }])
    ),
    language: 'de',
    themes: { darkMode: false },
    localize: (key) => key,
    callApi: () => Promise.reject(new Error('no REST')),
    callWS: <T>(message: Record<string, unknown> & { type: string }) =>
      Promise.resolve(ws(message) as T),
  };
}

const item: AutomationListItem = {
  kind: 'automation',
  entityId: 'automation.flur',
  configId: '1',
  name: 'Flur',
  enabled: true,
  lastTriggered: null,
};

describe('sameFlow', () => {
  it('matches by kind and config id — renamed or re-read items included', () => {
    const renamed: AutomationListItem = { ...item, name: 'Flur neu', entityId: 'automation.neu' };
    expect(sameFlow(item, renamed)).toBe(true);
    expect(sameFlow(item, { ...item, kind: 'script' })).toBe(false);
    expect(sameFlow(item, { ...item, configId: '2' })).toBe(false);
    expect(sameFlow(item, undefined)).toBe(false);
  });
});

describe('usesBlueprint', () => {
  it('spots automations and scripts made from a blueprint', () => {
    expect(
      usesBlueprint({ alias: 'Bewegung', use_blueprint: { path: 'motion.yaml', input: {} } })
    ).toBe(true);
    expect(usesBlueprint({ alias: 'Flur', triggers: [], actions: [] })).toBe(false);
  });
});

describe('applyRegistryUpdate', () => {
  it("puts a script's category into the script scope", async () => {
    const sent: Record<string, unknown>[] = [];
    const hass = fakeHass([], (message) => sent.push(message));
    await applyRegistryUpdate(hass, 'script', 'script.flur', { category: 'c1', labels: ['l'] });
    await applyRegistryUpdate(hass, 'automation', 'automation.flur', { category: 'c2' });
    expect(sent.map((m) => m.categories)).toEqual([{ script: 'c1' }, { automation: 'c2' }]);
  });
});

describe('script config ids', () => {
  it('come from the registry once a script entity was renamed, and new ids avoid them', async () => {
    const hass = fakeHass(['script.flur', 'script.bad'], (message) =>
      message.type === 'config/entity_registry/get_entries'
        ? { 'script.flur': { unique_id: 'flur_licht' }, 'script.bad': null }
        : null
    );
    // Before the registry was read: the object id.
    expect(newScriptId(hass, 'Flur')).toBe('flur_2');
    expect(await syncScriptIds(hass)).toBe(true);
    expect(listScripts(hass).map((s) => [s.entityId, s.configId])).toEqual([
      ['script.bad', 'bad'],
      ['script.flur', 'flur_licht'],
    ]);
    // `Flur Licht` must not overwrite the renamed script, `Flur` is free as a config id
    // but `script.flur` is taken as an entity id.
    expect(newScriptId(hass, 'Flur Licht')).toBe('flur_licht_2');
    expect(newScriptId(hass, 'Flur')).toBe('flur_2');
    expect(newScriptId(hass, 'Küche')).toBe('kuche');
    // Nothing new to look up.
    expect(await syncScriptIds(hass)).toBe(false);
  });
});

describe('configFingerprint', () => {
  it('ignores key order and tells changed configs apart', () => {
    const a = { alias: 'Flur', triggers: [{ trigger: 'state', entity_id: 'light.a' }] };
    const reordered = { triggers: [{ entity_id: 'light.a', trigger: 'state' }], alias: 'Flur' };
    expect(configFingerprint(a)).toBe(configFingerprint(reordered));
    expect(configFingerprint(a)).not.toBe(configFingerprint({ ...a, alias: 'Flur 2' }));
  });
});

describe('ensureAutomationEditors', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'customElements');
  });

  it("doesn't keep a failed load forever", async () => {
    let defined = false;
    Object.assign(globalThis, {
      customElements: {
        get: () => (defined ? class {} : undefined),
        whenDefined: () => Promise.reject(new Error('not in HA')),
      },
    });
    expect(await ensureAutomationEditors(undefined)).toBe(false);
    defined = true;
    expect(await ensureAutomationEditors(undefined)).toBe(true);
  });
});
