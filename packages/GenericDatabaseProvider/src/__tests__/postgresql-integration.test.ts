import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    QueryPagingEngine,
    QueryCache,
    QueryCacheConfig,
    QueryInfo,
    Metadata,
    UserInfo,
    DatabasePlatform
} from '@memberjunction/core';
import { QueryCompositionEngine } from '../queryCompositionEngine';

// Mock logging
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogStatus: vi.fn(),
        LogError: vi.fn()
    };
});

// ---- Helpers ----

function makeQueryInfo(overrides: Partial<{
    ID: string;
    Name: string;
    CategoryPath: string;
    SQL: string;
    Reusable: boolean;
    Status: string;
    UserCanRun: boolean;
}>): QueryInfo {
    const q = new QueryInfo();
    q.ID = overrides.ID ?? 'query-1';
    q.Name = overrides.Name ?? 'Test Query';
    q.SQL = overrides.SQL ?? 'SELECT 1';
    q.Reusable = overrides.Reusable ?? true;
    q.Status = (overrides.Status ?? 'Approved') as QueryInfo['Status'];

    Object.defineProperty(q, 'CategoryPath', {
        get: () => overrides.CategoryPath ?? '/Test/',
        configurable: true
    });

    q.UserCanRun = vi.fn().mockReturnValue(overrides.UserCanRun ?? true);
    q.GetPlatformSQL = vi.fn().mockReturnValue(q.SQL);

    return q;
}

function mockMetadataQueries(queries: QueryInfo[]): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: queries,
        QueryDependencies: []
    } as ReturnType<typeof Metadata.Provider>);
}

// ---- D.5: PostgreSQL Integration Tests ----
// Tests the full pipeline: composition → paging → cache for PostgreSQL

