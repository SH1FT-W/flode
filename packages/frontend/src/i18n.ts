import { coreResources, createSummaryContext, type SummaryContext } from '@flode/ui-core';
import i18next from 'i18next';
import { type HassServiceField, type HomeAssistant, serviceInfo } from './ha';
import { uiLanguage } from './strings';

/**
 * FLODE 3's i18next instance: the shared `common` + `nodes` namespaces from
 * `@flode/ui-core`, following HA's language.
 */
const i18n = i18next.createInstance();
void i18n.init({
  resources: coreResources,
  lng: 'en',
  fallbackLng: 'en',
  ns: ['common', 'nodes', 'map'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  initAsync: false,
});

/** A service field, also when HA groups it into a section (`advanced_fields`). */
function findServiceField(
  fields: Record<string, HassServiceField> | undefined,
  field: string
): HassServiceField | undefined {
  if (!fields) return undefined;
  if (fields[field]) return fields[field];
  for (const section of Object.values(fields)) {
    const nested = section.fields?.[field];
    if (nested) return nested;
  }
  return undefined;
}

/**
 * Numbers as HA formats them for this user (Profile → Number format):
 * the language's format, the browser's, a fixed one, or no grouping at all.
 */
const numberFormatters = new Map<string, (value: number) => string>();

/** `hass` is replaced on every state change — the formatter only when the profile changes. */
function cachedNumberFormatter(hass: HomeAssistant): (value: number) => string {
  const key = `${hass.locale?.language ?? hass.language}|${hass.locale?.number_format ?? ''}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = numberFormatter(hass);
    numberFormatters.set(key, formatter);
  }
  return formatter;
}

function numberFormatter(hass: HomeAssistant): (value: number) => string {
  const format = hass.locale?.number_format ?? 'language';
  if (format === 'none') return String;
  const language = hass.locale?.language ?? hass.language;
  const locales: Record<string, string | undefined> = {
    language,
    // The browser's own format.
    system: undefined,
    comma_decimal: 'en-US',
    decimal_comma: 'de',
    space_comma: 'fr',
    quote_decimal: 'de-CH',
  };
  const formatter = new Intl.NumberFormat(format in locales ? locales[format] : language, {
    maximumFractionDigits: 6,
  });
  return (value) => formatter.format(value);
}

/** Whether HA shows this user times in 12-hour format (Profile → Time format). */
const hour12Cache = new Map<string, boolean>();

function uses12Hours(hass: HomeAssistant): boolean {
  const format = hass.locale?.time_format ?? 'language';
  if (format === '12') return true;
  if (format === '24') return false;
  const locale = format === 'system' ? undefined : (hass.locale?.language ?? hass.language);
  const key = `${format}|${locale ?? ''}`;
  let hour12 = hour12Cache.get(key);
  if (hour12 === undefined) {
    hour12 = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12 === true;
    hour12Cache.set(key, hour12);
  }
  return hour12;
}

/** A summary context with the `hass` it reads now and what it has read of the entities' states. */
interface ContextEntry {
  /** The `hass` its functions read (the newest it was kept for). */
  source: { hass: HomeAssistant };
  context: SummaryContext;
  full: SummaryContext;
  /** Per entity read: its friendly name and unit, as they were when read. */
  read: Map<string, { name: unknown; unit: unknown }>;
}

const contexts = new WeakMap<HomeAssistant, ContextEntry>();
/** The context handed out last: kept for a new `hass` while nothing the cards read of it changed. */
let latest: ContextEntry | null = null;

/** What of `hass` a summary context reads, besides the states of the entities it was asked about. */
function sameSources(a: HomeAssistant, b: HomeAssistant): boolean {
  return (
    a.language === b.language &&
    a.localize === b.localize &&
    a.locale === b.locale &&
    a.services === b.services &&
    a.devices === b.devices &&
    a.areas === b.areas
  );
}

function entityRead(hass: HomeAssistant, entityId: string): { name: unknown; unit: unknown } {
  const attributes = hass.states[entityId]?.attributes;
  return { name: attributes?.friendly_name, unit: attributes?.unit_of_measurement };
}

/** HA hands in a new `hass` on every state change: still the same context when only other entities changed. */
function stillValid(entry: ContextEntry, hass: HomeAssistant): boolean {
  if (!sameSources(entry.source.hass, hass)) return false;
  for (const [entityId, seen] of entry.read) {
    const now = entityRead(hass, entityId);
    if (now.name !== seen.name || now.unit !== seen.unit) return false;
  }
  return true;
}

function contextEntry(hass: HomeAssistant): ContextEntry {
  const known = contexts.get(hass);
  if (known) return known;
  if (latest && stillValid(latest, hass)) {
    latest.source.hass = hass;
    contexts.set(hass, latest);
    return latest;
  }
  const read = new Map<string, { name: unknown; unit: unknown }>();
  const source = { hass };
  const context = buildContext(source, read);
  const entry = { source, read, context, full: { ...context, nameMax: Number.POSITIVE_INFINITY } };
  contexts.set(hass, entry);
  latest = entry;
  return entry;
}

/**
 * Summary context for the node cards, built once per `hass` object and kept
 * for the next one while nothing it read changed (cards keep their texts).
 * `fullNames`: entity names are never shortened (tooltips).
 */
export function summaryContext(
  hass: HomeAssistant | undefined,
  fullNames = false
): SummaryContext | null {
  if (!hass) return null;
  const entry = contextEntry(hass);
  return fullNames ? entry.full : entry.context;
}

/** The context reading `source.hass`; every entity state it reads is noted in `read`. */
function buildContext(
  source: { hass: HomeAssistant },
  read: Map<string, { name: unknown; unit: unknown }>
): SummaryContext {
  const { hass } = source;
  const current = () => source.hass;
  const entity = (entityId: string) => {
    const seen = entityRead(current(), entityId);
    if (!read.has(entityId)) read.set(entityId, seen);
    return seen;
  };
  return createSummaryContext({
    t: i18n.getFixedT(uiLanguage(hass.language), ['nodes', 'common']),
    localize: (key) => current().localize(key) || undefined,
    friendlyName: (entityId) => {
      const { name } = entity(entityId);
      return typeof name === 'string' ? name : undefined;
    },
    unitOfMeasurement: (entityId) => {
      const { unit } = entity(entityId);
      return typeof unit === 'string' ? unit : undefined;
    },
    formatNumber: cachedNumberFormatter(hass),
    hour12: uses12Hours(hass),
    serviceName: (service) => serviceInfo(current(), service)?.name,
    serviceFieldInfo: (service, field) => {
      const info = findServiceField(serviceInfo(current(), service)?.fields, field);
      return { name: info?.name, unit: info?.selector?.number?.unit_of_measurement };
    },
    deviceName: (id) => {
      const device = current().devices?.[id];
      return device?.name_by_user ?? device?.name ?? null;
    },
    areaName: (id) => current().areas?.[id]?.name ?? null,
  });
}

/** A string of the shared `map` namespace (Zusammenhänge), with plurals/interpolation. */
export function mapT(
  language: string | undefined,
  key: string,
  options?: Record<string, unknown>
): string {
  return i18n.getFixedT(uiLanguage(language), 'map')(key, options);
}
