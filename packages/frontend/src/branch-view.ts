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
  blockId: string;
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
  /** Drawn edges standing for a stored edge (deleting one deletes that). */
  edgeOrigin: ReadonlyMap<string, string>;
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

/** The HA step of a block card that the canvas expands (`choose` / `if`), if it is one. */
function branchingStep(node: FlowNode): Record<string, unknown> | null {
  if (node.type !== 'action') return null;
  const step = getRawStep(node.data);
  return step && ('choose' in step || 'if' in step) ? step : null;
}

function stepList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The branches of a `choose` (options + default) or an `if` (then + else). */
function blockBranches(blockId: string, step: Record<string, unknown>): Branch[] {
  const make = (label: BranchLabel, path: StepPath, steps: unknown[], index: number): Branch => ({
    handle: `b${index}`,
    label,
    path,
    cards: steps.map((_, i) => branchCardId(blockId, [...path, i])),
  });
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
      edgeOrigin: new Map(),
    };
  }

  // Cards after a block move right by the width of its longest branch.
  const shift = new Map<string, number>();
  const branches = new Map<string, Branch[]>();
  for (const { node, step } of blocks) {
    const list = blockBranches(node.id, step);
    branches.set(node.id, list);
    const longest = Math.max(...list.map((b) => b.cards.length));
    if (longest === 0) continue;
    for (const id of downstream(graph, node.id)) {
      shift.set(id, (shift.get(id) ?? 0) + longest * COLUMN);
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
  const edges: FlowEdge[] = [];
  const edgeOrigin = new Map<string, string>();
  const blockIds = new Set(branches.keys());
  for (const { node, step } of blocks) {
    const list = branches.get(node.id) ?? [];
    const origin = at(node);
    const after = graph.edges.filter((e) => e.source === node.id);
    // Branches stacked around the block's middle.
    const middle = origin.y + blockHeight(list.length) / 2 - NODE_HEIGHT / 2;
    list.forEach((branch, row) => {
      const y = middle + (row - (list.length - 1) / 2) * ROW;
      branch.cards.forEach((id, index) => {
        const path = [...branch.path, index];
        const raw = valueAt(step, path);
        const { type, data } = stepToNode('action', isPlainObject(raw) ? raw : {});
        const position = { x: origin.x + (index + 1) * COLUMN, y };
        const card = NodeSchema.safeParse({ id, type, data, position });
        // A step no card can show still keeps its place (and the line through it).
        nodes.push(
          card.success ? card.data : { id, type: 'action', data: { [RAW_STEP_KEY]: raw }, position }
        );
        cards.set(id, { blockId: node.id, branch, path, index });
        const source = index === 0 ? node.id : branch.cards[index - 1];
        if (source === undefined) return;
        edges.push({
          id: `${id}${SEPARATOR}in`,
          source,
          target: id,
          ...(index === 0 ? { sourceHandle: branch.handle } : {}),
        });
      });
      // Every branch ends where the block continues.
      const last = branch.cards.at(-1);
      for (const edge of after) {
        const id = `${edge.id}${SEPARATOR}${branch.handle}`;
        edges.push({
          id,
          source: last ?? node.id,
          target: edge.target,
          ...(last ? {} : { sourceHandle: branch.handle }),
        });
        edgeOrigin.set(id, edge.id);
      }
    });
  }
  return {
    graph: {
      ...graph,
      nodes,
      edges: [...graph.edges.filter((e) => !blockIds.has(e.source)), ...edges],
    },
    branches,
    cards,
    shift,
    edgeOrigin,
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
  const optional = path.length === 1 && (path[0] === 'else' || path[0] === 'default');
  let next: unknown;
  if (optional && steps.length === 0) {
    const { [String(path[0])]: _removed, ...rest } = step;
    next = rest;
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
  return setBranchList(graph, ref.blockId, ref.branch.path, (steps) =>
    steps.filter((_, i) => i !== ref.index)
  ).graph;
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
  const card = view.cards.get(source);
  if (card) return { blockId: card.blockId, branch: card.branch, index: card.index + 1 };
  const branch = view.branches.get(source)?.find((b) => b.handle === handle);
  return branch ? { blockId: source, branch, index: 0 } : null;
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
  return { graph: result.graph, id: branchCardId(at.blockId, [...at.branch.path, at.index]) };
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

/**
 * The branch card a trace path is about: `action/1/choose/0/sequence/2` →
 * the third step of option 1 of the block at `action/1` (`blockAt` maps a
 * path to its card). Option conditions and deeper levels stay with the block.
 */
export function branchCardForPath(
  view: BranchView,
  path: string,
  blockAt: (path: string) => string | undefined
): string | undefined {
  const match = /^(.*?)\/(?:(choose)\/(\d+)\/sequence|(default|then|else))\/(\d+)$/.exec(path);
  if (!match) return undefined;
  const [, prefix = '', choose, option, list, index] = match;
  const blockId = blockAt(prefix);
  if (!blockId || !view.branches.has(blockId)) return undefined;
  const branchPath: StepPath = choose ? ['choose', Number(option), 'sequence'] : [list ?? ''];
  const id = branchCardId(blockId, [...branchPath, Number(index)]);
  return view.cards.has(id) ? id : undefined;
}
