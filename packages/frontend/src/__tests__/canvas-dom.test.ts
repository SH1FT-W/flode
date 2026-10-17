// @vitest-environment happy-dom
/**
 * FLODE's canvas and palette as real elements in a DOM (happy-dom): the cards and
 * lines drawn for a graph, the branch cards of nested blocks, and the keyboard.
 */
import type { FlowGraph, FlowNode } from '@flode/shared';
import { getRawStep, SCRIPT_START_TRIGGER } from '@flode/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { branchCardId, branchView } from '../branch-view';
import { FlodeCanvas } from '../flode-canvas';
import { FlodePalette } from '../flode-palette';
import { t } from '../strings';

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

function graphOf(nodes: FlowNode[], edges: FlowGraph['edges']): FlowGraph {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    version: 1,
    name: 'Canvas test',
    nodes,
    edges,
    metadata: { mode: 'single' },
  };
}

const small = graphOf([trigger, action], [{ id: 'e1', source: 'trigger_1', target: 'action_1' }]);

/** A choose whose option holds an if block with a then step: branch cards two levels deep. */
const nestedChoose = {
  choose: [
    {
      conditions: [{ condition: 'state', entity_id: 'sun.sun', state: 'below_horizon' }],
      sequence: [
        {
          if: [{ condition: 'state', entity_id: 'light.kitchen', state: 'off' }],
          then: [{ action: 'light.turn_on', target: { entity_id: 'light.kitchen' } }],
          else: [{ action: 'light.turn_off', target: { entity_id: 'light.kitchen' } }],
        },
      ],
    },
  ],
  default: [{ action: 'notify.persistent_notification', data: { message: 'day' } }],
};
const withBlock = graphOf(
  [
    trigger,
    { id: 'block_1', type: 'action', position: { x: 360, y: 0 }, data: { _raw: nestedChoose } },
    { ...action, id: 'after_1', position: { x: 1200, y: 0 } },
  ],
  [
    { id: 'e1', source: 'trigger_1', target: 'block_1' },
    { id: 'e2', source: 'block_1', target: 'after_1' },
  ]
);

async function mountCanvas(graph: FlowGraph): Promise<FlodeCanvas> {
  const canvas = new FlodeCanvas();
  canvas.graph = graph;
  document.body.appendChild(canvas);
  await canvas.updateComplete;
  return canvas;
}

function cardIds(canvas: FlodeCanvas): string[] {
  return [...(canvas.shadowRoot?.querySelectorAll('.node[data-node-id]') ?? [])].flatMap((el) =>
    el instanceof HTMLElement && el.dataset.nodeId ? [el.dataset.nodeId] : []
  );
}

function pane(canvas: FlodeCanvas): HTMLElement {
  const el = canvas.shadowRoot?.querySelector('.pane');
  if (!(el instanceof HTMLElement)) throw new Error('canvas has no pane');
  return el;
}

/** The next graph the canvas hands to the panel, or null when it stays quiet. */
function nextGraph(canvas: FlodeCanvas, act: () => void): FlowGraph | null {
  let next: FlowGraph | null = null;
  canvas.addEventListener('graph-change', (event) => {
    if (event instanceof CustomEvent && event.detail && 'graph' in event.detail)
      next = event.detail.graph;
  });
  act();
  return next;
}

