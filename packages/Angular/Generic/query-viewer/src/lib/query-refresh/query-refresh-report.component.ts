import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { QueryRefreshExtractionOutput, QueryRefreshQueryReport } from '@memberjunction/core-entities';
import { ParseQueryDiagnostics } from '@memberjunction/core-entities';
import type { QueryDiagnosticLine } from '@memberjunction/core-entities';
import { QueryDiagnosticsComponent } from '../query-diagnostics/query-diagnostics.component';
import {
    QueryRefreshChangesByCollection,
    QueryRefreshCountsOf,
    QueryRefreshOutcomeLabel,
    QueryRefreshOutcomeTotals,
} from './query-refresh-model';
import type { QueryRefreshCollectionChanges, QueryRefreshCounts } from './query-refresh-model';

/**
 * `<mj-query-refresh-report>` — the report of a query metadata refresh: one row per query with its
 * outcome, the extraction status it records and how many fields, parameters, entities and
 * dependencies it adds, updates and removes. A row with details expands to list each change, the
 * authored parameters the SQL no longer uses, and the run's diagnostics.
 *
 * Presentational: the operation's output in, `OpenQuery` out (the host decides where that goes).
 * A row starts expanded when the report holds a single query.
 */
@Component({
    standalone: true,
    selector: 'mj-query-refresh-report',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [QueryDiagnosticsComponent],
    templateUrl: './query-refresh-report.component.html',
    styleUrls: ['./query-refresh-report.component.css'],
})
export class QueryRefreshReportComponent {
    private _output: QueryRefreshExtractionOutput | null = null;
    private expanded = new Set<string>();

    /** The refresh's output. */
    @Input()
    set Output(value: QueryRefreshExtractionOutput | null) {
        this._output = value;
        this.expanded = new Set(value && value.reports.length === 1 ? [this.keyOf(value.reports[0], 0)] : []);
    }
    get Output(): QueryRefreshExtractionOutput | null {
        return this._output;
    }

    /** Whether a query's name is a button that emits {@link OpenQuery}. */
    @Input() AllowOpenQuery = false;

    /** The ID of a query the user asked to open. */
    @Output() OpenQuery = new EventEmitter<string>();

    public get Reports(): readonly QueryRefreshQueryReport[] {
        return this._output?.reports ?? [];
    }

    public get Totals(): ReturnType<typeof QueryRefreshOutcomeTotals> | null {
        return this._output ? QueryRefreshOutcomeTotals(this._output) : null;
    }

    public KeyOf(report: QueryRefreshQueryReport, index: number): string {
        return this.keyOf(report, index);
    }

    public CountsOf(report: QueryRefreshQueryReport): QueryRefreshCounts {
        return QueryRefreshCountsOf(report);
    }

    public OutcomeLabel(report: QueryRefreshQueryReport): string {
        return QueryRefreshOutcomeLabel(report, this._output?.dryRun === true);
    }

    /** The outcome as a CSS modifier: `refreshed`, `unchanged`, `notpermitted`, `unavailable`, `failed`. */
    public OutcomeClass(report: QueryRefreshQueryReport): string {
        return `outcome-${report.outcome.toLowerCase()}`;
    }

    public StatusClass(report: QueryRefreshQueryReport): string {
        return `status-${(report.extractionStatus ?? 'none').toLowerCase()}`;
    }

    public ChangesOf(report: QueryRefreshQueryReport): QueryRefreshCollectionChanges[] {
        return QueryRefreshChangesByCollection(report);
    }

    public DiagnosticsOf(report: QueryRefreshQueryReport): QueryDiagnosticLine[] {
        return ParseQueryDiagnostics(report.diagnostics.join('\n'));
    }

    /** Whether a report has anything to show when expanded. */
    public HasDetails(report: QueryRefreshQueryReport): boolean {
        return report.added.length + report.updated.length + report.removed.length + report.flagged.length + report.diagnostics.length > 0
            || report.queryColumns.length > 0;
    }

    public IsExpanded(report: QueryRefreshQueryReport, index: number): boolean {
        return this.expanded.has(this.keyOf(report, index));
    }

    public ToggleExpanded(report: QueryRefreshQueryReport, index: number): void {
        const key = this.keyOf(report, index);
        if (this.expanded.has(key)) this.expanded.delete(key);
        else this.expanded.add(key);
    }

    private keyOf(report: QueryRefreshQueryReport, index: number): string {
        return `${report.queryID}#${index}`;
    }
}
