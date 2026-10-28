/**
 * Render-then-compose: what a composed query renders to when a composition reference's arguments
 * come from template scope (arithmetic, `{% set %}`, loop variables, other arguments).
 *
 * The target is that the outer template renders once, each reference records a (dependency,
 * evaluated arguments) instance, and each instance renders on its own with only those values. Cases
 * and dependencies are the synthetic set from the render-then-compose experiment; they run through
 * `RenderPipeline.Run` with inline dependencies, so no metadata or database is involved.
 *
 * The "fixed" cases were pinned with `it.fails` before render-then-compose landed and now assert
 * the right text. The K1 / K2 / K6 cases assert intentional behaviour changes of the redesign.
 */
import { describe, it, expect } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { RenderPipeline } from '../renderPipeline';
import type { QueryDependencySpec } from '@memberjunction/core';
import { QueryParameterInfo } from '@memberjunction/core';
import {
    AsEntityDefs,
    ParamDef,
    SyntheticCase,
    SyntheticCases,
    SyntheticCasesPG,
    SyntheticDependencies,
    SyntheticDependenciesPG,
} from './fixtures/rtcSynthetic';

const user = new UserInfo(undefined, {
    ID: '00000000-0000-0000-0000-0000000000aa', Name: 'rtc', Email: 'rtc@example.invalid', Type: 'User', IsActive: true, UserRoles: [],
});

