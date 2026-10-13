import {
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  getRawStep,
  isPlainObject,
  NodeSchema,
  RAW_STEP_KEY,
} from '@flode/shared';
import { NODE_HEIGHT, NODE_WIDTH, sourceHandles, updateNodeData } from './flow-model';
import { stepToNode } from './ha-step';
import { t } from './strings';

/**
 * HA's branching blocks (`choose`, `if`) drawn with their branches (#27): the
 * block stays ONE card in the graph — its HA step is the only truth and is
 * saved unchanged — but the canvas shows one output per branch, the steps of
 * each branch as cards, and the branches meeting again at whatever follows
 * the block. Everything here is derived from the graph and never stored.
 */

/** Where a branch lives in the block's step, e.g. `['choose', 0, 'sequence']` or `['else']`. */
export type StepPath = readonly (string | number)[];

export type BranchLabel =
  | { kind: 'option'; number: number; alias?: string }
  | { kind: 'default' | 'then' | 'else' };

/** One output of a block: a branch and the steps in it. */
export interface Branch {
  /** The flow card whose HA step holds the branch (a nested block's branches too). */
  blockId: string;
  /** The block's handle id for this branch (`b0`, `b1` …). */
  handle: string;
  label: BranchLabel;
  /** Path of the branch's step list inside the block's step. */
  path: StepPath;
  /** Card ids of the branch's steps, in order. */
  cards: string[];
}

/** A branch card: which block it belongs to and where its step sits. */
export interface BranchCardRef {
  /** The flow card whose HA step holds this one. */
  blockId: string;
  /** The card it is drawn from — the flow card, or a block nested in a branch. */
  parentId: string;
  branch: Branch;
  /** Path of the step itself (`[...branch.path, index]`). */
  path: StepPath;
  index: number;
}

export interface BranchView {
  /** What the canvas draws: the flow's cards (moved right past expanded blocks) plus branch cards. */
  graph: FlowGraph;
  /** Expanded blocks and their branches. */
  branches: ReadonlyMap<string, readonly Branch[]>;
  /** Branch cards → where they live. */
  cards: ReadonlyMap<string, BranchCardRef>;
  /** How far each flow card is drawn to the right of its stored position. */
  shift: ReadonlyMap<string, number>;
  /** Where each branch card is drawn before the user's own offset (`FlowGraph.branchOffsets`). */
  base: ReadonlyMap<string, { x: number; y: number }>;
  /** Drawn edges standing for a stored edge (deleting one deletes that). */
  edgeOrigin: ReadonlyMap<string, string>;
  /**
   * Points a drawn line passes on its way: a branch runs straight on in its
   * lane to the end of the block before it turns to what follows, so lines
   * don't cut through the cards of other branches.
   */
  via: ReadonlyMap<string, readonly Point[]>;
}

/** Horizontal step between a block and its branch cards. */
const COLUMN = NODE_WIDTH + 100;
/** Vertical step between branches. */
const ROW = NODE_HEIGHT + 40;
const SEPARATOR = '::';

/** Room per output on a block card — a block with many branches grows taller. */
const HANDLE_SPACING = 24;

function blockHeight(branches: number): number {
  return Math.max(NODE_HEIGHT, (branches + 1) * HANDLE_SPACING);
}

/** A card's outputs and height as drawn: one output per branch on an expanded block, one on a branch card. */
export function cardShape(
  view: BranchView,
  node: FlowNode
): { handles: readonly (string | null)[]; height: number } {
  const branches = view.branches.get(node.id);
  if (branches)
    return { handles: branches.map((b) => b.handle), height: blockHeight(branches.length) };
  if (view.cards.has(node.id)) return { handles: [null], height: NODE_HEIGHT };
  return { handles: sourceHandles(node.type), height: NODE_HEIGHT };
}

