/** Loads still running, by key — so the same flow isn't opened twice by a double click. */
export class InFlight {
  private readonly keys = new Set<string>();

  /** `false` when `key` is already loading. */
  start(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }

  /** `true` when nothing is loading any more. */
  end(key: string): boolean {
    this.keys.delete(key);
    return this.keys.size === 0;
  }
}
