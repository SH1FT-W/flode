import type { FlowGraph } from '@flode/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  continuesStep,
  type EditorTab,
  HISTORY_COALESCE_MS,
  historySaveState,
  readTabs,
  settleSave,
  writeTabs,
} from '../tabs';

const graph: FlowGraph = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Flur',
  version: 1,
  nodes: [
    {
      id: 't',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { trigger: 'state', entity_id: 'light.a' },
    },
  ],
  edges: [],
};

const tab = (id: string, saveState: EditorTab['saveState']): EditorTab => ({
  id,
  flow: {
    item: {
      kind: 'automation',
      entityId: 'automation.flur',
      configId: id,
      name: 'Flur',
      enabled: true,
      lastTriggered: null,
    },
    graph,
    isNew: false,
    registryEntry: { entity_id: 'automation.flur', area_id: 'flur' },
  },
  past: [graph],
  future: [],
  saveState,
  selectedId: 't',
  viewport: { x: 1, y: 2, zoom: 0.5 },
});

describe('remembered tabs', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.assign(globalThis, {
      window: {
        localStorage: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => store.set(key, value),
        },
      },
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('restores tabs, the active one and unsaved changes — without undo history', () => {
    writeTabs(
      { tabs: [tab('a', 'saved'), tab('b', 'saving')], activeTabId: 'b', showHome: false },
      new Set()
    );
    const restored = readTabs();
    expect(restored?.activeTabId).toBe('b');
    expect(restored?.showHome).toBe(false);
    expect(restored?.tabs.map((t) => [t.id, t.saveState])).toEqual([
      ['a', 'saved'],
      ['b', 'unsaved'],
    ]);
    expect(restored?.tabs[1]?.past).toEqual([]);
    expect(restored?.tabs[1]?.viewport).toEqual({ x: 1, y: 2, zoom: 0.5 });
    expect(restored?.tabs[1]?.flow.registryEntry?.area_id).toBe('flur');
  });

  it('keeps the drafts another window wrote, but not tabs this window closed', () => {
    // Window A remembers a draft, window B (which never had it) writes its own tabs.
    writeTabs({ tabs: [tab('a', 'unsaved')], activeTabId: 'a', showHome: false }, new Set(['a']));
    writeTabs({ tabs: [tab('b', 'saved')], activeTabId: 'b', showHome: false }, new Set(['b']));
    expect(readTabs()?.tabs.map((t) => t.id)).toEqual(['b', 'a']);
    // Window A closes its draft: it is gone for good (B's saved tab has nothing to lose).
    writeTabs({ tabs: [], activeTabId: null, showHome: true }, new Set(['a']));
    expect(readTabs()?.tabs).toEqual([]);
  });

  it('drops saved tabs of other windows (nothing to lose) and reports a full storage', () => {
    writeTabs({ tabs: [tab('a', 'saved')], activeTabId: 'a', showHome: false }, new Set(['a']));
    writeTabs({ tabs: [], activeTabId: null, showHome: true }, new Set());
    expect(readTabs()?.tabs).toEqual([]);
    window.localStorage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    expect(
      writeTabs({ tabs: [tab('a', 'unsaved')], activeTabId: 'a', showHome: false }, new Set())
    ).toBe(false);
    window.localStorage.setItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    expect(writeTabs({ tabs: [], activeTabId: null, showHome: true }, new Set())).toBe(true);
  });

  it("doesn't overwrite another window's draft of a shared tab with an untouched copy", () => {
    // Window A (another page) left a draft of tab z; this window has z only as restored, saved.
    window.localStorage.setItem(
      'flode3.tabs',
      JSON.stringify({ tabs: [{ ...tab('z', 'unsaved'), writer: 'window-a' }], activeTabId: 'z' })
    );
    writeTabs({ tabs: [tab('z', 'saved')], activeTabId: 'z', showHome: false }, new Set(['z']));
    expect(readTabs()?.tabs.map((t) => [t.id, t.saveState])).toEqual([['z', 'unsaved']]);
    // This window's own draft, then saved: its own write wins.
    writeTabs({ tabs: [tab('z', 'unsaved')], activeTabId: 'z', showHome: false }, new Set(['z']));
    writeTabs({ tabs: [tab('z', 'saved')], activeTabId: 'z', showHome: false }, new Set(['z']));
    expect(readTabs()?.tabs.map((t) => [t.id, t.saveState])).toEqual([['z', 'saved']]);
  });

  it('restores one tab per automation, the draft before a saved copy', () => {
    const copy = { ...tab('w2', 'unsaved'), flow: tab('w1', 'saved').flow };
    writeTabs(
      { tabs: [tab('w1', 'saved'), copy, tab('x', 'saved')], activeTabId: 'w1', showHome: false },
      new Set()
    );
    expect(readTabs()?.tabs.map((t) => [t.id, t.saveState])).toEqual([
      ['w2', 'unsaved'],
      ['x', 'saved'],
    ]);
  });

  it("remembers the version of HA's config a draft is based on", () => {
    const based = tab('a', 'unsaved');
    based.flow = { ...based.flow, haVersion: 'v1' };
    writeTabs({ tabs: [based], activeTabId: 'a', showHome: false }, new Set(['a']));
    expect(readTabs()?.tabs[0]?.flow.haVersion).toBe('v1');
  });

  it('drops broken entries and survives garbage', () => {
    window.localStorage.setItem(
      'flode3.tabs',
      JSON.stringify({ tabs: [{ id: 'x', flow: { item: {}, graph: {} } }], activeTabId: 'x' })
    );
    expect(readTabs()?.tabs).toEqual([]);
    window.localStorage.setItem('flode3.tabs', '{not json');
    expect(readTabs()).toBeNull();
  });
});

