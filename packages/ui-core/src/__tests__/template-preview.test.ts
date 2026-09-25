import { describe, expect, it } from 'vitest';
import {
  formatTemplateResult,
  parseTemplateListeners,
  subscribeTemplatePreview,
  type TemplatePreview,
  templateResultType,
} from '../template-preview';

describe('template preview', () => {
  it('names result types like HA returns them', () => {
    expect([42, true, 'x', [1], { a: 1 }, null].map(templateResultType)).toEqual([
      'number',
      'boolean',
      'text',
      'list',
      'object',
      'none',
    ]);
    expect(formatTemplateResult({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('reads what a template listens to', () => {
    expect(
      parseTemplateListeners({ all: false, entities: ['light.a'], domains: [], time: true })
    ).toEqual({
      all: false,
      entities: ['light.a'],
      domains: [],
      time: true,
    });
  });

  it('subscribes to render_template and reports results', async () => {
    const updates: TemplatePreview[] = [];
    let sent: Record<string, unknown> | undefined;
    const stop = subscribeTemplatePreview(
      {
        subscribeMessage: async (callback, message) => {
          sent = message;
          callback({
            result: 3,
            listeners: { all: false, entities: [], domains: [], time: false },
          } as never);
          return () => undefined;
        },
      },
      '{{ 1 + 2 }}',
      { x: 1 },
      (preview) => updates.push(preview)
    );
    await Promise.resolve();
    stop();
    expect(sent).toMatchObject({
      type: 'render_template',
      template: '{{ 1 + 2 }}',
      variables: { x: 1 },
    });
    expect(updates.map((u) => u.status)).toEqual(['loading', 'ok']);
  });

  it('stays idle for plain text', () => {
    const updates: TemplatePreview[] = [];
    subscribeTemplatePreview(
      { subscribeMessage: async () => () => undefined },
      'hallo',
      undefined,
      (p) => updates.push(p)
    );
    expect(updates).toEqual([{ status: 'idle' }]);
  });
});
