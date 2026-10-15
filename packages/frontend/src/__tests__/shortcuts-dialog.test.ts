import { describe, expect, it } from 'vitest';
import { isInDialog } from '../shortcuts';

/** A stand-in for an element in an event's path. */
const el = (localName: string): EventTarget => Object.assign(new EventTarget(), { localName });

describe('isInDialog', () => {
  it("spots keys typed in FLODE's or HA's dialogs", () => {
    for (const tag of [
      'ha-dialog',
      'ha-wa-dialog',
      'ha-md-dialog',
      'dialog-box',
      'dialog',
      'flode-ai-dialog',
      'ha-bottom-sheet',
    ]) {
      expect(isInDialog([el('input'), el(tag), el('body')])).toBe(true);
    }
  });

  it('leaves the editor alone', () => {
    expect(isInDialog([el('flode-canvas'), el('flode-panel'), el('body'), new EventTarget()])).toBe(
      false
    );
  });
});
