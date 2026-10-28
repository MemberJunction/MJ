import { DatabaseProviderBase, LogError, RunInEntityTransaction } from "@memberjunction/core";
import { EscapeSQLString, NormalizeUUID } from "@memberjunction/global";
import type { MJQueryEntityServer } from "../MJQueryEntityServer.server";
import type { ChildRowChange, ChildRowWriteSummary, QueryExtractionResult } from "../query-extraction";
import {
    EntityIDsOfExtraction,
    QueryRefreshUnavailableMessage,
    UserCanRefreshQueries,
    UserCanSeeQuerySources,
} from "./refreshAuthorization";
import { OrderForRefresh } from "./refreshOrder";
import type { OrderableQuery } from "./refreshOrder";
import { SelectQueriesForRefresh } from "./refreshSelection";
import type { RefreshSelection } from "./refreshSelection";
import type {
    QueryRefreshContext,
    QueryRefreshFilter,
    QueryRefreshOptions,
    QueryRefreshReport,
    QueryRefreshRunReport,
} from "./refreshTypes";

/** Whether a refresh refused by authorization reads as unavailable (a single query) or as skipped (bulk). */
type RefusalStyle = 'Unavailable' | 'NotPermitted';

/**
 * Re-establishes saved queries' facts from their SQL and the database server, on demand: the
 * same extraction a save of a changed query runs, without changing the SQL. Every entry point
 * (the `Query.RefreshExtraction` remote operation, `mj query refresh`, CodeGen's re-bind pass)
 * goes through this service, so the same authorization applies to all of them:
 *
 * - the caller needs Update on `MJ: Queries` and Create, Update and Delete on its derived child
 *   entities, for a dry run too;
 * - the caller must be able to read every entity the query reads, with no field denied on any of
 *   them, because the report and the written rows expose their columns;
 * - a refusal of a single query reads exactly like "not found"; a bulk run reports such a query
 *   as `NotPermitted`, with no reason.
 *
 * Each query is refreshed in its own transaction on the caller's provider, and the child rows are
 * written as the caller, so each write's own permission check also applies. A bulk run refreshes
 * the queries a composition depends on before the queries that compose them.
 */
export class QueryExtractionService {
    constructor(private readonly context: QueryRefreshContext) {}

    /**
     * Refreshes one saved query.
     *
     * @param queryID - The query's ID; echoed, and nothing else, when the query is unavailable.
     */
    public async RefreshQuery(queryID: string, options: QueryRefreshOptions = {}): Promise<QueryRefreshReport> {
        if (!this.userCanRefresh) return unavailableReport(queryID, options);
        const query = await this.loadQuery(queryID);
        if (!query) return unavailableReport(queryID, options);
        return this.refreshLoaded(query, options, 'Unavailable', queryID);
    }

    /**
     * Refreshes every query `filter` selects that the caller can read, dependencies first. An ID
     * or name that selects nothing is reported as `Unavailable`; a selected query the caller may
     * not refresh is reported as `NotPermitted`.
     */
    public async RefreshQueries(filter: QueryRefreshFilter, options: QueryRefreshOptions = {}): Promise<QueryRefreshRunReport> {
        const dryRun = options.DryRun === true;
        const selection = await this.select(filter);
        if (!selection) return unselectableRun(filter, options);
        const order = OrderForRefresh(selection.Queries, selection.Edges);
        const reports: QueryRefreshReport[] = selection.Unmatched.map(label => unavailableReport(label, options));
        const total = order.Order.length;
        for (const [index, query] of order.Order.entries()) {
            const report = await this.refreshSelected(query, options);
            reports.push(report);
            options.OnProgress?.({ Processed: index + 1, Total: total, Report: report });
        }
        return { DryRun: dryRun, Reports: reports, Cycles: order.Cycles };
    }

    /**
     * The queries `filter` selects; `null` when a caller who may not refresh queries cannot read
     * them either, so the selection cannot be made (a caller who may refresh and still cannot read
     * them meets the read's error).
     */
    private async select(filter: QueryRefreshFilter): Promise<RefreshSelection | null> {
        try {
            return await SelectQueriesForRefresh(this.context, filter);
        } catch (e) {
            if (this.userCanRefresh) throw e;
            return null;
        }
    }

