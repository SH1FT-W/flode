import { isPlainObject } from '@flode/shared';
import type { TriggerIdOption } from '@flode/ui-core';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

/**
 * Gives HA's "Triggered by" condition form, rendered inside `host`, the
 * flow's triggers — without them it only says "no triggers". HA 2026.10+
 * asks through the Lit context `automationTriggers` and hands picks back via
 * `select`; FLODE speaks the plain context protocol (`context-request`
 * events, like `@lit/context`'s provider), so it needs no copy of HA's
 * context object. Older HA asks with a `subscribe-automation-config` event
 * and only reads the triggers' IDs.
 */
const LEGACY_EVENT = 'subscribe-automation-config';

const CONTEXT = 'automationTriggers';

type Step = Record<string, unknown>;

/** What HA's consumers read (HA's `AutomationTriggerContext`). */
export interface TriggerIdsValue {
  options: TriggerIdOption[];
  /** HA shows trigger numbers on trigger rows while a "Triggered by" condition is open; FLODE shows one card at a time. */
  showIndices: boolean;
  select: (condition: Step, ids: string[]) => void;
  fixDuplicateIds: () => Promise<void>;
}

type Callback = (value: TriggerIdsValue, unsubscribe: () => void) => void;

interface ContextRequest {
  /** The consumer's own callback — stable per consumer, so it identifies a subscription. */
  key: unknown;
  callback: Callback;
  subscribe: boolean;
}

function asContextRequest(event: Event): ContextRequest | null {
  if (!('context' in event) || event.context !== CONTEXT) return null;
  if (!('callback' in event) || typeof event.callback !== 'function') return null;
  const key = event.callback;
  return {
    key,
    callback: (value, unsubscribe) => Reflect.apply(key, undefined, [value, unsubscribe]),
    subscribe: 'subscribe' in event && event.subscribe === true,
  };
}

export class TriggerIdsContext implements ReactiveController {
  private value: TriggerIdsValue;
  private subscribers = new Map<unknown, { callback: Callback; unsubscribe: () => void }>();
  private triggers: readonly unknown[] = [];
  private legacySubscribers = new Set<(config: { triggers: readonly unknown[] }) => void>();

  constructor(
    host: ReactiveControllerHost & HTMLElement,
    actions: Pick<TriggerIdsValue, 'select' | 'fixDuplicateIds'>
  ) {
    this.value = { options: [], showIndices: false, ...actions };
    host.addController(this);
    host.addEventListener('context-request', this.onRequest);
    host.addEventListener(LEGACY_EVENT, this.onLegacyRequest);
  }

  hostDisconnected(): void {
    this.subscribers.clear();
    this.legacySubscribers.clear();
  }

  /** The flow's triggers and their options for every consumer — call before the editors render. */
  setTriggers(triggers: readonly unknown[], options: TriggerIdOption[]): void {
    if (options === this.value.options) return;
    this.triggers = triggers;
    this.value = { ...this.value, options };
    for (const { callback, unsubscribe } of this.subscribers.values()) {
      callback(this.value, unsubscribe);
    }
    for (const callback of this.legacySubscribers) callback({ triggers });
  }

  private onRequest = (event: Event): void => {
    const request = asContextRequest(event);
    if (!request) return;
    event.stopPropagation();
    if (!request.subscribe) {
      request.callback(this.value, () => undefined);
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
    request.callback(this.value, subscription.unsubscribe);
  };

  private onLegacyRequest = (event: Event): void => {
    // HA's fireEvent sends a plain Event with `detail` attached, not a CustomEvent.
    const detail = 'detail' in event ? event.detail : undefined;
    if (!isPlainObject(detail)) return;
    const callback = detail.callback;
    if (typeof callback !== 'function') return;
    event.stopPropagation();
    const notify = (config: { triggers: readonly unknown[] }) => {
      Reflect.apply(callback, undefined, [config]);
    };
    this.legacySubscribers.add(notify);
    detail.unsub = () => {
      this.legacySubscribers.delete(notify);
    };
    notify({ triggers: this.triggers });
  };
}