/** "Option 2 · Licht an" / "Standard" / "Dann" / "Sonst" — the name of a branch's output. */
export function branchLabelText(language: string, label: BranchLabel): string {
  switch (label.kind) {
    case 'option': {
      const name = t(language, 'branchOption').replace('{n}', String(label.number));
      return label.alias ? `${name} · ${label.alias}` : name;
    }
    case 'default':
      return t(language, 'branchDefault');
    case 'then':
      return t(language, 'branchThen');
    case 'else':
      return t(language, 'branchElse');
  }
}

/** A branch card's id — also what a run's trace path maps to. */
export function branchCardId(blockId: string, path: StepPath): string {
  return `${blockId}${SEPARATOR}${path.join('.')}`;
}

export function isBranchCardId(id: string | null | undefined): boolean {
  return !!id?.includes(SEPARATOR);
}

/** A `choose` / `if` step — what the canvas expands, also inside a branch. */
function isBranching(step: unknown): step is Record<string, unknown> {
  return isPlainObject(step) && ('choose' in step || 'if' in step);
}

/** The HA step of a flow card that the canvas expands, if it is one. */
function branchingStep(node: FlowNode): Record<string, unknown> | null {
  if (node.type !== 'action') return null;
  const step = getRawStep(node.data);
  return isBranching(step) ? step : null;
}

function stepList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * The branches of a `choose` (options + default) or an `if` (then + else)
 * sitting at `at` inside the HA step of flow card `blockId`.
 */
function blockBranches(blockId: string, step: Record<string, unknown>, at: StepPath): Branch[] {
  const make = (label: BranchLabel, rel: StepPath, steps: unknown[], index: number): Branch => {
    const path = [...at, ...rel];
    return {
      blockId,
      handle: `b${index}`,
      label,
      path,
      cards: steps.map((_, i) => branchCardId(blockId, [...path, i])),
    };
  };
  if ('if' in step) {
    return [
      make({ kind: 'then' }, ['then'], stepList(step.then), 0),
      make({ kind: 'else' }, ['else'], stepList(step.else), 1),
    ];
  }
  const options = stepList(step.choose).map((option, i) => {
    const alias = isPlainObject(option) && typeof option.alias === 'string' ? option.alias : '';
    const sequence = isPlainObject(option) ? stepList(option.sequence) : [];
    return make(
      { kind: 'option', number: i + 1, ...(alias ? { alias } : {}) },
      ['choose', i, 'sequence'],
      sequence,
      i
    );
  });
  return [
    ...options,
    make({ kind: 'default' }, ['default'], stepList(step.default), options.length),
  ];
}

/** Columns and rows a step takes on the canvas — a block with all its branches, nested ones too. */
interface Extent {
  columns: number;
  rows: number;
}

function stepExtent(step: unknown): Extent {
  if (!isBranching(step)) return { columns: 1, rows: 1 };
  const branches = blockBranches('', step, []).map((branch) =>
    stepList(valueAt(step, branch.path)).map(stepExtent)
  );
  return {
    columns: 1 + Math.max(0, ...branches.map((steps) => steps.reduce((n, e) => n + e.columns, 0))),
    rows: Math.max(
      1,
      branches.reduce((n, steps) => n + Math.max(1, ...steps.map((e) => e.rows)), 0)
    ),
  };
}

function valueAt(root: unknown, path: StepPath): unknown {
  let current = root;
  for (const key of path) {
    if (typeof key === 'number') current = Array.isArray(current) ? current[key] : undefined;
    else current = isPlainObject(current) ? current[key] : undefined;
  }
  return current;
}

/** A copy of `root` with `path` set to `value` (missing lists/objects are created). */
function withValueAt(root: unknown, path: StepPath, value: unknown): unknown {
  const [key, ...rest] = path;
  if (key === undefined) return value;
  if (typeof key === 'number') {
    const list = Array.isArray(root) ? [...root] : [];
    list[key] = withValueAt(list[key], rest, value);
    return list;
  }
  const object = isPlainObject(root) ? { ...root } : {};
  object[key] = withValueAt(object[key], rest, value);
  return object;
}

