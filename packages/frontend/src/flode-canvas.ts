import {
  type Axis,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  flowAxis,
  isScriptStart,
  isTargetedPlatform,
} from '@flode/shared';
import { createdEntityIds, type NodeSummary, type StepIssue } from '@flode/ui-core';
import {
  getBezierPath,
  getSmoothStepPath,
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
import { removeAnnotation, tintOf } from './annotations';
import {
  adoptIntoBranch,
  type BlockTail,
  type BranchView,
  branchInsertAt,
  branchLabelText,
  cachedBranchView,
  cardShape,
  endsRun,
  moveBranchCard,
  type Point,
  removeBranchStep,
  tintCards,
} from './branch-view';
import { defineElement } from './define-element';
import { bendSlots, laidRoute, lineKey, roundedPath, withLineBends } from './line-bends';
import { idsInBox, moveSelection, positionsOf, type Rect, snapToGrid } from './selection';
import './flode-annotations';
import { fitViewport } from './fit';
import type { AnnotationMenuDetail, FlodeAnnotations } from './flode-annotations';
import type { ColorPick } from './flode-swatches';
import {
  ADD_BELOW,
  ADD_BUTTON,
  acrossPoints,
  type Bounds,
  backCrossing,
  cardAtInput,
  connect,
  connectionError,
  detour,
  downPoints,
  graphBounds,
  HANDLE_OUTSIDE,
  handlePosition,
  hasTargetHandle,
  isDrawnEdge,
  moveNode,
  NODE_HEIGHT,
  NODE_WIDTH,
  outgoing,
  outputOffsets,
  PAST_ADD,
  PORT_ROW,
  removeEdge,
  removeNode,
  runsBack,
  scriptEntryIds,
  unionBounds,
  visibleGraph,
} from './flow-model';
import type { HomeAssistant } from './ha';
import { HaDescriptions, isHaSummary } from './ha-describe';
import './flode-swatches';
import { watchHold } from './hold';
import { HA_ICON_ELEMENTS, nodeIconTemplate } from './node-icon';
import {
  issueLines,
  nodeColor,
  nodeEyebrow,
  nodeIssues,
  nodeTypeLine,
  summarize,
} from './node-meta';
import type { CardIssue } from './save-errors';
import { t } from './strings';
import type { RunMark } from './trace';
import { isNarrow, isTouch } from './viewport';

/**
 * A card's detail line: everything stays visible and may wrap anywhere, but a
 * number never parts from its unit ("80 %", "2 Sekunden") and the dot between
 * two parts ends a line instead of starting the next one.
 */
function detailText(detail: string): string {
  return detail.replace(/(\d) /g, '$1\u00a0').replaceAll(' · ', '\u00a0· ');
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.6;

/** Which side of a card a line leaves and arrives at, per direction of the flow. */
function lineEnds(axis: Axis): { sourcePosition: Position; targetPosition: Position } {
  return axis.direction === 'down'
    ? { sourcePosition: Position.Bottom, targetPosition: Position.Top }
    : { sourcePosition: Position.Right, targetPosition: Position.Left };
}

/**
 * A line through `points` along the flow (left to right, or top to bottom):
 * a curve between each pair (straight where they are level).
 */
function linePath(points: readonly Point[], axis: Axis, merge = false, loop = false): string {
  const down = axis.direction === 'down';
  // Top to bottom a lane may end where the line does: a curve of no length would turn the arrow sideways.
  const shaped = down ? downPoints(points, merge) : acrossPoints(points, loop);
  const drawn = down
    ? shaped.filter((p, i) => i === 0 || p.x !== shaped[i - 1]?.x || p.y !== shaped[i - 1]?.y)
    : shaped;
  const ends = lineEnds(axis);
  return drawn
    .slice(1)
    .map((to, i) => {
      const from = drawn[i] ?? to;
      const [path] = getBezierPath({
        sourceX: from.x,
        sourceY: from.y,
        targetX: to.x,
        targetY: to.y,
        ...ends,
      });
      return path;
    })
    .join(' ');
}

/** Corners of a line running back. */
const BACK_RADIUS = 14;

/**
 * A line running back along the flow (#31): out past the output's "+", across
 * at `crossing` beside the cards, and back into the input — steps with rounded
 * corners, where a curve would hook back through the cards.
 */
function backPath(axis: Axis, from: Point, to: Point, crossing: number): string {
  const [path] = getSmoothStepPath({
    sourceX: from.x,
    sourceY: from.y,
    targetX: to.x,
    targetY: to.y,
    ...lineEnds(axis),
    offset: PAST_ADD,
    borderRadius: BACK_RADIUS,
    ...(axis.direction === 'down' ? { centerX: crossing } : { centerY: crossing }),
  });
  return path;
}

/** Per picture of a flow: the bends of its lines round cards in their way (see `detourOf`). */
const detours = new WeakMap<BranchView, Map<string, Point[]>>();

/** Half a "+" (centre to edge). */
const ADD_RADIUS = ADD_BUTTON / 2;

/** From this many outputs on, top to bottom, an option's name is just its number. */
const CROWDED_OUTPUTS = 4;
/** Room an output's number takes (two digits), with a little gap. */
const NUMBER_WIDTH = 16;

/** Pointer travel (px) below which a press on a node counts as a click, not a drag. */
const CLICK_DISTANCE = 4;
const GRID = 20;

interface DragState {
  id: string;
  pointerId: number;
  startClient: { x: number; y: number };
  startPos: { x: number; y: number };
  moved: boolean;
  /** Where the card is shown while dragged, and the graph showing it there. */
  preview?: { x: number; y: number; graph: FlowGraph };
  /** A picked card of a selection: the whole selection moves, from these places. */
  group?: ReturnType<typeof positionsOf>;
}

/** A selection box being drawn with Shift held, in flow coordinates. */
interface MarqueeState {
  pointerId: number;
  /** Shift adds what the box touches to the selection, Ctrl takes it out. */
  mode: 'add' | 'remove';
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/** What the bar over a selection can do (the panel carries it out). */
export type SelectionAction = 'copy' | 'duplicate' | 'toggle' | 'frame' | 'delete' | 'clear';

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
  /** Between the output and what already follows it, instead of beside that. */
  between?: boolean;
}

/** Right-click on a card (nodeId) or on the empty canvas (null). */
export interface CanvasMenuDetail {
  nodeId: string | null;
  /** A note's or frame's menu (its id). */
  annotationId?: string;
  /** A connection's menu (its id as stored in the graph): just "delete" (#34). */
  edgeId?: string;
  /** The line right-clicked, when the user laid it by hand (#28): its bends can go. */
  laidLine?: string;
  clientX: number;
  clientY: number;
  /** Flow position of the click — where "add here" puts a card. */
  position: { x: number; y: number };
  /** A trigger's "+": the menu offers only what follows a trigger, connected to that output. */
  after?: AddAt;
}

/** Flow units a connection must be dragged before dropping it on empty canvas offers a new card. */
const DROP_DISTANCE = 40;

/** Keeps receiving move/up events for this pointer even outside the element. */
/** A contextmenu raised by a touch (Android's long press). */
function isTouchEvent(event: MouseEvent): boolean {
  return event instanceof PointerEvent && event.pointerType === 'touch';
}

/** Shift adds to the selection, Ctrl (⌘ on a Mac) takes out of it; neither = null. */
function selectionMode(event: MouseEvent): 'add' | 'remove' | null {
  if (event.ctrlKey || event.metaKey) return 'remove';
  return event.shiftKey ? 'add' : null;
}

function capturePointer(event: PointerEvent): void {
  // No native text selection / drag while moving cards or drawing connections —
  // the browser would cancel the pointer mid-gesture.
  event.preventDefault();
  if (event.currentTarget instanceof Element)
    event.currentTarget.setPointerCapture(event.pointerId);
}

/** The middle of a flow's first row of cards (top to bottom: its triggers). */
function firstRowMiddle(nodes: readonly FlowNode[]): number {
  const top = Math.min(...nodes.map((n) => n.position.y));
  const row = nodes.filter((n) => n.position.y < top + NODE_HEIGHT / 2);
  const left = Math.min(...row.map((n) => n.position.x));
  const right = Math.max(...row.map((n) => n.position.x + NODE_WIDTH));
  return (left + right) / 2;
}

function addNextLabel(language: string, node: FlowNode): string {
  return t(language, node.type === 'trigger' ? 'addAfterTrigger' : 'addNext');
}

/** A condition's outputs say "Yes" / "No" in words too — not only green and red. */
function outputLabel(language: string, handle: string | null): string {
  if (handle === 'true') return t(language, 'outputYes');
  return handle === 'false' ? t(language, 'outputNo') : '';
}

/** What `fitView` frames. */
interface FitOptions {
  /** Share of the pane's height a bottom sheet hides — the flow is framed above it. */
  covered?: number;
  /** Frame only these cards (a run's path) when any of them is shown. */
  only?: ReadonlySet<string>;
}

/** Room kept around a card brought into view — its "+" included (px). */
const REVEAL_MARGIN = 56;

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

/** Below this zoom the cards show only icon and title, in large type … */
const FAR_ZOOM = 0.6;
/** … and below this one only a large icon — no text would be readable. */
const FARTHEST_ZOOM = 0.35;

/**
 * HA's target-based steps (`light.turned_on`) say what happens only in their
 * kind ("Leuchte eingeschaltet") — the title is just the entity.
 */
function kindIsKey(node: FlowNode): boolean {
  const type: unknown = Reflect.get(node.data, node.type === 'condition' ? 'condition' : 'trigger');
  return (
    (node.type === 'trigger' || node.type === 'condition') &&
    typeof type === 'string' &&
    isTargetedPlatform(type)
  );
}

function zoomClass(zoom: number): string {
  if (zoom < FARTHEST_ZOOM) return 'far farthest';
  return zoom < FAR_ZOOM ? 'far' : '';
}

export class FlodeCanvas extends LitElement {
  static properties = {
    graph: { attribute: false },
    hass: { attribute: false },
    selectedId: { attribute: false },
    runMarks: { attribute: false },
    activeRunNode: { attribute: false },
    saveIssue: { attribute: false },
    minimap: { type: Boolean },
    haText: { type: Boolean },
    viewport: { state: true },
    paneSize: { state: true },
    drag: { state: true },
    connecting: { state: true },
    selectedEdgeId: { state: true },
    selectedAnnotation: { state: true },
    multiIds: { attribute: false },
    marquee: { state: true },
    tinting: { state: true },
  };

  declare graph: FlowGraph;
  declare hass: HomeAssistant | undefined;
  declare selectedId: string | null;
  /** Cards of the run shown in the debug view (null = not debugging). */
  declare runMarks: Map<string, RunMark> | null;
  /** The card of the step picked in HA's timeline. */
  declare activeRunNode: string | null;
  /** The card Home Assistant refused on the last save — marked red with its explanation. */
  declare saveIssue: CardIssue | null;
  declare viewport: Viewport;
  /** Overview in the corner. */
  declare minimap: boolean;
  /** Card text as HA's own editor words it, instead of FLODE's sentences. */
  declare haText: boolean;
  declare paneSize: { width: number; height: number };
  declare drag: DragState | null;
  declare connecting: ConnectState | null;
  declare selectedEdgeId: string | null;
  /** The note or frame picked on the canvas (not a card). */
  declare selectedAnnotation: string | null;
  /** The cards and notes picked together (marquee, Shift-click): they move and are acted on as one. */
  declare multiIds: string[];
  declare marquee: MarqueeState | null;
  /** Cards "Karte einfärben" shows the colours for (#28); empty = none. */
  declare tinting: string[];

  private readonly haDescriptions = new HaDescriptions(
    () => this.requestUpdate(),
    () => (this.isConnected ? this.renderRoot : null)
  );
  /** A selection box was just released; its click is not an empty-canvas click. */
  private afterMarquee = false;
  /** A bend of a line being dragged (#28): the flow before, the bends as they are now. */
  private bendDrag: {
    key: string;
    index: number;
    pointerId: number;
    original: FlowGraph;
    bends: Point[];
    moved: boolean;
  } | null = null;
  private panZoom: PanZoomInstance | null = null;
  private minimapControl: XYMinimapInstance | null = null;
  /** Flow units per minimap pixel — XYMinimap needs it for dragging. */
  private minimapScale = 1;
  /** Calls off a touch's wait for its long press. */
  private holdOff: () => void = () => undefined;
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
    this.selectedAnnotation = null;
    this.multiIds = [];
    this.marquee = null;
    this.tinting = [];
    this.runMarks = null;
    this.activeRunNode = null;
    this.minimap = false;
    this.paneSize = { width: 0, height: 0 };
  }

  private get pane(): HTMLElement | null {
    return this.renderRoot.querySelector('.pane');
  }

  /** The flow as drawn: `choose` / `if` blocks with their branches (see branch-view). */
  private get view(): BranchView {
    return cachedBranchView(this.graph);
  }

  /** The cards on screen, at their drawn positions (a script's start is hidden). */
  private shownGraph(): FlowGraph {
    return visibleGraph(this.view.graph);
  }

  /**
   * The box around `graph`'s cards. Top to bottom, cards with named outputs
   * are taller (#29); left to right it stays as it always was.
   */
  private bounds(graph: FlowGraph): Bounds {
    const down = this.view.axis.direction === 'down';
    const cards = down
      ? graphBounds(graph, (node) => cardShape(this.view, node).height)
      : graphBounds(graph);
    const ids = new Set(graph.nodes.map((n) => n.id));
    // A block's "+" for what follows it lies past its cards, and so may the bends of
    // the lines to it (an empty branch's lane); top to bottom also a line's bend
    // (a branch's lane, a way round cards).
    const points = [
      ...this.shownTails(graph).flatMap(([, tail]) => [
        tail.at,
        ...tail.exits.flatMap((exit) => exit.via),
      ]),
      ...(down
        ? graph.edges
            .filter((e) => ids.has(e.source) && ids.has(e.target))
            .flatMap((e) => this.view.via.get(e.id) ?? [])
        : []),
    ];
    return points.reduce<Bounds>(
      (box, p) =>
        unionBounds(box, {
          x: p.x - ADD_RADIUS,
          y: p.y - ADD_RADIUS,
          width: ADD_RADIUS * 2,
          height: ADD_RADIUS * 2,
        }),
      cards
    );
  }

  /**
   * The "+" where a nested block's branches meet and the flow runs on. A block
   * nothing follows gets none: a step after it is connected from a branch's
   * last card, as before 3.4 — beside the cards' own "+" it read as one more of them (#31).
   */
  private shownTails(graph: FlowGraph): [string, BlockTail][] {
    const ids = new Set(graph.nodes.map((n) => n.id));
    return [...this.view.tails].filter(([id, tail]) => tail.through && ids.has(id));
  }

  private drawnNode(id: string): FlowNode | undefined {
    return this.view.graph.nodes.find((n) => n.id === id);
  }

  private drawnHandle(node: FlowNode, side: 'source' | 'target', handle: string | null = null) {
    return handlePosition(node, side, handle, cardShape(this.view, node), this.view.axis);
  }

  protected firstUpdated(): void {
    if (this.pane) this.resizeObserver.observe(this.pane);
    // Shift on empty canvas draws a selection box: the pan gesture (d3-zoom listens to mousedown) must not start.
    this.pane?.addEventListener(
      'mousedown',
      (event) => {
        if (selectionMode(event) && event.button === 0 && this.isEmptyPane(event.target))
          event.stopImmediatePropagation();
      },
      { capture: true }
    );
    this.initPanZoom();
    this.fitView(false);
    // HA's icon elements arrive with its automation editor — then show them on the cards.
    for (const tag of HA_ICON_ELEMENTS) {
      void customElements.whenDefined(tag).then(() => this.requestUpdate());
    }
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
        // A menu opened at a "+" would stay where the "+" was.
        this.dispatchEvent(new CustomEvent('view-move'));
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
      // A hand that moves a pixel between press and release still clicks a line (#34).
      paneClickDistance: CLICK_DISTANCE,
    });
  }

  disconnectedCallback(): void {
    this.holdOff();
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
    this.minimapControl?.destroy();
    this.minimapControl = null;
    this.panZoom?.destroy();
    this.panZoom = null;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    // The panel hands its graph in again on every render (HA's state updates, a
    // run of this automation …): a card being dragged stays where the pointer has it (#31).
    const preview = this.drag?.preview;
    if (changed.has('graph') && this.drag && preview && this.graph !== preview.graph) {
      this.graph = this.drag.group
        ? moveSelection(
            this.graph,
            this.drag.group,
            preview.x - this.drag.startPos.x,
            preview.y - this.drag.startPos.y
          )
        : this.moved(this.drag.id, preview.x, preview.y);
      this.drag = { ...this.drag, preview: { ...preview, graph: this.graph } };
    }
  }

  protected updated(changed: PropertyValues<this>): void {
    // A different flow was loaded (not just edited): frame it.
    const previous = changed.get('graph');
    if (previous && previous.id !== this.graph.id) this.fitView(false);
    // Turned the other way (also by undo): the old view no longer fits (#29).
    else if (previous && flowAxis(previous).direction !== this.view.axis.direction) this.fitView();
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
    const box = shown.nodes.length > 0 ? unionBounds(this.bounds(shown), view) : view;
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
          height=${cardShape(this.view, node).height}
          rx=${12}
          stroke-width=${3 * scale}
          fill=${this.cardColor(node).color}
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

  /** Frames every node (see `FitOptions`); animated unless it's the first layout. */
  fitView(animate = true, { covered = 0, only }: FitOptions = {}): void {
    const pane = this.pane;
    if (!pane || !this.panZoom || !this.graph) return;
    const { width, height } = pane.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const shown = this.shownGraph();
    const picked = only ? shown.nodes.filter((node) => only.has(node.id)) : [];
    const bounds = this.bounds(picked.length > 0 ? { ...shown, nodes: picked } : shown);
    // Phones and tablets: a long flow would shrink to unreadable — stay readable,
    // start at the trigger and pan.
    const readable = isNarrow() || isTouch();
    const down = this.view.axis.direction === 'down';
    const viewport = fitViewport(bounds, {
      width,
      height,
      minZoom: readable ? NARROW_MIN_FIT_ZOOM : MIN_ZOOM,
      covered,
      startLeft: readable && !down,
      startTop: down,
      ...(readable && down ? { startX: firstRowMiddle(shown.nodes) } : {}),
    });
    void this.panZoom.setViewport(viewport, { duration: animate ? 250 : 0 });
  }

  /** Pans just enough that the card is fully visible — a new card behind the inspector. */
  bringIntoView(id: string): void {
    const node = this.graph ? this.drawnNode(id) : undefined;
    // Measured now: the inspector that opens with the new card has just narrowed the pane.
    const pane = this.pane?.getBoundingClientRect();
    if (!node || !this.panZoom || !pane || pane.width === 0) return;
    const { width, height } = pane;
    const { x, y, zoom } = this.viewport;
    const shift = (start: number, size: number, room: number): number => {
      if (start < REVEAL_MARGIN) return REVEAL_MARGIN - start;
      return start + size > room - REVEAL_MARGIN ? room - REVEAL_MARGIN - start - size : 0;
    };
    const dx = shift(x + node.position.x * zoom, NODE_WIDTH * zoom, width);
    const dy = shift(y + node.position.y * zoom, cardShape(this.view, node).height * zoom, height);
    if (dx === 0 && dy === 0) return;
    void this.panZoom.setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 300 });
  }

  /** Phones: the bottom sheet covers the lower part — move the card into the upper part. */
  revealNode(id: string): void {
    const node = this.graph ? this.drawnNode(id) : undefined;
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

  /**
   * A card's "+": after a trigger first a choice — condition or action —, on an
   * output that already leads on a choice between in between and in parallel;
   * then HA's dialog.
   */
  private onAddNextClick(event: MouseEvent, node: FlowNode, handle: string | null): void {
    const after: AddAt = { source: node.id, sourceHandle: handle };
    const choice =
      node.type === 'trigger' ||
      (!this.view.cards.has(node.id) &&
        !this.view.branches.has(node.id) &&
        outgoing(this.graph, node.id, handle).length > 0);
    if (!choice || !(event.currentTarget instanceof Element)) {
      this.emitAddAt(after);
      return;
    }
    const button = event.currentTarget.getBoundingClientRect();
    this.dispatchCanvasMenu({ nodeId: null, clientX: button.left, clientY: button.bottom, after });
  }

  private dispatchCanvasMenu(menu: Omit<CanvasMenuDetail, 'position'>): void {
    this.dispatchEvent(
      new CustomEvent<CanvasMenuDetail>('canvas-menu', {
        detail: { ...menu, position: this.toFlow(menu.clientX, menu.clientY) },
      })
    );
  }

  /** Right-click: HA-style menu from the panel instead of the browser's own. */
  private selectEdge(id: string): void {
    this.selectedEdgeId = id;
    this.dispatchEvent(new CustomEvent('select', { detail: { id: null } }));
  }

  /** The connection's id as stored in the graph (a branch's line stands for the block's). */
  private storedEdgeId(id: string): string {
    return this.view.edgeOrigin.get(id) ?? id;
  }

  /** Right-click on a line: its menu, the line picked (#34). A touch's long press is watched from its pointerdown. */
  private onEdgeContextMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (isTouchEvent(event)) return;
    this.openEdgeMenu(id, event.clientX, event.clientY);
  }

  private openEdgeMenu(id: string, clientX: number, clientY: number): void {
    this.selectEdge(id);
    const edge = this.view.graph.edges.find((e) => e.id === id);
    const key = edge ? lineKey(edge) : undefined;
    this.dispatchCanvasMenu({
      nodeId: null,
      edgeId: this.storedEdgeId(id),
      ...(key && this.graph.lineBends?.[key] ? { laidLine: key } : {}),
      clientX,
      clientY,
    });
  }

  // ---- lines laid by hand (#28) --------------------------------------------

  /**
   * Starts dragging bend `index` of line `key`; `insert`: a new bend at `at`
   * (dragged out of the middle of a run). The flow previews while it moves.
   */
  private startBendDrag(
    event: PointerEvent,
    key: string,
    index: number,
    insert: { at: Point } | null
  ): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    if (event.currentTarget instanceof Element)
      event.currentTarget.setPointerCapture(event.pointerId);
    const bends = [...(this.graph.lineBends?.[key] ?? [])];
    if (insert) bends.splice(index, 0, insert.at);
    this.bendDrag = {
      key,
      index,
      pointerId: event.pointerId,
      original: this.graph,
      bends,
      moved: false,
    };
  }

  private onBendMove(event: PointerEvent): void {
    const drag = this.bendDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const at = this.toFlow(event.clientX, event.clientY);
    drag.bends[drag.index] = { x: snapToGrid(at.x), y: snapToGrid(at.y) };
    drag.moved = true;
    this.graph = withLineBends(drag.original, drag.key, drag.bends);
  }

  private onBendUp(event: PointerEvent): void {
    const drag = this.bendDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.bendDrag = null;
    // Pressed without moving: nothing changes (a new bend only comes with a drag).
    if (drag.moved) this.emitGraph(this.graph);
    else this.graph = drag.original;
  }

  private removeBend(event: Event, key: string, index: number): void {
    event.stopPropagation();
    const bends = (this.graph.lineBends?.[key] ?? []).filter((_, i) => i !== index);
    this.emitGraph(withLineBends(this.graph, key, bends));
  }

  /**
   * On a picked line: its bends to drag (double-click removes one), and in the
   * middle of each run a faint point that drags a new bend out of it.
   */
  private renderBendHandles(key: string, from: Point, bends: readonly Point[], to: Point) {
    const slots = bendSlots(this.view.axis, from, bends, to).map((at, i) =>
      this.renderBend('add', at, (e) => this.startBendDrag(e, key, i, { at }))
    );
    const handles = bends.map((at, i) =>
      this.renderBend(
        'bent',
        at,
        (e) => this.startBendDrag(e, key, i, null),
        (e) => this.removeBend(e, key, i)
      )
    );
    return svg`${slots}${handles}`;
  }

  /** One bend handle; the drag goes on on it (it holds the pointer). */
  private renderBend(
    kind: 'add' | 'bent',
    at: Point,
    down: (event: PointerEvent) => void,
    remove?: (event: Event) => void
  ) {
    return svg`<circle class="bend ${kind} nopan" cx=${at.x} cy=${at.y} r=${kind === 'add' ? 5 : 6}
      @pointerdown=${down}
      @pointermove=${(e: PointerEvent) => this.onBendMove(e)}
      @pointerup=${(e: PointerEvent) => this.onBendUp(e)}
      @pointercancel=${(e: PointerEvent) => this.onBendUp(e)}
      @click=${(e: Event) => e.stopPropagation()}
      @dblclick=${(e: Event) => remove?.(e)}></circle>`;
  }

  private onContextMenu(event: MouseEvent, node: FlowNode | null): void {
    event.preventDefault();
    event.stopPropagation();
    // A touch's long press is watched from its pointerdown (Android reports it
    // here, iOS not at all) and opens the menu alone, without picking the card (#32).
    if (isTouchEvent(event)) return;
    if (node) this.emitSelect(node.id);
    this.dispatchCanvasMenu({
      nodeId: node?.id ?? null,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  private emitSelect(id: string | null): void {
    this.selectedEdgeId = null;
    this.selectedAnnotation = null;
    this.tinting = [];
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

  // ---- selection -----------------------------------------------------------

  private isEmptyPane(target: EventTarget | null): boolean {
    return (
      target === this.pane || (target instanceof Element && target.classList.contains('viewport'))
    );
  }

  private emitMulti(ids: string[]): void {
    this.dispatchEvent(new CustomEvent('multi-select', { detail: { ids } }));
  }

  private emitSelectionAction(action: SelectionAction): void {
    this.dispatchEvent(new CustomEvent<SelectionAction>('selection-action', { detail: action }));
  }

  private onPanePointerDown(event: PointerEvent): void {
    const mode = selectionMode(event);
    if (event.button !== 0 || !mode || !this.isEmptyPane(event.target)) return;
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.pane?.focus({ preventScroll: true });
    const at = this.toFlow(event.clientX, event.clientY);
    this.marquee = { pointerId: event.pointerId, mode, start: at, end: at };
  }

  private onPanePointerMove(event: PointerEvent): void {
    const marquee = this.marquee;
    if (!marquee || marquee.pointerId !== event.pointerId) return;
    this.marquee = { ...marquee, end: this.toFlow(event.clientX, event.clientY) };
  }

  private marqueeRect(marquee: MarqueeState): Rect {
    const x = Math.min(marquee.start.x, marquee.end.x);
    const y = Math.min(marquee.start.y, marquee.end.y);
    return {
      x,
      y,
      width: Math.abs(marquee.end.x - marquee.start.x),
      height: Math.abs(marquee.end.y - marquee.start.y),
    };
  }

  private onPanePointerUp(event: PointerEvent): void {
    const marquee = this.marquee;
    if (!marquee || marquee.pointerId !== event.pointerId) return;
    this.marquee = null;
    const box = this.marqueeRect(marquee);
    if (
      box.width * this.viewport.zoom < CLICK_DISTANCE &&
      box.height * this.viewport.zoom < CLICK_DISTANCE
    ) {
      // A click with Shift or Ctrl held changes nothing — and clears nothing.
      this.afterMarquee = true;
      return;
    }
    const view = this.view;
    const ids = idsInBox(this.graph, box, (node) => cardShape(view, node).height);
    // The click that follows the release must not clear what was just picked.
    this.afterMarquee = true;
    const base = this.selectionBase();
    this.emitMulti(
      marquee.mode === 'add'
        ? [...base, ...ids.filter((id) => !base.includes(id))]
        : base.filter((id) => !ids.includes(id))
    );
  }

  private renderMarquee() {
    const marquee = this.marquee;
    if (!marquee) return nothing;
    const { x, y, width, height } = this.marqueeRect(marquee);
    return html`<div class="marquee" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px"></div>`;
  }

  private renderSelectionBar() {
    if (this.multiIds.length < 1) return nothing;
    const language = this.hass?.language ?? 'en';
    const button = (action: SelectionAction, icon: string, label: string) =>
      html`<ha-icon-button .label=${label} @click=${() => this.emitSelectionAction(action)}>
        <ha-icon icon=${icon}></ha-icon>
      </ha-icon-button>`;
    return html`<div class="selection-bar nopan" @pointerdown=${(e: Event) => e.stopPropagation()}>
      <span class="count">${t(language, 'selectedCount').replace('{n}', String(this.multiIds.length))}</span>
      ${button('copy', 'mdi:content-copy', t(language, 'copyCard'))}
      ${button('duplicate', 'mdi:content-duplicate', t(language, 'duplicateCard'))}
      ${button('toggle', 'mdi:toggle-switch-outline', t(language, 'toggleSelection'))}
      ${button('frame', 'mdi:select-drag', t(language, 'frameSelection'))}
      ${button('delete', 'mdi:delete-outline', t(language, 'delete'))}
      ${button('clear', 'mdi:close', t(language, 'clearSelection'))}
    </div>`;
  }

  // ---- notes and frames ----------------------------------------------------

  /** Picks a note or frame, and puts its text in the input when it was just added. */
  selectAnnotation(id: string, edit = false): void {
    this.emitSelect(null);
    this.selectedAnnotation = id;
    if (!edit) return;
    void this.updateComplete.then(() => {
      for (const layer of this.renderRoot.querySelectorAll<FlodeAnnotations>('flode-annotations'))
        layer.edit(id);
    });
  }

  /** Starts editing the text of a note or frame. */
  editAnnotation(id: string): void {
    this.selectAnnotation(id, true);
  }

  /** Shows the colours above the first of `ids` — "Karte einfärben" (#28). */
  showTintPicker(ids: readonly string[]): void {
    this.tinting = [...ids];
  }

  /** A colour picked for the cards: the wheel previews while it moves, a pick is one undo step. */
  private onTintPick(event: CustomEvent<ColorPick>): void {
    event.stopPropagation();
    const graph = tintCards(this.graph, this.tinting, event.detail.color);
    if (!event.detail.final) {
      this.graph = graph;
      return;
    }
    this.tinting = [];
    this.emitGraph(graph);
  }

  /** The colours above the first card being tinted, its colour marked if they all share it. */
  private renderTintPicker() {
    const [first] = this.tinting;
    const node = first ? this.drawnNode(first) : undefined;
    if (!node) return nothing;
    const colors = new Set(this.tinting.map((id) => this.graph.cardColors?.[id]));
    const [shared] = colors.size === 1 ? [...colors] : [];
    return html`<flode-swatches
      class="tint-picker nopan"
      clearable
      style="transform: translate(${node.position.x}px, ${node.position.y - 38}px)"
      .current=${shared}
      .language=${this.hass?.language ?? 'en'}
      @color-pick=${this.onTintPick}
    ></flode-swatches>`;
  }

  /** The card's colour: the one the user tinted it with, or its type's / block's. */
  private cardColor(node: FlowNode): { color: string; tint?: string } {
    const picked = this.graph?.cardColors?.[node.id];
    if (!picked) return { color: nodeColor(node) };
    const tint = tintOf(picked, picked);
    return { color: `rgb(${tint})`, tint };
  }

  private onAnnotationSelect(event: CustomEvent<{ id: string }>): void {
    event.stopPropagation();
    this.pane?.focus({ preventScroll: true });
    this.selectAnnotation(event.detail.id);
  }

  private onAnnotationMulti(event: CustomEvent<{ id: string; mode: 'add' | 'remove' }>): void {
    event.stopPropagation();
    this.changeMulti(event.detail.id, event.detail.mode);
  }

  private onAnnotationPreview(event: CustomEvent<{ graph: FlowGraph }>): void {
    event.stopPropagation();
    this.graph = event.detail.graph;
  }

  private onAnnotationChange(event: CustomEvent<{ graph: FlowGraph }>): void {
    event.stopPropagation();
    this.emitGraph(event.detail.graph);
  }

  private onAnnotationMenu(event: CustomEvent<AnnotationMenuDetail>): void {
    event.stopPropagation();
    this.dispatchCanvasMenu({
      nodeId: null,
      annotationId: event.detail.id,
      clientX: event.detail.clientX,
      clientY: event.detail.clientY,
    });
  }

  private renderAnnotations(kind: 'frames' | 'notes') {
    return html`<flode-annotations
      class="nopan"
      .kind=${kind}
      .graph=${this.graph}
      .zoom=${this.viewport.zoom}
      .selectedId=${this.selectedAnnotation}
      .multiIds=${this.multiIds}
      .language=${this.hass?.language ?? 'en'}
      @annotation-select=${this.onAnnotationSelect}
      @annotation-multi=${this.onAnnotationMulti}
      @graph-preview=${this.onAnnotationPreview}
      @graph-change=${this.onAnnotationChange}
      @annotation-menu=${this.onAnnotationMenu}
    ></flode-annotations>`;
  }

  // ---- node drag ---------------------------------------------------------

  private onNodePointerDown(event: PointerEvent, node: FlowNode): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    // A second finger while a card is being dragged: the first drag keeps going
    // (taking it over would leave that card's preview position behind).
    if (this.drag) return;
    capturePointer(event);
    // Delete / Backspace act on the picked card: the keys go to the canvas, not to
    // whatever had them before (a toolbar button).
    this.pane?.focus({ preventScroll: true });
    // Moves happen on the stored position; branch cards (no node of their own) on the drawn one.
    const stored = this.graph.nodes.find((n) => n.id === node.id);
    // A card of a selection takes the whole selection with it.
    const group =
      this.multiIds.length > 1 && this.multiIds.includes(node.id)
        ? positionsOf(this.graph, this.multiIds)
        : undefined;
    this.drag = {
      group,
      id: node.id,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPos: { ...(stored ?? node).position },
      moved: false,
    };
    const { clientX, clientY } = event;
    this.holdOff = watchHold(event, CLICK_DISTANCE, () => {
      // Held still: the card's menu, and no move or pick when the finger lifts (#32).
      this.drag = null;
      this.dispatchCanvasMenu({ nodeId: node.id, clientX, clientY });
    });
  }

  private onNodePointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClient.x;
    const dy = event.clientY - drag.startClient.y;
    if (!drag.moved && Math.hypot(dx, dy) < CLICK_DISTANCE) return;
    const zoom = this.viewport.zoom;
    const x = drag.startPos.x + dx / zoom;
    const y = drag.startPos.y + dy / zoom;
    if (drag.group) {
      this.graph = moveSelection(this.graph, drag.group, x - drag.startPos.x, y - drag.startPos.y);
      this.drag = { ...drag, moved: true, preview: { x, y, graph: this.graph } };
      return;
    }
    // Live preview without emitting on every frame; the graph is committed on release.
    this.graph = this.moved(drag.id, x, y);
    this.drag = { ...drag, moved: true, preview: { x, y, graph: this.graph } };
  }

  /** The graph with card `id` at `x`/`y` — a branch card keeps where it was moved to as its offset. */
  private moved(id: string, x: number, y: number): FlowGraph {
    const view = this.view;
    return view.cards.has(id)
      ? moveBranchCard(this.graph, view, id, { x, y })
      : moveNode(this.graph, id, x, y);
  }

  private onNodePointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.drag = null;
    if (!drag.moved) {
      // Shift-click adds a card to the selection, Ctrl-click takes it out.
      const mode = selectionMode(event);
      const branchCard = this.view.cards.has(drag.id);
      if (mode && !branchCard) this.changeMulti(drag.id, mode);
      // A branch card can't join a selection: Shift/Ctrl-click on one keeps the selection as it is.
      else if (!mode || this.multiIds.length === 0) this.emitSelect(drag.id);
      return;
    }
    if (drag.group) {
      // The selection lands on the grid by the distance its picked card is snapped by.
      const at = drag.preview ?? { x: drag.startPos.x, y: drag.startPos.y };
      const shiftX = snap(at.x) - drag.startPos.x;
      const shiftY = snap(at.y) - drag.startPos.y;
      this.emitGraph(moveSelection(this.graph, drag.group, shiftX, shiftY));
      return;
    }
    const node = this.view.cards.has(drag.id)
      ? this.drawnNode(drag.id)
      : this.graph.nodes.find((n) => n.id === drag.id);
    if (node) this.emitGraph(this.moved(drag.id, snap(node.position.x), snap(node.position.y)));
  }

  /** What is picked now: the selection, or the one card or note picked alone. */
  private selectionBase(): string[] {
    if (this.multiIds.length > 0) return this.multiIds;
    return [this.selectedId, this.selectedAnnotation].filter((id) => id !== null);
  }

  private changeMulti(id: string, mode: 'add' | 'remove'): void {
    const base = this.selectionBase();
    if (mode === 'add') this.emitMulti(base.includes(id) ? base : [...base, id]);
    else this.emitMulti(base.filter((picked) => picked !== id));
  }

  /** The browser took the pointer away (system gesture, lost capture …): the drag changes nothing. */
  private onNodePointerCancel(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.drag = null;
    if (drag.group) {
      this.graph = moveSelection(this.graph, drag.group, 0, 0);
      return;
    }
    // Back to where the model has it — the preview was never committed.
    if (drag.moved) this.graph = this.moved(drag.id, drag.startPos.x, drag.startPos.y);
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

  private onHandlePointerCancel(event: PointerEvent): void {
    if (this.connecting?.pointerId === event.pointerId) this.connecting = null;
  }

  /** Node under a flow-space point (connections can be dropped anywhere on a card). */
  private nodeAt(point: { x: number; y: number }): FlowNode | undefined {
    // Later cards render on top — hit-test them first.
    return this.shownGraph().nodes.findLast(
      (n) =>
        point.x >= n.position.x &&
        point.x <= n.position.x + NODE_WIDTH &&
        point.y >= n.position.y &&
        point.y <= n.position.y + cardShape(this.view, n).height
    );
  }

  private onHandlePointerUp(event: PointerEvent): void {
    const connecting = this.connecting;
    if (!connecting || connecting.pointerId !== event.pointerId) return;
    this.connecting = null;
    const drop = this.toFlow(event.clientX, event.clientY);
    const target = this.nodeAt(drop);
    const { source, sourceHandle } = connecting;
    // From a branch's output or card: into that branch, where its "+" adds a step (#36).
    const branch = branchInsertAt(this.view, source, sourceHandle);
    if (!target) {
      // Dropped on empty canvas: add a card there, connected (a branch lays its cards out itself).
      if (Math.hypot(drop.x - connecting.start.x, drop.y - connecting.start.y) > DROP_DISTANCE) {
        const position = cardAtInput(this.view.axis, drop);
        this.emitAddAt(branch ? { source, sourceHandle } : { source, sourceHandle, position });
      }
      return;
    }
    // Steps inside a branch are added with its "+", not connected into.
    if (this.view.cards.has(target.id)) return;
    if (branch) {
      const adopted = adoptIntoBranch(this.graph, branch, target.id);
      if (adopted) this.emitGraph(adopted);
      return;
    }
    const request = { source, sourceHandle, target: target.id };
    if (connectionError(this.graph, request) === null) this.emitGraph(connect(this.graph, request));
  }

  // ---- keyboard / pane ---------------------------------------------------

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.multiIds.length > 0) {
      this.emitSelectionAction('clear');
      return;
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    // A note's or frame's text field keeps its own keys.
    const typing = event.composedPath()[0];
    if (typing instanceof HTMLInputElement || typing instanceof HTMLTextAreaElement) return;
    // HA listens for single-key shortcuts on window; keep editing keys to ourselves.
    event.stopPropagation();
    const branchCard = this.selectedId ? this.view.cards.get(this.selectedId) : undefined;
    if (this.multiIds.length > 0) {
      this.emitSelectionAction('delete');
    } else if (this.selectedAnnotation) {
      this.emitGraph(removeAnnotation(this.graph, this.selectedAnnotation));
      this.selectedAnnotation = null;
    } else if (this.selectedEdgeId) {
      this.emitGraph(removeEdge(this.graph, this.storedEdgeId(this.selectedEdgeId)));
      this.selectedEdgeId = null;
    } else if (branchCard) {
      this.emitGraph(removeBranchStep(this.graph, branchCard));
      this.emitSelect(null);
    } else if (this.selectedId) {
      const node = this.graph.nodes.find((n) => n.id === this.selectedId);
      // Every script needs its start card.
      if (node && isScriptStart(node.data)) return;
      this.emitGraph(removeNode(this.graph, this.selectedId));
      this.emitSelect(null);
    }
  }

  private onPaneClick(event: MouseEvent): void {
    if (this.afterMarquee) {
      this.afterMarquee = false;
      return;
    }
    const target = event.target;
    if (
      target === this.pane ||
      (target instanceof Element && target.classList.contains('viewport'))
    ) {
      this.emitSelect(null);
    }
  }

  // ---- render --------------------------------------------------------------

  private created: { graph: FlowGraph | undefined; ids: ReadonlySet<string> } = {
    graph: undefined,
    ids: new Set(),
  };

  /** Entities the flow creates itself (`scene.create` …), recomputed only when the graph changes. */
  private createdEntities(): ReadonlySet<string> {
    if (this.created.graph !== this.graph) {
      this.created = {
        graph: this.graph,
        ids: createdEntityIds(this.graph?.nodes.map((node) => node.data) ?? []),
      };
    }
    return this.created.ids;
  }

  /** Per node: what would make it fail (unknown service, missing entity) — red border and red incoming line. */
  private issues = new Map<string, StepIssue[]>();

  /** A line's way round cards in its way — worked out once per picture, not on every pan or zoom. */
  /** A card's place and size as drawn. */
  private cardBounds(node: FlowNode): Bounds {
    return { ...node.position, width: NODE_WIDTH, height: cardShape(this.view, node).height };
  }

  private detourOf(id: string, from: Point, to: Point, ends: readonly string[]): Point[] {
    const view = this.view;
    let known = detours.get(view);
    if (!known) {
      known = new Map();
      detours.set(view, known);
    }
    const cached = known.get(id);
    if (cached) return cached;
    const bends = detour(
      view.axis,
      from,
      to,
      view.graph.nodes,
      new Set(ends),
      (n) => this.cardBounds(n).height
    );
    known.set(id, bends);
    return bends;
  }

  /** `merge`: other lines lead into the same card (top to bottom they join just above it). */
  private renderEdge(edge: FlowEdge, merge: boolean) {
    const source = this.drawnNode(edge.source);
    const target = this.drawnNode(edge.target);
    if (!source || !target) return nothing;
    const { cards, edgeOrigin, via, start } = this.view;
    const from =
      start.get(edge.id) ?? this.drawnHandle(source, 'source', edge.sourceHandle ?? null);
    const to = this.drawnHandle(target, 'target');
    // Lines into and between a branch's steps aren't connections of their own.
    const selectable =
      edgeOrigin.has(edge.id) || (!cards.has(edge.source) && !cards.has(edge.target));
    const key = lineKey(edge);
    // Laid by hand (#28): at right angles through its bends, whatever FLODE would draw.
    const laid = selectable ? (this.graph.lineBends?.[key] ?? []) : [];
    const bends = via.get(edge.id) ?? this.detourOf(edge.id, from, to, [source.id, target.id]);
    const isLoop = edge.type === 'loop-back';
    const axis = this.view.axis;
    const path =
      laid.length > 0
        ? roundedPath(laidRoute(axis, from, laid, to))
        : !isLoop && runsBack(axis, from, to)
          ? backPath(
              axis,
              from,
              to,
              backCrossing(axis, from, to, this.cardBounds(source), this.cardBounds(target))
            )
          : linePath([from, ...bends, to], axis, merge, isLoop);
    const selected = this.selectedEdgeId === edge.id;
    const isNo = edge.sourceHandle === 'false';
    const faulty = (this.issues.get(edge.target)?.length ?? 0) > 0;
    return svg`
      <g class="edge ${selected ? 'selected' : ''} ${selectable ? 'selectable' : ''} ${isNo ? 'no' : ''} ${isLoop ? 'loop' : ''} ${faulty ? 'faulty' : ''}">
        <path class="edge-hit" d=${path}
          @click=${(e: Event) => {
            e.stopPropagation();
            // A line that can't be picked acts like the canvas behind it.
            if (selectable) this.selectEdge(edge.id);
            else this.emitSelect(null);
          }}
          @contextmenu=${(e: MouseEvent) => {
            if (selectable) this.onEdgeContextMenu(e, edge.id);
          }}
          @pointerdown=${(e: PointerEvent) => {
            // The pane still pans when the finger moves on; held still, the line's menu.
            if (selectable)
              this.holdOff = watchHold(e, CLICK_DISTANCE, () =>
                this.openEdgeMenu(edge.id, e.clientX, e.clientY)
              );
          }}></path>
        <path class="edge-line" d=${path} marker-end=${faulty ? 'url(#arrow-faulty)' : 'url(#arrow)'}></path>
        ${selected && selectable ? this.renderBendHandles(key, from, laid, to) : nothing}
      </g>`;
  }

  /** Lines from a nested block's branch ends to the "+" the flow runs on through. */
  private renderTailLines(tail: BlockTail) {
    return tail.exits.map((exit) => {
      const source = this.drawnNode(exit.source);
      if (!source) return nothing;
      const from = exit.start ?? this.drawnHandle(source, 'source', exit.sourceHandle ?? null);
      const path = linePath([from, ...exit.via, tail.at], this.view.axis);
      return svg`<path class="edge-line" d=${path}></path>`;
    });
  }

  /** "+" after a whole block (#29): the new step follows every branch, its card where the "+" is. */
  private renderTail(blockId: string, tail: BlockTail) {
    const { axis } = this.view;
    // The new card's input where the "+" was.
    const position = cardAtInput(axis, tail.at);
    return this.renderAdd(
      t(this.hass?.language ?? 'en', 'addNext'),
      'tail',
      `transform: translate(${tail.at.x}px, ${tail.at.y}px)`,
      () => this.emitAddAt({ source: blockId, sourceHandle: null, position })
    );
  }

  /** A "+" that adds a step: after a card's output, or after a whole block. */
  private renderAdd(label: string, kind: string, style: string, add: (e: MouseEvent) => void) {
    return html`<button
      class="add-next ${kind}"
      style=${style}
      title=${label}
      aria-label=${label}
      @pointerdown=${(e: PointerEvent) => e.stopPropagation()}
      @click=${(e: MouseEvent) => {
        e.stopPropagation();
        add(e);
      }}
    >
      <ha-icon icon="mdi:plus"></ha-icon>
    </button>`;
  }

  private renderConnectionPreview() {
    const c = this.connecting;
    const source = c ? this.drawnNode(c.source) : undefined;
    if (!c || !source) return nothing;
    const from = this.drawnHandle(source, 'source', c.sourceHandle);
    const path = linePath([from, c.cursor], this.view.axis);
    return svg`<path class="edge-line preview" d=${path}></path>`;
  }

  private runClass(id: string): string {
    const marks = this.runMarks;
    if (!marks) return '';
    const mark = marks.get(id);
    return `${mark ? `run-${mark}` : 'run-skipped'} ${this.activeRunNode === id ? 'run-active' : ''}`;
  }

  /** The card's text: FLODE's sentence, or HA's own wording when the user picked that. */
  private cardSummary(node: FlowNode, fullNames = false): NodeSummary {
    const own = summarize(node, this.hass, fullNames);
    return this.haText ? this.haDescriptions.summary(node, this.hass, own) : own;
  }

  /**
   * Where output `index` of `count` sits on a card `height` tall (and its
   * name): spread down the right edge, or along the bottom edge when the
   * flow runs top to bottom — its name then above it, as wide as its share
   * (`crowded`: its neighbours show only a number, so it may take some of theirs).
   */
  private outputPlace(
    height: number,
    handles: readonly (string | null)[],
    index: number,
    crowded: boolean
  ): { at: string; label: string } {
    const { axis } = this.view;
    const offsets = outputOffsets(axis, handles, axis.breadth({ width: NODE_WIDTH, height }));
    const at = offsets[index] ?? 0;
    if (axis.direction === 'down') {
      // A name as wide as the room to its neighbours (the card's edges count double).
      const before = index === 0 ? at * 2 : at - (offsets[index - 1] ?? 0);
      const after =
        index === offsets.length - 1 ? (NODE_WIDTH - at) * 2 : (offsets[index + 1] ?? 0) - at;
      const room = Math.max(
        0,
        crowded ? Math.min(before, after) * 2 - NUMBER_WIDTH : Math.min(before, after) - 4
      );
      return { at: `left: ${at}px`, label: `left: ${at}px; max-width: ${room}px` };
    }
    return { at: `top: ${at}px`, label: `top: ${at}px` };
  }

  private renderNode(node: FlowNode, isEntry = false) {
    const { color, tint } = this.cardColor(node);
    const language = this.hass?.language ?? 'en';
    const { handles, height } = cardShape(this.view, node);
    // Top to bottom, many outputs share the card's width: an option's name shrinks to its number.
    const down = this.view.axis.direction === 'down';
    const crowded = down && handles.length >= CROWDED_OUTPUTS;
    // Yes and No side by side; a gate condition's one output needs no name (#40).
    const twoWay = handles.includes('true') && handles.includes('false');
    const branches = this.view.branches.get(node.id);
    const inBranch = !!branches || this.view.cards.has(node.id);
    const addLabel = inBranch ? t(language, 'addInBranch') : addNextLabel(language, node);
    const selected = this.selectedId === node.id || this.multiIds.includes(node.id);
    const summary = this.cardSummary(node);
    const issues = [
      ...issueLines(this.issues.get(node.id) ?? [], language),
      ...(this.saveIssue?.nodeId === node.id ? [this.saveIssue.text] : []),
    ];
    // HA's `enabled: false` — the step stays in the flow but is skipped.
    const off = 'enabled' in node.data && node.data.enabled === false;
    // A stop nothing follows: the run ends here, said in words under its edge (#38).
    const ends = endsRun(this.view, node);
    return html`
      <div
        class="node nopan ${branches ? 'branching' : ''} ${twoWay ? 'two-way' : ''} ${this.view.cards.has(node.id) ? 'branch-step' : ''} ${kindIsKey(node) ? 'kind-key' : ''} ${issues.length > 0 ? 'faulty' : ''} ${selected ? 'selected' : ''} ${off ? 'off' : ''} ${ends ? `ends ${ends}` : ''} ${this.drag?.id === node.id ? 'dragging' : ''} ${tint ? 'tinted' : ''} ${this.runClass(node.id)}"
        style="transform: translate(${node.position.x}px, ${node.position.y}px); height: ${height}px; --node-color: ${color}${tint ? `; --card-tint: ${tint}` : ''}"
        data-node-id=${node.id}
        title=${[
          nodeTypeLine(node, summary, language),
          this.cardSummary(node, true).title,
          summary.detail,
          ...issues,
        ]
          .filter(Boolean)
          .join('\n')}
        @pointerdown=${(e: PointerEvent) => this.onNodePointerDown(e, node)}
        @pointermove=${(e: PointerEvent) => this.onNodePointerMove(e)}
        @pointerup=${(e: PointerEvent) => this.onNodePointerUp(e)}
        @pointercancel=${(e: PointerEvent) => this.onNodePointerCancel(e)}
        @lostpointercapture=${(e: PointerEvent) => this.onNodePointerCancel(e)}
        @contextmenu=${(e: MouseEvent) => this.onContextMenu(e, node)}
      >
        ${off ? html`<span class="off-badge"><ha-icon icon="mdi:cancel"></ha-icon>${t(language, 'disabledGroup')}</span>` : nothing}
        ${isEntry ? html`<span class="entry"><ha-icon icon="mdi:play"></ha-icon>${t(language, 'entry')}</span>` : nothing}
        <span class="icon">${nodeIconTemplate(node, summary, this.hass)}</span>
        <span class="text">
          ${isHaSummary(summary) ? nothing : html`<span class="type">${nodeEyebrow(node, summary, language)}</span>`}
          <span class="title">${summary.title}</span>
          ${summary.detail ? html`<span class="detail">${detailText(summary.detail)}</span>` : nothing}
        </span>
        ${hasTargetHandle(node.type) ? html`<span class="handle target"></span>` : nothing}
        ${ends ? html`<span class="end-note">${t(language, ends === 'error' ? 'endsWithError' : 'endsHere')}</span>` : nothing}
        ${handles.map((handle, index) => {
          const branch = branches?.[index];
          const name = branch
            ? branchLabelText(language, branch.label)
            : twoWay
              ? outputLabel(language, handle)
              : '';
          // Top to bottom a named option shows just its name ("Morgens"); crowded, its number.
          const alias = branch?.label.kind === 'option' ? branch.label.alias : undefined;
          const shown =
            branch && crowded
              ? branchLabelText(language, branch.label, true)
              : (down && alias) || name;
          const place = this.outputPlace(height, handles, index, crowded);
          return html`
            ${name ? html`<span class="port ${branch?.label.kind ?? handle ?? ''}" style=${place.label} title=${name}>${shown}</span>` : nothing}
            <span
              class="handle source ${handle ?? ''} ${branch ? 'branch' : ''}"
              style=${place.at}
              title=${name}
              @pointerdown=${(e: PointerEvent) => this.onHandlePointerDown(e, node, handle)}
              @pointermove=${(e: PointerEvent) => this.onHandlePointerMove(e)}
              @pointerup=${(e: PointerEvent) => this.onHandlePointerUp(e)}
              @pointercancel=${(e: PointerEvent) => this.onHandlePointerCancel(e)}
              @lostpointercapture=${(e: PointerEvent) => this.onHandlePointerCancel(e)}
            ></span>
            ${this.renderAdd(addLabel, '', place.at, (e) => this.onAddNextClick(e, node, handle))}
          `;
        })}
      </div>
    `;
  }

  render() {
    const { x, y, zoom } = this.viewport;
    // A script's start node stays in the graph (transpiler) but isn't shown.
    const shown = this.graph ? this.shownGraph() : undefined;
    const entries = this.graph ? scriptEntryIds(this.graph) : new Set<string>();
    const edges = shown?.edges.filter(isDrawnEdge) ?? [];
    const tails = shown ? this.shownTails(shown) : [];
    const incoming = new Map<string, number>();
    // Lines that meet at a card (a loop back to it doesn't count).
    for (const edge of edges.filter((e) => e.type !== 'loop-back'))
      incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    const created = this.createdEntities();
    this.issues = new Map(
      (shown?.nodes ?? []).map((node) => [node.id, nodeIssues(node, this.hass, created)])
    );
    return html`
      <div
        class="pane"
        tabindex="0"
        style="background-position: ${x}px ${y}px; background-size: ${GRID * zoom}px ${GRID * zoom}px"
        @keydown=${this.onKeyDown}
        @click=${this.onPaneClick}
        @pointerdown=${this.onPanePointerDown}
        @pointermove=${this.onPanePointerMove}
        @pointerup=${this.onPanePointerUp}
        @pointercancel=${() => {
          this.marquee = null;
        }}
        @contextmenu=${(e: MouseEvent) => this.onContextMenu(e, null)}
      >
        <div
          class="viewport ${zoomClass(zoom)} ${this.view.axis.direction === 'down' ? 'down' : ''}"
          style="transform: translate(${x}px, ${y}px) scale(${zoom}); --zoom: ${zoom}"
        >
          ${this.graph ? this.renderAnnotations('frames') : nothing}
          <svg class="edges">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" class="arrow"></path>
              </marker>
              <marker id="arrow-faulty" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" class="arrow faulty"></path>
              </marker>
            </defs>
            ${edges.map((edge) => this.renderEdge(edge, (incoming.get(edge.target) ?? 0) > 1))} ${tails.map(([, tail]) => this.renderTailLines(tail))}
            ${this.renderConnectionPreview()}
          </svg>
          ${shown?.nodes.map((node) => this.renderNode(node, entries.has(node.id)))}
          ${tails.map(([id, tail]) => this.renderTail(id, tail))}
          ${this.graph ? this.renderAnnotations('notes') : nothing} ${this.renderMarquee()}
          ${this.renderTintPicker()}
        </div>
        ${
          shown && shown.nodes.length === 0
            ? html`<div class="empty"><slot name="empty"></slot></div>`
            : nothing
        }
      </div>
      ${this.renderSelectionBar()} ${this.renderMinimap(shown)}
    `;
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      /* Never scrolled to show a focused "+" (Chromium does, for one HA's dialog hands focus back to). */
      overflow: clip;
    }
    .marquee {
      position: absolute;
      box-sizing: border-box;
      border: 1px solid var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
      pointer-events: none;
    }
    .selection-bar {
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      z-index: 4;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 8px;
      border-radius: 999px;
      background: var(--card-background-color);
      border: 1px solid var(--divider-color);
      box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.2));
      color: var(--primary-text-color);
    }
    .selection-bar .count {
      padding: 0 8px;
      font-size: 13px;
      white-space: nowrap;
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
    }
    /* A line into or between a branch's steps is not a connection of its own: nothing to pick (#34). */
    .edge.selectable .edge-hit {
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
    /* A picked line's bends (#28): drag to move, double-click to remove; faint ones add a bend. */
    .bend {
      fill: var(--card-background-color);
      stroke: var(--primary-color);
      stroke-width: 2.5px;
      pointer-events: all;
      cursor: move;
    }
    .bend.add {
      opacity: 0.55;
      stroke-width: 1.5px;
      cursor: copy;
    }
    .bend.add:hover {
      opacity: 1;
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
    /* A step that would fail (unknown service, missing entity) and the line into it. */
    .edge.faulty .edge-line {
      stroke: var(--error-color, #db4437);
      stroke-width: 2.4px;
    }
    .arrow.faulty {
      fill: var(--error-color, #db4437);
    }
    .node.faulty {
      border-color: var(--error-color, #db4437);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--error-color, #db4437) 30%, transparent);
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
    /* Tinted by the user (#28): the whole card in a light wash of its colour. */
    .node.tinted {
      background: color-mix(in srgb, rgb(var(--card-tint)) 18%, var(--card-background-color));
    }
    .tint-picker {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 5;
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
    /* A stop nothing follows (#38): its outgoing edge closed off by a bar, and a word on why no line leaves it. */
    .node.ends {
      --end-color: var(--secondary-text-color);
    }
    .node.ends.error {
      --end-color: var(--error-color, #db4437);
    }
    /* Red text mixed toward the text colour, like a condition's "No", so it stays readable on dark themes. */
    .node.ends.error .end-note {
      color: color-mix(in srgb, var(--error-color, #db4437) 70%, var(--primary-text-color));
    }
    .node.ends::after {
      content: '';
      position: absolute;
      right: -1px;
      top: 12px;
      bottom: 12px;
      width: 3px;
      border-radius: 3px 0 0 3px;
      background: var(--end-color);
    }
    .end-note {
      position: absolute;
      left: calc(100% + 10px);
      top: 50%;
      transform: translateY(-50%);
      white-space: nowrap;
      font-size: 11px;
      line-height: 1.25;
      color: var(--end-color);
      pointer-events: none;
    }
    /* Zoomed out it grows like the card's detail line; farthest out, where the text goes, it goes too. */
    .far .end-note {
      font-size: 16px;
    }
    .farthest .end-note {
      display: none;
    }
    .down .node.ends::after {
      right: 12px;
      left: 12px;
      top: auto;
      bottom: -1px;
      width: auto;
      height: 3px;
      border-radius: 3px 3px 0 0;
    }
    .down .end-note {
      left: 50%;
      top: calc(100% + 8px);
      transform: translateX(-50%);
    }
    .node.selected {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 35%, transparent);
    }
    /* A faulty card stays red while picked (e.g. where saving failed). */
    .node.selected.faulty {
      border-color: var(--error-color, #db4437);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--error-color, #db4437) 45%, transparent);
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
    .type {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .detail {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
      line-height: 1.3;
    }
    /* Zoomed far out: icon, title and one line of detail (what an action does —
       "Leuchte einschalten"), large enough to read. */
    .far .node:not(.kind-key) .type {
      display: none;
    }
    .far .node .type {
      font-size: 14px;
    }
    .far .node .title {
      font-size: 20px;
      line-height: 1.15;
      overflow-wrap: break-word;
    }
    .far .node .detail {
      font-size: 16px;
      -webkit-line-clamp: 1;
      overflow-wrap: normal;
    }
    .far .node .icon {
      width: 40px;
      height: 40px;
      --mdc-icon-size: 26px;
    }
    .farthest .node {
      justify-content: center;
    }
    .farthest .node .text {
      display: none;
    }
    .farthest .node .icon {
      width: 72px;
      height: 72px;
      border-radius: 18px;
      --mdc-icon-size: 48px;
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
      /* Two even lines instead of one word left alone on the second. */
      text-wrap: balance;
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
      width: ${ADD_BUTTON}px;
      height: ${ADD_BUTTON}px;
      margin-top: -${ADD_RADIUS}px;
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
    /* Touch: a finger-sized (44 px on screen), invisible hit area around the
       outputs and their "+", which stays fully visible. Zoomed far out the
       areas stop growing in flow units, so they stay in the gap to the next card. */
    @media (pointer: coarse) {
      .handle.source::before,
      .add-next::before {
        content: '';
        position: absolute;
        left: 50%;
        top: 50%;
        width: var(--hit);
        height: var(--hit);
        transform: translate(-50%, -50%);
        border-radius: 50%;
      }
      .handle.source {
        --hit: min(44px / var(--zoom, 1), 60px);
      }
      .add-next {
        --hit: min(44px / var(--zoom, 1), 80px);
        opacity: 1;
        /* Its hit area starts where the output's ends. */
        right: calc(-${ADD_RADIUS}px - min(22px / var(--zoom, 1), 30px) - min(22px / var(--zoom, 1), 40px));
      }
      /* Outputs one above the other: each "+" keeps to its own, not over its neighbour's. */
      .node.two-way .add-next::before,
      .node.branching .add-next::before {
        height: min(var(--hit), 24px);
      }
    }
    /* An expanded choose / if: one named output per branch (#27). */
    .node.branching .text {
      padding-right: 72px;
    }
    .node.two-way .text {
      padding-right: 28px;
    }
    .port {
      position: absolute;
      right: 12px;
      max-width: 80px;
      transform: translateY(-50%);
      font-size: 10px;
      font-weight: 600;
      line-height: 1.2;
      color: var(--secondary-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
    }
    .handle.branch {
      border-color: var(--node-color);
    }
    .handle.true {
      border-color: var(--success-color, #43a047);
    }
    .handle.false {
      border-color: var(--error-color);
    }
    .port.true {
      color: color-mix(in srgb, var(--success-color, #43a047) 70%, var(--primary-text-color));
    }
    .port.false {
      color: color-mix(in srgb, var(--error-color, #db4437) 70%, var(--primary-text-color));
    }
    /* Top to bottom (#29): in at the top, out along the bottom edge, the
       outputs' names in a row just above them. */
    .down .handle {
      margin-top: 0;
      margin-left: -6px;
    }
    /* On the card's edge, half outside. */
    .down .handle.target {
      left: 50%;
      top: -${HANDLE_OUTSIDE}px;
    }
    .down .handle.source {
      right: auto;
      bottom: -${HANDLE_OUTSIDE}px;
    }
    /* The "+" sits on the line below its output: opaque, only its colours muted. */
    .down .add-next {
      right: auto;
      bottom: -${ADD_BELOW}px;
      margin-top: 0;
      margin-left: -${ADD_RADIUS}px;
      opacity: 1;
      color: color-mix(in srgb, var(--secondary-text-color) 80%, transparent);
      border-color: var(--divider-color);
    }
    .down .add-next:hover {
      color: var(--primary-color);
      border-color: var(--primary-color);
    }
    /* Zoomed far out the names grow with the rest of the card's text. */
    .down.far .port {
      font-size: 13px;
    }
    @media (pointer: coarse) {
      /* Top to bottom the "+" stays on its line, its hit area around it: drawn after
         the output, it wins where the two meet, and it ends before the next card. */
      .down .add-next {
        --hit: min(44px / var(--zoom, 1), 50px);
      }
      /* Outputs side by side: as wide as the room to the neighbour's "+". */
      .down .node.two-way .add-next::before,
      .down .node.branching .add-next::before {
        height: var(--hit);
        width: min(var(--hit), 40px);
      }
    }
    /* The "+" after a whole block sits on its own in the flow, not on a card. */
    .viewport .add-next.tail:hover {
      opacity: 1;
    }
    .viewport .add-next.tail {
      left: 0;
      top: 0;
      right: auto;
      bottom: auto;
      margin: -${ADD_RADIUS}px 0 0 -${ADD_RADIUS}px;
    }
    /* The input and output sit on the top and bottom edge: room for at most three lines of text. */
    .down .node .detail {
      -webkit-line-clamp: 1;
    }
    .down .node.branching .text,
    .down .node.two-way .text {
      padding-right: 0;
      margin-bottom: ${PORT_ROW}px;
    }
    .down .port {
      right: auto;
      bottom: 8px;
      transform: translateX(-50%);
      text-align: center;
      /* A short name shows its full one on hover (pressing it still takes the card). */
      pointer-events: auto;
    }
  `;
}

defineElement('flode-canvas', FlodeCanvas);

declare global {
  interface HTMLElementTagNameMap {
    'flode-canvas': FlodeCanvas;
  }
}
