// @vitest-environment happy-dom
/**
 * Notes and frames as real elements: drawn behind and over the cards, picked,
 * deleted with the keyboard, and dragged with their cards.
 */
import type { FlowGraph } from '@flode/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { FlodeAnnotations } from '../flode-annotations';
import { FlodeCanvas } from '../flode-canvas';

const graph: FlowGraph = {
  id: '00000000-0000-4000-8000-000000000002',
  version: 1,
  name: 'Annotations',
  nodes: [
    {
      id: 'trigger_1',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { trigger: 'state', entity_id: 'binary_sensor.movement', to: 'on' },
    },
  ],
  edges: [],
  metadata: { mode: 'single' },
  notes: [
    { id: 'note_1', x: 40, y: 200, width: 220, height: 120, text: 'Let op', color: 'yellow' },
  ],
  frames: [
    { id: 'frame_1', x: -40, y: -60, width: 400, height: 240, title: 'Licht', color: 'blue' },
  ],
};

async function mount(): Promise<FlodeCanvas> {
  const canvas = new FlodeCanvas();
  canvas.graph = graph;
  document.body.appendChild(canvas);
  await canvas.updateComplete;
  return canvas;
}

function layer(canvas: FlodeCanvas, kind: 'frames' | 'notes'): FlodeAnnotations {
  const found = [...(canvas.shadowRoot?.querySelectorAll('flode-annotations') ?? [])].find(
    (el) => el instanceof FlodeAnnotations && el.kind === kind
  );
  if (!(found instanceof FlodeAnnotations)) throw new Error(`no ${kind} layer`);
  return found;
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

afterEach(() => {
  document.body.innerHTML = '';
});

describe('notes and frames in the DOM', () => {
  it('draws the frame under the lines and the note over the cards', async () => {
    const canvas = await mount();
    const order = [...(canvas.shadowRoot?.querySelector('.viewport')?.children ?? [])].map((c) =>
      c instanceof FlodeAnnotations ? c.kind : c.tagName
    );
    expect(order[0]).toBe('frames');
    expect(order.indexOf('svg')).toBe(1);
    expect(order.at(-1)).toBe('notes');
    const notes = layer(canvas, 'notes');
    await notes.updateComplete;
    expect(notes.shadowRoot?.textContent).toContain('Let op');
    const frames = layer(canvas, 'frames');
    await frames.updateComplete;
    expect(frames.shadowRoot?.textContent).toContain('Licht');
  });

  it('deletes the picked note with Delete', async () => {
    const canvas = await mount();
    canvas.selectAnnotation('note_1');
    await canvas.updateComplete;
    const next = nextGraph(canvas, () =>
      canvas.shadowRoot
        ?.querySelector('.pane')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    );
    expect(next?.notes).toEqual([]);
    expect(next?.frames).toHaveLength(1);
  });

  it('keeps Delete in a text field for the text', async () => {
    const canvas = await mount();
    canvas.selectAnnotation('note_1', true);
    await canvas.updateComplete;
    await new Promise((resolve) => setTimeout(resolve));
    const notes = layer(canvas, 'notes');
    await notes.updateComplete;
    const field = notes.shadowRoot?.querySelector('textarea');
    expect(field).toBeTruthy();
    const next = nextGraph(canvas, () =>
      field?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, composed: true })
      )
    );
    expect(next).toBeNull();
  });

  it('asks the panel to delete a selection with Delete, and to clear it with Escape', async () => {
    const canvas = await mount();
    canvas.multiIds = ['trigger_1', 'note_1'];
    await canvas.updateComplete;
    const actions: unknown[] = [];
    canvas.addEventListener('selection-action', (event) => {
      if (event instanceof CustomEvent) actions.push(event.detail);
    });
    const pane = canvas.shadowRoot?.querySelector('.pane');
    pane?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    pane?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(actions).toEqual(['delete', 'clear']);
  });
});
