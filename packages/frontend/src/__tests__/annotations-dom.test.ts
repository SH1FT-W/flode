// @vitest-environment happy-dom
/**
 * Notes and frames as real elements: drawn behind and over the cards, picked,
 * deleted with the keyboard, and dragged with their cards.
 */
import type { FlowGraph } from '@flode/shared';
import { afterEach, describe, expect, it } from 'vitest';
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

function layer(canvas: FlodeCanvas, kind: 'frames' | 'notes'): HTMLElement {
  const el = [...(canvas.shadowRoot?.querySelectorAll('flode-annotations') ?? [])].find(
    (e) => (e as unknown as { kind: string }).kind === kind
  );
  if (!(el instanceof HTMLElement)) throw new Error(`no ${kind} layer`);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('notes and frames in the DOM', () => {
  it('draws the frame under the lines and the note over the cards', async () => {
    const canvas = await mount();
    const order = [...(canvas.shadowRoot?.querySelector('.viewport')?.children ?? [])].map((c) =>
      c.tagName === 'FLODE-ANNOTATIONS' ? (c as unknown as { kind: string }).kind : c.tagName
    );
    expect(order[0]).toBe('frames');
    expect(order.indexOf('svg')).toBe(1);
    expect(order.at(-1)).toBe('notes');
    await (layer(canvas, 'notes') as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;
    expect(layer(canvas, 'notes').shadowRoot?.textContent).toContain('Let op');
    await (layer(canvas, 'frames') as unknown as { updateComplete: Promise<unknown> })
      .updateComplete;
    expect(layer(canvas, 'frames').shadowRoot?.textContent).toContain('Licht');
  });

  it('deletes the picked note with Delete', async () => {
    const canvas = await mount();
    canvas.selectAnnotation('note_1');
    await canvas.updateComplete;
    let next: FlowGraph | null = null;
    canvas.addEventListener('graph-change', (e) => {
      next = (e as CustomEvent).detail.graph;
    });
    canvas.shadowRoot
      ?.querySelector('.pane')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect((next as FlowGraph | null)?.notes).toEqual([]);
    expect((next as FlowGraph | null)?.frames).toHaveLength(1);
  });

  it('keeps Delete in a text field for the text', async () => {
    const canvas = await mount();
    canvas.selectAnnotation('note_1', true);
    await canvas.updateComplete;
    await new Promise((r) => setTimeout(r));
    const notes = layer(canvas, 'notes');
    await (notes as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const field = notes.shadowRoot?.querySelector('textarea');
    expect(field).toBeTruthy();
    let next: FlowGraph | null = null;
    canvas.addEventListener('graph-change', (e) => {
      next = (e as CustomEvent).detail.graph;
    });
    field?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, composed: true })
    );
    expect(next).toBeNull();
  });
});
