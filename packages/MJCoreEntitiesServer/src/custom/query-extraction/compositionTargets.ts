import { QueryParameterInfo } from "@memberjunction/core";
import type { DatabasePlatform, IRunViewProvider, QueryDependencySpec, RunViewParams, UserInfo } from "@memberjunction/core";
import type {
    MJQueryCategoryEntity,
    MJQueryDependencyEntity,
    MJQueryEntity,
    MJQueryParameterEntity,
    MJQuerySQLEntity,
    MJSQLDialectEntity,
} from "@memberjunction/core-entities";
import { GetQueryDialect } from "@memberjunction/sql-dialect";
import { QueryTemplate } from "@memberjunction/sql-parser";
import { EscapeSQLString, IndexByUUID, UUIDsEqual } from "@memberjunction/global";

/** A composed query's parameter, as extraction reads it. */
export type CompositionCandidateParameter = Pick<MJQueryParameterEntity, 'Name' | 'Type' | 'IsRequired' | 'IsServerSet' | 'SampleValue' | 'Description' | 'Query'>;

/**
 * A query a composition may name, as extraction reads it: identity and path, whether it may be
 * composed, its parameters and the queries it composes in turn. A cached `MJQueryEntityExtended`
 * is one; so is a query read from the database during a save.
 */
export interface CompositionCandidate {
    readonly ID: string;
    readonly Name: string;
    readonly CategoryPath: string;
    readonly Reusable: boolean;
    readonly QueryParameters: readonly CompositionCandidateParameter[];
    readonly QueryDependencies: readonly Pick<MJQueryDependencyEntity, 'DependsOnQueryID'>[];
}

/** The composed queries a save read from its own provider. */
export interface CompositionTargetRead {
    /** Every query named by a composition in the SQL, as stored now (in the save's transaction). */
    readonly Candidates: readonly CompositionCandidate[];
    /**
     * Render specs for the candidates the given cache does not hold yet (saved earlier in the same
     * transaction), so the describe renders can compose them before the cache hears of them.
     */
    readonly InlineDependencies: readonly QueryDependencySpec[];
}

const EMPTY_READ: CompositionTargetRead = { Candidates: [], InlineDependencies: [] };

/** The rows one read returns for the named queries. */
interface StoredTargetRows {
    readonly Queries: MJQueryEntity[];
    readonly Categories: MJQueryCategoryEntity[];
    readonly Parameters: MJQueryParameterEntity[];
    readonly Dependencies: MJQueryDependencyEntity[];
    readonly SQLs: MJQuerySQLEntity[];
}

/**
 * Reads the queries the compositions in `sql` name from `provider`, bypassing every cache, so a
 * query saved earlier in the same transaction (a metadata push that creates a query and one that
 * composes it) is found. Queries are matched by name; the caller matches category paths.
 * @param cachedIDs - IDs of the queries the shared cache already holds; the others get render specs.
 */
export async function ReadCompositionTargetsAsync(
    sql: string,
    platform: DatabasePlatform,
    provider: Pick<IRunViewProvider, 'RunViews'>,
    user: UserInfo,
    cachedIDs: ReadonlySet<string>,
    dialects: readonly MJSQLDialectEntity[],
): Promise<CompositionTargetRead> {
    const names = [...new Set(QueryTemplate.Parse(sql, GetQueryDialect(platform)).CompositionReferences().Value.map(r => r.Name.trim().toLowerCase()))];
    if (names.length === 0) return EMPTY_READ;
    const rows = await readTargetRows(names, provider, user);
    if (!rows) return EMPTY_READ;
    const candidates = rows.Queries.map(q => candidateOf(q, rows));
    const dialectID = dialects.find(d => d.PlatformKey === platform)?.ID ?? null;
    const inline = rows.Queries
        .filter(q => !cachedIDs.has(q.ID.toLowerCase()))
        .map(q => inlineSpecOf(q, rows, dialectID));
    return { Candidates: candidates, InlineDependencies: inline };
}

