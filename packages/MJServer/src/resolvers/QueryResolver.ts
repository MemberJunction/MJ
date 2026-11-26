import { Arg, Ctx, ObjectType, Query, Resolver, Field, Int, InputType, AuthorizationError } from 'type-graphql';
import { RunQuery, IRunQueryProvider, IMetadataProvider, RunQueryParams, LogError, RunQueryWithCacheCheckParams, RunQueriesWithCacheCheckResponse, RunQueryWithCacheCheckResult, RunQueryEnrichment } from '@memberjunction/core';
import { AppContext, UserPayload } from '../types.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GraphQLJSONObject } from 'graphql-type-json';
import { Metadata } from '@memberjunction/core';
import { MJQueryEntity, QueryEngine } from '@memberjunction/core-entities';
import { GetReadOnlyProvider } from '../util.js';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RefuseScopeLimitedPrincipals } from '../auth/scopeLimitedAccess.js';
import {
  GetImpersonationSession,
  IsSavedQueryForbiddenDuringImpersonation,
  MAX_IMPERSONATION_SAVED_QUERY_SQL_LENGTH,
} from '../auth/impersonationGuard.js';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

/** Upper bound on characters inspected within a single `{{query:"..."}}` composition token. */
const MAX_COMPOSITION_TOKEN_LENGTH = 2048;

export interface ComposedQueryScanResult {
  readonly References: readonly string[];
  readonly ExceededLengthCap: boolean;
}

/**
 * Linear-time (O(n), regex-free) scanner extracting inline `{{query:"Category/Name(args)"}}`
 * composition references from saved SQL. Enforces `maxSqlLength` so oversized stored queries
 * fail closed during impersonation instead of consuming unbounded CPU.
 */
export function ExtractComposedQueryReferences(
  sql: string,
  maxSqlLength: number = MAX_IMPERSONATION_SAVED_QUERY_SQL_LENGTH
): ComposedQueryScanResult {
  if (!sql) {
    return { References: [], ExceededLengthCap: false };
  }
  if (sql.length > maxSqlLength) {
    return { References: [], ExceededLengthCap: true };
  }

  const references: string[] = [];
  const len = sql.length;
  let cursor = 0;

  while (cursor < len) {
    const openIdx = sql.indexOf('{{', cursor);
    if (openIdx === -1) {
      break;
    }

    let i = openIdx + 2;
    const tokenLimit = Math.min(len, openIdx + MAX_COMPOSITION_TOKEN_LENGTH);

    // Skip whitespace before `query`
    while (i < tokenLimit && sql.charCodeAt(i) <= 32) {
      i++;
    }

    // Match case-insensitive `query`
    if (i + 5 > tokenLimit || sql.slice(i, i + 5).toLowerCase() !== 'query') {
      cursor = openIdx + 2;
      continue;
    }
    i += 5;

    // Skip whitespace before `:`
    while (i < tokenLimit && sql.charCodeAt(i) <= 32) {
      i++;
    }
    if (i >= tokenLimit || sql.charCodeAt(i) !== 58 /* ':' */) {
      cursor = openIdx + 2;
      continue;
    }
    i++;

    // Skip whitespace before opening quote `"` or `'`
    while (i < tokenLimit && sql.charCodeAt(i) <= 32) {
      i++;
    }
    if (i >= tokenLimit) {
      cursor = openIdx + 2;
      continue;
    }
    const quoteChar = sql.charCodeAt(i);
    if (quoteChar !== 34 /* '"' */ && quoteChar !== 39 /* "'" */) {
      cursor = openIdx + 2;
      continue;
    }
    i++;

    // Scan query path until closing quote or optional `(` parameter block.
    // Stopping on `{{` guarantees every character is visited O(1) times on malformed inputs.
    const pathStart = i;
    while (
      i < tokenLimit &&
      sql.charCodeAt(i) !== quoteChar &&
      sql.charCodeAt(i) !== 34 &&
      sql.charCodeAt(i) !== 39 &&
      sql.charCodeAt(i) !== 40 /* '(' */ &&
      sql.charCodeAt(i) !== 41 /* ')' */ &&
      !(sql.charCodeAt(i) === 123 /* '{' */ && i + 1 < tokenLimit && sql.charCodeAt(i + 1) === 123)
    ) {
      i++;
    }
    const pathEnd = i;
    if (pathEnd === pathStart || i >= tokenLimit) {
      cursor = Math.max(openIdx + 2, i);
      continue;
    }

    // Optional `(...)` parameter list inside the quoted reference
    if (sql.charCodeAt(i) === 40 /* '(' */) {
      i++;
      while (
        i < tokenLimit &&
        sql.charCodeAt(i) !== 41 /* ')' */ &&
        sql.charCodeAt(i) !== quoteChar &&
        !(sql.charCodeAt(i) === 123 /* '{' */ && i + 1 < tokenLimit && sql.charCodeAt(i + 1) === 123)
      ) {
        i++;
      }
      if (i >= tokenLimit || sql.charCodeAt(i) !== 41 /* ')' */) {
        cursor = Math.max(openIdx + 2, i);
        continue;
      }
      i++;
    }

    // Require matching closing quote
    if (i >= tokenLimit || sql.charCodeAt(i) !== quoteChar) {
      cursor = Math.max(openIdx + 2, i);
      continue;
    }
    i++;

    // Skip whitespace before `}}`
    while (i < tokenLimit && sql.charCodeAt(i) <= 32) {
      i++;
    }
    if (i + 1 >= tokenLimit || sql.charCodeAt(i) !== 125 /* '}' */ || sql.charCodeAt(i + 1) !== 125) {
      cursor = Math.max(openIdx + 2, i);
      continue;
    }

    const rawPath = sql.slice(pathStart, pathEnd).trim();
    if (rawPath) {
      references.push(rawPath);
    }
    cursor = i + 2;
  }

  return { References: references, ExceededLengthCap: false };
}

