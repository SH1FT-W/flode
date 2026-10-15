import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { applyProposal } from '../flow-model';

const current: FlowGraph = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Flur Licht',
  description: 'Licht im Flur',
  version: 1,
  nodes: [],
  edges: [],
  metadata: { mode: 'restart' },
  userVariables: { hell: 80 },
};

const node = {
  id: 't',
  type: 'trigger' as const,
  position: { x: 0, y: 0 },
  data: { trigger: 'state', entity_id: 'light.a' },
};

/** What the parser makes of a reply without alias / description / mode. */
const bare: FlowGraph = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Imported Automation',
  description: '',
  version: 1,
  nodes: [node],
  edges: [],
  metadata: { mode: 'single' },
};

describe("applying the assistant's proposal", () => {
  it('keeps name, description, mode and variables the reply did not write', () => {
    const applied = applyProposal(current, bare, new Set(['triggers', 'actions']));
    expect(applied.nodes).toEqual([node]);
    expect(applied.name).toBe('Flur Licht');
    expect(applied.description).toBe('Licht im Flur');
    expect(applied.metadata?.mode).toBe('restart');
    expect(applied.userVariables).toEqual({ hell: 80 });
    expect(applied.id).toBe(current.id);
  });

  it('takes over what the reply wrote — variables and an explicit single mode included', () => {
    const proposal: FlowGraph = {
      ...bare,
      name: 'Flur',
      description: '',
      userVariables: { hell: 40 },
      userTriggerVariables: { raum: 'flur' },
    };
    const applied = applyProposal(
      current,
      proposal,
      new Set(['alias', 'description', 'mode', 'variables', 'trigger_variables'])
    );
    expect(applied.name).toBe('Flur');
    expect(applied.description).toBe('');
    expect(applied.metadata?.mode).toBe('single');
    expect(applied.userVariables).toEqual({ hell: 40 });
    expect(applied.userTriggerVariables).toEqual({ raum: 'flur' });
  });

  it("without the reply's keys only takes values other than the parser's defaults", () => {
    expect(applyProposal(current, bare).name).toBe('Flur Licht');
    expect(applyProposal(current, bare).metadata?.mode).toBe('restart');
    const named = applyProposal(current, {
      ...bare,
      name: 'Neu',
      description: 'Neu beschrieben',
      metadata: { mode: 'queued', max: 3 },
      userVariables: { hell: 10 },
    });
    expect([named.name, named.description, named.metadata?.mode, named.metadata?.max]).toEqual([
      'Neu',
      'Neu beschrieben',
      'queued',
      3,
    ]);
    expect(named.userVariables).toEqual({ hell: 10 });
  });

  it("never changes the flow's kind", () => {
    const script = { ...current, metadata: { mode: 'single' as const, kind: 'script' as const } };
    expect(applyProposal(script, bare, new Set(['mode'])).metadata?.kind).toBe('script');
  });
});
