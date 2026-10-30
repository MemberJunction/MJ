import type { ChildRowChange } from "../query-extraction";
import type { QueryRefreshOutcome, QueryRefreshReport, QueryRefreshRunReport } from "./refreshTypes";

/** How many queries of a run ended in each outcome. */
export type QueryRefreshTotals = Record<QueryRefreshOutcome, number>;

/** The number of reports per outcome. */
export function QueryRefreshTotalsOf(run: QueryRefreshRunReport): QueryRefreshTotals {
    const totals: QueryRefreshTotals = { Refreshed: 0, Unchanged: 0, NotPermitted: 0, Unavailable: 0, Failed: 0 };
    for (const report of run.Reports) totals[report.Outcome]++;
    return totals;
}

/** One line summing a run up: `12 refreshed, 19 unchanged, 0 failed (dry run)`. */
export function FormatQueryRefreshSummary(run: QueryRefreshRunReport): string {
    const t = QueryRefreshTotalsOf(run);
    const verb = run.DryRun ? 'would be refreshed' : 'refreshed';
    const parts = [`${t.Refreshed} ${verb}`, `${t.Unchanged} unchanged`, `${t.Failed} failed`];
    if (t.NotPermitted > 0) parts.push(`${t.NotPermitted} skipped (not permitted)`);
    if (t.Unavailable > 0) parts.push(`${t.Unavailable} unavailable`);
    const withErrors = run.Reports.filter(r => r.ExtractionStatus === 'Error').length;
    if (withErrors > 0) parts.push(`${withErrors} with extraction errors`);
    return `${run.Reports.length} queries: ${parts.join(', ')}${run.DryRun ? ' (dry run: nothing was written)' : ''}.`;
}

/**
 * The lines of a run's report: one heading per query, then its row changes, flagged parameters
 * and diagnostics, then any composition cycles and the summary. With `changedOnly`, unchanged
 * queries with no diagnostics are left out.
 */
export function FormatQueryRefreshRun(run: QueryRefreshRunReport, changedOnly = false): string[] {
    const lines: string[] = [];
    for (const report of run.Reports) {
        if (changedOnly && report.Outcome === 'Unchanged' && report.Diagnostics.length === 0) continue;
        lines.push(...FormatQueryRefreshReport(report));
    }
    for (const cycle of run.Cycles) lines.push(`Composition cycle (each refreshed once): ${cycle.join(' -> ')}`);
    lines.push(FormatQueryRefreshSummary(run));
    return lines;
}

/** The lines of one query's report. */
export function FormatQueryRefreshReport(report: QueryRefreshReport): string[] {
    const name = report.QueryName ? `"${report.QueryName}" (${report.QueryID})` : report.QueryID;
    const status = report.ExtractionStatus ? ` [${report.ExtractionStatus}]` : '';
    const lines = [`${outcomeLabel(report)} ${name}${status}`];
    if (report.QueryColumns.length > 0) lines.push(`    ~ query (${report.QueryColumns.join(', ')})`);
    for (const change of report.Added) lines.push(`    + ${changeLabel(change)}`);
    for (const change of report.Updated) lines.push(`    ~ ${changeLabel(change)}${change.ChangedColumns.length > 0 ? ` (${change.ChangedColumns.join(', ')})` : ''}`);
    for (const change of report.Removed) lines.push(`    - ${changeLabel(change)}`);
    for (const name of report.Flagged) lines.push(`    ! parameter ${name}: authored, no longer used by the SQL (kept)`);
    for (const line of report.Diagnostics) lines.push(`    ${line}`);
    return lines;
}

function outcomeLabel(report: QueryRefreshReport): string {
    if (report.Outcome === 'Refreshed') return report.DryRun ? 'WOULD REFRESH' : 'REFRESHED';
    return report.Outcome.toUpperCase();
}

function changeLabel(change: ChildRowChange): string {
    const kind = { Fields: 'field', Parameters: 'parameter', Entities: 'entity', Dependencies: 'dependency' }[change.Collection];
    return `${kind} ${change.Name}`;
}
