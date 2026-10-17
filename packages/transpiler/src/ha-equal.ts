/**
 * What "the same automation" means after a round trip through FLODE.
 *
 * Home Assistant stores an automation as it was posted, so a config FLODE writes
 * back is compared with the original on the stored objects, not on YAML text.
 * `normalizeHaConfig` brings both sides to one form; two configs are the same
 * automation when the normalized objects are deeply equal (key order never counts).
 *
 * The rules, each one something Home Assistant itself treats as the same:
 *
 * 1. Old keys are read as their current names: `platform:` → `trigger:` (when the step
 *    has no `trigger` key yet), `service:` → `action:` (for a string value), and the
 *    top-level `trigger`/`condition`/`action` as `triggers`/`conditions`/`actions`,
 *    always as lists. HA's config API migrates them the same way.
 * 2. `id`, FLODE's layout block (`variables._flode_metadata`, legacy `_cafe_metadata`)
 *    and an empty `variables:` left behind by it are not part of the automation.
 *    An empty `alias` or `description` counts as none.
 * 3. `mode: single` is HA's default and counts as not set.
 * 4. An empty top-level list (`conditions: []`) and empty service `data: {}` count as
 *    not set: HA runs the automation the same way. Elsewhere an empty list stays
 *    (`then: []` is a required key of `if`).
 * 5. `null` is a value, not "missing": `to: null` on a state trigger means something.
 *
 * Nothing else is normalized. In particular FLODE's own node keys (`_raw`, `_step`)
 * must never appear in a config; `internalKeysIn` lists where they do.
 *
 * Used by the unit tests (every fixture through parse → transpile) and by the release
 * gate (every fixture saved from the real editor, compared with what HA stores).
 */

export type HaConfig = Record<string, unknown>;

const PLURAL: Record<string, string> = {
  trigger: 'triggers',
  condition: 'conditions',
  action: 'actions',
};
const TOP_LISTS = ['triggers', 'conditions', 'actions'];
const FLODE_VARIABLES = ['_flode_metadata', '_cafe_metadata'];
/** Keys of FLODE's graph nodes that have no business in a Home Assistant config. */
const INTERNAL_KEYS = ['_raw', '_step'];

function isRecord(value: unknown): value is HaConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function migrateStep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(migrateStep);
  if (!isRecord(value)) return value;
  const out: HaConfig = {};
  for (const [key, item] of Object.entries(value)) {
    let name = key;
    if (key === 'platform' && !('trigger' in value)) name = 'trigger';
    else if (key === 'service' && !('action' in value) && typeof item === 'string') name = 'action';
    const migrated = migrateStep(item);
    // Rule 4: empty service data is no data.
    if (name === 'data' && isRecord(migrated) && Object.keys(migrated).length === 0) continue;
    out[name] = migrated;
  }
  return out;
}

/** The automation `config` describes, in the one form two configs are compared in. */
export function normalizeHaConfig(config: unknown): HaConfig {
  if (!isRecord(config)) return {};
  const out: HaConfig = {};
  for (const [key, item] of Object.entries(config)) {
    const name = PLURAL[key] ?? key;
    if (name === 'id') continue;
    if ((name === 'alias' || name === 'description') && (item === '' || item === undefined))
      continue;
    if (name === 'mode' && item === 'single') continue;
    if (name === 'variables' && isRecord(item)) {
      const own = Object.fromEntries(
        Object.entries(item).filter(([variable]) => !FLODE_VARIABLES.includes(variable))
      );
      if (Object.keys(own).length > 0) out.variables = migrateStep(own);
      continue;
    }
    const value = migrateStep(item);
    if (TOP_LISTS.includes(name)) {
      if (value === undefined || value === null) continue;
      const list = Array.isArray(value) ? value : [value];
      if (list.length === 0) continue;
      out[name] = list;
      continue;
    }
    out[name] = value;
  }
  return out;
}

/** First place two values differ, as a path (`actions[1].data.brightness`), or null when equal. */
export function firstDifference(a: unknown, b: unknown, where = ''): string | null {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b))
      return `${where}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
    if (a.length !== b.length) return `${where}: ${a.length} items ≠ ${b.length} items`;
    for (let i = 0; i < a.length; i++) {
      const diff = firstDifference(a[i], b[i], `${where}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (isRecord(a) && isRecord(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const diff = firstDifference(a[key], b[key], where ? `${where}.${key}` : key);
      if (diff) return diff;
    }
    return null;
  }
  return Object.is(a, b) ? null : `${where}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
}

/** Paths of FLODE-internal keys (`_raw`, `_step`) inside a config; empty when it is clean. */
export function internalKeysIn(value: unknown, where = ''): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) => internalKeysIn(item, `${where}[${index}]`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const path = where ? `${where}.${key}` : key;
    return INTERNAL_KEYS.includes(key) ? [path] : internalKeysIn(item, path);
  });
}
