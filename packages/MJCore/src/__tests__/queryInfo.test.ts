import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryInfo, QueryDependencyInfo, QueryCategoryInfo } from '../generic/queryInfo';
import { Metadata } from '../generic/metadata';
import { UserInfo } from '../generic/securityInfo';

// ---- Helpers ----

function makeQueryInfo(overrides: Partial<{
    ID: string;
    Name: string;
    SQL: string;
    Status: QueryInfo['Status'];
    Reusable: boolean;
    CategoryID: string;
    CacheEnabled: boolean;
    CacheTTLMinutes: number;
    UsesTemplate: boolean;
    SQLDialectID: string;
}>): QueryInfo {
    const q = new QueryInfo();
    q.ID = overrides.ID ?? 'q-1';
    q.Name = overrides.Name ?? 'Test Query';
    q.SQL = overrides.SQL ?? 'SELECT 1';
    q.Status = overrides.Status ?? 'Approved';
    q.Reusable = overrides.Reusable ?? false;
    q.CategoryID = overrides.CategoryID ?? null;
    q.CacheEnabled = overrides.CacheEnabled ?? false;
    q.CacheTTLMinutes = overrides.CacheTTLMinutes ?? null;
    q.UsesTemplate = overrides.UsesTemplate ?? false;
    q.SQLDialectID = overrides.SQLDialectID ?? null;
    return q;
}

function makeDependencyInfo(overrides: Partial<{
    ID: string;
    QueryID: string;
    DependsOnQueryID: string;
    ReferencePath: string;
    Alias: string | null;
    ParameterMapping: string | null;
    DetectionMethod: 'Auto' | 'Manual';
}>): QueryDependencyInfo {
    const d = new QueryDependencyInfo();
    d.ID = overrides.ID ?? 'dep-1';
    d.QueryID = overrides.QueryID ?? 'q-1';
    d.DependsOnQueryID = overrides.DependsOnQueryID ?? 'q-2';
    d.ReferencePath = overrides.ReferencePath ?? 'Test/Query';
    d.Alias = overrides.Alias ?? null;
    d.ParameterMapping = overrides.ParameterMapping ?? null;
    d.DetectionMethod = overrides.DetectionMethod ?? 'Auto';
    return d;
}

function mockProvider(overrides: Partial<{
    Queries: QueryInfo[];
    QueryDependencies: QueryDependencyInfo[];
    QueryCategories: QueryCategoryInfo[];
    QueryFields: unknown[];
    QueryParameters: unknown[];
    QueryPermissions: unknown[];
    SQLDialects: unknown[];
    QuerySQLs: unknown[];
}>): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: overrides.Queries ?? [],
        QueryDependencies: overrides.QueryDependencies ?? [],
        QueryCategories: overrides.QueryCategories ?? [],
        QueryFields: overrides.QueryFields ?? [],
        QueryParameters: overrides.QueryParameters ?? [],
        QueryPermissions: overrides.QueryPermissions ?? [],
        SQLDialects: overrides.SQLDialects ?? [],
        QuerySQLs: overrides.QuerySQLs ?? [],
    } as ReturnType<typeof Metadata.Provider>);
}

// ---- Tests ----