function press(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('canvas in the DOM', () => {
  it('draws a card for every node and a line for every connection', async () => {
    const canvas = await mountCanvas(small);
    expect(cardIds(canvas).sort()).toEqual(['action_1', 'trigger_1']);
    const edges = canvas.shadowRoot?.querySelectorAll('g.edge') ?? [];
    expect(edges.length).toBe(1);
    expect(edges[0].querySelector('path.edge-line')?.getAttribute('d')).toMatch(/^M\d/);
    // Every card shows a title (what the gate checks in the browser, here for one graph).
    for (const card of canvas.shadowRoot?.querySelectorAll('.node .title') ?? [])
      expect(card.textContent?.trim()).not.toBe('');
  });

  it('draws the steps of a block and of the block nested in it as branch cards', async () => {
    const canvas = await mountCanvas(withBlock);
    const ifBlock = branchCardId('block_1', ['choose', 0, 'sequence', 0]);
    const thenStep = branchCardId('block_1', ['choose', 0, 'sequence', 0, 'then', 0]);
    const elseStep = branchCardId('block_1', ['choose', 0, 'sequence', 0, 'else', 0]);
    const fallback = branchCardId('block_1', ['default', 0]);
    const ids = cardIds(canvas);
    expect(ids).toEqual(expect.arrayContaining([ifBlock, thenStep, elseStep, fallback]));
    // Exactly what the branch view says is drawn: one card per drawn node.
    const drawn = branchView(withBlock).graph.nodes.map((node) => node.id);
    expect([...ids].sort()).toEqual([...drawn].sort());
    for (const id of [ifBlock, thenStep, elseStep, fallback]) {
      const card = canvas.shadowRoot?.querySelector(`.node[data-node-id="${id}"]`);
      expect(card?.classList.contains('branch-step'), id).toBe(true);
    }
    // The lines into the branches and on to the step after the block are drawn too.
    expect(canvas.shadowRoot?.querySelectorAll('g.edge').length).toBeGreaterThanOrEqual(6);
  });

  it('removes the selected card on Backspace and hands the panel the new graph', async () => {
    const canvas = await mountCanvas(small);
    canvas.selectedId = 'action_1';
    await canvas.updateComplete;
    const next = nextGraph(canvas, () => press(pane(canvas), 'Backspace'));
    expect(next?.nodes.map((node) => node.id)).toEqual(['trigger_1']);
    expect(next?.edges).toEqual([]);
  });

  it('removes a branch card on Delete, out of its block', async () => {
    const canvas = await mountCanvas(withBlock);
    canvas.selectedId = branchCardId('block_1', ['default', 0]);
    await canvas.updateComplete;
    const next = nextGraph(canvas, () => press(pane(canvas), 'Delete'));
    // The only default step gone, the empty default goes with it.
    const block = next?.nodes.find((node) => node.id === 'block_1');
    expect(getRawStep(block?.data)).toEqual({ choose: nestedChoose.choose });
  });

  it('removes the selected connection on Backspace', async () => {
    const canvas = await mountCanvas(small);
    canvas.selectedEdgeId = 'e1';
    await canvas.updateComplete;
    const next = nextGraph(canvas, () => press(pane(canvas), 'Backspace'));
    expect(next?.edges).toEqual([]);
    expect(next?.nodes).toHaveLength(2);
  });

  it("never deletes a script's start card", async () => {
    const start: FlowNode = {
      ...trigger,
      id: 'start',
      data: { trigger: SCRIPT_START_TRIGGER },
    };
    const canvas = await mountCanvas(
      graphOf([start, action], [{ id: 'e1', source: 'start', target: 'action_1' }])
    );
    canvas.selectedId = 'start';
    await canvas.updateComplete;
    expect(nextGraph(canvas, () => press(pane(canvas), 'Backspace'))).toBeNull();
  });

  it('keeps editing keys away from Home Assistant (no bubbling past the canvas)', async () => {
    const canvas = await mountCanvas(small);
    canvas.selectedId = 'action_1';
    await canvas.updateComplete;
    let reachedWindow = false;
    window.addEventListener('keydown', () => {
      reachedWindow = true;
    });
    press(pane(canvas), 'Backspace');
    expect(reachedWindow).toBe(false);
  });
});

describe('palette in the DOM', () => {
  it('closes on Escape and tells the panel', async () => {
    const palette = new FlodePalette();
    palette.entries = [
      {
        id: 'tidy',
        group: 'commands',
        icon: 'mdi:broom',
        label: t('en', 'tidy'),
        run: () => undefined,
      },
    ];
    palette.open = true;
    document.body.appendChild(palette);
    await palette.updateComplete;
    let closed = 0;
    palette.addEventListener('closed', () => {
      closed += 1;
    });
    const body = palette.shadowRoot?.querySelector('.body');
    if (!body) throw new Error('palette has no body');
    press(body, 'Escape');
    expect(closed).toBe(1);
  });
});
