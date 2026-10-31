import {
  type AnnotationColor,
  type Axis,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
  flowAxis,
  getRawStep,
  isPlainObject,
  LAYER_GAP,
  NODE_GAP,
  NodeSchema,
  RAW_STEP_KEY,
} from '@flode/shared';
import { stepIsOn, stopKind } from '@flode/ui-core';
import {
  addNode,
  byFlowOrder,
  CARD_SIZE,
  cardHandles,
  incoming,
  isDrawnEdge,
  lineRoom,
  NODE_HEIGHT,
  NODE_WIDTH,
  outgoing,
  PORT_ROW,
  removeNode,
  sourceHandles,
  updateNodeData,
} from './flow-model';
import { nodeToStep, stepToNode } from './ha-step';
import { lineKey, withLinesKept } from './line-bends';
import { t } from './strings';

/**
 * HA's branching blocks (`choose`, `if`, `parallel` #39) drawn with their branches (#27): the
 * block stays ONE card in the graph — its HA step is the only truth and is
 * saved unchanged — but the canvas shows one output per branch, the steps of
 * each branch as cards, and the branches meeting again at whatever follows
 * the block. Everything here is derived from the graph and never stored.
 */

/** Where a branch lives in the block's step, e.g. `['choose', 0, 'sequence']` or `['else']`. */
export type StepPath = readonly (string | number)[];

export type BranchLabel =
  | { kind: 'option' | 'parallel'; number: number; alias?: string }
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
  /**
   * A `parallel` item that is one step of its own, not a `sequence`: `path`
   * is that step's, and a second step makes it a `sequence` (#39).
   */
  single: boolean;
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
  /** Path of the step itself (`[...branch.path, index]`, a single `parallel` item's own path). */
  path: StepPath;
  index: number;
}

export interface BranchView {
  /** What the canvas draws: the flow's cards (moved on past expanded blocks) plus branch cards. */
  graph: FlowGraph;
  /** Which way the flow runs (#29). */
  axis: Axis;
  /** Expanded blocks and their branches. */
  branches: ReadonlyMap<string, readonly Branch[]>;
  /** Branch cards → where they live. */
  cards: ReadonlyMap<string, BranchCardRef>;
  /** How far each flow card is drawn further along the flow than its stored position. */
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
  /**
   * Blocks nothing follows yet: where their "+" for a step after the whole
   * block sits, and the branch ends that lead there.
   */
  tails: ReadonlyMap<string, BlockTail>;
  /** Drawn lines that begin at a block's "+" instead of at a card's output. */
  start: ReadonlyMap<string, Point>;
  /** Branch cards that end the run (a stop last in its branch, #38) and how. */
  ends: ReadonlyMap<string, 'done' | 'error'>;
}

/** The end of a block nothing follows yet (see `BranchView.tails`). */
export interface BlockTail {
  at: Point;
  exits: readonly Exit[];
  /** The flow runs on through this "+" (a block last in its branch): its lines are real ones. */
  through: boolean;
}

/**
 * Step along the flow between a block and its branch cards (`column`), and
 * across it between branches (`row`) — per direction.
 */
const SPACING = {
  right: { column: NODE_WIDTH + 100, row: NODE_HEIGHT + 40 },
  down: { column: NODE_HEIGHT + PORT_ROW + LAYER_GAP.down, row: NODE_WIDTH + NODE_GAP },
} as const;
const SEPARATOR = '::';

/** Room per output on a block card — left to right, a block with many branches grows taller. */
const HANDLE_SPACING = 24;

/**
 * How big a card with named outputs (a block's branches, a condition's Yes /
 * No) is drawn: left to right they sit along its right edge (it grows taller
 * for many); top to bottom along its bottom edge, below a row for their names.
 */
function cardSize(axis: Axis, outputs: number): { width: number; height: number } {
  if (axis.direction === 'down') return { width: NODE_WIDTH, height: NODE_HEIGHT + PORT_ROW };
  return { width: NODE_WIDTH, height: Math.max(NODE_HEIGHT, (outputs + 1) * HANDLE_SPACING) };
}

/**
 * A stop card nothing follows (last in its branch, or with no line out): the
 * run ends there, so it has no output and no "+" (#38). A stop with steps
 * after it keeps its output — those steps are still in the automation.
 * Says how the run ends, null for any other card.
 */
