import { useEffect, useState } from 'react';
import { useHass } from '@/contexts/HassContext';
import type { Connection, PlatformDescription, PlatformDescriptions } from '@/types/hass';

export type PlatformKind = 'trigger' | 'condition';

/** Node data keys owned by target-based triggers/conditions (cleared on type change). */
export const TARGETED_PLATFORM_KEYS = ['target', 'options'] as const;

/** HA frontend: src/data/trigger.ts `subscribeTriggers`, src/data/condition.ts `subscribeConditions`. */
const SUBSCRIBE_MESSAGE_TYPES: Record<PlatformKind, string> = {
  trigger: 'trigger_platforms/subscribe',
  condition: 'condition_platforms/subscribe',
};

const EMPTY_DESCRIPTIONS: PlatformDescriptions = {};
const noop = () => undefined;
const loggedUnavailable = new Set<PlatformKind>();

/**
 * Subscribe to HA's trigger/condition description feed.
 * Older HA versions (or the feature still behind HA Labs) reject the command —
 * that is not an error for FLODE: log once and report an empty map.
 */
export async function subscribePlatformDescriptions(
  connection: Connection,
  kind: PlatformKind,
  onDescriptions: (descriptions: PlatformDescriptions) => void
): Promise<() => void> {
  try {
    return await connection.subscribeMessage<PlatformDescriptions>(onDescriptions, {
      type: SUBSCRIBE_MESSAGE_TYPES[kind],
    });
  } catch (error) {
    if (!loggedUnavailable.has(kind)) {
      loggedUnavailable.add(kind);
      console.warn(`FLODE: ${kind} descriptions unavailable:`, error);
    }
    onDescriptions(EMPTY_DESCRIPTIONS);
    return noop;
  }
}

interface PlatformFeed {
  descriptions: PlatformDescriptions;
  listeners: Set<(descriptions: PlatformDescriptions) => void>;
}

// One subscription per connection and kind, shared by every node card and editor.
// It lives as long as the connection (home-assistant-js-websocket resubscribes on reconnect).
const feeds = new WeakMap<Connection, Map<PlatformKind, PlatformFeed>>();

function getPlatformFeed(connection: Connection, kind: PlatformKind): PlatformFeed {
  let byKind = feeds.get(connection);
  if (!byKind) {
    byKind = new Map();
    feeds.set(connection, byKind);
  }
  const existing = byKind.get(kind);
  if (existing) return existing;

  const feed: PlatformFeed = { descriptions: EMPTY_DESCRIPTIONS, listeners: new Set() };
  byKind.set(kind, feed);
  // HA sends the full map first, later only descriptions of newly loaded integrations
  subscribePlatformDescriptions(connection, kind, (update) => {
    feed.descriptions = { ...feed.descriptions, ...update };
    for (const listener of feed.listeners) {
      listener(feed.descriptions);
    }
  });
  return feed;
}

/**
 * Descriptions of HA's target-based triggers or conditions (`<domain>.<name>`),
 * keyed by type. Empty without a connection or on HA versions without the feed.
 */
export function useAutomationPlatformDescriptions(kind: PlatformKind): PlatformDescriptions {
  const { hass } = useHass();
  const connection = hass?.connection;
  const [descriptions, setDescriptions] = useState<PlatformDescriptions>(EMPTY_DESCRIPTIONS);

  useEffect(() => {
    if (!connection) {
      setDescriptions(EMPTY_DESCRIPTIONS);
      return;
    }
    const feed = getPlatformFeed(connection, kind);
    setDescriptions(feed.descriptions);
    feed.listeners.add(setDescriptions);
    return () => {
      feed.listeners.delete(setDescriptions);
    };
  }, [connection, kind]);

  return descriptions;
}

/**
 * Node data for a freshly selected target-based type: the type key plus the
 * description's field defaults under `options`.
 */
export function getTargetedPlatformDefaults(
  kind: PlatformKind,
  type: string,
  description: PlatformDescription | undefined
): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(description?.fields ?? {})) {
    if (field.default !== undefined) {
      options[name] = field.default;
    }
  }
  return Object.keys(options).length > 0 ? { [kind]: type, options } : { [kind]: type };
}
