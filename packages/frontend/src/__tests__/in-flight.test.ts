import { describe, expect, it } from 'vitest';
import { InFlight, Serial } from '../in-flight';

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

/** A promise and the function that resolves it. */
function gate(): { promise: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = () => resolve();
  });
  return { promise, open };
}

describe('saves one after another', () => {
  it('starts a second save only after the first one wrote (no second "new" flow)', async () => {
    const saves = new Serial();
    const log: string[] = [];
    const post = gate();
    let isNew = true;
    const first = saves.enqueue(
      'tab',
      async () => true,
      async () => {
        log.push(`write new=${isNew}`);
        await post.promise;
        isNew = false;
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saves.pending).toBe(false);
    // An edit and ⌘S while the first save is still writing: it waits.
    const second = saves.enqueue(
      'tab',
      async () => true,
      async () => {
        log.push(`write new=${isNew}`);
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(['write new=true']);
    post.open();
    await Promise.all([first, second]);
    expect(log).toEqual(['write new=true', 'write new=false']);
  });

  it('joins a save that is still asking for the name, and reports when all are done', async () => {
    const saves = new Serial();
    const dialog = gate();
    let prepared = 0;
    let written = 0;
    const prepare = async () => {
      prepared++;
      await dialog.promise;
      return true;
    };
    const write = async () => {
      written++;
    };
    const first = saves.enqueue('tab', prepare, write);
    expect(saves.pending).toBe(true);
    expect(saves.enqueue('tab', prepare, write)).toBe(first);
    let idle = false;
    void saves.idle().then(() => {
      idle = true;
    });
    dialog.open();
    await first;
    await saves.idle();
    expect([prepared, written, saves.pending, idle]).toEqual([1, 1, false, true]);
  });

  it('skips writing when the preparation says no (dialog cancelled)', async () => {
    const saves = new Serial();
    let written = false;
    await saves.enqueue(
      null,
      async () => false,
      async () => {
        written = true;
      }
    );
    expect(written).toBe(false);
  });
});