describe('PostgreSQL Integration: Composition + Paging + Cache', () => {
    const pgPlatform: DatabasePlatform = 'postgresql';
    const ssPlatform: DatabasePlatform = 'sqlserver';
    let engine: QueryCompositionEngine;
    let cache: QueryCache;
    const mockUser = { UserRoles: [{ Role: 'Admin' }] } as unknown as UserInfo;
    const enabledConfig: QueryCacheConfig = { enabled: true, ttlMinutes: 60 };

    beforeEach(() => {
        engine = new QueryCompositionEngine();
        cache = new QueryCache();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ─── D.1: CTE Name Quoting per Platform ─────────────────────────────────

    describe('CTE name quoting per platform', () => {
        it('should use double quotes for CTE names on PostgreSQL', () => {
            const reusableQuery = makeQueryInfo({
                ID: 'active-customers-id',
                Name: 'Active Customers',
                CategoryPath: '/Sales/',
                SQL: 'SELECT ID, Name FROM Customers WHERE Active = true',
                Reusable: true,
                Status: 'Approved'
            });

            mockMetadataQueries([reusableQuery]);

            const sql = 'SELECT * FROM {{query:"Sales/Active Customers"}} ac WHERE ac.Name LIKE \'%Smith%\'';
            const result = engine.ResolveComposition(sql, pgPlatform, mockUser);

            // PostgreSQL: CTE names must use double quotes, NOT brackets
            expect(result.ResolvedSQL).toMatch(/"__cte_Active_Customers_[a-z0-9]+"/);
            expect(result.ResolvedSQL).not.toContain('[__cte_');
        });

        it('should use brackets for CTE names on SQL Server', () => {
            const reusableQuery = makeQueryInfo({
                ID: 'active-customers-id',
                Name: 'Active Customers',
                CategoryPath: '/Sales/',
                SQL: 'SELECT ID, Name FROM Customers WHERE Active = 1',
                Reusable: true,
                Status: 'Approved'
            });

            mockMetadataQueries([reusableQuery]);

            const sql = 'SELECT * FROM {{query:"Sales/Active Customers"}} ac WHERE ac.Name LIKE \'%Smith%\'';
            const result = engine.ResolveComposition(sql, ssPlatform, mockUser);

            // SQL Server: CTE names must use brackets
            expect(result.ResolvedSQL).toMatch(/\[__cte_Active_Customers_[a-z0-9]+\]/);
            expect(result.ResolvedSQL).not.toMatch(/"__cte_/);
        });
    });

    // ─── Composition → Paging Pipeline ──────────────────────────────────────

    describe('Composition then paging on PostgreSQL', () => {
        it('should compose CTEs with double quotes then wrap with LIMIT/OFFSET paging', () => {
            const reusableQuery = makeQueryInfo({
                ID: 'revenue-id',
                Name: 'Revenue By Region',
                CategoryPath: '/Analytics/',
                SQL: 'SELECT Region, SUM(Amount) AS Total FROM Orders GROUP BY Region',
                Reusable: true,
                Status: 'Approved'
            });

            mockMetadataQueries([reusableQuery]);

            // Step 1: Composition
            const sql = 'SELECT r.Region, r.Total FROM {{query:"Analytics/Revenue By Region"}} r ORDER BY r.Total DESC';
            const composed = engine.ResolveComposition(sql, pgPlatform, mockUser);

            expect(composed.HasCompositions).toBe(true);
            expect(composed.CTEs.length).toBe(1);

            // Step 2: Paging — wrap the composed SQL
            const paged = QueryPagingEngine.WrapWithPaging(composed.ResolvedSQL, 0, 25, pgPlatform);

            // Should contain the composed CTE with PG double-quote quoting
            expect(paged.DataSQL).toMatch(/"__cte_Revenue_By_Region_[a-z0-9]+"/);
            // Should use PG paging syntax
            expect(paged.DataSQL).toContain('LIMIT 25 OFFSET 0');
            // Paging CTE should use PG quoting
            expect(paged.DataSQL).toContain('"__paged"');
            // Count query should also use PG quoting
            expect(paged.CountSQL).toContain('"__paged"');
            expect(paged.CountSQL).toContain('TotalRowCount');
        });

        it('should handle multi-composition with paging on PostgreSQL', () => {
            const customersQuery = makeQueryInfo({
                ID: 'customers-id',
                Name: 'Active Customers',
                CategoryPath: '/Sales/',
                SQL: 'SELECT ID, Name FROM Customers WHERE Active = true',
                Reusable: true,
                Status: 'Approved'
            });

            const ordersQuery = makeQueryInfo({
                ID: 'orders-id',
                Name: 'Recent Orders',
                CategoryPath: '/Sales/',
                SQL: 'SELECT CustomerID, Total FROM Orders WHERE OrderDate > CURRENT_DATE - INTERVAL \'30 days\'',
                Reusable: true,
                Status: 'Approved'
            });

            mockMetadataQueries([customersQuery, ordersQuery]);

            const sql = `SELECT c.Name, o.Total
FROM {{query:"Sales/Active Customers"}} c
JOIN {{query:"Sales/Recent Orders"}} o ON o.CustomerID = c.ID
ORDER BY o.Total DESC`;

            const composed = engine.ResolveComposition(sql, pgPlatform, mockUser);
            expect(composed.CTEs.length).toBe(2);

            const paged = QueryPagingEngine.WrapWithPaging(composed.ResolvedSQL, 50, 25, pgPlatform);

            // Both composed CTEs present
            expect(paged.DataSQL).toMatch(/"__cte_Active_Customers_[a-z0-9]+"/);
            expect(paged.DataSQL).toMatch(/"__cte_Recent_Orders_[a-z0-9]+"/);
            // Paging applied with correct offset
            expect(paged.DataSQL).toContain('LIMIT 25 OFFSET 50');
            // Count query wraps everything
            expect(paged.CountSQL).toContain('TotalRowCount');
        });
    });

    // ─── Composition → Paging → Cache Pipeline ─────────────────────────────

    describe('Full pipeline: composition + paging + cache on PostgreSQL', () => {
        it('should cache paged results from a composed query', () => {
            const reusableQuery = makeQueryInfo({
                ID: 'metrics-id',
                Name: 'Monthly Metrics',
                CategoryPath: '/Analytics/',
                SQL: 'SELECT Month, Revenue FROM MonthlyMetrics',
                Reusable: true,
                Status: 'Approved'
            });

            mockMetadataQueries([reusableQuery]);

            // Step 1: Compose
            const sql = 'SELECT m.Month, m.Revenue FROM {{query:"Analytics/Monthly Metrics"}} m ORDER BY m.Month';
            const composed = engine.ResolveComposition(sql, pgPlatform, mockUser);

            // Step 2: Page
            const paged = QueryPagingEngine.WrapWithPaging(composed.ResolvedSQL, 0, 10, pgPlatform);
            expect(paged.DataSQL).toContain('LIMIT 10 OFFSET 0');

            // Step 3: Cache the results
            const mockResults = [
                { Month: '2024-01', Revenue: 100000 },
                { Month: '2024-02', Revenue: 120000 }
            ];

            // Cache page 1
            cache.SetPaged('metrics-id', {}, 0, 10, mockResults, enabledConfig);
            cache.SetTotalRowCount('metrics-id', {}, 24, enabledConfig);

            // Verify page 1 cache hit
            const cachedPage1 = cache.GetPaged('metrics-id', {}, 0, 10, enabledConfig);
            expect(cachedPage1).not.toBeNull();
            expect(cachedPage1!.results).toEqual(mockResults);

            // Verify total count is cached
            const cachedCount = cache.GetTotalRowCount('metrics-id', {}, enabledConfig);
            expect(cachedCount).toBe(24);

            // Cache page 2 (different offset)
            const page2Results = [{ Month: '2024-11', Revenue: 150000 }];
            cache.SetPaged('metrics-id', {}, 10, 10, page2Results, enabledConfig);

            // Both pages should be independently cached
            const p1 = cache.GetPaged('metrics-id', {}, 0, 10, enabledConfig);
            const p2 = cache.GetPaged('metrics-id', {}, 10, 10, enabledConfig);
            expect(p1!.results).toEqual(mockResults);
            expect(p2!.results).toEqual(page2Results);

            // Count should still be shared across pages
            expect(cache.GetTotalRowCount('metrics-id', {}, enabledConfig)).toBe(24);
        });

        it('should invalidate cache when clearing a composed query', () => {
            // Cache data for a composed query
            cache.SetPaged('q1', {}, 0, 10, [{ id: 1 }], enabledConfig);
            cache.SetTotalRowCount('q1', {}, 100, enabledConfig);

            // Clear the query's cache (simulating dependency invalidation)
            cache.clear('q1');

            // Both paged data and count should be cleared
            expect(cache.GetPaged('q1', {}, 0, 10, enabledConfig)).toBeNull();
            expect(cache.GetTotalRowCount('q1', {}, enabledConfig)).toBeNull();
        });
    });

    // ─── Platform Parity ────────────────────────────────────────────────────

    describe('Platform parity: same composition produces valid SQL for both platforms', () => {
        it('should produce structurally equivalent SQL for both platforms', () => {
            const reusableQuery = makeQueryInfo({
                ID: 'q-id',
                Name: 'Base Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID, Name FROM Users WHERE Active = 1',
                Reusable: true,
                Status: 'Approved'
            });

            mockMetadataQueries([reusableQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Base Query"}} bq ORDER BY bq.Name';

            // Compose for both platforms
            const pgResult = engine.ResolveComposition(sql, pgPlatform, mockUser);
            const ssResult = engine.ResolveComposition(sql, ssPlatform, mockUser);

            // Both should resolve the composition
            expect(pgResult.HasCompositions).toBe(true);
            expect(ssResult.HasCompositions).toBe(true);
            expect(pgResult.CTEs.length).toBe(1);
            expect(ssResult.CTEs.length).toBe(1);

            // PG uses double quotes, SS uses brackets
            expect(pgResult.ResolvedSQL).toContain('"__cte_');
            expect(ssResult.ResolvedSQL).toContain('[__cte_');

            // Page both
            const pgPaged = QueryPagingEngine.WrapWithPaging(pgResult.ResolvedSQL, 0, 10, pgPlatform);
            const ssPaged = QueryPagingEngine.WrapWithPaging(ssResult.ResolvedSQL, 0, 10, ssPlatform);

            // PG uses LIMIT/OFFSET
            expect(pgPaged.DataSQL).toContain('LIMIT 10 OFFSET 0');
            expect(pgPaged.DataSQL).toContain('"__paged"');

            // SS uses OFFSET/FETCH
            expect(ssPaged.DataSQL).toContain('OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY');
            expect(ssPaged.DataSQL).toContain('[__paged]');
        });
    });
});
