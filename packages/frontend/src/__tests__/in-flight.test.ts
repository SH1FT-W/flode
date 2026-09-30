import { describe, expect, it } from 'vitest';
import { InFlight } from '../in-flight';

describe('loads in flight', () => {
  it('starts each key once until it has ended', () => {
    const loads = new InFlight();
    expect(loads.start('automation:1')).toBe(true);
    expect(loads.start('automation:1')).toBe(false);
    loads.end('automation:1');
    expect(loads.start('automation:1')).toBe(true);
  });

  it('is only idle once every load has ended', () => {
    const loads = new InFlight();
    loads.start('automation:1');
    loads.start('script:2');
    expect(loads.end('automation:1')).toBe(false);
    expect(loads.end('script:2')).toBe(true);
  });
});
