import { Arg, Ctx, Query, Resolver, Field, Int, InputType } from 'type-graphql';
import { LogError } from '@memberjunction/core';
import type { DatabaseProviderBase, RunQueryResult, UserInfo } from '@memberjunction/core';
import { RenderPipeline } from '@memberjunction/generic-database-provider';
import type { AdhocSQLAuthorizer } from '@memberjunction/actions';
import { AppContext } from '../types.js';
import { configInfo } from '../config.js';
import { GetReadOnlyProvider } from '../util.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { IsScopeLimitedPrincipal } from '../auth/scopeLimitedPrincipal.js';
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
 * - Authorizes the RENDERED SQL: every table reference must be an entity base view the caller
 *   reads unscoped (CanRead, no row-level filter, no denied fields). Entities with row/field
 *   policy for this user are refused — raw SQL cannot apply that policy, so those reads belong
 *   on RunView.
 * - Read-only provider only (no fallback to read-write)
 * - Configurable timeout (default 30s), enforced by the database
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
        // SECURITY: refuse principals whose read authority is narrower than their role grant.
        // Ad-hoc SQL does not go through RunView, entity permissions or row-level security, so the
        // RLS scope tokens that confine a magic-link session are never substituted. There is no
        // filter to narrow, so the only correct answer for such a principal is no.
        if (IsScopeLimitedPrincipal(context.userPayload?.userRecord)) {
            return this.buildErrorResult('Ad-hoc SQL execution is not permitted for scope-limited sessions.');
        }
        const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: false });
        if (!provider) {
            return this.buildErrorResult('No read-only data source available for ad-hoc query execution');
        }
        const contextUser = context.userPayload?.userRecord;
        const refusal = this.AuthorizeRenderedSQL(input.SQL, provider, contextUser);
        if (refusal) {
            return this.buildErrorResult(refusal, Date.now() - startTime);
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
            }, contextUser);
            return this.toResultType(result, startRow, input.MaxRows, timeoutSeconds, Date.now() - startTime);
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            LogError(`Ad-hoc query execution failed: ${errorMessage}`);
            return this.buildErrorResult(`Query execution failed: ${errorMessage}`, Date.now() - startTime);
        }
    }

    /**
     * SECURITY: authorizes the READ itself, against the SQL that will actually run. The provider
     * validates that the SQL is a single read statement but places no restriction on WHAT is read.
     * Rendering comes first because composition (`{{query:"..."}}`) and templates can introduce
     * table references the raw input never named. Every table reference must be an entity base
     * view the caller can read UNSCOPED — CanRead with no row-level filter and no denied fields —
     * because raw SQL applies neither (see assertFullQueryUsesReadableEntityViews). The provider
     * renders the same input the same way and only wraps it in server-built paging and a count,
     * so the rendered SQL is the full set of reads. Returns the refusal message, or null.
     *
     * `provider` is the read-only provider the SQL will run on; it supplies the platform and the
     * entity metadata. {@link CreateAdhocSQLAuthorizer} exposes this check to the action engine.
     */
    public AuthorizeRenderedSQL(sqlText: string, provider: DatabaseProviderBase, contextUser: UserInfo | undefined): string | null {
        try {
            const rendered = RenderPipeline.Run(sqlText, { Platform: provider.PlatformKey, ContextUser: contextUser, RequireReadStatement: true });
            this.assertFullQueryUsesReadableEntityViews(rendered.Trace.AfterTemplates, provider, contextUser, 'ad-hoc SQL');
            return null;
        } catch (err) {
            return err instanceof Error ? err.message : String(err);
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

/**
 * The ad-hoc SQL checks MJServer registers with the action engine, so that Run Ad-hoc Query applies
 * the same checks as {@link AdhocQueryResolver.ExecuteAdhocQuery}: the rendered SQL must be one read
 * statement that reads only entity views the caller may read in full, and the timeout is limited by
 * the server's request timeout.
 * @param requestTimeoutMs the server's request timeout in milliseconds; 0 or less means no limit
 */
export function CreateAdhocSQLAuthorizer(requestTimeoutMs: number): AdhocSQLAuthorizer {
    const resolver = new AdhocQueryResolver();
    return {
        Authorize: (sql, provider, contextUser) => resolver.AuthorizeRenderedSQL(sql, provider, contextUser),
        ClampTimeoutSeconds: (requestedSeconds) => ClampAdhocTimeoutSeconds(requestedSeconds, requestTimeoutMs),
    };
}
