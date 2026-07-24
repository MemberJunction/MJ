import { Arg, Ctx, Query, Resolver, Field, Int, InputType } from 'type-graphql';
import { DatabasePlatform, LogError } from '@memberjunction/core';
import { SQLExpressionValidator } from '@memberjunction/global';
import { RenderPipeline } from '@memberjunction/generic-database-provider';
import { AppContext } from '../types.js';
import { GetReadOnlyDataSource, GetReadOnlyProvider } from '../util.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RunQueryResultType } from './QueryResolver.js';
import { exactTotalFromPage, resolveAdhocTotalRowCount } from './adhoc-query-helpers.js';
import sql from 'mssql';

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
 * - Executes on read-only connection pool only (no fallback to read-write)
 * - Configurable timeout (default 30s)
 * - Requires authenticated user (standard GraphQL auth, no @RequireSystemUser)
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
            // 1. Security: validate SQL using SQLExpressionValidator
            const validator = SQLExpressionValidator.Instance;
            const validation = validator.validateFullQuery(input.SQL);
            if (!validation.valid) {
                return this.buildErrorResult(validation.error || 'SQL validation failed');
            }

            // 2. Get READ-ONLY data source (no fallback to read-write)
            let readOnlyDS: sql.ConnectionPool;
            try {
                readOnlyDS = GetReadOnlyDataSource(context.dataSources, { allowFallbackToReadWrite: false });
            } catch {
                return this.buildErrorResult('No read-only data source available for ad-hoc query execution');
            }

            // 3. Resolve platform from the read-only provider for the render pipeline.
            let platform: DatabasePlatform = 'sqlserver';
            try {
                const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: false });
                if (provider?.PlatformKey) platform = provider.PlatformKey;
            } catch {
                // Provider not configured — keep the default platform.
            }
            const contextUser = context.userPayload?.userRecord;

            // 4. Route the SQL through RenderPipeline so composition tokens
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

            // 5. Execute the page (and, only when a full page needs it, the count) under
            // a shared wall-clock deadline derived from the request's timeout budget.
            const deadline = startTime + (input.TimeoutSeconds ?? 30) * 1000;
            const { recordset, totalRowCount } = await this.executeDataAndCount(
                readOnlyDS, dataSQL, countSQL, startRow, usePaging ? maxRows! : null, deadline
            );
            const executionTimeMs = Date.now() - startTime;

            // 6. Return as RunQueryResultType
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
        ds: sql.ConnectionPool,
        dataSQL: string,
        countSQL: string | null,
        startRow: number,
        maxRows: number | null,
        deadline: number,
    ): Promise<{ recordset: Record<string, unknown>[]; totalRowCount: number }> {
        const dataResult = await this.runSqlWithDeadline<Record<string, unknown>>(ds, dataSQL, deadline);
        const recordset = (dataResult.recordset ?? []) as Record<string, unknown>[];

        // Total already known from the page alone (unpaged, or a short page)? Skip the count.
        const exact = exactTotalFromPage(startRow, recordset.length, maxRows);
        if (exact != null || !countSQL) {
            return { recordset, totalRowCount: exact ?? recordset.length };
        }

        // Full page — a COUNT(*) is required to know the true total.
        const lowerBound = startRow + recordset.length;
        try {
            const countResult = await this.runSqlWithDeadline<{ TotalRowCount: number }>(ds, countSQL, deadline);
            return { recordset, totalRowCount: resolveAdhocTotalRowCount(countResult.recordset, lowerBound) };
        } catch (countErr) {
            const msg = countErr instanceof Error ? countErr.message : String(countErr);
            LogError(`Ad-hoc query row-count failed; reporting a lower-bound total (${lowerBound}). ${msg}`);
            return { recordset, totalRowCount: lowerBound };
        }
    }

    /**
     * Executes one SQL statement on the read-only pool, racing it against the shared
     * wall-clock `deadline`. The timer is always cleared on completion so a settled
     * query never leaves a dangling timeout armed.
     */
    private async runSqlWithDeadline<T>(
        ds: sql.ConnectionPool,
        sqlText: string,
        deadline: number,
    ): Promise<sql.IResult<T>> {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            throw new Error('Query timeout exceeded');
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                new sql.Request(ds).query<T>(sqlText),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Query timeout exceeded')), remaining);
                }),
            ]);
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
