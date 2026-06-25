import type { Edge, Node } from '@xyflow/react';
import { generateNodeId } from '@/lib/utils';
import type { ActionNodeData, ConditionNodeData, FlowNodeData } from '@/store/flow-store';

export type CompoundBlock = {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
};

export type CompoundBlockKey = 'choose' | 'if_else' | 'repeat_while' | 'repeat_count' | 'parallel';

let _edgeSeq = 0;
function eid(source: string, target: string, tag: string): string {
  return `e-${source}-${target}-${tag}-${++_edgeSeq}`;
}

function condNode(
  id: string,
  x: number,
  y: number,
  extra?: Partial<ConditionNodeData>
): Node<FlowNodeData> {
  return {
    id,
    type: 'condition',
    position: { x, y },
    data: { condition: 'state', entity_id: '', ...extra } as ConditionNodeData,
  };
}

function actionNode(
  id: string,
  x: number,
  y: number,
  extra?: Partial<ActionNodeData>
): Node<FlowNodeData> {
  return {
    id,
    type: 'action',
    position: { x, y },
    data: { service: '', ...extra } as ActionNodeData,
  };
}

export function createChooseBlock(baseX: number, baseY: number): CompoundBlock {
  const c1 = generateNodeId('condition');
  const c2 = generateNodeId('condition');

  return {
    nodes: [
      condNode(c1, baseX, baseY, { _chooseCase: 1, _chooseCaseTotal: 2, _blockKey: 'choose' }),
      condNode(c2, baseX, baseY + 130, {
        _chooseCase: 2,
        _chooseCaseTotal: 2,
        _blockKey: 'choose',
      }),
    ],
    edges: [
      {
        id: eid(c1, c2, 'chain'),
        source: c1,
        target: c2,
        sourceHandle: 'false',
        type: 'choose-chain',
      },
    ],
  };
}

export function createIfElseBlock(baseX: number, baseY: number): CompoundBlock {
  const cond = generateNodeId('condition');

  return {
    nodes: [condNode(cond, baseX, baseY, { _blockKey: 'if_else' })],
    edges: [],
  };
}

export function createRepeatWhileBlock(baseX: number, baseY: number): CompoundBlock {
  const cond = generateNodeId('condition');
  const body = generateNodeId('action');

  return {
    nodes: [
      actionNode(body, baseX, baseY),
      condNode(cond, baseX + 300, baseY, { _blockKey: 'repeat_while' }),
    ],
    edges: [
      { id: eid(cond, body, 'true'), source: cond, target: body, sourceHandle: 'true' },
      { id: eid(body, cond, 'loop'), source: body, target: cond, type: 'loop-back' },
    ],
  };
}

export function createRepeatCountBlock(baseX: number, baseY: number): CompoundBlock {
  const id = generateNodeId('action');
  return {
    nodes: [
      {
        id,
        type: 'action',
        position: { x: baseX, y: baseY },
        data: { repeat: { count: 3, sequence: [] }, _blockKey: 'repeat_count' } as ActionNodeData,
      },
    ],
    edges: [],
  };
}

export function createParallelBlock(baseX: number, baseY: number): CompoundBlock {
  const b1 = generateNodeId('action');
  const b2 = generateNodeId('action');

  return {
    nodes: [
      actionNode(b1, baseX, baseY - 65, { _blockKey: 'parallel' }),
      actionNode(b2, baseX, baseY + 65, { _blockKey: 'parallel' }),
    ],
    edges: [],
  };
}

export function createCompoundBlock(
  key: CompoundBlockKey,
  baseX: number,
  baseY: number
): CompoundBlock {
  switch (key) {
    case 'choose':
      return createChooseBlock(baseX, baseY);
    case 'if_else':
      return createIfElseBlock(baseX, baseY);
    case 'repeat_while':
      return createRepeatWhileBlock(baseX, baseY);
    case 'repeat_count':
      return createRepeatCountBlock(baseX, baseY);
    case 'parallel':
      return createParallelBlock(baseX, baseY);
  }
}
