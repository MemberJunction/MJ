/**
 * Render-then-compose: what a composed query renders to when a composition reference's arguments
 * come from template scope (arithmetic, `{% set %}`, loop variables, other arguments).
 *
 * The target is that the outer template renders once, each reference records a (dependency,
 * evaluated arguments) instance, and each instance renders on its own with only those values. Cases
 * and dependencies are the synthetic set from the render-then-compose experiment; they run through
 * `RenderPipeline.Run` with inline dependencies, so no metadata or database is involved.
 *
 * `it.fails` cases pin today's wrong text; they flip when the redesign lands and must then become
 * `it`. The `it` cases are renders that are right today and must stay right.
 */
import { describe, it, expect } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { RenderPipeline } from '../renderPipeline';
import type { QueryDependencySpec } from '@memberjunction/core';
import {
    AsEntityDefs,
    SyntheticCase,
    SyntheticCases,
    SyntheticCasesPG,
    SyntheticDependencies,
    SyntheticDependenciesPG,
} from './fixtures/rtcSynthetic';

const user = new UserInfo(undefined, {
    ID: '00000000-0000-0000-0000-0000000000aa', Name: 'rtc', Email: 'rtc@example.invalid', Type: 'User', IsActive: true, UserRoles: [],
});

/** The platforms the synthetic cases run on. */
type SyntheticPlatform = 'sqlserver' | 'postgresql';

/**
 * Renders a case and returns its final SQL (SQL Server unless told otherwise). A render error is
 * returned as text (`RENDER ERROR: ...`) so that a pin fails on its text assertion, showing the
 * error, rather than on an uncaught throw that `it.fails` would accept for any reason.
 */
function render(
    c: SyntheticCase,
    platform: SyntheticPlatform = 'sqlserver',
    dependencies: QueryDependencySpec[] = SyntheticDependencies,
): string {
    const usesTemplate = c.UsesTemplate ?? true;
    const defs = AsEntityDefs(c.Defs);
    try {
        return RenderPipeline.Run(c.SQL, {
            Platform: platform,
            ContextUser: user,
            Parameters: c.Values,
            UsesTemplate: usesTemplate,
            QueryInfo: { SQL: c.SQL, UsesTemplate: usesTemplate, Parameters: defs },
            ParameterDefinitions: defs,
            Dependencies: dependencies,
        }).FinalSQL;
    } catch (error: unknown) {
        return `RENDER ERROR: ${error instanceof Error ? error.message : String(error)}`;
    }
}

/** Renders a case on PostgreSQL with the PostgreSQL dependencies. */
function renderPG(c: SyntheticCase): string {
    return render(c, 'postgresql', SyntheticDependenciesPG);
}

/**
 * Counts the CTE definitions generated for a dependency: `[__cte_<Name>_xxxx] AS (` on SQL Server,
 * `"__cte_<Name>_xxxx" AS (` on PostgreSQL.
 */
function countInstances(sql: string, dependencyName: string): number {
    return (sql.match(new RegExp(`[\\["]__cte_${dependencyName}_\\w+[\\]"] AS \\(`, 'g')) ?? []).length;
}

