import {
  type FlowEdge,
  type FlowGraph,
  type FlowMetadata,
  type FlowNode,
  type FlowWorkspace,
  isTemplateString,
  NodeSchema,
} from '@flode/shared';
import { definesVariable, mapStrings, renameJinjaVariable } from './jinja-rename';
import { randomId } from './random-id';
import { renameTriggerIdReferences } from './trigger-ids';

export interface MergeAutomationSource {
  graph: FlowGraph;
  automationId: string;
  entityId: string;
  alias: string;
  importedAt?: string;
}

interface GraphBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function calculateBounds(nodes: FlowNode[]): GraphBounds {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, width: 0, height: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x);
    maxY = Math.max(maxY, node.position.y);
  }

  return {
    minX,
    minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function sanitizeSourcePrefix(input: string, index: number): string {
  const underscored = input.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  // Trim underscores by index — a `^_+|_+$` regex is quadratic on long `_` runs.
  let start = 0;
  let end = underscored.length;
  while (start < end && underscored[start] === '_') start++;
  while (end > start && underscored[end - 1] === '_') end--;
  const normalized = underscored.slice(start, end);

  const base = normalized || `source_${index + 1}`;
  return `${base}_${index + 1}`;
}

/** Something the merge had to change that the user should know about. */
export type MergeWarning =
  /** A clashing variable was renamed; the templates of its automation were adjusted. */
  | { kind: 'variableRenamed'; source: string; name: string; renamed: string }
  /** A clashing variable was renamed, but its automation's templates could not all be adjusted. */
  | { kind: 'variableCheck'; source: string; name: string; renamed: string }
  /** The automations ran in different modes; the merged one runs in `mode`. */
  | { kind: 'modeChanged'; modes: AutomationMode[]; mode: AutomationMode };

export interface MergeResult {
  graph: FlowGraph;
  warnings: MergeWarning[];
}

type AutomationMode = FlowMetadata['mode'];

interface PreparedSource {
  source: MergeAutomationSource;
  prefix: string;
  /** Variable renames (old → new name) of this source. */
  renames: Map<string, string>;
}

/** Renames variables inside the templates of one automation; collects names it couldn't rewrite. */
function variableRewriter(
  renames: ReadonlyMap<string, string>,
  unsafe: Set<string>
): (text: string) => string {
  return (text) => {
    if (!isTemplateString(text)) return text;
    let out = text;
    for (const [from, to] of renames) {
      const renamed = renameJinjaVariable(out, from, to);
      if (renamed === null) unsafe.add(from);
      else out = renamed;
    }
    return out;
  };
}

/** One automation's variables as they go into the merged block (renamed, templates rewritten). */
function sourceVariables(prepared: PreparedSource): [string, unknown][] {
  const rewrite = variableRewriter(prepared.renames, new Set());
  return Object.entries(prepared.source.graph.userVariables ?? {}).map(([key, value]) => [
    prepared.renames.get(key) ?? key,
    mapStrings(value, rewrite),
  ]);
}

/** The merged variables, or the first clash: a name a later automation defines differently. */
function collectVariables(
  sources: readonly PreparedSource[]
): { merged: Record<string, unknown> } | { clash: PreparedSource; key: string } {
  const merged: Record<string, unknown> = {};
  for (const prepared of sources) {
    const original = Object.keys(prepared.source.graph.userVariables ?? {});
    for (const [index, [name, value]] of sourceVariables(prepared).entries()) {
      if (!(name in merged)) merged[name] = value;
      else if (JSON.stringify(merged[name]) !== JSON.stringify(value)) {
        return { clash: prepared, key: original[index] ?? name };
      }
    }
  }
  return { merged };
}

/**
 * All automations' variables in one block. A name two automations define
 * differently gets the later automation's prefix (`b_2__level`, recorded in
 * its `renames`); its templates then read the new name — which can make
 * further variables differ, so this repeats until nothing clashes.
 */
function mergeUserVariables(sources: PreparedSource[]): Record<string, unknown> | undefined {
  for (;;) {
    const result = collectVariables(sources);
    if ('merged' in result) {
      return Object.keys(result.merged).length > 0 ? result.merged : undefined;
    }
    result.clash.renames.set(result.key, `${result.clash.prefix}__${result.key}`);
  }
}

/**
 * Lets an automation's steps read its renamed variables. Returns the
 * rewritten nodes and the names that could not be rewritten reliably (a step
 * or template defines the name itself).
 */
function applyVariableRenames(
  renames: ReadonlyMap<string, string>,
  nodes: FlowNode[]
): { nodes: FlowNode[]; unsafe: Set<string> } {
  const unsafe = new Set<string>();
  for (const name of renames.keys()) {
    if (nodes.some((node) => definesVariable(node.data, name))) unsafe.add(name);
  }
  const rewrite = variableRewriter(renames, unsafe);
  return { nodes: nodes.map((node) => withData(node, mapStrings(node.data, rewrite))), unsafe };
}

/** `node` with rewritten data — the node itself when nothing changed (or the data became invalid). */
function withData(node: FlowNode, data: unknown): FlowNode {
  if (data === node.data) return node;
  const parsed = NodeSchema.safeParse({ ...node, data });
  return parsed.success ? parsed.data : node;
}

/**
 * Merged automations run as one: when their modes differ, the merged one runs
 * `parallel` so a run of one automation never blocks, restarts or queues
 * behind the others.
 */
function mergeMetadata(sources: MergeAutomationSource[]): {
  metadata: FlowMetadata;
  warning?: MergeWarning;
} {
  const metadata: FlowMetadata = {
    mode: 'single',
    initial_state: true,
    ...(sources[0]?.graph.metadata || {}),
  };
  const modes = [...new Set(sources.map((source) => source.graph.metadata?.mode ?? 'single'))];
  if (modes.length < 2) return { metadata };
  const maxes = sources.flatMap((source) => source.graph.metadata?.max ?? []);
  const { max: _max, ...rest } = metadata;
  return {
    metadata: {
      ...rest,
      mode: 'parallel',
      ...(maxes.length > 0 ? { max: Math.max(...maxes) } : {}),
    },
    warning: { kind: 'modeChanged', modes, mode: 'parallel' },
  };
}

/**
 * Each merged automation keeps reacting only to its own triggers: the
 * triggers get ids and a "triggered by" condition gates the automation's
 * steps (without it, every trigger would run every merged automation).
 */
function gateByTriggers(
  prefix: string,
  nodes: FlowNode[],
  edges: FlowEdge[]
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const triggers = nodes.filter((node) => node.type === 'trigger');
  const triggerIds = new Set(triggers.map((node) => node.id));
  const outgoing = edges.filter((edge) => triggerIds.has(edge.source));
  if (triggers.length === 0 || outgoing.length === 0) return { nodes, edges };

  // Every ID gets the automation's prefix — two automations may both use `on`,
  // and each gate must only let its own triggers through.
  const ids: string[] = [];
  const renames = new Map<string, string>();
  const withIds = nodes.map((node, index) => {
    if (node.type !== 'trigger') return node;
    const existing = 'id' in node.data ? node.data.id : undefined;
    const id =
      typeof existing === 'string' && existing
        ? `${prefix}__${existing}`
        : `${prefix}_${index + 1}`;
    if (typeof existing === 'string' && existing) renames.set(existing, id);
    ids.push(id);
    return { ...node, data: { ...node.data, id } };
  });
  const idNodes = withIds.map((node) =>
    node.type === 'trigger' ? node : withData(node, renameTriggerIdReferences(node.data, renames))
  );
  const gateId = `${prefix}__trigger_gate`;
  const gate: FlowNode = {
    id: gateId,
    type: 'condition',
    position: {
      x: Math.max(...triggers.map((node) => node.position.x)) + 180,
      y: triggers.reduce((sum, node) => sum + node.position.y, 0) / triggers.length,
    },
    data: { condition: 'trigger', id: ids },
  };
  const targets = [...new Set(outgoing.map((edge) => edge.target))];
  return {
    nodes: [...idNodes, gate],
    edges: [
      ...edges.filter((edge) => !triggerIds.has(edge.source)),
      ...triggers.map((node) => ({
        id: `${node.id}__to_gate`,
        source: node.id,
        target: gateId,
      })),
      ...targets.map((target) => ({
        id: `${gateId}__${target}`,
        source: gateId,
        target,
        sourceHandle: 'true',
      })),
    ],
  };
}

/**
 * Merges automations into one: each keeps its own triggers (gated by a
 * "Triggered by" condition), clashing variables are renamed. `warnings` says
 * what the user should check.
 */
export function mergeAutomations(sources: MergeAutomationSource[]): MergeResult {
  if (sources.length < 2) {
    throw new Error('At least two automations are required for merge.');
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(sources.length)));
  const boundsPerSource = sources.map((source) => calculateBounds(source.graph.nodes));
  const maxWidth = Math.max(...boundsPerSource.map((bounds) => bounds.width), 0);
  const maxHeight = Math.max(...boundsPerSource.map((bounds) => bounds.height), 0);
  const cellWidth = maxWidth + 260;
  const cellHeight = maxHeight + 220;

  const prepared: PreparedSource[] = sources.map((source, index) => ({
    source,
    prefix: sanitizeSourcePrefix(source.alias || source.automationId || source.entityId, index),
    renames: new Map(),
  }));
  const userVariables = mergeUserVariables(prepared);

  const mergedNodes: FlowNode[] = [];
  const mergedEdges: FlowEdge[] = [];
  const workspaceSources: FlowWorkspace['sources'] = [];
  const warnings: MergeWarning[] = [];

  prepared.forEach(({ source, prefix, renames }, index) => {
    const bounds = boundsPerSource[index];
    const col = index % columns;
    const row = Math.floor(index / columns);
    const offsetX = col * cellWidth;
    const offsetY = row * cellHeight;

    const nodeIdMap = new Map<string, string>();
    const sourceEdges: FlowEdge[] = [];
    const rewritten = applyVariableRenames(renames, source.graph.nodes);
    for (const [name, renamed] of renames) {
      warnings.push({
        kind: rewritten.unsafe.has(name) ? 'variableCheck' : 'variableRenamed',
        source: source.alias,
        name,
        renamed,
      });
    }

    const sourceNodes = rewritten.nodes.map((node): FlowNode => {
      const nextNodeId = `${prefix}__${node.id}`;
      nodeIdMap.set(node.id, nextNodeId);
      return {
        ...node,
        id: nextNodeId,
        position: {
          x: node.position.x - (bounds?.minX ?? 0) + offsetX,
          y: node.position.y - (bounds?.minY ?? 0) + offsetY,
        },
      };
    });

    for (const edge of source.graph.edges) {
      const sourceId = nodeIdMap.get(edge.source);
      const targetId = nodeIdMap.get(edge.target);
      if (!sourceId || !targetId) {
        continue;
      }

      sourceEdges.push({
        ...edge,
        id: `${prefix}__${edge.id}`,
        source: sourceId,
        target: targetId,
      });
    }

    const gated = gateByTriggers(prefix, sourceNodes, sourceEdges);
    mergedNodes.push(...gated.nodes);
    mergedEdges.push(...gated.edges);

    workspaceSources.push({
      automation_id: source.automationId,
      entity_id: source.entityId,
      alias: source.alias,
      node_prefix: prefix,
      imported_at: source.importedAt ?? new Date().toISOString(),
    });
  });

  const { metadata, warning } = mergeMetadata(sources);
  if (warning) warnings.push(warning);

  return {
    graph: {
      id: randomId(),
      name: 'Merged Automation',
      description: `Merged from ${sources.length} automations`,
      nodes: mergedNodes,
      edges: mergedEdges,
      metadata,
      version: 1,
      workspace: {
        mode: 'merged',
        sources: workspaceSources,
      },
      userVariables,
    },
    warnings,
  };
}