/**
 * Input type for batch query execution - allows running multiple queries in a single network call
 */
@InputType()
export class RunQueryInput {
  @Field(() => String, { nullable: true, description: 'Query ID to run - either QueryID or QueryName must be provided' })
  QueryID?: string;

  @Field(() => String, { nullable: true, description: 'Query Name to run - either QueryID or QueryName must be provided' })
  QueryName?: string;

  @Field(() => String, { nullable: true, description: 'Category ID to help disambiguate queries with the same name' })
  CategoryID?: string;

  @Field(() => String, { nullable: true, description: 'Category path to help disambiguate queries with the same name' })
  CategoryPath?: string;

  @Field(() => GraphQLJSONObject, { nullable: true, description: 'Parameters to pass to the query' })
  Parameters?: Record<string, unknown>;

  @Field(() => Int, { nullable: true, description: 'Maximum number of rows to return' })
  MaxRows?: number;

  @Field(() => Int, { nullable: true, description: 'Starting row offset for pagination' })
  StartRow?: number;

  @Field(() => Boolean, { nullable: true, description: 'Force audit logging regardless of query settings' })
  ForceAuditLog?: boolean;

  @Field(() => String, { nullable: true, description: 'Description to use in audit log' })
  AuditLogDescription?: string;

  @Field(() => GraphQLJSONObject, { nullable: true, description: 'Optional runtime-only directive to post-process result rows through a registered query result enricher ({ EnricherKey, Config })' })
  Enrichment?: RunQueryEnrichment;

  @Field(() => String, { nullable: true, description: "Read source: 'Live' (default) or 'Materialized' (serve from a fresh RowFilterBroad materialization when available; falls back to live otherwise)" })
  DataSource?: 'Live' | 'Materialized';
}

@ObjectType()
export class RunQueryResultType {
  @Field()
  QueryID: string;

  @Field()
  QueryName: string;

  @Field()
  Success: boolean;

  @Field()
  Results: string;

  @Field()
  RowCount: number;

  @Field()
  TotalRowCount: number;

  @Field(() => Int, { nullable: true })
  PageNumber?: number;

  @Field(() => Int, { nullable: true })
  PageSize?: number;

  @Field()
  ExecutionTime: number;

  @Field()
  ErrorMessage: string;

  @Field(() => String, { nullable: true })
  AppliedParameters?: string;

  @Field(() => Boolean, { nullable: true })
  CacheHit?: boolean;

  @Field(() => Int, { nullable: true })
  CacheTTLRemaining?: number;
}

//****************************************************************************
// INPUT/OUTPUT TYPES for RunQueriesWithCacheCheck
//****************************************************************************

@InputType()
export class RunQueryCacheStatusInput {
  @Field(() => String, { description: 'The maximum __mj_UpdatedAt value from cached results' })
  maxUpdatedAt: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => Int, { description: 'The number of rows in cached results' })
  rowCount: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, {
    nullable: true,
    description: "The query definition hash the cached results were written under, as this server returned it. When it differs from the server's, the result is 'stale' with fresh rows. Empty string for a slot with no hash; omit to skip the definition check."
  })
  definitionHash?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name, matching its siblings
}

@InputType()
export class RunQueryWithCacheCheckInput {
  @Field(() => RunQueryInput, { description: 'The RunQuery parameters' })
  params: RunQueryInput;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => RunQueryCacheStatusInput, {
    nullable: true,
    description: 'Optional cache status - if provided, server will check if cache is current'
  })
  cacheStatus?: RunQueryCacheStatusInput;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

@ObjectType()
export class RunQueryWithCacheCheckResultOutput {
  @Field(() => Int, { description: 'The index of this query in the batch request' })
  queryIndex: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { description: 'The query ID' })
  queryId: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { description: "'current', 'stale', 'no_validation', or 'error'" })
  status: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, {
    nullable: true,
    description: 'JSON-stringified results - only populated when status is stale or no_validation'
  })
  Results?: string;

  @Field(() => String, { nullable: true, description: 'Max __mj_UpdatedAt from results when stale' })
  maxUpdatedAt?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => Int, { nullable: true, description: 'Row count of results when stale' })
  rowCount?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { nullable: true, description: 'Error message if status is error' })
  errorMessage?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { nullable: true, description: "The server's definition hash for the query; store it with the cached results and send it back in cacheStatus.definitionHash" })
  definitionHash?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name, matching its siblings
}

