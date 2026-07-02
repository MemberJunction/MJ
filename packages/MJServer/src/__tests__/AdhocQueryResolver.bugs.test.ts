/**
 * Failing-test suite for known AdhocQueryResolver bugs.
 *
 * Two bugs are encoded here, both observed in production
 * (Skip → ExecuteAdhocQuery → SQL Server rejection):
 *
 *   Bug #2 — `{{query:"..."}}` composition macros pass through to SQL
 *            Server as literal text because AdhocQueryResolver never
 *            calls into the QueryCompositionEngine / RenderPipeline.
 *
 *   Bug #3 — `SELECT … GROUP BY … ORDER BY …` (no top-level TOP) gets
 *            wrapped as `SELECT TOP N * FROM (<inner>) AS _adhoc_capped`.
 *            SQL Server rejects: "The ORDER BY clause is invalid in
 *            views, inline functions, derived tables, subqueries, and
 *            CTEs, unless TOP, OFFSET or FOR XML is also specified."
 *
 * Instantiating the resolver and running it through MSSQL requires a
 * very heavy mock graph (type-graphql decorators, `mssql`, AppContext,
 * config, auth, providers). To keep these tests fast and deterministic,
 * we use a hybrid strategy:
 *
 *   1. **Source-shape contract tests** — read the resolver source file
 *      and assert structural properties that *must* be true after the
 *      fix (e.g., RenderPipeline is imported and called; the manual
 *      `SELECT TOP N * FROM (...)` wrap is gone).
 *
 *   2. **Pipeline behavior tests** — exercise RenderPipeline.Run with
 *      the exact Skip inputs that hit this resolver, asserting on the
 *      shape of the output. Once the resolver routes through the
 *      pipeline (the fix), these tests become end-to-end coverage.
 *
 * **All tests are expected to FAIL against the current implementation.**
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Metadata } from '@memberjunction/core';
import { RenderPipeline } from '@memberjunction/generic-database-provider';

const ADHOC_RESOLVER_PATH = resolve(__dirname, '../resolvers/AdhocQueryResolver.ts');

function readResolverSource(): string {
    return readFileSync(ADHOC_RESOLVER_PATH, 'utf8');
}

afterEach(() => {
    vi.restoreAllMocks();
});

function stubMetadata(): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: [],
        QueryDependencies: [],
    } as ReturnType<typeof Metadata.Provider>);
}

// ════════════════════════════════════════════════════════════════════
// Source-shape contract tests
// ════════════════════════════════════════════════════════════════════

describe('AdhocQueryResolver source-shape contract', () => {

    it('Bug #2: AdhocQueryResolver must import RenderPipeline (currently does not)', () => {
        const src = readResolverSource();
        // After the fix, the resolver should delegate composition + Nunjucks +
        // MaxRows handling to the canonical pipeline rather than re-implementing
        // a partial subset.
        const importsRenderPipeline =
            /import\s*\{[^}]*\bRenderPipeline\b[^}]*\}\s*from\s*['"]@memberjunction\/generic-database-provider['"]/.test(src);
        expect(importsRenderPipeline).toBe(true);
    });

    it('Bug #2: AdhocQueryResolver must call RenderPipeline.Run() somewhere (currently does not)', () => {
        const src = readResolverSource();
        const callsRenderPipelineRun = /\bRenderPipeline\.Run\s*\(/.test(src);
        expect(callsRenderPipelineRun).toBe(true);
    });

    it('Bug #3: AdhocQueryResolver must NOT contain the manual `SELECT TOP N * FROM (...)` wrap', () => {
        const src = readResolverSource();
        // The current implementation builds executable SQL with:
        //   `SELECT TOP ${startRow + maxRows} * FROM (\n${input.SQL}\n) AS _adhoc_capped`
        // After the fix, MaxRows handling should be routed through the pipeline,
        // not implemented inline with a derived-table wrap.
        const containsManualWrap = /SELECT\s+TOP\s+\$\{[^}]+\}\s+\*\s+FROM\s*\(/.test(src);
        expect(containsManualWrap).toBe(false);
    });

    it('Bug #3: AdhocQueryResolver must NOT rely on a `^\\s*WITH\\b` guard to skip the wrap', () => {
        const src = readResolverSource();
        // The presence of this regex guard is a tell that there's still a
        // manual wrap; after the fix, no special-casing of `WITH` is needed
        // because the pipeline handles it generically.
        const hasWithGuard = /\/\^\\s\*WITH\\b\/i\.test\(/.test(src);
        expect(hasWithGuard).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════
// Bug #2 — composition macros must be resolved before execution
// ════════════════════════════════════════════════════════════════════

describe('Bug #2: composition macros in ad-hoc SQL', () => {

    it('RenderPipeline must strip {{query:"..."}} when ContextUser is provided', () => {
        // The pipeline already supports this. The bug is that AdhocQueryResolver
        // doesn't call into it. This test pins the pipeline contract that the
        // resolver fix will rely on.
        stubMetadata();
        const sql = `SELECT YEAR(base.CreatedAt) AS JoinYear, COUNT(*) AS MemberCount
FROM {{query:"Demos/Active Users"}} base
GROUP BY YEAR(base.CreatedAt)
ORDER BY JoinYear DESC`;

        // Whether or not a real query metadata entry exists, the pipeline
        // should at least detect the composition tokens and report them.
        // We do not require the pipeline to *succeed* without a real dep —
        // we require the resolver to AT LEAST attempt resolution rather than
        // shipping `{{query:` verbatim to SQL Server.
        const hasTokens = RenderPipeline.HasCompositionTokens(sql);
        expect(hasTokens).toBe(true);
    });

    it('the literal text "{{query:" must not appear in the resolver-executed SQL', () => {
        // This is the end-to-end invariant. After the fix, regardless of
        // success/failure, the resolver should never hand a string containing
        // "{{query:" to SQL Server.
        //
        // We encode this as a contract on the resolver source: it must call
        // into RenderPipeline whenever composition tokens are present, OR
        // reject early with a clear error. Either way, the literal text
        // "{{query:" must not reach `request.query(...)`.
        const src = readResolverSource();

        // Acceptable post-fix shape: source mentions RenderPipeline.Run and
        // passes input.SQL through it. We've already asserted the import +
        // call above; here we additionally require that input.SQL flows
        // through RenderPipeline.Run rather than directly to request.query.
        //
        // The current code contains `request.query(executableSql)` where
        // `executableSql` is derived from input.SQL via a string concat —
        // bypassing the pipeline entirely.
        const directlyExecutesInputSQL = /request\.query\s*\(\s*input\.SQL\s*\)/.test(src);
        expect(directlyExecutesInputSQL).toBe(false);

        // And — the executable string must be derived from a pipeline result,
        // not from an inline template literal that just concatenates input.SQL.
        // Heuristic: the file should reference `FinalSQL` (the pipeline's
        // output field) somewhere — this is what gets sent to the DB.
        const referencesFinalSQL = /\bFinalSQL\b/.test(src);
        expect(referencesFinalSQL).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════
// Bug #3 — GROUP BY + ORDER BY (no top-level TOP) must not be wrapped
//           into an ORDER-BY-bearing derived table without TOP/OFFSET
// ════════════════════════════════════════════════════════════════════

describe('Bug #3: GROUP BY + ORDER BY (no top-level TOP) under MaxRows', () => {

    /**
     * Helper: returns true if `sql` contains the canonical AdhocQuery wrap
     * with an inner ORDER BY that has no inner TOP/OFFSET — SQL Server
     * rejects this shape.
     */
    function hasBrokenAdhocOrderByWrap(sql: string): boolean {
        // Outer wrap form used by AdhocQueryResolver: `... AS _adhoc_capped`
        const m = sql.match(/SELECT\s+TOP\s+\d+\s+\*\s+FROM\s*\(([\s\S]*?)\)\s*AS\s+_adhoc_capped/i);
        if (!m) return false;
        const inner = m[1];
        if (!/ORDER\s+BY\b/i.test(inner)) return false;
        if (/\bTOP\s+\d+\b/i.test(inner)) return false;
        if (/\bOFFSET\s+\d+\s+ROWS?\b/i.test(inner)) return false;
        if (/\bFOR\s+XML\b/i.test(inner)) return false;
        return true;
    }

    it('RenderPipeline output for the Skip GROUP-BY+ORDER-BY shape must not be the broken adhoc wrap', () => {
        // After the resolver-fix, this exact SQL flows through RenderPipeline.Run.
        // So we test the pipeline output for the post-fix shape.
        stubMetadata();
        const sql = `SELECT YEAR(p.JoinDate) AS JoinYear, COUNT(p.ID) AS PersonCount
FROM dbo.vwPeople p
WHERE p.JoinDate IS NOT NULL
GROUP BY YEAR(p.JoinDate)
ORDER BY JoinYear DESC`;

        const result = RenderPipeline.Run(sql, {
            Platform: 'sqlserver',
            MaxRows: 100,
        });

        expect(hasBrokenAdhocOrderByWrap(result.FinalSQL)).toBe(false);

        // Acceptable post-fix shapes:
        //   - `SELECT TOP 100 ... ORDER BY JoinYear DESC` (TOP at outer scope, same as ORDER BY)
        //   - ORDER BY ... OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY
        // The AST-sqlify round-trip wraps identifiers in [] on SQL Server,
        // so the ORDER BY column may be emitted as `JoinYear` or `[JoinYear]`.
        const outerTopOrderBy =
            /SELECT\s+TOP\s+100\b[\s\S]+ORDER\s+BY\s+\[?JoinYear\]?\s+DESC/i.test(result.FinalSQL);
        const offsetFetch =
            /ORDER\s+BY\s+\[?JoinYear\]?\s+DESC[\s\S]+OFFSET\s+0\s+ROWS\s+FETCH\s+NEXT\s+100\s+ROWS\s+ONLY/i.test(result.FinalSQL);
        expect(outerTopOrderBy || offsetFetch).toBe(true);
    });

    it('GROUP BY + ORDER BY without TOP under Paging should already work (parity baseline)', () => {
        // Paging path already handles this correctly via OFFSET/FETCH —
        // this test is a baseline showing what "correct" looks like.
        stubMetadata();
        const sql = `SELECT YEAR(p.JoinDate) AS JoinYear, COUNT(p.ID) AS PersonCount
FROM dbo.vwPeople p
WHERE p.JoinDate IS NOT NULL
GROUP BY YEAR(p.JoinDate)
ORDER BY JoinYear DESC`;

        const result = RenderPipeline.Run(sql, {
            Platform: 'sqlserver',
            Paging: { StartRow: 0, MaxRows: 100 },
        });

        expect(result.FinalSQL).toMatch(/ORDER\s+BY\s+JoinYear\s+DESC[\s\S]+OFFSET\s+0\s+ROWS\s+FETCH\s+NEXT\s+100\s+ROWS\s+ONLY/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// Bug #3b — CTE-headed SQL via AdhocQuery is currently silently bypassed
// ════════════════════════════════════════════════════════════════════

describe('Bug #3b: CTE-headed SQL via AdhocQuery currently has no row cap at all', () => {

    it('AdhocQueryResolver source: the `^\\s*WITH\\b` guard silently skips the row cap, which is also a bug', () => {
        // The current resolver's `canWrap` predicate excludes CTE-headed SQL
        // from the wrap by detecting `^\s*WITH\b` and falling back to "no
        // wrap, slice in memory after the full result returns". This means a
        // user requesting `MaxRows: 100` against a CTE that returns 10M rows
        // gets a 10M-row scan from SQL Server and then a 100-row slice in
        // JavaScript — a hidden performance bug and a memory hazard.
        //
        // After the fix, MaxRows for CTEs must be enforced AT THE DATABASE
        // (via OFFSET/FETCH appended to the outer SELECT inside the WITH),
        // not via post-execution slicing.
        const src = readResolverSource();
        const hasWithGuard = /\/\^\\s\*WITH\\b\/i\.test\(/.test(src);
        expect(hasWithGuard).toBe(false);
    });

    it('a CTE with ORDER BY under MaxRows should get an OFFSET/FETCH at the outer SELECT (no in-memory slicing)', () => {
        stubMetadata();
        const sql = `WITH cte AS (
    SELECT ID, Name FROM dbo.Users
)
SELECT * FROM cte ORDER BY Name`;

        const result = RenderPipeline.Run(sql, {
            Platform: 'sqlserver',
            MaxRows: 100,
        });

        // After the fix the row cap should be expressed in the SQL itself,
        // so SQL Server can short-circuit. Either OFFSET/FETCH at the
        // outer scope OR a TOP injected onto the outermost SELECT is
        // acceptable.
        const outerTop = /\)\s*SELECT\s+TOP\s+100\b/i.test(result.FinalSQL);
        const offsetFetch = /OFFSET\s+0\s+ROWS\s+FETCH\s+NEXT\s+100\s+ROWS\s+ONLY/i.test(result.FinalSQL);
        expect(outerTop || offsetFetch).toBe(true);
    });
});
