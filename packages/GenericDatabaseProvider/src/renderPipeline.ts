import { BuildQueryTemplateContext, DatabasePlatform, UserInfo, QueryDependencySpec, LogStatus } from '@memberjunction/core';
import { MJQueryParameterEntity } from '@memberjunction/core-entities';
import { GetDialect } from '@memberjunction/sql-dialect';
import { QueryCompositionEngine, CompositionResult, CompositionCTEInfo } from './queryCompositionEngine.js';
import { QueryPagingEngine, PagingWrappedSQL, RowCapOutcome } from './queryPagingEngine.js';
import { type QueryTemplateInput } from '@memberjunction/query-processor';
import type { AssembledComposition } from './composition/compositionAssembler.js';
import { SafetyGate } from './composition/safetyGate.js';
import { CTEInfoOf } from './composition/compositionInfo.js';
import { AssembleComposition, NewCompositionRender, OuterRenderRequest } from './composition/renderSteps.js';

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
 * One composed query instance as it was rendered: a composed query with one set of evaluated
 * arguments, emitted as one CTE.
 */
export interface RenderInstanceTrace {
    /** ID of the composed query (a synthetic ID for an inline dependency). */
    QueryID: string;
    QueryName: string;
    /** The composition path as written. */
    CategoryPath: string;
    /** The CTE the instance is emitted as. */
    CTEName: string;
    /** The arguments, evaluated in the caller's scope, keyed by the composed query's parameter names. */
    Arguments: Record<string, unknown>;
    /** The instance's own SQL after its template rendered (its compositions replaced by their CTE names). */
    RenderedSQL: string;
}

/**
 * Pipeline trace capturing the SQL state after each pass.
 * Used for error diagnosis — when the database rejects the output, the caller can see what each
 * pass produced.
 *
 * Composition renders first, then composes: the outer template renders once, each composed query
 * instance renders on its own ({@link Instances}), and the plain SQL is assembled from them.
 */
export interface RenderTrace {
    /**
     * The assembled SQL: every template rendered, every composition emitted as a CTE. For a query
     * without compositions, its rendered SQL. Before row caps and paging.
     */
    AfterComposition: string;
    /** Composition metadata: which deps resolved, which CTEs generated */
    CompositionDiagnostics: CompositionDiagnostic[];
    /**
     * The fully resolved, executable SQL before row caps and paging: the same text as
     * {@link AfterComposition}. Authorization checks read it, so it always holds every composed query.
     */
    AfterTemplates: string;
    /** SQL after paging (final) — only set if paging was applied */
    AfterPaging: string | null;
    /** Each composed query instance, dependencies first. Empty when the query composes nothing. */
    Instances: RenderInstanceTrace[];
}

/**
 * Context passed to {@link RenderPipeline.Run} controlling each pipeline stage.
 */
export interface RenderContext {
    /** Target database platform */
    Platform: DatabasePlatform;
    /**
     * The key of the dialect the template's SQL filters and boolean values render for. Defaults
     * to {@link Platform}. Every render names its dialect, so two providers on different platforms
     * in one process each render with their own filters.
     */
    DialectKey?: string;
    /** ID of the saved query being rendered, so a composition that leads back to it is refused as a cycle. */
    QueryID?: string;
    /** The saved query's name, for refusals written for its owners. */
    QueryName?: string;
    /** User context for permission checks on referenced queries */
    ContextUser?: UserInfo;
    /** Parameter values from the caller */
    Parameters?: Record<string, string>;
    /**
     * Values only server code sets (`RunQueryParams.ServerParameters`). A caller value for a
     * server-set parameter, here or in a composed query, is refused.
     */
    ServerParameters?: Record<string, unknown>;
    /** IANA time zone the template's `Context` dates are worked out in. UTC when unset. */
    TimeZone?: string;
    /** The clock the template's `Context` reads. Defaults to now. */
    Now?: Date;
    /** Formal parameter definitions (for validation). Null = skip validation. */
    ParameterDefinitions?: MJQueryParameterEntity[];
    /**
     * Whether the outer query is a template. A template passes the MJ Query interpreter gate
     * (`QueryTemplate.Validate`, Refresh mode, refused on errors) before Nunjucks evaluates it.
     */
    UsesTemplate?: boolean;
    /** Inline dependency specs for transient query testing */
    Dependencies?: QueryDependencySpec[];
    /** Original (pre-composition) SQL — used for template input metadata */
    OriginalSQL?: string;
    /** Full query metadata object (saved query path). When provided, passed
     *  directly to processQueryTemplate for parameter validation. When omitted,
     *  a synthetic QueryTemplateInput is built from OriginalSQL + ParameterDefinitions. */
    QueryInfo?: QueryTemplateInput;
    /** Paging parameters (omit to skip paging). Mutually exclusive with {@link MaxRows}. */
    Paging?: { StartRow: number; MaxRows: number };
    /** MaxRows safety limit. Mutually exclusive with {@link Paging}. */
    MaxRows?: number;
    /**
     * Every rendered statement is held to the read-only check (one statement that starts with
     * `SELECT` or `WITH`, reads in every CTE, does not `SELECT … INTO` a table, and calls no
     * forbidden function), saved queries included. Set this where the caller, not a saved query,
     * supplies the SQL (ad-hoc SQL, transient test queries): SQL with no statement at all is then
     * refused too.
     */
    RequireReadStatement?: boolean;
}

