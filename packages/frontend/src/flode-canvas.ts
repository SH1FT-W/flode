import type { FlowEdge, FlowGraph, FlowNode } from '@flode/shared';
import { isScriptStart } from '@flode/shared';
import {
  getBezierPath,
  getViewportForBounds,
  PanOnScrollMode,
  type PanZoomInstance,
  Position,
  pointToRendererPoint,
  type Viewport,
  XYMinimap,
  type XYMinimapInstance,
  XYPanZoom,
} from '@xyflow/system';
import { css, html, LitElement, nothing, type PropertyValues, svg } from 'lit';
import {
  connect,
  connectionError,
  graphBounds,
  handlePosition,
  hasTargetHandle,
  isDrawnEdge,
  moveNode,
  NODE_HEIGHT,
  NODE_WIDTH,
  removeEdge,
  removeNode,
  scriptEntryIds,
  sourceHandles,
  unionBounds,
  visibleGraph,
} from './flow-model';
import type { HomeAssistant } from './ha';
import { NODE_META, nodeEyebrow, nodeIcon, summarize } from './node-meta';
import { t } from './strings';
import type { RunMark } from './trace';
import { isNarrow } from './viewport';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.6;
/** Pointer travel (px) below which a press on a node counts as a click, not a drag. */
const CLICK_DISTANCE = 4;
const GRID = 20;

interface DragState {
  id: string;
  pointerId: number;
  startClient: { x: number; y: number };
  startPos: { x: number; y: number };
  moved: boolean;
}

interface ConnectState {
  pointerId: number;
  source: string;
  sourceHandle: string | null;
  /** Where the drag started — a short drag is a click on the handle, not a drop. */
  start: { x: number; y: number };
  cursor: { x: number; y: number };
}

/** "Add a card here": after a card's handle (+ button, dropped connection) and/or at a flow position. */
export interface AddAt {
  source?: string;
  sourceHandle?: string | null;
  position?: { x: number; y: number };
}

/** Right-click on a card (nodeId) or on the empty canvas (null). */
export interface CanvasMenuDetail {
  nodeId: string | null;
  clientX: number;
  clientY: number;
  /** Flow position of the click — where "add here" puts a card. */
  position: { x: number; y: number };
}

/** Flow units a connection must be dragged before dropping it on empty canvas offers a new card. */
const DROP_DISTANCE = 40;

/** Keeps receiving move/up events for this pointer even outside the element. */
function capturePointer(event: PointerEvent): void {
  // No native text selection / drag while moving cards or drawing connections —
  // the browser would cancel the pointer mid-gesture.
  event.preventDefault();
  if (event.currentTarget instanceof Element)
    event.currentTarget.setPointerCapture(event.pointerId);
}

function addNextLabel(language: string): string {
  return t(language, 'addNext');
}

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

/**
 * The flow canvas: HA-native (Lit, HA theme variables, `ha-icon`), with
 * pan/zoom from `@xyflow/system` — the framework-free core React Flow is
 * built on. Emits `graph-change` (whole new graph) and `select`.
 */
/** The overview in the corner (px). */
const MINIMAP_WIDTH = 180;
const NARROW_MIN_FIT_ZOOM = 0.55;
const MINIMAP_HEIGHT = 115;

export class FlodeCanvas extends LitElement {
  static properties = {
    graph: { attribute: false },
    hass: { attribute: false },
    selectedId: { attribute: false },
    runMarks: { attribute: false },
    activeRunNode: { attribute: false },
    minimap: { type: Boolean },
    viewport: { state: true },
    paneSize: { state: true },
    drag: { state: true },
    connecting: { state: true },
    selectedEdgeId: { state: true },
  };

  declare graph: FlowGraph;
  declare hass: HomeAssistant | undefined;
  declare selectedId: string | null;
  /** Cards of the run shown in the debug view (null = not debugging). */
  declare runMarks: Map<string, RunMark> | null;
  /** The card of the step picked in HA's timeline. */
  declare activeRunNode: string | null;
  declare viewport: Viewport;
  /** Overview in the corner. */
  declare minimap: boolean;
  declare paneSize: { width: number; height: number };
  declare drag: DragState | null;
  declare connecting: ConnectState | null;
  declare selectedEdgeId: string | null;

