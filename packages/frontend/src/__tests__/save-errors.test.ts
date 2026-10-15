import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { mergeWarningsHeading } from '../merge-warnings';
import { describeFlowCheckErrors, describeHaSaveError, haErrorLocation } from '../save-errors';

const graph: FlowGraph = {
  id: '00000000-0000-4000-8000-000000000009',
  name: 'Fehler',
  version: 1,
  nodes: [
    {
      id: 'trigger_mv99',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { trigger: 'sun', event: 'sunset', offset: 'abc' },
    },
    {
      id: 'condition_x1',
      type: 'condition',
      position: { x: 300, y: 0 },
      data: { condition: 'state', state: 'on' },
    },
    { id: 'action_a1', type: 'action', position: { x: 600, y: 0 }, data: { service: 'x' } },
  ],
  edges: [
    { id: 'e1', source: 'trigger_mv99', target: 'condition_x1' },
    { id: 'e2', source: 'condition_x1', target: 'action_a1', sourceHandle: 'true' },
  ],
};

describe('where HA points', () => {
  it('reads both of HA’s path notations as trace paths', () => {
    expect(haErrorLocation("required key not provided at 'conditions[0].entity_id'")).toEqual({
      path: 'condition/0',
      field: 'entity_id',
    });
    expect(
      haErrorLocation("extra keys not allowed @ data['actions'][2]['then'][0]['foo']")
    ).toEqual({ path: 'action/2/then/0', field: 'foo' });
    expect(haErrorLocation("offset abc should be format 'HH:MM' at 'options.offset'")).toEqual({
      field: 'offset',
    });
    expect(haErrorLocation('Connection lost')).toEqual({});
  });
});

describe('a refused save, explained', () => {
  it('names the card instead of its id and keeps HA’s words as detail', () => {
    const problem = describeHaSaveError(
      "Message malformed: required key not provided at 'conditions[0].entity_id'",
      graph,
      'automation',
      { language: 'en' }
    );
    expect(problem.issue?.nodeId).toBe('condition_x1');
    expect(problem.text).toContain('Required field "entity_id" is missing.');
    expect(problem.text).not.toContain('condition_x1');
    expect(problem.detail).toBe("required key not provided at 'conditions[0].entity_id'");
  });

  it('finds the only card with the field when HA gives no step', () => {
    const problem = describeHaSaveError(
      "Message malformed: offset abc should be format 'HH:MM' at 'options.offset'",
      graph,
      'automation',
      { language: 'de' }
    );
    expect(problem.issue?.nodeId).toBe('trigger_mv99');
    expect(problem.issue?.text).toContain('Ungültiges Format bei „offset“');
  });

  it('keeps messages that are not config checks as they are', () => {
    expect(describeHaSaveError('Connection lost', graph, 'automation', { language: 'en' })).toEqual(
      {
        text: 'Connection lost',
      }
    );
  });

  it('explains FLODE’s own checks on the card they are about', () => {
    const problem = describeFlowCheckErrors(
      [
        {
          code: 'ORPHANED_NODE',
          message: 'Node "action_a1" is not connected to any trigger',
          path: ['nodes', 'action_a1'],
        },
      ],
      graph,
      { language: 'en' }
    );
    expect(problem.issue).toEqual({
      nodeId: 'action_a1',
      text: 'The card isn’t connected to any trigger – connect or delete it.',
    });
    expect(problem.detail).not.toContain('action_a1');
  });
});

describe('merge banner heading', () => {
  it('asks to check only when a template could not be adapted', () => {
    expect(
      mergeWarningsHeading([{ kind: 'modeChanged', modes: ['single', 'queued'], mode: 'queued' }])
        .title
    ).toBe('mergeWarnInfoTitle');
    expect(
      mergeWarningsHeading([{ kind: 'variableCheck', name: 'a', source: 'X', renamed: 'a_2' }])
        .title
    ).toBe('mergeWarnCheckTitle');
  });
});
