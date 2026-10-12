import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnDestroy,
    OnInit,
    Output
} from '@angular/core';
import { Subject } from 'rxjs';
import { RunQuery, RunQueryParams, RunQueryResult } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
    QueryGridColumnConfig,
    QueryGridSelectionMode,
    QueryGridVisualConfig,
    QueryRowClickEvent
} from '../query-data-grid/models/query-grid-types';
import { ComputePivot } from './query-pivot.compute';
import {
    PivotMeasureColumn,
    PivotResult,
    PivotTimeGrain,
    QueryPivotConfig
} from './query-pivot.types';

/**
 * A generic pivot table component that runs any saved Query or ad-hoc query parameters,
 * groups and aggregates rows across dimensions and time grains, handles comparison windows,
 * formats null values as em dashes ('—'), and renders via mj-query-data-grid.
 *
 * @example
 * ```html
 * <mj-query-pivot
 *   [QueryName]="'AIUsageHourly'"
 *   [DimensionColumns]="['Agent']"
 *   [MeasureColumns]="[{ Key: 'TotalCost', Label: 'Cost', Format: 'currency' }]"
 *   (RowActivated)="onRowSelected($event)">
 * </mj-query-pivot>
 * ```
 */
@Component({
    standalone: false,
    selector: 'mj-query-pivot',
    templateUrl: './query-pivot.component.html',
    styleUrls: ['./query-pivot.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class QueryPivotComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    // Inputs are setters rather than an ngOnChanges switch (packages/Angular/CLAUDE.md). Each setter
    // reacts only when its own value actually changes, so a host that rebinds an equal value — or an
    // unrelated change-detection pass — never triggers a re-query or a full re-pivot.

    // ========================================
    // Inputs: Query Identification & Params
    // ========================================

    private _queryName: string | null = null;
    /** Name of the saved Query to execute */
    @Input()
    set QueryName(value: string | null) {
        if (value === this._queryName) return;
        this._queryName = value;
        this.onQueryIdentityChanged();
    }
    get QueryName(): string | null { return this._queryName; }

    /** Category path of the saved Query */
    @Input() CategoryPath: string | null = null;

    private _queryID: string | null = null;
    /** ID of the saved Query (alternative to QueryName) */
    @Input()
    set QueryID(value: string | null) {
        if (value === this._queryID) return;
        this._queryID = value;
        this.onQueryIdentityChanged();
    }
    get QueryID(): string | null { return this._queryID; }

    private _queryParams: RunQueryParams | null = null;
    /** Full RunQueryParams object passed by host */
    @Input()
    set QueryParams(value: RunQueryParams | null) {
        if (value === this._queryParams) return;
        this._queryParams = value;
        this.onQueryIdentityChanged();
    }
    get QueryParams(): RunQueryParams | null { return this._queryParams; }

    private _parameters: Record<string, unknown> | null = null;
    /** Parameter values to supply to the query */
    @Input()
    set Parameters(value: Record<string, unknown> | null) {
        if (value === this._parameters) return;
        this._parameters = value;
        this.onQueryIdentityChanged();
    }
    get Parameters(): Record<string, unknown> | null { return this._parameters; }

    /** Data source to query from: 'Materialized' (default) or 'Live' */
    @Input() DataSource: 'Materialized' | 'Live' = 'Materialized';

    /** Whether to automatically execute the query when inputs initialize or change */
    @Input() AutoRun: boolean = true;

    // ========================================
    // Inputs: Pivot Configuration
    // ========================================

    private _dimensionColumns: string[] = [];
    /** Array of column names to group by */
    @Input()
    set DimensionColumns(value: string[]) {
        if (value === this._dimensionColumns) return;
        this._dimensionColumns = value ?? [];
        this.onPivotConfigChanged();
    }
    get DimensionColumns(): string[] { return this._dimensionColumns; }

    private _measureColumns: PivotMeasureColumn[] = [];
    /** Array of measure specifications to aggregate */
    @Input()
    set MeasureColumns(value: PivotMeasureColumn[]) {
        if (value === this._measureColumns) return;
        this._measureColumns = value ?? [];
        this.onPivotConfigChanged();
    }
    get MeasureColumns(): PivotMeasureColumn[] { return this._measureColumns; }

    private _timeColumn: string | null = null;
    /** Optional date/time column for time bucketing */
    @Input()
    set TimeColumn(value: string | null) {
        if (value === this._timeColumn) return;
        this._timeColumn = value;
        this.onPivotConfigChanged();
    }
    get TimeColumn(): string | null { return this._timeColumn; }

    private _grain: PivotTimeGrain | null = null;
    /** Grain for time bucketing: 'hour' | 'day' */
    @Input()
    set Grain(value: PivotTimeGrain | null) {
        if (value === this._grain) return;
        this._grain = value;
        this.onPivotConfigChanged();
    }
    get Grain(): PivotTimeGrain | null { return this._grain; }

    private _comparisonWindow = false;
    /** Whether to compute comparison window metrics and deltas */
    @Input()
    set ComparisonWindow(value: boolean) {
        if (value === this._comparisonWindow) return;
        this._comparisonWindow = value;
        this.onPivotConfigChanged();
    }
    get ComparisonWindow(): boolean { return this._comparisonWindow; }

    private _comparisonPeriodColumn: string | null = null;
    /** Optional column identifying comparison/previous period rows */
    @Input()
    set ComparisonPeriodColumn(value: string | null) {
        if (value === this._comparisonPeriodColumn) return;
        this._comparisonPeriodColumn = value;
        this.onPivotConfigChanged();
    }
    get ComparisonPeriodColumn(): string | null { return this._comparisonPeriodColumn; }

    private _columnLabels: Record<string, string> = {};
    /** Header titles for dimension/time columns, keyed by column name. */
    @Input()
    set ColumnLabels(value: Record<string, string>) {
        if (value === this._columnLabels) return;
        this._columnLabels = value ?? {};
        this.onPivotConfigChanged();
    }
    get ColumnLabels(): Record<string, string> { return this._columnLabels; }

    private _hiddenColumns: string[] = [];
    /** Dimension columns used for grouping but not displayed (e.g. an ID shown via its name column). */
    @Input()
    set HiddenColumns(value: string[]) {
        if (value === this._hiddenColumns) return;
        this._hiddenColumns = value ?? [];
        this.onPivotConfigChanged();
    }
    get HiddenColumns(): string[] { return this._hiddenColumns; }

    // ========================================
    // Inputs: Data & Display Overrides
    // ========================================

    private _data: Record<string, unknown>[] | null = null;
    /** Optional raw data input (bypasses remote query execution if supplied) */
    @Input()
    set Data(value: Record<string, unknown>[] | null) {
        if (value === this._data) return;
        this._data = value;
        if (this.initialized && value) {
            this.ApplyPivot(value);
        }
    }
    get Data(): Record<string, unknown>[] | null { return this._data; }

    /** External loading state override */
    @Input() IsLoading: boolean = false;

    /** Height of the pivot container */
    @Input() Height: string = '100%';

    /** Grid row selection mode */
    @Input() SelectionMode: QueryGridSelectionMode = 'single';

    /** Whether to show the grid toolbar */
    @Input() ShowToolbar: boolean = true;

    /** Visual configuration passed to data grid */
    @Input() VisualConfig: QueryGridVisualConfig = {};

    // ========================================
    // Outputs
    // ========================================

    /**
     * Emitted when a row is clicked or activated.
     */
    @Output() RowActivated = new EventEmitter<Record<string, unknown>>();

    /** Fired when query execution starts */
    @Output() QueryStart = new EventEmitter<void>();

    /** Fired when query execution completes */
    @Output() QueryComplete = new EventEmitter<RunQueryResult>();

    /** Fired when query execution encounters an error */
    @Output() QueryError = new EventEmitter<Error>();

    /** Fired when pivot calculation finishes */
    @Output() PivotComplete = new EventEmitter<PivotResult>();

    // ========================================
    // Internal State
    // ========================================

    public PivotedData: Record<string, unknown>[] = [];
    public ColumnConfigs: QueryGridColumnConfig[] = [];
    public RawData: Record<string, unknown>[] = [];
    public LastError: string | null = null;
    public ExecutionTimeMs: number | null = null;
    public TotalInputRows: number = 0;
    public GroupedRowCount: number = 0;

    private internalIsLoading: boolean = false;
    private initialized = false;
    private runScheduled = false;
    private destroy$ = new Subject<void>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    public get Loading(): boolean {
        return this.IsLoading || this.internalIsLoading;
    }

    ngOnInit(): void {
        this.initialized = true;
        if (this.Data && this.Data.length > 0) {
            this.ApplyPivot(this.Data);
        } else if (this.AutoRun && (this.QueryName || this.QueryID || this.QueryParams)) {
            void this.Run();
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * A change to what the query is re-runs it; initial values are handled once by ngOnInit. Coalesced
     * to one run per turn, because a host commonly rebinds QueryName and Parameters in the same pass.
     */
    private onQueryIdentityChanged(): void {
        if (!this.initialized || !this.AutoRun || this.runScheduled) {
            return;
        }
        this.runScheduled = true;
        queueMicrotask(() => {
            this.runScheduled = false;
            void this.Run();
        });
    }

    /** A change to how rows are pivoted re-pivots the rows already held; no query round trip. */
    private onPivotConfigChanged(): void {
        if (this.initialized && this.RawData.length > 0) {
            this.ApplyPivot(this.RawData);
        }
    }

    // ========================================
    // Execution & Calculation
    // ========================================

    /**
     * Executes the query and calculates the pivot results.
     */
    public async Run(): Promise<void> {
        if (this.Data && this.Data.length > 0) {
            this.ApplyPivot(this.Data);
            return;
        }

        if (!this.QueryName && !this.QueryID && !this.QueryParams) {
            return;
        }

        this.internalIsLoading = true;
        this.LastError = null;
        this.QueryStart.emit();
        this.cdr.markForCheck();

        const startTime = performance.now();

        try {
            const rq = new RunQuery(this.RunQueryToUse);
            const runParams: RunQueryParams = {
                ...(this.QueryParams || {}),
                DataSource: this.DataSource || 'Materialized'
            };

            if (this.QueryID) runParams.QueryID = this.QueryID;
            if (this.QueryName) runParams.QueryName = this.QueryName;
            if (this.CategoryPath) runParams.CategoryPath = this.CategoryPath;
            if (this.Parameters) runParams.Parameters = this.Parameters;

            const result = await rq.RunQuery(runParams);
            this.ExecutionTimeMs = Math.round(performance.now() - startTime);

            if (result.Success) {
                this.RawData = result.Results || [];
                this.ApplyPivot(this.RawData);
                this.QueryComplete.emit(result);
            } else {
                this.LastError = result.ErrorMessage || 'Query pivot execution failed';
                this.QueryError.emit(new Error(this.LastError));
            }
        } catch (error) {
            this.ExecutionTimeMs = Math.round(performance.now() - startTime);
            const message = error instanceof Error ? error.message : 'Unknown error during query pivot';
            this.LastError = message;
            this.QueryError.emit(error instanceof Error ? error : new Error(message));
        } finally {
            this.internalIsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Purely calculates the pivot over provided rows and updates the view.
     */
    public ApplyPivot(rows: Record<string, unknown>[]): void {
        this.RawData = rows;
        const config: QueryPivotConfig = {
            DimensionColumns: this.DimensionColumns || [],
            MeasureColumns: this.MeasureColumns || [],
            TimeColumn: this.TimeColumn,
            Grain: this.Grain,
            ComparisonWindow: this.ComparisonWindow,
            ComparisonPeriodColumn: this.ComparisonPeriodColumn,
            ColumnLabels: this.ColumnLabels,
            HiddenColumns: this.HiddenColumns
        };

        const pivotResult = ComputePivot(rows, config);
        this.PivotedData = pivotResult.Rows;
        this.ColumnConfigs = pivotResult.ColumnConfigs;
        this.TotalInputRows = pivotResult.TotalInputRows;
        this.GroupedRowCount = pivotResult.GroupedRowCount;
        this.PivotComplete.emit(pivotResult);
        this.cdr.markForCheck();
    }

    /**
     * Refreshes the query execution.
     */
    public Refresh(): void {
        void this.Run();
    }

    // ========================================
    // Event Handlers
    // ========================================

    public OnRowClick(event: QueryRowClickEvent): void {
        if (event && event.rowData) {
            this.RowActivated.emit(event.rowData);
        }
    }

    public OnRowDoubleClick(event: QueryRowClickEvent): void {
        if (event && event.rowData) {
            this.RowActivated.emit(event.rowData);
        }
    }

    public OnRefreshRequest(): void {
        this.Refresh();
    }
}
