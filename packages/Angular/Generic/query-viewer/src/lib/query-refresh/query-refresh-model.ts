import type {
    QueryRefreshExtractionInput,
    QueryRefreshExtractionOutput,
    QueryRefreshQueryReport,
    QueryRefreshRowChange,
} from '@memberjunction/core-entities';

/**
 * Plain functions over a query metadata refresh (`Query.RefreshExtraction`): what to refresh, and
 * how to read the report. No Angular and no data access, so the dialog and its tests share them.
 */

/** Which queries a refresh covers. */
export type QueryRefreshScope =
    | { readonly Kind: 'Queries'; readonly QueryIDs: readonly string[] }
    | { readonly Kind: 'Category'; readonly CategoryPath: string }
    | { readonly Kind: 'All' };

/** The step a refresh is at. */
export type QueryRefreshPhase = 'Idle' | 'DryRunning' | 'Review' | 'Applying' | 'Done' | 'Failed';

/** The user setting that sends a single-query refresh straight to applying, with no dry run. */
export const QUERY_REFRESH_SKIP_DRY_RUN_SETTING = 'QueryRefresh_SkipDryRun';

/** How many child rows one query's refresh adds, updates, removes and flags. */
export interface QueryRefreshCounts {
    readonly Added: number;
    readonly Updated: number;
    readonly Removed: number;
    readonly Flagged: number;
}

/** One collection's changes in a query's report, for the drill-in. */
export interface QueryRefreshCollectionChanges {
    readonly Collection: QueryRefreshRowChange['collection'];
    readonly Added: readonly QueryRefreshRowChange[];
    readonly Updated: readonly QueryRefreshRowChange[];
    readonly Removed: readonly QueryRefreshRowChange[];
}

const COLLECTIONS: readonly QueryRefreshRowChange['collection'][] = ['Fields', 'Parameters', 'Entities', 'Dependencies'];

/** The operation input for a scope; a dry run reports the changes without writing them. */
export function QueryRefreshInputFor(scope: QueryRefreshScope, dryRun: boolean): QueryRefreshExtractionInput {
    switch (scope.Kind) {
        case 'Queries': return { queryIDs: [...scope.QueryIDs], dryRun };
        case 'Category': return { categoryPath: scope.CategoryPath, dryRun };
        case 'All': return { all: true, dryRun };
    }
}

/** Whether a scope selects anything at all. */
export function IsQueryRefreshScopeEmpty(scope: QueryRefreshScope | null): boolean {
    if (!scope) return true;
    if (scope.Kind === 'Queries') return scope.QueryIDs.length === 0;
    if (scope.Kind === 'Category') return scope.CategoryPath.trim().length === 0;
    return false;
}

/** The change counts of one query's report. */
export function QueryRefreshCountsOf(report: QueryRefreshQueryReport): QueryRefreshCounts {
    return { Added: report.added.length, Updated: report.updated.length, Removed: report.removed.length, Flagged: report.flagged.length };
}

/** Whether applying would write anything: some query's outcome is `Refreshed`. */
export function QueryRefreshHasChanges(output: QueryRefreshExtractionOutput | null): boolean {
    return !!output && output.reports.some(r => r.outcome === 'Refreshed');
}

/** A report's changes grouped by collection, leaving out collections with none. */
export function QueryRefreshChangesByCollection(report: QueryRefreshQueryReport): QueryRefreshCollectionChanges[] {
    return COLLECTIONS.map(collection => ({
        Collection: collection,
        Added: report.added.filter(c => c.collection === collection),
        Updated: report.updated.filter(c => c.collection === collection),
        Removed: report.removed.filter(c => c.collection === collection),
    })).filter(g => g.Added.length + g.Updated.length + g.Removed.length > 0);
}

/** How a query's outcome reads in the report; a dry run says what would happen. */
export function QueryRefreshOutcomeLabel(report: QueryRefreshQueryReport, dryRun: boolean): string {
    switch (report.outcome) {
        case 'Refreshed': return dryRun ? 'Would change' : 'Refreshed';
        case 'Unchanged': return 'Unchanged';
        case 'NotPermitted': return 'Skipped';
        case 'Unavailable': return 'Not available';
        case 'Failed': return 'Failed';
    }
}

/** The number of queries in each outcome, for the report's summary line. */
export function QueryRefreshOutcomeTotals(output: QueryRefreshExtractionOutput): Record<QueryRefreshQueryReport['outcome'], number> {
    const totals: Record<QueryRefreshQueryReport['outcome'], number> = { Refreshed: 0, Unchanged: 0, NotPermitted: 0, Unavailable: 0, Failed: 0 };
    for (const report of output.reports) totals[report.outcome]++;
    return totals;
}

/** A progress fraction from 0 to 100, or `null` while the total is unknown. */
export function QueryRefreshPercent(processed: number | undefined, total: number | undefined): number | null {
    if (!total || total <= 0 || processed === undefined) return null;
    return Math.max(0, Math.min(100, Math.round((processed / total) * 100)));
}
