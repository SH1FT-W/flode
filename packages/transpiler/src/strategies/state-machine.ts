import type { ConditionNode, FlowEdge, FlowGraph, FlowNode, TriggerNode } from '@flode/shared';
import type { TopologyAnalysis } from '../analyzer/topology';
import { BaseStrategy, buildAutomationSettings, type HAYamlOutput } from './base';
import { buildCondition, buildNodeStep, buildTrigger } from './steps';

/**
 * Outcome of planning a fan-out: either the set of branch nodes whose standalone
 * dispatcher entries can be dropped, or why the branches cannot be inlined.
 */
type FanOutRejection = {
  ok: false;
  reason: 'cycle' | 'join' | 'nested-condition';
  nodes: string[];
};

type FanOutPlan = { ok: true; owned: Set<string>; reachable: Set<string> } | FanOutRejection;

/**
 * State Machine strategy for complex flows with cycles, cross-links, or converging paths
 *
 * Implements the "Virtual CPU" pattern:
 * - current_node: A variable acting as the Program Counter
 * - repeat: A loop that keeps the automation alive until END
 * - choose: A dispatcher that executes the current node's logic
 *
 * This allows for arbitrary graph topologies including:
 * - Back-loops (returning to earlier nodes)
 * - Cross-links (jumping across branches)
 * - Converging paths (multiple paths merging)
 * - Complex state machines
 */
export class StateMachineStrategy extends BaseStrategy {
  readonly name = 'state-machine';
  readonly description =
    'Generates state machine YAML for complex flows with cycles or cross-links';

  canHandle(_analysis: TopologyAnalysis): boolean {
    // State machine can handle any topology
    return true;
  }

