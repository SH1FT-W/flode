/**
 * Answers HA's Lit context requests (`context-request` events, the protocol
 * `@lit/context` speaks) for one context name, for the HA elements rendered
 * inside `host`. FLODE needs no copy of HA's context objects: HA creates
 * them with plain string keys (`createContext("triggerDescriptions")`).
 */

type Callback<T> = (value: T, unsubscribe: () => void) => void;

interface ContextRequest<T> {
  /** The consumer's own callback — stable per consumer, so it identifies a subscription. */
  key: unknown;
  callback: Callback<T>;
  subscribe: boolean;
}

function asContextRequest<T>(event: Event, context: string): ContextRequest<T> | null {
  if (!('context' in event) || event.context !== context) return null;
  if (!('callback' in event) || typeof event.callback !== 'function') return null;
  const key = event.callback;
  return {
    key,
    callback: (value, unsubscribe) => Reflect.apply(key, undefined, [value, unsubscribe]),
    subscribe: 'subscribe' in event && event.subscribe === true,
  };
}

export class HaContextProvider<T> {
  private subscribers = new Map<unknown, { callback: Callback<T>; unsubscribe: () => void }>();

  constructor(
    host: HTMLElement,
    private readonly context: string,
    private current: T
  ) {
    host.addEventListener('context-request', this.onRequest);
  }

  get value(): T {
    return this.current;
  }

  /** A new value for every consumer. */
  set(value: T): void {
    this.current = value;
    for (const { callback, unsubscribe } of this.subscribers.values()) callback(value, unsubscribe);
  }

  /** Forgets all consumers (the host left the page). */
  clear(): void {
    this.subscribers.clear();
  }

  private onRequest = (event: Event): void => {
    const request = asContextRequest<T>(event, this.context);
    if (!request) return;
    event.stopPropagation();
    if (!request.subscribe) {
      request.callback(this.current, () => undefined);
      return;
    }
    const subscription = {
      callback: request.callback,
      unsubscribe: () => {
        if (this.subscribers.get(request.key) === subscription)
          this.subscribers.delete(request.key);
      },
    };
    this.subscribers.set(request.key, subscription);
    request.callback(this.current, subscription.unsubscribe);
  };
}
