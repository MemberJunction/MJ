import { DatabasePlatform, UserInfo, QueryDependencySpec, QueryParameterInfo } from '@memberjunction/core';
import { GetDialect, type SQLDialect } from '@memberjunction/sql-dialect';
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

    private static applyMaxRows(sql: string, maxRows: number, platform: DatabasePlatform): string {
        const trimmed = sql.trim();

        if (/\bTOP\s+\d/i.test(trimmed) || /\bLIMIT\s+\d/i.test(trimmed)) {
            return sql;
        }

        const dialect = RenderPipeline.getDialect(platform);
        const limitResult = dialect.LimitClause(maxRows);

        if (limitResult.prefix) {
            // SQL Server style: inject TOP N after SELECT
            return trimmed.replace(
                /^(SELECT\s+(?:DISTINCT\s+)?)/i,
                `$1${limitResult.prefix} `
            );
        }

        // PostgreSQL style: append LIMIT N
        const withoutSemicolon = trimmed.replace(/;\s*$/, '');
        return `${withoutSemicolon}\n${limitResult.suffix}`;
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