/** Every card reachable from `id` along the flow's edges (not `id` itself). */
function downstream(graph: FlowGraph, id: string): Set<string> {
  const seen = new Set<string>();
  const queue = graph.edges.filter((e) => e.source === id).map((e) => e.target);
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined || next === id || seen.has(next)) continue;
    seen.add(next);
    for (const edge of graph.edges) if (edge.source === next) queue.push(edge.target);
  }
  return seen;
}

/** Where a line ends that leaves a card: the card, or every branch end of an expanded block. */
interface Exit {
  source: string;
  sourceHandle?: string;
  /** Bends the line takes before heading to what follows (see `BranchView.via`). */
  via: Point[];
  /** Where the line is so far — the source's output or its last bend. */
  end: Point;
}

type Point = { x: number; y: number };

/** `exit` running straight on in its lane up to `x` (the right edge of the block's widest branch). */
function extended(exit: Exit, x: number): Exit {
  if (exit.end.x >= x) return exit;
  const end = { x, y: exit.end.y };
  return { ...exit, via: [...exit.via, end], end };
}

/** Collects the branch cards, their lines and positions while a block is laid out. */
class BranchLayout {
  readonly nodes: FlowNode[] = [];
  readonly edges: FlowEdge[] = [];
  readonly cards = new Map<string, BranchCardRef>();
  readonly branches = new Map<string, Branch[]>();
  readonly base = new Map<string, Point>();
  /** Drawn lines standing for a stored edge. */
  readonly edgeOrigin = new Map<string, string>();
  readonly via = new Map<string, Point[]>();

  constructor(
    private readonly offsets: Readonly<Record<string, Point>>,
    private readonly blockId: string,
    private readonly root: Record<string, unknown>
  ) {}

  /** Lays out the branches of the block card `id` (its step at `at`), drawn at `origin`; returns its exits. */
  block(id: string, step: Record<string, unknown>, at: StepPath, origin: Point): Exit[] {
    const list = blockBranches(this.blockId, step, at);
    this.branches.set(id, list);
    const rows = list.map((branch) =>
      Math.max(1, ...stepList(valueAt(this.root, branch.path)).map((s) => stepExtent(s).rows))
    );
    // Lines leave the block only past its widest branch, each in its own lane until then.
    const columns = stepExtent(step).columns;
    const right = origin.x + (columns - 1) * COLUMN + NODE_WIDTH;
    // The branches stacked around the block's middle, each in a band of its rows.
    let top = origin.y + blockHeight(list.length) / 2 - (rows.reduce((a, b) => a + b, 0) * ROW) / 2;
    const exits: Exit[] = [];
    list.forEach((branch, index) => {
      const middle = top + ((rows[index] ?? 1) * ROW) / 2;
      top += (rows[index] ?? 1) * ROW;
      // An empty branch runs in its lane from where its first step would be.
      const lane = { x: origin.x + COLUMN, y: middle };
      let from: Exit[] = [
        columns > 1
          ? { source: id, sourceHandle: branch.handle, via: [lane], end: lane }
          : { source: id, sourceHandle: branch.handle, via: [], end: lane },
      ];
      let x = origin.x + COLUMN;
      branch.cards.forEach((card, i) => {
        const path = [...branch.path, i];
        const raw = valueAt(this.root, path);
        const nested = isBranching(raw) ? raw : null;
        const height = nested ? blockHeight(blockBranches('', nested, []).length) : NODE_HEIGHT;
        this.card(card, raw, { x, y: middle - height / 2 });
        this.cards.set(card, { blockId: this.blockId, parentId: id, branch, path, index: i });
        for (const exit of from) this.line(exit, card);
        const position = this.position(card);
        from = nested
          ? this.block(card, nested, path, position)
          : [
              {
                source: card,
                via: [],
                end: { x: position.x + NODE_WIDTH, y: position.y + NODE_HEIGHT / 2 },
              },
            ];
        x += stepExtent(raw).columns * COLUMN;
      });
      exits.push(...from.map((exit) => extended(exit, right)));
    });
    return exits;
  }