export function endsRun(view: BranchView, node: FlowNode): 'done' | 'error' | null {
  if (view.cards.has(node.id)) return view.ends.get(node.id) ?? null;
  return outgoing(view.graph, node.id, null).length === 0 ? stopKind(node.data) : null;
}

/** A card's outputs and height as drawn: one output per branch on an expanded block, one on a branch card. */
export function cardShape(
  view: BranchView,
  node: FlowNode
): { handles: readonly (string | null)[]; height: number } {
  const branches = view.branches.get(node.id);
  if (branches) {
    const { height } = cardSize(view.axis, branches.length);
    return { handles: branches.map((b) => b.handle), height };
  }
  if (endsRun(view, node)) return { handles: [], height: NODE_HEIGHT };
  if (view.cards.has(node.id)) return { handles: [null], height: NODE_HEIGHT };
  const handles = cardHandles(view.graph, node);
  // A condition's Yes / No: named outputs, so top to bottom a row for the names.
  return {
    handles,
    height: handles.length > 1 ? cardSize(view.axis, 2).height : NODE_HEIGHT,
  };
}

/**
 * "Option 2 · Licht an" / "Parallel 1" / "Standard" / "Dann" / "Sonst" — the
 * name of a branch's output; `short`, where many sit side by side, a numbered
 * one is just "2".
 */
