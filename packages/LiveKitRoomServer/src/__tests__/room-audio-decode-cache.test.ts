import { describe, it, expect, vi } from 'vitest';
import { RoomAudioDecodeCache } from '../room-audio/room-audio-decode-cache';

describe('RoomAudioDecodeCache', () => {
  it('shares one load between concurrent callers and serves later calls from cache', async () => {
    const cache = new RoomAudioDecodeCache();
    const load = vi.fn(async () => new Int16Array(4));
    const [a, b] = await Promise.all([cache.GetOrLoad('k', load), cache.GetOrLoad('k', load)]);
    expect(a).toBe(b);
    expect(await cache.GetOrLoad('k', load)).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed load so the next call retries', async () => {
    const cache = new RoomAudioDecodeCache();
    await expect(cache.GetOrLoad('k', async () => Promise.reject(new Error('download failed')))).rejects.toThrow('download failed');
    await Promise.resolve();
    const retry = vi.fn(async () => new Int16Array(1));
    await cache.GetOrLoad('k', retry);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used entry past its entry bound', async () => {
    const cache = new RoomAudioDecodeCache(2);
    await cache.GetOrLoad('a', async () => new Int16Array(1));
    await cache.GetOrLoad('b', async () => new Int16Array(1));
    await cache.GetOrLoad('a', async () => new Int16Array(1)); // touch a: b is now oldest
    await cache.GetOrLoad('c', async () => new Int16Array(1));
    expect(cache.Size).toBe(2);
    const reloadB = vi.fn(async () => new Int16Array(1));
    await cache.GetOrLoad('b', reloadB);
    expect(reloadB).toHaveBeenCalledTimes(1);
  });

  it('evicts by total samples held, keeping the newest entry', async () => {
    const cache = new RoomAudioDecodeCache(8, 10);
    await cache.GetOrLoad('a', async () => new Int16Array(6));
    await cache.GetOrLoad('b', async () => new Int16Array(6));
    await Promise.resolve();
    expect(cache.Size).toBe(1);
  });
});
