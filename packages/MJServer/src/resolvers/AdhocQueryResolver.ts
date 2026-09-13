import { Arg, Ctx, Query, Resolver, Field, Int, InputType } from 'type-graphql';
import { DatabaseProviderBase, LogError, ResolvePlatformKey } from '@memberjunction/core';
import { SQLExpressionValidator } from '@memberjunction/global';
import { RenderPipeline } from '@memberjunction/generic-database-provider';
import { AppContext } from '../types.js';
import { GetReadOnlyProvider } from '../util.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';
import { RunQueryResultType } from './QueryResolver.js';
import { exactTotalFromPage, resolveAdhocTotalRowCount } from './adhoc-query-helpers.js';

/**
 * Input type for executing ad-hoc SQL queries directly.
 * The SQL is validated server-side to ensure it's a safe SELECT/WITH statement.
 */
@InputType()
class AdhocQueryInput {
    @Field(() => String, { description: 'SQL query to execute. Must be a SELECT or WITH (CTE) statement.' })
    SQL: string;

    @Field(() => Int, { nullable: true, description: 'Query timeout in seconds. Defaults to 30.' })
    TimeoutSeconds?: number;

    @Field(() => Int, { nullable: true, description: 'Maximum number of rows to return; applied at the database via the render pipeline.' })
    MaxRows?: number;

    @Field(() => Int, { nullable: true, description: 'Zero-based offset for pagination. Whenever MaxRows > 0 the query is paged via OFFSET/FETCH — including the first page (StartRow 0).' })
    StartRow?: number;
}

/**
 * Resolver for executing ad-hoc (unsaved) SQL queries.
 *
 * Security:
 * - SQL validated via SQLExpressionValidator (full_query context) — blocks mutations, dangerous operations
 * - Executes on the read-only PROVIDER only (no fallback to read-write)
 * - Configurable timeout (default 30s)
 * - Requires authenticated user (standard GraphQL auth, no @RequireSystemUser)
 * - Refuses scope-limited principals (see {@link IsScopeLimitedPrincipal}). Raw SQL bypasses
 *   RunView, entity permissions and row-level security, so the RLS scope tokens that confine a
 *   magic-link session are never applied on this path — there is no narrower filter to fall back
 *   to, only refusal.
 *
 * Auto-discovered by MJServer's dynamic resolver import.
 */
@Resolver()
export class AdhocQueryResolver extends ResolverBase {
    @Query(() => RunQueryResultType)
    async ExecuteAdhocQuery(
        @Arg('input', () => AdhocQueryInput) input: AdhocQueryInput,
        @Ctx() context: AppContext
    ): Promise<RunQueryResultType> {
        const startTime = Date.now();

        try {
            // 1. SECURITY: refuse principals whose read authority is narrower than their role
            // grant. This resolver runs a raw SELECT on the read-only pool — it does NOT go
            // through RunView, entity permissions or row-level security, so the RLS scope tokens
            // that confine a magic-link session are never substituted here. There is no filter
            // to narrow, so the only correct answer for such a principal is no. Checked before
            // the SQL is even validated: authorization gates the work, it does not race it.
            if (IsScopeLimitedPrincipal(context.userPayload?.userRecord)) {
                return this.buildErrorResult('Ad-hoc SQL execution is not permitted for scope-limited sessions.');
            }

            // 2. Security: validate SQL using SQLExpressionValidator
            const validator = SQLExpressionValidator.Instance;
            const validation = validator.validateFullQuery(input.SQL);
            if (!validation.valid) {
                return this.buildErrorResult(validation.error || 'SQL validation failed');
            }

            // 3/4. Resolve the READ-ONLY PROVIDER (no fallback to read-write). ONE object
            // answers both questions this resolver has to ask: which dialect to render,
            // and what to execute the rendered SQL on.
            //
            // This used to demand a SQL Server connection pool (an mssql one) from
            // `context.dataSources` before it would run anything. A PostgreSQL tenant
            // never populates that, so every ad-hoc query on PG failed at this gate with
            // "No read-only data source available" and the caller rendered stale/cached
            // data. `provider.ExecuteSQL` is declared on DatabaseProviderBase and is
            // implemented by every platform, so routing through the provider makes this
            // path platform-agnostic instead of platform-assuming.
            let roProvider: DatabaseProviderBase | null = null;
            try {
                roProvider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: false });
            } catch {
                roProvider = null;
            }
            if (!roProvider) {
                return this.buildErrorResult('No read-only data source available for ad-hoc query execution');
            }

            // The dialect the SQL is rendered for is the dialect of the connection it
            // will be executed on — by construction, from the same provider.
            const platform = ResolvePlatformKey(roProvider);
            const contextUser = context.userPayload?.userRecord;

            // 5. Route the SQL through RenderPipeline so composition tokens
            // resolve, comments and templates are processed, and the row cap
            // is applied at the database (via TOP / LIMIT / OFFSET-FETCH).
            //
            // Page whenever a positive MaxRows is requested — INCLUDING the first
            // page (StartRow 0). This yields OFFSET/FETCH data SQL *and* a
            // COUNT(*) query so the response reports the true total row count
            // rather than just the returned page size. It mirrors the saved-query
            // path (GenericDatabaseProvider.InternalRunQuery → WrapWithPaging).
            // (Previously paging was gated on StartRow > 0, so page 1 fell back to
            // a TOP-N cap with TotalRowCount = page size — hiding the pager.)
            // Clamp StartRow to a non-negative integer. A negative offset must not slip
            // past the paging gate (which would then run the query with no row cap at all).
            const startRow = Math.max(0, Number.isInteger(input.StartRow) ? input.StartRow! : 0);
            const maxRows = input.MaxRows;
            const usePaging = maxRows != null && Number.isInteger(maxRows) && maxRows > 0;

