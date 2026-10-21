import { describe, it, expect, afterEach, vi } from 'vitest';
import { availableParallelism } from 'node:os';
import { VectorAccelerationSettings } from '../VectorAccelerationSettings';

const settings = VectorAccelerationSettings.Instance;

afterEach(() => {
  vi.unstubAllEnvs();
  settings.Reset();
});

describe('VectorAccelerationSettings', () => {
  it('defaults to a small pool, native code on, and approximate search off', () => {
    vi.stubEnv('MJ_VECTOR_WORKERS', '');
    vi.stubEnv('MJ_VECTOR_NATIVE', '');
    vi.stubEnv('MJ_VECTOR_ANN', '');
    settings.Reset();
    const options = settings.Options;
    expect(options.PoolSize).toBe(Math.max(1, Math.min(4, availableParallelism() - 1)));
    expect(options.UseNative).toBe(true);
    expect(options.ANN.Enabled).toBe(false);
    expect(options.OffloadMinWork).toBe(2_000_000);
    expect(options.ClusterOffloadMinRows).toBe(200);
    expect(options.WorkerScriptPath).toBeUndefined();
  });

  it('merges overrides, including part of the ANN options, and keeps the rest', () => {
    settings.Configure({ PoolSize: 7, ANN: { Enabled: true } });
    settings.Configure({ ANN: { MinRows: 10 } });
    expect(settings.Options.PoolSize).toBe(7);
    expect(settings.Options.ANN).toMatchObject({ Enabled: true, MinRows: 10, Connectivity: 16, ExpansionSearch: 64 });
  });

  it('restores the defaults on Reset', () => {
    settings.Configure({ PoolSize: 9, UseNative: false });
    settings.Reset();
    expect(settings.Options.PoolSize).not.toBe(9);
    expect(settings.Options.UseNative).toBe(true);
  });

  it.each([
    ['3', 3],
    ['2.9', 2],
    ['-4', 0],
    ['0', 0],
  ])('reads MJ_VECTOR_WORKERS=%s as a pool of %i', (value, expected) => {
    vi.stubEnv('MJ_VECTOR_WORKERS', value);
    settings.Reset();
    expect(settings.Options.PoolSize).toBe(expected);
  });

  it.each(['', '   ', 'many'])('ignores an unusable MJ_VECTOR_WORKERS (%j)', value => {
    vi.stubEnv('MJ_VECTOR_WORKERS', value);
    settings.Reset();
    expect(settings.Options.PoolSize).toBe(Math.max(1, Math.min(4, availableParallelism() - 1)));
  });

  it('turns native code off with MJ_VECTOR_NATIVE=0 and approximate search on with MJ_VECTOR_ANN=1', () => {
    vi.stubEnv('MJ_VECTOR_NATIVE', '0');
    vi.stubEnv('MJ_VECTOR_ANN', '1');
    settings.Reset();
    expect(settings.Options.UseNative).toBe(false);
    expect(settings.Options.ANN.Enabled).toBe(true);
  });

  it('only reacts to the exact switch values', () => {
    vi.stubEnv('MJ_VECTOR_NATIVE', 'false');
    vi.stubEnv('MJ_VECTOR_ANN', 'yes');
    settings.Reset();
    expect(settings.Options.UseNative).toBe(true);
    expect(settings.Options.ANN.Enabled).toBe(false);
  });
});
