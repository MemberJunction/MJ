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

            // 3. Execute with timeout
            const timeoutMs = (input.TimeoutSeconds ?? 30) * 1000;
            const request = new sql.Request(readOnlyDS);

            const result = await Promise.race([
                request.query(input.SQL),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Query timeout exceeded')), timeoutMs)
                )
            ]);
            const executionTimeMs = Date.now() - startTime;

            // 4. Return as RunQueryResultType
            return {
                QueryID: '',
                QueryName: 'Ad-Hoc Query',
                Success: true,
                Results: JSON.stringify(result.recordset ?? []),
                RowCount: result.recordset?.length ?? 0,
                TotalRowCount: result.recordset?.length ?? 0,
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
            ExecutionTime: 0,
            ErrorMessage: errorMessage
        };
    }
}
