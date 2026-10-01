import {
  type CoreLanguage,
  coreResources,
  createSummaryContext,
  type SummaryContext,
} from '@flode/ui-core';
import i18next from 'i18next';
import { type HassServiceField, type HomeAssistant, serviceInfo } from './ha';

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

function coreLanguage(language: string | undefined): CoreLanguage {
  const base = (language ?? 'en').split('-')[0];
  return base === 'de' ? 'de' : 'en';
}

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

const contexts = new WeakMap<HomeAssistant, SummaryContext>();
const fullNameContexts = new WeakMap<HomeAssistant, SummaryContext>();

/**
 * Summary context for the node cards, built once per `hass` object.
 * `fullNames`: entity names are never shortened (tooltips).
 */
export function summaryContext(
  hass: HomeAssistant | undefined,
  fullNames = false
): SummaryContext | null {
  if (!hass) return null;
  if (fullNames) {
    const base = summaryContext(hass);
    if (!base) return null;
    const full = fullNameContexts.get(hass) ?? { ...base, nameMax: Number.POSITIVE_INFINITY };
    fullNameContexts.set(hass, full);
    return full;
  }
  const cached = contexts.get(hass);
  if (cached) return cached;
  const context = createSummaryContext({
    t: i18n.getFixedT(coreLanguage(hass.language), ['nodes', 'common']),
    localize: (key) => hass.localize(key) || undefined,
    friendlyName: (entityId) => {
      const name = hass.states[entityId]?.attributes.friendly_name;
      return typeof name === 'string' ? name : undefined;
    },
    unitOfMeasurement: (entityId) => {
      const unit = hass.states[entityId]?.attributes.unit_of_measurement;
      return typeof unit === 'string' ? unit : undefined;
    },
    formatNumber: cachedNumberFormatter(hass),
    hour12: uses12Hours(hass),
    serviceName: (service) => serviceInfo(hass, service)?.name,
    serviceFieldInfo: (service, field) => {
      const info = findServiceField(serviceInfo(hass, service)?.fields, field);
      return { name: info?.name, unit: info?.selector?.number?.unit_of_measurement };
    },
    deviceName: (id) => {
      const device = hass.devices?.[id];
      return device?.name_by_user ?? device?.name ?? null;
    },
    areaName: (id) => hass.areas?.[id]?.name ?? null,
  });
  contexts.set(hass, context);
  return context;
}

/** A string of the shared `map` namespace (Zusammenhänge), with plurals/interpolation. */
export function mapT(
  language: string | undefined,
  key: string,
  options?: Record<string, unknown>
): string {
  return i18n.getFixedT(coreLanguage(language), 'map')(key, options);
}
