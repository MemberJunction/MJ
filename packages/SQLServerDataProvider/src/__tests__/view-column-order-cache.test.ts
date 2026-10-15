import { describe, it, expect, vi } from 'vitest';
import * as sql from 'mssql';
import { SQLServerDataProvider } from '../SQLServerDataProvider';

/**
 * Tests for the per-pool shared view-column-order cache (issue #3102).
 *
 * MJServer creates 1–2 fresh provider instances per GraphQL request around the same
 * boot-time connection pools. The `sys.columns` scan that captures each view's physical
 * column order must run once per POOL per process — not once per provider instance —
 * while staying correct across multiple pools (RW + RO datasources can point at
 * different databases where the same schema.view has different column orders).
 *
 * These tests drive the private loadViewColumnOrderCache/scanViewColumnOrder path via a
 * structural cast and stub ExecuteSQL — no live database needed.
 */

/** Structural view of the provider's private surface exercised by these tests. */
interface ProviderTestSurface {
  _pool: sql.ConnectionPool;
  _viewColumnOrderCache: Map<string, string[]>;
  loadViewColumnOrderCache(): Promise<void>;
  ExecuteSQL(query: string, parameters?: unknown, options?: unknown): Promise<unknown>;
}

type ViewColumnRow = { SchemaName: string; ViewName: string; ColumnName: string };

const SAMPLE_ROWS: ViewColumnRow[] = [
  { SchemaName: '__mj', ViewName: 'vwUsers', ColumnName: 'ID' },
  { SchemaName: '__mj', ViewName: 'vwUsers', ColumnName: 'Name' },
  { SchemaName: '__mj', ViewName: 'vwUsers', ColumnName: 'Email' },
  { SchemaName: '__mj', ViewName: 'vwRoles', ColumnName: 'ID' },
  { SchemaName: '__mj', ViewName: 'vwRoles', ColumnName: 'RoleName' },
];

function makeProvider(pool: object, rows: ViewColumnRow[] | (() => Promise<ViewColumnRow[]>)): {
  provider: ProviderTestSurface;
  executeSpy: ReturnType<typeof vi.fn>;
} {
  const provider = new SQLServerDataProvider() as unknown as ProviderTestSurface;
  provider._pool = pool as sql.ConnectionPool;
  const executeSpy = vi.fn(async () => (typeof rows === 'function' ? rows() : rows));
  provider.ExecuteSQL = executeSpy;
  return { provider, executeSpy };
}

describe('SQLServerDataProvider - per-pool view column order cache', () => {
  it('scans sys.columns once and populates the instance cache in view column order', async () => {
    const pool = {};
    const { provider, executeSpy } = makeProvider(pool, SAMPLE_ROWS);

    await provider.loadViewColumnOrderCache();

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(provider._viewColumnOrderCache.get('__mj.vwusers')).toEqual(['ID', 'Name', 'Email']);
    expect(provider._viewColumnOrderCache.get('__mj.vwroles')).toEqual(['ID', 'RoleName']);
  });

  it('shares one scan across multiple provider instances on the same pool', async () => {
    const pool = {};
    const a = makeProvider(pool, SAMPLE_ROWS);
    const b = makeProvider(pool, SAMPLE_ROWS);

    await a.provider.loadViewColumnOrderCache();
    await b.provider.loadViewColumnOrderCache();

    // First instance scanned; second resolved from the shared per-pool cache.
    expect(a.executeSpy).toHaveBeenCalledTimes(1);
    expect(b.executeSpy).not.toHaveBeenCalled();
    expect(b.provider._viewColumnOrderCache.get('__mj.vwusers')).toEqual(['ID', 'Name', 'Email']);
  });

  it('de-duplicates concurrent loads onto a single in-flight scan', async () => {
    const pool = {};
    let resolveScan: (rows: ViewColumnRow[]) => void = () => undefined;
    const gated = new Promise<ViewColumnRow[]>((resolve) => {
      resolveScan = resolve;
    });
    const a = makeProvider(pool, () => gated);
    const b = makeProvider(pool, () => gated);

    const loadA = a.provider.loadViewColumnOrderCache();
    const loadB = b.provider.loadViewColumnOrderCache();
    resolveScan(SAMPLE_ROWS);
    await Promise.all([loadA, loadB]);

    expect(a.executeSpy.mock.calls.length + b.executeSpy.mock.calls.length).toBe(1);
    expect(a.provider._viewColumnOrderCache.get('__mj.vwroles')).toEqual(['ID', 'RoleName']);
    expect(b.provider._viewColumnOrderCache.get('__mj.vwroles')).toEqual(['ID', 'RoleName']);
  });

  it('keeps caches independent across different pools (multi-database correctness)', async () => {
    const poolA = {};
    const poolB = {};
    const rowsB: ViewColumnRow[] = [
      // Same schema.view name, DIFFERENT physical order — must not leak across pools.
      { SchemaName: '__mj', ViewName: 'vwUsers', ColumnName: 'Email' },
      { SchemaName: '__mj', ViewName: 'vwUsers', ColumnName: 'ID' },
      { SchemaName: '__mj', ViewName: 'vwUsers', ColumnName: 'Name' },
    ];
    const a = makeProvider(poolA, SAMPLE_ROWS);
    const b = makeProvider(poolB, rowsB);

    await a.provider.loadViewColumnOrderCache();
    await b.provider.loadViewColumnOrderCache();

    expect(a.executeSpy).toHaveBeenCalledTimes(1);
    expect(b.executeSpy).toHaveBeenCalledTimes(1);
    expect(a.provider._viewColumnOrderCache.get('__mj.vwusers')).toEqual(['ID', 'Name', 'Email']);
    expect(b.provider._viewColumnOrderCache.get('__mj.vwusers')).toEqual(['Email', 'ID', 'Name']);
  });

  it('falls back to an empty cache on scan failure and retries on the next load', async () => {
    const pool = {};
    const failing = makeProvider(pool, () => Promise.reject(new Error('boom')));

    await failing.provider.loadViewColumnOrderCache();
    expect(failing.provider._viewColumnOrderCache.size).toBe(0);

    // The failed entry must not be pinned — a later provider on the same pool rescans.
    const retry = makeProvider(pool, SAMPLE_ROWS);
    await retry.provider.loadViewColumnOrderCache();
    expect(retry.executeSpy).toHaveBeenCalledTimes(1);
    expect(retry.provider._viewColumnOrderCache.get('__mj.vwusers')).toEqual(['ID', 'Name', 'Email']);
  });

  it('InvalidateViewColumnOrderCache forces a rescan for that pool only', async () => {
    const poolA = {};
    const poolB = {};
    const a1 = makeProvider(poolA, SAMPLE_ROWS);
    const b1 = makeProvider(poolB, SAMPLE_ROWS);
    await a1.provider.loadViewColumnOrderCache();
    await b1.provider.loadViewColumnOrderCache();

    SQLServerDataProvider.InvalidateViewColumnOrderCache(poolA as sql.ConnectionPool);

    const a2 = makeProvider(poolA, SAMPLE_ROWS);
    const b2 = makeProvider(poolB, SAMPLE_ROWS);
    await a2.provider.loadViewColumnOrderCache();
    await b2.provider.loadViewColumnOrderCache();

    expect(a2.executeSpy).toHaveBeenCalledTimes(1); // invalidated → rescanned
    expect(b2.executeSpy).not.toHaveBeenCalled(); // untouched pool → shared cache hit
  });
});
