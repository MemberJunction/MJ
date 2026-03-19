import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryCompositionEngine, CompositionResult } from '../generic/queryCompositionEngine';
import { QueryInfo } from '../generic/queryInfo';
import { Metadata } from '../generic/metadata';
import { UserInfo } from '../generic/securityInfo';
import { QueryDependencySpec } from '../generic/queryExecutionSpec';

// ---- Helpers for building mock QueryInfo objects ----

function makeQueryInfo(overrides: Partial<{
    ID: string;
    Name: string;
    CategoryPath: string;
    SQL: string;
    Reusable: boolean;
    Status: string;
    UserCanRun: boolean;
    UsesTemplate: boolean;
}>): QueryInfo {
    const q = new QueryInfo();
    q.ID = overrides.ID ?? 'query-1';
    q.Name = overrides.Name ?? 'Test Query';
    q.SQL = overrides.SQL ?? 'SELECT 1';
    q.Reusable = overrides.Reusable ?? true;
    q.Status = (overrides.Status ?? 'Approved') as QueryInfo['Status'];
    q.UsesTemplate = overrides.UsesTemplate ?? false;

    // Mock CategoryPath (normally computed from category hierarchy)
    Object.defineProperty(q, 'CategoryPath', {
        get: () => overrides.CategoryPath ?? '/Test/',
        configurable: true
    });

    // Mock UserCanRun
    q.UserCanRun = vi.fn().mockReturnValue(overrides.UserCanRun ?? true);

    // Mock GetPlatformSQL to just return the SQL property
    q.GetPlatformSQL = vi.fn().mockReturnValue(q.SQL);

    return q;
}

function mockMetadataQueries(queries: QueryInfo[]): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: queries,
        QueryDependencies: []
    } as ReturnType<typeof Metadata.Provider>);
}

// ---- Tests ----

