import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges
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
import { computePivot } from './query-pivot.compute';
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
 *   [MeasureColumns]="[{ key: 'TotalCost', label: 'Cost', format: 'currency' }]"
 *   (rowActivated)="onRowSelected($event)">
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
export class QueryPivotComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
    // ========================================
    // Inputs: Query Identification & Params
    // ========================================

    /** Name of the saved Query to execute */
    @Input() QueryName: string | null = null;

    /** Category path of the saved Query */
    @Input() CategoryPath: string | null = null;

    /** ID of the saved Query (alternative to QueryName) */
    @Input() QueryID: string | null = null;

    /** Full RunQueryParams object passed by host */
    @Input() QueryParams: RunQueryParams | null = null;

    /** Parameter values to supply to the query */
    @Input() Parameters: Record<string, unknown> | null = null;

    /** Data source to query from: 'Materialized' (default) or 'Live' */
    @Input() DataSource: 'Materialized' | 'Live' = 'Materialized';

    /** Whether to automatically execute the query when inputs initialize or change */
    @Input() AutoRun: boolean = true;

    // ========================================
    // Inputs: Pivot Configuration
    // ========================================

    /** Array of column names to group by */
    @Input() DimensionColumns: string[] = [];

    /** Array of measure specifications to aggregate */
    @Input() MeasureColumns: PivotMeasureColumn[] = [];

    /** Optional date/time column for time bucketing */
    @Input() TimeColumn: string | null = null;

    /** Grain for time bucketing: 'hour' | 'day' */
    @Input() Grain: PivotTimeGrain | null = null;

    /** Whether to compute comparison window metrics and deltas */
    @Input() ComparisonWindow: boolean = false;

    /** Optional column identifying comparison/previous period rows */
    @Input() ComparisonPeriodColumn: string | null = null;

    // ========================================
    // Inputs: Data & Display Overrides
    // ========================================

    /** Optional raw data input (bypasses remote query execution if supplied) */
    @Input() Data: Record<string, unknown>[] | null = null;

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
     * Aliased to 'rowActivated' to satisfy both standard camelCase binding and PascalCase convention.
     */
    @Output('rowActivated') RowActivated = new EventEmitter<Record<string, unknown>>();

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
    private destroy$ = new Subject<void>();

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    public get Loading(): boolean {
        return this.IsLoading || this.internalIsLoading;
    }

    ngOnInit(): void {
        if (this.Data && this.Data.length > 0) {
            this.ApplyPivot(this.Data);
        } else if (this.AutoRun && (this.QueryName || this.QueryID || this.QueryParams)) {
            void this.Run();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Data'] && !changes['Data'].firstChange) {
            if (this.Data) {
                this.ApplyPivot(this.Data);
            }
        } else if (
            (changes['QueryName'] || changes['QueryID'] || changes['QueryParams'] || changes['Parameters']) &&
            !changes['QueryName']?.firstChange &&
            this.AutoRun
        ) {
            void this.Run();
        } else if (
            (changes['DimensionColumns'] ||
                changes['MeasureColumns'] ||
                changes['TimeColumn'] ||
                changes['Grain'] ||
                changes['ComparisonWindow'] ||
                changes['ComparisonPeriodColumn']) &&
            !changes['DimensionColumns']?.firstChange &&
            this.RawData.length > 0
        ) {
            this.ApplyPivot(this.RawData);
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
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
            dimensionColumns: this.DimensionColumns || [],
            measureColumns: this.MeasureColumns || [],
            timeColumn: this.TimeColumn,
            grain: this.Grain,
            comparisonWindow: this.ComparisonWindow,
            comparisonPeriodColumn: this.ComparisonPeriodColumn
        };

        const pivotResult = computePivot(rows, config);
        this.PivotedData = pivotResult.rows;
        this.ColumnConfigs = pivotResult.columnConfigs;
        this.TotalInputRows = pivotResult.totalInputRows;
        this.GroupedRowCount = pivotResult.groupedRowCount;
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
