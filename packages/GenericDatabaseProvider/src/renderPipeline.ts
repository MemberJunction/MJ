import { DatabasePlatform, UserInfo, QueryDependencySpec, QueryParameterInfo } from '@memberjunction/core';
import { GetDialect, type SQLDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '@memberjunction/sql-parser';
import { QueryCompositionEngine, CompositionResult, CompositionCTEInfo } from './queryCompositionEngine.js';
import { QueryPagingEngine, PagingWrappedSQL } from './queryPagingEngine.js';
import { QueryParameterProcessor, type QueryTemplateInput } from '@memberjunction/query-processor';

// ════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════

/**
 * Diagnostic metadata for a single composition operation.
 */
export interface CompositionDiagnostic {
    /** Name of the dependency query resolved */
    DepName: string;
    /** Category path of the dependency */
    CategoryPath: string;
    /** Generated CTE name in the output */
    CTEName: string;
    /** Whether ORDER BY was stripped from this dep */
    OrderByStripped: boolean;
    /** Number of inner CTEs hoisted from this dep */
    InnerCTEsHoisted: number;
}

/**
 * Pipeline trace capturing the SQL state after each pass.
 * Used for error diagnosis — when SQL Server rejects the output, the
 * caller can see what each pass produced to identify which pass
 * mangled the SQL.
 */
export interface RenderTrace {
    /** SQL after composition ({{ }}/{% %} tokens still present) */
    AfterComposition: string;
    /** Composition metadata: which deps resolved, which CTEs generated */
    CompositionDiagnostics: CompositionDiagnostic[];
    /** SQL after Nunjucks template evaluation (fully resolved, executable) */
    AfterTemplates: string;
    /** SQL after paging (final) — only set if paging was applied */
    AfterPaging: string | null;
}

/**
 * Context passed to {@link RenderPipeline.Run} controlling each pipeline stage.
 */
export interface RenderContext {
    /** Target database platform */
    Platform: DatabasePlatform;
    /** User context for permission checks on referenced queries */
    ContextUser?: UserInfo;
    /** Parameter values from the caller */
    Parameters?: Record<string, string>;
    /** Formal parameter definitions (for validation). Null = skip validation. */
    ParameterDefinitions?: QueryParameterInfo[];
    /** Whether the outer query uses Nunjucks templates */
    UsesTemplate?: boolean;
    /** Inline dependency specs for transient query testing */
    Dependencies?: QueryDependencySpec[];
    /** Original (pre-composition) SQL — used for template input metadata */
    OriginalSQL?: string;
    /** Full query metadata object (saved query path). When provided, passed
     *  directly to processQueryTemplate for parameter validation. When omitted,
     *  a synthetic QueryTemplateInput is built from OriginalSQL + ParameterDefinitions. */
    QueryInfo?: QueryTemplateInput;
    /** Paging parameters (omit to skip paging) */
    Paging?: { StartRow: number; MaxRows: number };
    /** MaxRows safety limit for transient query testing */
    MaxRows?: number;
}

/**
 * Result returned by {@link RenderPipeline.Run}.
 */
export interface RenderResult {
    /** The final SQL ready for execution */
    FinalSQL: string;
    /** Parameters that were applied during template processing */
    AppliedParameters: Record<string, string>;
    /** Whether composition tokens were found and resolved */
    HasCompositions: boolean;
    /** Metadata about each CTE generated during composition */
    CTEs: CompositionCTEInfo[];
    /** Pipeline trace for error diagnosis */
    Trace: RenderTrace;
    /** Paging result (if paging was applied) */
    PagingResult: PagingWrappedSQL | null;
}

// ════════════════════════════════════════════════════════════════════
// Pipeline
// ════════════════════════════════════════════════════════════════════

/**
 * RenderPipeline wraps the existing composition → template → paging calls
 * into a single entry point with enforced ordering and diagnostic tracing.
 *
 * **Pipeline order** (this is a data dependency, not a convention):
 * 1. **Composition** resolves `{{query:"..."}}` tokens into CTEs. Must run
 *    BEFORE Nunjucks because pass-through parameters rename `{{ innerParam }}`
 *    to `{{ outerParam }}` — Nunjucks needs those tokens intact.
 * 2. **Nunjucks** evaluates `{{ param | filter }}` and `{% if/for %}` blocks.
 *    Must run AFTER composition and BEFORE paging.
 * 3. **Paging** detects ORDER BY and injects OFFSET/FETCH or LIMIT/OFFSET.
 *    Must run AFTER Nunjucks because it needs to detect whether
 *    `{% if SortField %} ORDER BY ... {% endif %}` resolved to an actual
 *    ORDER BY or not — that depends on runtime parameter values.
 *
 * The `Trace` field on the result captures the SQL state after each pass,
 * enabling diagnosis when SQL Server rejects the output.
 */
export class RenderPipeline {

    /**
     * Runs the full rendering pipeline: composition → Nunjucks → paging.
     *
     * @param sql - Raw SQL with potential composition tokens and template expressions
     * @param ctx - Pipeline context (platform, user, parameters, paging, etc.)
     * @returns Final SQL, applied parameters, composition metadata, and diagnostic trace
     */
    static Run(sql: string, ctx: RenderContext): RenderResult {
        let currentSQL = sql;
        let appliedParameters: Record<string, string> = {};

        // ── Step 1: Composition ──────────────────────────────────────
        const compositionResult = RenderPipeline.runComposition(currentSQL, ctx);
        currentSQL = compositionResult.ResolvedSQL;
        const afterComposition = currentSQL;
        const compositionDiagnostics = buildCompositionDiagnostics(compositionResult);

        // ── Step 1.5: Strip SQL comments ─────────────────────────────
        // Comments serve no runtime purpose in executed SQL and can contain
        // {{ }} patterns (e.g. documentation examples) that would crash
        // Nunjucks. Strip them after composition (which correctly ignores
        // comment-embedded tokens) and before Nunjucks processes the SQL.
        // Comments are still visible in Trace.AfterComposition for debugging.
        currentSQL = RenderPipeline.stripSQLComments(currentSQL);

        // ── Step 2: Nunjucks template evaluation ─────────────────────
        const templateResult = RenderPipeline.runTemplates(currentSQL, sql, ctx, compositionResult);
        currentSQL = templateResult.processedSQL;
        appliedParameters = templateResult.appliedParameters;
        const afterTemplates = currentSQL;

        // ── Step 3: MaxRows safety limit (if specified) ──────────────
        if (ctx.MaxRows != null && ctx.MaxRows > 0) {
            currentSQL = RenderPipeline.applyMaxRows(currentSQL, ctx.MaxRows, ctx.Platform);
        }

        // ── Step 4: Paging (if requested) ────────────────────────────
        let pagingResult: PagingWrappedSQL | null = null;
        let afterPaging: string | null = null;

        if (ctx.Paging && QueryPagingEngine.ShouldPage(ctx.Paging.StartRow, ctx.Paging.MaxRows)) {
            pagingResult = QueryPagingEngine.WrapWithPaging(
                currentSQL, ctx.Paging.StartRow, ctx.Paging.MaxRows, ctx.Platform
            );
            currentSQL = pagingResult.DataSQL;
            afterPaging = currentSQL;
        }

        return {
            FinalSQL: currentSQL,
            AppliedParameters: appliedParameters,
            HasCompositions: compositionResult.HasCompositions,
            CTEs: compositionResult.CTEs,
            Trace: {
                AfterComposition: afterComposition,
                CompositionDiagnostics: compositionDiagnostics,
                AfterTemplates: afterTemplates,
                AfterPaging: afterPaging,
            },
            PagingResult: pagingResult,
        };
    }

    /**
     * Resolves only the composition step — for callers that need composition
     * without the full pipeline (e.g., save-time token analysis).
     *
     * Wraps {@link QueryCompositionEngine.ResolveComposition} to maintain the
     * existing public API while the internal implementation may change.
     */
    static ResolveCompositionOnly(
        sql: string,
        platform: DatabasePlatform,
        contextUser: UserInfo,
        outerParams?: Record<string, string>,
        inlineDependencies?: QueryDependencySpec[]
    ): CompositionResult {
        return new QueryCompositionEngine().ResolveComposition(
            sql, platform, contextUser, outerParams, inlineDependencies
        );
    }

    /**
     * Checks whether SQL contains composition tokens.
     * Convenience wrapper for callers that need a fast guard.
     */
    static HasCompositionTokens(sql: string): boolean {
        return new QueryCompositionEngine().HasCompositionTokens(sql);
    }

    // ════════════════════════════════════════════════════════════════
    // Internal pass implementations
    // ═════════════════════════════════════════════════════���══════════

    private static runComposition(sql: string, ctx: RenderContext): CompositionResult {
        const engine = new QueryCompositionEngine();

        if (!engine.HasCompositionTokens(sql) || !ctx.ContextUser) {
            return {
                ResolvedSQL: sql,
                CTEs: [],
                DependencyGraph: new Map<string, string[]>(),
                HasCompositions: false,
                AnyDependencyUsesTemplates: false,
            };
        }

        return engine.ResolveComposition(
            sql, ctx.Platform, ctx.ContextUser, ctx.Parameters, ctx.Dependencies
        );
    }

    private static runTemplates(
        composedSQL: string,
        originalSQL: string,
        ctx: RenderContext,
        compositionResult: CompositionResult
    ): { processedSQL: string; appliedParameters: Record<string, string> } {
        const needsTemplateProcessing = ctx.UsesTemplate || compositionResult.AnyDependencyUsesTemplates;

        if (!needsTemplateProcessing) {
            return { processedSQL: composedSQL, appliedParameters: {} };
        }

        // Build the template input. When a QueryInfo object is provided (saved
        // query path), pass it directly so processQueryTemplate gets the real
        // Parameters array for validation. Otherwise build a synthetic input.
        const templateInput = ctx.QueryInfo ?? {
            SQL: ctx.OriginalSQL ?? originalSQL,
            UsesTemplate: ctx.UsesTemplate ?? false,
            Parameters: ctx.ParameterDefinitions ?? [],
        };

        const skipUnknownParamCheck = compositionResult.AnyDependencyUsesTemplates || !ctx.ParameterDefinitions;
        const result = QueryParameterProcessor.processQueryTemplate(
            templateInput,
            ctx.Parameters,
            composedSQL,
            skipUnknownParamCheck
        );

        if (!result.success) {
            throw new Error(result.error);
        }

        return {
            processedSQL: result.processedSQL,
            appliedParameters: (result.appliedParameters || {}) as Record<string, string>,
        };
    }

    /**
     * Injects a row-cap (`TOP N` for SQL Server, `LIMIT N` for Postgres) onto
     * the outermost SELECT of `sql`.
     *
     * Uses an AST-based rewrite so CTE queries (`WITH … SELECT …`), nested
     * subqueries, comments, and casing are all handled correctly. The cap is
     * applied to the outermost projection only, leaving any inner `TOP N` /
     * `LIMIT N` clauses inside CTE definitions or subqueries untouched.
     *
     * For shapes the parser can't represent at the top level
     * (UNION/INTERSECT/EXCEPT, vendor-specific T-SQL the parser rejects, sqlify
     * round-trip failures), falls back to wrapping the original SQL in
     * `SELECT TOP N * FROM (<original>) AS _capped` — always safe because the
     * inner SQL is treated as opaque.
     */
    private static applyMaxRows(sql: string, maxRows: number, platform: DatabasePlatform): string {
        const dialect = RenderPipeline.getDialect(platform);
        const fromAst = RenderPipeline.applyMaxRowsViaAst(sql, maxRows, dialect);
        if (fromAst !== null) return fromAst;
        return RenderPipeline.applyMaxRowsViaSubqueryWrap(sql, maxRows, dialect);
    }

    private static applyMaxRowsViaAst(sql: string, maxRows: number, dialect: SQLDialect): string | null {
        const ast = SQLParser.ParseSQL(sql, dialect);
        if (!ast) return null;

        const root = Array.isArray(ast) ? ast[0] : ast;
        if (!root) return null;

        // Non-SELECT (INSERT/UPDATE/DELETE/MERGE): row caps don't apply — leave alone.
        // Discriminating on `type` narrows `root` to node-sql-parser's `Select` shape.
        if (root.type !== 'select') return sql;

        // `top` is a SQL Server-specific field on the Select node that node-sql-parser's
        // published .d.ts omits. Widen the narrowed type via intersection so we can
        // read/write it without an `as unknown` escape hatch.
        const selectNode = root as typeof root & {
            top?: { value: number; percent: number | null } | null;
        };

        // UNION/INTERSECT/EXCEPT: outer SELECT has set_op + _next branches. Injecting
        // `top` here only caps the first branch, so defer to the subquery wrap.
        if (selectNode.set_op) return null;

        // Idempotency: an explicit outer TOP/LIMIT wins over MaxRows.
        // node-sql-parser distinguishes "no LIMIT" by an empty `limit.value` array
        // on Postgres (the wrapper object is always present), while SQL Server uses
        // `top === null`. Check both shapes so we don't double-inject.
        if (selectNode.top != null) return sql;
        if (selectNode.limit != null && selectNode.limit.value.length > 0) return sql;

        const limitClause = dialect.LimitClause(maxRows);
        if (limitClause.prefix) {
            // SQL Server: { value, percent } matches node-sql-parser's parsed shape
            selectNode.top = { value: maxRows, percent: null };
        } else {
            // PostgreSQL: { seperator, value[] } — note the parser's spelling of "seperator"
            selectNode.limit = { seperator: '', value: [{ type: 'number', value: maxRows }] };
        }

        try {
            return SQLParser.SqlifyAST(ast, dialect);
        } catch {
            return null;
        }
    }

    private static applyMaxRowsViaSubqueryWrap(sql: string, maxRows: number, dialect: SQLDialect): string {
        const trimmed = sql.trim().replace(/;\s*$/, '');
        const limitClause = dialect.LimitClause(maxRows);

        if (limitClause.prefix) {
            // SQL Server: outer projection cap. The optimizer pushes TOP N through trivially.
            return `SELECT ${limitClause.prefix} * FROM (${trimmed}) AS _capped`;
        }
        // PostgreSQL: appending LIMIT N is always legal at the end of a SELECT/CTE.
        return `${trimmed}\n${limitClause.suffix}`;
    }

    private static getDialect(platform: DatabasePlatform): SQLDialect {
        return GetDialect(platform);
    }

    /**
     * Strips SQL comments (single-line -- and block comments) from a SQL string.
     * Preserves single-quoted string literals to avoid stripping inside them.
     */
    private static stripSQLComments(sql: string): string {
        let result = '';
        let i = 0;

        while (i < sql.length) {
            // Single-quoted string literal — preserve as-is
            if (sql[i] === "'") {
                result += sql[i++];
                while (i < sql.length) {
                    if (sql[i] === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
                        result += "''";
                        i += 2;
                    } else if (sql[i] === "'") {
                        result += sql[i++];
                        break;
                    } else {
                        result += sql[i++];
                    }
                }
            }
            // Single-line comment: -- to end of line
            else if (sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
                while (i < sql.length && sql[i] !== '\n') i++;
            }
            // Block comment: /* ... */
            else if (sql[i] === '/' && i + 1 < sql.length && sql[i + 1] === '*') {
                i += 2;
                while (i < sql.length) {
                    if (sql[i] === '*' && i + 1 < sql.length && sql[i + 1] === '/') {
                        i += 2;
                        break;
                    }
                    i++;
                }
            }
            // Normal character
            else {
                result += sql[i++];
            }
        }

        return result;
    }
}

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

function buildCompositionDiagnostics(result: CompositionResult): CompositionDiagnostic[] {
    return result.CTEs.map(cte => ({
        DepName: cte.QueryName,
        CategoryPath: cte.CategoryPath,
        CTEName: cte.CTEName,
        // We can't easily tell if ORDER BY was stripped without comparing
        // original vs resolved SQL, so this is a best-effort flag based on
        // whether the original had ORDER BY and the resolved doesn't.
        OrderByStripped: /ORDER\s+BY\b/i.test(cte.OriginalSQL) && !/ORDER\s+BY\b/i.test(cte.ResolvedSQL),
        InnerCTEsHoisted: 0, // TODO: track in composition engine
    }));
}