/** A required parameter definition. */
function RequiredDef(name: string): QueryParameterInfo {
    const def = ParamDef(name);
    def.IsRequired = true;
    return def;
}

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

    describe('bugs fixed by render-then-compose (formerly pinned)', () => {
        // Fixed by render-then-compose (was pinned): render-then-compose, pass-through args evaluated in the outer scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C1 (A4).
        it('A4: an arithmetic pass-through into a sqlString dependency gives the quoted year', () => {
            const sql = render(SyntheticCases.A4);
            expect(sql).toContain("WHERE y = '2025'");
            expect(sql).not.toContain('NaN');
        });

        // Fixed by render-then-compose (was pinned): a tag inside a string literal is refused at save (S1); a run never produces a doubly quoted literal (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C2 (H1).
        // Chosen form: the run may either refuse (RENDER ERROR) or render without double quoting; it must not render `''Act'%'`.
        // The save-time S1 refusal of the dependency itself belongs to the S1 rows (IT139), not to RenderPipeline.
        it("H1: a static argument into a quoted dependency variable is never emitted as ''Act'%'", () => {
            const sql = render(SyntheticCases.H1);
            expect(sql).not.toContain("''Act'%'");
            // The tag-in-literal rule is a save-time rule (refused at save, reported by refresh); an existing
            // query keeps running, and the dependency renders once, with the value as passed.
            expect(sql).toContain("LIKE 'Act%'");
        });

        // Fixed by render-then-compose (was pinned): render-then-compose, one instance per evaluated argument set (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C3 (F2).
        it('F2: a reference inside an outer {% for %} gives one dependency instance per loop value', () => {
            const sql = render(SyntheticCases.F2);
            expect(sql).not.toContain('RENDER ERROR');
            expect(countInstances(sql, 'EntitiesByYear')).toBe(2);
            expect(sql).toContain('YEAR(__mj_CreatedAt) = 2025');
            expect(sql).toContain('YEAR(__mj_CreatedAt) = 2026');
        });

        // Fixed by render-then-compose (was pinned): render-then-compose, pass-through args evaluated in the outer scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C4 (K3).
        it('K3: an outer {% set %} variable passed through gives its value (2025)', () => {
            const sql = render(SyntheticCases.K3);
            expect(sql).toContain('WHERE y = 2025');
        });

        // Fixed by render-then-compose (was pinned): render-then-compose, each instance renders in its own scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C5 (K4).
        it("K4: a dependency's {% set Limit %} does not leak into the outer query", () => {
            const sql = render(SyntheticCases.K4);
            expect(sql).toContain('SELECT TOP 3 y');
        });

        // Fixed by render-then-compose (was pinned): render-then-compose, args evaluated once against the caller's values, not by sequential rename (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C6 (K7).
        it("K7: (A=B, B='5') with caller B=1 gives a=1, b=5", () => {
            const sql = render(SyntheticCases.K7);
            expect(sql).toContain('SELECT 1 AS a, 5 AS b');
        });

        // Fixed by render-then-compose (was pinned): render-then-compose, args evaluated once against the caller's values, not by sequential rename (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C7 (K8).
        it('K8: the swap (A=B, B=A) with caller A=1, B=2 gives a=2, b=1', () => {
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

        // Fixed by render-then-compose (was pinned): render-then-compose, pass-through args evaluated in the outer scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C1 (A4), PostgreSQL.
        it('A4-pg: an arithmetic pass-through into a sqlString dependency gives the quoted year', () => {
            const sql = renderPG(SyntheticCasesPG.A4);
            expect(sql).toContain("WHERE y = '2025'");
            expect(sql).not.toContain('NaN');
        });

        // Fixed by render-then-compose (was pinned): a tag inside a string literal is refused at save (S1); a run never produces a doubly quoted literal (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C2 (H1), PostgreSQL.
        // Same chosen form as H1: refusing (RENDER ERROR) or rendering without double quoting both pass.
        it("H1-pg: a static argument into a quoted dependency variable is never emitted as ''Act'%'", () => {
            const sql = renderPG(SyntheticCasesPG.H1);
            expect(sql).not.toContain("''Act'%'");
            // The tag-in-literal rule is a save-time rule (refused at save, reported by refresh); an existing
            // query keeps running, and the dependency renders once, with the value as passed.
            expect(sql).toContain("LIKE 'Act%'");
        });

        // Fixed by render-then-compose (was pinned): render-then-compose, one instance per evaluated argument set (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C3 (F2), PostgreSQL.
        it('F2-pg: a reference inside an outer {% for %} gives one dependency instance per loop value', () => {
            const sql = renderPG(SyntheticCasesPG.F2);
            expect(sql).not.toContain('RENDER ERROR');
            expect(countInstances(sql, 'EntitiesByYear')).toBe(2);
            expect(sql).toContain('EXTRACT(YEAR FROM "__mj_CreatedAt") = 2025');
            expect(sql).toContain('EXTRACT(YEAR FROM "__mj_CreatedAt") = 2026');
        });

        // Fixed by render-then-compose (was pinned): render-then-compose, pass-through args evaluated in the outer scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C4 (K3), PostgreSQL.
        it('K3-pg: an outer {% set %} variable passed through gives its value (2025)', () => {
            const sql = renderPG(SyntheticCasesPG.K3);
            expect(sql).toContain('WHERE y = 2025');
        });

        // Fixed by render-then-compose (was pinned): render-then-compose, each instance renders in its own scope (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C5 (K4), PostgreSQL.
        it("K4-pg: a dependency's {% set Limit %} does not leak into the outer query", () => {
            const sql = renderPG(SyntheticCasesPG.K4);
            expect(sql).toContain('ORDER BY y LIMIT 3');
        });

        // Fixed by render-then-compose (was pinned): render-then-compose, args evaluated once against the caller's values, not by sequential rename (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C6 (K7), PostgreSQL.
        it("K7-pg: (A=B, B='5') with caller B=1 gives a=1, b=5", () => {
            const sql = renderPG(SyntheticCasesPG.K7);
            expect(sql).toContain('SELECT 1 AS a, 5 AS b');
        });

        // Fixed by render-then-compose (was pinned): render-then-compose, args evaluated once against the caller's values, not by sequential rename (DISCUSSION §6, 2026-10-27). TEST-INVENTORY C7 (K8), PostgreSQL.
        it('K8-pg: the swap (A=B, B=A) with caller A=1, B=2 gives a=2, b=1', () => {
            const sql = renderPG(SyntheticCasesPG.K8);
            expect(sql).toContain('SELECT 2 AS a, 1 AS b');
        });
    });

    // Intentional behaviour changes of render-then-compose (TEST-INVENTORY C8 / C9 / C10; COMPAT-MAP B10, B11).
    describe('intentional behaviour changes', () => {
        const extra: QueryDependencySpec[] = [
            { Name: 'UnquotedVar', CategoryPath: '/Syn/', SQL: 'SELECT Name FROM __mj.Entity WHERE SchemaName = {{ Schema }}', UsesTemplate: true, ParameterDefinitions: [ParamDef('Schema', 'string')] },
            { Name: 'RequiredDep', CategoryPath: '/Syn/', SQL: 'SELECT y FROM (VALUES (2024),(2025)) v(y) WHERE y = {{ TargetYear | sqlNumber }}', UsesTemplate: true, ParameterDefinitions: [RequiredDef('TargetYear')] },
            { Name: 'NoTemplateFlag', CategoryPath: '/Syn/', SQL: 'SELECT y FROM (VALUES (2024),(2025)) v(y) WHERE y = {{ TargetYear | sqlNumber }}', UsesTemplate: false, ParameterDefinitions: [ParamDef('TargetYear')] },
            { Name: 'Echo', CategoryPath: '/Syn/', SQL: 'SELECT {{ Note | sqlString }} AS n', UsesTemplate: true, ParameterDefinitions: [ParamDef('Note', 'string')] },
        ];
        const caseOf = (sql: string, defs: QueryParameterInfo[], values: Record<string, string>): SyntheticCase => ({ Id: 'x', SQL: sql, Defs: defs, Values: values });

        // K1 (COMPAT-MAP B10): an unfiltered string tag writes its value as is. Before, a static argument was
        // substituted as a quoted literal. A new or edited query with an unfiltered string tag is refused at save
        // (S3, MJQ_UNFILTERED_VALUE); an existing one keeps running with the bare value.
        it('K1: a static string into an unfiltered string variable of a dependency is written as is (was auto-quoted)', () => {
            const sql = render(caseOf(`SELECT COUNT(*) AS N FROM {{query:"Syn/UnquotedVar(Schema='__mj')"}} x`, [], {}), 'sqlserver', extra);
            expect(sql).toContain('WHERE SchemaName = __mj');
        });

        it("K2: a dependency's required parameter that no argument passes is refused", () => {
            const sql = render(caseOf('SELECT y FROM {{query:"Syn/RequiredDep"}} x', [], {}), 'sqlserver', extra);
            expect(sql).toMatch(/^RENDER ERROR: .*Required parameter 'TargetYear' is missing/);
        });

        it('K2: arguments are explicit: a same-named outer value does not reach the dependency', () => {
            const sql = render(caseOf('SELECT y FROM {{query:"Syn/RequiredDep"}} x', [ParamDef('TargetYear')], { TargetYear: '2025' }), 'sqlserver', extra);
            expect(sql).toMatch(/^RENDER ERROR: .*Required parameter 'TargetYear' is missing/);
        });

        // K6 is decided by COMPAT-MAP B12 ("UsesTemplate is a lexical fact"): template syntax renders whatever the
        // flag says. Before, it rendered only because the outer query forced every dependency through Nunjucks;
        // the prototype left it literal. Now each instance renders on its own because its SQL holds a template tag.
        it('K6: a dependency flagged UsesTemplate=0 that holds template syntax renders with its own arguments', () => {
            const sql = render(caseOf('SELECT y FROM {{query:"Syn/NoTemplateFlag(TargetYear=TargetYear)"}} x', [ParamDef('TargetYear')], { TargetYear: '2025' }), 'sqlserver', extra);
            expect(sql).toContain('WHERE y = 2025');
            expect(sql).not.toMatch(/\{\{|\{%/);
        });

        it('K6: an outer query flagged UsesTemplate=0 that composes and holds template syntax renders too', () => {
            const sql = render({ Id: 'k6o', SQL: 'SELECT y FROM {{query:"Syn/YearVals(TargetYear=2025)"}} x WHERE y > {{ Floor | sqlNumber }}', Defs: [ParamDef('Floor')], Values: { Floor: '2000' }, UsesTemplate: false });
            expect(sql).toContain('WHERE y > 2000');
        });

        it('rendered output is never rendered again: a value that looks like a template tag stays a value', () => {
            const sql = render(caseOf('SELECT n FROM {{query:"Syn/Echo(Note=Note)"}} x', [ParamDef('Note', 'string')], { Note: '{{ Context.UserID }}' }), 'sqlserver', extra);
            expect(sql).toContain("SELECT '{{ Context.UserID }}' AS n");
            expect(sql).not.toContain('00000000-0000-0000-0000-0000000000aa');
        });

        it('a composition in a branch not taken is neither rendered nor emitted', () => {
            const outer = 'SELECT y FROM {% if UsePrior %}{{query:"Syn/YearVals(TargetYear=TargetYear - 1)"}}{% else %}{{query:"Syn/YearVals(TargetYear=TargetYear)"}}{% endif %} x';
            const sql = render(caseOf(outer, [ParamDef('TargetYear'), ParamDef('UsePrior', 'boolean')], { TargetYear: '2026', UsePrior: 'false' }));
            expect(countInstances(sql, 'YearVals')).toBe(1);
            expect(sql).toContain('WHERE y = 2026');
        });

        it('Trace.Instances lists each instance with its evaluated arguments and rendered SQL', () => {
            const c = SyntheticCases.F2;
            const defs = AsEntityDefs(c.Defs);
            const result = RenderPipeline.Run(c.SQL, {
                Platform: 'sqlserver', ContextUser: user, Parameters: c.Values, UsesTemplate: true,
                QueryInfo: { SQL: c.SQL, UsesTemplate: true, Parameters: defs }, ParameterDefinitions: defs, Dependencies: SyntheticDependencies,
            });
            expect(result.Trace.Instances.map(i => i.Arguments)).toEqual([{ TargetYear: 2025 }, { TargetYear: 2026 }]);
            expect(result.Trace.Instances[0].RenderedSQL).toContain('= 2025');
            expect(result.Trace.AfterComposition).toBe(result.FinalSQL);
        });
    });
});