describe('QueryInfo', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ================================================================
    // Status and Composability
    // ================================================================
    describe('IsApproved', () => {
        it('should be true when Status is Approved', () => {
            const q = makeQueryInfo({ Status: 'Approved' });
            expect(q.IsApproved).toBe(true);
        });

        it('should be false for non-Approved statuses', () => {
            expect(makeQueryInfo({ Status: 'Pending' }).IsApproved).toBe(false);
            expect(makeQueryInfo({ Status: 'Rejected' }).IsApproved).toBe(false);
            expect(makeQueryInfo({ Status: 'Expired' }).IsApproved).toBe(false);
        });
    });

    describe('IsComposable', () => {
        it('should be true only when both Reusable and Approved', () => {
            const q = makeQueryInfo({ Reusable: true, Status: 'Approved' });
            expect(q.IsComposable).toBe(true);
        });

        it('should be false when Reusable but not Approved', () => {
            const q = makeQueryInfo({ Reusable: true, Status: 'Pending' });
            expect(q.IsComposable).toBe(false);
        });

        it('should be false when Approved but not Reusable', () => {
            const q = makeQueryInfo({ Reusable: false, Status: 'Approved' });
            expect(q.IsComposable).toBe(false);
        });

        it('should be false when neither Reusable nor Approved', () => {
            const q = makeQueryInfo({ Reusable: false, Status: 'Pending' });
            expect(q.IsComposable).toBe(false);
        });
    });

    // ================================================================
    // Dependencies
    // ================================================================
    describe('Dependencies', () => {
        it('should return dependencies where this query is the referencing query', () => {
            const dep1 = makeDependencyInfo({ QueryID: 'q-1', DependsOnQueryID: 'q-2' });
            const dep2 = makeDependencyInfo({ QueryID: 'q-1', DependsOnQueryID: 'q-3' });
            const unrelated = makeDependencyInfo({ QueryID: 'q-other', DependsOnQueryID: 'q-2' });

            mockProvider({ QueryDependencies: [dep1, dep2, unrelated] });

            const q = makeQueryInfo({ ID: 'q-1' });
            expect(q.Dependencies).toHaveLength(2);
            expect(q.Dependencies.map(d => d.DependsOnQueryID)).toEqual(['q-2', 'q-3']);
        });

        it('should return empty array when no dependencies', () => {
            mockProvider({ QueryDependencies: [] });

            const q = makeQueryInfo({ ID: 'q-1' });
            expect(q.Dependencies).toHaveLength(0);
        });

        it('should cache Dependencies on repeated access', () => {
            const dep = makeDependencyInfo({ QueryID: 'q-1', DependsOnQueryID: 'q-2' });
            mockProvider({ QueryDependencies: [dep] });

            const q = makeQueryInfo({ ID: 'q-1' });
            const first = q.Dependencies;
            const second = q.Dependencies;
            expect(first).toBe(second); // Same array reference = cached
        });
    });

    describe('Dependents', () => {
        it('should return queries that depend on this query', () => {
            const dep1 = makeDependencyInfo({ QueryID: 'q-other', DependsOnQueryID: 'q-1' });
            const dep2 = makeDependencyInfo({ QueryID: 'q-another', DependsOnQueryID: 'q-1' });
            const unrelated = makeDependencyInfo({ QueryID: 'q-other', DependsOnQueryID: 'q-2' });

            mockProvider({ QueryDependencies: [dep1, dep2, unrelated] });

            const q = makeQueryInfo({ ID: 'q-1' });
            expect(q.Dependents).toHaveLength(2);
            expect(q.Dependents.map(d => d.QueryID)).toEqual(['q-other', 'q-another']);
        });
    });

    // ================================================================
    // UserCanRun / UserHasRunPermissions
    // ================================================================
    describe('UserHasRunPermissions', () => {
        it('should return true when no permissions are defined (open to all)', () => {
            mockProvider({ QueryPermissions: [] });

            const q = makeQueryInfo({ ID: 'q-1' });
            const user = { UserRoles: [{ Role: 'User' }] } as unknown as UserInfo;
            expect(q.UserHasRunPermissions(user)).toBe(true);
        });

        it('should return true when user has matching role', () => {
            mockProvider({
                QueryPermissions: [{ QueryID: 'q-1', RoleID: 'r-1', Role: 'Admin', Query: 'Test' }]
            });

            const q = makeQueryInfo({ ID: 'q-1' });
            const user = { UserRoles: [{ Role: 'Admin' }] } as unknown as UserInfo;
            expect(q.UserHasRunPermissions(user)).toBe(true);
        });

        it('should return false when user lacks required role', () => {
            mockProvider({
                QueryPermissions: [{ QueryID: 'q-1', RoleID: 'r-1', Role: 'Admin', Query: 'Test' }]
            });

            const q = makeQueryInfo({ ID: 'q-1' });
            const user = { UserRoles: [{ Role: 'Viewer' }] } as unknown as UserInfo;
            expect(q.UserHasRunPermissions(user)).toBe(false);
        });

        it('should be case-insensitive for role matching', () => {
            mockProvider({
                QueryPermissions: [{ QueryID: 'q-1', RoleID: 'r-1', Role: 'Admin', Query: 'Test' }]
            });

            const q = makeQueryInfo({ ID: 'q-1' });
            const user = { UserRoles: [{ Role: 'admin' }] } as unknown as UserInfo;
            expect(q.UserHasRunPermissions(user)).toBe(true);
        });
    });

    // ================================================================
    // GetPlatformSQL
    // ================================================================
    describe('GetPlatformSQL', () => {
        it('should fall back to base SQL when no platform-specific SQL exists', () => {
            mockProvider({ SQLDialects: [], QuerySQLs: [] });

            const q = makeQueryInfo({ SQL: 'SELECT * FROM Users' });
            expect(q.GetPlatformSQL('sqlserver')).toBe('SELECT * FROM Users');
        });

        it('should use QuerySQL entry when dialect matches', () => {
            mockProvider({
                SQLDialects: [{ ID: 'd-1', Name: 'PostgreSQL', PlatformKey: 'postgresql' }],
                QuerySQLs: [{ QueryID: 'q-1', SQLDialectID: 'd-1', SQL: 'SELECT * FROM users LIMIT 10' }]
            });

            const q = makeQueryInfo({ ID: 'q-1', SQL: 'SELECT TOP 10 * FROM Users' });
            expect(q.GetPlatformSQL('postgresql')).toBe('SELECT * FROM users LIMIT 10');
        });

        it('should fall back to base SQL when no matching dialect', () => {
            mockProvider({
                SQLDialects: [{ ID: 'd-1', Name: 'PostgreSQL', PlatformKey: 'postgresql' }],
                QuerySQLs: [{ QueryID: 'q-1', SQLDialectID: 'd-1', SQL: 'PG SQL' }]
            });

            const q = makeQueryInfo({ ID: 'q-1', SQL: 'Base SQL' });
            // Asking for sqlserver but only PG dialect exists
            expect(q.GetPlatformSQL('sqlserver')).toBe('Base SQL');
        });
    });

    // ================================================================
    // CacheConfig
    // ================================================================
    describe('CacheConfig', () => {
        it('should return enabled config when CacheEnabled is true', () => {
            const q = makeQueryInfo({ CacheEnabled: true, CacheTTLMinutes: 30 });
            const config = q.CacheConfig;
            expect(config.enabled).toBe(true);
            expect(config.ttlMinutes).toBe(30);
        });

        it('should default TTL to 60 when not specified', () => {
            const q = makeQueryInfo({ CacheEnabled: true });
            expect(q.CacheConfig.ttlMinutes).toBe(60);
        });

        it('should return disabled config when caching not configured', () => {
            mockProvider({ QueryCategories: [] });

            const q = makeQueryInfo({ CacheEnabled: false });
            expect(q.CacheConfig.enabled).toBe(false);
        });
    });
});

