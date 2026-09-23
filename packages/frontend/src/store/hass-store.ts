import { create } from 'zustand';
import type { HassService, HomeAssistant } from '@/types/hass';

interface HassSnapshot {
  hass: HomeAssistant | undefined;
  getServiceDefinition: (fullServiceName: string) => HassService | null;
  getDeviceNameById: (deviceId: string) => string | null;
  getAreaNameById: (areaId: string) => string | null;
}

/**
 * Mirror of `HassContext` for render-sensitive consumers (canvas node cards).
 *
 * HA hands FLODE a new `hass` object on *every* state change anywhere in the
 * house, and every `useHass()` consumer re-renders with it. Node cards only
 * care about a handful of things — the translation function and the state of
 * the one entity they show — so they select exactly that from this store and
 * stay untouched by unrelated updates. `HassProvider` keeps it in sync.
 */
export const useHassStore = create<HassSnapshot>(() => ({
  hass: undefined,
  getServiceDefinition: () => null,
  getDeviceNameById: () => null,
  getAreaNameById: () => null,
}));

/** HA's `localize` — changes only when the language or loaded translations change. */
export function useHassLocalize(): HomeAssistant['localize'] | undefined {
  return useHassStore((s) => s.hass?.localize);
}

/** Live state object of one entity; re-renders only when *that* entity changes. */
export function useEntityStateObject(entityId: string | undefined) {
  return useHassStore((s) => (entityId ? s.hass?.states?.[entityId] : undefined));
}

/** Latest `hass` without subscribing — for values read on demand (friendly names). */
export function getLatestHass(): HomeAssistant | undefined {
  return useHassStore.getState().hass;
}