describe('a finished save', () => {
  const saved = { configId: 'a', entityId: 'automation.neu', registryEntry: null };
  const newFlow = {
    ...tab('a', 'saving').flow,
    isNew: true,
    item: { ...tab('a', 'saving').flow.item, entityId: '' },
  };

  it('marks the flow saved and no longer new', () => {
    const result = settleSave(newFlow, { graph, saved: { ...saved, haVersion: 'v2' } });
    expect(result.flow.haVersion).toBe('v2');
    expect(result.saveState).toBe('saved');
    expect(result.flow.isNew).toBe(false);
    expect(result.flow.item.entityId).toBe('automation.neu');
    expect(result.flow.graph).toBe(graph);
  });

  it('keeps edits made while saving unsaved', () => {
    const edited = { ...newFlow, graph: { ...graph, name: 'Flur 2' } };
    const result = settleSave(edited, { graph, saved });
    expect(result.saveState).toBe('unsaved');
    expect(result.flow.graph.name).toBe('Flur 2');
    expect(result.flow.isNew).toBe(false);
  });

  it('leaves another flow alone and stays unsaved when saving failed', () => {
    expect(settleSave(newFlow, { graph, saved: { ...saved, configId: 'b' } }).flow).toBe(newFlow);
    expect(settleSave(newFlow, null)).toEqual({ flow: newFlow, saveState: 'unsaved' });
  });
});

describe('undo steps while typing', () => {
  it('continues the step of the same card within a second, nothing else', () => {
    const last = { key: 'card:a', at: 1000 };
    expect(continuesStep(last, 'card:a', 1000 + HISTORY_COALESCE_MS - 1)).toBe(true);
    expect(continuesStep(last, 'card:a', 1000 + HISTORY_COALESCE_MS)).toBe(false);
    expect(continuesStep(last, 'card:b', 1100)).toBe(false);
    expect(continuesStep(last, undefined, 1100)).toBe(false);
    expect(continuesStep(null, 'card:a', 1100)).toBe(false);
  });
});

describe('undoing back to what HA has', () => {
  const flow = { ...tab('a', 'saved').flow, savedGraph: graph };
  const edited: FlowGraph = { ...graph, name: 'Flur 2' };

  it('is saved again only at the saved graph', () => {
    expect(historySaveState(flow, graph)).toBe('saved');
    expect(historySaveState(flow, edited)).toBe('unsaved');
  });

  it('stays unsaved for a new flow or pending area/labels', () => {
    expect(historySaveState({ ...flow, isNew: true }, graph)).toBe('unsaved');
    expect(historySaveState({ ...flow, registryUpdate: { area: 'x' } }, graph)).toBe('unsaved');
  });

  it('remembers the saved graph after a save', () => {
    const saved = { configId: 'a', entityId: 'automation.flur', registryEntry: null };
    expect(settleSave(flow, { graph: edited, saved }).flow.savedGraph).toBe(edited);
  });
});
