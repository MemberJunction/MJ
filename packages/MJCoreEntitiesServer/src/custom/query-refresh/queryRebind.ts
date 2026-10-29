import type { EntityInfo } from "@memberjunction/core";
import { LogError } from "@memberjunction/core";
import { EscapeSQLString, NormalizeUUID } from "@memberjunction/global";
import type { MJQueryEntityServer } from "../MJQueryEntityServer.server";
import { QueryExtractionService } from "./QueryExtractionService";
import type { QueryRefreshContext, QueryRefreshReport, QueryRefreshRunReport } from "./refreshTypes";

/** A query that runs with definer's rights and gained a column field-level security restricts. */
export interface QueryDefinerRightsDrift {
    readonly QueryID: string;
    readonly QueryName: string;
    /** The added output columns, each sourced from a field that has field permissions. */
    readonly Fields: readonly string[];
}

/** What a re-bind pass did. */
export interface QueryRebindResult {
    /** The changed entities the pass was given. */
    readonly EntityCount: number;
    readonly Run: QueryRefreshRunReport;
    readonly Drift: readonly QueryDefinerRightsDrift[];
}

/**
 * Re-binds the saved queries that read entities whose fields changed (a column added, dropped, or
 * changed in type or nullability): each query that reads one of them (its `MJ: Query Entities`
 * rows) is refreshed, with no description pass, so its fields follow the schema again. The SQL is
 * never edited: a query the change broke is recorded with status `Error` and the database
 * server's message.
 *
 * A query with `MJ: Query Permissions` rows runs with definer's rights: its role list alone
 * authorizes a run, whatever the SQL reads. When such a query gains an output column (a `*` over
 * a view that gained one) sourced from a field that has field permissions, the column now reaches
 * every role on the list. The pass records that on the query as a `Warning` and returns it.
 *
 * @param entityIDs - The entities whose fields changed.
 */
export async function RebindQueriesForChangedEntities(context: QueryRefreshContext, entityIDs: readonly string[]): Promise<QueryRebindResult> {
    const unique = [...new Set(entityIDs.map(NormalizeUUID))];
    if (unique.length === 0) return { EntityCount: 0, Run: { DryRun: false, Reports: [], Cycles: [] }, Drift: [] };
    const run = await new QueryExtractionService(context).RefreshQueries({ EntityIDs: unique }, { WithAI: false });
    const drift = await findDefinerRightsDrift(context, run.Reports);
    for (const item of drift) await recordDrift(context, item);
    return { EntityCount: unique.length, Run: run, Drift: drift };
}

/** The refreshed queries that run with definer's rights and gained a column sourced from a field with field permissions. */
async function findDefinerRightsDrift(context: QueryRefreshContext, reports: readonly QueryRefreshReport[]): Promise<QueryDefinerRightsDrift[]> {
    const restricted = restrictedFieldIDs(context.Provider.Entities);
    const candidates = reports
        .map(r => ({ Report: r, Fields: r.Added.filter(c => c.Collection === 'Fields' && c.SourceEntityFieldID && restricted.has(NormalizeUUID(c.SourceEntityFieldID))) }))
        .filter(c => c.Fields.length > 0);
    if (candidates.length === 0) return [];
    const definerRights = await queriesWithPermissions(context, candidates.map(c => c.Report.QueryID));
    return candidates
        .filter(c => definerRights.has(NormalizeUUID(c.Report.QueryID)))
        .map(c => ({ QueryID: c.Report.QueryID, QueryName: c.Report.QueryName, Fields: c.Fields.map(f => f.Name) }));
}

/** The IDs of fields that have field permissions, or that belong to an entity field-level security applies to. */
function restrictedFieldIDs(entities: readonly EntityInfo[]): Set<string> {
    const ids = new Set<string>();
    for (const entity of entities) {
        for (const field of entity.Fields) {
            if (field.HasFieldPermissions || entity.FieldLevelSecurityApplies) ids.add(NormalizeUUID(field.ID));
        }
    }
    return ids;
}

async function queriesWithPermissions(context: QueryRefreshContext, queryIDs: readonly string[]): Promise<Set<string>> {
    const list = queryIDs.map(id => `'${EscapeSQLString(id)}'`).join(',');
    const result = await context.Provider.RunView<{ QueryID: string }>({
        EntityName: 'MJ: Query Permissions', ExtraFilter: `QueryID IN (${list})`, Fields: ['QueryID'], ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true,
    }, context.User);
    if (!result.Success) throw new Error(`the query permissions could not be read: ${result.ErrorMessage}`);
    return new Set(result.Results.map(r => NormalizeUUID(r.QueryID)));
}

/** Records the drift on the query: status `Warning` (unless it is already `Error`) and a message line. */
async function recordDrift(context: QueryRefreshContext, drift: QueryDefinerRightsDrift): Promise<void> {
    const message = DefinerRightsDriftMessage(drift.Fields);
    try {
        const query = await context.Provider.GetEntityObject<MJQueryEntityServer>('MJ: Queries', context.User);
        if (!await query.Load(drift.QueryID)) throw new Error('the query could not be loaded');
        if (query.ExtractionStatus !== 'Error') query.ExtractionStatus = 'Warning';
        query.ExtractionMessage = query.ExtractionMessage ? `${query.ExtractionMessage}\n${message}` : message;
        query.ExtractionOverride = 'Skip';
        if (!await query.Save()) throw new Error(query.LatestResult?.CompleteMessage ?? 'the save failed');
    } catch (e) {
        LogError(`[RebindQueriesForChangedEntities] the definer's-rights warning for query "${drift.QueryName}" could not be recorded: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** The `ExtractionMessage` line for a definer's-rights query that gained restricted columns. */
export function DefinerRightsDriftMessage(fields: readonly string[]): string {
    return `The query's output gained ${fields.map(f => `"${f}"`).join(', ')}, sourced from fields restricted by field-level security. ` +
        'The query is authorized by its Query Permissions role list alone, so every role on that list can now read these columns. ' +
        'Review the role list, or name the columns the query returns instead of using *.';
}