  /** A line from `exit` to `target`; `origin` is the stored edge it stands for, if any. */
  line(exit: Exit, target: string, origin?: string): void {
    const id = `${origin ?? target}${SEPARATOR}${exit.source}${SEPARATOR}${exit.sourceHandle ?? ''}`;
    if (origin) this.edgeOrigin.set(id, origin);
    if (exit.via.length > 0) this.via.set(id, exit.via);
    this.edges.push({
      id,
      source: exit.source,
      target,
      ...(exit.sourceHandle ? { sourceHandle: exit.sourceHandle } : {}),
    });
  }

  /** Where a branch card is drawn: its place in the layout plus where the user moved it. */
  private position(id: string): Point {
    const base = this.base.get(id) ?? { x: 0, y: 0 };
    const offset = this.offsets[id];
    return offset ? { x: base.x + offset.x, y: base.y + offset.y } : base;
  }

  private card(id: string, raw: unknown, base: Point): void {
    this.base.set(id, base);
    const position = this.position(id);
    const { type, data } = stepToNode('action', isPlainObject(raw) ? raw : {});
    const card = NodeSchema.safeParse({ id, type, data, position });
    // A step no card can show still keeps its place (and the line through it).
    this.nodes.push(
      card.success ? card.data : { id, type: 'action', data: { [RAW_STEP_KEY]: raw }, position }
    );
  }
}

/** The canvas' picture of `graph` with every `choose` / `if` card expanded into its branches. */
export function branchView(graph: FlowGraph): BranchView {
  const blocks = graph.nodes
    .map((node) => ({ node, step: branchingStep(node) }))
    .filter((b): b is { node: FlowNode; step: Record<string, unknown> } => b.step !== null)
    .sort((a, b) => a.node.position.x - b.node.position.x || a.node.position.y - b.node.position.y);
  if (blocks.length === 0) {
    return {
      graph,
      branches: new Map(),
      cards: new Map(),
      shift: new Map(),
      base: new Map(),
      edgeOrigin: new Map(),
      via: new Map(),
    };
  }

  // Cards after a block move right by the width of its widest branch.
  const shift = new Map<string, number>();
  for (const { node, step } of blocks) {
    const columns = stepExtent(step).columns - 1;
    if (columns === 0) continue;
    for (const id of downstream(graph, node.id)) {
      shift.set(id, (shift.get(id) ?? 0) + columns * COLUMN);
    }
  }
  const at = (node: FlowNode) => ({
    x: node.position.x + (shift.get(node.id) ?? 0),
    y: node.position.y,
  });

  const nodes: FlowNode[] = graph.nodes.map((node) =>
    shift.has(node.id) ? { ...node, position: at(node) } : node
  );
  const cards = new Map<string, BranchCardRef>();
  const branches = new Map<string, Branch[]>();
  const base = new Map<string, Point>();
  const edges: FlowEdge[] = [];
  const edgeOrigin = new Map<string, string>();
  const via = new Map<string, Point[]>();
  for (const { node, step } of blocks) {
    const layout = new BranchLayout(graph.branchOffsets ?? {}, node.id, step);
    const exits = layout.block(node.id, step, [], at(node));
    // Every branch ends where the block continues.
    for (const edge of graph.edges.filter((e) => e.source === node.id)) {
      for (const exit of exits) layout.line(exit, edge.target, edge.id);
    }
    nodes.push(...layout.nodes);
    edges.push(...layout.edges);
    for (const [id, ref] of layout.cards) cards.set(id, ref);
    for (const [id, list] of layout.branches) branches.set(id, list);
    for (const [id, point] of layout.base) base.set(id, point);
    for (const [id, origin] of layout.edgeOrigin) edgeOrigin.set(id, origin);
    for (const [id, points] of layout.via) via.set(id, points);
  }
  const blockIds = new Set(blocks.map((b) => b.node.id));
  return {
    graph: {
      ...graph,
      nodes,
      edges: [...graph.edges.filter((e) => !blockIds.has(e.source)), ...edges],
    },
    branches,
    cards,
    shift,
    base,
    edgeOrigin,
    via,
  };
}

