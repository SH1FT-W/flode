import { logger } from '@/lib/logger';
import { notifyHaComponentIssue } from './haAvailabilityNotice';

/**
 * Minimal shape of HA's `window.loadCardHelpers()` — undocumented internal
 * API used by the custom-card ecosystem to force HA to register Lit
 * components (pickers, selectors, ...) it otherwise loads lazily. Not
 * guaranteed stable across HA versions; every call site in this app must go
 * through `ensureHaComponents` below, never call this directly.
 */
interface CardHelpers {
  createCardElement: (config: { type: string; [key: string]: unknown }) => Promise<{
    constructor: { getConfigElement?: () => Promise<unknown> };
  }>;
}

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

const LOAD_TIMEOUT_MS = 3000;

/**
 * Which HA lovelace card's config element to instantiate in order to force
 * a given component to register itself in `customElements`. Best-effort and
 * version-dependent — if HA ever changes which card pulls in which picker,
 * this table is the only place that needs updating. `entities` is the
 * broadest probe (registers most picker types via its per-row editor) and
 * is used as the fallback for anything not listed explicitly.
 */
const PROBE_CARD_BY_COMPONENT: Record<string, string> = {
  'ha-entity-picker': 'entities',
  'ha-icon-picker': 'button',
  'ha-selector': 'button',
  'ha-device-picker': 'entities',
  'ha-area-picker': 'entities',
  // button-card's editor pulls in hui-action-editor -> ha-service-control -> ha-service-picker
  // (verified against home-assistant/frontend source, 03.07.2026).
  'ha-service-picker': 'button',
  // entities-card's editor imports ha-switch directly (verified via `gh search code`, 03.07.2026).
  'ha-switch': 'entities',
  // hui-todo-list-card.ts imports ha-select at module top level (verified via `gh api`, 03.07.2026).
  // No lovelace card reliably pulls in ha-textfield/ha-textarea, so those aren't wrapped here.
  'ha-select': 'todo-list',
};

/**
 * Components with NO lovelace card path at all — `ha-category-picker` and
 * `ha-labels-picker` only ever get imported by config-panel dialogs
 * (automation/scene save dialogs, registry detail dialogs), never by a
 * lovelace card editor (verified via `gh search code` across
 * home-assistant/frontend, 04.07.2026 — every reference lives under
 * `src/panels/config/`). `loadCardHelpers` can't reach them, so probing via
 * a card is pointless: only check whether something else already caused HA
 * to register them (e.g. the user visited Settings > Automations earlier in
 * this tab), don't treat "not yet registered" as an incompatibility worth a
 * toast — it's the expected common case, not a version mismatch.
 */
const PASSIVE_ONLY = new Set(['ha-category-picker', 'ha-labels-picker']);

/** Component names already confirmed registered — never re-probed. */
const confirmed = new Set<string>();
/** In-flight load attempts, keyed by component name, so concurrent callers share one probe. */
const inFlight = new Map<string, Promise<boolean>>();

function alreadyDefined(name: string): boolean {
  return !!customElements.get(name);
}

async function waitForDefinition(name: string, timeoutMs: number): Promise<boolean> {
  if (alreadyDefined(name)) return true;
  const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  const defined = customElements.whenDefined(name).then(() => true as const);
  return Promise.race([defined, timeout]);
}

async function probe(name: string): Promise<boolean> {
  if (alreadyDefined(name)) {
    confirmed.add(name);
    return true;
  }

  if (PASSIVE_ONLY.has(name)) {
    const ok = await waitForDefinition(name, LOAD_TIMEOUT_MS);
    if (ok) confirmed.add(name);
    return ok;
  }

  try {
    const loadCardHelpers = window.loadCardHelpers;
    if (!loadCardHelpers) {
      logger.debug('[FLODE] window.loadCardHelpers unavailable — not running inside HA?');
      return false;
    }

    const helpers = await loadCardHelpers();
    const cardType = PROBE_CARD_BY_COMPONENT[name] ?? 'entities';
    const card = await helpers.createCardElement({ type: cardType, entities: [] });
    await card.constructor.getConfigElement?.();

    const ok = await waitForDefinition(name, LOAD_TIMEOUT_MS);
    if (ok) {
      confirmed.add(name);
    } else {
      // We ARE inside HA (loadCardHelpers exists) but the component still
      // didn't show up — a genuine incompatibility worth surfacing, unlike
      // the loadCardHelpers-missing case above (expected in standalone dev).
      notifyHaComponentIssue(`HA component "${name}" did not register within ${LOAD_TIMEOUT_MS}ms`);
    }
    return ok;
  } catch (error) {
    notifyHaComponentIssue(`Failed to load HA component "${name}": ${String(error)}`);
    return false;
  }
}

/**
 * Ensures each of `names` is registered in `customElements`, triggering HA's
 * lazy-load mechanism as needed. Safe to call repeatedly — results are
 * cached, and concurrent calls for the same component share one probe.
 * Resolves `false` (never rejects) if any component couldn't be loaded
 * within the timeout — callers should fall back to FLODE's own component.
 */
export async function ensureHaComponents(names: string[]): Promise<boolean> {
  const results = await Promise.all(
    names.map((name) => {
      if (confirmed.has(name)) return true;
      let pending = inFlight.get(name);
      if (!pending) {
        pending = probe(name).finally(() => inFlight.delete(name));
        inFlight.set(name, pending);
      }
      return pending;
    })
  );
  return results.every(Boolean);
}
