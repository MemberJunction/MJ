import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryCacheManager } from '../generic/QueryCacheManager';
import { QueryInfo } from '../generic/queryInfo';

// Mock logging
vi.mock('../generic/logging', () => ({
    LogStatus: vi.fn(),
    LogError: vi.fn(),
}));

// Mock LocalCacheManager
const mockSetRunQueryResult = vi.fn().mockResolvedValue(undefined);
const mockGetRunQueryResult = vi.fn().mockResolvedValue(null);
const mockInvalidateRunQueryResult = vi.fn().mockResolvedValue(undefined);
const mockInvalidateQueryCaches = vi.fn().mockResolvedValue(undefined);
const mockGenerateRunQueryFingerprint = vi.fn(
    (queryId?: string, queryName?: string, params?: Record<string, unknown>, conn?: string) => {
        const name = queryName?.trim() || 'Unknown';
        const id = queryId || '_';
        const p = params ? JSON.stringify(params) : '_';
        const parts = [name, id, p];
        if (conn) parts.push(conn);
        return parts.join('|');
    },
);

vi.mock('../generic/localCacheManager', () => ({
    LocalCacheManager: {
        Instance: {
            SetRunQueryResult: (...args: unknown[]) => mockSetRunQueryResult(...args),
            GetRunQueryResult: (...args: unknown[]) => mockGetRunQueryResult(...args),
            InvalidateRunQueryResult: (...args: unknown[]) => mockInvalidateRunQueryResult(...args),
            InvalidateQueryCaches: (...args: unknown[]) => mockInvalidateQueryCaches(...args),
            GenerateRunQueryFingerprint: (...args: unknown[]) => mockGenerateRunQueryFingerprint(...args),
        },
    },
}));

// Mock Metadata for FindQueryById
vi.mock('../generic/metadata', () => ({
    Metadata: {
        Provider: {
            Queries: [] as QueryInfo[],
            QueryEntities: [],
            QueryDependencies: [],
        },
    },
}));

// Helper to create a minimal QueryInfo-like object
function makeQuery(overrides: Partial<{
    ID: string;
    Name: string;
    CacheEnabled: boolean;
    CacheTTLMinutes: number;
    entities: Array<{ Entity: string }>;
    dependents: Array<{ QueryID: string }>;
}> = {}): QueryInfo {
    const q = {
        ID: overrides.ID || 'test-query-id',
        Name: overrides.Name || 'Test Query',
        CacheEnabled: overrides.CacheEnabled ?? true,
        CacheTTLMinutes: overrides.CacheTTLMinutes ?? 60,
        get CacheConfig() {
            if (!this.CacheEnabled) return { enabled: false, ttlMinutes: 0 };
            return { enabled: true, ttlMinutes: this.CacheTTLMinutes || 60, cacheKey: 'exact' as const };
        },
        get Entities() {
            return overrides.entities || [];
        },
        get Dependencies() {
            return [];
        },
        get Dependents() {
            return overrides.dependents || [];
        },
    } as unknown as QueryInfo;
    return q;
}

/**
 * QueryCacheManager tests.
 *
 * Caching is intentionally BYPASSED in QueryCacheManager right now (all Get/Set
 * methods short-circuit) to guarantee fresh data. See class-level comment for rationale.
 *
 * The tests below cover the caching logic and should be uncommented when the bypass
 * is removed and caching is re-enabled.
 */
