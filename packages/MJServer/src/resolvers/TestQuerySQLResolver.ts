import { Arg, Ctx, Field, InputType, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { GraphQLJSONObject } from 'graphql-type-json';
import { RunQuery, IRunQueryProvider, LogError, LogStatus, QueryExecutionSpec } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GetReadOnlyProvider } from '../util.js';
import { ResolverBase } from '../generic/ResolverBase.js';

/**
 * GraphQL input type for inline dependency queries.
 * Self-referencing to support recursive dependency trees.
 */
@InputType()
export class QueryDependencySpecInput {
    @Field(() => String, { description: 'Query name as referenced in the composition token' })
    Name: string;

    @Field(() => String, { description: 'Category path as referenced in the composition token (e.g., "/Analytics/Sales/")' })
    CategoryPath: string;

    @Field(() => String, { description: 'The raw SQL for this dependency' })
    SQL: string;

    @Field(() => Boolean, { nullable: true, description: 'Whether this dependency uses Nunjucks template syntax' })
    UsesTemplate?: boolean;

    @Field(() => GraphQLJSONObject, { nullable: true, description: 'Parameters for this dependency\'s Nunjucks templates' })
    Parameters?: Record<string, string>;

    @Field(() => [QueryDependencySpecInput], { nullable: true, description: 'Nested dependencies (recursive)' })
    Dependencies?: QueryDependencySpecInput[];
}

/**
 * GraphQL input type for transient query execution.
 * Accepts the full QueryExecutionSpec shape for testing unsaved queries
 * with composition + Nunjucks template processing.
 */
@InputType()
export class TestQuerySQLInput {
    @Field(() => String, { description: 'The raw SQL — may contain {{query:"..."}} and {{ param }} tokens' })
    SQL: string;

    @Field(() => GraphQLJSONObject, { nullable: true, description: 'Parameter values for Nunjucks template substitution' })
    Parameters?: Record<string, string>;

    @Field(() => Boolean, { nullable: true, description: 'Whether this query uses Nunjucks template syntax' })
    UsesTemplate?: boolean;

    @Field(() => [QueryDependencySpecInput], { nullable: true, description: 'Inline dependency queries for composition resolution' })
    Dependencies?: QueryDependencySpecInput[];

    @Field(() => Int, { nullable: true, defaultValue: 100, description: 'Max rows to return (default: 100)' })
    MaxRows?: number;
}

/**
 * GraphQL output type for transient query execution results.
 */
@ObjectType()
export class TestQuerySQLResult {
    @Field(() => Boolean, { description: 'Whether the query executed successfully' })
    Success: boolean;

    @Field(() => String, { nullable: true, description: 'JSON-stringified result rows' })
    Results?: string;

    @Field(() => Int, { description: 'Number of rows returned' })
    RowCount: number;

    @Field(() => Int, { description: 'Execution time in milliseconds' })
    ExecutionTime: number;

    @Field(() => String, { nullable: true, description: 'Error message if execution failed' })
    ErrorMessage?: string;

    @Field(() => String, { nullable: true, description: 'JSON-stringified applied parameters including defaults' })
    AppliedParameters?: string;
}

/**
 * Resolver for testing transient (unsaved) query SQL with full composition + Nunjucks template processing.
 *
 * This resolver exposes the lower-layer spec-based execution pipeline via GraphQL,
 * enabling external systems (e.g., Skip-Brain) to test query SQL before saving to the database.
 *
 * Security:
 * - Requires system user authentication (@RequireSystemUser)
 * - Uses read-only database connection (no mutation possible)
 * - Enforces MaxRows limit (default 100) to prevent unbounded queries
 *
 * @see https://github.com/MemberJunction/MJ/issues/2172
 */
@Resolver()
export class TestQuerySQLResolver extends ResolverBase {
    @RequireSystemUser()
    @Query(() => TestQuerySQLResult, {
        description: 'Test transient SQL with full composition + Nunjucks template processing without requiring a saved query'
    })
    async TestQuerySQL(
        @Arg('input', () => TestQuerySQLInput) input: TestQuerySQLInput,
        @Ctx() context: AppContext
    ): Promise<TestQuerySQLResult> {
        try {
            // Use read-only provider for security — no mutation possible
            const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: false });
            if (!provider) {
                return {
                    Success: false,
                    RowCount: 0,
                    ExecutionTime: 0,
                    ErrorMessage: 'Read-only data source is not available. TestQuerySQL requires a read-only connection for security.',
                };
            }

            const rq = new RunQuery(provider as unknown as IRunQueryProvider);

            const spec: QueryExecutionSpec = {
                SQL: input.SQL,
                Parameters: input.Parameters,
                UsesTemplate: input.UsesTemplate,
                Dependencies: input.Dependencies,
                MaxRows: input.MaxRows ?? 100,
            };

            LogStatus(`TestQuerySQL: Executing transient query (MaxRows=${spec.MaxRows}, UsesTemplate=${spec.UsesTemplate ?? false}, Dependencies=${spec.Dependencies?.length ?? 0})`);

            const result = await rq.ExecuteFromSpec(spec, context.userPayload.userRecord);

            return {
                Success: result.Success,
                Results: result.Results ? JSON.stringify(result.Results) : undefined,
                RowCount: result.RowCount,
                ExecutionTime: result.ExecutionTime,
                ErrorMessage: result.ErrorMessage || undefined,
                AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
            };
        } catch (err) {
            LogError(err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            return {
                Success: false,
                RowCount: 0,
                ExecutionTime: 0,
                ErrorMessage: `TestQuerySQL failed: ${errorMessage}`,
            };
        }
    }
}