/**
 * Result returned by {@link RenderPipeline.Run}.
 */
export interface RenderResult {
    /** The final SQL ready for execution */
    FinalSQL: string;
    /** Parameters that were applied during template processing */
    AppliedParameters: Record<string, string>;
    /**
     * The `Context` members the template read, with their values. Empty when it read none. A
     * cached result depends on exactly these.
     */
    ContextValues: Record<string, string>;
    /** Whether composition tokens were found and resolved */
    HasCompositions: boolean;
    /** Metadata about each CTE generated during composition */
    CTEs: CompositionCTEInfo[];
    /** Pipeline trace for error diagnosis */
    Trace: RenderTrace;
    /** Paging result (if paging was applied) */
    PagingResult: PagingWrappedSQL | null;
    /**
     * Whether the {@link RenderContext.MaxRows} cap holds for {@link FinalSQL}, and how it was
     * applied; `null` when no MaxRows cap was requested.
     */
    RowCap: RowCapOutcome | null;
}

// ════════════════════════════════════════════════════════════════════
// Pipeline
// ════════════════════════════════════════════════════════════════════

/**
 * RenderPipeline is the one entry point that turns query SQL into the SQL that runs, with
 * enforced ordering and a diagnostic trace. Every path uses it: saved queries, ad hoc SQL,
 * TestQuerySQL, specs and data contexts.
 *
 * **Pipeline order** (a data dependency, not a convention):
 * 1. **Comments** are removed first, so template tags in them are inert.
 * 2. **Interpreter gate**: a template must pass the MJ Query language check
 *    (`QueryTemplate.Validate`, Refresh mode); a template with errors is refused.
 * 3. **Render, then compose**: Nunjucks renders the outer template once. Each composition it
 *    reaches records an instance (the composed query + its arguments evaluated in the caller's
 *    scope) and writes the instance's CTE name. Each instance then renders on its own, with only
 *    its arguments, recursively. The plain SQL is assembled from the rendered parts and is never
 *    rendered again, so a value that looks like a template tag stays a value.
 * 4. **Safety**: the assembled statement must be a single read query (token-based; see
 *    {@link SafetyGate}).
 * 5. **Row cap / paging** detect ORDER BY and inject TOP / OFFSET-FETCH / LIMIT, after rendering,
 *    because `{% if SortField %} ORDER BY … {% endif %}` decides whether there is an ORDER BY.
 */
export class RenderPipeline {

