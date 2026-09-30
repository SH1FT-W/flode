import type { FlowGraph } from '@flode/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type EditorTab, readTabs, settleSave, writeTabs } from '../tabs';

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
    writeTabs({ tabs: [tab('a', 'saved'), tab('b', 'saving')], activeTabId: 'b', showHome: false });
    const restored = readTabs();
    expect(restored?.activeTabId).toBe('b');
    expect(restored?.showHome).toBe(false);
    expect(restored?.tabs.map((t) => [t.id, t.saveState, t.stale])).toEqual([
      ['a', 'saved', true],
      ['b', 'unsaved', false],
    ]);
    expect(restored?.tabs[1]?.past).toEqual([]);
    expect(restored?.tabs[1]?.viewport).toEqual({ x: 1, y: 2, zoom: 0.5 });
    expect(restored?.tabs[1]?.flow.registryEntry?.area_id).toBe('flur');
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
    const result = settleSave(newFlow, { graph, saved });
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
