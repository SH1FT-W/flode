/** Work still running, by key — so the same flow isn't loaded or asked about twice at once. */
export class InFlight {
  private readonly keys = new Set<string>();

  /** `false` when `key` is already loading. */
  start(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }

  /** `true` when nothing is loading any more. */
  end(key: string): boolean {
    this.keys.delete(key);
    return this.keys.size === 0;
  }
}

/**
 * Jobs that must never overlap (saving a flow): each one waits for the one
 * before. A job has two phases — `prepare` (may ask the user, e.g. for a
 * name) and `run`; a job requested for the same key while another one hasn't
 * left `prepare` yet joins that one instead of queueing a second.
 */
export class Serial {
  private tail: Promise<void> = Promise.resolve();
  private waiting: { key: string | null; done: Promise<void> } | null = null;

  /** A job is waiting or still preparing. */
  get pending(): boolean {
    return this.waiting !== null;
  }

  /** Resolves once every job requested so far has finished. */
  idle(): Promise<void> {
    return this.tail;
  }

  enqueue(
    key: string | null,
    prepare: () => Promise<boolean>,
    run: () => Promise<void>
  ): Promise<void> {
    if (this.waiting?.key === key) return this.waiting.done;
    const job = { key, done: Promise.resolve() };
    job.done = this.tail.then(() => this.runJob(job, prepare, run));
    this.waiting = job;
    this.tail = job.done.catch(() => undefined);
    return job.done;
  }

  private async runJob(
    job: { key: string | null; done: Promise<void> },
    prepare: () => Promise<boolean>,
    run: () => Promise<void>
  ): Promise<void> {
    let ready = false;
    try {
      ready = await prepare();
    } finally {
      if (this.waiting === job) this.waiting = null;
    }
    if (ready) await run();
  }
}