/** Like `branchView`, but computed once per graph (the canvas and panel both ask on every render). */
const views = new WeakMap<FlowGraph, BranchView>();
export function cachedBranchView(graph: FlowGraph): BranchView {
  let view = views.get(graph);
  if (!view) {
    view = branchView(graph);
    views.set(graph, view);
  }
  return view;
}

/** Replaces the block's branch list at `path` (validated like any card edit). */
function setBranchList(
  graph: FlowGraph,
  blockId: string,
  path: StepPath,
  change: (steps: unknown[]) => unknown[]
): { graph: FlowGraph; error: string | null } {
  const block = graph.nodes.find((n) => n.id === blockId);
  const step = block ? getRawStep(block.data) : null;
  if (!block || !step) return { graph, error: 'missing' };
  const steps = change(stepList(valueAt(step, path)));
  // An emptied `else` / `default` is left out, as HA's own editor does.
  const key = path.at(-1);
  const owner = path.slice(0, -1);
  const parent = valueAt(step, owner);
  let next: unknown;
  if ((key === 'else' || key === 'default') && steps.length === 0 && isPlainObject(parent)) {
    const { [key]: _removed, ...rest } = parent;
    next = withValueAt(step, owner, rest);
  } else {
    next = withValueAt(step, path, steps);
  }
  return updateNodeData(graph, blockId, { ...block.data, [RAW_STEP_KEY]: next });
}

/** Writes HA's edited step back into its branch. */
export function setBranchStep(
  graph: FlowGraph,
  ref: BranchCardRef,
  step: Record<string, unknown>
): { graph: FlowGraph; error: string | null } {
  return setBranchList(graph, ref.blockId, ref.branch.path, (steps) =>
    steps.map((s, i) => (i === ref.index ? step : s))
  );
}

export function removeBranchStep(graph: FlowGraph, ref: BranchCardRef): FlowGraph {
  const result = setBranchList(graph, ref.blockId, ref.branch.path, (steps) =>
    steps.filter((_, i) => i !== ref.index)
  );
  return renumberOffsets(result.graph, ref.blockId, ref.branch.path, ref.index, -1);
}

type Offsets = Record<string, { x: number; y: number }>;

function withOffsets(graph: FlowGraph, offsets: Offsets): FlowGraph {
  const { branchOffsets: _old, ...rest } = graph;
  return Object.keys(offsets).length > 0 ? { ...rest, branchOffsets: offsets } : rest;
}

/**
 * Branch card ids are their place in the block, so a step added to or removed
 * from a branch renumbers the moved cards after it (`delta` +1 / -1); a
 * removed card's offsets — and those of steps nested in it — go with it.
 */
function renumberOffsets(
  graph: FlowGraph,
  blockId: string,
  path: StepPath,
  index: number,
  delta: 1 | -1
): FlowGraph {
  const offsets = graph.branchOffsets;
  if (!offsets) return graph;
  const prefix = `${branchCardId(blockId, path)}.`;
  const next: Offsets = {};
  for (const [id, offset] of Object.entries(offsets)) {
    const [number = '', ...rest] = id.startsWith(prefix) ? id.slice(prefix.length).split('.') : [];
    const n = Number(number);
    if (number === '' || !Number.isInteger(n) || n < index) {
      next[id] = offset;
    } else if (delta === 1 || n > index) {
      next[`${prefix}${[n + delta, ...rest].join('.')}`] = offset;
    }
  }
  return withOffsets(graph, next);
}

/** The flow with branch card `id` moved so it is drawn at `drawn`. */
export function moveBranchCard(
  graph: FlowGraph,
  view: BranchView,
  id: string,
  drawn: { x: number; y: number }
): FlowGraph {
  const base = view.base.get(id);
  if (!base) return graph;
  const { [id]: _old, ...offsets } = graph.branchOffsets ?? {};
  const x = drawn.x - base.x;
  const y = drawn.y - base.y;
  return withOffsets(graph, x === 0 && y === 0 ? offsets : { ...offsets, [id]: { x, y } });
}

