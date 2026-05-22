import { Arg, Ctx, Query, Resolver, Field, Int, InputType } from 'type-graphql';
import { LogError } from '@memberjunction/core';
import { SQLExpressionValidator } from '@memberjunction/global';
import { AppContext } from '../types.js';
import { GetReadOnlyDataSource } from '../util.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RunQueryResultType } from './QueryResolver.js';
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

    @Field(() => Int, { nullable: true, description: 'Maximum number of rows to return. Applied in-memory after SQL execution; SQL still runs unbounded server-side.' })
    MaxRows?: number;

    @Field(() => Int, { nullable: true, description: 'Zero-based offset for pagination. Used in conjunction with MaxRows.' })
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

            // 3. Build executable SQL. When MaxRows is provided, wrap in a derived table
            // with outer TOP so the engine can short-circuit at the source instead of
            // scanning the full result. Skipped for SQL that begins with WITH/CTE — those
            // can't be nested in a derived table on SQL Server and fall through to the
            // in-memory slice below.
            const startRow = input.StartRow ?? 0;
            const maxRows = input.MaxRows;
            const canWrap =
                maxRows != null &&
                Number.isInteger(maxRows) &&
                maxRows > 0 &&
                Number.isInteger(startRow) &&
                startRow >= 0 &&
                !/^\s*WITH\b/i.test(input.SQL);
            const executableSql = canWrap
                ? `SELECT TOP ${startRow + maxRows} * FROM (\n${input.SQL}\n) AS _adhoc_capped`
                : input.SQL;

            // 4. Execute with timeout
            const timeoutMs = (input.TimeoutSeconds ?? 30) * 1000;
            const request = new sql.Request(readOnlyDS);

            const result = await Promise.race([
                request.query(executableSql),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Query timeout exceeded')), timeoutMs)
                )
            ]);
            const executionTimeMs = Date.now() - startTime;

            // 5. Apply in-memory pagination. With the wrap applied this is a no-op for
            // first-page reads; for StartRow > 0 (or CTE-headed SQL where the wrap was
            // skipped) it carves out the requested page.
            const fullRecordset = result.recordset ?? [];
            const totalRowCount = fullRecordset.length;
            let paginated = fullRecordset;
            if (startRow > 0) paginated = paginated.slice(startRow);
            if (maxRows != null && maxRows > 0) paginated = paginated.slice(0, maxRows);

            // 6. Return as RunQueryResultType
            return {
                QueryID: '',
                QueryName: 'Ad-Hoc Query',
                Success: true,
                Results: JSON.stringify(paginated),
                RowCount: paginated.length,
                TotalRowCount: totalRowCount,
                PageNumber: maxRows != null && maxRows > 0 ? Math.floor(startRow / maxRows) + 1 : undefined,
                PageSize: maxRows ?? undefined,
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