describe('render-then-compose (synthetic cases)', () => {
    describe('renders that are right today', () => {
        it('A0: an arithmetic pass-through into a sqlNumber dependency gives the computed year', () => {
            const sql = render(SyntheticCases.A0);
            expect(sql).toContain('WHERE y = 2025');
            expect(countInstances(sql, 'YearVals')).toBe(1);
        });

        it('H2: a static argument with a doubled quote reaches a sqlString dependency as one escaped literal', () => {
            const sql = render(SyntheticCases.H2);
            expect(sql).toContain("WHERE SchemaName = 'o''x'");
        });
    });

    describe('known bugs (pinned)', () => {
        // Pinned: render-then-compose, pass-through args evaluated in the outer scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C1 (A4).
        // Observed today: the dependency renders `WHERE y = NaN`.
        it.fails('A4: an arithmetic pass-through into a sqlString dependency gives the quoted year', () => {
            const sql = render(SyntheticCases.A4);
            expect(sql).toContain("WHERE y = '2025'");
            expect(sql).not.toContain('NaN');
        });

        // Pinned: a tag inside a string literal is refused at save (S1); a run never produces a doubly quoted literal (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C2 (H1).
        // Chosen form: the run may either refuse (RENDER ERROR) or render without double quoting; it must not render `''Act'%'`.
        // The save-time S1 refusal of the dependency itself belongs to the S1 rows (IT139), not to RenderPipeline.
        // Observed today: the dependency renders `WHERE Name LIKE ''Act'%'`.
        it.fails("H1: a static argument into a quoted dependency variable is never emitted as ''Act'%'", () => {
            const sql = render(SyntheticCases.H1);
            expect(sql).not.toContain("''Act'%'");
        });

        // Pinned: render-then-compose, one instance per evaluated argument set (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C3 (F2).
        // Observed today: RENDER ERROR "Template processing failed: ... Invalid number: undefined" (the loop var `y` is not in scope where the dependency renders).
        it.fails('F2: a reference inside an outer {% for %} gives one dependency instance per loop value', () => {
            const sql = render(SyntheticCases.F2);
            expect(sql).not.toContain('RENDER ERROR');
            expect(countInstances(sql, 'EntitiesByYear')).toBe(2);
            expect(sql).toContain('YEAR(__mj_CreatedAt) = 2025');
            expect(sql).toContain('YEAR(__mj_CreatedAt) = 2026');
        });

        // Pinned: render-then-compose, pass-through args evaluated in the outer scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C4 (K3).
        // Observed today: RENDER ERROR "Template processing failed: ... Invalid number: undefined" (`Prior` from the outer {% set %} is not visible to the dependency).
        it.fails('K3: an outer {% set %} variable passed through gives its value (2025)', () => {
            const sql = render(SyntheticCases.K3);
            expect(sql).toContain('WHERE y = 2025');
        });

        // Pinned: render-then-compose, each instance renders in its own scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C5 (K4).
        // Observed today: the outer query renders `SELECT TOP 1` (the dependency's `{% set Limit = 1 %}` overrides the caller's Limit=3).
        it.fails("K4: a dependency's {% set Limit %} does not leak into the outer query", () => {
            const sql = render(SyntheticCases.K4);
            expect(sql).toContain('SELECT TOP 3 y');
        });

        // Pinned: render-then-compose, args evaluated once against the caller's values, not by sequential rename (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C6 (K7).
        // Observed today: the dependency renders `SELECT 5 AS a, 5 AS b`.
        it.fails("K7: (A=B, B='5') with caller B=1 gives a=1, b=5", () => {
            const sql = render(SyntheticCases.K7);
            expect(sql).toContain('SELECT 1 AS a, 5 AS b');
        });

        // Pinned: render-then-compose, args evaluated once against the caller's values, not by sequential rename (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C7 (K8).
        // Observed today: the dependency renders `SELECT 1 AS a, 1 AS b`.
        it.fails('K8: the swap (A=B, B=A) with caller A=1, B=2 gives a=2, b=1', () => {
            const sql = render(SyntheticCases.K8);
            expect(sql).toContain('SELECT 2 AS a, 1 AS b');
        });
    });

    // The same cases on PostgreSQL, with dependencies rewritten where the SQL Server text is T-SQL only.
    describe('PostgreSQL', () => {
        // Protect: proves the PostgreSQL harness renders a composed query (quoted CTE name, right value),
        // so the pins below fail on their own assertions, not on setup.
        it('A0-pg: an arithmetic pass-through into a sqlNumber dependency gives the computed year', () => {
            const sql = renderPG(SyntheticCasesPG.A0);
            expect(sql).toContain('WHERE y = 2025');
            expect(countInstances(sql, 'YearVals')).toBe(1);
        });

        // Pinned: render-then-compose, pass-through args evaluated in the outer scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C1 (A4), PostgreSQL.
        // Observed today: the dependency renders `WHERE y = NaN`.
        it.fails('A4-pg: an arithmetic pass-through into a sqlString dependency gives the quoted year', () => {
            const sql = renderPG(SyntheticCasesPG.A4);
            expect(sql).toContain("WHERE y = '2025'");
            expect(sql).not.toContain('NaN');
        });

        // Pinned: a tag inside a string literal is refused at save (S1); a run never produces a doubly quoted literal (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C2 (H1), PostgreSQL.
        // Same chosen form as H1: refusing (RENDER ERROR) or rendering without double quoting both pass.
        // Observed today: the dependency renders `WHERE "Name" LIKE ''Act'%'`.
        it.fails("H1-pg: a static argument into a quoted dependency variable is never emitted as ''Act'%'", () => {
            const sql = renderPG(SyntheticCasesPG.H1);
            expect(sql).not.toContain("''Act'%'");
        });

        // Pinned: render-then-compose, one instance per evaluated argument set (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C3 (F2), PostgreSQL.
        // Observed today: RENDER ERROR "Template processing failed: (unknown path) Error: Invalid number: undefined".
        it.fails('F2-pg: a reference inside an outer {% for %} gives one dependency instance per loop value', () => {
            const sql = renderPG(SyntheticCasesPG.F2);
            expect(sql).not.toContain('RENDER ERROR');
            expect(countInstances(sql, 'EntitiesByYear')).toBe(2);
            expect(sql).toContain('EXTRACT(YEAR FROM "__mj_CreatedAt") = 2025');
            expect(sql).toContain('EXTRACT(YEAR FROM "__mj_CreatedAt") = 2026');
        });

        // Pinned: render-then-compose, pass-through args evaluated in the outer scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C4 (K3), PostgreSQL.
        // Observed today: RENDER ERROR "Template processing failed: (unknown path) Error: Invalid number: undefined".
        it.fails('K3-pg: an outer {% set %} variable passed through gives its value (2025)', () => {
            const sql = renderPG(SyntheticCasesPG.K3);
            expect(sql).toContain('WHERE y = 2025');
        });

        // Pinned: render-then-compose, each instance renders in its own scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C5 (K4), PostgreSQL.
        // Observed today: the outer query renders `ORDER BY y LIMIT 1` (the dependency's `{% set Limit = 1 %}` overrides the caller's Limit=3).
        it.fails("K4-pg: a dependency's {% set Limit %} does not leak into the outer query", () => {
            const sql = renderPG(SyntheticCasesPG.K4);
            expect(sql).toContain('ORDER BY y LIMIT 3');
        });

        // Pinned: render-then-compose, args evaluated once against the caller's values, not by sequential rename (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C6 (K7), PostgreSQL.
        // Observed today: the dependency renders `SELECT 5 AS a, 5 AS b`.
        it.fails("K7-pg: (A=B, B='5') with caller B=1 gives a=1, b=5", () => {
            const sql = renderPG(SyntheticCasesPG.K7);
            expect(sql).toContain('SELECT 1 AS a, 5 AS b');
        });

        // Pinned: render-then-compose, args evaluated once against the caller's values, not by sequential rename (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C7 (K8), PostgreSQL.
        // Observed today: the dependency renders `SELECT 1 AS a, 1 AS b`.
        it.fails('K8-pg: the swap (A=B, B=A) with caller A=1, B=2 gives a=2, b=1', () => {
            const sql = renderPG(SyntheticCasesPG.K8);
            expect(sql).toContain('SELECT 2 AS a, 1 AS b');
        });
    });
});
