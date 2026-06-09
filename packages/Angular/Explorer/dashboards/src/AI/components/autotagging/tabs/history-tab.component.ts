/**
 * @fileoverview Classify · Run History tab.
 *
 * Self-contained sub-page: owns its header-interior, the run table, filters,
 * and the per-run detail panel. Receives the shared raw run list from the host
 * via `[Runs]` (the host is the data orchestrator); loads per-run detail rows
 * on demand itself. Cross-tab navigation (none today) would bubble via @Output.
 */
import { Component, ChangeDetectorRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { RunHistoryRow, RunDetailRow } from '../shared/classify.types';
import { formatNumber, formatDate, computeDuration, displayStatus, formatTokenCount, mapRunDetailRecords } from '../shared/classify.format';

@Component({
    standalone: false,
    selector: 'classify-history-tab',
    templateUrl: './history-tab.component.html',
    styleUrls: ['./history-tab.component.css']
})
export class ClassifyHistoryTabComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** Shared raw `MJ: Content Process Runs` rows, supplied by the host orchestrator. */
    private _runs: Record<string, unknown>[] = [];
    @Input()
    set Runs(value: Record<string, unknown>[]) {
        this._runs = value ?? [];
        this.buildRunHistoryRows();
        this.buildHistorySourceOptions();
        this.FilterRunHistory();
        // A fresh Runs binding (from the host reload) ends any in-flight refresh.
        this.IsLoading = false;
        this.cdr.detectChanges();
    }
    get Runs(): Record<string, unknown>[] {
        return this._runs;
    }

    /** Total run count in the DB (from TotalRowCount) — drives the "Showing X of Y" line. */
    @Input() TotalRunCount = 0;

    /** True while the host is fetching the next page in response to LoadMoreRequested. */
    @Input() IsLoadingMore = false;

    /** Bubble a "load more" request to the host, which widens the loaded window. */
    @Output() LoadMoreRequested = new EventEmitter<void>();

    /**
     * Bubble a content-item selection (from the per-run item grid) up to the host,
     * which owns NavigationService + the drilldown slide-in.
     */
    @Output() ItemSelected = new EventEmitter<string>();

    public onItemSelected(itemID: string): void {
        this.ItemSelected.emit(itemID);
    }

    /** Whether more runs exist in the DB than are currently loaded. */
    public get HasMoreRuns(): boolean {
        return this.TotalRunCount > this._runs.length;
    }

    public onLoadMore(): void {
        this.LoadMoreRequested.emit();
    }

    /** Shown while the host reloads the run list in response to RefreshRequested. */
    public IsLoading = false;

    /**
     * Bubble a refresh request up to the host, which owns the run-history data
     * (`MJ: Content Process Runs`). The host reloads and re-binds `[Runs]`, whose
     * setter rebuilds the rows; the host also clears IsLoading via [Loading].
     */
    @Output() RefreshRequested = new EventEmitter<void>();

    public RunHistoryRows: RunHistoryRow[] = [];
    public FilteredRunRows: RunHistoryRow[] = [];
    public HistorySourceFilter = '';
    public HistoryStatusFilter = '';
    public HistorySourceOptions: string[] = [];

    // Per-run detail panel
    public SelectedRunID: string | null = null;
    public RunDetailRows: RunDetailRow[] = [];
    public IsLoadingRunDetail = false;

    // Template-facing formatters
    public readonly FormatTokenCount = formatTokenCount;

    /**
     * Ask the host to reload the run history. Data is host-owned, so we surface a
     * loading state and emit; the new `[Runs]` binding clears IsLoading.
     */
    public Refresh(): void {
        this.IsLoading = true;
        this.cdr.detectChanges();
        this.RefreshRequested.emit();
    }

    private buildRunHistoryRows(): void {
        this.RunHistoryRows = this._runs.map(run => {
            const status = (run['Status'] as string) ?? 'Unknown';
            const startTime = run['StartTime'] as string | null;
            const endTime = run['EndTime'] as string | null;
            const duration = computeDuration(startTime, endTime);
            const processedItems = run['ProcessedItems'] as number | null;
            const errorCount = run['ErrorCount'] as number | null;
            const statusLower = status.toLowerCase();
            const isFailed = statusLower === 'error' || statusLower === 'failed';
            const isRunning = statusLower === 'running' || statusLower === 'processing';
            const hasErrors = (errorCount ?? 0) > 0;

            return {
                ID: run['ID'] as string,
                Status: displayStatus(status),
                StatusClass: isFailed ? 'failed' : isRunning ? 'running' : 'complete',
                SourceName: (run['Source'] as string) ?? 'Unknown',
                StartedDisplay: startTime ? formatDate(startTime) : '—',
                Duration: duration,
                Items: processedItems != null ? formatNumber(processedItems) : '—',
                Tags: '—',
                Errors: hasErrors ? formatNumber(errorCount!) : (isFailed ? status : '0'),
                ErrorClass: isFailed || hasErrors ? 'run-error-text' : ''
            };
        });
    }

    private buildHistorySourceOptions(): void {
        const sources = new Set<string>();
        for (const run of this._runs) {
            const s = run['Source'] as string;
            if (s) sources.add(s);
        }
        this.HistorySourceOptions = Array.from(sources).sort();
    }

    public FilterRunHistory(): void {
        this.FilteredRunRows = this.RunHistoryRows.filter(row => {
            if (this.HistorySourceFilter && row.SourceName !== this.HistorySourceFilter) return false;
            if (this.HistoryStatusFilter && row.StatusClass !== this.HistoryStatusFilter) return false;
            return true;
        });
        this.cdr.detectChanges();
    }

    /**
     * Filter fields for the Run History section, rendered inside an
     * `<mj-filter-popover>` (many values, single-select → popover with dropdown).
     */
    public get historyFilterFields(): FilterFieldConfig[] {
        return [
            {
                key: 'source',
                type: 'dropdown',
                label: 'Source',
                placeholder: 'All Sources',
                filterable: this.HistorySourceOptions.length > 10,
                options: [
                    { text: 'All Sources', value: '' },
                    ...this.HistorySourceOptions.map(s => ({ text: s, value: s }))
                ]
            },
            {
                key: 'status',
                type: 'dropdown',
                label: 'Status',
                placeholder: 'All Status',
                options: [
                    { text: 'All Status', value: '' },
                    { text: 'Complete', value: 'complete' },
                    { text: 'Failed',   value: 'failed' },
                    { text: 'Running',  value: 'running' }
                ]
            }
        ];
    }

    public get historyFilterValues(): Record<string, unknown> {
        return { source: this.HistorySourceFilter, status: this.HistoryStatusFilter };
    }

    public get historyActiveFilterCount(): number {
        return (this.HistorySourceFilter ? 1 : 0) + (this.HistoryStatusFilter ? 1 : 0);
    }

    public onHistoryFilterChange(values: Record<string, unknown>): void {
        this.HistorySourceFilter = (values['source'] as string) ?? '';
        this.HistoryStatusFilter = (values['status'] as string) ?? '';
        this.FilterRunHistory();
    }

    public onHistoryFilterReset(): void {
        this.HistorySourceFilter = '';
        this.HistoryStatusFilter = '';
        this.FilterRunHistory();
    }

    /** Open (or toggle closed) the detail view for a run, loading its per-source detail rows. */
    public async OpenRunDetail(runID: string): Promise<void> {
        if (this.SelectedRunID === runID) {
            this.CloseRunDetail();
            return;
        }
        this.SelectedRunID = runID;
        this.IsLoadingRunDetail = true;
        this.RunDetailRows = [];
        this.cdr.detectChanges();

        await this.loadRunDetailRows(runID);

        this.IsLoadingRunDetail = false;
        this.cdr.detectChanges();
    }

    public CloseRunDetail(): void {
        this.SelectedRunID = null;
        this.RunDetailRows = [];
        this.IsLoadingRunDetail = false;
        this.cdr.detectChanges();
    }

    private async loadRunDetailRows(runID: string): Promise<void> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView({
            EntityName: 'MJ: Content Process Run Details',
            ExtraFilter: `ContentProcessRunID='${runID}'`,
            OrderBy: 'ContentSource',
            ResultType: 'simple',
        });
        if (result.Success) {
            this.RunDetailRows = mapRunDetailRecords(result.Results);
        }
    }
}
