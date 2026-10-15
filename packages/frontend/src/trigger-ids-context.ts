import { isPlainObject } from '@flode/shared';
import type { TriggerIdOption } from '@flode/ui-core';
import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { HaContextProvider } from './ha-context';

/**
 * Gives HA's "Triggered by" condition form, rendered inside `host`, the
 * flow's triggers — without them it only says "no triggers". HA 2026.10+
 * asks through the Lit context `automationTriggers` and hands picks back via
 * `select`; FLODE answers it with `HaContextProvider`. Older HA asks with a `subscribe-automation-config` event
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

export class TriggerIdsContext implements ReactiveController {
  private provider: HaContextProvider<TriggerIdsValue>;
  private triggers: readonly unknown[] = [];
  private legacySubscribers = new Set<(config: { triggers: readonly unknown[] }) => void>();

  constructor(
    host: ReactiveControllerHost & HTMLElement,
    actions: Pick<TriggerIdsValue, 'select' | 'fixDuplicateIds'>
  ) {
    this.provider = new HaContextProvider<TriggerIdsValue>(host, CONTEXT, {
      options: [],
      showIndices: false,
      ...actions,
    });
    host.addController(this);
    host.addEventListener(LEGACY_EVENT, this.onLegacyRequest);
  }

  hostDisconnected(): void {
    this.provider.clear();
    this.legacySubscribers.clear();
  }

  /** The flow's triggers and their options for every consumer — call before the editors render. */
  setTriggers(triggers: readonly unknown[], options: TriggerIdOption[]): void {
    if (options === this.provider.value.options) return;
    this.triggers = triggers;
    this.provider.set({ ...this.provider.value, options });
    for (const callback of this.legacySubscribers) callback({ triggers });
  }

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