/** The flow without offsets of branch cards it no longer has (the block was edited or removed). */
export function withoutStaleOffsets(graph: FlowGraph): FlowGraph {
  const offsets = graph.branchOffsets;
  if (!offsets) return graph;
  const { cards } = cachedBranchView(graph);
  return withOffsets(
    graph,
    Object.fromEntries(Object.entries(offsets).filter(([id]) => cards.has(id)))
  );
}

/** Where a new step goes when "+" is pressed on a block's branch output or on a branch card. */
export interface BranchInsert {
  blockId: string;
  branch: Branch;
  index: number;
}

export function branchInsertAt(
  view: BranchView,
  source: string,
  handle: string | null | undefined
): BranchInsert | null {
  // A block's output first — a block nested in a branch is a branch card too.
  const branch = handle ? view.branches.get(source)?.find((b) => b.handle === handle) : undefined;
  if (branch) return { blockId: branch.blockId, branch, index: 0 };
  const card = view.cards.get(source);
  return card ? { blockId: card.blockId, branch: card.branch, index: card.index + 1 } : null;
}

/** Adds `step` to a branch; returns the new graph and the new card's id. */
export function insertBranchStep(
  graph: FlowGraph,
  at: BranchInsert,
  step: Record<string, unknown>
): { graph: FlowGraph; id: string } {
  const result = setBranchList(graph, at.blockId, at.branch.path, (steps) => [
    ...steps.slice(0, at.index),
    step,
    ...steps.slice(at.index),
  ]);
  return {
    graph: renumberOffsets(result.graph, at.blockId, at.branch.path, at.index, 1),
    id: branchCardId(at.blockId, [...at.branch.path, at.index]),
  };
}

/**
 * A connection started at a branch (its output or its last card) means "after
 * the block": every branch continues there.
 */
export function connectionSource(
  view: BranchView,
  source: string,
  handle: string | null
): { source: string; sourceHandle: string | null } {
  const card = view.cards.get(source);
  if (card) return { source: card.blockId, sourceHandle: null };
  return view.branches.has(source)
    ? { source, sourceHandle: null }
    : { source, sourceHandle: handle };
}

/** A stored position for a card that should appear at `drawn`. */
export function storedPosition(
  view: BranchView,
  id: string,
  drawn: { x: number; y: number }
): { x: number; y: number } {
  return { x: drawn.x - (view.shift.get(id) ?? 0), y: drawn.y };
}

const BRANCH_KEYS: ReadonlySet<string> = new Set(['choose', 'default', 'then', 'else']);

/**
 * The branch card a trace path is about: `action/1/choose/0/sequence/2` →
 * the third step of option 1 of the block at `action/1` (`blockAt` maps a
 * path to its flow card), `…/else/1/choose/0/sequence/0` → a step in a block
 * nested in a branch. Deeper paths belong to the innermost card holding them;
 * a block's own option conditions stay with the block.
 */
export function branchCardForPath(
  view: BranchView,
  path: string,
  blockAt: (path: string) => string | undefined
): string | undefined {
  const segments = path.split('/');
  const start = segments.findIndex((segment, i) => {
    if (i === 0 || !BRANCH_KEYS.has(segment)) return false;
    const id = blockAt(segments.slice(0, i).join('/'));
    return id !== undefined && view.branches.has(id) && !view.cards.has(id);
  });
  const blockId = start > 0 ? blockAt(segments.slice(0, start).join('/')) : undefined;
  if (!blockId) return undefined;
  const rest = segments.slice(start).map((s) => (/^\d+$/.test(s) ? Number(s) : s));
  for (let end = rest.length; end > 0; end--) {
    const id = branchCardId(blockId, rest.slice(0, end));
    if (view.cards.has(id)) return id;
  }
  return undefined;
}
