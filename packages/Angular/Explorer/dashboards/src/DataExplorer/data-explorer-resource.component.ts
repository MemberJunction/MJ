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
                [entityFilter]="entityFilter"
                [contextName]="contextName"
                [contextIcon]="contextIcon"
                (OpenEntityRecord)="onOpenEntityRecord($event)">
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

    @ViewChild(DataExplorerDashboardComponent) dataExplorer!: DataExplorerDashboardComponent;

    private readonly _destroy$ = new Subject<void>();
    private _dataLoaded = false;

    // ========================================
    // Constructor
    // ========================================

    constructor(
        private cdr: ChangeDetectorRef,
        private navigationService: NavigationService
    ) {
        super();
    }

    // ========================================
    // Data Property Override
    // ========================================

    override set Data(value: ResourceData) {
        super.Data = value;
        if (!this._dataLoaded) {
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
        // Configuration loaded via Data setter
    }

    ngOnDestroy(): void {
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
}
