import { randomUUID } from 'node:crypto';
import { FlowTranspiler } from '@flode/transpiler';
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  createChooseBlock,
  createIfElseBlock,
  createParallelBlock,
  createRepeatCountBlock,
  createRepeatWhileBlock,
} from '../block-factories';

/**
 * Round-trip tests for the palette compound-block factories.
 *
 * These guard the *exact* node/edge topology the palette produces (block-factories.ts)
 * against regressions, and verify it transpiles into the intended Home Assistant
 * construct (choose / if-then-else / repeat.while / repeat.count / parallel).
 *
 * The factories intentionally create placeholder action/condition nodes for the user
 * to fill in. `configurePlaceholders` simulates that configuration so the graph can be
 * transpiled, while leaving the factory-defined topology (edges, handles, _blockKey,
 * repeat data) untouched — which is what we actually want to test.
 */

type AnyNode = Node<Record<string, unknown>>;

function triggerNode(id: string): AnyNode {
  return {
    id,
    type: 'trigger',
    position: { x: 0, y: 0 },
    data: { trigger: 'state', entity_id: 'input_boolean.test', to: 'on' },
  };
}

function actionNode(id: string, service = 'light.turn_on'): AnyNode {
  return {
    id,
    type: 'action',
    position: { x: 0, y: 0 },
    data: { service, target: { entity_id: 'light.test' } },
  };
}

/** Fill placeholder nodes with valid values so the graph is transpilable. */
function configurePlaceholders(nodes: AnyNode[]): void {
  for (const node of nodes) {
    const data = node.data;
    if (node.type === 'action' && !data.service && !data.repeat) {
      data.service = 'light.turn_on';
      data.target = { entity_id: 'light.test' };
    }
    if (node.type === 'condition' && !data.entity_id) {
      data.entity_id = 'input_boolean.test';
      data.state = 'on';
    }
  }
}

function transpile(nodes: AnyNode[], edges: Edge[]) {
  configurePlaceholders(nodes);
  const graph = {
    id: randomUUID(),
    name: 'Block Factory Test',
    version: 1 as const,
    nodes,
    edges,
  };
  return new FlowTranspiler().transpile(graph);
}