  generate(flow: FlowGraph, analysis: TopologyAnalysis): HAYamlOutput {
    const warnings: string[] = [];

    // Strip hint edges (visual-only trigger-routing aids) before any processing
    flow = {
      ...flow,
      edges: flow.edges.filter((e) => e.type !== 'hint' && e.type !== 'choose-hint'),
    };

    // Build trigger-to-action mapping for routing
    const triggerRouting = this.buildTriggerRouting(flow);

    if (triggerRouting.size === 0) {
      warnings.push('No action nodes found after triggers');
      // Extract triggers to determine output format
      const triggers = this.extractTriggers(flow);
      if (triggers.length > 0) {
        // Output as automation with empty action
        return {
          automation: {
            alias: flow.name,
            description: flow.description || '',
            triggers: triggers,
            actions: [],
            mode: flow.metadata?.mode ?? 'single',
          },
          warnings,
          strategy: this.name,
        };
      }
      // No triggers - output as script
      return {
        script: {
          alias: flow.name,
          description: flow.description || '',
          sequence: [],
          mode: flow.metadata?.mode ?? 'single',
        },
        warnings,
        strategy: this.name,
      };
    }

    // Plan trigger fan-out with the same rules as node fan-out, so a target that
    // another trigger also routes to keeps its dispatcher entry instead of
    // silently becoming unreachable.
    const triggerNodes = flow.nodes.filter((n): n is TriggerNode => n.type === 'trigger');
    const parallelConsumedNodeIds = new Set<string>();
    const approvedTriggerFanOut = new Map<number, string[]>();

    for (const [idx, routedTargets] of triggerRouting) {
      const triggerId = triggerNodes[idx]?.id;
      if (!triggerId) continue;

      // Duplicate edges to one target are a single branch, not a fan-out
      const targets = [...new Set(routedTargets)].filter((t) => t !== 'END');
      if (targets.length <= 1) continue;

      const plan = this.planFanOut(flow, this.getOutgoingEdges(flow, triggerId));
      if (!plan.ok) {
        warnings.push(this.describeFanOutRejection(`Trigger ${idx + 1}`, targets, plan));
        continue;
      }

      approvedTriggerFanOut.set(idx, targets);
      for (const id of plan.owned) {
        parallelConsumedNodeIds.add(id);
      }
    }

    const parallelEntryBlocks = this.generateParallelEntryBlocks(flow, approvedTriggerFanOut);

    // Nodes that fan out to several successors inline those successors into a
    // parallel block, so their subgraphs lose their standalone entries — but only
    // the parts nothing outside the branch set can reach (see planFanOut).
    // Walk outward from the entry points so an outer fan-out always claims its
    // subgraph before any nested one does. Iterating flow.nodes in array order
    // would let a nested node claim first, which strands the outer node's other
    // branches and drops their edges.
    const fanOutPlans = new Map<string, string[]>();
    for (const node of this.orderNodesFromEntry(flow)) {
      // Conditions branch through their own true/false path and never build a
      // fan-out tail, so their targets must keep their standalone entries.
      if (node.type === 'trigger' || node.type === 'condition') continue;

      // Already inlined into an ancestor's parallel branch. Its own fan-out is
      // emitted by continueInlineBranch, so there is nothing to plan or warn about.
      if (parallelConsumedNodeIds.has(node.id)) continue;

      const targets = this.getFanOutTargets(flow, node.id);
      if (targets.length <= 1) continue;

      const plan = this.planFanOut(flow, this.getFanOutEdges(flow, node.id));
      if (!plan.ok) {
        warnings.push(this.describeFanOutRejection(`Node "${node.id}"`, targets, plan));
        continue;
      }

      fanOutPlans.set(node.id, targets);
      for (const id of plan.owned) {
        parallelConsumedNodeIds.add(id);
      }

      // Nested fan-outs are inlined by continueInlineBranch regardless of their
      // own plan, so report their rejections here — across everything inlined,
      // not just what this fan-out owns.
      for (const branchNodeId of plan.reachable) {
        const branchTargets = this.getFanOutTargets(flow, branchNodeId);
        if (branchTargets.length <= 1) continue;
        const branchPlan = this.planFanOut(flow, this.getFanOutEdges(flow, branchNodeId));
        if (!branchPlan.ok) {
          warnings.push(
            this.describeFanOutRejection(`Node "${branchNodeId}"`, branchTargets, branchPlan, true)
          );
        }
      }
    }

    // A condition handle may also lead to several nodes. Route those through a
    // synthetic parallel entry rather than keeping only the first edge.
    const conditionHandleEntries: Record<string, unknown>[] = [];
    const conditionHandleTargets = new Map<string, string>();

    for (const node of this.orderNodesFromEntry(flow)) {
      if (node.type !== 'condition' || parallelConsumedNodeIds.has(node.id)) continue;

      for (const handle of ['true', 'false'] as const) {
        const targets = this.getConditionHandleTargets(flow, node.id, handle);
        if (targets.length <= 1) continue;

        const handleEdges = this.getOutgoingEdges(flow, node.id).filter(
          (e) => e.sourceHandle === handle
        );
        const plan = this.planFanOut(flow, handleEdges);
        if (!plan.ok) {
          warnings.push(
            this.describeFanOutRejection(
              `The "${handle}" branch of condition "${node.id}"`,
              targets,
              plan
            )
          );
          continue;
        }

        const entryId = `__parallel_cond_${node.id}__${handle}`;
        conditionHandleTargets.set(`${node.id}:${handle}`, entryId);
        conditionHandleEntries.push(this.buildParallelEntryBlock(flow, entryId, targets));

        for (const id of plan.owned) {
          parallelConsumedNodeIds.add(id);
        }
      }
    }

    // Build choose blocks for each non-trigger node not already inlined in a parallel branch
    const nodeBlocks = flow.nodes
      .filter(
        (n): n is Exclude<FlowNode, TriggerNode> =>
          n.type !== 'trigger' && !parallelConsumedNodeIds.has(n.id)
      )
      .map((node) => this.generateNodeBlock(flow, node, fanOutPlans, conditionHandleTargets));

    // Combine parallel entry blocks and remaining node blocks
    const chooseBlocks = [...parallelEntryBlocks, ...conditionHandleEntries, ...nodeBlocks];

    // Warn about potential infinite loops
    if (analysis.hasCycles) {
      const cycleWarning = this.detectPotentialInfiniteLoop(flow, analysis);
      if (cycleWarning) {
        warnings.push(cycleWarning);
      }
    }

    // Extract triggers for the automation wrapper
    const triggers = this.extractTriggers(flow);

    // Generate the initial node expression
    // If all triggers lead to the same node, use that directly
    // Otherwise, use a Jinja2 template to route based on trigger.idx
    const entryNodeExpr = this.generateEntryNodeExpression(
      triggerNodes.length,
      triggerRouting,
      approvedTriggerFanOut
    );

    // Build the action sequence for the state machine
    // In HA automations, actions are a flat list - we use:
    // 1. A variables action to initialize state
    // 2. A repeat action with choose dispatcher
    const actionSequence: Record<string, unknown>[] = [
      // Initialize the state machine variables
      {
        variables: {
          current_node: entryNodeExpr,
          flow_context: {},
        },
      },
      // The main execution loop
      {
        alias: 'State Machine Loop',
        repeat: {
          until: '{{ current_node == "END" }}',
          sequence: [
            {
              choose: chooseBlocks,
              default: [
                {
                  service: 'system_log.write',
                  data: {
                    message: 'FLODE: Unknown state "{{ current_node }}", ending flow',
                    level: 'warning',
                  },
                },
                {
                  variables: {
                    current_node: 'END',
                  },
                },
              ],
            },
          ],
        },
      },
    ];

    // If there are triggers, output as automation format
    if (triggers.length > 0) {
      return {
        automation: {
          alias: flow.name,
          description: flow.description || '',
          triggers: triggers,
          actions: actionSequence,
          mode: flow.metadata?.mode ?? 'single',
          ...buildAutomationSettings(flow),
        },
        warnings,
        strategy: this.name,
      };
    }

    // No triggers - output as script format
    return {
      script: {
        alias: flow.name,
        description: flow.description || '',
        sequence: actionSequence,
        mode: flow.metadata?.mode ?? 'single',
      },
      warnings,
      strategy: this.name,
    };
  }

