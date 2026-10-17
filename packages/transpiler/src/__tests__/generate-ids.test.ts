import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateEdgeId } from '../utils/generateIds';

describe('generateEdgeId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands out 100 different ids for the same connection within one millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateEdgeId('a', 'b'));
    expect(ids.size).toBe(100);
    expect(ids.has('e-a-b-1700000000000')).toBe(true);
    expect(ids.has('e-a-b-1700000000000_99')).toBe(true);
  });

  it('keeps the handle in the id and starts over in the next millisecond', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_001);
    expect(generateEdgeId('c', 'd', 'true')).toBe('e-c-d-true-1700000000001');
    expect(generateEdgeId('c', 'd', 'false')).toBe('e-c-d-false-1700000000001');
    expect(generateEdgeId('c', 'd', 'true')).toBe('e-c-d-true-1700000000001_1');
    now.mockReturnValue(1_700_000_000_002);
    expect(generateEdgeId('c', 'd', 'true')).toBe('e-c-d-true-1700000000002');
  });
});