@ObjectType()
export class RunQueriesWithCacheCheckOutput {
  @Field(() => Boolean, { description: 'Whether the overall operation succeeded' })
  success: boolean;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => [RunQueryWithCacheCheckResultOutput], { description: 'Results for each query in the batch' })
  results: RunQueryWithCacheCheckResultOutput[];  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query

  @Field(() => String, { nullable: true, description: 'Overall error message if success is false' })
  errorMessage?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name — renaming it breaks every client query
}

@RefuseScopeLimitedPrincipals()
@Resolver()
export class RunQueryResolver extends ResolverBase {
  private async findQuery(md: IMetadataProvider, QueryID: string, QueryName?: string, CategoryID?: string, CategoryPath?: string, refreshMetadataIfNotFound: boolean = false): Promise<MJQueryEntity | null> {
    const qe = QueryEngine.Instance;
    const queries = qe.Queries.filter(q => {
      if (QueryID) {
        return q.ID.trim().toLowerCase() === QueryID.trim().toLowerCase();
      } else if (QueryName) {
        let matches = q.Name.trim().toLowerCase() === QueryName.trim().toLowerCase();
        if (CategoryID) {
          matches = matches && q.CategoryID?.trim().toLowerCase() === CategoryID.trim().toLowerCase();
        }
        if (CategoryPath) {
          matches = matches && q.Category?.trim().toLowerCase() === CategoryPath.trim().toLowerCase();
        }
        return matches;
      }
      return false;
    });

    if (queries.length === 0) {
      if (refreshMetadataIfNotFound) {
        // If we didn't find the query, force-refresh QueryEngine and retry
        await QueryEngine.Instance.Config(true);
        return this.findQuery(md, QueryID, QueryName, CategoryID, CategoryPath, false); // change the refresh flag to false so we don't loop infinitely
      } 
      else {
        return null; // No query found and not refreshing metadata
      }
    }
    else {
      return queries[0];
    }
  }

