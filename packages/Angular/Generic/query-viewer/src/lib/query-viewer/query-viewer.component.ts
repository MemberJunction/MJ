import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnDestroy,
    ChangeDetectorRef,
    ChangeDetectionStrategy,
    ViewChild
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RunQuery, RunQueryParams, Metadata, QueryInfo } from '@memberjunction/core';
import { RunQueryResult } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { QueryDataGridComponent } from '../query-data-grid/query-data-grid.component';
import {
    QueryGridSelectionMode,
    QueryGridState,
    QueryGridVisualConfig,
    QueryParameterValues,
    QueryEntityLinkClickEvent,
    QueryGridStateChangedEvent,
    QuerySelectionChangedEvent,
    QueryRowClickEvent,
    getQueryGridStateKey,
    getQueryParamsKey
} from '../query-data-grid/models/query-grid-types';

/**
 * A composite component that provides a complete query viewing experience.
 * Features:
 * - Automatic parameter form display when query has parameters
 * - Grid state persistence to User Settings
 * - Parameter persistence to User Settings
 * - Entity linking for clickable record IDs
 * - Auto-run capability when all required params have saved values
 *
 * @example
 * ```html
 * <mj-query-viewer
 *   [QueryId]="selectedQueryId"
 *   [AutoRun]="true"
 *   (EntityLinkClick)="openRecord($event)">
 * </mj-query-viewer>
 * ```
 */
