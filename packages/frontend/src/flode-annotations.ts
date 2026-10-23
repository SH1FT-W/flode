import type { AnnotationColor, FlowGraph } from '@flode/shared';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import {
  type Annotation,
  COLORS,
  type Corner,
  findAnnotation,
  frameMembers,
  isFrame,
  isNote,
  moveAnnotation,
  moveFrame,
  resizeAnnotation,
  resizedBox,
  setColor,
  setText,
  snapToGrid,
  textOf,
  tintOf,
} from './annotations';
import { defineElement } from './define-element';
import type { ColorPick } from './flode-swatches';
import './flode-swatches';
import { moveSelection, positionsOf } from './selection';
import { t } from './strings';

export type AnnotationLayerKind = 'frames' | 'notes';

export interface AnnotationMenuDetail {
  id: string;
  clientX: number;
  clientY: number;
}

/** A pointer gesture on an annotation: a move or a resize, with what to restore if it is cancelled. */
interface Gesture {
  id: string;
  pointerId: number;
  start: { x: number; y: number };
  box: { x: number; y: number; width: number; height: number };
  corner: Corner | null;
  original: FlowGraph;
  members?: ReturnType<typeof frameMembers>;
  /** The note was picked from a selection: all of it moves. */
  group?: ReturnType<typeof positionsOf>;
  moved: boolean;
}

const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];
/** Flow units a pointer must travel before a press is a move and no click. */
const CLICK_DISTANCE = 4;

/**
 * Notes (free text) and frames (a titled box behind cards) on the canvas.
 * One layer per kind: the frames sit under the lines and cards, the notes over
 * them. The layer renders them from `graph` and turns pointer input into the
 * pure edits of `annotations.ts`; the canvas applies the previews and commits.
 */
export class FlodeAnnotations extends LitElement {
  static properties = {
    kind: { attribute: false },
    graph: { attribute: false },
    zoom: { attribute: false },
    selectedId: { attribute: false },
    multiIds: { attribute: false },
    language: { attribute: false },
    editing: { state: true },
  };

  declare kind: AnnotationLayerKind;
  declare graph: FlowGraph;
  declare zoom: number;
  declare selectedId: string | null;
  /** Cards and notes picked together; a note among them moves them all. */
  declare multiIds: string[];
  declare language: string;
  declare editing: string | null;
  private gesture: Gesture | null = null;

  constructor() {
    super();
    this.kind = 'notes';
    this.zoom = 1;
    this.selectedId = null;
    this.multiIds = [];
    this.language = 'en';
    this.editing = null;
  }

  /** Puts the text of `id` in an input, as after "add note". */
  edit(id: string): void {
    this.editing = id;
  }

  protected updated(changed: PropertyValues<this>): void {
    if (!changed.has('editing') || !this.editing) return;
    const field = this.renderRoot.querySelector<HTMLTextAreaElement | HTMLInputElement>('.field');
    field?.focus();
    field?.select();
  }

  private items(): readonly Annotation[] {
    return (this.kind === 'notes' ? this.graph?.notes : this.graph?.frames) ?? [];
  }

