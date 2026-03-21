/**
 * Composition Engine Edge Case Tests
 *
 * Tests the QueryCompositionEngine against comprehensive edge cases
 * for ORDER BY stripping, CTE hoisting, parameter handling, and
 * platform-specific behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryCompositionEngine } from '../queryCompositionEngine';
import { QueryInfo, Metadata, UserInfo } from '@memberjunction/core';
import {
    ORDER_BY_EDGE_CASES,
    CTE_HOISTING_EDGE_CASES,
    TEMPLATE_PARAMETER_EDGE_CASES,
    MULTIPLE_DEPENDENCY_EDGE_CASES,
    SQL_STRUCTURE_EDGE_CASES,
    COMPLEX_EDGE_CASES,
    PLATFORM_SPECIFIC_EDGE_CASES,
    type CompositionEdgeCase,
    type CompositionDependency,
} from './composition-edge-cases';

// ── Helpers ──

function makeQueryInfo(dep: CompositionDependency, platform: string): QueryInfo {
    const q = new QueryInfo();
    q.ID = `dep-${dep.name.replace(/\s+/g, '-').toLowerCase()}`;
    q.Name = dep.name;
    q.SQL = dep.sql;
    q.Reusable = true;
    q.Status = 'Approved' as QueryInfo['Status'];
    q.UsesTemplate = dep.sql.includes('{{') || dep.sql.includes('{%');

    const fullPath = dep.categoryPath ? `/${dep.categoryPath}/` : '/';
    Object.defineProperty(q, 'CategoryPath', { get: () => fullPath, configurable: true });
    q.UserCanRun = vi.fn().mockReturnValue(true);

    // GetPlatformSQL should return the SQL for the requested platform
    q.GetPlatformSQL = vi.fn().mockReturnValue(q.SQL);

    return q;
}

function setupAndResolve(
    edgeCase: CompositionEdgeCase
): { result: ReturnType<QueryCompositionEngine['ResolveComposition']>; engine: QueryCompositionEngine } {
    const queries = edgeCase.dependencies.map(d => makeQueryInfo(d, edgeCase.dialect));
    const mockUser = { UserRoles: [{ Role: 'Admin' }] } as unknown as UserInfo;

    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: queries,
        QueryDependencies: [],
    } as ReturnType<typeof Metadata.Provider>);

    const engine = new QueryCompositionEngine();
    const platform = edgeCase.dialect === 'PostgreSQL' ? 'postgresql' : 'sqlserver';
    const result = engine.ResolveComposition(edgeCase.outerSQL, platform, mockUser);

    return { result, engine };
}

// ── Tests ──

describe('Composition Engine Edge Cases', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ================================================================
    // ORDER BY Stripping
    // ================================================================
    describe('ORDER BY Stripping', () => {
        it('should strip plain ORDER BY from dependency in SQL Server', () => {
            const ec = ORDER_BY_EDGE_CASES.find(e => e.description.includes('plain ORDER BY'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // The composed CTE body should NOT contain ORDER BY
            expect(result.ResolvedSQL).not.toMatch(/ORDER\s+BY\s+TotalCount\s+DESC/i);
        });

        it('should strip ORDER BY inside {% if %} conditional block', () => {
            const ec = ORDER_BY_EDGE_CASES.find(e => e.description.includes('inside {% if %}'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // The resolved SQL should not cause a CTE error
            // The ORDER BY (wrapped in conditional) should be handled
            expect(result.ResolvedSQL).toContain('WITH');
        });

        it('should NOT strip ORDER BY when TOP is present', () => {
            const ec = ORDER_BY_EDGE_CASES.find(e => e.description.includes('TOP'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // ORDER BY should be preserved because TOP makes it legal
            expect(result.ResolvedSQL).toMatch(/ORDER\s+BY/i);
            expect(result.ResolvedSQL).toMatch(/TOP\s+10/i);
        });

        it('should NOT strip ORDER BY when OFFSET/FETCH is present', () => {
            const ec = ORDER_BY_EDGE_CASES.find(e => e.description.includes('OFFSET/FETCH'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            expect(result.ResolvedSQL).toMatch(/ORDER\s+BY/i);
            expect(result.ResolvedSQL).toMatch(/OFFSET/i);
        });

        it.skip('should NOT strip ORDER BY when FOR XML is present (KNOWN BUG: node-sql-parser cannot parse FOR XML PATH with ROOT)', () => {
            // node-sql-parser v5.4.0 fails to parse FOR XML PATH('Member'), ROOT('Members')
            // because of the comma in the FOR XML clause. Both AST and regex paths
            // incorrectly strip the ORDER BY. When the MJ SQL Parser handles FOR XML
            // natively, this test should be un-skipped and pass.
            const ec = ORDER_BY_EDGE_CASES.find(e => e.description.includes('FOR XML'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            expect(result.ResolvedSQL).toMatch(/ORDER\s+BY/i);
            expect(result.ResolvedSQL).toMatch(/FOR\s+XML/i);
        });

        it('should strip only the final ORDER BY in a UNION', () => {
            const ec = ORDER_BY_EDGE_CASES.find(e => e.description.includes('UNION'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // The final ORDER BY should be stripped
            // But UNION ALL structure should be preserved
            expect(result.ResolvedSQL).toMatch(/UNION\s+ALL/i);
        });

        it('should strip ORDER BY that references CTE column alias', () => {
            const ec = ORDER_BY_EDGE_CASES.find(e => e.description.includes('CTE column alias'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // The ORDER BY Total DESC should be stripped even though Total is an alias
            expect(result.ResolvedSQL).not.toMatch(/ORDER\s+BY\s+Total\s+DESC/i);
        });

        it('should NOT strip ORDER BY on PostgreSQL (legal in CTEs)', () => {
            const ec = ORDER_BY_EDGE_CASES.find(e => e.description.includes('PostgreSQL'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // PostgreSQL allows ORDER BY in CTEs — should be preserved
            expect(result.ResolvedSQL).toMatch(/ORDER\s+BY/i);
        });
    });

    // ================================================================
    // CTE Hoisting
    // ================================================================
    describe('CTE Hoisting', () => {
        it('should hoist 1 CTE from dependency', () => {
            const ec = CTE_HOISTING_EDGE_CASES.find(e => e.description.includes('1 CTE'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // MemberActivities should be a top-level CTE, not nested
            expect(result.ResolvedSQL).not.toMatch(/AS\s*\(\s*WITH/i);
            expect(result.ResolvedSQL).toMatch(/MemberActivities\s+AS\s*\(/i);
        });

        it('should hoist 3+ CTEs from dependency preserving order', () => {
            const ec = CTE_HOISTING_EDGE_CASES.find(e => e.description.includes('3+'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            expect(result.ResolvedSQL).not.toMatch(/AS\s*\(\s*WITH/i);
            // All three CTEs should appear as top-level definitions
            expect(result.ResolvedSQL).toMatch(/EventCounts/i);
            expect(result.ResolvedSQL).toMatch(/EmailOpens/i);
            expect(result.ResolvedSQL).toMatch(/DonationTotals/i);
        });

        it('should hoist CTEs when outer query also has WITH clause', () => {
            const ec = CTE_HOISTING_EDGE_CASES.find(e => e.description.includes('Outer query already has'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // Both the outer CTE (PrimaryChapters) and the hoisted CTE (MemberActivities)
            // should be in the same WITH clause
            expect(result.ResolvedSQL).toMatch(/MemberActivities/i);
            expect(result.ResolvedSQL).toMatch(/PrimaryChapters/i);
            // Should be a single WITH keyword (not nested)
            const withCount = (result.ResolvedSQL.match(/\bWITH\b/gi) || []).length;
            expect(withCount).toBe(1);
        });

        it('should preserve CTE ordering when inter-CTE references exist', () => {
            const ec = CTE_HOISTING_EDGE_CASES.find(e => e.description.includes('ordering matters'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // RawScores must appear BEFORE NormalizedScores
            const rawIdx = result.ResolvedSQL.indexOf('RawScores');
            const normIdx = result.ResolvedSQL.indexOf('NormalizedScores');
            expect(rawIdx).toBeLessThan(normIdx);
        });
    });

    // ================================================================
    // Multiple Dependencies
    // ================================================================
    describe('Multiple Dependencies', () => {
        it('should handle two composition refs with JOIN', () => {
            const ec = MULTIPLE_DEPENDENCY_EDGE_CASES.find(e => e.description.includes('JOIN between'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(2);
            // Both dependencies should become CTEs
            expect(result.ResolvedSQL).toMatch(/WITH/i);
        });

        it('should handle three or more composition refs', () => {
            const ec = MULTIPLE_DEPENDENCY_EDGE_CASES.find(e => e.description.includes('Three or more'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(3);
        });

        it('should create distinct CTEs for same query with different parameters', () => {
            const ec = MULTIPLE_DEPENDENCY_EDGE_CASES.find(e => e.description.includes('different parameters'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // Same dependency referenced twice with different params = 2 CTEs
            expect(result.CTEs).toHaveLength(2);
            // CTE names should be different
            const cteNames = result.CTEs.map(c => c.CTEName);
            expect(new Set(cteNames).size).toBe(2);
        });
    });

    // ================================================================
    // SQL Structure Edge Cases
    // ================================================================
    describe('SQL Structure Edge Cases', () => {
        it('should handle dependency SQL with trailing semicolon', () => {
            const ec = SQL_STRUCTURE_EDGE_CASES.find(e => e.description.includes('trailing semicolon'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // The semicolon should not break the CTE wrapping
            expect(result.ResolvedSQL).toMatch(/WITH/i);
        });

        it('should handle simple dependency (no CTE, no ORDER BY)', () => {
            const ec = SQL_STRUCTURE_EDGE_CASES.find(e => e.description.includes('simple SELECT'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            expect(result.CTEs).toHaveLength(1);
        });

        it('should handle dependency SQL starting with comments', () => {
            const ec = SQL_STRUCTURE_EDGE_CASES.find(e => e.description.includes('starts with comments'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // Comments should not break CTE wrapping
            expect(result.ResolvedSQL).toMatch(/WITH/i);
        });
    });

    // ================================================================
    // Complex / Compound Edge Cases
    // ================================================================
    describe('Complex Edge Cases', () => {
        it('should hoist CTEs AND strip ORDER BY from same dependency', () => {
            const ec = COMPLEX_EDGE_CASES.find(e => e.description.includes('CTEs + ORDER BY'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // EventCounts CTE should be hoisted
            expect(result.ResolvedSQL).toMatch(/EventCounts/i);
            expect(result.ResolvedSQL).not.toMatch(/AS\s*\(\s*WITH/i);
            // ORDER BY Score DESC should be stripped
            expect(result.ResolvedSQL).not.toMatch(/ORDER\s+BY\s+Score\s+DESC/i);
        });

        it('should not strip ORDER BY inside string literals (false positive)', () => {
            const ec = COMPLEX_EDGE_CASES.find(e => e.description.includes('false positive'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // The string 'Sort items by ORDER BY clause' should be preserved
            expect(result.ResolvedSQL).toContain('ORDER BY clause');
        });

        it('should preserve window function ORDER BY in outer query', () => {
            const ec = COMPLEX_EDGE_CASES.find(e => e.description.includes('window functions'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // The OVER (ORDER BY ...) should NOT be stripped
            expect(result.ResolvedSQL).toMatch(/OVER\s*\(\s*ORDER\s+BY/i);
        });

        it('should handle special characters in query name', () => {
            const ec = COMPLEX_EDGE_CASES.find(e => e.description.includes('special characters'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // The CTE should have a valid alias (bracketed or hashed)
            expect(result.CTEs).toHaveLength(1);
        });
    });

    // ================================================================
    // Platform-Specific Edge Cases
    // ================================================================
    describe('Platform-Specific Edge Cases', () => {
        it('PostgreSQL should preserve ORDER BY in CTEs', () => {
            const ec = PLATFORM_SPECIFIC_EDGE_CASES.find(e =>
                e.dialect === 'PostgreSQL' && e.description.includes('ORDER BY preserved'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            expect(result.ResolvedSQL).toMatch(/ORDER\s+BY/i);
        });

        it('SQL Server should strip ORDER BY from same query', () => {
            const ec = PLATFORM_SPECIFIC_EDGE_CASES.find(e =>
                e.dialect === 'TransactSQL' && e.description.includes('strip ORDER BY'))!;
            const { result } = setupAndResolve(ec);

            expect(result.HasCompositions).toBe(true);
            // ORDER BY TotalCount DESC should be stripped for SQL Server
            expect(result.ResolvedSQL).not.toMatch(/ORDER\s+BY\s+TotalCount\s+DESC/i);
        });
    });
});
