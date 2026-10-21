/**
 * The shared-cache clear that follows `mj sync push` / `mj codegen` / `mj migrate`.
 *
 * Those commands change the database without touching the shared cache, so every server keeps
 * serving what it cached beforehand until the affected categories are cleared. The Redis call is
 * mocked here; the real-Redis behaviour is covered in @memberjunction/redis-provider's
 * integration tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const clearMock = vi.fn();
vi.mock('@memberjunction/redis-provider', () => ({
  ClearSharedCacheCategories: (...args: unknown[]) => clearMock(...args),
  SHARED_CACHE_WRITE_CATEGORIES: ['RunViewCache', 'DatasetCache', 'Metadata'],
}));

import {
  AppendSharedCacheClear,
  ClearSharedCacheAfterWrite,
  IsAutomaticClearDisabled,
  ResolveSharedCacheTarget,
  SKIP_CACHE_CLEAR_ENV,
  DescribeRedisUrl,
  ResolveCacheCategories,
  KnownCacheCategories,
  MigrationChangedDatabase,
} from '../lib/shared-cache';

const ENV_KEYS = ['REDIS_URL', 'REDIS_KEY_PREFIX', SKIP_CACHE_CLEAR_ENV];

describe('shared cache clear after a CLI write', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    clearMock.mockReset();
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  describe('target resolution', () => {
    it('is null without REDIS_URL', () => {
      expect(ResolveSharedCacheTarget({})).toBeNull();
      expect(ResolveSharedCacheTarget({ REDIS_URL: '  ' })).toBeNull();
    });

    it('uses REDIS_KEY_PREFIX, defaulting to "mj" as MJAPI does', () => {
      expect(ResolveSharedCacheTarget({ REDIS_URL: 'redis://h:6379' })?.Connection).toEqual({ url: 'redis://h:6379', keyPrefix: 'mj' });
      expect(ResolveSharedCacheTarget({ REDIS_URL: 'redis://h:6379', REDIS_KEY_PREFIX: 'skip' })?.Connection.keyPrefix).toBe('skip');
    });

    it('never puts credentials in the description', () => {
      const d = DescribeRedisUrl('rediss://default:S3cret@cache.example.com:6380/2');
      expect(d).toBe('rediss://cache.example.com:6380/2');
      expect(d).not.toContain('S3cret');
      expect(DescribeRedisUrl('not a url')).toBe('(unparseable REDIS_URL)');
    });
  });

  describe('opt-out', () => {
    it('honours the flag and the environment variable', () => {
      expect(IsAutomaticClearDisabled(true, {})).toBe(true);
      expect(IsAutomaticClearDisabled(false, { [SKIP_CACHE_CLEAR_ENV]: '1' })).toBe(true);
      expect(IsAutomaticClearDisabled(undefined, { [SKIP_CACHE_CLEAR_ENV]: 'TRUE' })).toBe(true);
      expect(IsAutomaticClearDisabled(undefined, { [SKIP_CACHE_CLEAR_ENV]: '0' })).toBe(false);
      expect(IsAutomaticClearDisabled(undefined, {})).toBe(false);
    });
  });

  describe('ClearSharedCacheAfterWrite', () => {
    it('does nothing without REDIS_URL', async () => {
      expect(await ClearSharedCacheAfterWrite('mj sync push')).toBeNull();
      expect(clearMock).not.toHaveBeenCalled();
    });

    it('does nothing when skipped', async () => {
      process.env.REDIS_URL = 'redis://h:6379';
      expect(await ClearSharedCacheAfterWrite('mj sync push', true)).toBeNull();
      expect(clearMock).not.toHaveBeenCalled();
    });

    it('clears the RunView, dataset and metadata categories and reports the count', async () => {
      process.env.REDIS_URL = 'redis://h:6379';
      process.env.REDIS_KEY_PREFIX = 'fleet';
      clearMock.mockResolvedValue([{ Category: 'RunViewCache', KeyCount: 3 }, { Category: 'DatasetCache', KeyCount: 0 }, { Category: 'Metadata', KeyCount: 2 }]);

      const report = await ClearSharedCacheAfterWrite('mj migrate');

      expect(clearMock).toHaveBeenCalledWith({
        Connection: { url: 'redis://h:6379', keyPrefix: 'fleet' },
        Categories: ['RunViewCache', 'DatasetCache', 'Metadata'],
        IncludeMetadataSnapshot: true,
      });
      expect(report?.Ok).toBe(true);
      expect(report?.Message).toContain('Cleared 5 shared cache entries on redis://h:6379 (prefix "fleet") after mj migrate');
    });

    it('reports a failure without throwing, and says what to run', async () => {
      process.env.REDIS_URL = 'redis://user:pw@h:6379';
      clearMock.mockRejectedValue(new Error('Redis did not answer PING'));

      const report = await ClearSharedCacheAfterWrite('mj codegen');

      expect(report?.Ok).toBe(false);
      expect(report?.Message).toContain('mj cache clear');
      expect(report?.Message).toContain('Redis did not answer PING');
      expect(report?.Message).not.toContain('pw@');
    });
  });

  describe('a category that could not be cleared', () => {
    it('reports the clear as failed and names the category, instead of claiming success', async () => {
      process.env.REDIS_URL = 'redis://h:6379';
      // ClearSharedCacheCategories reports per-category outcomes and returns normally on a partial
      // failure — it does not throw. Reading only the counts told the operator "servers will
      // reload" about a category that was never cleared.
      clearMock.mockResolvedValue([
        { Category: 'RunViewCache', KeyCount: 3, Ok: false, Error: 'READONLY You can not write against a read only replica' },
        { Category: 'RunQueryCache', KeyCount: 0, Ok: true },
        { Category: 'DatasetCache', KeyCount: 1, Ok: true },
        { Category: 'Metadata', KeyCount: 0, Ok: true },
      ]);

      const report = await ClearSharedCacheAfterWrite('mj codegen');

      expect(report?.Ok).toBe(false);
      expect(report?.Message).toContain('RunViewCache');
      expect(report?.Message).toContain('READONLY');
      expect(report?.Message).toContain('mj cache clear');
    });

    it('still reports success when every category cleared', async () => {
      process.env.REDIS_URL = 'redis://h:6379';
      clearMock.mockResolvedValue([
        { Category: 'RunViewCache', KeyCount: 2, Ok: true },
        { Category: 'Metadata', KeyCount: 1, Ok: true },
      ]);

      expect((await ClearSharedCacheAfterWrite('mj codegen'))?.Ok).toBe(true);
    });
  });

  describe('ResolveCacheCategories', () => {
    it('canonicalises a case-insensitive spelling, because Redis keys are case-SENSITIVE', () => {
      // Accepting `runviewcache` and then scanning `{prefix}:runviewcache:*` matched nothing and
      // reported a successful clear of 0 keys — the operator is told the fleet will reload and it
      // never does.
      expect(ResolveCacheCategories(['runviewcache', 'DATASETCACHE']).Categories).toEqual(['RunViewCache', 'DatasetCache']);
      expect(ResolveCacheCategories(['runviewcache']).Unknown).toEqual([]);
    });

    it('trims, de-duplicates, and keeps the order asked for', () => {
      expect(ResolveCacheCategories([' Metadata ', 'metadata', 'RunViewCache']).Categories).toEqual(['Metadata', 'RunViewCache']);
    });

    it('reports an unknown category in the spelling the user typed', () => {
      const out = ResolveCacheCategories(['RunViewCache', 'runview']);
      expect(out.Categories).toEqual(['RunViewCache']);
      expect(out.Unknown).toEqual(['runview']);
    });

    it('defaults to every write category when nothing is named', () => {
      expect(ResolveCacheCategories(undefined).Categories).toEqual(['RunViewCache', 'DatasetCache', 'Metadata']);
      expect(ResolveCacheCategories([]).Categories).toEqual(['RunViewCache', 'DatasetCache', 'Metadata']);
    });

    it('allows the proxy-key store to be named explicitly', () => {
      expect(ResolveCacheCategories(['default']).Categories).toEqual(['default']);
      expect(KnownCacheCategories()).toContain('default');
    });
  });

  describe('MigrationChangedDatabase', () => {
    const outcome = (o: Partial<Parameters<typeof MigrationChangedDatabase>[0]>) =>
      MigrationChangedDatabase({ Threw: false, Succeeded: true, MigrationsApplied: 0, StartedApplying: false, ...o });

    it('does not disturb the fleet when a successful run had nothing to apply', () => {
      expect(outcome({ MigrationsApplied: 0 })).toBe(false);
    });

    it('clears when a successful run applied something', () => {
      expect(outcome({ MigrationsApplied: 3 })).toBe(true);
    });

    it('clears when the run THREW after a migration had started', () => {
      // Previously nothing cleared on this path at all: whatever had been applied was committed and
      // every server kept serving pre-migration rows until something else invalidated them.
      expect(outcome({ Threw: true, Succeeded: false, StartedApplying: true })).toBe(true);
    });

    it('leaves the fleet alone when the run threw before any migration started', () => {
      // A bad connection string or a config error cannot have changed the database.
      expect(outcome({ Threw: true, Succeeded: false, StartedApplying: false })).toBe(false);
    });

    it('clears a failed run even when it reported no details', () => {
      // `Details` can be empty precisely because the run died before assembling it — the emptiness
      // is not evidence that nothing happened.
      expect(outcome({ Succeeded: false, MigrationsApplied: 0, StartedApplying: true })).toBe(true);
    });

    it('clears a failed run in which every migration failed', () => {
      // DDL is not transactional across batches on SQL Server, so a migration that began and failed
      // can still have committed statements. "None succeeded" is not "nothing changed".
      expect(outcome({ Succeeded: false, StartedApplying: true, MigrationsApplied: 0 })).toBe(true);
    });
  });

  describe('AppendSharedCacheClear', () => {
    const base = { success: true, command: 'sync:push', durationSeconds: 1, data: { created: 2 }, warnings: ['existing'] };

    it('returns the result untouched when there was no clear', () => {
      const log = vi.fn();
      expect(AppendSharedCacheClear(base, null, { Log: log })).toBe(base);
      expect(log).not.toHaveBeenCalled();
    });

    it('adds the clear to data and logs it; a success adds no warning', () => {
      const log = vi.fn();
      const out = AppendSharedCacheClear(base, { Ok: true, Message: 'cleared', Categories: [{ Category: 'RunViewCache', KeyCount: 1 }] }, { Log: log });
      expect(out.data).toEqual({ created: 2, sharedCacheClear: { ok: true, categories: [{ Category: 'RunViewCache', KeyCount: 1 }] } });
      expect(out.warnings).toEqual(['existing']);
      expect(out.success).toBe(true);
      expect(log).toHaveBeenCalledWith('cleared', 'info');
    });

    it('adds a failed clear as a warning without failing the command', () => {
      const log = vi.fn();
      const out = AppendSharedCacheClear(base, { Ok: false, Message: 'could not clear', Categories: [] }, { Log: log });
      expect(out.success).toBe(true);
      expect(out.warnings).toEqual(['existing', 'could not clear']);
      expect(log).toHaveBeenCalledWith('could not clear', 'warn');
    });
  });
});
