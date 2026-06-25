import type { Connection, HassEntities, HassServices } from 'home-assistant-js-websocket';
import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  subscribeServices,
} from 'home-assistant-js-websocket';
import {
  createContext,
  type FC,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { HassEntity, HassService, HomeAssistant } from '@/types/hass';

/**
 * Area registry entry from Home Assistant
 */
interface AreaRegistryEntry {
  area_id: string;
  name: string;
}

/**
 * Device registry entry from Home Assistant
 */
interface DeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  manufacturer: string | null;
  model: string | null;
  area_id: string | null;
}

/**
 * Entity registry entry from Home Assistant
 */
interface EntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  area_id: string | null;
  name: string | null;
  original_name: string | null;
}

/**
 * Configuration for connecting to Home Assistant
 */
export interface HassConfig {
  url: string;
  token: string;
}

const STORAGE_KEY = 'flode_hass_config';

/**
 * Fetch the area / device / entity registries over a WebSocket connection.
 * `sendMessagePromise<T>` is generic, so each call is typed at the boundary
 * without `as` casts. Shared by both the remote and panel (externalHass) modes.
 */
async function loadRegistries(connection: Connection): Promise<{
  areas: Map<string, AreaRegistryEntry>;
  devices: Map<string, DeviceRegistryEntry>;
  entities: Map<string, EntityRegistryEntry>;
}> {
  const [areaList, deviceList, entityList] = await Promise.all([
    connection.sendMessagePromise<AreaRegistryEntry[]>({ type: 'config/area_registry/list' }),
    connection.sendMessagePromise<DeviceRegistryEntry[]>({ type: 'config/device_registry/list' }),
    connection.sendMessagePromise<EntityRegistryEntry[]>({ type: 'config/entity_registry/list' }),
  ]);

  return {
    areas: new Map(areaList.map((area) => [area.area_id, area])),
    devices: new Map(deviceList.map((device) => [device.id, device])),
    entities: new Map(entityList.map((entity) => [entity.entity_id, entity])),
  };
}

/**
 * Load config from localStorage
 */
function loadConfig(): HassConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return { url: '', token: '' };
}

/**
 * Save config to localStorage
 */
function saveConfig(config: HassConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage errors
  }
}

interface HassContextProps {
  hass: HomeAssistant | undefined;
  isRemote: boolean;
  isLoading: boolean;
  connectionError: string | null;
  entities: HassEntity[];
  services: Record<string, Record<string, HassService>>;
  config: HassConfig;
  setConfig: (newConfig: HassConfig) => void;
  getEntitiesByDomain: (domain: string) => HassEntity[];
  getAllServices: () => Array<{ domain: string; service: string; definition: HassService }>;
  getServiceDefinition: (fullServiceName: string) => HassService | null;
  getDeviceNameForEntity: (entityId: string) => string | null;
  getDeviceNameById: (deviceId: string) => string | null;
  getAreaNameForEntity: (entityId: string) => string | null;
}

const HassContext = createContext<HassContextProps | undefined>(undefined);

export const HassProvider: FC<
  PropsWithChildren<{ forceMode?: 'remote' | 'embedded'; externalHass?: HomeAssistant }>