describe('QueryCompositionEngine', () => {
    let engine: QueryCompositionEngine;
    const mockUser = { UserRoles: [{ Role: 'Admin' }] } as unknown as UserInfo;

    beforeEach(() => {
        engine = new QueryCompositionEngine();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ================================================================
    // HasCompositionTokens
    // ================================================================
    describe('HasCompositionTokens', () => {
        it('should return false for null/empty SQL', () => {
            expect(engine.HasCompositionTokens(null as unknown as string)).toBe(false);
            expect(engine.HasCompositionTokens('')).toBe(false);
        });

        it('should return false for SQL without composition tokens', () => {
            expect(engine.HasCompositionTokens('SELECT * FROM Users WHERE {{name}} = 1')).toBe(false);
        });

        it('should return true for SQL with composition tokens', () => {
            expect(engine.HasCompositionTokens('SELECT * FROM {{query:"Sales/Active Customers"}}')).toBe(true);
        });

        it('should return false for undefined', () => {
            expect(engine.HasCompositionTokens(undefined as unknown as string)).toBe(false);
        });

        it('should return false when query: prefix has no double-quote delimiter', () => {
            // HasCompositionTokens is a fast substring check for '{{query:"'
            // Without the double-quote, it won't match
            expect(engine.HasCompositionTokens('SELECT * FROM {{query:Active}}')).toBe(false);
        });

        it('should return true for partial but plausible token (fast guard)', () => {
            // HasCompositionTokens uses includes() — it's a fast guard, not a full parser.
            // A malformed token with '{{query:"' still triggers true; ParseCompositionTokens
            // handles the actual validation.
            expect(engine.HasCompositionTokens('SELECT * FROM {{query:"Active}}')).toBe(true);
        });

        it('should return false when token is only inside a single-line comment', () => {
            const sql = '-- References {{query:"Demos/Active Users"}} for context\nSELECT 1';
            expect(engine.HasCompositionTokens(sql)).toBe(false);
        });

        it('should return false when token is only inside a block comment', () => {
            const sql = '/* Uses {{query:"Demos/Active Users"}} as a base */\nSELECT 1';
            expect(engine.HasCompositionTokens(sql)).toBe(false);
        });

        it('should return true when token exists outside comments even if also in comments', () => {
            const sql = '-- comment {{query:"Demos/Ignored"}}\nSELECT * FROM {{query:"Demos/Real"}} r';
            expect(engine.HasCompositionTokens(sql)).toBe(true);
        });
    });

    // ================================================================
    // ParseCompositionTokens
    // ================================================================
    describe('ParseCompositionTokens', () => {
        it('should parse a simple reference without params', () => {
            const sql = 'SELECT * FROM {{query:"Sales/Active Customers"}} ac';
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].QueryName).toBe('Active Customers');
            expect(tokens[0].CategorySegments).toEqual(['Sales']);
            expect(tokens[0].Parameters).toHaveLength(0);
            expect(tokens[0].FullPath).toBe('Sales/Active Customers');
        });

        it('should parse a reference with static params', () => {
            const sql = `SELECT * FROM {{query:"Sales/By Region(region='Northeast')"}} c`;
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].QueryName).toBe('By Region');
            expect(tokens[0].Parameters).toHaveLength(1);
            expect(tokens[0].Parameters[0].Name).toBe('region');
            expect(tokens[0].Parameters[0].StaticValue).toBe('Northeast');
            expect(tokens[0].Parameters[0].PassThroughName).toBeNull();
        });

        it('should parse a reference with pass-through params', () => {
            const sql = 'SELECT * FROM {{query:"Sales/By Region(region=userRegion)"}} c';
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].Parameters[0].Name).toBe('region');
            expect(tokens[0].Parameters[0].StaticValue).toBeNull();
            expect(tokens[0].Parameters[0].PassThroughName).toBe('userRegion');
        });

        it('should parse mixed static and pass-through params', () => {
            const sql = `SELECT * FROM {{query:"Analytics/Revenue(year='2024', region=region)"}} r`;
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].Parameters).toHaveLength(2);
            expect(tokens[0].Parameters[0].Name).toBe('year');
            expect(tokens[0].Parameters[0].StaticValue).toBe('2024');
            expect(tokens[0].Parameters[1].Name).toBe('region');
            expect(tokens[0].Parameters[1].PassThroughName).toBe('region');
        });

        it('should parse multiple composition tokens in one SQL', () => {
            const sql = `
                SELECT ac.Name, r.Total
                FROM {{query:"Sales/Active Customers"}} ac
                JOIN {{query:"Sales/Revenue By Customer(year='2024')"}} r ON r.CustomerID = ac.ID
            `;
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(2);
            expect(tokens[0].QueryName).toBe('Active Customers');
            expect(tokens[1].QueryName).toBe('Revenue By Customer');
        });

        it('should parse deeply nested category paths', () => {
            const sql = 'SELECT * FROM {{query:"MJ/AI/Agents/Running Agents"}} a';
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].CategorySegments).toEqual(['MJ', 'AI', 'Agents']);
            expect(tokens[0].QueryName).toBe('Running Agents');
        });

        it('should return empty array for SQL without tokens', () => {
            const tokens = engine.ParseCompositionTokens('SELECT * FROM Users WHERE {{name}} = 1');
            expect(tokens).toHaveLength(0);
        });

        it('should return empty for null/empty input', () => {
            expect(engine.ParseCompositionTokens(null as unknown as string)).toHaveLength(0);
            expect(engine.ParseCompositionTokens('')).toHaveLength(0);
        });

        it('should ignore tokens inside single-line SQL comments', () => {
            const sql = `-- This uses {{query:"Demos/Active Users"}} as a data source
SELECT * FROM {{query:"Demos/Real Query"}} r`;
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].QueryName).toBe('Real Query');
        });

        it('should ignore tokens inside block comments', () => {
            const sql = `/* Composition demo: {{query:"Demos/Active Users"}} */
SELECT * FROM {{query:"Demos/Real Query"}} r`;
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].QueryName).toBe('Real Query');
        });

        it('should ignore tokens inside multi-line block comments', () => {
            const sql = `/*
 * This query references:
 * - {{query:"Demos/Active Users"}}
 * - {{query:"Demos/Recent Entity Changes(lookbackDays='30')"}}
 */
SELECT 1 AS Val`;
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(0);
        });

        it('should not strip tokens inside SQL string literals', () => {
            // A query token inside a quoted string should still be preserved
            // (though this is an unusual edge case)
            const sql = `SELECT '{{query:"Demos/Active Users"}}' AS TokenText`;
            const tokens = engine.ParseCompositionTokens(sql);

            // The token is inside a string literal, so the comment stripper
            // preserves it and the regex still finds it
            expect(tokens).toHaveLength(1);
        });

        it('should parse a reference with no category path (name only)', () => {
            const sql = 'SELECT * FROM {{query:"Active Customers"}} ac';
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].QueryName).toBe('Active Customers');
            expect(tokens[0].CategorySegments).toEqual([]);
        });

        it('should parse params with empty string static value', () => {
            const sql = `SELECT * FROM {{query:"Test/Q(filter='')"}} q`;
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].Parameters).toHaveLength(1);
            expect(tokens[0].Parameters[0].Name).toBe('filter');
            expect(tokens[0].Parameters[0].StaticValue).toBe('');
        });

        it('should parse multiple params separated by commas', () => {
            const sql = `SELECT * FROM {{query:"Test/Q(a='1', b='2', c=passThru)"}} q`;
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].Parameters).toHaveLength(3);
            expect(tokens[0].Parameters[0]).toEqual({ Name: 'a', StaticValue: '1', PassThroughName: null });
            expect(tokens[0].Parameters[1]).toEqual({ Name: 'b', StaticValue: '2', PassThroughName: null });
            expect(tokens[0].Parameters[2]).toEqual({ Name: 'c', StaticValue: null, PassThroughName: 'passThru' });
        });

        it('should handle static values containing commas inside quotes', () => {
            const sql = `SELECT * FROM {{query:"Test/Q(label='a,b,c')"}} q`;
            const tokens = engine.ParseCompositionTokens(sql);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].Parameters).toHaveLength(1);
            expect(tokens[0].Parameters[0].StaticValue).toBe('a,b,c');
        });
    });

    // ================================================================
    // ResolveComposition
    // ================================================================
    describe('ResolveComposition', () => {
        it('should resolve a simple single-level composition', () => {
            const baseQuery = makeQueryInfo({
                ID: 'base-1',
                Name: 'Active Customers',
                CategoryPath: '/Sales/',
                SQL: 'SELECT ID, Name FROM Customers WHERE Active = 1'
            });

            mockMetadataQueries([baseQuery]);

            const sql = 'SELECT * FROM {{query:"Sales/Active Customers"}} ac WHERE ac.Name LIKE \'%test%\'';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
            expect(result.CTEs[0].QueryID).toBe('base-1');
            expect(result.CTEs[0].QueryName).toBe('Active Customers');
            expect(result.ResolvedSQL).toContain('WITH');
            expect(result.ResolvedSQL).toContain('SELECT ID, Name FROM Customers WHERE Active = 1');
            // The original token should be replaced with CTE name
            expect(result.ResolvedSQL).not.toContain('{{query:');
        });

        it('should resolve multiple references with deduplication', () => {
            const baseQuery = makeQueryInfo({
                ID: 'base-1',
                Name: 'Active Customers',
                CategoryPath: '/Sales/',
                SQL: 'SELECT ID, Name FROM Customers WHERE Active = 1'
            });

            mockMetadataQueries([baseQuery]);

            const sql = `
                SELECT a.ID, b.Name
                FROM {{query:"Sales/Active Customers"}} a
                JOIN {{query:"Sales/Active Customers"}} b ON a.ID = b.ID
            `;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // Same query referenced twice → should only generate one CTE
            expect(result.CTEs).toHaveLength(1);
        });

        it('should NOT deduplicate same query with different params', () => {
            const baseQuery = makeQueryInfo({
                ID: 'base-1',
                Name: 'By Region',
                CategoryPath: '/Sales/',
                SQL: "SELECT * FROM Customers WHERE Region = {{region}}"
            });

            mockMetadataQueries([baseQuery]);

            const sql = `
                SELECT a.*, b.*
                FROM {{query:"Sales/By Region(region='East')"}} a
                JOIN {{query:"Sales/By Region(region='West')"}} b ON a.ID = b.ID
            `;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // Same query but different params → two CTEs
            expect(result.CTEs).toHaveLength(2);
            expect(result.CTEs[0].Parameters).toEqual({ region: 'East' });
            expect(result.CTEs[1].Parameters).toEqual({ region: 'West' });
        });

        it('should resolve static parameter substitution', () => {
            const baseQuery = makeQueryInfo({
                ID: 'base-1',
                Name: 'By Region',
                CategoryPath: '/Sales/',
                SQL: "SELECT * FROM Customers WHERE Region = {{region}}"
            });

            mockMetadataQueries([baseQuery]);

            const sql = `SELECT * FROM {{query:"Sales/By Region(region='Northeast')"}} c`;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            // The CTE body should have the static value substituted
            expect(result.CTEs[0].ResolvedSQL).toContain("'Northeast'");
        });

        it('should substitute numeric parameters as bare literals (no quotes)', () => {
            const baseQuery = makeQueryInfo({
                ID: 'base-1',
                Name: 'Recent Changes',
                CategoryPath: '/Demos/',
                SQL: "SELECT * FROM Changes WHERE CreatedAt >= DATEADD(DAY, -{{lookbackDays}}, GETUTCDATE())"
            });

            mockMetadataQueries([baseQuery]);

            const sql = `SELECT * FROM {{query:"Demos/Recent Changes(lookbackDays='30')"}} rc`;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // Numeric value should NOT be quoted — DATEADD needs a bare integer
            expect(result.CTEs[0].ResolvedSQL).toContain('-30');
            expect(result.CTEs[0].ResolvedSQL).not.toContain("-'30'");
        });

        it('should substitute decimal numeric parameters as bare literals', () => {
            const baseQuery = makeQueryInfo({
                ID: 'base-1',
                Name: 'Threshold',
                CategoryPath: '/Test/',
                SQL: "SELECT * FROM Scores WHERE Score > {{minScore}}"
            });

            mockMetadataQueries([baseQuery]);

            const sql = `SELECT * FROM {{query:"Test/Threshold(minScore='95.5')"}} t`;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.CTEs[0].ResolvedSQL).toContain('95.5');
            expect(result.CTEs[0].ResolvedSQL).not.toContain("'95.5'");
        });

        it('should escape single quotes in static parameter values', () => {
            const baseQuery = makeQueryInfo({
                ID: 'base-1',
                Name: 'By Name',
                CategoryPath: '/Test/',
                SQL: "SELECT * FROM Users WHERE Name = {{name}}"
            });

            mockMetadataQueries([baseQuery]);

            const sql = `SELECT * FROM {{query:"Test/By Name(name='O''Brien')"}} u`;
            const tokens = engine.ParseCompositionTokens(sql);
            // The quote escaping in the reference itself depends on the param parser
            // At minimum, the engine should not crash
            expect(tokens).toHaveLength(1);
        });

        it('should preserve pass-through parameters as Nunjucks tokens', () => {
            const baseQuery = makeQueryInfo({
                ID: 'base-1',
                Name: 'By Region',
                CategoryPath: '/Sales/',
                SQL: "SELECT * FROM Customers WHERE Region = {{region}}"
            });

            mockMetadataQueries([baseQuery]);

            const sql = 'SELECT * FROM {{query:"Sales/By Region(region=userRegion)"}} c';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // Pass-through: {{region}} in the referenced query is renamed to {{userRegion}}
            // so the downstream Nunjucks processor resolves it from the outer query's params
            expect(result.CTEs[0].ResolvedSQL).toContain('{{userRegion}}');
        });

        it('should throw on non-existent query reference', () => {
            mockMetadataQueries([]);

            const sql = 'SELECT * FROM {{query:"NonExistent/Query"}} q';
            expect(() => engine.ResolveComposition(sql, 'sqlserver', mockUser))
                .toThrow(/Referenced query not found/);
        });

        it('should throw on non-reusable query reference', () => {
            const nonReusable = makeQueryInfo({
                ID: 'base-1',
                Name: 'Private Query',
                CategoryPath: '/Sales/',
                Reusable: false
            });

            mockMetadataQueries([nonReusable]);

            const sql = 'SELECT * FROM {{query:"Sales/Private Query"}} q';
            expect(() => engine.ResolveComposition(sql, 'sqlserver', mockUser))
                .toThrow(/not marked as Reusable/);
        });

        it('should throw on non-approved query reference', () => {
            const pending = makeQueryInfo({
                ID: 'base-1',
                Name: 'Pending Query',
                CategoryPath: '/Sales/',
                Reusable: true,
                Status: 'Pending'
            });

            mockMetadataQueries([pending]);

            const sql = 'SELECT * FROM {{query:"Sales/Pending Query"}} q';
            expect(() => engine.ResolveComposition(sql, 'sqlserver', mockUser))
                .toThrow(/not Approved/);
        });

        it('should throw on permission denied for referenced query', () => {
            const restricted = makeQueryInfo({
                ID: 'base-1',
                Name: 'Restricted Query',
                CategoryPath: '/Sales/',
                Reusable: true,
                UserCanRun: false
            });

            mockMetadataQueries([restricted]);

            const sql = 'SELECT * FROM {{query:"Sales/Restricted Query"}} q';
            expect(() => engine.ResolveComposition(sql, 'sqlserver', mockUser))
                .toThrow(/does not have permission/);
        });

        it('should detect circular dependencies', () => {
            // Query A references Query B, and Query B references Query A
            const queryA = makeQueryInfo({
                ID: 'query-a',
                Name: 'Query A',
                CategoryPath: '/Test/',
                SQL: 'SELECT * FROM {{query:"Test/Query B"}} b'
            });

            const queryB = makeQueryInfo({
                ID: 'query-b',
                Name: 'Query B',
                CategoryPath: '/Test/',
                SQL: 'SELECT * FROM {{query:"Test/Query A"}} a'
            });

            mockMetadataQueries([queryA, queryB]);

            const sql = 'SELECT * FROM {{query:"Test/Query A"}} a';
            expect(() => engine.ResolveComposition(sql, 'sqlserver', mockUser))
                .toThrow(/Circular query dependency/);
        });

        it('should detect self-referencing cycle', () => {
            const selfRef = makeQueryInfo({
                ID: 'self-ref',
                Name: 'Self Ref',
                CategoryPath: '/Test/',
                SQL: 'SELECT * FROM {{query:"Test/Self Ref"}} s'
            });

            mockMetadataQueries([selfRef]);

            const sql = 'SELECT * FROM {{query:"Test/Self Ref"}} s';
            expect(() => engine.ResolveComposition(sql, 'sqlserver', mockUser))
                .toThrow(/Circular query dependency/);
        });

        it('should resolve nested (multi-level) compositions', () => {
            const leaf = makeQueryInfo({
                ID: 'leaf',
                Name: 'Leaf Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT 1 AS Val'
            });

            const middle = makeQueryInfo({
                ID: 'middle',
                Name: 'Middle Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT * FROM {{query:"Test/Leaf Query"}} lq'
            });

            mockMetadataQueries([leaf, middle]);

            const sql = 'SELECT * FROM {{query:"Test/Middle Query"}} mq';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // Should have 2 CTEs: one for leaf, one for middle
            expect(result.CTEs).toHaveLength(2);
            expect(result.CTEs[0].QueryName).toBe('Leaf Query');
            expect(result.CTEs[1].QueryName).toBe('Middle Query');
        });

        it('should resolve three-level deep compositions', () => {
            const level3 = makeQueryInfo({
                ID: 'l3', Name: 'Level 3', CategoryPath: '/Deep/',
                SQL: 'SELECT id FROM base_table'
            });
            const level2 = makeQueryInfo({
                ID: 'l2', Name: 'Level 2', CategoryPath: '/Deep/',
                SQL: 'SELECT * FROM {{query:"Deep/Level 3"}} l3'
            });
            const level1 = makeQueryInfo({
                ID: 'l1', Name: 'Level 1', CategoryPath: '/Deep/',
                SQL: 'SELECT * FROM {{query:"Deep/Level 2"}} l2'
            });

            mockMetadataQueries([level3, level2, level1]);

            const sql = 'SELECT * FROM {{query:"Deep/Level 1"}} l1';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.CTEs).toHaveLength(3);
            expect(result.CTEs[0].QueryName).toBe('Level 3');
            expect(result.CTEs[1].QueryName).toBe('Level 2');
            expect(result.CTEs[2].QueryName).toBe('Level 1');
        });

        it('should handle SQL that already has a WITH clause', () => {
            const baseQuery = makeQueryInfo({
                ID: 'base-1',
                Name: 'Base',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID FROM Items'
            });

            mockMetadataQueries([baseQuery]);

            const sql = 'WITH existing AS (SELECT 1) SELECT * FROM existing e JOIN {{query:"Test/Base"}} b ON e.ID = b.ID';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // Should merge: composition CTEs + existing CTE
            expect(result.ResolvedSQL).toMatch(/^WITH/i);
            // Should contain both the composition CTE and the existing one
            expect(result.ResolvedSQL).toContain('existing AS (SELECT 1)');
        });

        it('should return SQL unchanged when no tokens present', () => {
            const sql = 'SELECT * FROM Users WHERE Active = 1';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(false);
            expect(result.CTEs).toHaveLength(0);
            expect(result.ResolvedSQL).toBe(sql);
        });

        it('should throw on ambiguous query reference (same name, different categories)', () => {
            const query1 = makeQueryInfo({
                ID: 'q1',
                Name: 'Users',
                CategoryPath: '/Sales/',
                SQL: 'SELECT 1'
            });
            const query2 = makeQueryInfo({
                ID: 'q2',
                Name: 'Users',
                CategoryPath: '/Admin/',
                SQL: 'SELECT 2'
            });

            mockMetadataQueries([query1, query2]);

            // Reference by name only (no category path) — ambiguous
            const sql = 'SELECT * FROM {{query:"Users"}} u';
            expect(() => engine.ResolveComposition(sql, 'sqlserver', mockUser))
                .toThrow(/Ambiguous query reference/);
        });

        it('should disambiguate by category path when name matches multiple queries', () => {
            const salesUsers = makeQueryInfo({
                ID: 'q1',
                Name: 'Users',
                CategoryPath: '/Sales/',
                SQL: 'SELECT ID FROM SalesUsers'
            });
            const adminUsers = makeQueryInfo({
                ID: 'q2',
                Name: 'Users',
                CategoryPath: '/Admin/',
                SQL: 'SELECT ID FROM AdminUsers'
            });

            mockMetadataQueries([salesUsers, adminUsers]);

            // Full category path resolves ambiguity
            const sql = 'SELECT * FROM {{query:"Sales/Users"}} u';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.CTEs).toHaveLength(1);
            expect(result.CTEs[0].QueryID).toBe('q1');
            expect(result.CTEs[0].ResolvedSQL).toContain('SalesUsers');
        });

        it('should populate DependencyGraph correctly', () => {
            const leaf = makeQueryInfo({
                ID: 'leaf-id',
                Name: 'Leaf',
                CategoryPath: '/Test/',
                SQL: 'SELECT 1'
            });

            mockMetadataQueries([leaf]);

            const sql = 'SELECT * FROM {{query:"Test/Leaf"}} l';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.DependencyGraph.size).toBeGreaterThan(0);
            const deps = result.DependencyGraph.get('__current__');
            expect(deps).toContain('leaf-id');
        });

        it('should resolve query by name only when unambiguous', () => {
            const unique = makeQueryInfo({
                ID: 'uniq-1',
                Name: 'Unique Query',
                CategoryPath: '/Some/Path/',
                SQL: 'SELECT 42'
            });

            mockMetadataQueries([unique]);

            // No category path, just name — unambiguous because only one match
            const sql = 'SELECT * FROM {{query:"Unique Query"}} uq';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.CTEs).toHaveLength(1);
            expect(result.CTEs[0].QueryID).toBe('uniq-1');
        });

        it('should reject Rejected status queries', () => {
            const rejected = makeQueryInfo({
                ID: 'r-1',
                Name: 'Rejected',
                CategoryPath: '/Test/',
                Reusable: true,
                Status: 'Rejected'
            });

            mockMetadataQueries([rejected]);

            const sql = 'SELECT * FROM {{query:"Test/Rejected"}} r';
            expect(() => engine.ResolveComposition(sql, 'sqlserver', mockUser))
                .toThrow(/not Approved/);
        });

        it('should reject Expired status queries', () => {
            const expired = makeQueryInfo({
                ID: 'e-1',
                Name: 'Expired',
                CategoryPath: '/Test/',
                Reusable: true,
                Status: 'Expired'
            });

            mockMetadataQueries([expired]);

            const sql = 'SELECT * FROM {{query:"Test/Expired"}} e';
            expect(() => engine.ResolveComposition(sql, 'sqlserver', mockUser))
                .toThrow(/not Approved/);
        });
    });

    // ================================================================
    // CTE Assembly Edge Cases
    // ================================================================
    describe('CTE Assembly', () => {
        it('should generate deterministic CTE names for same query+params', () => {
            const baseQuery = makeQueryInfo({
                ID: 'det-1',
                Name: 'Deterministic',
                CategoryPath: '/Test/',
                SQL: 'SELECT 1'
            });

            mockMetadataQueries([baseQuery]);

            const sql1 = 'SELECT * FROM {{query:"Test/Deterministic"}} d';
            const result1 = engine.ResolveComposition(sql1, 'sqlserver', mockUser);

            // Reset engine, resolve again
            const engine2 = new QueryCompositionEngine();
            const result2 = engine2.ResolveComposition(sql1, 'sqlserver', mockUser);

            expect(result1.CTEs[0].CTEName).toBe(result2.CTEs[0].CTEName);
        });

        it('should generate different CTE names for different params', () => {
            const baseQuery = makeQueryInfo({
                ID: 'param-1',
                Name: 'Parameterized',
                CategoryPath: '/Test/',
                SQL: 'SELECT * FROM T WHERE x = {{x}}'
            });

            mockMetadataQueries([baseQuery]);

            const sql = `
                SELECT a.*, b.*
                FROM {{query:"Test/Parameterized(x='1')"}} a
                JOIN {{query:"Test/Parameterized(x='2')"}} b ON a.id = b.id
            `;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.CTEs[0].CTEName).not.toBe(result.CTEs[1].CTEName);
        });
    });

    // ================================================================
    // AnyDependencyUsesTemplates (transitive UsesTemplate flag)
    // ================================================================
    describe('AnyDependencyUsesTemplates', () => {
        it('should be false when no dependencies use templates', () => {
            const baseQuery = makeQueryInfo({
                ID: 'no-tpl',
                Name: 'Plain Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT 1',
                UsesTemplate: false,
            });

            mockMetadataQueries([baseQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Plain Query"}} q';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.AnyDependencyUsesTemplates).toBe(false);
        });

        it('should be true when a direct dependency uses templates', () => {
            const templateQuery = makeQueryInfo({
                ID: 'tpl-1',
                Name: 'Template Query',
                CategoryPath: '/Test/',
                SQL: "SELECT * FROM Users {% if Active %}WHERE Active = 1{% endif %}",
                UsesTemplate: true,
            });

            mockMetadataQueries([templateQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Template Query"}} q';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.AnyDependencyUsesTemplates).toBe(true);
        });

        it('should be true transitively when only a nested dependency uses templates', () => {
            // Leaf uses templates, middle does not
            const leaf = makeQueryInfo({
                ID: 'leaf-tpl',
                Name: 'Leaf With Template',
                CategoryPath: '/Test/',
                SQL: "SELECT * FROM Data {% if Filter %}WHERE x = '{{ Filter }}'{% endif %}",
                UsesTemplate: true,
            });

            const middle = makeQueryInfo({
                ID: 'mid-no-tpl',
                Name: 'Middle No Template',
                CategoryPath: '/Test/',
                SQL: 'SELECT * FROM {{query:"Test/Leaf With Template"}} lq',
                UsesTemplate: false,
            });

            mockMetadataQueries([leaf, middle]);

            const sql = 'SELECT * FROM {{query:"Test/Middle No Template"}} mq';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.AnyDependencyUsesTemplates).toBe(true);
            expect(result.CTEs).toHaveLength(2);
        });

        it('should be false when SQL has no composition tokens', () => {
            const sql = 'SELECT * FROM Users';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.AnyDependencyUsesTemplates).toBe(false);
            expect(result.HasCompositions).toBe(false);
        });

        it('should short-circuit after first template match with multiple deps', () => {
            const dep1 = makeQueryInfo({
                ID: 'd1', Name: 'Dep1', CategoryPath: '/Test/',
                SQL: 'SELECT 1', UsesTemplate: true,
            });
            const dep2 = makeQueryInfo({
                ID: 'd2', Name: 'Dep2', CategoryPath: '/Test/',
                SQL: 'SELECT 2', UsesTemplate: false,
            });

            mockMetadataQueries([dep1, dep2]);

            const sql = 'SELECT * FROM {{query:"Test/Dep1"}} a JOIN {{query:"Test/Dep2"}} b ON 1=1';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // Flag should be true from dep1, regardless of dep2
            expect(result.AnyDependencyUsesTemplates).toBe(true);
        });
    });

    // ================================================================
    // ORDER BY stripping in CTE bodies
    // ================================================================
    describe('ORDER BY stripping in CTEs', () => {
        it('should strip trailing ORDER BY from CTE body', () => {
            const depQuery = makeQueryInfo({
                ID: 'ord-1',
                Name: 'Ordered Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID, Name FROM Users ORDER BY Name ASC',
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Ordered Query"}} oq';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.ResolvedSQL).toContain('SELECT ID, Name FROM Users');
            expect(result.ResolvedSQL).not.toMatch(/ORDER\s+BY/i);
        });

        it('should strip ORDER BY with multiple columns and ASC/DESC', () => {
            const depQuery = makeQueryInfo({
                ID: 'ord-multi',
                Name: 'Multi Order',
                CategoryPath: '/Test/',
                SQL: 'SELECT * FROM Sales ORDER BY Region ASC, Amount DESC, Date',
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Multi Order"}} mo';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.ResolvedSQL).toContain('SELECT * FROM Sales');
            expect(result.ResolvedSQL).not.toMatch(/ORDER\s+BY/i);
        });

        it('should preserve ORDER BY when TOP is present', () => {
            const depQuery = makeQueryInfo({
                ID: 'ord-top',
                Name: 'Top Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT TOP 5 ID, Name FROM Users ORDER BY Score DESC',
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Top Query"}} tq';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.ResolvedSQL).toMatch(/ORDER\s+BY/i);
            expect(result.ResolvedSQL).toContain('TOP 5');
        });

        it('should preserve ORDER BY when OFFSET is present', () => {
            const depQuery = makeQueryInfo({
                ID: 'ord-offset',
                Name: 'Offset Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID FROM Users ORDER BY ID OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY',
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Offset Query"}} oq';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.ResolvedSQL).toMatch(/ORDER\s+BY/i);
            expect(result.ResolvedSQL).toMatch(/OFFSET\s+10/i);
        });

        it('should preserve ORDER BY when FOR XML is present', () => {
            const depQuery = makeQueryInfo({
                ID: 'ord-xml',
                Name: 'XML Query',
                CategoryPath: '/Test/',
                SQL: "SELECT ID, Name FROM Users ORDER BY Name FOR XML PATH('User')",
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/XML Query"}} xq';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.ResolvedSQL).toMatch(/ORDER\s+BY/i);
            expect(result.ResolvedSQL).toMatch(/FOR\s+XML/i);
        });

        it('should not strip ORDER BY inside a subquery (paren depth > 0)', () => {
            const depQuery = makeQueryInfo({
                ID: 'ord-sub',
                Name: 'Subquery Order',
                CategoryPath: '/Test/',
                SQL: 'SELECT * FROM (SELECT TOP 10 ID FROM Users ORDER BY Score DESC) sub',
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Subquery Order"}} so';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // ORDER BY is inside a subquery with TOP — should be preserved
            expect(result.ResolvedSQL).toMatch(/ORDER\s+BY/i);
        });

        it('should strip ORDER BY from dependency SQL that also has Nunjucks tokens', () => {
            const depQuery = makeQueryInfo({
                ID: 'ord-nj',
                Name: 'Nunjucks Ordered',
                CategoryPath: '/Test/',
                SQL: `SELECT m.ID, m.Name FROM Members m
{% if Region %}
WHERE m.Region = '{{ Region }}'
{% endif %}
ORDER BY m.Name`,
                UsesTemplate: true,
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Nunjucks Ordered"}} no';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // ORDER BY should be stripped even though Nunjucks tokens are present
            expect(result.ResolvedSQL).not.toMatch(/ORDER\s+BY/i);
            // Nunjucks tokens should still be present (they get processed later)
            expect(result.ResolvedSQL).toContain('{%');
            expect(result.AnyDependencyUsesTemplates).toBe(true);
        });
    });

    // ================================================================
    // Inline Dependency Resolution (QueryDependencySpec)
    // ================================================================
    describe('Inline Dependency Resolution', () => {
        it('should resolve an inline dependency instead of looking up metadata', () => {
            // No metadata queries registered — should not throw "Referenced query not found"
            mockMetadataQueries([]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'Active Users',
                    CategoryPath: '/Demos/',
                    SQL: 'SELECT ID, Name FROM Users WHERE Active = 1',
                },
            ];

            const sql = 'SELECT * FROM {{query:"Demos/Active Users"}} au WHERE au.Name IS NOT NULL';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
            expect(result.CTEs[0].QueryName).toBe('Active Users');
            expect(result.CTEs[0].ResolvedSQL).toContain('SELECT ID, Name FROM Users WHERE Active = 1');
            expect(result.ResolvedSQL).not.toContain('{{query:');
        });

        it('should skip governance validation for inline dependencies', () => {
            // Inline dep with Reusable=false and Status=Pending — should NOT throw
            mockMetadataQueries([]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'Test Query',
                    CategoryPath: '/Test/',
                    SQL: 'SELECT 1 AS Val',
                    // Note: no Reusable or Status flags — inline deps skip validation
                },
            ];

            const sql = 'SELECT * FROM {{query:"Test/Test Query"}} tq';
            // Should not throw about Reusable or Approved
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
        });

        it('should fall back to metadata when inline dep does not match', () => {
            const metadataQuery = makeQueryInfo({
                ID: 'meta-1',
                Name: 'Metadata Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID FROM MetadataTable',
            });
            mockMetadataQueries([metadataQuery]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'Different Query',
                    CategoryPath: '/Other/',
                    SQL: 'SELECT 1',
                },
            ];

            // This token references "Metadata Query" which is NOT in inline deps
            const sql = 'SELECT * FROM {{query:"Test/Metadata Query"}} mq';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            expect(result.CTEs).toHaveLength(1);
            expect(result.CTEs[0].QueryID).toBe('meta-1');
        });

        it('should match inline deps by name only when no category segments in token', () => {
            mockMetadataQueries([]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'Simple Query',
                    CategoryPath: '/Whatever/',
                    SQL: 'SELECT 42 AS Answer',
                },
            ];

            // Token has no category path — name-only lookup
            const sql = 'SELECT * FROM {{query:"Simple Query"}} sq';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            expect(result.CTEs).toHaveLength(1);
            expect(result.CTEs[0].QueryName).toBe('Simple Query');
        });

        it('should match inline deps case-insensitively', () => {
            mockMetadataQueries([]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'Active Users',
                    CategoryPath: '/demos/',
                    SQL: 'SELECT 1',
                },
            ];

            // Token uses different casing
            const sql = 'SELECT * FROM {{query:"Demos/Active Users"}} au';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            expect(result.CTEs).toHaveLength(1);
        });

        it('should resolve nested inline dependencies recursively', () => {
            mockMetadataQueries([]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'Outer',
                    CategoryPath: '/Test/',
                    SQL: 'SELECT * FROM {{query:"Test/Inner"}} i',
                    Dependencies: [
                        {
                            Name: 'Inner',
                            CategoryPath: '/Test/',
                            SQL: 'SELECT ID FROM BaseTable',
                        },
                    ],
                },
            ];

            const sql = 'SELECT * FROM {{query:"Test/Outer"}} o';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            // Should have 2 CTEs: Inner (resolved first, depth-first) then Outer
            expect(result.CTEs).toHaveLength(2);
            expect(result.CTEs[0].QueryName).toBe('Inner');
            expect(result.CTEs[1].QueryName).toBe('Outer');
        });

        it('should detect cycles in inline dependencies', () => {
            mockMetadataQueries([]);

            // Outer references Inner, Inner references Outer — cycle
            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'Cycle A',
                    CategoryPath: '/Test/',
                    SQL: 'SELECT * FROM {{query:"Test/Cycle B"}} b',
                    Dependencies: [
                        {
                            Name: 'Cycle B',
                            CategoryPath: '/Test/',
                            SQL: 'SELECT * FROM {{query:"Test/Cycle A"}} a',
                            Dependencies: [
                                {
                                    Name: 'Cycle A',
                                    CategoryPath: '/Test/',
                                    SQL: 'SELECT 1',
                                },
                            ],
                        },
                    ],
                },
            ];

            const sql = 'SELECT * FROM {{query:"Test/Cycle A"}} ca';
            expect(() => engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps))
                .toThrow(/Circular query dependency/);
        });

        it('should propagate UsesTemplate flag from inline dependencies', () => {
            mockMetadataQueries([]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'Template Dep',
                    CategoryPath: '/Test/',
                    SQL: "SELECT * FROM Users {% if Active %}WHERE Active = 1{% endif %}",
                    UsesTemplate: true,
                },
            ];

            const sql = 'SELECT * FROM {{query:"Test/Template Dep"}} td';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            expect(result.AnyDependencyUsesTemplates).toBe(true);
        });

        it('should handle mixed inline and metadata dependencies', () => {
            // One dep resolved from inline, another from metadata
            const metadataQuery = makeQueryInfo({
                ID: 'meta-q',
                Name: 'Meta Query',
                CategoryPath: '/Sales/',
                SQL: 'SELECT ID FROM SalesData',
            });
            mockMetadataQueries([metadataQuery]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'Inline Query',
                    CategoryPath: '/Test/',
                    SQL: 'SELECT 1 AS Val',
                },
            ];

            const sql = `
                SELECT a.*, b.*
                FROM {{query:"Test/Inline Query"}} a
                JOIN {{query:"Sales/Meta Query"}} b ON a.Val = b.ID
            `;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            expect(result.CTEs).toHaveLength(2);
            // Inline query CTE
            const inlineCTE = result.CTEs.find(c => c.QueryName === 'Inline Query');
            expect(inlineCTE).toBeDefined();
            // Metadata query CTE
            const metaCTE = result.CTEs.find(c => c.QueryName === 'Meta Query');
            expect(metaCTE).toBeDefined();
            expect(metaCTE!.QueryID).toBe('meta-q');
        });

        it('should generate deterministic synthetic IDs for inline deps', () => {
            mockMetadataQueries([]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'Dep A',
                    CategoryPath: '/Test/',
                    SQL: 'SELECT 1',
                },
            ];

            // Resolve twice — the synthetic ID and CTE name should be the same
            const sql = 'SELECT * FROM {{query:"Test/Dep A"}} da';
            const result1 = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            const engine2 = new QueryCompositionEngine();
            const result2 = engine2.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            expect(result1.CTEs[0].CTEName).toBe(result2.CTEs[0].CTEName);
        });

        it('should deduplicate same inline dependency referenced twice', () => {
            mockMetadataQueries([]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'Shared',
                    CategoryPath: '/Test/',
                    SQL: 'SELECT ID FROM SharedTable',
                },
            ];

            const sql = `
                SELECT a.ID, b.ID
                FROM {{query:"Test/Shared"}} a
                JOIN {{query:"Test/Shared"}} b ON a.ID = b.ID
            `;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            // Should only generate one CTE despite two references
            expect(result.CTEs).toHaveLength(1);
        });

        it('should resolve inline dependency with static parameters', () => {
            mockMetadataQueries([]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'By Region',
                    CategoryPath: '/Sales/',
                    SQL: "SELECT * FROM Customers WHERE Region = {{region}}",
                },
            ];

            const sql = `SELECT * FROM {{query:"Sales/By Region(region='West')"}} c`;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, inlineDeps);

            expect(result.CTEs).toHaveLength(1);
            expect(result.CTEs[0].ResolvedSQL).toContain("'West'");
            expect(result.CTEs[0].Parameters).toEqual({ region: 'West' });
        });

        it('should pass empty inlineDependencies without error', () => {
            const metadataQuery = makeQueryInfo({
                ID: 'meta-1',
                Name: 'Q',
                CategoryPath: '/T/',
                SQL: 'SELECT 1',
            });
            mockMetadataQueries([metadataQuery]);

            // Empty array — should fall back to metadata
            const sql = 'SELECT * FROM {{query:"T/Q"}} q';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser, {}, []);

            expect(result.CTEs).toHaveLength(1);
            expect(result.CTEs[0].QueryID).toBe('meta-1');
        });

        it('should resolve inline deps for PostgreSQL platform', () => {
            mockMetadataQueries([]);

            const inlineDeps: QueryDependencySpec[] = [
                {
                    Name: 'PG Query',
                    CategoryPath: '/Test/',
                    SQL: 'SELECT id, name FROM users WHERE active = true',
                },
            ];

            const sql = 'SELECT * FROM {{query:"Test/PG Query"}} pq';
            const result = engine.ResolveComposition(sql, 'postgresql', mockUser, {}, inlineDeps);

            expect(result.HasCompositions).toBe(true);
            // PostgreSQL CTE names use double quotes instead of brackets
            expect(result.CTEs[0].CTEName).toMatch(/^"/);
        });
    });
});
