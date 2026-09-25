import {
  type CoreLanguage,
  coreResources,
  createSummaryContext,
  type SummaryContext,
} from '@flode/ui-core';
import i18next from 'i18next';
import type { HomeAssistant } from './ha';

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

const contexts = new WeakMap<HomeAssistant, SummaryContext>();

/** Summary context for the node cards, built once per `hass` object. */
export function summaryContext(hass: HomeAssistant | undefined): SummaryContext | null {
  if (!hass) return null;
  const cached = contexts.get(hass);
  if (cached) return cached;
  const context = createSummaryContext({
    t: i18n.getFixedT(coreLanguage(hass.language), ['nodes', 'common']),
    localize: (key) => hass.localize(key) || undefined,
    friendlyName: (entityId) => {
      const name = hass.states[entityId]?.attributes.friendly_name;
      return typeof name === 'string' ? name : undefined;
    },
    serviceName: (service) => {
      const [domain = '', name = ''] = service.split('.');
      return hass.services?.[domain]?.[name]?.name;
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
