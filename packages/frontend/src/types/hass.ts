import type { HomeAssistant as CustomCardHomeAssistant } from 'custom-card-helpers';
import type { HassServices } from 'home-assistant-js-websocket';

export type { Connection, HassConfig, HassEntity, HassService } from 'home-assistant-js-websocket';

/**
 * Device registry entry from Home Assistant
 */
export interface HassDevice {
  id: string;
  name: string | null;
  name_by_user: string | null;
  manufacturer: string | null;
  model: string | null;
  area_id: string | null;
}

/**
 * Flat map of HA theme CSS custom property names (without the leading `--`)
 * to their resolved values, e.g. `{ "primary-color": "#03a9f4" }`.
 */
export type HassThemeVars = Record<string, string>;

/**
 * A single HA theme entry. Legacy themes put variables directly on the
 * object; newer themes nest light/dark overrides under `modes`.
 */
export interface HassTheme {
  [cssVar: string]: string | { light?: HassThemeVars; dark?: HassThemeVars } | undefined;
  modes?: { light?: HassThemeVars; dark?: HassThemeVars };
}

/**
 * `hass.themes` — undocumented HA-internal shape (not covered by
 * custom-card-helpers, which only models 3 legacy variables). Kept loose
 * since HA does not guarantee stability here.
 */
export interface HassThemes {
  default_theme: string;
  default_dark_theme?: string | null;
  themes: Record<string, HassTheme>;
  darkMode: boolean;
  theme?: string;
}

export interface HomeAssistant
  extends Omit<
    CustomCardHomeAssistant,
    'services' | 'themes' | 'auth' | 'config' | 'locale' | 'user'
  > {
  themes: HassThemes;
  services: HassServices;
  devices: Record<string, HassDevice>;
  // Frontend-only fields FLODE never reads in remote mode. Kept optional so the
  // partial remote `hass` object doesn't need placeholder `as unknown as` casts.
  // In panel mode the real HA frontend supplies them.
  auth?: CustomCardHomeAssistant['auth'];
  config?: CustomCardHomeAssistant['config'];
  locale?: CustomCardHomeAssistant['locale'];
  user?: CustomCardHomeAssistant['user'];
}

/**
 * Home Assistant automation configuration object
 */
export interface AutomationConfig {
  id?: string;
  alias?: string;
  description?: string;
  mode?: 'single' | 'restart' | 'queued' | 'parallel';
  max?: number;
  max_exceeded?: 'silent' | 'warning' | 'critical';
  trigger?: unknown[];
  triggers?: unknown[];
  condition?: unknown[];
  conditions?: unknown[];
  action?: unknown[];
  actions?: unknown[];
  variables?: Record<string, unknown>;
  initial_state?: boolean;
  hide_entity?: boolean;
  trace?: { stored_traces?: number };
  [key: string]: unknown;
}