  /**
   * Build a mapping from trigger index to target action node(s)
   * Returns a Map where key = trigger index, value = array of target node IDs
   * When a trigger has multiple targets, they should execute in parallel
   */
  private buildTriggerRouting(flow: FlowGraph): Map<number, string[]> {
    const routing = new Map<number, string[]>();

    // Get trigger nodes in order (they will be output in this order)
    const triggerNodes = flow.nodes.filter((n): n is TriggerNode => n.type === 'trigger');

    triggerNodes.forEach((trigger, index) => {
      const outgoing = this.getOutgoingEdges(flow, trigger.id);
      if (outgoing.length > 0) {
        routing.set(
          index,
          outgoing.map((e) => e.target)
        );
      }
    });

    return routing;
  }

  /**
   * Get the effective entry point for a trigger
   * If trigger has single target, return that target ID
   * If trigger has multiple targets whose fan-out was approved, return the
   * synthetic parallel entry ID; otherwise fall back to its first target.
   */
  private getEffectiveEntryPoint(
    triggerIndex: number,
    targets: string[],
    approvedTriggerFanOut: Map<number, string[]>
  ): string {
    if (targets.length === 1 || !approvedTriggerFanOut.has(triggerIndex)) {
      return targets[0];
    }
    return `__parallel_trigger_${triggerIndex}`;
  }

  /**
   * Generate the entry node expression for initialization
   * If all triggers lead to the same node, return that node ID
   * Otherwise, return a Jinja2 template that routes based on trigger.idx
   */
  private generateEntryNodeExpression(
    triggerCount: number,
    triggerRouting: Map<number, string[]>,
    approvedTriggerFanOut: Map<number, string[]>
  ): string {
    // Convert to effective entry points (handling parallel branches). A trigger
    // without a connection ends the run at once — it must not fall through to
    // another trigger's path.
    const effectiveEntries = new Map<number, string>();
    for (let idx = 0; idx < triggerCount; idx++) {
      const targets = triggerRouting.get(idx);
      effectiveEntries.set(
        idx,
        targets ? this.getEffectiveEntryPoint(idx, targets, approvedTriggerFanOut) : 'END'
      );
    }

    const uniqueTargets = new Set(effectiveEntries.values());

    // If all triggers lead to the same node (or there's only one trigger)
    if (uniqueTargets.size === 1) {
      return [...uniqueTargets][0];
    }

    // Multiple different targets - generate routing template
    // Using trigger.idx which is 0-based index of which trigger fired
    const entries = [...effectiveEntries.entries()].sort((a, b) => a[0] - b[0]);

    // Build a Jinja2 if/elif chain
    // Note: trigger.idx is a string in HA, so compare with quoted string values
    // Node IDs should NOT be quoted - they're compared with quoted strings in conditions
    const parts: string[] = [];
    entries.forEach(([idx, nodeId], i) => {
      if (i === 0) {
        parts.push(`{% if trigger.idx == "${idx}" %}${nodeId}`);
      } else if (i === entries.length - 1) {
        parts.push(`{% else %}${nodeId}{% endif %}`);
      } else {
        parts.push(`{% elif trigger.idx == "${idx}" %}${nodeId}`);
      }
    });

    // Handle edge case where we have only one entry
    if (entries.length === 1) {
      return entries[0][1];
    }

    return parts.join('');
  }