@Component({
  standalone: false,
    selector: 'mj-query-viewer',
    templateUrl: './query-viewer.component.html',
    styleUrls: ['./query-viewer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class QueryViewerComponent implements OnInit, OnDestroy {
    // ========================================
    // Inputs
    // ========================================

    private _queryId: string | null = null;
    /**
     * The ID of the query to display
     */
    @Input()
    set QueryId(value: string | null) {
        const previous = this._queryId;
        this._queryId = value;
        if (value !== previous) {
            this.onQueryIdChanged();
        }
    }
    get QueryId(): string | null {
        return this._queryId;
    }

    /**
     * Whether to auto-run the query when all required params have saved values
     */
    @Input() AutoRun: boolean = true;

    /**
     * Selection mode for the grid
     */
    @Input() SelectionMode: QueryGridSelectionMode = 'single';

    /**
     * Whether to show the toolbar
     */
    @Input() ShowToolbar: boolean = true;

    /**
     * Visual configuration for the grid
     */
    @Input() VisualConfig: QueryGridVisualConfig = {};

    /**
     * Whether to persist grid state
     */
    @Input() PersistState: boolean = true;

    /**
     * Whether to persist parameter values
     */
    @Input() PersistParameters: boolean = true;

    // ========================================
    // Outputs
    // ========================================

    /**
     * Fired when an entity link is clicked in the grid
     */
    @Output() EntityLinkClick = new EventEmitter<QueryEntityLinkClickEvent>();

    /**
     * Fired when a row is double-clicked
     */
    @Output() RowDoubleClick = new EventEmitter<QueryRowClickEvent>();

    /**
     * Fired when selection changes
     */
    @Output() SelectionChange = new EventEmitter<QuerySelectionChangedEvent>();

    /**
     * Fired when query execution starts
     */
    @Output() QueryStart = new EventEmitter<void>();

    /**
     * Fired when query execution completes
     */
    @Output() QueryComplete = new EventEmitter<RunQueryResult>();

    /**
     * Fired when query execution fails
     */
    @Output() QueryError = new EventEmitter<Error>();

    /**
     * Fired when user wants to open the full query record
     */
    @Output() OpenQueryRecord = new EventEmitter<{ queryId: string; queryName: string }>();

    // ========================================
    // View Children
    // ========================================

    @ViewChild(QueryDataGridComponent) DataGrid!: QueryDataGridComponent;

    // ========================================
    // Internal State
    // ========================================

    public QueryInfo: QueryInfo | null = null;
    public QueryData: Record<string, unknown>[] = [];
    public IsLoading: boolean = false;
    public ShowParamsPanel: boolean = false;
    public ShowInfoPanel: boolean = false;
    public HasRun: boolean = false;
    public LastError: string | null = null;
    public ExecutionTimeMs: number | null = null;

    public SavedGridState: QueryGridState | null = null;
    public SavedParams: QueryParameterValues = {};

    private metadata = new Metadata();
    private destroy$ = new Subject<void>();
    private userInfoEngine = UserInfoEngine.Instance;

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {}

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ========================================
    // Query Loading
    // ========================================

    private async onQueryIdChanged(): Promise<void> {
        // Reset state
        this.QueryInfo = null;
        this.QueryData = [];
        this.HasRun = false;
        this.LastError = null;
        this.ExecutionTimeMs = null;
        this.SavedGridState = null;
        this.SavedParams = {};
        this.ShowParamsPanel = false;
        this.cdr.markForCheck();

        if (!this._queryId) {
            return;
        }

        // Load query info from metadata
        this.QueryInfo = this.metadata.Queries.find(q => q.ID === this._queryId) || null;

        if (!this.QueryInfo) {
            this.LastError = `Query with ID ${this._queryId} not found`;
            this.cdr.markForCheck();
            return;
        }

        // Load saved state from User Settings
        await this.loadSavedState();

        // Determine if we should show params or auto-run
        const hasParams = this.QueryInfo.Parameters && this.QueryInfo.Parameters.length > 0;
        const hasRequiredParams = hasParams && this.QueryInfo.Parameters.some(p => p.IsRequired);

        if (hasParams) {
            // Check if all required params have saved values
            const canAutoRun = this.AutoRun && this.canAutoRunWithSavedParams();

            if (canAutoRun) {
                // Auto-run with saved parameters
                await this.RunQuery(this.SavedParams);
            } else {
                // Show parameter panel
                this.ShowParamsPanel = true;
            }
        } else {
            // No parameters - auto-run immediately
            await this.RunQuery({});
        }

        this.cdr.markForCheck();
    }

    private canAutoRunWithSavedParams(): boolean {
        if (!this.QueryInfo) return false;

        const requiredParams = this.QueryInfo.Parameters?.filter(p => p.IsRequired) || [];

        for (const param of requiredParams) {
            const savedValue = this.SavedParams[param.Name];
            if (savedValue === null || savedValue === undefined || savedValue === '') {
                return false;
            }
            if (param.Type === 'array' && Array.isArray(savedValue) && savedValue.length === 0) {
                return false;
            }
        }

        return true;
    }

    // ========================================
    // State Persistence
    // ========================================

    private async loadSavedState(): Promise<void> {
        if (!this._queryId) return;

        try {
            // Load grid state
            if (this.PersistState) {
                const gridStateKey = getQueryGridStateKey(this._queryId);
                const gridStateSetting = await this.getUserSetting(gridStateKey);
                if (gridStateSetting) {
                    this.SavedGridState = JSON.parse(gridStateSetting) as QueryGridState;
                }
            }

            // Load saved parameters
            if (this.PersistParameters) {
                const paramsKey = getQueryParamsKey(this._queryId);
                const paramsSetting = await this.getUserSetting(paramsKey);
                if (paramsSetting) {
                    this.SavedParams = JSON.parse(paramsSetting) as QueryParameterValues;
                }
            }
        } catch (error) {
            console.warn('Error loading saved query state:', error);
        }
    }

    private async saveGridState(state: QueryGridState): Promise<void> {
        if (!this._queryId || !this.PersistState) return;

        try {
            const key = getQueryGridStateKey(this._queryId);
            await this.setUserSetting(key, JSON.stringify(state));
        } catch (error) {
            console.warn('Error saving grid state:', error);
        }
    }

    private async saveParameters(params: QueryParameterValues): Promise<void> {
        if (!this._queryId || !this.PersistParameters) return;

        try {
            const key = getQueryParamsKey(this._queryId);
            await this.setUserSetting(key, JSON.stringify(params));
        } catch (error) {
            console.warn('Error saving parameters:', error);
        }
    }

    private async getUserSetting(key: string): Promise<string | undefined> {
        return this.userInfoEngine.GetSetting(key);
    }

    private async setUserSetting(key: string, value: string): Promise<void> {
        await this.userInfoEngine.SetSetting(key, value);
    }

    // ========================================
    // Query Execution
    // ========================================

    public async RunQuery(params: QueryParameterValues): Promise<void> {
        if (!this.QueryInfo || !this._queryId) return;

        this.IsLoading = true;
        this.LastError = null;
        this.QueryStart.emit();
        this.cdr.markForCheck();

        // Save parameters for next time
        this.SavedParams = params;
        await this.saveParameters(params);

        const startTime = performance.now();

        try {
            const runQuery = new RunQuery();
            const runParams: RunQueryParams = {
                QueryID: this._queryId,
                Parameters: params as Record<string, unknown>
            };

            const result = await runQuery.RunQuery(runParams);

            this.ExecutionTimeMs = Math.round(performance.now() - startTime);

            if (result.Success) {
                this.QueryData = result.Results || [];
                this.HasRun = true;
                this.ShowParamsPanel = false;
                this.QueryComplete.emit(result);
            } else {
                this.LastError = result.ErrorMessage || 'Query execution failed';
                this.QueryError.emit(new Error(this.LastError));
                MJNotificationService.Instance.CreateSimpleNotification(
                    this.LastError,
                    'error',
                    5000
                );
            }
        } catch (error) {
            this.ExecutionTimeMs = Math.round(performance.now() - startTime);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.LastError = errorMessage;
            this.QueryError.emit(error instanceof Error ? error : new Error(errorMessage));
            MJNotificationService.Instance.CreateSimpleNotification(
                `Error running query: ${errorMessage}`,
                'error',
                5000
            );
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    // ========================================
    // Event Handlers
    // ========================================

    public OnParametersSubmit(params: QueryParameterValues): void {
        this.RunQuery(params);
    }

    public OnParamsPanelClose(): void {
        this.ShowParamsPanel = false;
        this.cdr.markForCheck();
    }

    public OnGridStateChange(event: QueryGridStateChangedEvent): void {
        this.saveGridState(event.state);
    }

    public OnEntityLinkClick(event: QueryEntityLinkClickEvent): void {
        this.EntityLinkClick.emit(event);
    }

    public OnRowDoubleClick(event: QueryRowClickEvent): void {
        this.RowDoubleClick.emit(event);
    }

    public OnSelectionChange(event: QuerySelectionChangedEvent): void {
        this.SelectionChange.emit(event);
    }

    public OnRefreshRequest(): void {
        if (this.HasRun) {
            this.RunQuery(this.SavedParams);
        } else if (this.QueryInfo?.Parameters?.length) {
            this.ShowParamsPanel = true;
            this.cdr.markForCheck();
        } else {
            this.RunQuery({});
        }
    }

    // ========================================
    // Public API
    // ========================================

    public OpenParametersPanel(): void {
        this.ShowParamsPanel = true;
        this.cdr.markForCheck();
    }

    public OpenInfoPanel(): void {
        this.ShowInfoPanel = true;
        this.cdr.markForCheck();
    }

    public CloseInfoPanel(): void {
        this.ShowInfoPanel = false;
        this.cdr.markForCheck();
    }

    public OnOpenQueryRecord(event: { queryId: string; queryName: string }): void {
        this.OpenQueryRecord.emit(event);
    }

    public Refresh(): void {
        this.OnRefreshRequest();
    }

    public get HasParameters(): boolean {
        return (this.QueryInfo?.Parameters?.length || 0) > 0;
    }
}
