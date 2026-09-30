import { describe, expect, it } from 'vitest';
import { type AutomationListItem, sameFlow } from '../ha';

const item: AutomationListItem = {
  kind: 'automation',
  entityId: 'automation.flur',
  configId: '1',
  name: 'Flur',
  enabled: true,
  lastTriggered: null,
};

describe('sameFlow', () => {
  it('matches by kind and config id — renamed or re-read items included', () => {
    const renamed: AutomationListItem = { ...item, name: 'Flur neu', entityId: 'automation.neu' };
    expect(sameFlow(item, renamed)).toBe(true);
    expect(sameFlow(item, { ...item, kind: 'script' })).toBe(false);
    expect(sameFlow(item, { ...item, configId: '2' })).toBe(false);
    expect(sameFlow(item, undefined)).toBe(false);
  });
});
