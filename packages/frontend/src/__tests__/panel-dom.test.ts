// @vitest-environment happy-dom
/**
 * The panel as a real element in a DOM (happy-dom), without Home Assistant: a flow
 * opened as a draft, edits through the panel's own commands, the canvas it renders.
 */
import type { FlowGraph, FlowNode } from '@flode/shared';
import { SCRIPT_START_TRIGGER } from '@flode/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { cachedBranchView } from '../branch-view';
import { FlodePanel } from '../flode-panel';
import { NODE_HEIGHT, NODE_WIDTH } from '../flow-model';
import { isMac, shortcutKeys } from '../shortcuts';
import { t } from '../strings';
import type { OpenFlow } from '../tabs';

const trigger: FlowNode = {
  id: 'trigger_1',
  type: 'trigger',
  position: { x: 0, y: 0 },
  data: { trigger: 'state', entity_id: 'binary_sensor.movement', to: 'on' },
};
const action: FlowNode = {
  id: 'action_1',
  type: 'action',
  position: { x: 360, y: 0 },
  data: { action: 'light.turn_on', target: { entity_id: 'light.kitchen' } },
};

function draft(
  kind: 'automation' | 'script',
  nodes: FlowNode[],
  edges: FlowGraph['edges']
): OpenFlow {
  return {
    item: {
      kind,
      entityId: '',
      configId: 'draft',
      name: 'Draft',
      enabled: true,
      lastTriggered: null,
    },
    graph: {
      id: '00000000-0000-4000-8000-000000000002',
      version: 1,
      name: 'Draft',
      nodes,
      edges,
      metadata: { mode: 'single', ...(kind === 'script' ? { kind } : {}) },
    },
    isNew: true,
    registryEntry: null,
  };
}

async function mountPanel(flow: OpenFlow): Promise<FlodePanel> {
  const panel = new FlodePanel();
  document.body.appendChild(panel);
  await panel.updateComplete;
  // The welcome sheet of a first visit is a dialog: while it shows, shortcuts stay off.
  panel.welcome = null;
  panel['openTab'](flow);
  await panel.updateComplete;
  return panel;
}

function toasts(panel: FlodePanel): string[] {
  const messages: string[] = [];
  panel.addEventListener('hass-notification', (event) => {
    if (event instanceof CustomEvent && typeof event.detail?.message === 'string')
      messages.push(event.detail.message);
  });
  return messages;
}

function cardIds(panel: FlodePanel): string[] {
  const canvas = panel.shadowRoot?.querySelector('flode-canvas');
  return [...(canvas?.shadowRoot?.querySelectorAll('.node[data-node-id]') ?? [])].flatMap((el) =>
    el instanceof HTMLElement && el.dataset.nodeId ? [el.dataset.nodeId] : []
  );
}

/** A key as the user presses it, on the window (where HA and the panel listen). */
function pressOnWindow(key: string, mod = false): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      metaKey: mod && isMac(),
      ctrlKey: mod && !isMac(),
      bubbles: true,
      cancelable: true,
    })
  );
}

function requireGraph(panel: FlodePanel): FlowGraph {
  const graph = panel.flow?.graph;
  if (!graph) throw new Error('no flow open');
  return graph;
}

afterEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
});