    /**
     * Runs the full rendering pipeline.
     *
     * @param sql - Raw SQL with potential composition tokens and template expressions
     * @param ctx - Pipeline context (platform, user, parameters, paging, etc.)
     * @returns Final SQL, applied parameters, composition metadata, and diagnostic trace
     */
    static Run(sql: string, ctx: RenderContext): RenderResult {
        const caps = RenderPipeline.capsOf(ctx);
        const dialect = GetDialect(ctx.Platform);
        const context = BuildQueryTemplateContext({ User: ctx.ContextUser, TimeZone: ctx.TimeZone, Now: ctx.Now });
        const render = NewCompositionRender(ctx, dialect, context, false);
        const outer = render.RenderOuter(OuterRenderRequest(sql, ctx));
        const assembled = AssembleComposition(outer.SQL, render.Instances, dialect);
        SafetyGate.AssertSafeToExecute(assembled.SQL, dialect, ctx.RequireReadStatement === true);

        let currentSQL = assembled.SQL;
        let rowCap: RowCapOutcome | null = null;
        if (caps.HasMaxRows) {
            const capResult = QueryPagingEngine.ApplyMaxRows(currentSQL, ctx.MaxRows!, ctx.Platform);
            currentSQL = capResult.SQL;
            rowCap = capResult.Outcome;
            if (!rowCap.Applied) {
                LogStatus(`RenderPipeline: MaxRows ${ctx.MaxRows} was not applied — ${rowCap.Reason}. The query runs uncapped.`);
            }
        }
        let pagingResult: PagingWrappedSQL | null = null;
        if (caps.HasPaging) {
            pagingResult = QueryPagingEngine.WrapWithPaging(currentSQL, ctx.Paging!.StartRow, ctx.Paging!.MaxRows, ctx.Platform);
            currentSQL = pagingResult.DataSQL;
        }
        return {
            FinalSQL: currentSQL,
            AppliedParameters: outer.AppliedParameters,
            ContextValues: context.ReadValues(),
            HasCompositions: outer.HasCompositions,
            CTEs: render.Instances.map(CTEInfoOf),
            Trace: RenderPipeline.traceOf(assembled, pagingResult ? currentSQL : null),
            PagingResult: pagingResult,
            RowCap: rowCap,
        };
    }

    /** Whether a MaxRows cap and paging were asked for; refuses both at once. */
    private static capsOf(ctx: RenderContext): { HasMaxRows: boolean; HasPaging: boolean } {
        const hasMaxRows = ctx.MaxRows != null && ctx.MaxRows > 0;
        const hasPaging = ctx.Paging != null && QueryPagingEngine.ShouldPage(ctx.Paging.StartRow, ctx.Paging.MaxRows);
        if (hasMaxRows && hasPaging) {
            throw new Error(
                'RenderPipeline.Run: ctx.MaxRows and ctx.Paging are mutually exclusive. ' +
                'Use Paging for pagination (StartRow + MaxRows) or MaxRows alone for a safety cap. ' +
                `Got MaxRows=${ctx.MaxRows} and Paging=${JSON.stringify(ctx.Paging)}.`
            );
        }
        return { HasMaxRows: hasMaxRows, HasPaging: hasPaging };
    }

    /**
     * Resolves only the composition step: the composed queries are rendered with the static
     * arguments written in their composition tokens and assembled as CTEs; the outer SQL itself is
     * not rendered (its own template tags stay as written). For callers that run SQL with
     * compositions but no parameter values (GetData).
     *
     * @throws Error when a composition of the outer SQL passes a value of the outer query: without
     *         rendering there is no value to pass. Use {@link Run} for those.
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
    // ════════════════════════════════════════════════════════════════

    private static traceOf(assembled: AssembledComposition, afterPaging: string | null): RenderTrace {
        return {
            AfterComposition: assembled.SQL,
            CompositionDiagnostics: assembled.Instances.map(a => ({
                DepName: a.Instance.Resolved.Query.Name,
                CategoryPath: a.Instance.Path.FullPath,
                CTEName: a.Instance.CTEName,
                OrderByStripped: a.OrderByStripped,
                InnerCTEsHoisted: a.InnerCTEsHoisted,
            })),
            AfterTemplates: assembled.SQL,
            AfterPaging: afterPaging,
            Instances: assembled.Instances.map(a => ({
                QueryID: a.Instance.Resolved.Query.ID,
                QueryName: a.Instance.Resolved.Query.Name,
                CategoryPath: a.Instance.Path.FullPath,
                CTEName: a.Instance.CTEName,
                Arguments: { ...a.Instance.Arguments },
                RenderedSQL: a.Instance.RenderedSQL,
            })),
        };
    }
}