> = ({ children, forceMode, externalHass }) => {
  const [config, setConfigState] = useState<HassConfig>(
    forceMode ? loadConfig() : { url: '', token: '' }
  );
  const [remoteEntities, setRemoteEntities] = useState<HassEntity[]>([]);
  const [remoteServices, setRemoteServices] = useState<HassServices>({});
  const [areaRegistry, setAreaRegistry] = useState<Map<string, AreaRegistryEntry>>(new Map());
  const [deviceRegistry, setDeviceRegistry] = useState<Map<string, DeviceRegistryEntry>>(new Map());
  const [entityRegistry, setEntityRegistry] = useState<Map<string, EntityRegistryEntry>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [wsConnection, setWsConnection] = useState<Connection | null>(null);

  // Mode detection - remote connection or defer to external hass
  const hasRemoteConfig = !!(config.url && config.token);
  // If externalHass is provided, we are in panel mode, so no remote connection
  const shouldUseRemote = forceMode === 'remote';

  // Save config handler
  const setConfig = useCallback((newConfig: HassConfig) => {
    setConfigState(newConfig);
    saveConfig(newConfig);
    // Reset state when config changes
    setRemoteEntities([]);
    setRemoteServices({});
    setAreaRegistry(new Map());
    setDeviceRegistry(new Map());
    setEntityRegistry(new Map());
    setConnectionError(null);
  }, []);

  // Fetch data from remote HA instance using WebSocket
  useEffect(() => {
    if (!shouldUseRemote) return;

    const establishConnection = async () => {
      setIsLoading(true);
      setConnectionError(null);

      try {
        // Create WebSocket connection
        const auth = createLongLivedTokenAuth(config.url, config.token);
        const connection = await createConnection({ auth });

        setWsConnection(connection);

        // Handle connection events (set these up before subscribing)
        connection.addEventListener('ready', () => {
          setConnectionError(null);
          setIsLoading(false);
        });

        connection.addEventListener('disconnected', () => {
          setConnectionError('Connection lost');
        });

        connection.addEventListener('reconnect-error', (err: unknown) => {
          console.error('FLODE: WebSocket reconnection failed:', err);
          setConnectionError('Reconnection failed');
        });

        // Subscribe to entity state changes
        const unsubscribeEntities = subscribeEntities(connection, (entities: HassEntities) => {
          const entitiesArray = Object.values(entities).map((entity) => ({
            entity_id: entity.entity_id,
            state: entity.state,
            attributes: entity.attributes || {},
            last_changed: entity.last_changed || '',
            last_updated: entity.last_updated || '',
            context: entity.context,
          }));

          setRemoteEntities(entitiesArray);
          // Also mark as loaded once we receive entities
          setIsLoading(false);
        });

        // Subscribe to service registry changes
        const unsubscribeServices = subscribeServices(connection, (services: HassServices) => {
          setRemoteServices(services);
        });

        // Fetch device and entity registries
        loadRegistries(connection)
          .then(({ areas, devices, entities }) => {
            setAreaRegistry(areas);
            setDeviceRegistry(devices);
            setEntityRegistry(entities);
          })
          .catch((error) => {
            console.error('FLODE: Failed to fetch registries:', error);
          });

        // Cleanup function
        return () => {
          unsubscribeEntities();
          unsubscribeServices();
          connection.close();
          setWsConnection(null);
        };
      } catch (error) {
        console.error('FLODE: Failed to establish WebSocket connection:', error);
        const errorMessage = error instanceof Error ? error.message : 'Connection failed';
        setConnectionError(errorMessage);
        setIsLoading(false);
      }
    };

    const cleanup = establishConnection();

    // Cleanup on unmount or config change
    return () => {
      if (cleanup instanceof Promise) {
        cleanup.then((cleanupFn) => cleanupFn?.());
      }
    };
  }, [shouldUseRemote, config.url, config.token]);

  // Fetch registries when using externalHass (panel mode)
  useEffect(() => {
    if (!externalHass?.connection) return;

    loadRegistries(externalHass.connection)
      .then(({ areas, devices, entities }) => {
        setAreaRegistry(areas);
        setDeviceRegistry(devices);
        setEntityRegistry(entities);
      })
      .catch((error) => {
        console.error('FLODE: Failed to fetch registries from externalHass:', error);
      });
  }, [externalHass?.connection]);

  // Use refs to store frequently changing data without triggering hass object recreation
  const statesRef = useRef<Record<string, HassEntity>>({});
  const servicesRef = useRef<Record<string, Record<string, HassService>>>({});
  const devicesRef = useRef<Record<string, DeviceRegistryEntry>>({});

  // Update refs when data changes
  statesRef.current = useMemo(
    () => Object.fromEntries(remoteEntities.map((e) => [e.entity_id, e])),
    [remoteEntities]
  );
  servicesRef.current = remoteServices;
  devicesRef.current = useMemo(() => Object.fromEntries(deviceRegistry), [deviceRegistry]);

  // Build the hass API object - only recreate when connection/config changes, not on entity updates
  const hass = useMemo<HomeAssistant | undefined>(() => {
    if (externalHass) {
      // If externalHass is provided, use it
      return externalHass;
    }

    if (!wsConnection) {
      // No connection available
      return undefined;
    }

    if (shouldUseRemote) {
      // Use remote connection if configured
      // Note: states/services/devices accessed via refs so hass object doesn't recreate on updates
      // Frontend-only fields (auth, config, locale, user) are intentionally omitted:
      // they are optional on our HomeAssistant type and FLODE never reads them in
      // remote mode. This keeps the object cast-free.
      return {
        get connected() {
          return wsConnection.connected;
        },
        themes: { darkMode: false },
        panels: {},
        selectedTheme: null,
        panelUrl: '',
        language: 'en',
        selectedLanguage: null,
        resources: {},
        get devices() {
          return devicesRef.current;
        },
        localize: () => '',
        translationMetadata: {
          fragments: [],
          translations: {},
        },
        dockedSidebar: false,
        moreInfoEntityId: '',
        fetchWithAuth: async () => new Response(),
        sendWS: async (...args) => {
          wsConnection.sendMessage(...args);
        },
        callWS: (msg) => wsConnection.sendMessagePromise(msg),
        get states() {
          return statesRef.current;
        },
        get services() {
          return servicesRef.current;
        },
        connection: wsConnection,
        callApi: async (method: string, path: string, data?: unknown) => {
          if (!config.url || !config.token) {
            throw new Error('No authentication configured');
          }

          // Use direct fetch for REST API calls
          const url = `${config.url}/api/${path}`;
          const response = await fetch(url, {
            method,
            headers: {
              Authorization: `Bearer ${config.token}`,
              'Content-Type': 'application/json',
            },
            body: data ? JSON.stringify(data) : undefined,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(`API error: ${error.message}`);
          }

          return await response.json();
        },
        callService: async (domain, service, data) => {
          if (!wsConnection) {
            throw new Error('WebSocket connection not available');
          }
          return wsConnection.sendMessagePromise({
            type: 'call_service',
            domain,
            service,
            service_data: data || {},
          });
        },
      } satisfies HomeAssistant;
    }

    // No connection available
    return undefined;
  }, [externalHass, shouldUseRemote, wsConnection, config.url, config.token]);

  // For remote mode, use remoteEntities directly since hass.states is a getter
  // that doesn't trigger useMemo recalculation when remoteEntities changes
  const entities = useMemo(() => {
    if (shouldUseRemote) {
      return remoteEntities;
    }
    return Object.values(hass?.states ?? {});
  }, [shouldUseRemote, remoteEntities, hass?.states]);

  const services = useMemo(() => {
    if (shouldUseRemote) {
      return remoteServices;
    }
    return hass?.services ?? {};
  }, [shouldUseRemote, remoteServices, hass?.services]);

  const getEntitiesByDomain = useCallback(
    (domain: string) => entities.filter((e) => e.entity_id.startsWith(`${domain}.`)),
    [entities]
  );

  const getAllServices = useCallback(() => {
    const result: Array<{ domain: string; service: string; definition: HassService }> = [];
    for (const [domain, domainServices] of Object.entries(services)) {
      for (const [service, definition] of Object.entries(domainServices)) {
        result.push({ domain, service, definition });
      }
    }
    return result;
  }, [services]);

  const getServiceDefinition = useCallback(
    (fullServiceName: string): HassService | null => {
      if (!fullServiceName || !fullServiceName.includes('.')) return null;
      const [domain, serviceName] = fullServiceName.split('.');
      return services[domain]?.[serviceName] || null;
    },
    [services]
  );

  const getDeviceNameForEntity = useCallback(
    (entityId: string): string | null => {
      // Look up entity in entity registry to get device_id
      const entityEntry = entityRegistry.get(entityId);
      if (!entityEntry?.device_id) {
        return null;
      }
      // Look up device in device registry
      const device = deviceRegistry.get(entityEntry.device_id);
      if (!device) {
        return null;
      }
      // Prefer user-defined name, fall back to device name
      return device.name_by_user || device.name || null;
    },
    [entityRegistry, deviceRegistry]
  );

  const getDeviceNameById = useCallback(
    (deviceId: string): string | null => {
      const device = deviceRegistry.get(deviceId);
      return device?.name_by_user || device?.name || null;
    },
    [deviceRegistry]
  );

  const getAreaNameForEntity = useCallback(
    (entityId: string): string | null => {
      // Check entity registry for direct area assignment
      const entityEntry = entityRegistry.get(entityId);
      const areaId =
        entityEntry?.area_id ??
        // Fall back to device area if entity has no direct area
        (entityEntry?.device_id ? deviceRegistry.get(entityEntry.device_id)?.area_id : null);
      if (!areaId) return null;
      return areaRegistry.get(areaId)?.name ?? null;
    },
    [entityRegistry, deviceRegistry, areaRegistry]
  );

  const value: HassContextProps = {
    hass,
    isRemote: shouldUseRemote,
    isLoading: shouldUseRemote && hasRemoteConfig ? isLoading : false,
    connectionError: shouldUseRemote ? connectionError : null,
    entities,
    services,
    config,
    setConfig,
    getEntitiesByDomain,
    getAllServices,
    getServiceDefinition,
    getDeviceNameForEntity,
    getDeviceNameById,
    getAreaNameForEntity,
  };

  return <HassContext.Provider value={value}>{children}</HassContext.Provider>;
};

export function useHass() {
  const context = useContext(HassContext);
  if (context === undefined) {
    throw new Error('useHass must be used within a HassProvider');
  }
  return context;
}
