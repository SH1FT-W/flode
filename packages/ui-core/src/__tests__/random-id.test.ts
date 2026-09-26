import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomId } from '../random-id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a v4 UUID', () => {
    expect(randomId()).toMatch(UUID_V4);
  });

  it('works without crypto.randomUUID (HA over plain http)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    const first = randomId();
    expect(first).toMatch(UUID_V4);
    expect(randomId()).not.toBe(first);
  });
});