  /**
   * Generate choose blocks for parallel entry points
   * When a trigger has multiple targets, we create a synthetic state that
   * executes all targets in a parallel block
   */
  private generateParallelEntryBlocks(
    flow: FlowGraph,
    approvedTriggerFanOut: Map<number, string[]>
  ): Record<string, unknown>[] {
    const parallelBlocks: Record<string, unknown>[] = [];

    for (const [idx, targets] of approvedTriggerFanOut) {
      parallelBlocks.push(
        this.buildParallelEntryBlock(flow, `__parallel_trigger_${idx}`, [...new Set(targets)])
      );
    }

    return parallelBlocks;
  }

  /**
   * Build a synthetic dispatcher entry that runs several branches in parallel
   * and then ends the flow. Used for trigger fan-out and for condition handles
   * that lead to more than one node.
   */
  private buildParallelEntryBlock(
    flow: FlowGraph,
    entryId: string,
    targets: string[]
  ): Record<string, unknown> {
    return {
      conditions: [
        {
          condition: 'template',
          value_template: `{{ current_node == "${entryId}" }}`,
        },
      ],
      sequence: [
        { parallel: this.buildParallelBranches(flow, targets) },
        { variables: { current_node: 'END' } },
      ],
    };
  }

  /**
   * Outgoing edges that represent parallel fan-out rather than conditional
   * branching. Edges carrying a true/false handle belong to a condition node
   * and are excluded.
   */
  private getFanOutEdges(flow: FlowGraph, nodeId: string): FlowEdge[] {
    return this.getOutgoingEdges(flow, nodeId).filter(
      (e) => e.sourceHandle !== 'true' && e.sourceHandle !== 'false'
    );
  }

  /**
   * Nodes ordered by distance from the trigger entry points (breadth-first),
   * with any unreachable nodes appended in declaration order.
   *
   * Fan-out planning must be deterministic and outermost-first: whichever node
   * claims a subgraph first owns it, so processing a nested node before its
   * ancestor would strand the ancestor's remaining branches.
   */
  private orderNodesFromEntry(flow: FlowGraph): FlowNode[] {
    const byId = new Map(flow.nodes.map((n) => [n.id, n]));
    const ordered: FlowNode[] = [];
    const seen = new Set<string>();

    const queue = flow.nodes
      .filter((n) => n.type === 'trigger')
      .flatMap((trigger) => this.getOutgoingEdges(flow, trigger.id).map((e) => e.target));

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (nodeId === undefined || nodeId === 'END' || seen.has(nodeId)) continue;
      seen.add(nodeId);

      const node = byId.get(nodeId);
      if (!node) continue;
      ordered.push(node);

      for (const edge of this.getOutgoingEdges(flow, nodeId)) {
        queue.push(edge.target);
      }
    }

    // Nodes not reachable from any trigger still need blocks generated
    for (const node of flow.nodes) {
      if (node.type !== 'trigger' && !seen.has(node.id)) {
        ordered.push(node);
      }
    }

