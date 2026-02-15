import { Component, ChangeDetectorRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboardPart } from './base-dashboard-part';
import { PanelConfig } from '../models/dashboard-types';
import { Metadata } from '@memberjunction/core';
import { MJQueryEntity } from '@memberjunction/core-entities';
import { QueryViewerComponent, QueryEntityLinkClickEvent } from '@memberjunction/ng-query-viewer';

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
            <div class="error-state">
              <i class="fa-solid fa-exclamation-triangle"></i>
              <span>{{ ErrorMessage }}</span>
            </div>
          }
        
          <!-- No query configured -->
          @if (!IsLoading && !ErrorMessage && !hasQuery) {
            <div class="empty-state">
              <i class="fa-solid fa-flask"></i>
              <h4>No Query Selected</h4>
              <p>Click the configure button to select a query for this part.</p>
            </div>
          }
        
          <!-- Query Viewer -->
          @if (!IsLoading && !ErrorMessage && hasQuery && queryId) {
            <div class="query-content">
              <mj-query-viewer
                #queryViewer
                [QueryId]="queryId"
                [AutoRun]="true"
                [ShowToolbar]="showToolbar"
                [PersistState]="true"
                [PersistParameters]="true"
                (EntityLinkClick)="onEntityLinkClick($event)"
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
    `]
})
export class QueryPartComponent extends BaseDashboardPart implements AfterViewInit, OnDestroy {
    @ViewChild('queryViewer') queryViewer!: QueryViewerComponent;

    public hasQuery = false;
    public queryId: string | null = null;
    public showToolbar = true;

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
            this.hasQuery = false;
            this.cdr.detectChanges();
            return;
        }

        this.setLoading(true);
        this.stopAutoRefresh();

        try {
            const md = new Metadata();

            if (queryId) {
                // Load query by ID to verify it exists
                this.queryEntity = await md.GetEntityObject<MJQueryEntity>('MJ: Queries');
                const loaded = await this.queryEntity.Load(queryId);

                if (!loaded) {
                    throw new Error('Query not found');
                }

                this.queryId = queryId;
            } else if (queryName) {
                // Query by name - find the query ID from metadata
                const queryInfo = md.Queries.find(q => q.Name === queryName);
                if (queryInfo) {
                    this.queryId = queryInfo.ID;
                } else {
                    throw new Error(`Query "${queryName}" not found`);
                }
            }

            this.hasQuery = true;
            this.showToolbar = (config?.['showParameterControls'] as boolean) !== false;

            // Set auto-refresh if configured
            const autoRefreshSeconds = (config?.['autoRefreshSeconds'] as number) || 0;
            if (autoRefreshSeconds > 0) {
                this.startAutoRefresh(autoRefreshSeconds);
            }

            this.setLoading(false);
        } catch (error) {
            this.setError(error instanceof Error ? error.message : 'Failed to load query');
        }
    }

    public onEntityLinkClick(event: QueryEntityLinkClickEvent): void {
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

    public onQueryError(error: Error): void {
        console.error('[QueryPart] Query error:', error.message);
    }

    public refreshQuery(): void {
        if (this.queryViewer) {
            this.queryViewer.Refresh();
        }
    }

    private startAutoRefresh(seconds: number): void {
        this.stopAutoRefresh();
        if (seconds > 0) {
            this.autoRefreshTimer = setInterval(() => {
                this.refreshQuery();
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
        this.queryId = null;
    }
}