  private panZoom: PanZoomInstance | null = null;
  private minimapControl: XYMinimapInstance | null = null;
  /** Flow units per minimap pixel — XYMinimap needs it for dragging. */
  private minimapScale = 1;
  private resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (width !== this.paneSize.width || height !== this.paneSize.height) {
      this.paneSize = { width, height };
    }
  });

  constructor() {
    super();
    this.selectedId = null;
    this.viewport = { x: 0, y: 0, zoom: 1 };
    this.drag = null;
    this.connecting = null;
    this.selectedEdgeId = null;
    this.runMarks = null;
    this.activeRunNode = null;
    this.minimap = false;
    this.paneSize = { width: 0, height: 0 };
  }

  private get pane(): HTMLElement | null {
    return this.renderRoot.querySelector('.pane');
  }

  protected firstUpdated(): void {
    if (this.pane) this.resizeObserver.observe(this.pane);
    this.initPanZoom();
    this.fitView(false);
  }

  connectedCallback(): void {
    super.connectedCallback();
    // HA re-attaches panels when navigating back; the pane survives, pan/zoom must be rebuilt.
    if (this.hasUpdated && !this.panZoom) this.initPanZoom();
    if (this.pane) this.resizeObserver.observe(this.pane);
  }

  private initPanZoom(): void {
    const pane = this.pane;
    if (!pane || this.panZoom) return;
    this.panZoom = XYPanZoom({
      domNode: pane,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      viewport: this.viewport,
      translateExtent: [
        [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
        [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
      ],
      onDraggingChange: () => undefined,
      onPanZoom: (_event, viewport) => {
        this.viewport = viewport;
      },
    });
    this.panZoom.update({
      noWheelClassName: 'nowheel',
      noPanClassName: 'nopan',
      preventScrolling: true,
      panOnScroll: false,
      panOnDrag: true,
      panOnScrollMode: PanOnScrollMode.Free,
      panOnScrollSpeed: 0.5,
      userSelectionActive: false,
      zoomOnPinch: true,
      zoomOnScroll: true,
      zoomOnDoubleClick: false,
      zoomActivationKeyPressed: false,
      lib: 'flode',
      onTransformChange: ([x, y, zoom]) => {
        this.viewport = { x, y, zoom };
      },
      connectionInProgress: false,
      paneClickDistance: 0,
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
    this.minimapControl?.destroy();
    this.minimapControl = null;
    this.panZoom?.destroy();
    this.panZoom = null;
  }

  protected updated(changed: PropertyValues<this>): void {
    // A different flow was loaded (not just edited): frame it.
    const previous = changed.get('graph');
    if (previous && previous.id !== this.graph.id) this.fitView(false);
    this.syncMinimap(changed.has('paneSize') || changed.has('minimap'));
  }

  /** XYMinimap (xyflow's own drag/zoom behaviour) on the minimap svg. */
  private syncMinimap(sizeChanged: boolean): void {
    const element = this.renderRoot.querySelector('svg.minimap');
    if (!element || !this.panZoom) {
      this.minimapControl?.destroy();
      this.minimapControl = null;
      return;
    }
    const created = !this.minimapControl;
    if (!this.minimapControl) {
      this.minimapControl = XYMinimap({
        domNode: element,
        panZoom: this.panZoom,
        getTransform: () => [this.viewport.x, this.viewport.y, this.viewport.zoom],
        getViewScale: () => this.minimapScale,
      });
    }
    if (created || sizeChanged) {
      this.minimapControl.update({
        translateExtent: [
          [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
          [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
        ],
        width: this.paneSize.width,
        height: this.paneSize.height,
        pannable: true,
        zoomable: true,
        zoomStep: 10,
      });
    }
  }

  private renderMinimap(shown: FlowGraph | undefined) {
    const { width: paneWidth, height: paneHeight } = this.paneSize;
    if (!this.minimap || !shown || paneWidth === 0) return nothing;
    const { x, y, zoom } = this.viewport;
    const view = { x: -x / zoom, y: -y / zoom, width: paneWidth / zoom, height: paneHeight / zoom };
    const box = shown.nodes.length > 0 ? unionBounds(graphBounds(shown), view) : view;
    const scale = Math.max(box.width / MINIMAP_WIDTH, box.height / MINIMAP_HEIGHT);
    this.minimapScale = scale;
    const offset = 5 * scale;
    const width = scale * MINIMAP_WIDTH + offset * 2;
    const height = scale * MINIMAP_HEIGHT + offset * 2;
    const left = box.x - (width - box.width) / 2;
    const top = box.y - (height - box.height) / 2;
    return html`<svg
      class="minimap"
      width=${MINIMAP_WIDTH}
      height=${MINIMAP_HEIGHT}
      viewBox="${left} ${top} ${width} ${height}"
      role="img"
      aria-label=${t(this.hass?.language ?? 'en', 'minimap')}
    >
      ${shown.nodes.map(
        (node) => svg`<rect
          class=${node.id === this.selectedId ? 'selected' : ''}
          x=${node.position.x}
          y=${node.position.y}
          width=${NODE_WIDTH}
          height=${NODE_HEIGHT}
          rx=${12}
          stroke-width=${3 * scale}
          fill=${NODE_META[node.type].color}
        ></rect>`
      )}
      <path
        class="view"
        fill-rule="evenodd"
        d="M${left - offset},${top - offset}h${width + offset * 2}v${height + offset * 2}h${-width - offset * 2}z M${view.x},${view.y}h${view.width}v${view.height}h${-view.width}z"
      ></path>
      <rect
        class="frame"
        x=${view.x}
        y=${view.y}
        width=${view.width}
        height=${view.height}
        rx=${6 * scale}
        stroke-width=${1.5 * scale}
      ></rect>
    </svg>`;
  }

  /** Frames every node; animated unless it's the first layout. */
  fitView(animate = true): void {
    const pane = this.pane;
    if (!pane || !this.panZoom || !this.graph) return;
    const { width, height } = pane.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const viewport = getViewportForBounds(
      graphBounds(visibleGraph(this.graph)),
      width,
      height,
      // Phones: a long flow would shrink to unreadable — stay readable and pan instead.
      isNarrow() ? NARROW_MIN_FIT_ZOOM : MIN_ZOOM,
      1,
      0.15
    );
    void this.panZoom.setViewport(viewport, { duration: animate ? 250 : 0 });
  }

  /** Phones: the bottom sheet covers the lower part — move the card into the upper part. */
  revealNode(id: string): void {
    const node = this.graph?.nodes.find((n) => n.id === id);
    const { width, height } = this.paneSize;
    if (!node || !this.panZoom || width === 0) return;
    const zoom = Math.max(this.viewport.zoom, 0.8);
    void this.panZoom.setViewport(
      {
        x: width / 2 - (node.position.x + NODE_WIDTH / 2) * zoom,
        y: height * 0.22 - (node.position.y + NODE_HEIGHT / 2) * zoom,
        zoom,
      },
      { duration: 300 }
    );
  }

  /** Restores a saved view (switching back to a tab). */
  setViewport(viewport: Viewport): void {
    void this.panZoom?.setViewport(viewport, { duration: 0 });
  }

  /** Flow position for a new card: centred in what's visible right now. */
  visibleCenter(): { x: number; y: number } {
    const rect = this.pane?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const center = this.toFlow(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { x: snap(center.x - NODE_WIDTH / 2), y: snap(center.y - NODE_HEIGHT / 2) };
  }

  zoomBy(factor: number): void {
    void this.panZoom?.scaleBy(factor, { duration: 150 });
  }

  private emitGraph(graph: FlowGraph): void {
    this.dispatchEvent(new CustomEvent('graph-change', { detail: { graph } }));
  }

  private emitAddAt(detail: AddAt): void {
    this.dispatchEvent(new CustomEvent<AddAt>('add-next', { detail }));
  }

  /** Right-click: HA-style menu from the panel instead of the browser's own. */
  private onContextMenu(event: MouseEvent, node: FlowNode | null): void {
    event.preventDefault();
    event.stopPropagation();
    if (node) this.emitSelect(node.id);
    this.dispatchEvent(
      new CustomEvent<CanvasMenuDetail>('canvas-menu', {
        detail: {
          nodeId: node?.id ?? null,
          clientX: event.clientX,
          clientY: event.clientY,
          position: this.toFlow(event.clientX, event.clientY),
        },
      })
    );
  }

  private emitSelect(id: string | null): void {
    this.selectedEdgeId = null;
    this.dispatchEvent(new CustomEvent('select', { detail: { id } }));
  }

  private toFlow(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.pane?.getBoundingClientRect();
    const { x, y, zoom } = this.viewport;
    return pointToRendererPoint({ x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }, [
      x,
      y,
      zoom,
    ]);
  }

  // ---- node drag ---------------------------------------------------------

  private onNodePointerDown(event: PointerEvent, node: FlowNode): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    capturePointer(event);
    this.drag = {
      id: node.id,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPos: { ...node.position },
      moved: false,
    };
  }

  private onNodePointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClient.x;
    const dy = event.clientY - drag.startClient.y;
    if (!drag.moved && Math.hypot(dx, dy) < CLICK_DISTANCE) return;
    const zoom = this.viewport.zoom;
    this.drag = { ...drag, moved: true };
    // Live preview without emitting on every frame; the graph is committed on release.
    this.graph = moveNode(
      this.graph,
      drag.id,
      drag.startPos.x + dx / zoom,
      drag.startPos.y + dy / zoom
    );
  }

  private onNodePointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.drag = null;
    if (!drag.moved) {
      this.emitSelect(drag.id);
      return;
    }
    const node = this.graph.nodes.find((n) => n.id === drag.id);
    if (node)
      this.emitGraph(moveNode(this.graph, drag.id, snap(node.position.x), snap(node.position.y)));
  }

  // ---- connecting --------------------------------------------------------

  private onHandlePointerDown(event: PointerEvent, node: FlowNode, handle: string | null): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    capturePointer(event);
    const point = this.toFlow(event.clientX, event.clientY);
    this.connecting = {
      pointerId: event.pointerId,
      source: node.id,
      sourceHandle: handle,
      start: point,
      cursor: point,
    };
  }

  private onHandlePointerMove(event: PointerEvent): void {
    const connecting = this.connecting;
    if (!connecting || connecting.pointerId !== event.pointerId) return;
    this.connecting = { ...connecting, cursor: this.toFlow(event.clientX, event.clientY) };
  }

  /** Node under a flow-space point (connections can be dropped anywhere on a card). */
  private nodeAt(point: { x: number; y: number }): FlowNode | undefined {
    // Later cards render on top — hit-test them first.
    return visibleGraph(this.graph).nodes.findLast(
      (n) =>
        point.x >= n.position.x &&
        point.x <= n.position.x + NODE_WIDTH &&
        point.y >= n.position.y &&
        point.y <= n.position.y + NODE_HEIGHT
    );
  }

  private onHandlePointerUp(event: PointerEvent): void {
    const connecting = this.connecting;
    if (!connecting || connecting.pointerId !== event.pointerId) return;
    this.connecting = null;
    const drop = this.toFlow(event.clientX, event.clientY);
    const target = this.nodeAt(drop);
    if (!target) {
      // Dropped on empty canvas: add a card there, connected.
      if (Math.hypot(drop.x - connecting.start.x, drop.y - connecting.start.y) > DROP_DISTANCE) {
        this.emitAddAt({
          source: connecting.source,
          sourceHandle: connecting.sourceHandle,
          position: { x: drop.x, y: drop.y - NODE_HEIGHT / 2 },
        });
      }
      return;
    }
    const request = {
      source: connecting.source,
      sourceHandle: connecting.sourceHandle,
      target: target.id,
    };
    if (connectionError(this.graph, request) === null) this.emitGraph(connect(this.graph, request));
  }

  // ---- keyboard / pane ---------------------------------------------------

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    // HA listens for single-key shortcuts on window; keep editing keys to ourselves.
    event.stopPropagation();
    if (this.selectedEdgeId) {
      this.emitGraph(removeEdge(this.graph, this.selectedEdgeId));
      this.selectedEdgeId = null;
    } else if (this.selectedId) {
      const node = this.graph.nodes.find((n) => n.id === this.selectedId);
      // Every script needs its start card.
      if (node && isScriptStart(node.data)) return;
      this.emitGraph(removeNode(this.graph, this.selectedId));
      this.emitSelect(null);
    }
  }

  private onPaneClick(event: MouseEvent): void {
    const target = event.target;
    if (
      target === this.pane ||
      (target instanceof Element && target.classList.contains('viewport'))
    ) {
      this.emitSelect(null);
    }
  }

  // ---- render --------------------------------------------------------------

  private renderEdge(edge: FlowEdge) {
    const source = this.graph.nodes.find((n) => n.id === edge.source);
    const target = this.graph.nodes.find((n) => n.id === edge.target);
    if (!source || !target) return nothing;
    const from = handlePosition(source, 'source', edge.sourceHandle ?? null);
    const to = handlePosition(target, 'target');
    const [path] = getBezierPath({
      sourceX: from.x,
      sourceY: from.y,
      sourcePosition: Position.Right,
      targetX: to.x,
      targetY: to.y,
      targetPosition: Position.Left,
    });
    const selected = this.selectedEdgeId === edge.id;
    const isNo = edge.sourceHandle === 'false';
    const isLoop = edge.type === 'loop-back';
    return svg`
      <g class="edge ${selected ? 'selected' : ''} ${isNo ? 'no' : ''} ${isLoop ? 'loop' : ''}">
        <path class="edge-hit" d=${path}
          @click=${(e: Event) => {
            e.stopPropagation();
            this.selectedEdgeId = edge.id;
            this.dispatchEvent(new CustomEvent('select', { detail: { id: null } }));
          }}></path>
        <path class="edge-line" d=${path} marker-end="url(#arrow)"></path>
      </g>`;
  }

  private renderConnectionPreview() {
    const c = this.connecting;
    const source = c ? this.graph.nodes.find((n) => n.id === c.source) : undefined;
    if (!c || !source) return nothing;
    const from = handlePosition(source, 'source', c.sourceHandle);
    const [path] = getBezierPath({
      sourceX: from.x,
      sourceY: from.y,
      sourcePosition: Position.Right,
      targetX: c.cursor.x,
      targetY: c.cursor.y,
      targetPosition: Position.Left,
    });
    return svg`<path class="edge-line preview" d=${path}></path>`;
  }

  private runClass(id: string): string {
    const marks = this.runMarks;
    if (!marks) return '';
    const mark = marks.get(id);
    return `${mark ? `run-${mark}` : 'run-skipped'} ${this.activeRunNode === id ? 'run-active' : ''}`;
  }

  private renderNode(node: FlowNode, isEntry = false) {
    const meta = NODE_META[node.type];
    const language = this.hass?.language ?? 'en';
    const handles = sourceHandles(node.type);
    const selected = this.selectedId === node.id;
    const summary = summarize(node, this.hass);
    // HA's `enabled: false` — the step stays in the flow but is skipped.
    const off = 'enabled' in node.data && node.data.enabled === false;
    return html`
      <div
        class="node nopan ${selected ? 'selected' : ''} ${off ? 'off' : ''} ${this.drag?.id === node.id ? 'dragging' : ''} ${this.runClass(node.id)}"
        style="transform: translate(${node.position.x}px, ${node.position.y}px); --node-color: ${meta.color}"
        data-node-id=${node.id}
        title=${[summary.title, summary.detail].filter(Boolean).join('\n')}
        @pointerdown=${(e: PointerEvent) => this.onNodePointerDown(e, node)}
        @pointermove=${(e: PointerEvent) => this.onNodePointerMove(e)}
        @pointerup=${(e: PointerEvent) => this.onNodePointerUp(e)}
        @contextmenu=${(e: MouseEvent) => this.onContextMenu(e, node)}
      >
        ${off ? html`<span class="off-badge"><ha-icon icon="mdi:cancel"></ha-icon>${t(language, 'disabledGroup')}</span>` : nothing}
        ${isEntry ? html`<span class="entry"><ha-icon icon="mdi:play"></ha-icon>${t(language, 'entry')}</span>` : nothing}
        <span class="icon"><ha-icon .icon=${nodeIcon(node)}></ha-icon></span>
        <span class="text">
          <span class="type">${nodeEyebrow(node, summary, language)}</span>
          <span class="title">${summary.title}</span>
          ${summary.detail ? html`<span class="detail">${summary.detail}</span>` : nothing}
        </span>
        ${hasTargetHandle(node.type) ? html`<span class="handle target"></span>` : nothing}
        ${handles.map(
          (handle, index) => html`
            <span
              class="handle source ${handle ?? ''}"
              style="top: ${(NODE_HEIGHT / (handles.length + 1)) * (index + 1)}px"
              title=${handle === 'true' ? 'Ja' : handle === 'false' ? 'Nein' : ''}
              @pointerdown=${(e: PointerEvent) => this.onHandlePointerDown(e, node, handle)}
              @pointermove=${(e: PointerEvent) => this.onHandlePointerMove(e)}
              @pointerup=${(e: PointerEvent) => this.onHandlePointerUp(e)}
            ></span>
            <button
              class="add-next"
              style="top: ${(NODE_HEIGHT / (handles.length + 1)) * (index + 1)}px"
              title=${addNextLabel(language)}
              aria-label=${addNextLabel(language)}
              @pointerdown=${(e: PointerEvent) => e.stopPropagation()}
              @click=${(e: MouseEvent) => {
                e.stopPropagation();
                this.emitAddAt({ source: node.id, sourceHandle: handle });
              }}
            >
              <ha-icon icon="mdi:plus"></ha-icon>
            </button>
          `
        )}
      </div>
    `;
  }

  render() {
    const { x, y, zoom } = this.viewport;
    // A script's start node stays in the graph (transpiler) but isn't shown.
    const shown = this.graph ? visibleGraph(this.graph) : undefined;
    const entries = this.graph ? scriptEntryIds(this.graph) : new Set<string>();
    const edges = shown?.edges.filter(isDrawnEdge) ?? [];
    return html`
      <div
        class="pane"
        tabindex="0"
        style="background-position: ${x}px ${y}px; background-size: ${GRID * zoom}px ${GRID * zoom}px"
        @keydown=${this.onKeyDown}
        @click=${this.onPaneClick}
        @contextmenu=${(e: MouseEvent) => this.onContextMenu(e, null)}
      >
        <div class="viewport" style="transform: translate(${x}px, ${y}px) scale(${zoom})">
          <svg class="edges">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" class="arrow"></path>
              </marker>
            </defs>
            ${edges.map((edge) => this.renderEdge(edge))} ${this.renderConnectionPreview()}
          </svg>
          ${shown?.nodes.map((node) => this.renderNode(node, entries.has(node.id)))}
        </div>
        ${
          shown && shown.nodes.length === 0
            ? html`<div class="empty"><slot name="empty"></slot></div>`
            : nothing
        }
      </div>
      ${this.renderMinimap(shown)}
    `;
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
      overflow: hidden;
    }
    .minimap {
      position: absolute;
      right: 16px;
      bottom: 16px;
      z-index: 3;
      border-radius: 12px;
      border: 1px solid var(--divider-color);
      background: var(--card-background-color);
      box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.2));
      opacity: 0.85;
      cursor: grab;
      transition: opacity 0.15s;
    }
    .minimap:hover {
      opacity: 1;
    }
    .minimap rect {
      opacity: 0.8;
    }
    .minimap rect.selected {
      opacity: 1;
      stroke: var(--primary-text-color);
    }
    .minimap .view {
      fill: var(--primary-background-color);
      fill-opacity: 0.65;
    }
    .minimap rect.frame {
      opacity: 1;
      fill: none;
      stroke: var(--primary-color);
    }
    @media (max-width: 760px) {
      .minimap {
        display: none;
      }
    }
    .pane {
      position: absolute;
      inset: 0;
      outline: none;
      cursor: grab;
      background-color: var(--primary-background-color);
      background-image: radial-gradient(
        circle,
        color-mix(in srgb, var(--secondary-text-color) 35%, transparent) 1px,
        transparent 1.2px
      );
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .pane:active {
      cursor: grabbing;
    }
    .viewport {
      position: absolute;
      inset: 0;
      transform-origin: 0 0;
    }
    svg.edges {
      position: absolute;
      overflow: visible;
      width: 1px;
      height: 1px;
      pointer-events: none;
    }
    .edge-hit {
      fill: none;
      stroke: transparent;
      stroke-width: 16px;
      pointer-events: stroke;
      cursor: pointer;
    }
    .edge-line {
      fill: none;
      stroke: var(--secondary-text-color);
      stroke-width: 1.6px;
      opacity: 0.75;
    }
    .edge.no .edge-line {
      stroke: var(--error-color);
      stroke-dasharray: 5 4;
    }
    .edge.loop .edge-line {
      stroke-dasharray: 2 4;
    }
    .edge.selected .edge-line {
      stroke: var(--primary-color);
      stroke-width: 2.4px;
      opacity: 1;
    }
    .edge-line.preview {
      stroke: var(--primary-color);
      stroke-dasharray: 6 4;
    }
    .arrow {
      fill: var(--secondary-text-color);
    }
    .node {
      position: absolute;
      box-sizing: border-box;
      width: ${NODE_WIDTH}px;
      height: ${NODE_HEIGHT}px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px 0 12px;
      border-radius: var(--ha-card-border-radius, 12px);
      background: var(--card-background-color);
      border: 1px solid var(--divider-color);
      box-shadow: var(--ha-card-box-shadow, 0 1px 3px rgba(0, 0, 0, 0.12));
      color: var(--primary-text-color);
      cursor: pointer;
      user-select: none;
      transition: box-shadow 0.15s;
    }
    .node::before {
      content: '';
      position: absolute;
      left: 0;
      top: 12px;
      bottom: 12px;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: var(--node-color);
    }
    .node.selected {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 35%, transparent);
    }
    /* Debug view: what the selected run did. */
    .node.run-done {
      border-color: var(--success-color, #43a047);
    }
    .node.run-failed {
      border-color: var(--warning-color, #ffa600);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--warning-color, #ffa600) 35%, transparent);
    }
    .node.run-error {
      border-color: var(--error-color, #db4437);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--error-color, #db4437) 35%, transparent);
    }
    .node.run-skipped {
      opacity: 0.4;
    }
    .node.run-active {
      box-shadow: 0 0 0 3px var(--primary-color);
    }
    .node.dragging {
      cursor: grabbing;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    }
    .icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      color: var(--node-color);
      background: color-mix(in srgb, var(--node-color) 16%, transparent);
      --mdc-icon-size: 20px;
    }
    .text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .type {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .type,
    .detail {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .title {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }
    .detail {
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .handle {
      position: absolute;
      width: 12px;
      height: 12px;
      margin-top: -6px;
      border-radius: 50%;
      background: var(--card-background-color);
      border: 2px solid var(--secondary-text-color);
      box-sizing: border-box;
    }
    .handle.target {
      left: -6px;
      top: 50%;
    }
    .handle.source {
      right: -6px;
      cursor: crosshair;
    }
    .handle.source:hover {
      border-color: var(--primary-color);
      transform: scale(1.3);
    }
    /* A script's first card ("Beginn") — the start itself isn't shown, as in HA. */
    .entry {
      position: absolute;
      top: -11px;
      left: 12px;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 1px 8px 1px 5px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-primary-color, #fff);
      background: var(--primary-color);
      --mdc-icon-size: 13px;
    }
    .node.off {
      border-style: dashed;
    }
    .node.off > :not(.off-badge):not(.handle):not(.add-next) {
      opacity: 0.45;
    }
    .off-badge {
      position: absolute;
      top: -11px;
      right: 12px;
      display: flex;
      align-items: center;
      gap: 3px;
      padding: 1px 8px 1px 5px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      color: var(--secondary-text-color);
      background: var(--secondary-background-color);
      border: 1px solid var(--divider-color);
      --mdc-icon-size: 12px;
    }
    .empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      pointer-events: none;
    }
    .empty ::slotted(*) {
      pointer-events: auto;
    }
    /* "+" after an output: HA's add dialog, the new step is connected here. */
    .add-next {
      position: absolute;
      right: -40px;
      width: 22px;
      height: 22px;
      margin-top: -11px;
      padding: 0;
      display: grid;
      place-items: center;
      border: 1px solid var(--divider-color);
      border-radius: 50%;
      cursor: pointer;
      color: var(--secondary-text-color);
      background: var(--card-background-color);
      opacity: 0.55;
      transition: opacity 0.15s, color 0.15s, border-color 0.15s;
      --mdc-icon-size: 16px;
    }
    .node:hover .add-next,
    .node.selected .add-next,
    .add-next:focus-visible {
      opacity: 1;
    }
    .add-next:hover {
      color: var(--primary-color);
      border-color: var(--primary-color);
    }
    .handle.true {
      border-color: var(--success-color, #43a047);
    }
    .handle.false {
      border-color: var(--error-color);
    }
  `;
}

customElements.define('flode-canvas', FlodeCanvas);

declare global {
  interface HTMLElementTagNameMap {
    'flode-canvas': FlodeCanvas;
  }
}
