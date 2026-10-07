import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: { Instance: { Config: async () => {}, EncryptValue: async (v: unknown) => v, DecryptValue: async (v: unknown) => v } },
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import { InMemoryLocalStorageProvider, LocalCacheManager, RunViewParams, RunViewResult, UserInfo, EntityInfo } from '@memberjunction/core';
import type { SaveSQLResult, DeleteSQLResult } from '../GenericDatabaseProvider';

/**
 * `BypassCache` on the smart-cache-check transport.
 *
 * A param that bypasses the cache is ineligible for a cache status, so the client attaches none —
 * and a missing `cacheStatus` is also how "the client has nothing cached yet" arrives. The server
 * used to treat those alike and answer BOTH from its own cache with no database hit, which inverted
 * the one signal that exists to force a database read: `BaseEngine.Config(true)` in a browser could
 * not escape a server slot that a missed invalidation had left stale.
 *
 * The control case below is load-bearing: it proves the slot really is populated and really is
 * reachable, so the bypass case demonstrating a database hit cannot pass vacuously.
 */
class CaptureProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return CaptureProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return CaptureProvider._defaultPattern; }

    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `LIMIT ${maxRows} OFFSET ${startRow}`; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    /** Every params object that reached the database leg. */
    public DatabaseReads: RunViewParams[] = [];
    public RowsFromDatabase: unknown[] = [{ ID: 'from-db', Name: 'Fresh' }];

    protected override async InternalRunView<T = unknown>(params: RunViewParams): Promise<RunViewResult<T>> {
        this.DatabaseReads.push(params);
        const rows = this.RowsFromDatabase as T[];
        return { Success: true, Results: rows, UserViewRunID: '', RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    }

    public override EntityByName(_name: string): EntityInfo | undefined { return undefined; }

    /** The fingerprint the cache-check path computes for a param, so a test can seed that exact slot. */
    public FingerprintFor(params: RunViewParams, contextUser?: UserInfo): string {
        return LocalCacheManager.Instance.GenerateRunViewFingerprint(
            params,
            this.InstanceConnectionString,
            this.ComputeRunViewRLSWhereClause(params, contextUser),
            undefined,
            this.ComputeRunViewFLSFingerprintKey(params),
        );
    }
}

const user: UserInfo = { ID: 'u1', Name: 'Test User', Email: 'test@test.com' } as UserInfo;

describe('RunViewsWithCacheCheck — BypassCache must reach the database', () => {
    let provider: CaptureProvider;

    beforeEach(async () => {
        provider = new CaptureProvider();
        await LocalCacheManager.Instance.Initialize(new InMemoryLocalStorageProvider(), { verboseLogging: false });
    });

    /** Seeds the server cache slot for `params` with rows the database leg would never return. */
    async function seedServerCache(params: RunViewParams): Promise<void> {
        const fingerprint = provider.FingerprintFor(params, user);
        await LocalCacheManager.Instance.SetRunViewResult(
            fingerprint, params, [{ ID: 'from-cache', Name: 'Stale' }], '2026-01-01T00:00:00.000Z', undefined, 1, provider,
        );
    }

    it('CONTROL: without BypassCache, a no-cacheStatus item is answered from the server cache with no database read', async () => {
        const params: RunViewParams = { EntityName: 'Customers', CacheLocal: true };
        await seedServerCache(params);

        const result = await provider.RunViewsWithCacheCheck([{ params }], user);

        expect(result.success).toBe(true);
        expect(provider.DatabaseReads).toHaveLength(0);
    });

    it('with BypassCache, the same item reads the database instead of the server cache', async () => {
        const params: RunViewParams = { EntityName: 'Customers', CacheLocal: true, BypassCache: true };
        // Seed the slot the bypassing read would otherwise be served from. Note the control above
        // seeds the SAME shape without BypassCache — the fingerprints differ only if BypassCache is
        // part of the key, so seed both spellings to be certain the slot is reachable either way.
        await seedServerCache(params);
        await seedServerCache({ EntityName: 'Customers', CacheLocal: true });

        const result = await provider.RunViewsWithCacheCheck([{ params }], user);

        expect(result.success).toBe(true);
        expect(provider.DatabaseReads).toHaveLength(1);
        expect(provider.DatabaseReads[0].BypassCache).toBe(true);
    });
});
