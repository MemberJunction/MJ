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

    public entityFilter: DataExplorerFilter | null = null;
    public contextName: string | null = null;
    public contextIcon: string | null = null;
    /** Initial query params from the URL, forwarded to the dashboard */
    public initialQueryParams: Record<string, string> = {};

    @ViewChild(DataExplorerDashboardComponent) dataExplorer!: DataExplorerDashboardComponent;

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
        if (this.dataExplorer) {
            this.dataExplorer.HandleQueryParamsChanged(params, source);
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
        this.entityFilter = config['entityFilter'] as DataExplorerFilter || null;
        this.contextName = config['appName'] as string || null;
        this.contextIcon = config['appIcon'] as string || null;

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
        this.initialQueryParams = merged;

        this.cdr.detectChanges();

        // Setup LoadCompleteEvent after view initializes
        setTimeout(() => {
            if (this.dataExplorer) {
                this.dataExplorer.LoadCompleteEvent = () => {
                    this.NotifyLoadComplete();
                };

                // Initialize with minimal config (no database dashboard)
                const dashboardConfig: DashboardConfig = {
                    dashboard: null as unknown as MJDashboardEntity,
                    userState: {}
                };
                this.dataExplorer.Config = dashboardConfig;
                this.dataExplorer.Refresh();
            } else {
                this.NotifyLoadComplete();
            }
        }, 0);
    }

    // ========================================
    // Event Handlers
    // ========================================

    public onOpenEntityRecord(event: { EntityName: string; RecordPKey: CompositeKey }): void {
        if (event && event.EntityName && event.RecordPKey) {
            this.navigationService.OpenEntityRecord(event.EntityName, event.RecordPKey);
        }
    }

    public onDisplayNameChanged(name: string): void {
        this.NotifyDisplayNameChanged(name);
    }
}
