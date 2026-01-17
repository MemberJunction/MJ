import { Component, ChangeDetectorRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboardPart } from './base-dashboard-part';
import { QueryPanelConfig } from '../models/dashboard-types';
import { Metadata } from '@memberjunction/core';
import { QueryEntity } from '@memberjunction/core-entities';
import { RunQueryParams } from '@memberjunction/core';
import { QueryGridComponent, GridRowClickedEvent } from '@memberjunction/ng-query-grid';

/**
 * Runtime renderer for Query dashboard parts.
 * Displays query results using mj-query-grid with parameter controls and auto-refresh support.
 */
@RegisterClass(BaseDashboardPart, 'QueryPanelRenderer')
@Component({
    selector: 'mj-query-part',
    template: `
        <div class="query-part" [class.loading]="IsLoading" [class.error]="ErrorMessage">
            <!-- Loading state -->
            <div class="loading-state" *ngIf="IsLoading">
                <mj-loading text="Loading query..."></mj-loading>
            </div>

            <!-- Error state -->
            <div class="error-state" *ngIf="ErrorMessage && !IsLoading">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <span>{{ ErrorMessage }}</span>
            </div>

            <!-- No query configured -->
            <div class="empty-state" *ngIf="!IsLoading && !ErrorMessage && !hasQuery">
                <i class="fa-solid fa-flask"></i>
                <h4>No Query Selected</h4>
                <p>Click the configure button to select a query for this part.</p>
            </div>

            <!-- Query header with refresh controls -->
            <div class="query-header" *ngIf="!IsLoading && !ErrorMessage && hasQuery">
                <div class="query-info">
                    <i class="fa-solid fa-flask"></i>
                    <div class="query-details">
                        <span class="query-name">{{ queryName }}</span>
                        <span class="query-category" *ngIf="categoryName">{{ categoryName }}</span>
                    </div>
                </div>
                <div class="query-actions">
                    <button class="refresh-btn" (click)="refreshQuery()" [disabled]="isRefreshing" title="Refresh">
                        <i class="fa-solid fa-sync-alt" [class.fa-spin]="isRefreshing"></i>
                    </button>
                    <span class="auto-refresh-badge" *ngIf="autoRefreshSeconds > 0">
                        <i class="fa-solid fa-clock"></i>
                        {{ autoRefreshLabel }}
                    </span>
                </div>
            </div>

            <!-- Query Grid -->
            <div class="query-content" *ngIf="!IsLoading && !ErrorMessage && hasQuery">
                <mj-query-grid
                    #queryGrid
                    [Params]="queryParams"
                    [AllowLoad]="allowLoad"
                    [AutoNavigate]="false"
                    (rowClicked)="onRowClicked($event)">
                </mj-query-grid>
            </div>
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
            background: #fff;
        }

        .loading-state,
        .error-state,
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #666;
            text-align: center;
            padding: 24px;
        }

        .error-state i,
        .empty-state i {
            font-size: 48px;
            color: #ccc;
            margin-bottom: 16px;
        }

        .error-state i {
            color: #d32f2f;
        }

        .empty-state h4 {
            margin: 0 0 8px 0;
            color: #333;
        }

        .empty-state p {
            margin: 0;
            font-size: 13px;
        }

        .query-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            border-bottom: 1px solid #e0e0e0;
            background: #fafafa;
            flex-shrink: 0;
        }

        .query-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .query-info > i {
            font-size: 20px;
            color: #5c6bc0;
        }

        .query-details {
            display: flex;
            flex-direction: column;
        }

        .query-name {
            font-weight: 500;
            color: #333;
            font-size: 14px;
        }

        .query-category {
            font-size: 12px;
            color: #666;
        }

        .query-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .refresh-btn {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            background: #fff;
            color: #666;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .refresh-btn:hover:not(:disabled) {
            background: #e8eaf6;
            border-color: #5c6bc0;
            color: #5c6bc0;
        }

        .refresh-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .auto-refresh-badge {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            background: #e8f5e9;
            color: #2e7d32;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }

        .auto-refresh-badge i {
            font-size: 10px;
        }

        .query-content {
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }

        mj-query-grid {
            display: block;
            width: 100%;
            height: 100%;
        }
    `]
})
export class QueryPartComponent extends BaseDashboardPart implements AfterViewInit, OnDestroy {
    @ViewChild('queryGrid') queryGrid!: QueryGridComponent;

    public hasQuery = false;
    public queryName = '';
    public categoryName = '';
    public autoRefreshSeconds = 0;
    public autoRefreshLabel = '';
    public isRefreshing = false;
    public allowLoad = false;
    public queryParams: RunQueryParams | undefined;

    private queryEntity: QueryEntity | null = null;
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
        const config = this.getConfig<QueryPanelConfig>();

        if (!config?.queryId && !config?.queryName) {
            this.hasQuery = false;
            this.cdr.detectChanges();
            return;
        }

        this.setLoading(true);
        this.stopAutoRefresh();
        this.allowLoad = false;

        try {
            const md = new Metadata();

            if (config.queryId) {
                // Load query by ID
                this.queryEntity = await md.GetEntityObject<QueryEntity>('Queries');
                const loaded = await this.queryEntity.Load(config.queryId);

                if (!loaded) {
                    throw new Error('Query not found');
                }

                this.queryName = this.queryEntity.Name;
                this.categoryName = this.queryEntity.Category || '';

                // Build query params
                this.queryParams = {
                    QueryID: config.queryId
                };

                // Note: Default parameters can be passed via the query's built-in parameter system
                // The mj-query-grid component handles parameter binding internally
            } else if (config.queryName) {
                // Query by name - need to find the query first
                this.queryName = config.queryName;
                this.queryParams = undefined; // Will need to implement query lookup by name
            }

            this.hasQuery = true;

            // Set auto-refresh
            this.autoRefreshSeconds = config.autoRefreshSeconds || 0;
            this.autoRefreshLabel = this.getAutoRefreshLabel(this.autoRefreshSeconds);

            // Allow the grid to load
            this.allowLoad = true;
            this.setLoading(false);

            // Start auto-refresh if configured
            if (this.autoRefreshSeconds > 0) {
                this.startAutoRefresh();
            }
        } catch (error) {
            this.setError(error instanceof Error ? error.message : 'Failed to load query');
        }
    }

    public refreshQuery(): void {
        if (this.queryGrid && this.queryParams) {
            this.isRefreshing = true;
            this.cdr.detectChanges();

            this.queryGrid.Refresh(this.queryParams);

            // Reset refreshing state after a short delay
            setTimeout(() => {
                this.isRefreshing = false;
                this.cdr.detectChanges();
            }, 1000);
        }
    }

    public onRowClicked(event: GridRowClickedEvent): void {
        // Emit data change event with clicked row data
        this.emitDataChanged({
            type: 'row-clicked',
            entityId: event.entityId,
            entityName: event.entityName,
            keyValuePairs: event.KeyValuePairs
        });
    }

    private startAutoRefresh(): void {
        if (this.autoRefreshSeconds > 0) {
            this.autoRefreshTimer = setInterval(() => {
                this.refreshQuery();
            }, this.autoRefreshSeconds * 1000);
        }
    }

    private stopAutoRefresh(): void {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }
    }

    private getAutoRefreshLabel(seconds: number): string {
        if (seconds === 0) return '';
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        return `${Math.floor(seconds / 3600)}h`;
    }

    protected override cleanup(): void {
        this.stopAutoRefresh();
        this.queryEntity = null;
        this.queryParams = undefined;
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadQueryPart() {
    // Prevents tree-shaking of the component
}