  private emit(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  // ---- gestures ------------------------------------------------------------

  private begin(event: PointerEvent, item: Annotation, corner: Corner | null): void {
    if (event.button !== 0 || this.gesture || this.editing === item.id) return;
    event.preventDefault();
    event.stopPropagation();
    // Shift adds a note to the selection, Ctrl takes it out; neither starts a move.
    const mode = event.ctrlKey || event.metaKey ? 'remove' : event.shiftKey ? 'add' : null;
    if (mode && !corner) {
      this.emit('annotation-multi', { id: item.id, mode });
      return;
    }
    if (event.currentTarget instanceof Element)
      event.currentTarget.setPointerCapture(event.pointerId);
    const inSelection = !corner && this.multiIds.length > 1 && this.multiIds.includes(item.id);
    // A note of a selection keeps the selection; a click on it (no move) narrows to it.
    if (!inSelection) this.emit('annotation-select', { id: item.id });
    this.gesture = {
      group: inSelection ? positionsOf(this.graph, this.multiIds) : undefined,
      id: item.id,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      box: { x: item.x, y: item.y, width: item.width, height: item.height },
      corner,
      original: this.graph,
      // Taken now: what a frame carries is what lies in it when it is picked up.
      members: isFrame(item) && !corner ? frameMembers(this.graph, item) : undefined,
      moved: false,
    };
  }

  private onMove(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = (event.clientX - gesture.start.x) / this.zoom;
    const dy = (event.clientY - gesture.start.y) / this.zoom;
    if (!gesture.moved && Math.hypot(dx, dy) < CLICK_DISTANCE) return;
    gesture.moved = true;
    this.emit('graph-preview', { graph: this.applied(gesture, dx, dy, false) });
  }

  /** The original graph with `gesture` applied for a pointer travel of (`dx`, `dy`). */
  private applied(gesture: Gesture, dx: number, dy: number, final: boolean): FlowGraph {
    const round = final ? snapToGrid : (v: number) => v;
    const graph = gesture.original;
    if (gesture.corner) {
      const box = resizedBox(gesture.box, gesture.corner, dx, dy);
      return resizeAnnotation(graph, gesture.id, {
        x: round(box.x),
        y: round(box.y),
        width: round(box.width),
        height: round(box.height),
      });
    }
    const x = round(gesture.box.x + dx);
    const y = round(gesture.box.y + dy);
    if (gesture.group)
      return moveSelection(graph, gesture.group, x - gesture.box.x, y - gesture.box.y);
    const members = gesture.members;
    if (!members) return moveAnnotation(graph, gesture.id, x, y);
    // The frame carries its cards and notes by the same (snapped) distance.
    const shiftX = x - gesture.box.x;
    const shiftY = y - gesture.box.y;
    const at = (ids: string[], list: { id: string; x: number; y: number }[]) =>
      new Map(list.filter((p) => ids.includes(p.id)).map((p) => [p.id, { x: p.x, y: p.y }]));
    return moveFrame(
      graph,
      gesture.id,
      {
        frame: gesture.box,
        nodes: at(
          members.nodes,
          graph.nodes.map((n) => ({ id: n.id, ...n.position }))
        ),
        notes: at(members.notes, graph.notes ?? []),
      },
      shiftX,
      shiftY
    );
  }

  private onUp(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.gesture = null;
    if (!gesture.moved) {
      if (gesture.group) this.emit('annotation-select', { id: gesture.id });
      return;
    }
    const dx = (event.clientX - gesture.start.x) / this.zoom;
    const dy = (event.clientY - gesture.start.y) / this.zoom;
    this.emit('graph-change', { graph: this.applied(gesture, dx, dy, true) });
  }

  private onCancel(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.gesture = null;
    if (gesture.moved) this.emit('graph-preview', { graph: gesture.original });
  }

  private onContextMenu(event: MouseEvent, item: Annotation): void {
    event.preventDefault();
    event.stopPropagation();
    this.emit('annotation-select', { id: item.id });
    this.emit('annotation-menu', {
      id: item.id,
      clientX: event.clientX,
      clientY: event.clientY,
    } satisfies AnnotationMenuDetail);
  }

  // ---- text ----------------------------------------------------------------

  private commitText(id: string, value: string): void {
    this.editing = null;
    const current = findAnnotation(this.graph, id);
    if (current && textOf(current) !== value) {
      this.emit('graph-change', { graph: setText(this.graph, id, value) });
    }
    this.emit('annotation-edited', { id });
  }

  private onFieldKey(event: KeyboardEvent, item: Annotation): void {
    // Keys of the field are the field's: no shortcut, no delete of the card behind it.
    event.stopPropagation();
    const field = event.currentTarget;
    if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)) return;
    if (event.key === 'Escape') {
      field.value = textOf(item);
      field.blur();
    } else if (event.key === 'Enter' && isFrame(item)) {
      // A frame's title is one line.
      event.preventDefault();
      field.blur();
    }
  }

  private renderField(item: Annotation) {
    const value = textOf(item);
    const onBlur = (e: FocusEvent) => {
      const field = e.target;
      if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)
        this.commitText(item.id, field.value);
    };
    return isNote(item)
      ? html`<textarea
          class="field"
          .value=${value}
          placeholder=${t(this.language, 'notePlaceholder')}
          @blur=${onBlur}
          @keydown=${(e: KeyboardEvent) => this.onFieldKey(e, item)}
          @pointerdown=${(e: Event) => e.stopPropagation()}
        ></textarea>`
      : html`<input
          class="field"
          .value=${value}
          placeholder=${t(this.language, 'framePlaceholder')}
          @blur=${onBlur}
          @keydown=${(e: KeyboardEvent) => this.onFieldKey(e, item)}
          @pointerdown=${(e: Event) => e.stopPropagation()}
        />`;
  }

  // ---- render --------------------------------------------------------------

  /** The colours to pick from, above the picked note or frame; the wheel previews while it moves. */
  private renderSwatches(item: Annotation) {
    return html`<flode-swatches
      class="swatches"
      .current=${item.color ?? (this.kind === 'notes' ? 'yellow' : 'blue')}
      .language=${this.language}
      @color-pick=${(e: CustomEvent<ColorPick>) => {
        e.stopPropagation();
        const graph = setColor(this.graph, item.id, e.detail.color ?? COLORS[0]);
        this.emit(e.detail.final ? 'graph-change' : 'graph-preview', { graph });
      }}
    ></flode-swatches>`;
  }

  private renderHandles(item: Annotation) {
    return CORNERS.map(
      (corner) =>
        html`<span
          class="handle ${corner}"
          @pointerdown=${(e: PointerEvent) => this.begin(e, item, corner)}
        ></span>`
    );
  }

  private renderItem(item: Annotation) {
    const selected = this.selectedId === item.id;
    const inMulti = this.multiIds.includes(item.id);
    const editing = this.editing === item.id;
    const fallback: AnnotationColor = this.kind === 'notes' ? 'yellow' : 'blue';
    const color = item.color ?? fallback;
    const box = `left:${item.x}px;top:${item.y}px;width:${item.width}px;height:${item.height}px;--tint:${tintOf(color, fallback)}`;
    if (isNote(item)) {
      const note = item;
      return html`<div
        class="note ${selected || inMulti ? 'selected' : ''}"
        style=${box}
        @pointerdown=${(e: PointerEvent) => this.begin(e, note, null)}
        @dblclick=${() => this.edit(note.id)}
        @contextmenu=${(e: MouseEvent) => this.onContextMenu(e, note)}
      >
        ${editing ? this.renderField(note) : html`<div class="text">${note.text || html`<span class="empty">${t(this.language, 'notePlaceholder')}</span>`}</div>`}
        ${selected ? this.renderSwatches(note) : nothing} ${selected ? this.renderHandles(note) : nothing}
      </div>`;
    }
    const frame = item;
    return html`<div class="frame ${selected || inMulti ? 'selected' : ''}" style=${box}>
      <div
        class="title"
        @pointerdown=${(e: PointerEvent) => this.begin(e, frame, null)}
        @dblclick=${() => this.edit(frame.id)}
        @contextmenu=${(e: MouseEvent) => this.onContextMenu(e, frame)}
      >
        ${editing ? this.renderField(frame) : html`<span>${frame.title || html`<span class="empty">${t(this.language, 'framePlaceholder')}</span>`}</span>`}
      </div>
      ${selected ? this.renderSwatches(frame) : nothing} ${selected ? this.renderHandles(frame) : nothing}
    </div>`;
  }

  render() {
    return html`<div
      class="layer"
      @pointermove=${this.onMove}
      @pointerup=${this.onUp}
      @pointercancel=${this.onCancel}
    >
      ${this.items().map((item) => this.renderItem(item))}
    </div>`;
  }

  static styles = css`
    :host {
      position: absolute;
      left: 0;
      top: 0;
      width: 0;
      height: 0;
      overflow: visible;
      pointer-events: none;
    }
    .note,
    .frame {
      position: absolute;
      box-sizing: border-box;
      border-radius: 10px;
      border: 1px solid rgba(var(--tint), 0.7);
    }
    .note {
      pointer-events: auto;
      background: rgba(var(--tint), 0.28);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
      padding: 10px 12px;
      cursor: grab;
      user-select: none;
      color: var(--primary-text-color);
    }
    .note .text {
      white-space: pre-wrap;
      overflow: hidden;
      height: 100%;
      font-size: 14px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }
    .frame {
      /* The body lets clicks through to the pane and the cards; only the title bar picks the frame up. */
      pointer-events: none;
      background: rgba(var(--tint), 0.12);
      border-width: 2px;
    }
    .frame .title {
      pointer-events: auto;
      cursor: grab;
      user-select: none;
      height: 34px;
      box-sizing: border-box;
      padding: 0 12px;
      display: flex;
      align-items: center;
      font-weight: 500;
      font-size: 15px;
      color: var(--primary-text-color);
      background: rgba(var(--tint), 0.3);
      border-radius: 8px 8px 0 0;
      white-space: nowrap;
      overflow: hidden;
    }
    .empty {
      opacity: 0.5;
      font-style: italic;
    }
    .selected {
      outline: 2px solid var(--primary-color);
      outline-offset: 1px;
    }
    .field {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      font: inherit;
      color: var(--primary-text-color);
      background: var(--card-background-color);
      border: 1px solid var(--primary-color);
      border-radius: 6px;
      padding: 4px 6px;
      resize: none;
      outline: none;
      pointer-events: auto;
    }
    input.field {
      height: 26px;
    }
    .swatches {
      position: absolute;
      left: 0;
      top: -34px;
    }
    .handle {
      position: absolute;
      width: 12px;
      height: 12px;
      box-sizing: border-box;
      background: var(--card-background-color);
      border: 2px solid var(--primary-color);
      border-radius: 3px;
      pointer-events: auto;
    }
    .handle.nw {
      left: -7px;
      top: -7px;
      cursor: nwse-resize;
    }
    .handle.ne {
      right: -7px;
      top: -7px;
      cursor: nesw-resize;
    }
    .handle.sw {
      left: -7px;
      bottom: -7px;
      cursor: nesw-resize;
    }
    .handle.se {
      right: -7px;
      bottom: -7px;
      cursor: nwse-resize;
    }
  `;
}

defineElement('flode-annotations', FlodeAnnotations);

declare global {
  interface HTMLElementTagNameMap {
    'flode-annotations': FlodeAnnotations;
  }
}
