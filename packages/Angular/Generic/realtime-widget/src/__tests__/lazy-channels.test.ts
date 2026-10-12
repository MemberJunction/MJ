import { describe, expect, it, vi } from 'vitest';
import { INTERACTIVE_COMPONENT_CLIENT_PLUGIN_CLASS } from '@memberjunction/ng-conversations/dist/lib/components/realtime/interactive-component/interactive-component-types';
import { CreateChannelClassLoader, LAZY_CHANNEL_LOADERS } from '../lib/channels/lazy-channels';

describe('lazy channel loading', () => {
  it('the widget keeps exactly one channel out of the call chunk: the Interactive Component channel', () => {
    expect(LAZY_CHANNEL_LOADERS.map((l) => l.Key)).toEqual([INTERACTIVE_COMPONENT_CLIENT_PLUGIN_CLASS]);
    expect(INTERACTIVE_COMPONENT_CLIENT_PLUGIN_CLASS).toBe('RealtimeInteractiveComponentChannel');
  });

  it('loads a lazy channel only when the session could use it', async () => {
    const load = vi.fn(async () => undefined);
    const loader = CreateChannelClassLoader([{ Key: 'Heavy', Load: load }]);
    await loader(['IdentityVerificationChannel', 'RealtimeWhiteboardChannel']);
    expect(load).not.toHaveBeenCalled();
    await loader(['IdentityVerificationChannel', 'Heavy']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('downloads a channel once however many sessions ask, and concurrent askers share the download', async () => {
    let release: () => void = () => undefined;
    const load = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const loader = CreateChannelClassLoader([{ Key: 'Heavy', Load: load }]);
    const a = loader(['Heavy']);
    const b = loader(['Heavy']);
    release();
    await Promise.all([a, b]);
    await loader(['Heavy']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reports a failed download by throwing (the runtime logs it and carries on), and the next session tries again', async () => {
    const load = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('chunk 404'))
      .mockResolvedValueOnce(undefined);
    const loader = CreateChannelClassLoader([{ Key: 'Heavy', Load: load }]);
    await expect(loader(['Heavy'])).rejects.toThrow(/chunk 404/);
    await expect(loader(['Heavy'])).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a session naming nothing lazy loads nothing', async () => {
    const load = vi.fn(async () => undefined);
    await CreateChannelClassLoader([{ Key: 'Heavy', Load: load }])([]);
    expect(load).not.toHaveBeenCalled();
  });
});