export function branchLabelText(language: string, label: BranchLabel, short = false): string {
  switch (label.kind) {
    case 'option':
    case 'parallel': {
      if (short) return String(label.number);
      const key = label.kind === 'option' ? 'branchOption' : 'branchParallel';
      const name = t(language, key).replace('{n}', String(label.number));
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

/** A `choose` / `if` / `parallel` step — what the canvas expands, also inside a branch. */
function isBranching(step: unknown): step is Record<string, unknown> {
  return (
    isPlainObject(step) &&
    ('choose' in step || 'if' in step || ('parallel' in step && Array.isArray(step.parallel)))
  );
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

/** The steps of `branch` in `root` (the block's step, or the flow card's that holds it). */
function branchSteps(root: unknown, branch: Pick<Branch, 'path' | 'single'>): unknown[] {
  const value = valueAt(root, branch.path);
  return branch.single ? [value] : stepList(value);
}

/** Path of the step at `index` of `branch`. */
function stepPath(branch: Pick<Branch, 'path' | 'single'>, index: number): StepPath {
  return branch.single ? branch.path : [...branch.path, index];
}

/** Where a `parallel` branch's item sits: the block's `parallel` list and its index there. */
function parallelItem(branch: Branch): { list: StepPath; index: number } | null {
  if (branch.label.kind !== 'parallel') return null;
  const index = branch.label.number - 1;
  const item = branch.single ? branch.path : branch.path.slice(0, -1);
  return { list: item.slice(0, -1), index };
}

/** Path of a branch's step list once written (a single `parallel` item becomes a `sequence`). */
function listPath(branch: Branch): StepPath {
  return branch.single ? [...branch.path, 'sequence'] : branch.path;
}

/** Steps that end every run through them: a stop, or a block whose branches all do. */
function alwaysStops(steps: readonly unknown[]): boolean {
  return steps.some(
    (step) =>
      stopKind(step) !== null ||
      (isBranching(step) &&
        stepIsOn(step) &&
        blockBranches('', step, []).every((b) => alwaysStops(branchSteps(step, b))))
  );
}

/**
 * Whether the stops in a block may end their branches (#38): not when the
 * block does not run, nor when every branch stops but a step still follows —
 * that step could never run, and its line stays drawn so it can be seen and
 * removed.
 */
function stopsEnd(step: unknown, followed: boolean): boolean {
  return stepIsOn(step) && !(followed && alwaysStops([getRawStep(step) ?? step]));
}

/**
 * The branches of a `choose` (options + default), an `if` (then + else) or a
 * `parallel` (one per item) sitting at `at` inside the HA step of flow card `blockId`.
 */
function blockBranches(blockId: string, step: Record<string, unknown>, at: StepPath): Branch[] {
  const make = (
    label: BranchLabel,
    rel: StepPath,
    steps: unknown[],
    index: number,
    single = false
  ): Branch => {
    const path = [...at, ...rel];
    return {
      blockId,
      handle: `b${index}`,
      label,
      path,
      single,
      cards: steps.map((_, i) => branchCardId(blockId, stepPath({ path, single }, i))),
    };
  };
  if ('parallel' in step) {
    // Each item runs at the same time as the others: a `sequence` of steps, or one step.
    return stepList(step.parallel).map((item, i) => {
      const sequence = isPlainObject(item) && Array.isArray(item.sequence);
      const alias =
        sequence && typeof item.alias === 'string' && item.alias ? { alias: item.alias } : {};
      const label: BranchLabel = { kind: 'parallel', number: i + 1, ...alias };
      return sequence
        ? make(label, ['parallel', i, 'sequence'], stepList(item.sequence), i)
        : make(label, ['parallel', i], [item], i, true);
    });
  }
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
    branchSteps(step, branch).map(stepExtent)
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
export interface Exit {
  source: string;
  sourceHandle?: string;
  /** Bends the line takes before heading to what follows (see `BranchView.via`). */
  via: Point[];
  /** Where the line is so far — the source's output or its last bend. */
  end: Point;
  /** Where the line begins, when not at the source's output (a block's "+" it runs through). */
  start?: Point;
}

export type Point = { x: number; y: number };

/** `exit` running straight on in its lane up to `main` (the far edge of the block's widest branch). */
function extended(axis: Axis, exit: Exit, main: number): Exit {
  if (axis.main(exit.end) >= main) return exit;
  const end = axis.at(main, axis.cross(exit.end));
  return { ...exit, via: [...exit.via, end], end };
}

/**
 * `exit` with its lane brought to the row `cross`: the first step of a branch
 * moved off its row takes the lane into it along (#31) — left where the step
 * was laid out, the line would climb to that row and back down to the step.
 */
function laneAt(axis: Axis, exit: Exit, cross: number): Exit {
  if (exit.via.length === 0) return exit;
  const via = exit.via.map((p) => axis.at(axis.main(p), cross));
  return { ...exit, via, end: via[via.length - 1] ?? exit.end };
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
  /** Blocks last in a branch: their "+" for a step after them, still in that branch. */
  readonly tails = new Map<string, BlockTail>();
  readonly start = new Map<string, Point>();
  readonly ends = new Map<string, 'done' | 'error'>();

  constructor(
    private readonly axis: Axis,
    private readonly offsets: Readonly<Record<string, Point>>,
    private readonly blockId: string,
    private readonly root: Record<string, unknown>
  ) {}

  /**
   * Lays out the branches of the block card `id` (its step at `at`), drawn at
   * `origin`; returns its exits. `ending`: its stops may end their branches
   * (see `stopsEnd`).
   */
  block(
    id: string,
    step: Record<string, unknown>,
    at: StepPath,
    origin: Point,
    ending: boolean
  ): Exit[] {
    const axis = this.axis;
    const { column, row } = SPACING[axis.direction];
    const list = blockBranches(this.blockId, step, at);
    this.branches.set(id, list);
    const rows = list.map((branch) =>
      Math.max(1, ...branchSteps(this.root, branch).map((s) => stepExtent(s).rows))
    );
    // Lines leave the block only past its widest branch, each in its own lane until then.
    const columns = stepExtent(step).columns;
    const start = axis.main(origin);
    const end = start + (columns - 1) * column + axis.length(CARD_SIZE);
    // The branches side by side around the block's middle, each in a band of its rows.
    let band =
      axis.cross(origin) +
      axis.breadth(cardSize(axis, list.length)) / 2 -
      (rows.reduce((a, b) => a + b, 0) * row) / 2;
    const exits: Exit[] = [];
    list.forEach((branch, index) => {
      const middle = band + ((rows[index] ?? 1) * row) / 2;
      band += (rows[index] ?? 1) * row;
      // An empty branch runs in its lane from where its first step would be.
      const lane = axis.at(start + column, middle);
      let from: Exit[] = [
        columns > 1
          ? { source: id, sourceHandle: branch.handle, via: [lane], end: lane }
          : { source: id, sourceHandle: branch.handle, via: [], end: lane },
      ];
      let main = start + column;
      branch.cards.forEach((card, i) => {
        const path = stepPath(branch, i);
        const raw = valueAt(this.root, path);
        const nested = isBranching(raw) ? raw : null;
        const size = nested ? cardSize(axis, blockBranches('', nested, []).length) : CARD_SIZE;
        this.card(card, raw, axis.at(main, middle - axis.breadth(size) / 2));
        this.cards.set(card, { blockId: this.blockId, parentId: id, branch, path, index: i });
        const position = this.position(card);
        const into = axis.cross(position) + axis.breadth(size) / 2;
        for (const exit of from) this.line(i === 0 ? laneAt(axis, exit, into) : exit, card);
        const last = i === branch.cards.length - 1;
        // Last in its branch, a block that always stops ends the branch too.
        from = nested
          ? this.block(card, nested, path, position, ending && stopsEnd(nested, !last))
          : [
              {
                source: card,
                via: [],
                end: axis.at(
                  axis.main(position) + axis.length(CARD_SIZE),
                  axis.cross(position) + axis.breadth(CARD_SIZE) / 2
                ),
              },
            ];
        // A stop last in its branch ends the run there: nothing leads on from it (#38).
        const ends = ending && last ? stopKind(raw) : null;
        if (ends) {
          this.ends.set(card, ends);
          from = [];
        }
        // A block last in its branch: its branches meet at its "+" for a step
        // after it, and from there the line goes on to what follows the outer
        // block — unless every branch of it stopped.
        if (nested && last && from.length > 0) {
          const outputs = this.branches.get(card)?.length ?? 0;
          const limit = main + stepExtent(raw).columns * column;
          const tail = nestedTail(axis, position, outputs, from, limit);
          this.tails.set(card, tail);
          from = [{ source: card, start: tail.at, via: [], end: tail.at }];
        }
        main += stepExtent(raw).columns * column;
      });
      exits.push(...from.map((exit) => extended(axis, exit, end)));
    });
    return exits;
  }

  /** A line from `exit` to `target`; `origin` is the stored edge it stands for, if any. */
  line(exit: Exit, target: string, origin?: string): void {
    const id = `${origin ?? target}${SEPARATOR}${exit.source}${SEPARATOR}${exit.sourceHandle ?? ''}`;
    if (origin) this.edgeOrigin.set(id, origin);
    if (exit.via.length > 0) this.via.set(id, exit.via);
    if (exit.start) this.start.set(id, exit.start);
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
  const axis = flowAxis(graph);
  const order = byFlowOrder(axis);
  const blocks = graph.nodes
    .map((node) => ({ node, step: branchingStep(node) }))
    .filter((b): b is { node: FlowNode; step: Record<string, unknown> } => b.step !== null)
    .sort((a, b) => order(a.node, b.node));
  if (blocks.length === 0) {
    return {
      graph,
      axis,
      branches: new Map(),
      cards: new Map(),
      shift: new Map(),
      base: new Map(),
      edgeOrigin: new Map(),
      via: new Map(),
      tails: new Map(),
      start: new Map(),
      ends: new Map(),
    };
  }

  // Cards after a block move on along the flow by the length of its longest branch.
  const { column } = SPACING[axis.direction];
  const shift = new Map<string, number>();
  for (const { node, step } of blocks) {
    const columns = stepExtent(step).columns - 1;
    if (columns === 0) continue;
    for (const id of downstream(graph, node.id)) {
      shift.set(id, (shift.get(id) ?? 0) + columns * column);
    }
  }
  const at = (node: FlowNode) =>
    axis.at(axis.main(node.position) + (shift.get(node.id) ?? 0), axis.cross(node.position));

  const nodes: FlowNode[] = graph.nodes.map((node) =>
    shift.has(node.id) ? { ...node, position: at(node) } : node
  );
  const cards = new Map<string, BranchCardRef>();
  const branches = new Map<string, Branch[]>();
  const base = new Map<string, Point>();
  const edges: FlowEdge[] = [];
  const edgeOrigin = new Map<string, string>();
  const via = new Map<string, Point[]>();
  const tails = new Map<string, BlockTail>();
  const start = new Map<string, Point>();
  const ends = new Map<string, 'done' | 'error'>();
  for (const { node, step } of blocks) {
    const layout = new BranchLayout(axis, graph.branchOffsets ?? {}, node.id, step);
    const origin = at(node);
    // Every branch ends where the block continues.
    const next = graph.edges.filter((e) => e.source === node.id);
    const followed = next.some(isDrawnEdge);
    const exits = layout.block(node.id, step, [], origin, stopsEnd(node.data, followed));
    for (const edge of next) {
      for (const exit of exits) layout.line(exit, edge.target, edge.id);
    }
    const outputs = layout.branches.get(node.id)?.length ?? 0;
    // A hint edge (the transpiler's, not drawn) is no step after the block.
    if (!followed && exits.length > 0) {
      tails.set(node.id, blockTail(axis, origin, outputs, exits));
    }
    nodes.push(...layout.nodes);
    edges.push(...layout.edges);
    for (const [id, ref] of layout.cards) cards.set(id, ref);
    for (const [id, list] of layout.branches) branches.set(id, list);
    for (const [id, point] of layout.base) base.set(id, point);
    for (const [id, origin] of layout.edgeOrigin) edgeOrigin.set(id, origin);
    for (const [id, points] of layout.via) via.set(id, points);
    for (const [id, tail] of layout.tails) tails.set(id, tail);
    for (const [id, point] of layout.start) start.set(id, point);
    for (const [id, kind] of layout.ends) ends.set(id, kind);
  }
  const blockIds = new Set(blocks.map((b) => b.node.id));
  return {
    graph: {
      ...graph,
      nodes,
      edges: [...graph.edges.filter((e) => !blockIds.has(e.source)), ...edges],
    },
    axis,
    branches,
    cards,
    shift,
    base,
    edgeOrigin,
    via,
    tails,
    start,
    ends,
  };
}

/** Where the next card would start past a block's last column, level with the block card's middle. */
function blockTail(axis: Axis, origin: Point, outputs: number, exits: readonly Exit[]): BlockTail {
  const { column } = SPACING[axis.direction];
  const end = Math.max(...exits.map((exit) => axis.main(exit.end)));
  const gap = column - axis.length(CARD_SIZE);
  return {
    at: axis.at(end + gap, axis.cross(origin) + axis.breadth(cardSize(axis, outputs)) / 2),
    exits,
    through: false,
  };
}

/**
 * The "+" after a block last in a branch, where its branches meet: halfway
 * from its branch ends to where a line from it still reaches `limit` (the
 * start of a next step in that branch) as a plain curve. Blocks nested in
 * each other that all end their branch get their "+" one after the other and
 * never closer to what follows than that — not half a gap each, piling up
 * until the line has to run back around the next card (#28).
 */
function nestedTail(
  axis: Axis,
  origin: Point,
  outputs: number,
  exits: readonly Exit[],
  limit: number
): BlockTail {
  const { column } = SPACING[axis.direction];
  const { at } = blockTail(axis, origin, outputs, exits);
  const end = Math.max(...exits.map((exit) => axis.main(exit.end)));
  // A branch card moved past the limit: half a gap past the branch ends, as before.
  const reach = limit - lineRoom(axis);
  const main = reach > end ? (end + reach) / 2 : end + (column - axis.length(CARD_SIZE)) / 2;
  return { at: axis.at(main, axis.cross(at)), exits, through: true };
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

/** Replaces the steps of `branch` (validated like any card edit). */
function setBranchList(
  graph: FlowGraph,
  branch: Branch,
  change: (steps: unknown[]) => unknown[]
): { graph: FlowGraph; error: string | null } {
  const { blockId, path } = branch;
  const block = graph.nodes.find((n) => n.id === blockId);
  const step = block ? getRawStep(block.data) : null;
  if (!block || !step) return { graph, error: 'missing' };
  const steps = change(branchSteps(step, branch));
  const item = parallelItem(branch);
  if (item && steps.length === 0) {
    // An emptied `parallel` branch goes: nothing would run in it.
    const items = stepList(valueAt(step, item.list)).filter((_, i) => i !== item.index);
    return updateNodeData(graph, blockId, {
      ...block.data,
      [RAW_STEP_KEY]: withValueAt(step, item.list, items),
    });
  }
  if (branch.single) {
    // One step stays a `parallel` item of its own, more become a `sequence`.
    const value = steps.length === 1 ? steps[0] : { sequence: steps };
    return updateNodeData(graph, blockId, {
      ...block.data,
      [RAW_STEP_KEY]: withValueAt(step, path, value),
    });
  }
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
  return setBranchList(graph, ref.branch, (steps) =>
    steps.map((s, i) => (i === ref.index ? step : s))
  );
}

/**
 * "Disconnect" on a branch step (#35): out of its branch, kept as a card of
 * its own where it was drawn — a step of the flow again, connected to nothing.
 */
export function detachBranchStep(graph: FlowGraph, ref: BranchCardRef, drawn: FlowNode): FlowGraph {
  return addNode(
    removeBranchStep(graph, ref),
    drawn.type,
    drawn.position,
    undefined,
    structuredClone(drawn.data)
  ).graph;
}

export function removeBranchStep(graph: FlowGraph, ref: BranchCardRef): FlowGraph {
  const result = setBranchList(graph, ref.branch, (steps) =>
    steps.filter((_, i) => i !== ref.index)
  );
  // The last step of a `parallel` branch takes the branch with it: the ones after move up.
  const item = parallelItem(ref.branch);
  if (item && ref.branch.cards.length === 1) {
    return renumberOffsets(result.graph, ref.blockId, item.list, item.index, -1);
  }
  return renumberOffsets(result.graph, ref.blockId, ref.branch.path, ref.index, -1);
}

type Offsets = Record<string, { x: number; y: number }>;

function withOffsets(graph: FlowGraph, offsets: Offsets): FlowGraph {
  const { branchOffsets: _old, ...rest } = graph;
  return Object.keys(offsets).length > 0 ? { ...rest, branchOffsets: offsets } : rest;
}

/** `record` with its ids changed by `rekey` (`null`: the entry goes); `undefined` once empty. */
function rekeyed<T>(
  record: Readonly<Record<string, T>> | undefined,
  rekey: (id: string) => string | null
): Record<string, T> | undefined {
  if (!record) return undefined;
  const next: Record<string, T> = {};
  for (const [id, value] of Object.entries(record)) {
    const to = rekey(id);
    if (to !== null) next[to] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * What the flow keeps per drawn card id — where a branch card was moved to
 * and a card's colour (#28) — with the ids changed by `rekey`.
 */
function withCardsRekeyed(graph: FlowGraph, rekey: (id: string) => string | null): FlowGraph {
  const { branchOffsets, cardColors, ...rest } = graph;
  const offsets = rekeyed(branchOffsets, rekey);
  const colors = rekeyed(cardColors, rekey);
  return {
    ...rest,
    ...(offsets ? { branchOffsets: offsets } : {}),
    ...(colors ? { cardColors: colors } : {}),
  };
}

/**
 * Branch card ids are their place in the block, so a step added to or removed
 * from a branch renumbers the cards after it (`delta` +1 / -1) — their
 * offsets and colours with them; a removed card's — and those of steps nested
 * in it — go with it.
 */
function renumberOffsets(
  graph: FlowGraph,
  blockId: string,
  path: StepPath,
  index: number,
  delta: 1 | -1
): FlowGraph {
  if (!graph.branchOffsets && !graph.cardColors) return graph;
  const prefix = `${branchCardId(blockId, path)}.`;
  return withCardsRekeyed(graph, (id) => {
    const [number = '', ...rest] = id.startsWith(prefix) ? id.slice(prefix.length).split('.') : [];
    const n = Number(number);
    if (number === '' || !Number.isInteger(n) || n < index) return id;
    if (delta === -1 && n === index) return null;
    return `${prefix}${[n + delta, ...rest].join('.')}`;
  });
}

/** Offsets and colours of card `from` and the cards nested in it, moved to card `to` (its step moved there). */
function movedOffsets(graph: FlowGraph, from: string, to: string): FlowGraph {
  if (!graph.branchOffsets && !graph.cardColors) return graph;
  return withCardsRekeyed(graph, (id) =>
    id === from || id.startsWith(`${from}.`) ? `${to}${id.slice(from.length)}` : id
  );
}

/** The flow with cards `ids` tinted `color`, or back to their own colour (`null`) (#28). */
export function tintCards(
  graph: FlowGraph,
  ids: readonly string[],
  color: AnnotationColor | null
): FlowGraph {
  const { cardColors, ...rest } = graph;
  const colors = { ...cardColors };
  for (const id of ids) {
    if (color) colors[id] = color;
    else delete colors[id];
  }
  return Object.keys(colors).length > 0 ? { ...rest, cardColors: colors } : rest;
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

/**
 * The flow without offsets, colours and bends of cards and lines it no longer
 * has (a block was edited, a card removed).
 */
export function withoutStaleOffsets(graph: FlowGraph): FlowGraph {
  if (!graph.branchOffsets && !graph.cardColors && !graph.lineBends) return graph;
  const view = cachedBranchView(graph);
  const drawn = new Set(view.graph.nodes.map((node) => node.id));
  const lines = new Set(view.graph.edges.map(lineKey));
  return withLinesKept(
    withCardsRekeyed(graph, (id) => (drawn.has(id) ? id : null)),
    lines
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
  return insertBranchSteps(graph, at, [step]);
}

/** Adds `added` to a branch one after the other; returns the new graph and the first new card's id. */
function insertBranchSteps(
  graph: FlowGraph,
  at: BranchInsert,
  added: readonly unknown[]
): { graph: FlowGraph; id: string } {
  const { blockId, branch, index } = at;
  const result = setBranchList(graph, branch, (steps) => [
    ...steps.slice(0, index),
    ...added,
    ...steps.slice(index),
  ]);
  const list = listPath(branch);
  // A single `parallel` step that became a `sequence` keeps its offset as the sequence's first step.
  const moved = branch.single
    ? movedOffsets(
        result.graph,
        branchCardId(blockId, branch.path),
        branchCardId(blockId, [...list, 0])
      )
    : result.graph;
  return {
    graph: added.reduce<FlowGraph>((g) => renumberOffsets(g, blockId, list, index, 1), moved),
    id: branchCardId(blockId, [...list, index]),
  };
}

/**
 * A connection dragged from a branch (its output or one of its cards) onto a
 * free card pulls that card into the branch — the same place its "+" adds a
 * step (#36) — along with the plain chain of cards after it. A card tied in
 * elsewhere (something leads to it, a later card has other sources, the
 * chain forks) stays where it is: null, nothing to adopt.
 */
export function adoptIntoBranch(graph: FlowGraph, at: BranchInsert, id: string): FlowGraph | null {
  const chain = adoptableChain(graph, at.blockId, id);
  if (!chain) return null;
  // All in one go: a single `parallel` step turns into a `sequence` with the first one.
  const inserted = insertBranchSteps(graph, at, chain.map(nodeToStep)).graph;
  return chain.reduce((g, node) => removeNode(g, node.id), inserted);
}

/** `id` and the plain chain of free cards after it; null if any of them is tied in elsewhere. */
function adoptableChain(graph: FlowGraph, blockId: string, id: string): FlowNode[] | null {
  const chain: FlowNode[] = [];
  for (let next: string | undefined = id; next; ) {
    const node = graph.nodes.find((n) => n.id === next);
    if (!node || node.id === blockId || node.type === 'trigger') return null;
    if (incoming(graph, node.id).length !== (chain.length === 0 ? 0 : 1)) return null;
    chain.push(node);
    // Only the main output may lead on (a condition's No would be lost in a sequence).
    const [main = null, ...others] = sourceHandles(node.type);
    if (others.some((handle) => outgoing(graph, node.id, handle).length > 0)) return null;
    const out = outgoing(graph, node.id, main);
    if (out.length > 1) return null;
    next = out[0]?.target;
  }
  return chain;
}

/**
 * The drawn box of flow card `id` with all its branches (a block takes more
 * room than one card, its first branch may sit before it): where the card
 * is, and where the box starts and ends across the flow.
 */
export function drawnBox(
  view: BranchView,
  id: string
): { x: number; y: number; crossStart: number; crossEnd: number } {
  const { axis } = view;
  const own = view.graph.nodes.filter((n) => n.id === id || view.cards.get(n.id)?.blockId === id);
  const head = own.find((n) => n.id === id);
  const at = head ? axis.cross(head.position) : 0;
  return {
    x: head?.position.x ?? 0,
    y: head?.position.y ?? 0,
    crossStart: Math.min(at, ...own.map((n) => axis.cross(n.position))),
    crossEnd: Math.max(
      at,
      ...own.map(
        (n) =>
          axis.cross(n.position) +
          axis.breadth({ width: NODE_WIDTH, height: cardShape(view, n).height })
      )
    ),
  };
}

/** A stored position for a card that should appear at `drawn`. */
export function storedPosition(
  view: BranchView,
  id: string,
  drawn: { x: number; y: number }
): { x: number; y: number } {
  const { axis } = view;
  return axis.at(axis.main(drawn) - (view.shift.get(id) ?? 0), axis.cross(drawn));
}

const BRANCH_KEYS: ReadonlySet<string> = new Set(['choose', 'default', 'then', 'else', 'parallel']);

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
