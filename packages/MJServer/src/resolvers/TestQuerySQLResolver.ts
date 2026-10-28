import { Arg, Ctx, Field, InputType, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { GraphQLJSONObject } from 'graphql-type-json';
import { RunQuery, IRunQueryProvider, LogError, LogStatus, QueryExecutionSpec } from '@memberjunction/core';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { RenderPipeline } from '@memberjunction/generic-database-provider';
import { AppContext } from '../types.js';
import { GetReadOnlyProvider } from '../util.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';

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

    @Field(() => String, { nullable: true, description: 'The fully rendered SQL that was executed against the database. On error, reveals transformations (composition, templates, MaxRows wrapping) that may have caused the failure.' })
    RenderedSQL?: string;
}

/**
 * Resolver for testing transient (unsaved) query SQL with full composition + Nunjucks template processing.
 *
 * This resolver exposes the lower-layer spec-based execution pipeline via GraphQL,
 * enabling external systems (e.g., Skip-Brain) to test query SQL before saving to the database.
 *
 * Security:
 * - Requires `query:test` scope for API key users (no-op for JWT auth)
 * - Refuses scope-limited principals (see {@link IsScopeLimitedPrincipal}). Raw SQL bypasses
 *   RunView, entity permissions and row-level security, so the RLS scope tokens that confine a
 *   magic-link session are never applied on this path — there is no narrower filter to fall back
 *   to, only refusal.
 * - Authorizes the RENDERED SQL: every table reference must be an entity base view the caller
 *   reads unscoped (CanRead, no row-level filter, no denied fields). Entities with row/field
 *   policy for this user are refused — raw SQL cannot apply that policy, so those reads belong
 *   on RunView. Same screen as {@link AdhocQueryResolver.ExecuteAdhocQuery}.
 * - Uses read-only database connection (no mutation possible)
 * - Enforces MaxRows limit (default 100) to prevent unbounded queries
 *
 * @see https://github.com/MemberJunction/MJ/issues/2172
 */
@Resolver()
export class TestQuerySQLResolver extends ResolverBase {
    @Query(() => TestQuerySQLResult, {
        description: 'Test transient SQL with full composition + Nunjucks template processing without requiring a saved query'
    })
    async TestQuerySQL(
        @Arg('input', () => TestQuerySQLInput) input: TestQuerySQLInput,
        @Ctx() context: AppContext
    ): Promise<TestQuerySQLResult> {
        try {
            await this.CheckAPIKeyScopeAuthorization('query:test', '*', context.userPayload);
            // SECURITY: refuse principals whose read authority is narrower than their role grant.
            // Transient test SQL does not go through RunView, entity permissions or row-level
            // security, so the RLS scope tokens that confine a magic-link session are never
            // substituted. There is no filter to narrow, so the only correct answer for such a
            // principal is no — the same refusal ExecuteAdhocQuery applies.
            if (IsScopeLimitedPrincipal(context.userPayload?.userRecord)) {
                return this.buildErrorResult('Ad-hoc SQL execution is not permitted for scope-limited sessions.');
            }
            // Use read-only provider for security — no mutation possible
            const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: false });
            if (!provider) {
                return this.buildErrorResult('Read-only data source is not available. TestQuerySQL requires a read-only connection for security.');
            }

            const contextUser = context.userPayload?.userRecord;
            const refusal = this.AuthorizeRenderedTestSQL(input, provider, contextUser);
            if (refusal) {
                return this.buildErrorResult(refusal);
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

            const result = await rq.ExecuteFromSpec(spec, contextUser);

            return {
                Success: result.Success,
                // fls-guard: query rows; the SQL is refused before it runs if it reads a field the caller is denied
                Results: result.Results ? JSON.stringify(result.Results) : undefined,
                RowCount: result.RowCount,
                ExecutionTime: result.ExecutionTime,
                ErrorMessage: result.ErrorMessage || undefined,
                AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
                RenderedSQL: result.RenderedSQL || undefined,
            };
        } catch (err) {
            LogError(err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            return this.buildErrorResult(`TestQuerySQL failed: ${errorMessage}`);
        }
    }

    /**
     * SECURITY: authorizes the READ itself, against the SQL that will actually run — the same
     * screen `AdhocQueryResolver.AuthorizeRenderedSQL` applies to ad-hoc SQL. Rendering comes
     * first because composition (`{{query:"..."}}`), inline dependencies and Nunjucks templates
     * can introduce table references the raw input never named, so the render here uses the same
     * Parameters / UsesTemplate / Dependencies the execution spec will. Every table reference in
     * the rendered SQL must be an entity base view the caller can read UNSCOPED — CanRead with no
     * row-level filter and no denied fields — because raw SQL applies neither (see
     * `assertFullQueryUsesReadableEntityViews`). The provider renders the same input the same way
     * and only wraps it in server-built MaxRows capping, so the rendered SQL is the full set of
     * reads. Returns the refusal message, or null.
     */
    public AuthorizeRenderedTestSQL(input: TestQuerySQLInput, provider: DatabaseProviderBase, contextUser: UserInfo | undefined): string | null {
        try {
            const rendered = RenderPipeline.Run(input.SQL, {
                Platform: provider.PlatformKey,
                ContextUser: contextUser,
                Parameters: input.Parameters,
                UsesTemplate: input.UsesTemplate,
                Dependencies: input.Dependencies,
                OriginalSQL: input.SQL,
                RequireReadStatement: true,
            });
            this.assertFullQueryUsesReadableEntityViews(rendered.Trace.AfterTemplates, provider, contextUser, 'transient test SQL');
            return null;
        } catch (err) {
            return err instanceof Error ? err.message : String(err);
        }
    }

    /** Builds a failed TestQuerySQLResult carrying the given message. */
    private buildErrorResult(errorMessage: string): TestQuerySQLResult {
        return {
            Success: false,
            RowCount: 0,
            ExecutionTime: 0,
            ErrorMessage: errorMessage,
        };
    }
}
