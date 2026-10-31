import { BaseRemotableOperation, Metadata } from "@memberjunction/core";
import type { IMetadataProvider, RemoteOpServerContext, UserInfo } from "@memberjunction/core";
import { QueryRefreshExtractionOperation } from "@memberjunction/core-entities";
import type {
    QueryRefreshExtractionInput,
    QueryRefreshExtractionOutput,
    QueryRefreshQueryReport,
    QueryRefreshRowChange,
} from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import type { ChildRowChange } from "../query-extraction";
import { QueryExtractionService } from "./QueryExtractionService";
import { UserCanRefreshQueries } from "./refreshAuthorization";
import { FormatQueryRefreshSummary } from "./refreshFormat";
import { IsQueryRefreshProvider } from "./refreshTypes";
import type { QueryRefreshFilter, QueryRefreshOptions, QueryRefreshReport, QueryRefreshRunReport } from "./refreshTypes";

/**
 * Server implementation of the `Query.RefreshExtraction` remote operation: refreshes one saved
 * query, or a selection, through {@link QueryExtractionService}, reporting each query as a
 * progress event as it finishes.
 *
 * `Authorize` refuses a caller without Update on `MJ: Queries` and Create, Update and Delete on
 * its child entities; the service applies the same check and the per-query non-disclosure guard
 * for every entry point. An API-key caller also needs the operation's `query:refresh` scope.
 * A request for exactly one query ID, and nothing else, reports a query that does not exist and
 * one the caller may not refresh with the same message.
 */
@RegisterClass(BaseRemotableOperation, 'Query.RefreshExtraction')
export class QueryRefreshExtractionServerOperation extends QueryRefreshExtractionOperation {
    protected override async Authorize(_input: QueryRefreshExtractionInput, user: UserInfo): Promise<boolean> {
        return UserCanRefreshQueries(user, Metadata.Provider.Entities); // global-provider-ok: Authorize receives no provider; entity permissions are process-global metadata
    }

    protected async InternalExecute(input: QueryRefreshExtractionInput, provider: IMetadataProvider, user: UserInfo, context: RemoteOpServerContext): Promise<QueryRefreshExtractionOutput> {
        if (!IsQueryRefreshProvider(provider)) throw new Error('Query.RefreshExtraction needs a database provider');
        const filter = RefreshFilterOf(input);
        if (!HasRefreshSelector(filter)) throw new Error('Give at least one selector: queryIDs, queryNames, categoryPath, entityNames or all.');
        const service = new QueryExtractionService({ Provider: provider, User: user });
        const options: QueryRefreshOptions = {
            DryRun: input.dryRun === true,
            WithAI: input.withAI === true,
            OnProgress: p => context.emitProgress({
                OperationKey: this.OperationKey, Processed: p.Processed, Total: p.Total, Status: 'Running',
                Message: `${p.Report.Outcome}: ${p.Report.QueryName || p.Report.QueryID}`,
                Payload: { queryID: p.Report.QueryID, outcome: p.Report.Outcome },
            }),
        };
        const single = filter.QueryIDs?.length === 1 && Object.keys(filter).length === 1 ? filter.QueryIDs[0] : null;
        const run: QueryRefreshRunReport = single
            ? { DryRun: options.DryRun === true, Reports: [await service.RefreshQuery(single, options)], Cycles: [] }
            : await service.RefreshQueries(filter, options);
        return RefreshOutputOf(run);
    }
}

/** The service filter for an operation input; only the selectors the input gives. */
export function RefreshFilterOf(input: QueryRefreshExtractionInput): QueryRefreshFilter {
    const filter: { -readonly [K in keyof QueryRefreshFilter]: QueryRefreshFilter[K] } = {};
    if (input.queryIDs?.length) filter.QueryIDs = input.queryIDs;
    if (input.queryNames?.length) filter.QueryNames = input.queryNames;
    if (input.categoryPath?.trim()) filter.CategoryPath = input.categoryPath;
    if (input.entityNames?.length) filter.EntityNames = input.entityNames;
    if (input.all === true) filter.All = true;
    return filter;
}

/** Whether a filter selects anything at all. */
export function HasRefreshSelector(filter: QueryRefreshFilter): boolean {
    return filter.All === true || !!filter.QueryIDs?.length || !!filter.QueryNames?.length || !!filter.CategoryPath
        || !!filter.EntityNames?.length || !!filter.EntityIDs?.length;
}

/** A service run as the operation's output. */
export function RefreshOutputOf(run: QueryRefreshRunReport): QueryRefreshExtractionOutput {
    return {
        dryRun: run.DryRun,
        reports: run.Reports.map(reportOutputOf),
        cycles: run.Cycles.map(c => [...c]),
        summary: FormatQueryRefreshSummary(run),
    };
}

function reportOutputOf(report: QueryRefreshReport): QueryRefreshQueryReport {
    return {
        queryID: report.QueryID,
        queryName: report.QueryName,
        outcome: report.Outcome,
        ...(report.ExtractionStatus ? { extractionStatus: report.ExtractionStatus } : {}),
        queryColumns: [...report.QueryColumns],
        added: report.Added.map(changeOutputOf),
        updated: report.Updated.map(changeOutputOf),
        removed: report.Removed.map(changeOutputOf),
        flagged: [...report.Flagged],
        diagnostics: [...report.Diagnostics],
    };
}

function changeOutputOf(change: ChildRowChange): QueryRefreshRowChange {
    return { collection: change.Collection, name: change.Name, changedColumns: [...change.ChangedColumns] };
}

/** Keeps the operation in the bundle: import and call it where the class must be registered. */
export function LoadQueryRefreshExtractionServerOperation(): void {
    // The import is what registers the class.
}