/**
 * The candidates extraction resolves against: the ones read from the database, then every cached
 * query the read did not return (a query read from the database replaces its cached copy).
 */
export function MergeCompositionCandidates(read: readonly CompositionCandidate[], cached: readonly CompositionCandidate[]): CompositionCandidate[] {
    const readIDs = new Set(read.map(q => q.ID.toLowerCase()));
    return [...read, ...cached.filter(q => !readIDs.has(q.ID.toLowerCase()))];
}

async function readTargetRows(names: readonly string[], provider: Pick<IRunViewProvider, 'RunViews'>, user: UserInfo): Promise<StoredTargetRows | null> {
    const nameList = names.map(n => `'${EscapeSQLString(n)}'`).join(', ');
    const [queries, categories] = await provider.RunViews([
        bypassing('MJ: Queries', `LOWER(Name) IN (${nameList})`),
        bypassing('MJ: Query Categories', ''),
    ], user);
    if (!queries.Success || !categories.Success || queries.Results.length === 0) return null;
    const queryRows = queries.Results as MJQueryEntity[];
    const idList = queryRows.map(q => `'${EscapeSQLString(q.ID)}'`).join(', ');
    const [parameters, dependencies, sqls] = await provider.RunViews([
        bypassing('MJ: Query Parameters', `QueryID IN (${idList})`),
        bypassing('MJ: Query Dependencies', `QueryID IN (${idList})`),
        bypassing('MJ: Query SQLs', `QueryID IN (${idList})`),
    ], user);
    if (!parameters.Success || !dependencies.Success || !sqls.Success) return null;
    return {
        Queries: queryRows,
        Categories: categories.Results as MJQueryCategoryEntity[],
        Parameters: parameters.Results as MJQueryParameterEntity[],
        Dependencies: dependencies.Results as MJQueryDependencyEntity[],
        SQLs: sqls.Results as MJQuerySQLEntity[],
    };
}

function bypassing(entityName: string, filter: string): RunViewParams {
    return { EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true, IgnoreMaxRows: true };
}

function candidateOf(query: MJQueryEntity, rows: StoredTargetRows): CompositionCandidate {
    return {
        ID: query.ID,
        Name: query.Name,
        CategoryPath: categoryPathOf(query.CategoryID, rows.Categories),
        Reusable: query.Reusable,
        QueryParameters: rows.Parameters.filter(p => UUIDsEqual(p.QueryID, query.ID)),
        QueryDependencies: rows.Dependencies.filter(d => UUIDsEqual(d.QueryID, query.ID)),
    };
}

/** The `/`-joined names from the root category down to `categoryID`; `''` for no category. */
function categoryPathOf(categoryID: string | null, categories: readonly MJQueryCategoryEntity[]): string {
    const byID = IndexByUUID(categories);
    const segments: string[] = [];
    const seen = new Set<string>();
    let current = categoryID;
    while (current && !seen.has(current.toLowerCase())) {
        seen.add(current.toLowerCase());
        const category = byID.Get(current);
        if (!category) break;
        segments.unshift(category.Name);
        current = category.ParentID;
    }
    return segments.join('/');
}

/** A render spec for a query the cache does not hold: its SQL for the platform and its parameter definitions. */
function inlineSpecOf(query: MJQueryEntity, rows: StoredTargetRows, dialectID: string | null): QueryDependencySpec {
    const variant = dialectID ? rows.SQLs.find(s => UUIDsEqual(s.QueryID, query.ID) && UUIDsEqual(s.SQLDialectID, dialectID)) : undefined;
    return {
        Name: query.Name,
        CategoryPath: categoryPathOf(query.CategoryID, rows.Categories),
        SQL: variant?.SQL ?? query.SQL ?? '',
        UsesTemplate: query.UsesTemplate,
        ParameterDefinitions: rows.Parameters.filter(p => UUIDsEqual(p.QueryID, query.ID)).map(p => new QueryParameterInfo(p.GetAll())),
    };
}