describe('panel in the DOM', () => {
  it('opens a draft and renders its cards on the canvas', async () => {
    const panel = await mountPanel(
      draft(
        'automation',
        [trigger, action],
        [{ id: 'e1', source: 'trigger_1', target: 'action_1' }]
      )
    );
    expect(panel.flow?.graph.nodes).toHaveLength(2);
    expect(cardIds(panel).sort()).toEqual(['action_1', 'trigger_1']);
  });

  it('gives every duplicate its own id, also two in the same millisecond, and draws them', async () => {
    const panel = await mountPanel(
      draft(
        'automation',
        [trigger, action],
        [{ id: 'e1', source: 'trigger_1', target: 'action_1' }]
      )
    );
    panel['duplicateCard'](action);
    panel['duplicateCard'](action);
    panel['duplicateCard'](action);
    await panel.updateComplete;
    const ids = panel.flow?.graph.nodes.map((node) => node.id) ?? [];
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(cardIds(panel).sort()).toEqual([...ids].sort());
  });

  it('refuses a trigger pasted into a script and says why', async () => {
    const start: FlowNode = { ...trigger, id: 'start', data: { trigger: SCRIPT_START_TRIGGER } };
    const panel = await mountPanel(
      draft('script', [start, action], [{ id: 'e1', source: 'start', target: 'action_1' }])
    );
    const messages = toasts(panel);
    panel['pasteCard'](trigger);
    await panel.updateComplete;
    expect(messages).toEqual([t('en', 'pasteNoTriggerInScript')]);
    expect(panel.flow?.graph.nodes.map((node) => node.id)).toEqual(['start', 'action_1']);
    expect(cardIds(panel)).toEqual(['action_1']);
  });

  it('pastes a copied card into an automation under a new id', async () => {
    const panel = await mountPanel(
      draft(
        'automation',
        [trigger, action],
        [{ id: 'e1', source: 'trigger_1', target: 'action_1' }]
      )
    );
    panel['pasteCard'](action);
    await panel.updateComplete;
    const ids = panel.flow?.graph.nodes.map((node) => node.id) ?? [];
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it('closes the card menu on Escape', async () => {
    const panel = await mountPanel(
      draft(
        'automation',
        [trigger, action],
        [{ id: 'e1', source: 'trigger_1', target: 'action_1' }]
      )
    );
    panel.canvasMenu = {
      nodeId: 'action_1',
      clientX: 10,
      clientY: 10,
      position: { x: 0, y: 0 },
    };
    await panel.updateComplete;
    const menu = () => panel.shadowRoot?.querySelector('.work > ha-dropdown') ?? null;
    expect(menu()).not.toBeNull();
    // The entries carry their shortcut as a hint, "delete" the Backspace key (#32, #35).
    const hints = [...(menu()?.querySelectorAll('[slot="details"]') ?? [])].map((el) =>
      el.textContent?.trim()
    );
    expect(hints).toContain(shortcutKeys('delete'));
    pressOnWindow('Escape');
    await panel.updateComplete;
    expect(panel.canvasMenu).toBeNull();
    expect(menu()).toBeNull();
  });

  it('undoes a duplicate with the undo shortcut and redraws the canvas', async () => {
    const panel = await mountPanel(
      draft(
        'automation',
        [trigger, action],
        [{ id: 'e1', source: 'trigger_1', target: 'action_1' }]
      )
    );
    panel['duplicateCard'](action);
    await panel.updateComplete;
    expect(cardIds(panel)).toHaveLength(3);
    pressOnWindow('z', true);
    await panel.updateComplete;
    expect(panel.flow?.graph.nodes).toHaveLength(2);
    expect(cardIds(panel).sort()).toEqual(['action_1', 'trigger_1']);
  });

  it('puts a step added from the toolbar beside a selected branch card on a free spot', async () => {
    const block: FlowNode = {
      id: 'block_1',
      type: 'action',
      position: { x: 360, y: 0 },
      data: {
        _raw: {
          choose: [
            {
              conditions: [{ condition: 'trigger', id: 'a' }],
              sequence: [{ delay: { seconds: 5 } }, { action: 'light.turn_off' }],
            },
          ],
        },
      },
    };
    const panel = await mountPanel(
      draft('automation', [trigger, block], [{ id: 'e1', source: 'trigger_1', target: 'block_1' }])
    );
    const before = cachedBranchView(requireGraph(panel));
    const delayCard = [...before.cards.keys()][0];
    panel.selectedId = delayCard ?? null;
    // The user looks at the expanded choose: the middle of the view is on its branch cards.
    const branchCard = before.graph.nodes.find((n) => n.id === delayCard);
    const canvas = panel.shadowRoot?.querySelector('flode-canvas');
    if (!canvas || !branchCard) throw new Error('no canvas or branch card');
    Reflect.set(canvas, 'visibleCenter', () => branchCard.position);
    panel['onStepAdded'](
      'action',
      new CustomEvent('value-changed', { detail: { value: [{ action: 'light.toggle' }] } })
    );
    const graph = panel.flow?.graph;
    expect(graph?.nodes).toHaveLength(3);
    const drawn = cachedBranchView(requireGraph(panel)).graph.nodes;
    const added = drawn.find(
      (n) => !['trigger_1', 'block_1'].includes(n.id) && !before.cards.has(n.id)
    );
    expect(added).toBeDefined();
    const overlapping = drawn.filter(
      (n) =>
        n !== added &&
        added !== undefined &&
        Math.abs(n.position.x - added.position.x) < NODE_WIDTH &&
        Math.abs(n.position.y - added.position.y) < NODE_HEIGHT
    );
    expect(overlapping.map((n) => n.id)).toEqual([]);
  });

  it("keeps the browser's own save dialog away while a FLODE dialog is open", async () => {
    const panel = await mountPanel(draft('automation', [trigger], []));
    panel['paletteOpen'] = true;
    await panel.updateComplete;
    const save = new KeyboardEvent('keydown', {
      key: 's',
      metaKey: isMac(),
      ctrlKey: !isMac(),
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(save);
    expect(save.defaultPrevented).toBe(true);
  });
});