    private get userCanRefresh(): boolean {
        return UserCanRefreshQueries(this.context.User, this.context.Provider.Entities);
    }

    private async refreshSelected(selected: OrderableQuery, options: QueryRefreshOptions): Promise<QueryRefreshReport> {
        if (!this.userCanRefresh) return notPermittedReport(selected.ID, selected.Name, options);
        const query = await this.loadQuery(selected.ID);
        if (!query) return notPermittedReport(selected.ID, selected.Name, options);
        return this.refreshLoaded(query, options, 'NotPermitted', selected.ID);
    }

    /** The query as the caller can load it; `null` when it does not exist or the caller cannot read it. */
    private async loadQuery(queryID: string): Promise<MJQueryEntityServer | null> {
        try {
            const query = await this.context.Provider.GetEntityObject<MJQueryEntityServer>('MJ: Queries', this.context.User);
            return await query.Load(queryID) ? query : null;
        } catch (e) {
            LogError(`[QueryExtractionService] query ${queryID} could not be loaded: ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    }

    private async refreshLoaded(query: MJQueryEntityServer, options: QueryRefreshOptions, refusal: RefusalStyle, label: string): Promise<QueryRefreshReport> {
        const dryRun = options.DryRun === true;
        try {
            if (!query.SQL || query.SQL.trim().length === 0) {
                return { ...emptyReport(query.ID, query.Name, 'Unchanged', dryRun), Diagnostics: ['The query has no SQL, so there is nothing to refresh.'] };
            }
            const extraction = await query.ComputeRefreshExtractionAsync();
            if (!await this.userCanSeeSources(query.ID, extraction)) {
                return refusal === 'Unavailable' ? unavailableReport(label, options) : notPermittedReport(query.ID, query.Name, options);
            }
            const rowChanges = queryRowChanges(query, extraction);
            const preview = await query.PreviewRefreshAsync(extraction, id => this.entityName(id));
            const summary = dryRun || !needsWrite(preview, rowChanges, options)
                ? preview
                : await this.applyInTransaction(query, extraction, options.WithAI === true);
            return reportOf(query, extraction, summary, rowChanges, dryRun);
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            LogError(`[QueryExtractionService] refresh of query "${query.Name}" failed: ${reason}`);
            return { ...emptyReport(query.ID, query.Name, 'Failed', dryRun), Diagnostics: [`The refresh was not completed and nothing was written: ${reason}`] };
        }
    }

    /** Writes the refresh in its own transaction on the caller's provider; any failure rolls it back. */
    private async applyInTransaction(query: MJQueryEntityServer, extraction: QueryExtractionResult, withAI: boolean): Promise<ChildRowWriteSummary | null> {
        const provider = this.context.Provider;
        const work = () => query.ApplyRefreshAsync(extraction, withAI);
        return provider instanceof DatabaseProviderBase ? RunInEntityTransaction(provider, work) : work();
    }

    /**
     * The non-disclosure guard: whether the caller can see every entity the query reads, by its
     * stored links and field sources and by the facts the refresh found.
     */
    private async userCanSeeSources(queryID: string, extraction: QueryExtractionResult): Promise<boolean> {
        const filter = `QueryID='${EscapeSQLString(queryID)}'`;
        const [links, fields] = await this.context.Provider.RunViews<{ EntityID?: string; SourceEntityID?: string | null }>([
            { EntityName: 'MJ: Query Entities', ExtraFilter: filter, Fields: ['EntityID'], ResultType: 'simple', BypassCache: true },
            { EntityName: 'MJ: Query Fields', ExtraFilter: filter, Fields: ['SourceEntityID'], ResultType: 'simple', BypassCache: true },
        ], this.context.User);
        if (!links?.Success || !fields?.Success) return false;
        const stored = [...links.Results.map(r => r.EntityID), ...fields.Results.map(r => r.SourceEntityID)]
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
        return UserCanSeeQuerySources(this.context.User, [...stored, ...EntityIDsOfExtraction(extraction)], this.context.Provider.Entities);
    }

    private entityName(entityID: string): string {
        const wanted = NormalizeUUID(entityID);
        return this.context.Provider.Entities.find(e => NormalizeUUID(e.ID) === wanted)?.Name ?? entityID;
    }
}

/**
 * Whether a refresh has anything to write: a child row or a query-row column changes, or the
 * description pass was asked for and some row has no description. An unchanged query is not saved
 * at all, so its timestamps and embedding stay as they are.
 */
function needsWrite(preview: ChildRowWriteSummary, rowChanges: readonly string[], options: QueryRefreshOptions): boolean {
    if (preview.Changes.length > 0 || rowChanges.length > 0) return true;
    return options.WithAI === true && preview.FieldsWithoutDescription.length + preview.ParametersWithoutDescription.length > 0;
}

/**
 * The run for a caller who may neither refresh nor read queries:
 * each ID or name it gave is reported unavailable, and nothing else is selected or disclosed.
 */
function unselectableRun(filter: QueryRefreshFilter, options: QueryRefreshOptions): QueryRefreshRunReport {
    const labels = [...(filter.QueryIDs ?? []), ...(filter.QueryNames ?? [])];
    return { DryRun: options.DryRun === true, Reports: labels.map(label => unavailableReport(label, options)), Cycles: [] };
}

/** The columns of the query row the refresh changes (`UsesTemplate` and the Extraction columns). */
function queryRowChanges(query: MJQueryEntityServer, extraction: QueryExtractionResult): string[] {
    const message = extraction.Messages.length > 0 ? extraction.Messages.join('\n') : null;
    const changes: string[] = [];
    if (query.UsesTemplate !== extraction.UsesTemplate) changes.push('UsesTemplate');
    if (query.ExtractedSQLHash !== extraction.Hash) changes.push('ExtractedSQLHash');
    if (query.ExtractionStatus !== extraction.Status) changes.push('ExtractionStatus');
    if ((query.ExtractionMessage ?? null) !== message) changes.push('ExtractionMessage');
    return changes;
}

function reportOf(query: MJQueryEntityServer, extraction: QueryExtractionResult, summary: ChildRowWriteSummary | null, rowChanges: readonly string[], dryRun: boolean): QueryRefreshReport {
    const changes = summary?.Changes ?? [];
    const pick = (action: ChildRowChange['Action']) => changes.filter(c => c.Action === action);
    return {
        QueryID: query.ID,
        QueryName: query.Name,
        Outcome: changes.length > 0 || rowChanges.length > 0 ? 'Refreshed' : 'Unchanged',
        DryRun: dryRun,
        ExtractionStatus: extraction.Status,
        QueryColumns: [...rowChanges],
        Added: pick('Added'),
        Updated: pick('Updated'),
        Removed: pick('Removed'),
        Flagged: summary?.FlaggedParameters ?? [],
        Diagnostics: [...extraction.Messages],
    };
}

function emptyReport(queryID: string, queryName: string, outcome: QueryRefreshReport['Outcome'], dryRun: boolean): QueryRefreshReport {
    return { QueryID: queryID, QueryName: queryName, Outcome: outcome, DryRun: dryRun, ExtractionStatus: null, QueryColumns: [], Added: [], Updated: [], Removed: [], Flagged: [], Diagnostics: [] };
}

/** A query that does not exist or that the caller may not refresh: the two read alike, echoing only `label`. */
function unavailableReport(label: string, options: QueryRefreshOptions): QueryRefreshReport {
    return { ...emptyReport(label, '', 'Unavailable', options.DryRun === true), Diagnostics: [QueryRefreshUnavailableMessage(label)] };
}

/** A selected query a bulk run skips because the caller may not refresh it; no reason is given. */
function notPermittedReport(queryID: string, queryName: string, options: QueryRefreshOptions): QueryRefreshReport {
    return { ...emptyReport(queryID, queryName, 'NotPermitted', options.DryRun === true), Diagnostics: ['Skipped: not permitted.'] };
}