// ================================================================
// QueryDependencyInfo
// ================================================================
describe('QueryDependencyInfo', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('ParsedParameterMapping', () => {
        it('should parse valid JSON parameter mapping', () => {
            const dep = makeDependencyInfo({
                ParameterMapping: '{"region":"@region","year":"2024"}'
            });
            const parsed = dep.ParsedParameterMapping;
            expect(parsed).toEqual({ region: '@region', year: '2024' });
        });

        it('should return empty object for null mapping', () => {
            const dep = makeDependencyInfo({ ParameterMapping: null });
            expect(dep.ParsedParameterMapping).toEqual({});
        });

        it('should return empty object for invalid JSON', () => {
            const dep = makeDependencyInfo({ ParameterMapping: 'not-json' });
            expect(dep.ParsedParameterMapping).toEqual({});
        });
    });

    describe('constructor', () => {
        it('should initialize from data', () => {
            const dep = new QueryDependencyInfo({
                ID: 'dep-1',
                QueryID: 'q-1',
                DependsOnQueryID: 'q-2',
                ReferencePath: 'Sales/Active Customers',
                Alias: 'ac',
                DetectionMethod: 'Auto'
            });

            expect(dep.ID).toBe('dep-1');
            expect(dep.QueryID).toBe('q-1');
            expect(dep.DependsOnQueryID).toBe('q-2');
            expect(dep.ReferencePath).toBe('Sales/Active Customers');
            expect(dep.Alias).toBe('ac');
            expect(dep.DetectionMethod).toBe('Auto');
        });
    });

    describe('QueryInfo and DependsOnQueryInfo navigations', () => {
        it('should resolve related query info objects', () => {
            const parentQuery = makeQueryInfo({ ID: 'q-1', Name: 'Parent' });
            const childQuery = makeQueryInfo({ ID: 'q-2', Name: 'Child' });

            mockProvider({
                Queries: [parentQuery, childQuery],
                QueryDependencies: []
            });

            const dep = makeDependencyInfo({ QueryID: 'q-1', DependsOnQueryID: 'q-2' });
            expect(dep.QueryInfo?.Name).toBe('Parent');
            expect(dep.DependsOnQueryInfo?.Name).toBe('Child');
        });
    });
});
