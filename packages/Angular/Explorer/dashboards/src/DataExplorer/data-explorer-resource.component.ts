import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, ViewContainerRef } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey } from '@memberjunction/core';
import { BaseResourceComponent, NavigationService, DashboardConfig } from '@memberjunction/ng-shared';
import { ResourceData, MJDashboardEntity } from '@memberjunction/core-entities';
import { DataExplorerDashboardComponent } from './data-explorer-dashboard.component';
import { DataExplorerFilter } from './models/explorer-state.interface';
/**
 * Resource component for the Data Explorer.
 * Wraps DataExplorerDashboardComponent as a BaseResourceComponent for use
 * in application nav items with ResourceType: "Custom".
 */
@RegisterClass(BaseResourceComponent, 'DataExplorerResource')
@Component({
  standalone: false,
    selector: 'mj-data-explorer-resource',
    template: `
        <div class="data-explorer-resource-container">
            <mj-data-explorer-dashboard
                [ParentTabId]="getTabId()"
                [entityFilter]="entityFilter"
                [contextName]="contextName"
                [contextIcon]="contextIcon"
                [initialQueryParams]="initialQueryParams"
                (OpenEntityRecord)="onOpenEntityRecord($event)"
                (DisplayNameChanged)="onDisplayNameChanged($event)">
            </mj-data-explorer-dashboard>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
        }
        .data-explorer-resource-container {
            width: 100%;
            height: 100%;
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataExplorerResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    // ========================================
    // State
    // ========================================

    public EntityFilter: DataExplorerFilter | null = null;

    /** @deprecated Use {@link EntityFilter}. */
    public get entityFilter(): DataExplorerFilter | null {
      return this.EntityFilter;
    }
    /** @deprecated Use {@link EntityFilter}. */
    public set entityFilter(value: DataExplorerFilter | null) {
      this.EntityFilter = value;
    }
    public ContextName: string | null = null;

    /** @deprecated Use {@link ContextName}. */
    public get contextName(): string | null {
      return this.ContextName;
    }
    /** @deprecated Use {@link ContextName}. */
    public set contextName(value: string | null) {
      this.ContextName = value;
    }
    public ContextIcon: string | null = null;

    /** @deprecated Use {@link ContextIcon}. */
    public get contextIcon(): string | null {
      return this.ContextIcon;
    }
    /** @deprecated Use {@link ContextIcon}. */
    public set contextIcon(value: string | null) {
      this.ContextIcon = value;
    }
    /** Initial query params from the URL, forwarded to the dashboard */
    public InitialQueryParams: Record<string, string> = {};

    /** @deprecated Use {@link InitialQueryParams}. */
    public get initialQueryParams(): Record<string, string> {
      return this.InitialQueryParams;
    }
    /** @deprecated Use {@link InitialQueryParams}. */
    public set initialQueryParams(value: Record<string, string>) {
      this.InitialQueryParams = value;
    }

    @ViewChild(DataExplorerDashboardComponent) DataExplorer!: DataExplorerDashboardComponent;

    /** @deprecated Use {@link DataExplorer}. */
    get dataExplorer(): DataExplorerDashboardComponent {
      return this.DataExplorer;
    }
    /** @deprecated Use {@link DataExplorer}. */
    set dataExplorer(value: DataExplorerDashboardComponent) {
      this.DataExplorer = value;
    }

    private readonly _destroy$ = new Subject<void>();
    private _dataLoaded = false;

    // ========================================
    // Constructor
    // ========================================

    constructor(
        private cdr: ChangeDetectorRef) {
        super();
    }

    // ========================================
    // Data Property Override
    // ========================================

    override set Data(value: ResourceData) {
        const previousConfig = JSON.stringify(super.Data?.Configuration || {});
        super.Data = value;

        const newConfig = JSON.stringify(value?.Configuration || {});

        // Load on first set, or when the configuration has changed
        if (!this._dataLoaded || previousConfig !== newConfig) {
            this._dataLoaded = true;
            this.loadConfiguration();
        }
    }

    override get Data(): ResourceData {
        return super.Data;
    }

    // ========================================
    // Lifecycle
    // ========================================

    ngOnInit(): void {
        super.ngOnInit();
        // Configuration loaded via Data setter
    }

    /**
     * Forward query param changes from the framework to the inner dashboard.
     * The shell delivers params here (on the resource wrapper), but the dashboard
     * needs them for deep linking (entity, viewId, filter, view mode, map mode).
     */
    protected override OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
        if (this.DataExplorer) {
            this.DataExplorer.HandleQueryParamsChanged(params, source);
        }
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this._destroy$.next();
        this._destroy$.complete();
    }

    // ========================================
    // BaseResourceComponent Implementation
    // ========================================

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return data.Name || 'Data';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-table-cells';
    }

    // ========================================
    // Private Methods
    // ========================================

    private loadConfiguration(): void {
        const data = this.Data;
        if (!data) {
            this.NotifyLoadComplete();
            return;
        }

        const config = data.Configuration || {};

        // Extract configuration options
        this.EntityFilter = config['entityFilter'] as DataExplorerFilter || null;
        this.ContextName = config['appName'] as string || null;
        this.ContextIcon = config['appIcon'] as string || null;

        // Build initial query params: start with workspace-saved params, then let
        // browser URL params override. The URL is the source of truth for user intent —
        // if the user navigates to a URL with specific params, those should take priority
        // over potentially stale workspace state from a prior session.
        const workspaceParams = (config['queryParams'] as Record<string, string>) || {};
        const browserParams = new URLSearchParams(window.location.search);
        const merged = { ...workspaceParams };
        browserParams.forEach((value, key) => {
            merged[key] = value;
        });
        this.InitialQueryParams = merged;

        this.cdr.detectChanges();

        // Setup LoadCompleteEvent after view initializes
        setTimeout(() => {
            if (this.DataExplorer) {
                this.DataExplorer.LoadCompleteEvent = () => {
                    this.NotifyLoadComplete();
                };

                // Initialize with minimal config (no database dashboard)
                const dashboardConfig: DashboardConfig = {
                    dashboard: null as unknown as MJDashboardEntity,
                    userState: {}
                };
                this.DataExplorer.Config = dashboardConfig;
                this.DataExplorer.Refresh();

                // RACE GUARD: BaseDashboard.ngOnInit() calls NotifyLoadComplete() almost immediately
                // (after the no-op loadData), firing the inner dashboard's LoadCompleteEvent. But this
                // wiring runs in a setTimeout(0) MACROtask, while the dashboard's NotifyLoadComplete runs
                // in a MICROtask — so the dashboard finishes loading BEFORE we attach the handler above,
                // and the completion signal is lost. The shell then waits forever ("Gathering your
                // tools…" hangs) — reproduced on direct-URL refresh. If the dashboard already completed,
                // forward completion to the shell now.
                if (this.DataExplorer.LoadComplete) {
                    this.NotifyLoadComplete();
                }
            } else {
                this.NotifyLoadComplete();
            }
        }, 0);
    }

    // ========================================
    // Event Handlers
    // ========================================

    public OnOpenEntityRecord(event: { EntityName: string; RecordPKey: CompositeKey }): void {
        if (event && event.EntityName && event.RecordPKey) {
            this.navigationService.OpenEntityRecord(event.EntityName, event.RecordPKey);
        }
    }

    /** @deprecated Use {@link OnOpenEntityRecord}. */
    public onOpenEntityRecord(event: { EntityName: string; RecordPKey: CompositeKey }): void {
      return this.OnOpenEntityRecord(event);
    }

    public OnDisplayNameChanged(name: string): void {
        this.NotifyDisplayNameChanged(name);
    }

    /** @deprecated Use {@link OnDisplayNameChanged}. */
    public onDisplayNameChanged(name: string): void {
      return this.OnDisplayNameChanged(name);
    }
}
