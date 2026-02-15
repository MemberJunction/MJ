import { Component, ChangeDetectorRef, AfterViewInit, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboardPart } from './base-dashboard-part';
import { PanelConfig } from '../models/dashboard-types';
import { Metadata, EntityInfo } from '@memberjunction/core';
import { UserViewEntityExtended } from '@memberjunction/core-entities';
import { EntityViewMode, RecordSelectedEvent, RecordOpenedEvent } from '@memberjunction/ng-entity-viewer';

/**
 * Runtime renderer for View dashboard parts.
 * Displays entity data using mj-entity-viewer with grid, cards, or timeline layout.
 */
@RegisterClass(BaseDashboardPart, 'ViewPanelRenderer')
@Component({
  standalone: false,
    selector: 'mj-view-part',
    template: `
        <div class="view-part" [class.loading]="IsLoading" [class.error]="ErrorMessage">
          <!-- Loading state -->
          @if (IsLoading) {
            <div class="loading-state">
              <mj-loading text="Loading view..."></mj-loading>
            </div>
          }
        
          <!-- Error state -->
          @if (ErrorMessage && !IsLoading) {
            <div class="error-state">
              <i class="fa-solid fa-exclamation-triangle"></i>
              <span>{{ ErrorMessage }}</span>
            </div>
          }
        
          <!-- No view configured -->
          @if (!IsLoading && !ErrorMessage && !hasView) {
            <div class="empty-state">
              <i class="fa-solid fa-table"></i>
              <h4>No View Selected</h4>
              <p>Click the configure button to select a view for this part.</p>
            </div>
          }
        
          <!-- Entity Viewer -->
          @if (!IsLoading && !ErrorMessage && hasView && entityInfo) {
            <mj-entity-viewer
              [entity]="entityInfo"
              [viewEntity]="viewEntity"
              [(viewMode)]="viewMode"
              [gridSelectionMode]="selectionMode"
              [showGridToolbar]="false"
              (recordSelected)="onRecordSelected($event)"
              (recordOpened)="onRecordOpened($event)">
            </mj-entity-viewer>
          }
        </div>
        `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
        }

        .view-part {
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

        mj-entity-viewer {
            flex: 1;
            min-height: 0;
        }
    `]
})
export class ViewPartComponent extends BaseDashboardPart implements AfterViewInit, OnDestroy {
    public hasView = false;
    public viewEntity: UserViewEntityExtended | null = null;
    public entityInfo: EntityInfo | null = null;
    public viewMode: EntityViewMode = 'grid';
    public selectionMode: 'single' | 'multiple' = 'single';

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
        const viewId = config?.['viewId'] as string | undefined;
        const entityName = config?.['entityName'] as string | undefined;

        if (!viewId && !entityName) {
            this.hasView = false;
            this.cdr.detectChanges();
            return;
        }

        this.setLoading(true);

        try {
            const md = new Metadata();

            // Set view mode from config
            this.viewMode = (config?.['displayMode'] as EntityViewMode) || 'grid';
            this.selectionMode = config?.['selectionMode'] === 'multiple' ? 'multiple' : 'single';

            if (viewId) {
                // Load saved view by ID
                const viewEntity = await md.GetEntityObject<UserViewEntityExtended>('MJ: User Views');
                const loaded = await viewEntity.Load(viewId);
                this.viewEntity = viewEntity; // IMPORTANT - only set this.viewEntity AFTER we have it loaded in the above

                if (!loaded) {
                    throw new Error('View not found');
                }

                // Get entity info from the view - prefer ViewEntityInfo if available (set by UserViewEntityExtended.Load)
                // Fall back to looking up by Entity name (virtual field) or EntityID
                if (viewEntity.ViewEntityInfo) {
                    this.entityInfo = viewEntity.ViewEntityInfo;
                } else if (viewEntity.Entity) {
                    this.entityInfo = md.Entities.find(e => e.Name === viewEntity!.Entity) || null;
                } else if (viewEntity.EntityID) {
                    // Last resort: look up by EntityID
                    this.entityInfo = md.Entities.find(e => e.ID === viewEntity!.EntityID) || null;
                }

                if (!this.entityInfo) {
                    throw new Error(`Could not determine entity for view "${this.viewEntity.Name}" (ID: ${viewId})`);
                }
            } else if (entityName) {
                // Create dynamic view for entity (no saved view)
                this.entityInfo = md.Entities.find(e => e.Name === entityName) || null;

                if (!this.entityInfo) {
                    throw new Error(`Entity "${entityName}" not found`);
                }

                // No viewEntity means the entity-viewer will show all records
                this.viewEntity = null;
            }

            this.hasView = true;
            this.setLoading(false);
        } catch (error) {
            this.setError(error instanceof Error ? error.message : 'Failed to load view');
        }
    }

    public onRecordSelected(event: RecordSelectedEvent): void {
        // Emit data change event with selected record
        this.emitDataChanged({
            type: 'record-selected',
            record: event.record,
            primaryKey: event.record?.PrimaryKey
        });
    }

    public onRecordOpened(event: RecordOpenedEvent): void {
        // Emit data change event for record open (for any listeners that need it)
        this.emitDataChanged({
            type: 'record-opened',
            record: event.record,
            primaryKey: event.record?.PrimaryKey
        });

        // Request navigation to open the record
        if (event.entity && event.compositeKey) {
            this.RequestOpenEntityRecord(
                event.entity.Name,
                event.compositeKey.ToURLSegment(),
                'view',
                false
            );
        }
    }

    protected override cleanup(): void {
        // EntityViewer handles its own cleanup
        this.viewEntity = null;
        this.entityInfo = null;
    }
}
