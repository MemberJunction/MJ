import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnDestroy,
    OnChanges,
    SimpleChanges,
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
 *   [queryId]="selectedQueryId"
 *   [autoRun]="true"
 *   (entityLinkClick)="openRecord($event)">
 * </mj-query-viewer>
 * ```
 */
@Component({
    selector: 'mj-query-viewer',
    templateUrl: './query-viewer.component.html',
    styleUrls: ['./query-viewer.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class QueryViewerComponent implements OnInit, OnChanges, OnDestroy {
    // ========================================
    // Inputs
    // ========================================

    private _queryId: string | null = null;
    /**
     * The ID of the query to display
     */
    @Input()
    set queryId(value: string | null) {
        const previous = this._queryId;
        this._queryId = value;
        if (value !== previous) {
            this.onQueryIdChanged();
        }
    }
    get queryId(): string | null {
        return this._queryId;
    }

    /**
     * Whether to auto-run the query when all required params have saved values
     */
    @Input() autoRun: boolean = true;

    /**
     * Selection mode for the grid
     */
    @Input() selectionMode: QueryGridSelectionMode = 'single';

    /**
     * Whether to show the toolbar
     */
    @Input() showToolbar: boolean = true;

    /**
     * Visual configuration for the grid
     */
    @Input() visualConfig: QueryGridVisualConfig = {};

    /**
     * Whether to persist grid state
     */
    @Input() persistState: boolean = true;

    /**
     * Whether to persist parameter values
     */
    @Input() persistParameters: boolean = true;

    // ========================================
    // Outputs
    // ========================================

    /**
     * Fired when an entity link is clicked in the grid
     */
    @Output() entityLinkClick = new EventEmitter<QueryEntityLinkClickEvent>();

    /**
     * Fired when a row is double-clicked
     */
    @Output() rowDoubleClick = new EventEmitter<QueryRowClickEvent>();

    /**
     * Fired when selection changes
     */
    @Output() selectionChange = new EventEmitter<QuerySelectionChangedEvent>();

    /**
     * Fired when query execution starts
     */
    @Output() queryStart = new EventEmitter<void>();

    /**
     * Fired when query execution completes
     */
    @Output() queryComplete = new EventEmitter<RunQueryResult>();

    /**
     * Fired when query execution fails
     */
    @Output() queryError = new EventEmitter<Error>();

    // ========================================
    // View Children
    // ========================================

    @ViewChild(QueryDataGridComponent) dataGrid!: QueryDataGridComponent;

    // ========================================
    // Internal State
    // ========================================

    public queryInfo: QueryInfo | null = null;
    public queryData: Record<string, unknown>[] = [];
    public isLoading: boolean = false;
    public showParamsPanel: boolean = false;
    public hasRun: boolean = false;
    public lastError: string | null = null;
    public executionTimeMs: number | null = null;

    public savedGridState: QueryGridState | null = null;
    public savedParams: QueryParameterValues = {};

    private metadata = new Metadata();
    private destroy$ = new Subject<void>();
    private userInfoEngine = UserInfoEngine.Instance;

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['queryId']) {
            // Handled by setter
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ========================================
    // Query Loading
    // ========================================

    private async onQueryIdChanged(): Promise<void> {
        // Reset state
        this.queryInfo = null;
        this.queryData = [];
        this.hasRun = false;
        this.lastError = null;
        this.executionTimeMs = null;
        this.savedGridState = null;
        this.savedParams = {};
        this.showParamsPanel = false;
        this.cdr.markForCheck();

        if (!this._queryId) {
            return;
        }

        // Load query info from metadata
        this.queryInfo = this.metadata.Queries.find(q => q.ID === this._queryId) || null;

        if (!this.queryInfo) {
            this.lastError = `Query with ID ${this._queryId} not found`;
            this.cdr.markForCheck();
            return;
        }

        // Load saved state from User Settings
        await this.loadSavedState();

        // Determine if we should show params or auto-run
        const hasParams = this.queryInfo.Parameters && this.queryInfo.Parameters.length > 0;
        const hasRequiredParams = hasParams && this.queryInfo.Parameters.some(p => p.IsRequired);

        if (hasParams) {
            // Check if all required params have saved values
            const canAutoRun = this.autoRun && this.canAutoRunWithSavedParams();

            if (canAutoRun) {
                // Auto-run with saved parameters
                await this.runQuery(this.savedParams);
            } else {
                // Show parameter panel
                this.showParamsPanel = true;
            }
        } else {
            // No parameters - auto-run immediately
            await this.runQuery({});
        }

        this.cdr.markForCheck();
    }

    private canAutoRunWithSavedParams(): boolean {
        if (!this.queryInfo) return false;

        const requiredParams = this.queryInfo.Parameters?.filter(p => p.IsRequired) || [];

        for (const param of requiredParams) {
            const savedValue = this.savedParams[param.Name];
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
            if (this.persistState) {
                const gridStateKey = getQueryGridStateKey(this._queryId);
                const gridStateSetting = await this.getUserSetting(gridStateKey);
                if (gridStateSetting) {
                    this.savedGridState = JSON.parse(gridStateSetting) as QueryGridState;
                }
            }

            // Load saved parameters
            if (this.persistParameters) {
                const paramsKey = getQueryParamsKey(this._queryId);
                const paramsSetting = await this.getUserSetting(paramsKey);
                if (paramsSetting) {
                    this.savedParams = JSON.parse(paramsSetting) as QueryParameterValues;
                }
            }
        } catch (error) {
            console.warn('Error loading saved query state:', error);
        }
    }

    private async saveGridState(state: QueryGridState): Promise<void> {
        if (!this._queryId || !this.persistState) return;

        try {
            const key = getQueryGridStateKey(this._queryId);
            await this.setUserSetting(key, JSON.stringify(state));
        } catch (error) {
            console.warn('Error saving grid state:', error);
        }
    }

    private async saveParameters(params: QueryParameterValues): Promise<void> {
        if (!this._queryId || !this.persistParameters) return;

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

    public async runQuery(params: QueryParameterValues): Promise<void> {
        if (!this.queryInfo || !this._queryId) return;

        this.isLoading = true;
        this.lastError = null;
        this.queryStart.emit();
        this.cdr.markForCheck();

        // Save parameters for next time
        this.savedParams = params;
        await this.saveParameters(params);

        const startTime = performance.now();

        try {
            const runQuery = new RunQuery();
            const runParams: RunQueryParams = {
                QueryID: this._queryId,
                Parameters: params as Record<string, unknown>
            };

            const result = await runQuery.RunQuery(runParams);

            this.executionTimeMs = Math.round(performance.now() - startTime);

            if (result.Success) {
                this.queryData = result.Results || [];
                this.hasRun = true;
                this.showParamsPanel = false;
                this.queryComplete.emit(result);
            } else {
                this.lastError = result.ErrorMessage || 'Query execution failed';
                this.queryError.emit(new Error(this.lastError));
                MJNotificationService.Instance.CreateSimpleNotification(
                    this.lastError,
                    'error',
                    5000
                );
            }
        } catch (error) {
            this.executionTimeMs = Math.round(performance.now() - startTime);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.lastError = errorMessage;
            this.queryError.emit(error instanceof Error ? error : new Error(errorMessage));
            MJNotificationService.Instance.CreateSimpleNotification(
                `Error running query: ${errorMessage}`,
                'error',
                5000
            );
        } finally {
            this.isLoading = false;
            this.cdr.markForCheck();
        }
    }

    // ========================================
    // Event Handlers
    // ========================================

    public onParametersSubmit(params: QueryParameterValues): void {
        this.runQuery(params);
    }

    public onParamsPanelClose(): void {
        this.showParamsPanel = false;
        this.cdr.markForCheck();
    }

    public onGridStateChange(event: QueryGridStateChangedEvent): void {
        this.saveGridState(event.state);
    }

    public onEntityLinkClick(event: QueryEntityLinkClickEvent): void {
        this.entityLinkClick.emit(event);
    }

    public onRowDoubleClick(event: QueryRowClickEvent): void {
        this.rowDoubleClick.emit(event);
    }

    public onSelectionChange(event: QuerySelectionChangedEvent): void {
        this.selectionChange.emit(event);
    }

    public onRefreshRequest(): void {
        if (this.hasRun) {
            this.runQuery(this.savedParams);
        } else if (this.queryInfo?.Parameters?.length) {
            this.showParamsPanel = true;
            this.cdr.markForCheck();
        } else {
            this.runQuery({});
        }
    }

    // ========================================
    // Public API
    // ========================================

    public openParametersPanel(): void {
        this.showParamsPanel = true;
        this.cdr.markForCheck();
    }

    public refresh(): void {
        this.onRefreshRequest();
    }

    public get hasParameters(): boolean {
        return (this.queryInfo?.Parameters?.length || 0) > 0;
    }
}