describe('QueryCacheManager', () => {
    let mgr: QueryCacheManager;

    beforeEach(() => {
        vi.clearAllMocks();
        mgr = new QueryCacheManager('localhost');
    });

    // Invalidation methods still call through to LCM even while caching is bypassed

    describe('InvalidateQuery', () => {
        it('should delegate to InvalidateQueryCaches', async () => {
            await mgr.InvalidateQuery('My Query');
            expect(mockInvalidateQueryCaches).toHaveBeenCalledWith('My Query');
        });
    });

    describe('InvalidateWithDependents', () => {
        it('should not infinite-loop on circular dependencies', async () => {
            const q1 = makeQuery({ ID: 'q1', Name: 'Q1', dependents: [{ QueryID: 'q1' }] });
            await mgr.InvalidateWithDependents(q1);
            expect(mockInvalidateQueryCaches).toHaveBeenCalledTimes(1);
        });
    });

    // ── Tests for when caching is re-enabled ─────────────────────────────
    // Uncomment these when the early returns are removed from QueryCacheManager.

    /*
    describe('Get / Set (full results)', () => {
        it('should return null when caching is disabled', async () => {
            const query = makeQuery({ CacheEnabled: false });
            const result = await mgr.Get(query, {});
            expect(result).toBeNull();
            expect(mockGetRunQueryResult).not.toHaveBeenCalled();
        });

        it('should return null on cache miss', async () => {
            const query = makeQuery();
            mockGetRunQueryResult.mockResolvedValueOnce(null);
            const result = await mgr.Get(query, { filter: 'active' });
            expect(result).toBeNull();
        });

        it('should return results on cache hit', async () => {
            const query = makeQuery();
            const data = [{ id: 1 }, { id: 2 }];
            mockGetRunQueryResult.mockResolvedValueOnce({
                results: data,
                maxUpdatedAt: new Date().toISOString(),
                rowCount: 2,
            });
            const result = await mgr.Get(query, {});
            expect(result).not.toBeNull();
            expect(result!.results).toEqual(data);
            expect(result!.ttlRemainingMs).toBeGreaterThanOrEqual(0);
        });

        it('should call SetRunQueryResult with correct fingerprint on Set', async () => {
            const query = makeQuery({ ID: 'q1', Name: 'My Query', CacheTTLMinutes: 30 });
            const results = [{ id: 1 }];
            await mgr.Set(query, { region: 'US' }, results);
            expect(mockSetRunQueryResult).toHaveBeenCalledTimes(1);
            const [fp, name, res, _maxUpdated, rowCount, queryId, ttlMs] = mockSetRunQueryResult.mock.calls[0];
            expect(fp).toContain('My Query');
            expect(fp).toContain('q1');
            expect(name).toBe('My Query');
            expect(res).toEqual(results);
            expect(rowCount).toBe(1);
            expect(queryId).toBe('q1');
            expect(ttlMs).toBe(30 * 60 * 1000);
        });

        it('should not call Set when caching is disabled', async () => {
            const query = makeQuery({ CacheEnabled: false });
            await mgr.Set(query, {}, [{ id: 1 }]);
            expect(mockSetRunQueryResult).not.toHaveBeenCalled();
        });
    });

    describe('GetPaged / SetPaged', () => {
        it('should use page-aware fingerprints', async () => {
            const query = makeQuery({ ID: 'q1', Name: 'PQ' });
            await mgr.SetPaged(query, {}, 0, 50, [{ row: 1 }]);
            const [fp] = mockSetRunQueryResult.mock.calls[0];
            expect(fp).toContain('|page:0:50');
        });

        it('should distinguish different pages', async () => {
            const query = makeQuery({ ID: 'q1', Name: 'PQ' });
            await mgr.SetPaged(query, {}, 0, 50, [{ page: 1 }]);
            await mgr.SetPaged(query, {}, 50, 50, [{ page: 2 }]);
            expect(mockSetRunQueryResult).toHaveBeenCalledTimes(2);
            const fp1 = mockSetRunQueryResult.mock.calls[0][0] as string;
            const fp2 = mockSetRunQueryResult.mock.calls[1][0] as string;
            expect(fp1).not.toBe(fp2);
        });

        it('should return null when disabled', async () => {
            const query = makeQuery({ CacheEnabled: false });
            expect(await mgr.GetPaged(query, {}, 0, 50)).toBeNull();
        });
    });

    describe('GetTotalRowCount / SetTotalRowCount', () => {
        it('should store count as single-row result', async () => {
            const query = makeQuery({ ID: 'q1', Name: 'CQ' });
            await mgr.SetTotalRowCount(query, {}, 42);
            const [fp, name, results] = mockSetRunQueryResult.mock.calls[0];
            expect(fp).toContain('|count');
            expect(name).toBe('CQ [count]');
            expect(results).toEqual([{ TotalRowCount: 42 }]);
        });

        it('should extract count from cached single-row result', async () => {
            const query = makeQuery();
            mockGetRunQueryResult.mockResolvedValueOnce({
                results: [{ TotalRowCount: 99 }],
                maxUpdatedAt: new Date().toISOString(),
                rowCount: 1,
            });
            const count = await mgr.GetTotalRowCount(query, {});
            expect(count).toBe(99);
        });

        it('should return null on miss', async () => {
            const query = makeQuery();
            mockGetRunQueryResult.mockResolvedValueOnce(null);
            expect(await mgr.GetTotalRowCount(query, {})).toBeNull();
        });
    });

    describe('GetAdhoc / SetAdhoc', () => {
        it('should return null when TTL is 0', async () => {
            expect(await mgr.GetAdhoc('SELECT 1', 0)).toBeNull();
        });

        it('should generate deterministic fingerprints for same SQL', async () => {
            await mgr.SetAdhoc('SELECT * FROM Users', 10, [{ id: 1 }]);
            await mgr.SetAdhoc('SELECT * FROM Users', 10, [{ id: 2 }]);
            const fp1 = mockSetRunQueryResult.mock.calls[0][0] as string;
            const fp2 = mockSetRunQueryResult.mock.calls[1][0] as string;
            expect(fp1).toBe(fp2);
        });

        it('should use _adhoc_ prefix in fingerprint', async () => {
            await mgr.SetAdhoc('SELECT 1', 5, []);
            const [fp] = mockSetRunQueryResult.mock.calls[0];
            expect(fp).toMatch(/^_adhoc_\|/);
        });

        it('should not store when TTL is 0', async () => {
            await mgr.SetAdhoc('SELECT 1', 0, []);
            expect(mockSetRunQueryResult).not.toHaveBeenCalled();
        });
    });

    describe('HandleEntityChange', () => {
        it('should invalidate cached entries that depend on the entity', async () => {
            const query = makeQuery({ ID: 'q1', Name: 'Q1', entities: [{ Entity: 'Users' }] });
            await mgr.Set(query, {}, [{ id: 1 }]);
            await mgr.HandleEntityChange('Users');
            expect(mockInvalidateRunQueryResult).toHaveBeenCalledTimes(1);
        });

        it('should be case-insensitive for entity names', async () => {
            const query = makeQuery({ ID: 'q1', Name: 'Q1', entities: [{ Entity: 'Users' }] });
            await mgr.Set(query, {}, [{ id: 1 }]);
            await mgr.HandleEntityChange('users');
            expect(mockInvalidateRunQueryResult).toHaveBeenCalledTimes(1);
        });

        it('should do nothing for entities with no cached queries', async () => {
            await mgr.HandleEntityChange('SomeRandomEntity');
            expect(mockInvalidateRunQueryResult).not.toHaveBeenCalled();
        });
    });
    */
});