function edge(source: string, target: string, sourceHandle?: string): Edge {
  return {
    id: `e-${source}-${target}-${sourceHandle ?? 'x'}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
  };
}

describe('block-factories: structural output', () => {
  it('createChooseBlock: two condition cases linked by an (invisible) choose-chain', () => {
    const { nodes, edges } = createChooseBlock(0, 0);
    const conditions = nodes.filter((n) => n.type === 'condition');
    expect(conditions).toHaveLength(2);
    expect(nodes.every((n) => n.data._blockKey === 'choose')).toBe(true);
    expect(conditions[0].data._chooseCase).toBe(1);
    expect(conditions[1].data._chooseCase).toBe(2);

    const chain = edges.find((e) => e.type === 'choose-chain');
    expect(chain).toBeDefined();
    expect(chain?.sourceHandle).toBe('false');
    expect(chain?.source).toBe(conditions[0].id);
    expect(chain?.target).toBe(conditions[1].id);
  });

  it('createIfElseBlock: a single bare condition, no edges', () => {
    const { nodes, edges } = createIfElseBlock(0, 0);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('condition');
    expect(nodes[0].data._blockKey).toBe('if_else');
    expect(edges).toHaveLength(0);
  });

  it('createRepeatWhileBlock: action left of condition, true-edge + loop-back', () => {
    const { nodes, edges } = createRepeatWhileBlock(0, 0);
    const condition = nodes.find((n) => n.type === 'condition');
    const action = nodes.find((n) => n.type === 'action');
    expect(condition).toBeDefined();
    expect(action).toBeDefined();
    expect(condition?.data._blockKey).toBe('repeat_while');

    // Layout: action sits to the LEFT of the condition (the clean loop look).
    expect(action!.position.x).toBeLessThan(condition!.position.x);

    // condition --(true)--> action  (loop body)
    const trueEdge = edges.find((e) => e.source === condition!.id && e.sourceHandle === 'true');
    expect(trueEdge?.target).toBe(action!.id);

    // action --(loop-back)--> condition
    const loopBack = edges.find((e) => e.type === 'loop-back');
    expect(loopBack?.source).toBe(action!.id);
    expect(loopBack?.target).toBe(condition!.id);
  });

  it('createRepeatCountBlock: one opaque action with repeat.count', () => {
    const { nodes, edges } = createRepeatCountBlock(0, 0);
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
    const repeat = nodes[0].data.repeat as { count: number; sequence: unknown[] };
    expect(repeat.count).toBe(3);
    expect(nodes[0].data._blockKey).toBe('repeat_count');
  });

  it('createParallelBlock: two independent action branches', () => {
    const { nodes, edges } = createParallelBlock(0, 0);
    const actions = nodes.filter((n) => n.type === 'action');
    expect(actions).toHaveLength(2);
    expect(actions.every((n) => n.data._blockKey === 'parallel')).toBe(true);
    expect(edges).toHaveLength(0);
    // Branches are vertically offset so the user can see both.
    expect(actions[0].position.y).not.toBe(actions[1].position.y);
  });
});

describe('block-factories: transpile round-trip', () => {
  it('repeat_count → repeat block with count', () => {
    const { nodes, edges } = createRepeatCountBlock(200, 150);
    const trig = triggerNode('trigger_rc');
    const result = transpile([trig, ...nodes], [...edges, edge(trig.id, nodes[0].id)]);

    expect(result.success).toBe(true);
    expect(result.yaml).toContain('repeat');
    expect(result.yaml).toContain('count: 3');
  });

  it('repeat_while → repeat block with while condition', () => {
    const { nodes, edges } = createRepeatWhileBlock(200, 150);
    const condition = nodes.find((n) => n.type === 'condition')!;
    const trig = triggerNode('trigger_rw');
    const result = transpile([trig, ...nodes], [...edges, edge(trig.id, condition.id)]);

    expect(result.success).toBe(true);
    expect(result.yaml).toContain('repeat');
    expect(result.yaml).toContain('while');
    expect(result.yaml).not.toContain('service: undefined');
  });

  it('choose → choose block with two cases', () => {
    const { nodes, edges } = createChooseBlock(200, 150);
    const conditions = nodes.filter((n) => n.type === 'condition');
    const trig = triggerNode('trigger_ch');
    const bodyA = actionNode('action_caseA', 'light.turn_on');
    const bodyB = actionNode('action_caseB', 'switch.turn_on');

    const result = transpile(
      [trig, ...nodes, bodyA, bodyB],
      [
        ...edges,
        edge(trig.id, conditions[0].id),
        edge(conditions[0].id, bodyA.id, 'true'),
        edge(conditions[1].id, bodyB.id, 'true'),
      ]
    );

    expect(result.success).toBe(true);
    expect(result.yaml).toContain('choose:');
  });

  it('if_else → if/then/else block', () => {
    const { nodes } = createIfElseBlock(200, 150);
    const condition = nodes[0];
    const trig = triggerNode('trigger_if');
    const thenAction = actionNode('action_then', 'light.turn_on');
    const elseAction = actionNode('action_else', 'light.turn_off');

    const result = transpile(
      [trig, condition, thenAction, elseAction],
      [
        edge(trig.id, condition.id),
        edge(condition.id, thenAction.id, 'true'),
        edge(condition.id, elseAction.id, 'false'),
      ]
    );

    expect(result.success).toBe(true);
    // A condition with both a true and a false body becomes an if/then/else block.
    expect(result.yaml).toContain('if:');
    expect(result.yaml).toContain('then:');
    expect(result.yaml).toContain('else:');
  });

  it('parallel → parallel block from a trigger fan-out', () => {
    const { nodes } = createParallelBlock(200, 150);
    const [a1, a2] = nodes;
    a1.data.service = 'light.turn_on';
    a1.data.target = { entity_id: 'light.test' };
    a2.data.service = 'switch.turn_on';
    a2.data.target = { entity_id: 'switch.test' };
    const trig = triggerNode('trigger_par');

    const result = transpile([trig, a1, a2], [edge(trig.id, a1.id), edge(trig.id, a2.id)]);

    expect(result.success).toBe(true);
    expect(result.yaml).toContain('parallel:');
  });
});