            let dataSQL: string;
            let countSQL: string | null = null;
            try {
                const rendered = RenderPipeline.Run(input.SQL, {
                    Platform: platform,
                    ContextUser: contextUser,
                    ...(usePaging ? { Paging: { StartRow: startRow, MaxRows: maxRows! } } : {}),
                });
                dataSQL = rendered.FinalSQL;
                countSQL = rendered.PagingResult?.CountSQL ?? null;
            } catch (renderErr) {
                const renderMsg = renderErr instanceof Error ? renderErr.message : String(renderErr);
                return this.buildErrorResult(`Ad-hoc query rendering failed: ${renderMsg}`);
            }

            // 6. Execute the page (and, only when a full page needs it, the count) under
            // a shared wall-clock deadline derived from the request's timeout budget.
            const deadline = startTime + (input.TimeoutSeconds ?? 30) * 1000;
            const { recordset, totalRowCount } = await this.executeDataAndCount(
                roProvider, dataSQL, countSQL, startRow, usePaging ? maxRows! : null, deadline
            );
            const executionTimeMs = Date.now() - startTime;

            // 7. Return as RunQueryResultType
            return {
                QueryID: '',
                QueryName: 'Ad-Hoc Query',
                Success: true,
                Results: JSON.stringify(recordset),
                RowCount: recordset.length,
                TotalRowCount: totalRowCount,
                PageNumber: usePaging ? Math.floor(startRow / maxRows!) + 1 : undefined,
                PageSize: usePaging ? maxRows! : undefined,
                ExecutionTime: executionTimeMs,
                ErrorMessage: ''
            };
        } catch (err: unknown) {
            const executionTimeMs = Date.now() - startTime;
            const errorMessage = err instanceof Error ? err.message : String(err);

            // Handle timeout
            if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
                return {
                    QueryID: '',
                    QueryName: 'Ad-Hoc Query',
                    Success: false,
                    Results: '[]',
                    RowCount: 0,
                    TotalRowCount: 0,
                    PageNumber: undefined,
                    PageSize: undefined,
                    ExecutionTime: executionTimeMs,
                    ErrorMessage: `Query execution exceeded ${input.TimeoutSeconds ?? 30} second timeout`
                };
            }

            LogError(`Ad-hoc query execution failed: ${errorMessage}`);
            return {
                QueryID: '',
                QueryName: 'Ad-Hoc Query',
                Success: false,
                Results: '[]',
                RowCount: 0,
                TotalRowCount: 0,
                PageNumber: undefined,
                PageSize: undefined,
                ExecutionTime: executionTimeMs,
                ErrorMessage: `Query execution failed: ${errorMessage}`
            };
        }
    }

    /**
     * Runs the page's data SQL, then — only when the page is FULL (so more rows may
     * exist) — a COUNT(*) for the true total. A short (or unpaged) page needs no
     * count: the exact total is `startRow + rowsReturned` (see {@link exactTotalFromPage}).
     *
     * The count is NON-FATAL: some queries page fine but cannot be counted — e.g.
     * duplicate column names are legal in a result set but rejected inside the COUNT
     * CTE wrap. A count failure must never sink the whole result, so we log it and
     * report a lower-bound total (`startRow + rowsReturned`) and let the data render.
     */
    private async executeDataAndCount(
        provider: DatabaseProviderBase,
        dataSQL: string,
        countSQL: string | null,
        startRow: number,
        maxRows: number | null,
        deadline: number,
    ): Promise<{ recordset: Record<string, unknown>[]; totalRowCount: number }> {
        const recordset = await this.runSqlWithDeadline<Record<string, unknown>>(provider, dataSQL, deadline);

        // Total already known from the page alone (unpaged, or a short page)? Skip the count.
        const exact = exactTotalFromPage(startRow, recordset.length, maxRows);
        if (exact != null || !countSQL) {
            return { recordset, totalRowCount: exact ?? recordset.length };
        }

        // Full page — a COUNT(*) is required to know the true total.
        const lowerBound = startRow + recordset.length;
        try {
            const countRows = await this.runSqlWithDeadline<{ TotalRowCount: number }>(provider, countSQL, deadline);
            return { recordset, totalRowCount: resolveAdhocTotalRowCount(countRows, lowerBound) };
        } catch (countErr) {
            const msg = countErr instanceof Error ? countErr.message : String(countErr);
            LogError(`Ad-hoc query row-count failed; reporting a lower-bound total (${lowerBound}). ${msg}`);
            return { recordset, totalRowCount: lowerBound };
        }
    }

    /**
     * Executes one SQL statement on the read-only PROVIDER, racing it against the
     * shared wall-clock `deadline`. The timer is always cleared on completion so a
     * settled query never leaves a dangling timeout armed.
     *
     * Goes through `provider.ExecuteSQL` rather than an `mssql` Request, so the same
     * code runs on SQL Server and PostgreSQL.
     */
    private async runSqlWithDeadline<T>(
        provider: DatabaseProviderBase,
        sqlText: string,
        deadline: number,
    ): Promise<T[]> {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            throw new Error('Query timeout exceeded');
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const rows = await Promise.race([
                provider.ExecuteSQL<T>(sqlText),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Query timeout exceeded')), remaining);
                }),
            ]);
            return Array.isArray(rows) ? rows : [];
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    }

    private buildErrorResult(errorMessage: string): RunQueryResultType {
        return {
            QueryID: '',
            QueryName: 'Ad-Hoc Query',
            Success: false,
            Results: '[]',
            RowCount: 0,
            TotalRowCount: 0,
            PageNumber: undefined,
            PageSize: undefined,
            ExecutionTime: 0,
            ErrorMessage: errorMessage
        };
    }
}
