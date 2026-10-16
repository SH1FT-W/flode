import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import {
  adoptIntoBranch,
  branchCardId,
  branchInsertAt,
  branchView,
  detachBranchStep,
  insertBranchStep,
  moveBranchCard,
  removeBranchStep,
  setBranchStep,
  storedPosition,
  withoutStaleOffsets,
} from '../branch-view';
import { NODE_WIDTH, withEnabledToggled } from '../flow-model';
import { flowYaml } from '../flow-yaml';
import { nodeToStep } from '../ha-step';
import { type HaTrace, nodeForPath, runMarks } from '../trace';

/** The automation from #27, plus a step after the choose. */
const choose = {
  choose: [
    {
      conditions: [{ condition: 'trigger', id: 'armed_home' }],
      sequence: [{ action: 'script.turn_on', target: { entity_id: 'script.test' } }],
    },
  ],
  default: [
    {
      action: 'alarm_control_panel.alarm_arm_home',
      target: { entity_id: 'alarm_control_panel.ha_alarm' },
    },
  ],
};

function flow(block: Record<string, unknown> = choose): FlowGraph {
  return {
    id: '00000000-0000-4000-8000-000000000027',
    name: 'Issue 27',
    version: 1,
    nodes: [
      {
        id: 't',
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: { trigger: 'state', entity_id: 'alarm_control_panel.master' },
      },
      { id: 'b', type: 'action', position: { x: 400, y: 0 }, data: { _raw: block } },
      { id: 'n', type: 'action', position: { x: 800, y: 0 }, data: { service: 'notify.notify' } },
    ],
    edges: [
      { id: 'e1', source: 't', target: 'b' },
      { id: 'e2', source: 'b', target: 'n' },
    ],
  };
}

const option = branchCardId('b', ['choose', 0, 'sequence', 0]);
const fallback = branchCardId('b', ['default', 0]);