    return ordered;
  }

  /**
   * Distinct targets on one handle of a condition node.
   */
  private getConditionHandleTargets(
    flow: FlowGraph,
    nodeId: string,
    handle: 'true' | 'false'
  ): string[] {
    const targets = this.getOutgoingEdges(flow, nodeId)
      .filter((e) => e.sourceHandle === handle)
      .map((e) => e.target);
    return [...new Set(targets)].filter((t) => t !== 'END');
  }

  /**
   * Distinct fan-out targets for a node. Duplicate edges to the same target
   * would otherwise produce duplicate branches that run the target twice.
   */
  private getFanOutTargets(flow: FlowGraph, nodeId: string): string[] {
    return [...new Set(this.getFanOutEdges(flow, nodeId).map((e) => e.target))].filter(
      (target) => target !== 'END' && target !== nodeId
    );
  }

  /**
   * Plan a fan-out: which branch nodes may lose their standalone dispatcher entry.
   *
   * Branches are always inlined so every one of them runs. Inlining additionally
   * *removes* a node's dispatcher entry, which is only safe when nothing outside
   * the branch set jumps to it — a node reachable from another trigger or an
   * unrelated predecessor keeps its entry and is simply emitted in both places.
   * The two executions belong to different runs, so that is correct, not duplication.
   *
   * Returns the set of nodes safe to consume, or a rejection explaining why the
   * fan-out cannot be inlined at all — a branch loops back to the source (an
   * inline branch has no way to re-enter the dispatcher), branches re-join
   * (each is inlined independently, so a shared node would run once per branch),
   * or a nested condition's handle itself fans out to several nodes (inlining
   * only resolves a condition's handles with a single lookup).
   */
  private planFanOut(flow: FlowGraph, fanOutEdges: FlowEdge[]): FanOutPlan {
    const sourceId = fanOutEdges[0]?.source;
    if (!sourceId) return { ok: false, reason: 'cycle', nodes: [] };

    const targets = [...new Set(fanOutEdges.map((e) => e.target))];
    const reachable = new Set<string>();
    for (const target of targets) {
      this.collectSubgraphNodeIds(flow, target, reachable);
    }

    // A branch that loops back to the source cannot be expressed inline
    if (reachable.has(sourceId)) {
      return { ok: false, reason: 'cycle', nodes: [sourceId] };
    }

    // Branches are inlined independently, so anything two of them share would be
    // emitted — and executed — once per branch. Leave those flows sequential
    // rather than silently doubling the work.
    const joined = this.findJoinNodes(flow, targets);
    if (joined.length > 0) {
      return { ok: false, reason: 'join', nodes: joined };
    }

    // generateInlineBranch resolves a condition's handles with a single lookup,
    // so a condition whose handle has several targets cannot be represented
    // inline without losing edges. Keep those on the dispatcher path instead.
    const lossyCondition = [...reachable].find((id) => this.hasMultiTargetHandle(flow, id));
    if (lossyCondition) {
      return { ok: false, reason: 'nested-condition', nodes: [lossyCondition] };
    }

    // A node's entry may only be dropped when *every* path into it is inlined.
    // Checking against `reachable` alone is not enough: a branch root with an
    // outside predecessor keeps its entry, and everything downstream of it is
    // then only reachable through a node that still dispatches. Shrink to a
    // fixpoint so no surviving entry ever transitions to a deleted one.
    const fanOutEdgeIds = new Set(fanOutEdges.map((e) => e.id));
    const owned = new Set(reachable);
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...owned]) {
        const hasOutsideEntry = flow.edges.some(
          (edge) => edge.target === id && !fanOutEdgeIds.has(edge.id) && !owned.has(edge.source)
        );
        if (hasOutsideEntry) {
          owned.delete(id);
          changed = true;
        }
      }
    }

    return { ok: true, owned, reachable };
  }

  /**
   * True when the node is a condition with more than one target on a handle.
   */
  private hasMultiTargetHandle(flow: FlowGraph, nodeId: string): boolean {
    const node = flow.nodes.find((n) => n.id === nodeId);
    if (node?.type !== 'condition') return false;
    return (
      this.getConditionHandleTargets(flow, nodeId, 'true').length > 1 ||
      this.getConditionHandleTargets(flow, nodeId, 'false').length > 1
    );
  }

  /**
   * Explain, in the user's terms, why a set of branches could not be run in
   * parallel and what will happen instead.
   */
  private describeFanOutRejection(
    subject: string,
    targets: string[],
    plan: FanOutRejection,
    /** Nested fan-outs are inlined regardless, so the consequence differs. */
    inlined = false
  ): string {
    if (plan.reason === 'nested-condition') {
      return `${subject} branches to [${targets.join(', ')}], but condition "${plan.nodes.join(', ')}" downstream sends one of its branches to several nodes, which cannot be nested inside a parallel block. Only the first branch will run. Move that condition out of the parallel section to run these in parallel.`;
    }
    if (plan.reason === 'cycle') {
      return inlined
        ? `${subject} branches to [${targets.join(', ')}] inside a parallel section, but one of those loops back. The loop cannot be expressed there and will stop after one pass.`
        : `${subject} branches to [${targets.join(', ')}], but one of those leads back into the same path. A parallel branch cannot loop back, so only the first branch will run.`;
    }
    if (inlined) {
      return `${subject} branches to [${targets.join(', ')}] inside a parallel section, and those branches re-join at [${plan.nodes.join(', ')}]. Nested parallel branches cannot re-join, so [${plan.nodes.join(', ')}] will run once per branch.`;
    }
    return `${subject} branches to [${targets.join(', ')}], but those branches re-join at [${plan.nodes.join(', ')}]. Parallel branches cannot re-join, so only the first branch will run. Give each branch its own downstream nodes to run them in parallel.`;
  }

  /**
   * Nodes reachable from more than one of the given branches. Parallel branches
   * are inlined independently, so anything they share would run once per branch.
   */
  private findJoinNodes(flow: FlowGraph, targets: string[]): string[] {
    const seen = new Set<string>();
    const duplicated = new Set<string>();

    for (const target of targets) {
      const branchNodes = new Set<string>();
      this.collectSubgraphNodeIds(flow, target, branchNodes);
      for (const id of branchNodes) {
        if (seen.has(id)) {
          duplicated.add(id);
        }
        seen.add(id);
      }
    }

    return [...duplicated];
  }

  /**
   * Build self-contained inline branches for a set of target nodes. Each
   * branch is wrapped with a "parallel_branch:<nodeId>" alias identifying
   * which node it corresponds to — reserved for a future YamlParser update
   * that reconstructs these branches back into the canvas; today they are
   * generation-only; re-importing a `parallel:` block does not yet restore
   * the individual nodes inside it.
   */
  private buildParallelBranches(
    flow: FlowGraph,
    targets: string[],
    visited: Set<string> = new Set()
  ): Record<string, unknown>[] {
    return targets.map((targetId) => {
      // Each branch gets its own visited copy so sibling branches don't block each other
      const inlineActions = this.generateInlineBranch(flow, targetId, new Set(visited));
      if (inlineActions.length === 0) {
        return { alias: `parallel_branch:${targetId}`, stop: 'Empty branch' };
      }
      return { alias: `parallel_branch:${targetId}`, sequence: inlineActions };
    });
  }

  /**
   * Build the tail of a node's state-machine sequence.
   * A single outgoing edge advances current_node to the next node; multiple
   * outgoing edges fan out into a parallel block of self-contained branches
   * and then end the flow, since all downstream work happens inside them.
   */
  private buildTransitionTail(
    flow: FlowGraph,
    nodeId: string,
    edges: FlowEdge[],
    fanOutPlans: Map<string, string[]>
  ): Record<string, unknown>[] {
    // Only fan out when the branches were verified as exclusively owned by this
    // node; otherwise fall through to the sequential transition below.
    const approvedTargets = fanOutPlans.get(nodeId);

    if (approvedTargets && approvedTargets.length > 1) {
      return [
        { parallel: this.buildParallelBranches(flow, approvedTargets) },
        { variables: { current_node: 'END' } },
      ];
    }

    return [{ variables: { current_node: edges[0]?.target ?? 'END' } }];
  }

  /**
   * Collect all node IDs reachable from a starting node (used to identify
   * nodes that are already inlined inside parallel branches).
   */
  private collectSubgraphNodeIds(flow: FlowGraph, nodeId: string, collected: Set<string>): void {
    if (nodeId === 'END' || collected.has(nodeId)) return;

    const node = flow.nodes.find((n) => n.id === nodeId);
    if (!node || node.type === 'trigger') return;

    collected.add(nodeId);
    const edges = this.getOutgoingEdges(flow, node.id);
    for (const edge of edges) {
      this.collectSubgraphNodeIds(flow, edge.target, collected);
    }
  }

  /**
   * Generate an inline HA action sequence for a subgraph starting at the given
   * node. Used within parallel branches where each branch must be
   * self-contained (no current_node state machine variable).
   */
  private generateInlineBranch(
    flow: FlowGraph,
    nodeId: string,
    visited: Set<string>
  ): Record<string, unknown>[] {
    if (nodeId === 'END' || visited.has(nodeId)) {
      return [];
    }

    const node = flow.nodes.find((n) => n.id === nodeId);
    if (!node) return [];

    visited.add(nodeId);
    const edges = this.getOutgoingEdges(flow, node.id);

    if (node.type === 'condition') {
      const trueTarget = edges.find((e) => e.sourceHandle === 'true')?.target ?? 'END';
      const falseTarget = edges.find((e) => e.sourceHandle === 'false')?.target ?? 'END';
      // Each branch gets its own visited copy so independent paths don't block each other
      const thenActions = this.generateInlineBranch(flow, trueTarget, new Set(visited));
      const elseActions = this.generateInlineBranch(flow, falseTarget, new Set(visited));
      return [
        {
          alias: node.data.alias,
          if: [buildCondition(node)],
          then: thenActions,
          ...(elseActions.length > 0 ? { else: elseActions } : {}),
        },
      ];
    }

    const step = buildNodeStep(node);
    return [...(step ? [step] : []), ...this.continueInlineBranch(flow, node.id, edges, visited)];
  }

  /**
   * Continue an inline branch past the current node. A single successor is
   * appended sequentially; several successors fan out into a nested parallel
   * block so none of them are dropped.
   */
  private continueInlineBranch(
    flow: FlowGraph,
    nodeId: string,
    edges: FlowEdge[],
    visited: Set<string>
  ): Record<string, unknown>[] {
    // Same de-duping as the top-level path, so duplicate edges to one target
    // don't produce duplicate branches that run it twice.
    const targets = this.getFanOutTargets(flow, nodeId);

    if (targets.length > 1) {
      return [{ parallel: this.buildParallelBranches(flow, targets, visited) }];
    }

    return this.generateInlineBranch(flow, targets[0] ?? edges[0]?.target ?? 'END', visited);
  }

  /** The automation's triggers. */
  private extractTriggers(flow: FlowGraph): unknown[] {
    return flow.nodes.filter((n): n is TriggerNode => n.type === 'trigger').map(buildTrigger);
  }

  /**
   * Generate the dispatcher entry for a single node: its step, then where the
   * machine goes next.
   */
  private generateNodeBlock(
    flow: FlowGraph,
    node: Exclude<FlowNode, TriggerNode>,
    fanOutPlans: Map<string, string[]>,
    conditionHandleTargets: Map<string, string>
  ): Record<string, unknown> {
    const edges = this.getOutgoingEdges(flow, node.id);
    const step = node.type === 'condition' ? null : buildNodeStep(node);
    const sequence =
      node.type === 'condition'
        ? [this.buildConditionTransition(node, edges, conditionHandleTargets)]
        : [...(step ? [step] : []), ...this.buildTransitionTail(flow, node.id, edges, fanOutPlans)];
    return {
      conditions: [
        {
          condition: 'template',
          value_template: `{{ current_node == "${node.id}" }}`,
        },
      ],
      sequence,
    };
  }

  /**
   * A condition node's step: HA checks the condition itself — exactly as
   * written, the same as in a native automation — and the machine moves to
   * the node on the matching branch.
   */
  private buildConditionTransition(
    node: ConditionNode,
    edges: FlowEdge[],
    conditionHandleTargets: Map<string, string>
  ): Record<string, unknown> {
    // A handle leading to several nodes routes through a synthetic parallel entry
    const target = (handle: 'true' | 'false'): string =>
      conditionHandleTargets.get(`${node.id}:${handle}`) ??
      edges.find((e) => e.sourceHandle === handle)?.target ??
      'END';
    return {
      alias: node.data.alias,
      if: [buildCondition(node)],
      then: [{ variables: { current_node: target('true') } }],
      else: [{ variables: { current_node: target('false') } }],
    };
  }

  /**
   * Detect if the flow could potentially run forever
   */
  private detectPotentialInfiniteLoop(flow: FlowGraph, analysis: TopologyAnalysis): string | null {
    if (!analysis.hasCycles) {
      return null;
    }

    // Check if all cycles have a condition that could break them
    // This is a simple heuristic - we check if there's at least one condition in the flow
    const hasConditions = flow.nodes.some((n) => n.type === 'condition');

    if (!hasConditions) {
      return (
        'Warning: This flow contains cycles but no conditions. ' +
        'This could result in an infinite loop. Consider adding a condition to break the cycle.'
      );
    }

    return (
      'Note: This flow contains cycles. Ensure your conditions can eventually evaluate to ' +
      'break the cycle, or the automation may run indefinitely.'
    );
  }
}
