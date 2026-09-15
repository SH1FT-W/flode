import { describe, expect, it, vi } from 'vitest';
import type { Connection, PlatformDescriptions } from '@/types/hass';
import {
  getTargetedPlatformDefaults,
  subscribePlatformDescriptions,
} from '../useAutomationPlatformDescriptions';

describe('subscribePlatformDescriptions', () => {
  it('falls back to an empty map and logs once when HA rejects the command', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const subscribeMessage = vi.fn(async () => {
      throw { code: 'unknown_command', message: 'Unknown command.' };
    });
    const connection = { subscribeMessage } as unknown as Connection;
    const onDescriptions = vi.fn();

    const unsubscribe = await subscribePlatformDescriptions(
      connection,
      'condition',
      onDescriptions
    );
    await subscribePlatformDescriptions(connection, 'condition', onDescriptions);

    expect(subscribeMessage).toHaveBeenCalledWith(expect.any(Function), {
      type: 'condition_platforms/subscribe',
    });
    expect(onDescriptions).toHaveBeenCalledWith({});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => unsubscribe()).not.toThrow();
    warn.mockRestore();
  });

  it('forwards descriptions delivered by the subscription', async () => {
    const descriptions: PlatformDescriptions = {
      'moon.phase_changed': {
        target: { entity: [{ domain: ['moon'] }] },
        fields: { phase: { required: true, selector: { select: { options: ['full_moon'] } } } },
      },
    };
    const unsub = vi.fn(async () => undefined);
    const subscribeMessage = vi.fn(async (callback: (result: PlatformDescriptions) => void) => {
      callback(descriptions);
      return unsub;
    });
    const connection = { subscribeMessage } as unknown as Connection;
    const onDescriptions = vi.fn();

    const unsubscribe = await subscribePlatformDescriptions(connection, 'trigger', onDescriptions);

    expect(subscribeMessage).toHaveBeenCalledWith(expect.any(Function), {
      type: 'trigger_platforms/subscribe',
    });
    expect(onDescriptions).toHaveBeenCalledWith(descriptions);
    unsubscribe();
    expect(unsub).toHaveBeenCalled();
  });
});

describe('getTargetedPlatformDefaults', () => {
  it('sets the type and applies field defaults into options', () => {
    const result = getTargetedPlatformDefaults('condition', 'vibration.is_vibrating', {
      fields: { behavior: { default: 'any' }, for: {} },
    });
    expect(result).toEqual({ condition: 'vibration.is_vibrating', options: { behavior: 'any' } });
  });

  it('omits options without description defaults', () => {
    expect(getTargetedPlatformDefaults('trigger', 'button.pressed', undefined)).toEqual({
      trigger: 'button.pressed',
    });
  });
});