describe('branch view (#27)', () => {
  it('draws each option and the default as their own branch, meeting again after the block', () => {
    const view = branchView(flow());
    expect(view.branches.get('b')?.map((b) => b.label)).toEqual([
      { kind: 'option', number: 1 },
      { kind: 'default' },
    ]);
    const nodes = new Map(view.graph.nodes.map((n) => [n.id, n]));
    expect(nodes.get(option)?.data).toMatchObject({ service: 'script.turn_on' });
    expect(nodes.get(fallback)?.data).toMatchObject({
      service: 'alarm_control_panel.alarm_arm_home',
    });
    // Branch steps right of the block, the option above the default …
    const optionY = nodes.get(option)?.position.y ?? 0;
    expect(nodes.get(option)?.position.x).toBeGreaterThan(400 + NODE_WIDTH);
    expect(optionY).toBeLessThan(nodes.get(fallback)?.position.y ?? 0);
    // … and the next step moved right past them.
    expect(nodes.get('n')?.position.x).toBeGreaterThan(nodes.get(option)?.position.x ?? 0);
    const lines = view.graph.edges.map((e) => [e.source, e.sourceHandle ?? null, e.target]);
    expect(lines).toHaveLength(5);
    expect(lines).toEqual(
      expect.arrayContaining([
        ['t', null, 'b'],
        ['b', 'b0', option],
        [option, null, 'n'],
        ['b', 'b1', fallback],
        [fallback, null, 'n'],
      ])
    );
    // Both lines into `n` stand for the stored block → n connection.
    expect([...view.edgeOrigin.values()]).toEqual(['e2', 'e2']);
  });

  it('shows an empty else as its own output straight to what follows', () => {
    const view = branchView(flow({ if: [{ condition: 'state' }], then: [{ delay: 1 }] }));
    expect(view.branches.get('b')?.map((b) => b.label.kind)).toEqual(['then', 'else']);
    expect(
      view.graph.edges.filter((e) => e.target === 'n').map((e) => [e.source, e.sourceHandle])
    ).toEqual([
      [branchCardId('b', ['then', 0]), undefined],
      ['b', 'b1'],
    ]);
  });

  it('leaves flows without choose / if as they are', () => {
    const graph = flow({ delay: 1 });
    expect(branchView(graph).graph).toBe(graph);
  });

  it('writes an edited branch step back into the block and saves a plain choose', async () => {
    const graph = flow();
    const ref = branchView(graph).cards.get(option);
    if (!ref) throw new Error('no card');
    const edited = setBranchStep(graph, ref, { action: 'light.turn_on' });
    expect(edited.error).toBeNull();
    const yaml = await flowYaml(edited.graph, 'automation');
    expect(yaml).toContain('choose:');
    expect(yaml).toContain('- action: light.turn_on');
    expect(yaml).toContain('default:');
    expect(yaml).not.toContain('script.turn_on');
  });

  it('disables and re-enables a branch step from its menu (#30)', async () => {
    const graph = flow();
    const view = branchView(graph);
    const ref = view.cards.get(option);
    const card = view.graph.nodes.find((n) => n.id === option);
    if (!ref || !card) throw new Error('no card');
    const off = setBranchStep(graph, ref, withEnabledToggled(nodeToStep(card)));
    expect(off.error).toBeNull();
    const offView = branchView(off.graph);
    expect(offView.graph.nodes.find((n) => n.id === option)?.data).toMatchObject({
      enabled: false,
    });
    expect(await flowYaml(off.graph, 'automation')).toContain('enabled: false');
    const offRef = offView.cards.get(option);
    const offCard = offView.graph.nodes.find((n) => n.id === option);
    if (!offRef || !offCard) throw new Error('no card');
    const on = setBranchStep(off.graph, offRef, withEnabledToggled(nodeToStep(offCard)));
    expect(await flowYaml(on.graph, 'automation')).not.toContain('enabled');
  });

  it('takes a branch step out of its branch as a card of its own (#35)', () => {
    const graph = flow();
    const view = branchView(graph);
    const ref = view.cards.get(fallback);
    const card = view.graph.nodes.find((n) => n.id === fallback);
    if (!ref || !card) throw new Error('no card');
    const detached = detachBranchStep(graph, ref, card);
    // The block lost its default; the step is a free card where it was drawn (to be connected again).
    expect(JSON.stringify(detached.nodes.find((n) => n.id === 'b')?.data)).not.toContain('default');
    const free = detached.nodes.find((n) => n.type === 'action' && n.id !== 'b' && n.id !== 'n');
    expect(free?.data).toMatchObject({ service: 'alarm_control_panel.alarm_arm_home' });
    expect(free?.position).toEqual(card.position);
    expect(detached.edges.some((e) => e.source === free?.id || e.target === free?.id)).toBe(false);
    expect(branchView(detached).cards.has(fallback)).toBe(false);
  });

  it('adds steps with a branch’s "+" and drops an emptied default', () => {
    const graph = flow();
    const view = branchView(graph);
    // "+" on the option's card adds after it; on the default output before the first step.
    const after = branchInsertAt(view, option, null);
    expect(after?.index).toBe(1);
    const added = after && insertBranchStep(graph, after, { delay: 2 });
    expect(added?.id).toBe(branchCardId('b', ['choose', 0, 'sequence', 1]));
    expect(added?.graph.nodes[1]?.data).toMatchObject({
      _raw: { choose: [{ sequence: [{ action: 'script.turn_on' }, { delay: 2 }] }] },
    });
    const ref = view.cards.get(fallback);
    if (!ref) throw new Error('no card');
    const removed = removeBranchStep(graph, ref);
    expect(removed.nodes[1]?.data).toEqual({ _raw: { choose: choose.choose } });
    // The empty default still has its output; "+" there brings `default:` back.
    const empty = branchView(removed);
    const insert = branchInsertAt(empty, 'b', 'b1');
    const back = insert && insertBranchStep(removed, insert, { delay: 3 });
    expect(back?.graph.nodes[1]?.data).toEqual({
      _raw: { choose: choose.choose, default: [{ delay: 3 }] },
    });
  });

  it('pulls a free card into the branch a connection was dragged from (#36)', () => {
    const graph = flow();
    // A free card and a plain chain after it.
    const free: FlowGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        { id: 'f', type: 'action', position: { x: 400, y: 300 }, data: { delay: 5 } },
        { id: 'g', type: 'action', position: { x: 800, y: 300 }, data: { delay: 6 } },
      ],
      edges: [...graph.edges, { id: 'e3', source: 'f', target: 'g' }],
    };
    const view = branchView(free);
    // From the default output (its "+" adds before the first step): the chain goes in there, the cards are gone.
    const at = branchInsertAt(view, 'b', 'b1');
    const adopted = at && adoptIntoBranch(free, at, 'f');
    expect(adopted?.nodes.map((n) => n.id)).toEqual(['t', 'b', 'n']);
    expect(adopted?.edges.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(adopted?.nodes[1]?.data).toMatchObject({
      _raw: {
        default: [{ delay: 5 }, { delay: 6 }, { action: 'alarm_control_panel.alarm_arm_home' }],
      },
    });
    // From the option's card: after it.
    const after = branchInsertAt(view, option, null);
    const appended = after && adoptIntoBranch(free, after, 'f');
    expect(appended?.nodes[1]?.data).toMatchObject({
      _raw: { choose: [{ sequence: [{ action: 'script.turn_on' }, { delay: 5 }, { delay: 6 }] }] },
    });
    // A card in the middle of a chain is tied to what leads to it.
    expect(after && adoptIntoBranch(free, after, 'g')).toBeNull();
    // Not adoptable: the block itself, a trigger, a card something leads to, a chain that forks.
    expect(at && adoptIntoBranch(free, at, 'b')).toBeNull();
    expect(at && adoptIntoBranch(free, at, 't')).toBeNull();
    expect(at && adoptIntoBranch(free, at, 'n')).toBeNull();
    const forked: FlowGraph = {
      ...free,
      edges: [...free.edges, { id: 'e4', source: 'f', target: 'n' }],
    };
    expect(at && adoptIntoBranch(forked, at, 'f')).toBeNull();
  });

  it('stores drawn positions unshifted', () => {
    const view = branchView(flow());
    const drawn = view.graph.nodes.find((n) => n.id === 'n')?.position ?? { x: 0, y: 0 };
    expect(storedPosition(view, 'n', drawn)).toEqual({ x: 800, y: 0 });
  });

  it('marks the branch a run took, and only that one', () => {
    const trace: HaTrace = {
      run_id: '1',
      state: 'stopped',
      timestamp: { start: '' },
      context: { id: 'c' },
      config: {},
      trace: {
        'trigger/0': [{ path: 'trigger/0', timestamp: '' }],
        'action/0': [{ path: 'action/0', timestamp: '' }],
        'action/0/choose/0': [
          { path: 'action/0/choose/0', timestamp: '', result: { result: true } },
        ],
        'action/0/choose/0/sequence/0': [{ path: 'action/0/choose/0/sequence/0', timestamp: '' }],
        'action/1': [{ path: 'action/1', timestamp: '' }],
      },
    };
    const marks = runMarks(flow(), 'automation', trace);
    expect(marks.get(option)).toBe('done');
    expect(marks.has(fallback)).toBe(false);
    expect(marks.get('b')).toBe('done');
    expect(nodeForPath(flow(), 'automation', 'action/0/choose/0/sequence/0')).toBe(option);
    expect(nodeForPath(flow(), 'automation', 'action/0/choose/0')).toBe('b');
  });

  /** The automation from the follow-up on #27: a choose in the else of an if. */
  const nested = {
    if: [{ condition: 'state', entity_id: 'switch.x', state: 'on' }],
    then: [{ action: 'climate.set_fan_mode' }],
    else: [
      { action: 'climate.set_fan_mode' },
      {
        choose: [
          { conditions: [{ condition: 'state' }], sequence: [{ delay: 1 }] },
          { conditions: [{ condition: 'state' }], sequence: [{ delay: 2 }, { delay: 3 }] },
        ],
      },
    ],
  };
  const inner = branchCardId('b', ['else', 1]);
  const innerFirst = branchCardId('b', ['else', 1, 'choose', 0, 'sequence', 0]);
  const innerSecond = branchCardId('b', ['else', 1, 'choose', 1, 'sequence', 0]);

  it('expands a choose nested in a branch into its own outputs', () => {
    const view = branchView(flow(nested));
    expect(view.branches.get(inner)?.map((b) => b.label.kind)).toEqual([
      'option',
      'option',
      'default',
    ]);
    expect(view.cards.get(innerFirst)).toMatchObject({ blockId: 'b', parentId: inner });
    const nodes = new Map(view.graph.nodes.map((n) => [n.id, n]));
    expect(nodes.get(innerFirst)?.position.x).toBeGreaterThan(nodes.get(inner)?.position.x ?? 0);
    expect(nodes.get(innerFirst)?.position.y).toBeLessThan(nodes.get(innerSecond)?.position.y ?? 0);
    // The step after the if sits right of the widest branch (else → choose → two steps).
    expect(nodes.get('n')?.position.x).toBeGreaterThan(
      nodes.get(branchCardId('b', ['else', 1, 'choose', 1, 'sequence', 1]))?.position.x ?? 0
    );
    // The inner branches meet at the inner block's "+" (the empty default straight
    // from its output); from there one line goes on to `n`.
    const innerTail = view.tails.get(inner);
    expect(innerTail?.through).toBe(true);
    expect(innerTail?.exits.map((e) => [e.source, e.sourceHandle])).toEqual(
      expect.arrayContaining([
        [innerFirst, undefined],
        [branchCardId('b', ['else', 1, 'choose', 1, 'sequence', 1]), undefined],
        [inner, 'b2'],
      ])
    );
    const intoN = view.graph.edges.filter((e) => e.target === 'n');
    expect(intoN.map((e) => [e.source, e.sourceHandle])).toEqual([
      [branchCardId('b', ['then', 0]), undefined],
      [inner, undefined],
    ]);
    expect(view.start.get(intoN[1]?.id ?? '')).toEqual(innerTail?.at);
    expect(new Set(view.edgeOrigin.values())).toEqual(new Set(['e2']));
  });

  it('adds into and removes from a nested branch', () => {
    const graph = flow(nested);
    const view = branchView(graph);
    const at = branchInsertAt(view, inner, 'b2');
    expect(at).toMatchObject({ blockId: 'b', index: 0 });
    const added = at && insertBranchStep(graph, at, { delay: 9 });
    expect(added?.id).toBe(branchCardId('b', ['else', 1, 'default', 0]));
    const ref = view.cards.get(innerFirst);
    if (!ref) throw new Error('no card');
    expect(removeBranchStep(graph, ref).nodes[1]?.data).toMatchObject({
      _raw: {
        else: [{}, { choose: [{ sequence: [] }, { sequence: [{ delay: 2 }, { delay: 3 }] }] }],
      },
    });
  });

  it('marks steps of a nested branch in a run', () => {
    expect(nodeForPath(flow(nested), 'automation', 'action/0/else/1/choose/1/sequence/0')).toBe(
      innerSecond
    );
    expect(nodeForPath(flow(nested), 'automation', 'action/0/else/1/choose/1')).toBe(inner);
  });

  it('moves a branch card on its own and keeps the move when steps are added before it', () => {
    const graph = flow(nested);
    const view = branchView(graph);
    const drawn = (v: typeof view, id: string) =>
      v.graph.nodes.find((n) => n.id === id)?.position ?? { x: 0, y: 0 };
    const before = drawn(view, inner);
    const moved = moveBranchCard(graph, view, inner, { x: before.x + 40, y: before.y + 200 });
    expect(moved.branchOffsets).toEqual({ [inner]: { x: 40, y: 200 } });
    const after = branchView(moved);
    expect(drawn(after, inner)).toEqual({ x: before.x + 40, y: before.y + 200 });
    // Its branch steps follow it; other cards and the block stay put.
    expect(drawn(after, innerFirst).y).toBe(drawn(view, innerFirst).y + 200);
    expect(drawn(after, branchCardId('b', ['else', 0]))).toEqual(
      drawn(view, branchCardId('b', ['else', 0]))
    );
    // A step added in front renumbers the card — its offset goes along.
    const at = branchInsertAt(after, 'b', 'b1');
    const added = at && insertBranchStep(moved, at, { delay: 0 });
    expect(added?.graph.branchOffsets).toEqual({
      [branchCardId('b', ['else', 2])]: { x: 40, y: 200 },
    });
    // Removing it drops the offset; moving back home stores nothing.
    const ref = after.cards.get(inner);
    if (!ref) throw new Error('no card');
    expect(removeBranchStep(moved, ref).branchOffsets).toBeUndefined();
    expect(moveBranchCard(moved, after, inner, before).branchOffsets).toBeUndefined();
    expect(
      withoutStaleOffsets({ ...moved, branchOffsets: { 'b::else.7': { x: 1, y: 1 } } })
    ).not.toHaveProperty('branchOffsets');
  });

  it('saves moved branch cards in the layout metadata, not in the steps', async () => {
    const graph = { ...flow(nested), branchOffsets: { [inner]: { x: 40, y: 200 } } };
    const yaml = await flowYaml(graph, 'automation');
    expect(yaml).not.toContain('branch_offsets');
    const { FlowTranspiler, buildAutomationSaveConfig } = await import('@flode/transpiler');
    const saved = buildAutomationSaveConfig(new FlowTranspiler(), graph, {
      alias: 'x',
      description: '',
    });
    expect(saved.config?.variables).toMatchObject({
      _flode_metadata: { branch_offsets: { [inner]: { x: 40, y: 200 } } },
    });
  });
});
