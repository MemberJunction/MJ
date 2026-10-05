import { Arg, Ctx, Query, Resolver, Field, Int, InputType } from 'type-graphql';
import { LogError } from '@memberjunction/core';
import type { RunQueryResult } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { configInfo } from '../config.js';
import { GetReadOnlyProvider } from '../util.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RunQueryResultType } from './QueryResolver.js';
import { ClampAdhocTimeoutSeconds } from './adhocTimeout.js';

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
 * The query runs through the read-only provider's own ad-hoc path (`RunQuery` with `SQL`), the
 * same one in-process callers use, so it behaves identically on every database platform: the SQL
 * is validated and rendered there, paged in the database with a count, run under the caller's
 * timeout, and on PostgreSQL inside a read-only transaction that is rolled back.
 *
 * Security:
 * - SQL validated by the provider (SQLExpressionValidator, single read query) — blocks mutations
 * - Read-only provider only (no fallback to read-write)
 * - Configurable timeout (default 30s), enforced by the database
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
        const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: false });
        if (!provider) {
            return this.buildErrorResult('No read-only data source available for ad-hoc query execution');
        }
        const timeoutSeconds = ClampAdhocTimeoutSeconds(input.TimeoutSeconds, configInfo.databaseSettings.requestTimeout);
        // A negative offset must not reach paging, where it would turn paging off.
        const startRow = Math.max(0, Number.isInteger(input.StartRow) ? input.StartRow! : 0);
        try {
            const result = await provider.RunQuery({
                SQL: input.SQL,
                MaxRows: input.MaxRows,
                StartRow: startRow,
                TimeoutSeconds: timeoutSeconds,
            }, context.userPayload?.userRecord);
            return this.toResultType(result, startRow, input.MaxRows, timeoutSeconds, Date.now() - startTime);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            LogError(`Ad-hoc query execution failed: ${errorMessage}`);
            return this.buildErrorResult(`Query execution failed: ${errorMessage}`, Date.now() - startTime);
        }
    }

    /** Maps the provider's result to the GraphQL shape, naming a timeout plainly. */
    private toResultType(
        result: RunQueryResult,
        startRow: number,
        maxRows: number | undefined,
        timeoutSeconds: number,
        executionTimeMs: number,
    ): RunQueryResultType {
        if (!result.Success) {
            const message = result.ErrorMessage ?? 'Ad-hoc query failed';
            return this.buildErrorResult(
                /timeout/i.test(message) ? `Query execution exceeded ${timeoutSeconds} second timeout` : message,
                executionTimeMs,
            );
        }
        const paged = maxRows != null && Number.isInteger(maxRows) && maxRows > 0;
        return {
            QueryID: '',
            QueryName: 'Ad-Hoc Query',
            Success: true,
            Results: JSON.stringify(result.Results),
            RowCount: result.RowCount,
            TotalRowCount: result.TotalRowCount,
            PageNumber: paged ? Math.floor(startRow / maxRows!) + 1 : undefined,
            PageSize: paged ? maxRows : undefined,
            ExecutionTime: executionTimeMs,
            ErrorMessage: ''
        };
    }

    private buildErrorResult(errorMessage: string, executionTimeMs = 0): RunQueryResultType {
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
            ErrorMessage: errorMessage
        };
    }
}
