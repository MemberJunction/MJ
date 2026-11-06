import { Component, ChangeDetectorRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboardPart } from './base-dashboard-part';
import { PanelConfig } from '../models/dashboard-types';
import { MJQueryEntity } from '@memberjunction/core-entities';
import { QueryViewerComponent, QueryEntityLinkClickEvent, QueryParameterValues, QuerySelectionChangedEvent } from '@memberjunction/ng-query-viewer';
import { PartInputProblemMessage, PartInputResolution, ROW_SELECTED_EVENT } from '../models/dashboard-properties';
import { LoadPartInterface } from '../models/dashboard-part-interfaces';

/**
 * Runtime renderer for Query dashboard parts.
 * Displays query results using mj-query-viewer with parameter controls and auto-refresh support.
 */
@RegisterClass(BaseDashboardPart, 'QueryPanelRenderer')
@Component({
  standalone: false,
    selector: 'mj-query-part',
    template: `
        <div class="query-part" [class.loading]="IsLoading" [class.error]="ErrorMessage">
          <!-- Loading state -->
          @if (IsLoading) {
            <div class="loading-state">
              <mj-loading text="Loading query..."></mj-loading>
            </div>
          }
        
          <!-- Error state -->
          @if (ErrorMessage && !IsLoading) {
            <mj-empty-state
              class="part-placeholder"
              Variant="error"
              Icon="fa-solid fa-triangle-exclamation"
              Title="Couldn't load query"
              [Message]="ErrorMessage"
              Size="compact" />
          }

          <!-- No query configured -->
          @if (!IsLoading && !ErrorMessage && !hasQuery) {
            <mj-empty-state
              class="part-placeholder"
              Icon="fa-solid fa-flask"
              Title="No Query Selected"
              Message="Use Edit part to choose a query."
              Size="compact" />
          }
        
          @if (HasActiveSelection && !IsLoading && !ErrorMessage) {
            <div class="part-selection-bar">
              <button type="button" class="part-clear-selection" (click)="ClearSelection()">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i> Clear selection
              </button>
            </div>
          }

          <!-- Query Viewer -->
          @if (!IsLoading && !ErrorMessage && hasQuery && queryId) {
            <div class="query-content">
              <mj-query-viewer
                #queryViewer
                [Provider]="Provider"
                [QueryId]="queryId"
                [AutoRun]="true"
                [ShowToolbar]="showToolbar"
                [PersistState]="true"
                [PersistParameters]="true"
                [MappedParameters]="MappedParameters"
                (EntityLinkClick)="onEntityLinkClick($event)"
                (SelectionChange)="OnSelectionChange($event)"
                (QueryError)="onQueryError($event)">
              </mj-query-viewer>
            </div>
          }
        </div>
        `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
        }

        .query-part {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            background: var(--mj-bg-surface);
        }

        .loading-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--mj-text-secondary);
            text-align: center;
            padding: 24px;
        }

        .part-placeholder {
            height: 100%;
        }

        .query-content {
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }

        mj-query-viewer {
            display: block;
            width: 100%;
            height: 100%;
        }

        .part-selection-bar {
            display: flex;
            justify-content: flex-end;
            padding: 4px 8px;
            border-bottom: 1px solid var(--mj-border-subtle);
        }

        .part-clear-selection {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 2px 10px;
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
            background: var(--mj-bg-surface);
            color: var(--mj-text-secondary);
            font-size: 12px;
            cursor: pointer;
        }

        .part-clear-selection:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }
    `]
})
export class QueryPartComponent extends BaseDashboardPart implements AfterViewInit, OnDestroy {
    @ViewChild('queryViewer') QueryViewer!: QueryViewerComponent;

    /** @deprecated Use {@link QueryViewer}. */
    get queryViewer(): QueryViewerComponent {
      return this.QueryViewer;
    }
    /** @deprecated Use {@link QueryViewer}. */
    set queryViewer(value: QueryViewerComponent) {
      this.QueryViewer = value;
    }

    public HasQuery = false;

    /** @deprecated Use {@link HasQuery}. */
    public get hasQuery() {
      return this.HasQuery;
    }
    /** @deprecated Use {@link HasQuery}. */
    public set hasQuery(value) {
      this.HasQuery = value;
    }
    public QueryId: string | null = null;

    /** @deprecated Use {@link QueryId}. */
    public get queryId(): string | null {
      return this.QueryId;
    }
    /** @deprecated Use {@link QueryId}. */
    public set queryId(value: string | null) {
      this.QueryId = value;
    }
    public ShowToolbar = true;

    /** @deprecated Use {@link ShowToolbar}. */
    public get showToolbar() {
      return this.ShowToolbar;
    }
    /** @deprecated Use {@link ShowToolbar}. */
    public set showToolbar(value) {
      this.ShowToolbar = value;
    }

    /**
     * Parameter values from the part's input mappings. They override the user's saved values, are
     * never saved back into them, and show read-only. Null when the part has no mappings.
     */
    public MappedParameters: QueryParameterValues | null = null;

    /** True while the part shows a problem with its mappings rather than a load error. */
    private showingInputProblem = false;

    private queryEntity: MJQueryEntity | null = null;
    private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngAfterViewInit(): void {
        if (this.Panel) {
            this.loadContent();
        }
    }

    public async loadContent(): Promise<void> {
        const config = this.getConfig<PanelConfig>();
        const queryId = config?.['queryId'] as string | undefined;
        const queryName = config?.['queryName'] as string | undefined;

        if (!queryId && !queryName) {
            this.HasQuery = false;
            this.cdr.detectChanges();
            return;
        }

        this.setLoading(true);
        this.stopAutoRefresh();

        try {
            const p = this.ProviderToUse;

            if (queryId) {
                // Load query by ID to verify it exists
                this.queryEntity = await p.GetEntityObject<MJQueryEntity>('MJ: Queries', p.CurrentUser);
                const loaded = await this.queryEntity.Load(queryId);

                if (!loaded) {
                    throw new Error('Query not found');
                }

                this.QueryId = queryId;
            } else if (queryName) {
                // Query by name - find the query ID from metadata
                const queryInfo = p.Queries.find(q => q.Name === queryName);
                if (queryInfo) {
                    this.QueryId = queryInfo.ID;
                } else {
                    throw new Error(`Query "${queryName}" not found`);
                }
            }

            if (!(await this.applyQueryInputs(config))) return;
            this.HasQuery = true;
            this.ShowToolbar = (config?.['showParameterControls'] as boolean) !== false;

            // Set auto-refresh if configured
            const autoRefreshSeconds = (config?.['autoRefreshSeconds'] as number) || 0;
            if (autoRefreshSeconds > 0) {
                this.startAutoRefresh(autoRefreshSeconds);
            }

            this.setLoading(false);
        } catch (error) {
            this.showingInputProblem = false;
            this.setError(error instanceof Error ? error.message : 'Failed to load query');
        }
    }

    /**
     * Works out the mapped parameter values. A part without mappings loads nothing more and runs as
     * before. Returns false, showing why, when a mapping is broken or a mapped input has no value.
     */
    private async applyQueryInputs(config: PanelConfig | null): Promise<boolean> {
        if (this.InputMappings.length === 0) {
            this.MappedParameters = null;
            return true;
        }
        const partInterface = await LoadPartInterface(config, this.ProviderToUse);
        return this.showInputs(this.UpdateInputs(partInterface.Inputs));
    }

    /** Shows the inputs' problem, or takes their values. Returns false when the part stops. */
    private showInputs(resolution: PartInputResolution | null): boolean {
        const problem = PartInputProblemMessage(resolution);
        this.showingInputProblem = problem !== null;
        if (problem) {
            this.setError(problem);
            return false;
        }
        this.MappedParameters = resolution ? this.mappedValues(resolution) : null;
        return true;
    }

    /**
     * Every mapped parameter with its value, or null when nothing set it, so the query viewer never
     * falls back to the user's saved value for a parameter the dashboard drives.
     */
    private mappedValues(resolution: PartInputResolution): QueryParameterValues {
        const values: QueryParameterValues = {};
        for (const mapping of this.InputMappings) {
            values[mapping.Input] = resolution.Values[mapping.Input] ?? null;
        }
        return values;
    }

    /** New input values: the query viewer reruns the query with them. */
    protected override ApplyInputs(resolution: PartInputResolution | null): void {
        if (this.ErrorMessage && !this.showingInputProblem) return; // a load error stays until the next load
        if (this.showInputs(resolution)) {
            this.ErrorMessage = null;
            this.HasQuery = !!this.QueryId;
            this.cdr.detectChanges();
        }
    }

    /** RowSelected: the selected row's columns; an empty selection clears it. */
    public OnSelectionChange(event: QuerySelectionChangedEvent): void {
        const row = event?.selectedRows?.[0];
        this.EmitPartEvent(ROW_SELECTED_EVENT, row ? { ...row } : null);
    }

    public OnEntityLinkClick(event: QueryEntityLinkClickEvent): void {
        // Emit data change event with clicked entity info (for any listeners that need it)
        this.emitDataChanged({
            type: 'entity-link-click',
            entityName: event.entityName,
            recordId: event.recordId
        });

        // Request navigation to open the record
        if (event.entityName && event.recordId) {
            this.RequestOpenEntityRecord(
                event.entityName,
                event.recordId,
                'view',
                false
            );
        }
    }

    /** @deprecated Use {@link OnEntityLinkClick}. */
    public onEntityLinkClick(event: QueryEntityLinkClickEvent): void {
      return this.OnEntityLinkClick(event);
    }

    public OnQueryError(error: Error): void {
        console.error('[QueryPart] Query error:', error.message);
    }

    /** @deprecated Use {@link OnQueryError}. */
    public onQueryError(error: Error): void {
      return this.OnQueryError(error);
    }

    public RefreshQuery(): void {
        if (this.QueryViewer) {
            this.QueryViewer.Refresh();
        }
    }

    /** @deprecated Use {@link RefreshQuery}. */
    public refreshQuery(): void {
      return this.RefreshQuery();
    }

    private startAutoRefresh(seconds: number): void {
        this.stopAutoRefresh();
        if (seconds > 0) {
            this.autoRefreshTimer = setInterval(() => {
                this.RefreshQuery();
            }, seconds * 1000);
        }
    }

    private stopAutoRefresh(): void {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }
    }

    protected override cleanup(): void {
        this.stopAutoRefresh();
        this.queryEntity = null;
        this.QueryId = null;
    }
}