  /**
   * Resolves a saved query (and every composed query it transitively depends on via `QueryEngine`
   * dependencies or `{{query:"..."}}` tokens) using the same lookup `RunQuery` uses, and **fails closed**
   * for impersonation sessions if the query or any composed dependency cannot be resolved or touches a
   * forbidden secret/security/permission entity.
   */
  private async assertSavedQueryAllowedForImpersonation(
    md: IMetadataProvider,
    userPayload: UserPayload | undefined,
    ref: { QueryID?: string; QueryName?: string; CategoryID?: string; CategoryPath?: string }
  ): Promise<void> {
    if (!GetImpersonationSession(userPayload)) {
      return;
    }

    const qe = QueryEngine.Instance;
    const engineQueries = qe?.Queries ?? [];
    const mdQueries = md.Queries ?? [];
    const matchInList = <
      T extends {
        readonly ID: string;
        readonly Name: string;
        readonly CategoryID?: string | null;
        readonly Category?: string | null;
        readonly CategoryPath?: string | null;
      }
    >(
      list: readonly T[],
      target: { QueryID?: string; QueryName?: string; CategoryID?: string; CategoryPath?: string }
    ): T | undefined => {
      return list.find((q) => {
        if (target.QueryID) {
          return UUIDsEqual(q.ID, target.QueryID);
        }
        if (target.QueryName) {
          let ok = q.Name.trim().toLowerCase() === target.QueryName.trim().toLowerCase();
          if (target.CategoryID) {
            ok = ok && Boolean(q.CategoryID && UUIDsEqual(q.CategoryID, target.CategoryID));
          }
          if (target.CategoryPath) {
            const qCat = (q.CategoryPath ?? q.Category ?? '').trim().toLowerCase();
            ok = ok && qCat === target.CategoryPath.trim().toLowerCase();
          }
          return ok;
        }
        return false;
      });
    };

    type InspectableQuery = {
      readonly ID: string;
      readonly Name: string;
      readonly SQL?: string | null;
      readonly CategoryID?: string | null;
      readonly Category?: string | null;
      readonly CategoryPath?: string | null;
      readonly Entities?: ReadonlyArray<{ readonly Entity?: string | null }> | null;
    };

    const resolveQueryRef = async (
      target: { QueryID?: string; QueryName?: string; CategoryID?: string; CategoryPath?: string },
      allowRefresh: boolean
    ): Promise<InspectableQuery | null> => {
      if (engineQueries.length > 0) {
        const viaEngine = await this.findQuery(
          md,
          target.QueryID ?? '',
          target.QueryName,
          target.CategoryID,
          target.CategoryPath,
          allowRefresh
        );
        if (viaEngine) {
          return viaEngine;
        }
      }
      const viaMd = matchInList(mdQueries, target);
      return viaMd ?? null;
    };

    const rootQuery = await resolveQueryRef(ref, engineQueries.length > 0);
    if (!rootQuery) {
      throw new AuthorizationError(
        `Saved query '${ref.QueryName ?? ref.QueryID ?? ''}' could not be resolved for security inspection during user impersonation.`
      );
    }

    // Collect known queries, platform SQL variants, and declared QueryDependencies for BFS inspection.
    const allKnownQueries: readonly InspectableQuery[] =
      engineQueries.length > 0 ? [...engineQueries, ...mdQueries] : mdQueries;
    const queriesByNormId = new Map<string, InspectableQuery>();
    for (const q of allKnownQueries) {
      if (q.ID) {
        const key = NormalizeUUID(q.ID);
        if (!queriesByNormId.has(key)) {
          queriesByNormId.set(key, q);
        }
      }
    }

    const sqlsByQueryId = new Map<string, string[]>();
    for (const s of qe?.QuerySQLs ?? []) {
      if (s.QueryID && s.SQL) {
        const key = NormalizeUUID(s.QueryID);
        let bucket = sqlsByQueryId.get(key);
        if (!bucket) {
          bucket = [];
          sqlsByQueryId.set(key, bucket);
        }
        bucket.push(s.SQL);
      }
    }

    const depsByQueryId = new Map<string, string[]>();
    for (const dep of qe?.Dependencies ?? []) {
      if (dep.QueryID && dep.DependsOnQueryID) {
        const key = NormalizeUUID(dep.QueryID);
        let bucket = depsByQueryId.get(key);
        if (!bucket) {
          bucket = [];
          depsByQueryId.set(key, bucket);
        }
        bucket.push(dep.DependsOnQueryID);
      }
    }

    const visitedIds = new Set<string>();
    const queue: InspectableQuery[] = [rootQuery];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const normId = NormalizeUUID(current.ID);
      if (visitedIds.has(normId)) {
        continue;
      }
      visitedIds.add(normId);

      // Collect primary SQL plus any platform-specific SQL variants for this query.
      const variantSqls = sqlsByQueryId.get(normId) ?? [];
      const combinedSql = [current.SQL ?? '', ...variantSqls].filter(Boolean).join('\n');

      if (combinedSql.length > MAX_IMPERSONATION_SAVED_QUERY_SQL_LENGTH) {
        throw new AuthorizationError(
          `Saved query '${current.Name}' exceeds the maximum inspectable SQL length (${MAX_IMPERSONATION_SAVED_QUERY_SQL_LENGTH} chars) during user impersonation.`
        );
      }

      if (
        IsSavedQueryForbiddenDuringImpersonation(
          { SQL: combinedSql, Entities: current.Entities },
          md.Entities
        )
      ) {
        throw new AuthorizationError(
          `Saved query '${current.Name}' touches security/credential entities prohibited during user impersonation.`
        );
      }

      // 1. Follow declared QueryDependencies rows (O(1) indexed lookup)
      for (const dependsOnId of depsByQueryId.get(normId) ?? []) {
        const depQuery = queriesByNormId.get(NormalizeUUID(dependsOnId));
        if (!depQuery) {
          throw new AuthorizationError(
            `Composed dependency query '${dependsOnId}' of '${current.Name}' could not be resolved during user impersonation.`
          );
        }
        if (!visitedIds.has(NormalizeUUID(depQuery.ID))) {
          queue.push(depQuery);
        }
      }

      // 2. Follow inline `{{query:"Category/Name"}}` composition references via O(n) linear scan
      const compositionScan = ExtractComposedQueryReferences(
        combinedSql,
        MAX_IMPERSONATION_SAVED_QUERY_SQL_LENGTH
      );
      if (compositionScan.ExceededLengthCap) {
        throw new AuthorizationError(
          `Saved query '${current.Name}' exceeds the maximum inspectable SQL length (${MAX_IMPERSONATION_SAVED_QUERY_SQL_LENGTH} chars) during user impersonation.`
        );
      }
      for (const rawPath of compositionScan.References) {
        const segments = rawPath.split('/').map((s) => s.trim()).filter(Boolean);
        const depName = segments.pop() ?? '';
        const depCatPath = segments.length > 0 ? segments.join('/') : undefined;
        const depQuery =
          (depName
            ? matchInList(allKnownQueries, { QueryName: depName, CategoryPath: depCatPath }) ??
              (depCatPath ? matchInList(allKnownQueries, { QueryName: depName }) : undefined)
            : undefined) ?? null;
        if (!depQuery) {
          throw new AuthorizationError(
            `Composed query reference '${rawPath}' inside '${current.Name}' could not be resolved during user impersonation.`
          );
        }
        if (!visitedIds.has(NormalizeUUID(depQuery.ID))) {
          queue.push(depQuery);
        }
      }
    }
  }

  @Query(() => RunQueryResultType)
  async GetQueryData(@Arg('QueryID', () => String) QueryID: string,
                     @Ctx() context: AppContext,
                     @Arg('CategoryID', () => String, {nullable: true}) CategoryID?: string,
                     @Arg('CategoryPath', () => String, {nullable: true}) CategoryPath?: string,
                     @Arg('Parameters', () => GraphQLJSONObject, {nullable: true}) Parameters?: Record<string, any>,
                     @Arg('MaxRows', () => Int, {nullable: true}) MaxRows?: number,
                     @Arg('StartRow', () => Int, {nullable: true}) StartRow?: number,
                     @Arg('ForceAuditLog', () => Boolean, {nullable: true}) ForceAuditLog?: boolean,
                     @Arg('AuditLogDescription', () => String, {nullable: true}) AuditLogDescription?: string,
                     @Arg('Enrichment', () => GraphQLJSONObject, {nullable: true}) Enrichment?: RunQueryEnrichment,
                     @Arg('DataSource', () => String, {nullable: true, description: "Read source: 'Live' (default) or 'Materialized' (serve from a fresh RowFilterBroad materialization when available; falls back to live otherwise)"}) DataSource?: 'Live' | 'Materialized'): Promise<RunQueryResultType> {
    // Check API key scope authorization for query execution
    await this.CheckAPIKeyScopeAuthorization('query:run', QueryID, context.userPayload);

    const provider = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const md = provider as unknown as IMetadataProvider;
    await this.assertSavedQueryAllowedForImpersonation(md, context.userPayload, { QueryID, CategoryID, CategoryPath });
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);
    const result = await rq.RunQuery(
      {
        QueryID: QueryID,
        CategoryID: CategoryID,
        CategoryPath: CategoryPath,
        Parameters: Parameters,
        MaxRows: MaxRows,
        StartRow: StartRow,
        ForceAuditLog: ForceAuditLog,
        AuditLogDescription: AuditLogDescription,
        Enrichment: Enrichment,
        DataSource: DataSource,
        TimeZone: context.userPayload.TimeZone
      },
      context.userPayload.userRecord);

    // If QueryName is not populated by the provider, use efficient lookup
    let queryName = result.QueryName;
    if (!queryName) {
      try {
        const queryInfo = await this.findQuery(md, QueryID, undefined, CategoryID, CategoryPath, true);
        if (queryInfo) {
          queryName = queryInfo.Name;
        }
      } catch (error) {
        console.error('Error finding query to get name:', error);
      }
    }
    
    return {
      QueryID: QueryID,
      QueryName: queryName || 'Unknown Query',
      Success: result.Success ?? false,
      // fls-guard: saved-query rows. Its SQL is refused before it runs if it reads a field the caller is denied, unless the query has `MJ: Query Permissions` rows, which authorize it by role alone
      Results: JSON.stringify(result.Results ?? null),
      RowCount: result.RowCount ?? 0,
      TotalRowCount: result.TotalRowCount ?? 0,
      ExecutionTime: result.ExecutionTime ?? 0,
      ErrorMessage: result.ErrorMessage || '',
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
      PageNumber: result.PageNumber,
      PageSize: result.PageSize,
      CacheHit: (result as any).CacheHit,
      CacheTTLRemaining: (result as any).CacheTTLRemaining
    };
  }

  @Query(() => RunQueryResultType)
  async GetQueryDataByName(@Arg('QueryName', () => String) QueryName: string,
                           @Ctx() context: AppContext,
                           @Arg('CategoryID', () => String, {nullable: true}) CategoryID?: string,
                           @Arg('CategoryPath', () => String, {nullable: true}) CategoryPath?: string,
                           @Arg('Parameters', () => GraphQLJSONObject, {nullable: true}) Parameters?: Record<string, any>,
                           @Arg('MaxRows', () => Int, {nullable: true}) MaxRows?: number,
                           @Arg('StartRow', () => Int, {nullable: true}) StartRow?: number,
                           @Arg('ForceAuditLog', () => Boolean, {nullable: true}) ForceAuditLog?: boolean,
                           @Arg('AuditLogDescription', () => String, {nullable: true}) AuditLogDescription?: string,
                           @Arg('Enrichment', () => GraphQLJSONObject, {nullable: true}) Enrichment?: RunQueryEnrichment,
                           @Arg('DataSource', () => String, {nullable: true, description: "Read source: 'Live' (default) or 'Materialized' (serve from a fresh RowFilterBroad materialization when available; falls back to live otherwise)"}) DataSource?: 'Live' | 'Materialized'): Promise<RunQueryResultType> {
    // Check API key scope authorization for query execution
    await this.CheckAPIKeyScopeAuthorization('query:run', QueryName, context.userPayload);

    const provider = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    await this.assertSavedQueryAllowedForImpersonation(provider as unknown as IMetadataProvider, context.userPayload, {
      QueryName,
      CategoryID,
      CategoryPath,
    });
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);
    const result = await rq.RunQuery(
      {
        QueryName: QueryName,
        CategoryID: CategoryID,
        CategoryPath: CategoryPath,
        Parameters: Parameters,
        MaxRows: MaxRows,
        StartRow: StartRow,
        ForceAuditLog: ForceAuditLog,
        AuditLogDescription: AuditLogDescription,
        Enrichment: Enrichment,
        DataSource: DataSource,
        TimeZone: context.userPayload.TimeZone
      },
      context.userPayload.userRecord);
      
    return {
      QueryID: result.QueryID || '',
      QueryName: QueryName,
      Success: result.Success ?? false,
      // fls-guard: saved-query rows. Its SQL is refused before it runs if it reads a field the caller is denied, unless the query has `MJ: Query Permissions` rows, which authorize it by role alone
      Results: JSON.stringify(result.Results ?? null),
      RowCount: result.RowCount ?? 0,
      TotalRowCount: result.TotalRowCount ?? 0,
      ExecutionTime: result.ExecutionTime ?? 0,
      ErrorMessage: result.ErrorMessage || '',
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
      PageNumber: result.PageNumber,
      PageSize: result.PageSize,
      CacheHit: (result as any).CacheHit,
      CacheTTLRemaining: (result as any).CacheTTLRemaining
    };
  }

  @RequireSystemUser()
  @Query(() => RunQueryResultType)
  async GetQueryDataSystemUser(@Arg('QueryID', () => String) QueryID: string, 
                               @Ctx() context: AppContext,
                               @Arg('CategoryID', () => String, {nullable: true}) CategoryID?: string,
                               @Arg('CategoryPath', () => String, {nullable: true}) CategoryPath?: string,
                               @Arg('Parameters', () => GraphQLJSONObject, {nullable: true}) Parameters?: Record<string, any>,
                               @Arg('MaxRows', () => Int, {nullable: true}) MaxRows?: number,
                               @Arg('StartRow', () => Int, {nullable: true}) StartRow?: number,
                               @Arg('ForceAuditLog', () => Boolean, {nullable: true}) ForceAuditLog?: boolean,
                               @Arg('AuditLogDescription', () => String, {nullable: true}) AuditLogDescription?: string,
                               @Arg('Enrichment', () => GraphQLJSONObject, {nullable: true}) Enrichment?: RunQueryEnrichment,
                               @Arg('DataSource', () => String, {nullable: true, description: "Read source: 'Live' (default) or 'Materialized' (serve from a fresh RowFilterBroad materialization when available; falls back to live otherwise)"}) DataSource?: 'Live' | 'Materialized'): Promise<RunQueryResultType> {
    const provider = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const md = provider as unknown as IMetadataProvider;
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);

    const result = await rq.RunQuery(
      {
        QueryID: QueryID,
        CategoryID: CategoryID,
        CategoryPath: CategoryPath,
        Parameters: Parameters,
        MaxRows: MaxRows,
        StartRow: StartRow,
        ForceAuditLog: ForceAuditLog,
        AuditLogDescription: AuditLogDescription,
        Enrichment: Enrichment,
        DataSource: DataSource,
        TimeZone: context.userPayload.TimeZone
      },
      context.userPayload.userRecord);

    // If QueryName is not populated by the provider, use efficient lookup
    let queryName = result.QueryName;
    if (!queryName) {
      try {
        const queryInfo = await this.findQuery(md, QueryID, undefined, CategoryID, CategoryPath, true);
        if (queryInfo) {
          queryName = queryInfo.Name;
        }
      } catch (error) {
        console.error('Error finding query to get name:', error);
      }
    }
    
    return {
      QueryID: QueryID,
      QueryName: queryName || 'Unknown Query',
      Success: result.Success ?? false,
      // fls-guard: saved-query rows. Its SQL is refused before it runs if it reads a field the caller is denied, unless the query has `MJ: Query Permissions` rows, which authorize it by role alone
      Results: JSON.stringify(result.Results ?? null),
      RowCount: result.RowCount ?? 0,
      TotalRowCount: result.TotalRowCount ?? 0,
      ExecutionTime: result.ExecutionTime ?? 0,
      ErrorMessage: result.ErrorMessage || '',
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
      PageNumber: result.PageNumber,
      PageSize: result.PageSize,
      CacheHit: (result as any).CacheHit,
      CacheTTLRemaining: (result as any).CacheTTLRemaining
    };
  }

  @RequireSystemUser()
  @Query(() => RunQueryResultType)
  async GetQueryDataByNameSystemUser(@Arg('QueryName', () => String) QueryName: string, 
                                     @Ctx() context: AppContext,
                                     @Arg('CategoryID', () => String, {nullable: true}) CategoryID?: string,
                                     @Arg('CategoryPath', () => String, {nullable: true}) CategoryPath?: string,
                                     @Arg('Parameters', () => GraphQLJSONObject, {nullable: true}) Parameters?: Record<string, any>,
                                     @Arg('MaxRows', () => Int, {nullable: true}) MaxRows?: number,
                                     @Arg('StartRow', () => Int, {nullable: true}) StartRow?: number,
                                     @Arg('ForceAuditLog', () => Boolean, {nullable: true}) ForceAuditLog?: boolean,
                                     @Arg('AuditLogDescription', () => String, {nullable: true}) AuditLogDescription?: string,
                                     @Arg('Enrichment', () => GraphQLJSONObject, {nullable: true}) Enrichment?: RunQueryEnrichment,
                                     @Arg('DataSource', () => String, {nullable: true, description: "Read source: 'Live' (default) or 'Materialized' (serve from a fresh RowFilterBroad materialization when available; falls back to live otherwise)"}) DataSource?: 'Live' | 'Materialized'): Promise<RunQueryResultType> {
    const provider = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);

    const result = await rq.RunQuery(
      {
        QueryName: QueryName,
        CategoryID: CategoryID,
        CategoryPath: CategoryPath,
        Parameters: Parameters,
        MaxRows: MaxRows,
        StartRow: StartRow,
        ForceAuditLog: ForceAuditLog,
        AuditLogDescription: AuditLogDescription,
        Enrichment: Enrichment,
        DataSource: DataSource,
        TimeZone: context.userPayload.TimeZone
      },
      context.userPayload.userRecord);
    
    return {
      QueryID: result.QueryID || '',
      QueryName: QueryName,
      Success: result.Success ?? false,
      // fls-guard: saved-query rows. Its SQL is refused before it runs if it reads a field the caller is denied, unless the query has `MJ: Query Permissions` rows, which authorize it by role alone
      Results: JSON.stringify(result.Results ?? null),
      RowCount: result.RowCount ?? 0,
      TotalRowCount: result.TotalRowCount ?? 0,
      ExecutionTime: result.ExecutionTime ?? 0,
      ErrorMessage: result.ErrorMessage || '',
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
      PageNumber: result.PageNumber,
      PageSize: result.PageSize,
      CacheHit: (result as any).CacheHit,
      CacheTTLRemaining: (result as any).CacheTTLRemaining
    };
  }

  /**
   * Batch query execution - runs multiple queries in a single network call
   * This is more efficient than making multiple individual query calls
   */
  @Query(() => [RunQueryResultType])
  async RunQueries(
    @Arg('input', () => [RunQueryInput]) input: RunQueryInput[],
    @Ctx() context: AppContext
  ): Promise<RunQueryResultType[]> {
    // Check API key scope authorization for batch query execution
    // We check against '*' since this runs multiple queries
    await this.CheckAPIKeyScopeAuthorization('query:run', '*', context.userPayload);

    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    for (const item of input) {
      await this.assertSavedQueryAllowedForImpersonation(provider as unknown as IMetadataProvider, context.userPayload, item);
    }
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);

    // Convert input to RunQueryParams array
    const params: RunQueryParams[] = input.map(i => ({
      QueryID: i.QueryID,
      QueryName: i.QueryName,
      CategoryID: i.CategoryID,
      CategoryPath: i.CategoryPath,
      Parameters: i.Parameters,
      MaxRows: i.MaxRows,
      StartRow: i.StartRow,
      ForceAuditLog: i.ForceAuditLog,
      AuditLogDescription: i.AuditLogDescription,
      Enrichment: i.Enrichment,
      DataSource: i.DataSource,
      TimeZone: context.userPayload.TimeZone
    }));

    // Execute all queries in parallel using the batch method
    const results = await rq.RunQueries(params, context.userPayload.userRecord);

    // Map results to output format
    return results.map((result, index) => {
      const inputItem = input[index];
      return {
        QueryID: result.QueryID || inputItem.QueryID || '',
        QueryName: result.QueryName || inputItem.QueryName || 'Unknown Query',
        Success: result.Success ?? false,
        // fls-guard: saved-query rows. Its SQL is refused before it runs if it reads a field the caller is denied, unless the query has `MJ: Query Permissions` rows, which authorize it by role alone
        Results: JSON.stringify(result.Results ?? null),
        RowCount: result.RowCount ?? 0,
        TotalRowCount: result.TotalRowCount ?? 0,
        ExecutionTime: result.ExecutionTime ?? 0,
        ErrorMessage: result.ErrorMessage || '',
        AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
        PageNumber: result.PageNumber,
        PageSize: result.PageSize,
        CacheHit: (result as Record<string, unknown>).CacheHit as boolean | undefined,
        CacheTTLRemaining: (result as Record<string, unknown>).CacheTTLRemaining as number | undefined
      };
    });
  }

  /**
   * Batch query execution with system user privileges
   */
  @RequireSystemUser()
  @Query(() => [RunQueryResultType])
  async RunQueriesSystemUser(
    @Arg('input', () => [RunQueryInput]) input: RunQueryInput[],
    @Ctx() context: AppContext
  ): Promise<RunQueryResultType[]> {
    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    for (const item of input) {
      await this.assertSavedQueryAllowedForImpersonation(provider as unknown as IMetadataProvider, context.userPayload, item);
    }
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);

    // Convert input to RunQueryParams array
    const params: RunQueryParams[] = input.map(i => ({
      QueryID: i.QueryID,
      QueryName: i.QueryName,
      CategoryID: i.CategoryID,
      CategoryPath: i.CategoryPath,
      Parameters: i.Parameters,
      MaxRows: i.MaxRows,
      StartRow: i.StartRow,
      ForceAuditLog: i.ForceAuditLog,
      AuditLogDescription: i.AuditLogDescription,
      Enrichment: i.Enrichment,
      DataSource: i.DataSource,
      TimeZone: context.userPayload.TimeZone
    }));

    // Execute all queries in parallel using the batch method
    const results = await rq.RunQueries(params, context.userPayload.userRecord);

    // Map results to output format
    return results.map((result, index) => {
      const inputItem = input[index];
      return {
        QueryID: result.QueryID || inputItem.QueryID || '',
        QueryName: result.QueryName || inputItem.QueryName || 'Unknown Query',
        Success: result.Success ?? false,
        // fls-guard: saved-query rows. Its SQL is refused before it runs if it reads a field the caller is denied, unless the query has `MJ: Query Permissions` rows, which authorize it by role alone
        Results: JSON.stringify(result.Results ?? null),
        RowCount: result.RowCount ?? 0,
        TotalRowCount: result.TotalRowCount ?? 0,
        ExecutionTime: result.ExecutionTime ?? 0,
        ErrorMessage: result.ErrorMessage || '',
        AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
        PageNumber: result.PageNumber,
        PageSize: result.PageSize,
        CacheHit: (result as Record<string, unknown>).CacheHit as boolean | undefined,
        CacheTTLRemaining: (result as Record<string, unknown>).CacheTTLRemaining as number | undefined
      };
    });
  }

  /**
   * RunQueriesWithCacheCheck - Smart cache validation for batch RunQueries.
   * For each query, if cacheStatus is provided, the server checks if the cache is current
   * using the Query's CacheValidationSQL. If current, returns status='current' with no data.
   * If stale, returns status='stale' with fresh data.
   * If the Query doesn't have CacheValidationSQL configured, returns 'no_validation' with data.
   */
  @Query(() => RunQueriesWithCacheCheckOutput)
  async RunQueriesWithCacheCheck(
    @Arg('input', () => [RunQueryWithCacheCheckInput]) input: RunQueryWithCacheCheckInput[],
    @Ctx() context: AppContext
  ): Promise<RunQueriesWithCacheCheckOutput> {
    // Check API key scope authorization for batch query execution
    await this.CheckAPIKeyScopeAuthorization('query:run', '*', context.userPayload);

    try {
      const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
      for (const item of input) {
        await this.assertSavedQueryAllowedForImpersonation(
          provider as unknown as IMetadataProvider,
          context.userPayload,
          item.params
        );
      }

      // Cast provider to SQLServerDataProvider to access RunQueriesWithCacheCheck method
      const sqlProvider = provider as unknown as SQLServerDataProvider;
      if (!sqlProvider.RunQueriesWithCacheCheck) {
        throw new Error('Provider does not support RunQueriesWithCacheCheck');
      }

      // Convert GraphQL input types to core types
      const coreParams: RunQueryWithCacheCheckParams[] = input.map(item => ({
        params: {
          QueryID: item.params.QueryID,
          QueryName: item.params.QueryName,
          CategoryID: item.params.CategoryID,
          CategoryPath: item.params.CategoryPath,
          Parameters: item.params.Parameters,
          MaxRows: item.params.MaxRows,
          StartRow: item.params.StartRow,
          ForceAuditLog: item.params.ForceAuditLog,
          AuditLogDescription: item.params.AuditLogDescription,
          Enrichment: item.params.Enrichment,
          DataSource: item.params.DataSource,
          TimeZone: context.userPayload.TimeZone,
        },
        cacheStatus: item.cacheStatus ? {
          maxUpdatedAt: item.cacheStatus.maxUpdatedAt,
          rowCount: item.cacheStatus.rowCount,
          definitionHash: item.cacheStatus.definitionHash ?? undefined,
        } : undefined,
      }));

      const response = await sqlProvider.RunQueriesWithCacheCheck(coreParams, context.userPayload.userRecord);

      // Transform results to GraphQL output format
      const transformedResults: RunQueryWithCacheCheckResultOutput[] = response.results.map(result => ({
        queryIndex: result.queryIndex,
        queryId: result.queryId,
        status: result.status,
        // fls-guard: saved-query rows. Its SQL is refused before it runs if it reads a field the caller is denied, unless the query has `MJ: Query Permissions` rows, which authorize it by role alone
        Results: result.results ? JSON.stringify(result.results) : undefined,
        maxUpdatedAt: result.maxUpdatedAt,
        rowCount: result.rowCount,
        errorMessage: result.errorMessage,
        definitionHash: result.definitionHash,
      }));

      return {
        success: response.success,
        results: transformedResults,
        errorMessage: response.errorMessage,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      LogError(err);
      return {
        success: false,
        results: [],
        errorMessage,
      };
    }
  }

  /**
   * RunQueriesWithCacheCheck with system user privileges
   */
  @RequireSystemUser()
  @Query(() => RunQueriesWithCacheCheckOutput)
  async RunQueriesWithCacheCheckSystemUser(
    @Arg('input', () => [RunQueryWithCacheCheckInput]) input: RunQueryWithCacheCheckInput[],
    @Ctx() context: AppContext
  ): Promise<RunQueriesWithCacheCheckOutput> {
    // Same implementation as regular version - RequireSystemUser handles auth
    return this.RunQueriesWithCacheCheck(input, context);
  }
}