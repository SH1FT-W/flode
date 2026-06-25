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

export interface HomeAssistant
  extends Omit<
    CustomCardHomeAssistant,
    'services' | 'themes' | 'auth' | 'config' | 'locale' | 'user'
  > {
  themes: { darkMode: boolean };
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
