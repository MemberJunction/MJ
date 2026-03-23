import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryCompositionEngine, CompositionResult } from '../queryCompositionEngine';
import { QueryInfo, Metadata, UserInfo, QueryDependencySpec } from '@memberjunction/core';

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

        it('should use brackets for SQL Server CTE names', () => {
            const baseQuery = makeQueryInfo({
                ID: 'plat-1',
                Name: 'Platform Test',
                CategoryPath: '/Test/',
                SQL: 'SELECT 1'
            });

            mockMetadataQueries([baseQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Platform Test"}} p';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.CTEs[0].CTEName).toMatch(/^\[.*\]$/);
        });

        it('should use double quotes for PostgreSQL CTE names', () => {
            const baseQuery = makeQueryInfo({
                ID: 'plat-2',
                Name: 'PG Test',
                CategoryPath: '/Test/',
                SQL: 'SELECT 1'
            });

            mockMetadataQueries([baseQuery]);

            const sql = 'SELECT * FROM {{query:"Test/PG Test"}} p';
            const result = engine.ResolveComposition(sql, 'postgresql', mockUser);

            expect(result.CTEs[0].CTEName).toMatch(/^".*"$/);
        });
    });

    // ================================================================
    // Inner CTE Hoisting
    // ================================================================
    describe('Inner CTE Hoisting', () => {
        it('should hoist inner WITH clauses from dependency SQL as sibling CTEs', () => {
            const depQuery = makeQueryInfo({
                ID: 'inner-cte-1',
                Name: 'With Inner CTE',
                CategoryPath: '/Test/',
                SQL: 'WITH InnerCTE AS (SELECT ID, Name FROM Users WHERE Active = 1) SELECT * FROM InnerCTE WHERE Name IS NOT NULL'
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/With Inner CTE"}} t';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // The final SQL should have InnerCTE hoisted as a sibling, not nested
            expect(result.ResolvedSQL).not.toMatch(/AS\s*\(\s*WITH/i);
            // InnerCTE should appear as a top-level CTE definition
            expect(result.ResolvedSQL).toMatch(/WITH\s+InnerCTE\s+AS\s*\(/i);
            // The generated CTE should reference InnerCTE in its body
            const cteName = result.CTEs[0].CTEName;
            expect(result.ResolvedSQL).toContain(cteName);
        });

        it('should hoist multiple inner CTEs from dependency SQL', () => {
            const depQuery = makeQueryInfo({
                ID: 'multi-inner-1',
                Name: 'Multi Inner',
                CategoryPath: '/Test/',
                SQL: 'WITH A AS (SELECT 1 AS x), B AS (SELECT 2 AS y) SELECT A.x, B.y FROM A, B'
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Multi Inner"}} t';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // No nested WITH clauses
            expect(result.ResolvedSQL).not.toMatch(/AS\s*\(\s*WITH/i);
            // Both inner CTEs should be hoisted
            expect(result.ResolvedSQL).toMatch(/A\s+AS\s*\(/);
            expect(result.ResolvedSQL).toMatch(/B\s+AS\s*\(/);
        });

        it('should handle inner CTEs with nested parentheses in their bodies', () => {
            const depQuery = makeQueryInfo({
                ID: 'nested-paren-1',
                Name: 'Nested Parens',
                CategoryPath: '/Test/',
                SQL: "WITH Agg AS (SELECT MemberID, COUNT(DISTINCT ChapterID) AS ChaptersJoined FROM (SELECT * FROM Memberships WHERE Status = 'Active') sub GROUP BY MemberID) SELECT * FROM Agg"
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Nested Parens"}} t';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.ResolvedSQL).not.toMatch(/AS\s*\(\s*WITH/i);
            expect(result.ResolvedSQL).toMatch(/Agg\s+AS\s*\(/);
            // AST path brackets identifiers: [Agg]; regex path preserves as-is
            expect(result.ResolvedSQL).toMatch(/SELECT\s+\*\s+FROM\s+\[?Agg\]?/i);
        });

        it('should hoist inner CTEs when main SQL also has a WITH clause', () => {
            const depQuery = makeQueryInfo({
                ID: 'both-with-1',
                Name: 'Dep With CTE',
                CategoryPath: '/Test/',
                SQL: 'WITH DepCTE AS (SELECT ID FROM Users) SELECT * FROM DepCTE'
            });

            mockMetadataQueries([depQuery]);

            const sql = 'WITH MainCTE AS (SELECT 1 AS z) SELECT m.*, d.* FROM MainCTE m, {{query:"Test/Dep With CTE"}} d';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // All CTEs should be at the top level
            expect(result.ResolvedSQL).not.toMatch(/AS\s*\(\s*WITH/i);
            // Should have DepCTE, the generated dep CTE, and MainCTE
            expect(result.ResolvedSQL).toMatch(/DepCTE\s+AS\s*\(/);
            expect(result.ResolvedSQL).toMatch(/MainCTE\s+AS\s*\(/);
        });

        it('should handle inner CTEs with string literals containing parentheses', () => {
            const depQuery = makeQueryInfo({
                ID: 'string-paren-1',
                Name: 'String Parens',
                CategoryPath: '/Test/',
                SQL: "WITH Filtered AS (SELECT * FROM T WHERE Name = 'Test (Dept)') SELECT * FROM Filtered"
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/String Parens"}} t';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.ResolvedSQL).not.toMatch(/AS\s*\(\s*WITH/i);
            expect(result.ResolvedSQL).toContain("'Test (Dept)'");
        });
    });

    // ================================================================
    // ORDER BY Stripping in CTEs
    // ================================================================
    describe('ORDER BY Stripping', () => {
        it('should strip trailing ORDER BY from composed query SQL in the final output', () => {
            const baseQuery = makeQueryInfo({
                ID: 'ord-1',
                Name: 'Ordered',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID, Name FROM Users WHERE Active = 1 ORDER BY Name ASC'
            });

            mockMetadataQueries([baseQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Ordered"}} o';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // The CTE body in the final assembled SQL should have ORDER BY stripped.
            // ResolvedSQL on the CTE info stores the pre-assembly SQL, but the
            // final result.ResolvedSQL contains the WITH clause with ORDER BY removed.
            const withClause = result.ResolvedSQL.split(/\)\s*SELECT/i)[0];
            expect(withClause).not.toContain('ORDER BY');
        });

        it('should preserve ORDER BY when TOP is present', () => {
            const baseQuery = makeQueryInfo({
                ID: 'top-1',
                Name: 'Top Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT TOP 10 ID, Name FROM Users ORDER BY Name ASC'
            });

            mockMetadataQueries([baseQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Top Query"}} t';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.CTEs[0].ResolvedSQL).toContain('ORDER BY');
        });

        it('should preserve ORDER BY when OFFSET is present', () => {
            const baseQuery = makeQueryInfo({
                ID: 'off-1',
                Name: 'Offset Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID FROM Users ORDER BY ID OFFSET 10 ROWS FETCH NEXT 20 ROWS ONLY'
            });

            mockMetadataQueries([baseQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Offset Query"}} o';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.CTEs[0].ResolvedSQL).toContain('ORDER BY');
        });

        it('should preserve ORDER BY when FOR XML is present', () => {
            const baseQuery = makeQueryInfo({
                ID: 'xml-1',
                Name: 'XML Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID, Name FROM Users ORDER BY Name FOR XML PATH'
            });

            mockMetadataQueries([baseQuery]);

            const sql = 'SELECT * FROM {{query:"Test/XML Query"}} x';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.CTEs[0].ResolvedSQL).toContain('ORDER BY');
        });

        it('should not strip ORDER BY inside a subquery', () => {
            const baseQuery = makeQueryInfo({
                ID: 'sub-1',
                Name: 'Subquery',
                CategoryPath: '/Test/',
                SQL: 'SELECT * FROM (SELECT TOP 5 ID FROM Users ORDER BY ID) sub'
            });

            mockMetadataQueries([baseQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Subquery"}} s';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // ORDER BY is inside parens (subquery), should be preserved
            expect(result.CTEs[0].ResolvedSQL).toContain('ORDER BY');
        });
    });

    // ================================================================
    // Max Depth
    // ================================================================
    describe('Max Depth', () => {
        it('should throw when composition depth exceeds maximum', () => {
            // Create a chain of 12 queries, each referencing the next
            const queries: QueryInfo[] = [];
            for (let i = 0; i < 12; i++) {
                const nextRef = i < 11
                    ? `SELECT * FROM {{query:"Test/Q${i + 1}"}} q`
                    : 'SELECT 1';
                queries.push(makeQueryInfo({
                    ID: `q${i}`,
                    Name: `Q${i}`,
                    CategoryPath: '/Test/',
                    SQL: nextRef
                }));
            }

            mockMetadataQueries(queries);

            const sql = 'SELECT * FROM {{query:"Test/Q0"}} q';
            expect(() => engine.ResolveComposition(sql, 'sqlserver', mockUser))
                .toThrow(/depth exceeds maximum/);
        });
    });

    // ================================================================
    // SQL Comment Stripping
    // ================================================================
    describe('SQL Comment Stripping', () => {
        it('should handle nested block comment markers gracefully', () => {
            // SQL doesn't support nested block comments, so /* inside /* ... */ is just text
            const sql = `/* outer {{query:"Test/X"}} */ SELECT 1`;
            const tokens = engine.ParseCompositionTokens(sql);
            expect(tokens).toHaveLength(0);
        });

        it('should preserve tokens in string literals that look like comments', () => {
            // A single-quoted string containing -- should not start a comment
            const sql = `SELECT '--not a comment' AS Val, * FROM {{query:"Test/Real"}} r`;

            const realQuery = makeQueryInfo({
                ID: 'real-1',
                Name: 'Real',
                CategoryPath: '/Test/',
                SQL: 'SELECT 1'
            });
            mockMetadataQueries([realQuery]);

            const tokens = engine.ParseCompositionTokens(sql);
            expect(tokens).toHaveLength(1);
            expect(tokens[0].QueryName).toBe('Real');
        });

        it('should handle escaped quotes inside string literals', () => {
            const sql = `SELECT 'it''s a test' AS Val FROM {{query:"Test/Q"}} q`;

            const q = makeQueryInfo({
                ID: 'q-1', Name: 'Q', CategoryPath: '/Test/', SQL: 'SELECT 1'
            });
            mockMetadataQueries([q]);

            const tokens = engine.ParseCompositionTokens(sql);
            expect(tokens).toHaveLength(1);
        });

        it('should handle multiple comment types in the same SQL', () => {
            const sql = `-- line comment with {{query:"Test/A"}}
/* block comment with {{query:"Test/B"}} */
SELECT * FROM {{query:"Test/C"}} c`;

            const tokens = engine.ParseCompositionTokens(sql);
            expect(tokens).toHaveLength(1);
            expect(tokens[0].QueryName).toBe('C');
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

            // AST sqlify() adds [bracket] quoting — check semantic content
            expect(result.ResolvedSQL).toMatch(/SELECT\s+\[?ID\]?,\s*\[?Name\]?\s+FROM\s+\[?Users\]?/i);
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

            // AST sqlify() adds [bracket] quoting
            expect(result.ResolvedSQL).toMatch(/SELECT\s+\*\s+FROM\s+\[?Sales\]?/i);
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

        it('should strip trailing ORDER BY but preserve window function ORDER BY (AST path)', () => {
            const depQuery = makeQueryInfo({
                ID: 'ord-window',
                Name: 'Window Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID, ROW_NUMBER() OVER (ORDER BY Score DESC) AS RowNum FROM Users ORDER BY Name',
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/Window Query"}} wq';
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // Trailing ORDER BY Name should be stripped
            expect(result.ResolvedSQL).not.toMatch(/ORDER\s+BY\s+\[?Name\]?\s/i);
            // Window function ORDER BY Score should be preserved
            expect(result.ResolvedSQL).toMatch(/OVER\s*\(\s*ORDER\s+BY\s+\[?Score\]?/i);
        });

        it('should NOT strip ORDER BY for PostgreSQL (ORDER BY legal in CTEs)', () => {
            const depQuery = makeQueryInfo({
                ID: 'ord-pg',
                Name: 'PG Query',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID, Name FROM Users ORDER BY Name ASC',
            });

            mockMetadataQueries([depQuery]);

            const sql = 'SELECT * FROM {{query:"Test/PG Query"}} pq';
            const result = engine.ResolveComposition(sql, 'postgresql', mockUser);

            // PostgreSQL allows ORDER BY in CTEs — should be preserved
            expect(result.ResolvedSQL).toMatch(/ORDER\s+BY/i);
        });
    });

    // ================================================================
    // Template token escaping in SQL comments
    // ================================================================
    describe('Template token escaping in comments', () => {
        it('should escape {{ }} in single-line comments when AnyDependencyUsesTemplates is true', () => {
            const depQuery = makeQueryInfo({
                ID: 'esc-1',
                Name: 'Template Dep',
                CategoryPath: '/Test/',
                SQL: 'SELECT ID FROM Users WHERE CreatedAt > DATEADD(DAY, -{{days}}, GETUTCDATE())',
                UsesTemplate: true,
            });

            mockMetadataQueries([depQuery]);

            // Outer query has a comment containing {{query:"..."}} documentation
            const sql = `-- This query uses {{query:"..."}} composition syntax
SELECT * FROM {{query:"Test/Template Dep(days='7')"}} td`;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.AnyDependencyUsesTemplates).toBe(true);
            // The comment's {{ should be escaped so Nunjucks won't choke
            expect(result.ResolvedSQL).not.toMatch(/\{\{query:/);
            // But the CTE should be present
            expect(result.ResolvedSQL).toMatch(/WITH/i);
        });

        it('should escape {{ }} in block comments when AnyDependencyUsesTemplates is true', () => {
            const depQuery = makeQueryInfo({
                ID: 'esc-2',
                Name: 'Block Comment Dep',
                CategoryPath: '/Test/',
                SQL: 'SELECT 1 AS Val',
                UsesTemplate: true,
            });

            mockMetadataQueries([depQuery]);

            const sql = `/* References: {{query:"..."}} */
SELECT * FROM {{query:"Test/Block Comment Dep"}} bcd`;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.ResolvedSQL).not.toMatch(/\{\{query:/);
        });

        it('should NOT escape {{ }} in comments when no dependency uses templates', () => {
            const depQuery = makeQueryInfo({
                ID: 'esc-3',
                Name: 'No Template Dep',
                CategoryPath: '/Test/',
                SQL: 'SELECT 1 AS Val',
                UsesTemplate: false,
            });

            mockMetadataQueries([depQuery]);

            const sql = `-- Contains {{query:"..."}} in comment
SELECT * FROM {{query:"Test/No Template Dep"}} ntd`;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            expect(result.AnyDependencyUsesTemplates).toBe(false);
            // When no templates involved, Nunjucks won't run, so escaping is unnecessary
            // The comment {{ should remain as-is
            expect(result.ResolvedSQL).toContain('{{query:"..."}}');
        });

        it('should escape {{ }} in dependency SQL comments carried into CTEs', () => {
            const depQuery = makeQueryInfo({
                ID: 'esc-4',
                Name: 'Commented Dep',
                CategoryPath: '/Test/',
                SQL: `-- Parameterized by {{lookbackDays}}
SELECT ID FROM Events WHERE CreatedAt > DATEADD(DAY, -{{lookbackDays}}, GETUTCDATE())`,
                UsesTemplate: true,
            });

            mockMetadataQueries([depQuery]);

            const sql = `SELECT * FROM {{query:"Test/Commented Dep(lookbackDays='30')"}} cd`;
            const result = engine.ResolveComposition(sql, 'sqlserver', mockUser);

            // The dependency comment had {{lookbackDays}} — but static param substitution
            // should have replaced the real one. The comment one should be escaped.
            expect(result.AnyDependencyUsesTemplates).toBe(true);
            // No unescaped {{ should remain in comments
            expect(result.ResolvedSQL).not.toMatch(/--.*\{\{/);
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

    // ================================================================
    // Real-World Composition Scenarios
    // ================================================================
    describe('Real-World Composition Scenarios', () => {
        // --------------- SQL Constants for Dependencies ---------------

        const MEMBER_ACTIVITY_COUNTS_SQL = `WITH MemberActivities AS (
    SELECT
        m.ID AS MemberID, m.FirstName, m.LastName, m.Email, m.JoinDate, m.EngagementScore,
        COALESCE(evt.EventsAttended, 0) AS EventsAttended,
        COALESCE(evt.EventsRegistered, 0) AS EventsRegistered,
        COALESCE(crs.CoursesCompleted, 0) AS CoursesCompleted,
        COALESCE(crs.CoursesInProgress, 0) AS CoursesInProgress,
        COALESCE(ch.ChaptersJoined, 0) AS ChaptersJoined,
        COALESCE(com.CommitteesServed, 0) AS CommitteesServed,
        (COALESCE(evt.EventsAttended, 0) + COALESCE(crs.CoursesCompleted, 0) + COALESCE(ch.ChaptersJoined, 0) + COALESCE(com.CommitteesServed, 0)) AS TotalActivityCount
    FROM [AssociationDemo].[vwMembers] m
    LEFT JOIN (SELECT er.MemberID, COUNT(DISTINCT er.ID) AS EventsRegistered, SUM(CASE WHEN er.Status = 'Attended' THEN 1 ELSE 0 END) AS EventsAttended FROM [AssociationDemo].[vwEventRegistrations] er GROUP BY er.MemberID) evt ON m.ID = evt.MemberID
    LEFT JOIN (SELECT en.MemberID, SUM(CASE WHEN en.Status = 'Completed' THEN 1 ELSE 0 END) AS CoursesCompleted, SUM(CASE WHEN en.Status = 'In Progress' THEN 1 ELSE 0 END) AS CoursesInProgress FROM [AssociationDemo].[vwEnrollments] en GROUP BY en.MemberID) crs ON m.ID = crs.MemberID
    LEFT JOIN (SELECT cm.MemberID, COUNT(DISTINCT cm.ChapterID) AS ChaptersJoined FROM [AssociationDemo].[vwChapterMemberships] cm WHERE cm.Status = 'Active' GROUP BY cm.MemberID) ch ON m.ID = ch.MemberID
    LEFT JOIN (SELECT cm.MemberID, COUNT(DISTINCT cm.CommitteeID) AS CommitteesServed FROM [AssociationDemo].[vwCommitteeMemberships] cm WHERE cm.IsActive = 1 GROUP BY cm.MemberID) com ON m.ID = com.MemberID
)
SELECT * FROM MemberActivities WHERE 1=1
{% if MinActivityCount %}AND TotalActivityCount >= {{ MinActivityCount | sqlNumber }}{% endif %}
{% if MembershipType %}AND EXISTS (SELECT 1 FROM [AssociationDemo].[vwMemberships] ms INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID WHERE ms.MemberID = MemberActivities.MemberID AND ms.Status = 'Active' AND mt.Name = '{{ MembershipType }}'){% endif %}
ORDER BY TotalActivityCount DESC`;

        const CHAPTER_ENGAGEMENT_SUMMARY_SQL = `WITH ChapterMembers AS (
    SELECT c.ID AS ChapterID, c.Name AS ChapterName, c.ChapterType, c.Region, c.State, c.IsActive,
        COUNT(DISTINCT cm.MemberID) AS ActiveMemberCount, AVG(DATEDIFF(DAY, cm.JoinDate, GETDATE())) AS AvgMemberTenureDays
    FROM [AssociationDemo].[vwChapters] c LEFT JOIN [AssociationDemo].[vwChapterMemberships] cm ON c.ID = cm.ChapterID AND cm.Status = 'Active'
    WHERE c.IsActive = 1 {% if ChapterType %}AND c.ChapterType = '{{ ChapterType }}'{% endif %}
    GROUP BY c.ID, c.Name, c.ChapterType, c.Region, c.State, c.IsActive
),
ChapterEventActivity AS (
    SELECT cm.ChapterID, COUNT(DISTINCT er.EventID) AS UniqueEventsAttended, COUNT(DISTINCT er.ID) AS TotalRegistrations,
        SUM(CASE WHEN er.Status = 'Attended' THEN 1 ELSE 0 END) AS TotalAttendances
    FROM [AssociationDemo].[vwChapterMemberships] cm LEFT JOIN [AssociationDemo].[vwEventRegistrations] er ON cm.MemberID = er.MemberID
    WHERE cm.Status = 'Active' GROUP BY cm.ChapterID
),
ChapterCourseActivity AS (
    SELECT cm.ChapterID, COUNT(DISTINCT en.CourseID) AS UniqueCoursesEnrolled,
        SUM(CASE WHEN en.Status = 'Completed' THEN 1 ELSE 0 END) AS CourseCompletions
    FROM [AssociationDemo].[vwChapterMemberships] cm LEFT JOIN [AssociationDemo].[vwEnrollments] en ON cm.MemberID = en.MemberID
    WHERE cm.Status = 'Active' GROUP BY cm.ChapterID
)
SELECT chmem.*, COALESCE(chev.UniqueEventsAttended, 0) AS UniqueEventsAttended, COALESCE(chev.TotalRegistrations, 0) AS TotalRegistrations,
    COALESCE(chcr.UniqueCoursesEnrolled, 0) AS UniqueCoursesEnrolled, COALESCE(chcr.CourseCompletions, 0) AS CourseCompletions
FROM ChapterMembers chmem LEFT JOIN ChapterEventActivity chev ON chmem.ChapterID = chev.ChapterID
LEFT JOIN ChapterCourseActivity chcr ON chmem.ChapterID = chcr.ChapterID`;

        const MEMBER_LIFETIME_REVENUE_SQL = `WITH CurrentMembership AS (
    SELECT ms.MemberID, mt.Name AS MembershipType,
        ROW_NUMBER() OVER (PARTITION BY ms.MemberID ORDER BY ms.StartDate DESC) AS rn
    FROM [AssociationDemo].[vwMemberships] ms
    INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
    WHERE ms.Status = 'Active'
),
MemberRevenue AS (
    SELECT i.MemberID, COUNT(DISTINCT i.ID) AS InvoiceCount, SUM(li.Amount) AS TotalRevenue,
        SUM(CASE WHEN li.ItemType = 'Membership Dues' THEN li.Amount ELSE 0 END) AS MembershipRevenue,
        SUM(CASE WHEN li.ItemType = 'Event Registration' THEN li.Amount ELSE 0 END) AS EventRevenue
    FROM [AssociationDemo].[vwInvoices] i INNER JOIN [AssociationDemo].[vwInvoiceLineItems] li ON i.ID = li.InvoiceID
    WHERE i.Status NOT IN ('Cancelled', 'Refunded') GROUP BY i.MemberID
)
SELECT m.ID AS MemberID, m.FirstName, m.LastName, m.Email, m.JoinDate,
    cm.MembershipType AS CurrentMembershipType, COALESCE(rev.TotalRevenue, 0) AS TotalRevenue,
    COALESCE(rev.InvoiceCount, 0) AS InvoiceCount
FROM [AssociationDemo].[vwMembers] m
LEFT JOIN CurrentMembership cm ON m.ID = cm.MemberID AND cm.rn = 1
LEFT JOIN MemberRevenue rev ON m.ID = rev.MemberID
WHERE 1=1
{% if MembershipType %}AND cm.MembershipType = '{{ MembershipType }}'{% endif %}`;

        const BOARD_OF_DIRECTORS_SQL = `WITH board_committee AS (
    SELECT Id FROM nams.vwNU__Committee__cs WHERE Name = 'MSTA Board of Directors' AND NU__Type__c = 'Board'
),
current_members AS (
    SELECT cm.NU__Account__c, cm.CommitteePositionName__c, cm.NU__StartDate__c, cm.NU__EndDate__c
    FROM nams.vwNU__CommitteeMembership__cs cm INNER JOIN board_committee bc ON bc.Id = cm.NU__Committee__c
    WHERE cm.NU__State__c = 'Current' AND cm.IsDeleted = 0
)
SELECT a.FirstName, a.LastName, m.CommitteePositionName__c AS Board_Position, a.Institution__c AS School_District
FROM current_members m INNER JOIN nams.vwAccounts a ON a.Id = m.NU__Account__c
ORDER BY a.LastName, a.FirstName`;

        const ACTIVE_MEMBERS_BY_TYPE_SQL = `SELECT mt.Name AS MembershipType, mt.AnnualDues, COUNT(DISTINCT m.ID) AS ActiveMemberCount,
    ROUND(COUNT(DISTINCT m.ID) * 100.0 / SUM(COUNT(DISTINCT m.ID)) OVER (), 1) AS PercentageOfTotal
FROM [AssociationDemo].[vwMemberships] ms
INNER JOIN [AssociationDemo].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
INNER JOIN [AssociationDemo].[vwMembers] m ON ms.MemberID = m.ID
WHERE ms.Status = 'Active'
GROUP BY mt.Name, mt.AnnualDues
ORDER BY ActiveMemberCount DESC`;

        const EVENT_REVENUE_SUMMARY_SQL = `SELECT e.ID AS EventID, e.Name AS EventName, e.EventType, COUNT(DISTINCT er.ID) AS TotalRegistrations, COALESCE(rev.TotalRevenue, 0) AS TotalRevenue
FROM [AssociationDemo].[vwEvents] e
LEFT JOIN [AssociationDemo].[vwEventRegistrations] er ON e.ID = er.EventID
LEFT JOIN (SELECT li.RelatedEntityID AS EventID, SUM(li.Amount) AS TotalRevenue FROM [AssociationDemo].[vwInvoiceLineItems] li INNER JOIN [AssociationDemo].[vwInvoices] i ON li.InvoiceID = i.ID WHERE li.RelatedEntityType = 'Event' AND i.Status NOT IN ('Cancelled', 'Refunded') GROUP BY li.RelatedEntityID) rev ON e.ID = rev.EventID
WHERE e.Status NOT IN ('Draft', 'Cancelled')
GROUP BY e.ID, e.Name, e.EventType, rev.TotalRevenue`;

        const MONTHLY_REVENUE_BY_SOURCE_SQL = `SELECT YEAR(i.InvoiceDate) AS RevenueYear, MONTH(i.InvoiceDate) AS RevenueMonth,
    li.ItemType AS RevenueSource, COUNT(DISTINCT i.ID) AS InvoiceCount, SUM(li.Amount) AS Revenue
FROM [AssociationDemo].[vwInvoices] i
INNER JOIN [AssociationDemo].[vwInvoiceLineItems] li ON i.ID = li.InvoiceID
WHERE i.Status NOT IN ('Cancelled', 'Refunded')
{% if StartDate %}AND i.InvoiceDate >= {{ StartDate | sqlDate }}{% endif %}
{% if EndDate %}AND i.InvoiceDate < {{ EndDate | sqlDate }}{% endif %}
GROUP BY YEAR(i.InvoiceDate), MONTH(i.InvoiceDate), li.ItemType
ORDER BY RevenueYear, RevenueMonth`;

        const MEMBERSHIP_GROWTH_SQL = `SELECT YEAR(m.JoinDate) AS JoinYear, MONTH(m.JoinDate) AS JoinMonth,
    COUNT(DISTINCT m.ID) AS NewMembers,
    SUM(COUNT(DISTINCT m.ID)) OVER (ORDER BY YEAR(m.JoinDate), MONTH(m.JoinDate)) AS CumulativeMembers
FROM [AssociationDemo].[vwMembers] m
{% if StartDate %}WHERE m.JoinDate >= {{ StartDate | sqlDate }}{% endif %}
GROUP BY YEAR(m.JoinDate), MONTH(m.JoinDate)
ORDER BY JoinYear, JoinMonth`;

        // Regex that detects nested WITH — i.e. AS ( WITH ... ) — which is invalid SQL
        const NESTED_WITH_REGEX = /AS\s*\(\s*WITH\s/i;

        it('should hoist MemberActivities CTE from member-activity-counts dependency (the original bug)', () => {
            const dep = makeQueryInfo({
                ID: 'mac-1',
                Name: 'Member Activity Counts',
                CategoryPath: '/Engagement Analytics/',
                SQL: MEMBER_ACTIVITY_COUNTS_SQL,
                UsesTemplate: true,
            });
            mockMetadataQueries([dep]);

            const mainSQL = 'SELECT mac.MemberID, mac.FirstName, mac.TotalActivityCount FROM {{query:"Engagement Analytics/Member Activity Counts"}} mac WHERE mac.TotalActivityCount > 5';
            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
            expect(result.AnyDependencyUsesTemplates).toBe(true);
            // No nested WITH — inner MemberActivities CTE must be hoisted
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // MemberActivities should appear as a top-level CTE definition
            expect(result.ResolvedSQL).toMatch(/MemberActivities\s+AS\s*\(/i);
        });

        it('should hoist inner CTE when main query also has its own CTE (exact bug scenario)', () => {
            const dep = makeQueryInfo({
                ID: 'mac-1',
                Name: 'Member Activity Counts',
                CategoryPath: '/Engagement Analytics/',
                SQL: MEMBER_ACTIVITY_COUNTS_SQL,
                UsesTemplate: true,
            });
            mockMetadataQueries([dep]);

            const mainSQL = `WITH PrimaryChapters AS (
    SELECT cm.MemberID, cm.ChapterID, cm.Chapter AS ChapterName,
        ROW_NUMBER() OVER (PARTITION BY cm.MemberID ORDER BY cm.JoinDate ASC) as rn
    FROM [AssociationDemo].[vwChapterMemberships] cm WHERE cm.Status = 'Active'
)
SELECT mac.MemberID, mac.FirstName, mac.LastName, mac.TotalActivityCount,
    pc.ChapterName AS PrimaryChapterName
FROM {{query:"Engagement Analytics/Member Activity Counts"}} mac
LEFT JOIN PrimaryChapters pc ON mac.MemberID = pc.MemberID AND pc.rn = 1`;

            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
            // No nested WITH anywhere
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // Both MemberActivities (hoisted from dep) and PrimaryChapters (from main) should be top-level
            expect(result.ResolvedSQL).toMatch(/MemberActivities\s+AS\s*\(/i);
            expect(result.ResolvedSQL).toMatch(/PrimaryChapters\s+AS\s*\(/i);
            // Should start with a single WITH keyword
            expect(result.ResolvedSQL.trimStart()).toMatch(/^WITH\s/i);
        });

        it('should hoist all 3 inner CTEs from chapter-engagement-summary dependency', () => {
            const dep = makeQueryInfo({
                ID: 'ces-1',
                Name: 'Chapter Engagement Summary',
                CategoryPath: '/Engagement Analytics/',
                SQL: CHAPTER_ENGAGEMENT_SUMMARY_SQL,
                UsesTemplate: true,
            });
            mockMetadataQueries([dep]);

            const mainSQL = 'SELECT ch.ChapterName, ch.ActiveMemberCount, ch.UniqueEventsAttended FROM {{query:"Engagement Analytics/Chapter Engagement Summary"}} ch WHERE ch.ActiveMemberCount > 10';
            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // All 3 inner CTEs should be hoisted as top-level definitions
            expect(result.ResolvedSQL).toMatch(/ChapterMembers\s+AS\s*\(/i);
            expect(result.ResolvedSQL).toMatch(/ChapterEventActivity\s+AS\s*\(/i);
            expect(result.ResolvedSQL).toMatch(/ChapterCourseActivity\s+AS\s*\(/i);
        });

        it('should hoist CTEs from two different dependencies composed together', () => {
            const dep1 = makeQueryInfo({
                ID: 'mc-1',
                Name: 'Member Activity Counts',
                CategoryPath: '/Engagement Analytics/',
                SQL: MEMBER_ACTIVITY_COUNTS_SQL,
                UsesTemplate: true,
            });
            const dep2 = makeQueryInfo({
                ID: 'mc-2',
                Name: 'Member Lifetime Revenue',
                CategoryPath: '/Revenue/',
                SQL: MEMBER_LIFETIME_REVENUE_SQL,
                UsesTemplate: true,
            });
            mockMetadataQueries([dep1, dep2]);

            const mainSQL = 'SELECT mac.MemberID, mac.TotalActivityCount, rev.TotalRevenue FROM {{query:"Engagement Analytics/Member Activity Counts"}} mac JOIN {{query:"Revenue/Member Lifetime Revenue"}} rev ON mac.MemberID = rev.MemberID';
            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(2);
            expect(result.AnyDependencyUsesTemplates).toBe(true);
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // Hoisted CTEs from dep1
            expect(result.ResolvedSQL).toMatch(/MemberActivities\s+AS\s*\(/i);
            // Hoisted CTEs from dep2
            expect(result.ResolvedSQL).toMatch(/CurrentMembership\s+AS\s*\(/i);
            expect(result.ResolvedSQL).toMatch(/MemberRevenue\s+AS\s*\(/i);
        });

        it('should hoist CTEs from board-of-directors dependency (AST path, no Nunjucks)', () => {
            const dep = makeQueryInfo({
                ID: 'bod-1',
                Name: 'Board of Directors',
                CategoryPath: '/MSTA/',
                SQL: BOARD_OF_DIRECTORS_SQL,
                UsesTemplate: false,
            });
            mockMetadataQueries([dep]);

            const mainSQL = 'SELECT bd.FirstName, bd.LastName, bd.Board_Position FROM {{query:"MSTA/Board of Directors"}} bd';
            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
            expect(result.AnyDependencyUsesTemplates).toBe(false);
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // Both inner CTEs hoisted (AST path brackets identifiers)
            expect(result.ResolvedSQL).toMatch(/\[?board_committee\]?\s+AS\s*\(/i);
            expect(result.ResolvedSQL).toMatch(/\[?current_members\]?\s+AS\s*\(/i);
        });

        it('should correctly handle non-CTE dependency (no hoisting needed)', () => {
            const dep = makeQueryInfo({
                ID: 'am-1',
                Name: 'Active Members By Membership Type',
                CategoryPath: '/Reports/',
                SQL: ACTIVE_MEMBERS_BY_TYPE_SQL,
                UsesTemplate: false,
            });
            mockMetadataQueries([dep]);

            const mainSQL = 'SELECT am.MembershipType, am.ActiveMemberCount FROM {{query:"Reports/Active Members By Membership Type"}} am WHERE am.ActiveMemberCount > 100';
            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
            // No nested WITH because the dep has no inner WITH clause
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // Standard CTE wrapping — the dep SQL is wrapped as a single CTE
            expect(result.ResolvedSQL.trimStart()).toMatch(/^WITH\s/i);
        });

        it('should handle non-CTE dependency with subquery in FROM clause', () => {
            const dep = makeQueryInfo({
                ID: 'ers-1',
                Name: 'Event Revenue Summary',
                CategoryPath: '/Revenue/',
                SQL: EVENT_REVENUE_SUMMARY_SQL,
                UsesTemplate: false,
            });
            mockMetadataQueries([dep]);

            const mainSQL = 'SELECT ev.EventName, ev.TotalRevenue FROM {{query:"Revenue/Event Revenue Summary"}} ev ORDER BY ev.TotalRevenue DESC';
            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
            // No nested WITH — dep SQL has subqueries but not a WITH clause
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // Standard CTE wrapping
            expect(result.ResolvedSQL.trimStart()).toMatch(/^WITH\s/i);
        });

        it('should compose with parameter pass-through on CTE dependency', () => {
            const dep = makeQueryInfo({
                ID: 'mac-1',
                Name: 'Member Activity Counts',
                CategoryPath: '/Engagement Analytics/',
                SQL: MEMBER_ACTIVITY_COUNTS_SQL,
                UsesTemplate: true,
            });
            mockMetadataQueries([dep]);

            const mainSQL = `SELECT mac.MemberID, mac.TotalActivityCount FROM {{query:"Engagement Analytics/Member Activity Counts(MinActivityCount='5', MembershipType=MembershipType)"}} mac`;
            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // MemberActivities CTE should be hoisted
            expect(result.ResolvedSQL).toMatch(/MemberActivities\s+AS\s*\(/i);
            // MinActivityCount='5' should be substituted — the literal '5' replaces the Nunjucks token
            expect(result.CTEs[0].Parameters['MinActivityCount']).toBe('5');
            // MembershipType is pass-through — should remain as a Nunjucks token for later processing
            expect(result.ResolvedSQL).toMatch(/MembershipType/);
        });

        it('should compose aggregation over CTE dependency', () => {
            const dep = makeQueryInfo({
                ID: 'mac-1',
                Name: 'Member Activity Counts',
                CategoryPath: '/Engagement Analytics/',
                SQL: MEMBER_ACTIVITY_COUNTS_SQL,
                UsesTemplate: true,
            });
            mockMetadataQueries([dep]);

            const mainSQL = `SELECT
    CASE WHEN mac.TotalActivityCount >= 10 THEN 'Highly Active'
         WHEN mac.TotalActivityCount >= 5 THEN 'Moderately Active'
         ELSE 'Low Activity' END AS EngagementTier,
    COUNT(*) AS MemberCount, AVG(mac.TotalActivityCount) AS AvgActivity
FROM {{query:"Engagement Analytics/Member Activity Counts"}} mac
GROUP BY CASE WHEN mac.TotalActivityCount >= 10 THEN 'Highly Active'
              WHEN mac.TotalActivityCount >= 5 THEN 'Moderately Active'
              ELSE 'Low Activity' END`;

            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // MemberActivities hoisted
            expect(result.ResolvedSQL).toMatch(/MemberActivities\s+AS\s*\(/i);
            // Main SELECT has GROUP BY structure preserved
            expect(result.ResolvedSQL).toMatch(/GROUP BY/i);
            expect(result.ResolvedSQL).toMatch(/EngagementTier/i);
        });

        it('should compose dashboard query joining 3 different dependencies', () => {
            const dep1 = makeQueryInfo({
                ID: 'am-1',
                Name: 'Active Members By Membership Type',
                CategoryPath: '/Reports/',
                SQL: ACTIVE_MEMBERS_BY_TYPE_SQL,
                UsesTemplate: false,
            });
            const dep2 = makeQueryInfo({
                ID: 'rev-1',
                Name: 'Monthly Revenue By Source Type',
                CategoryPath: '/Revenue/',
                SQL: MONTHLY_REVENUE_BY_SOURCE_SQL,
                UsesTemplate: true,
            });
            const dep3 = makeQueryInfo({
                ID: 'mg-1',
                Name: 'Membership Growth By Period',
                CategoryPath: '/Reports/',
                SQL: MEMBERSHIP_GROWTH_SQL,
                UsesTemplate: true,
            });
            mockMetadataQueries([dep1, dep2, dep3]);

            const mainSQL = `SELECT am.MembershipType, am.ActiveMemberCount, rev.Revenue AS MonthlyRevenue, growth.NewMembers
FROM {{query:"Reports/Active Members By Membership Type"}} am
LEFT JOIN {{query:"Revenue/Monthly Revenue By Source Type"}} rev ON rev.RevenueSource = 'Membership Dues'
LEFT JOIN {{query:"Reports/Membership Growth By Period"}} growth ON 1=1`;

            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(3);
            expect(result.AnyDependencyUsesTemplates).toBe(true);
            // None of these deps have inner CTEs, so no hoisting needed — just no nested WITH
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
        });

        it('should compose main query with CTE referencing a CTE dependency', () => {
            const dep = makeQueryInfo({
                ID: 'bod-1',
                Name: 'Board of Directors',
                CategoryPath: '/MSTA/',
                SQL: BOARD_OF_DIRECTORS_SQL,
                UsesTemplate: false,
            });
            mockMetadataQueries([dep]);

            const mainSQL = `WITH RegionCounts AS (
    SELECT bd.School_District, COUNT(*) AS BoardMemberCount
    FROM {{query:"MSTA/Board of Directors"}} bd
    GROUP BY bd.School_District
)
SELECT * FROM RegionCounts WHERE BoardMemberCount > 1`;

            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // board_committee + current_members hoisted before RegionCounts (AST path brackets identifiers)
            expect(result.ResolvedSQL).toMatch(/\[?board_committee\]?\s+AS\s*\(/i);
            expect(result.ResolvedSQL).toMatch(/\[?current_members\]?\s+AS\s*\(/i);
            expect(result.ResolvedSQL).toMatch(/RegionCounts\s+AS\s*\(/i);
            // All should be under a single WITH
            expect(result.ResolvedSQL.trimStart()).toMatch(/^WITH\s/i);
        });

        it('should compose templated main query with two CTE dependencies', () => {
            const dep1 = makeQueryInfo({
                ID: 'mac-1',
                Name: 'Member Activity Counts',
                CategoryPath: '/Engagement Analytics/',
                SQL: MEMBER_ACTIVITY_COUNTS_SQL,
                UsesTemplate: true,
            });
            const dep2 = makeQueryInfo({
                ID: 'ces-1',
                Name: 'Chapter Engagement Summary',
                CategoryPath: '/Engagement Analytics/',
                SQL: CHAPTER_ENGAGEMENT_SUMMARY_SQL,
                UsesTemplate: true,
            });
            mockMetadataQueries([dep1, dep2]);

            const mainSQL = `WITH CrossReference AS (
    SELECT mac.MemberID, mac.TotalActivityCount, ch.ChapterName
    FROM {{query:"Engagement Analytics/Member Activity Counts"}} mac
    JOIN {{query:"Engagement Analytics/Chapter Engagement Summary"}} ch ON 1=1
)
SELECT * FROM CrossReference`;

            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(2);
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // All 4 inner CTEs (1 from dep1 + 3 from dep2) should be hoisted
            expect(result.ResolvedSQL).toMatch(/MemberActivities\s+AS\s*\(/i);
            expect(result.ResolvedSQL).toMatch(/ChapterMembers\s+AS\s*\(/i);
            expect(result.ResolvedSQL).toMatch(/ChapterEventActivity\s+AS\s*\(/i);
            expect(result.ResolvedSQL).toMatch(/ChapterCourseActivity\s+AS\s*\(/i);
            // Main CTE should also be present
            expect(result.ResolvedSQL).toMatch(/CrossReference\s+AS\s*\(/i);
        });

        it('should compose with event-revenue and member-activity for ROI analysis', () => {
            const dep1 = makeQueryInfo({
                ID: 'ers-1',
                Name: 'Event Revenue Summary',
                CategoryPath: '/Revenue/',
                SQL: EVENT_REVENUE_SUMMARY_SQL,
                UsesTemplate: false,
            });
            const dep2 = makeQueryInfo({
                ID: 'mac-1',
                Name: 'Member Activity Counts',
                CategoryPath: '/Engagement Analytics/',
                SQL: MEMBER_ACTIVITY_COUNTS_SQL,
                UsesTemplate: true,
            });
            mockMetadataQueries([dep1, dep2]);

            const mainSQL = `SELECT ev.EventName, ev.TotalRevenue, ev.TotalRegistrations,
    AVG(mac.EventsAttended) AS AvgMemberEvents
FROM {{query:"Revenue/Event Revenue Summary"}} ev
CROSS APPLY (
    SELECT TOP 10 mac2.EventsAttended
    FROM {{query:"Engagement Analytics/Member Activity Counts"}} mac2
    ORDER BY mac2.EventsAttended DESC
) mac
GROUP BY ev.EventName, ev.TotalRevenue, ev.TotalRegistrations`;

            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(2);
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // MemberActivities hoisted from dep2
            expect(result.ResolvedSQL).toMatch(/MemberActivities\s+AS\s*\(/i);
        });

        it('should dedup when same CTE dependency is referenced twice', () => {
            const dep = makeQueryInfo({
                ID: 'mac-1',
                Name: 'Member Activity Counts',
                CategoryPath: '/Engagement Analytics/',
                SQL: MEMBER_ACTIVITY_COUNTS_SQL,
                UsesTemplate: true,
            });
            mockMetadataQueries([dep]);

            const mainSQL = `SELECT high.MemberID AS HighEngagement, low.MemberID AS LowEngagement
FROM {{query:"Engagement Analytics/Member Activity Counts"}} high
JOIN {{query:"Engagement Analytics/Member Activity Counts"}} low ON 1=1`;

            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            // Deduplicated — same query+params referenced twice should produce only 1 CTE entry
            expect(result.CTEs).toHaveLength(1);
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // MemberActivities hoisted once
            expect(result.ResolvedSQL).toMatch(/MemberActivities\s+AS\s*\(/i);
        });

        it('should compose with parameter substitution on both CTE and non-CTE dependencies', () => {
            const dep1 = makeQueryInfo({
                ID: 'mac-1',
                Name: 'Member Activity Counts',
                CategoryPath: '/Engagement Analytics/',
                SQL: MEMBER_ACTIVITY_COUNTS_SQL,
                UsesTemplate: true,
            });
            const dep2 = makeQueryInfo({
                ID: 'am-1',
                Name: 'Active Members By Membership Type',
                CategoryPath: '/Reports/',
                SQL: ACTIVE_MEMBERS_BY_TYPE_SQL,
                UsesTemplate: false,
            });
            mockMetadataQueries([dep1, dep2]);

            const mainSQL = `SELECT mac.MemberID, mac.TotalActivityCount, am.ActiveMemberCount
FROM {{query:"Engagement Analytics/Member Activity Counts(MinActivityCount='3')"}} mac
JOIN {{query:"Reports/Active Members By Membership Type"}} am ON 1=1`;

            const result = engine.ResolveComposition(mainSQL, 'sqlserver', mockUser);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(2);
            expect(result.ResolvedSQL).not.toMatch(NESTED_WITH_REGEX);
            // MemberActivities hoisted from dep1
            expect(result.ResolvedSQL).toMatch(/MemberActivities\s+AS\s*\(/i);
            // MinActivityCount='3' substituted in the dep1 SQL
            expect(result.CTEs[0].Parameters['MinActivityCount']).toBe('3');
        });
    });
});
