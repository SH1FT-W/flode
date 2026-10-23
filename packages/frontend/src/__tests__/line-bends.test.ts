import { type FlowGraph, flowAxis } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { withoutStaleOffsets } from '../branch-view';
import { bendSlots, laidRoute, lineKey, roundedPath, withLineBends } from '../line-bends';
import { moveSelection, positionsOf } from '../selection';

function flow(): FlowGraph {
  return {
    id: '00000000-0000-4000-8000-000000000028',
    name: 'Lines',
    version: 1,
    nodes: [
      { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { trigger: 'state' } },
      { id: 'a', type: 'action', position: { x: 400, y: 0 }, data: { service: 'light.turn_on' } },
      { id: 'b', type: 'action', position: { x: 800, y: 0 }, data: { service: 'light.turn_off' } },
    ],
    edges: [
      { id: 'e1', source: 't', target: 'a' },
      { id: 'e2', source: 'a', target: 'b' },
    ],
  };
}

const first = lineKey({ source: 't', target: 'a' });
const second = lineKey({ source: 'a', target: 'b' });

describe('lines laid by hand (#28)', () => {
  it('keeps bends per line and lays a line itself again without them', () => {
    const laid = withLineBends(flow(), first, [{ x: 300, y: -80 }]);
    expect(laid.lineBends).toEqual({ [first]: [{ x: 300, y: -80 }] });
    expect(withLineBends(laid, first, []).lineBends).toBeUndefined();
  });

  it('runs straight from bend to bend with rounded corners', () => {
    const path = roundedPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(path).toBe('M 0 0 L 88 0 Q 100 0 100 12 L 100 100');
  });

  it('runs at right angles: along out of the card, across to each bend, along into the next', () => {
    const axis = flowAxis(flow());
    const from = { x: 0, y: 0 };
    const to = { x: 300, y: 0 };
    const bends = [
      { x: 100, y: -80 },
      { x: 200, y: -80 },
    ];
    expect(laidRoute(axis, from, bends, to)).toEqual([
      from,
      { x: 100, y: 0 },
      { x: 100, y: -80 },
      { x: 200, y: -80 },
      { x: 200, y: -80 },
      { x: 200, y: 0 },
      to,
    ]);
    // A new bend comes out of the middle of each run, on the line as drawn.
    expect(bendSlots(axis, from, bends, to)).toEqual([
      { x: 50, y: 0 },
      { x: 150, y: -80 },
      { x: 250, y: 0 },
    ]);
  });

  it('moves bends with a selection holding both cards, not with one card alone', () => {
    const laid = withLineBends(withLineBends(flow(), first, [{ x: 200, y: -60 }]), second, [
      { x: 600, y: 60 },
    ]);
    const moved = moveSelection(laid, positionsOf(laid, ['t', 'a']), 20, 40);
    expect(moved.lineBends).toEqual({
      [first]: [{ x: 220, y: -20 }],
      [second]: [{ x: 600, y: 60 }],
    });
  });

  it('forgets the bends of a line that is gone when saving', () => {
    const laid = withLineBends(flow(), lineKey({ source: 'a', target: 'gone' }), [{ x: 1, y: 1 }]);
    expect(withoutStaleOffsets(withLineBends(laid, first, [{ x: 2, y: 2 }])).lineBends).toEqual({
      [first]: [{ x: 2, y: 2 }],
    });
  });
});
