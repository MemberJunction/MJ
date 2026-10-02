import { Component, ChangeDetectorRef, AfterViewInit, OnDestroy } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseDashboardPart } from './base-dashboard-part';
import { PanelConfig } from '../models/dashboard-types';
import { EntityInfo } from '@memberjunction/core';
import { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { RecordSelectedEvent, RecordOpenedEvent, ViewRelatedRecordNavigation } from '@memberjunction/ng-entity-viewer';

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
            <mj-empty-state
              class="part-placeholder"
              Variant="error"
              Icon="fa-solid fa-triangle-exclamation"
              Title="Couldn't load view"
              [Message]="ErrorMessage"
              Size="compact" />
          }

          <!-- No view configured -->
          @if (!IsLoading && !ErrorMessage && !hasView) {
            <mj-empty-state
              class="part-placeholder"
              Icon="fa-solid fa-table"
              Title="No View Selected"
              Message="Click the configure button to select a view for this part."
              Size="compact" />
          }
        
          <!-- Entity Viewer -->
          @if (!IsLoading && !ErrorMessage && hasView && entityInfo) {
            <mj-entity-viewer
              [Entity]="entityInfo"
              [ViewEntity]="viewEntity"
              (RecordSelected)="onRecordSelected($event)"
              (RecordOpened)="onRecordOpened($event)"
              (OpenRelatedRecordRequested)="onOpenRelatedRecordRequested($event)">
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

        mj-entity-viewer {
            flex: 1;
            min-height: 0;
        }
    `]
})
export class ViewPartComponent extends BaseDashboardPart implements AfterViewInit, OnDestroy {
    public HasView = false;

    /** @deprecated Use {@link HasView}. */
    public get hasView() {
      return this.HasView;
    }
    /** @deprecated Use {@link HasView}. */
    public set hasView(value) {
      this.HasView = value;
    }
    public ViewEntity: MJUserViewEntityExtended | null = null;

    /** @deprecated Use {@link ViewEntity}. */
    public get viewEntity(): MJUserViewEntityExtended | null {
      return this.ViewEntity;
    }
    /** @deprecated Use {@link ViewEntity}. */
    public set viewEntity(value: MJUserViewEntityExtended | null) {
      this.ViewEntity = value;
    }
    public EntityInfo: EntityInfo | null = null;

    /** @deprecated Use {@link EntityInfo}. */
    public get entityInfo(): EntityInfo | null {
      return this.EntityInfo;
    }
    /** @deprecated Use {@link EntityInfo}. */
    public set entityInfo(value: EntityInfo | null) {
      this.EntityInfo = value;
    }

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
            this.HasView = false;
            this.cdr.detectChanges();
            return;
        }

        this.setLoading(true);

        try {
            const p = this.ProviderToUse;

            if (viewId) {
                // Load saved view by ID
                const viewEntity = await p.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', p.CurrentUser);
                const loaded = await viewEntity.Load(viewId);
                this.ViewEntity = viewEntity; // IMPORTANT - only set this.viewEntity AFTER we have it loaded in the above

                if (!loaded) {
                    throw new Error('View not found');
                }

                // Get entity info from the view - prefer ViewEntityInfo if available (set by MJUserViewEntityExtended.Load)
                // Fall back to looking up by Entity name (virtual field) or EntityID
                if (viewEntity.ViewEntityInfo) {
                    this.EntityInfo = viewEntity.ViewEntityInfo;
                } else if (viewEntity.Entity) {
                    this.EntityInfo = p.EntityByName(viewEntity!.Entity) || null;
                } else if (viewEntity.EntityID) {
                    // Last resort: look up by EntityID
                    this.EntityInfo = p.Entities.find(e => UUIDsEqual(e.ID, viewEntity!.EntityID)) || null;
                }

                if (!this.EntityInfo) {
                    throw new Error(`Could not determine entity for view "${this.ViewEntity.Name}" (ID: ${viewId})`);
                }
            } else if (entityName) {
                // Create dynamic view for entity (no saved view)
                this.EntityInfo = p.EntityByName(entityName) || null;

                if (!this.EntityInfo) {
                    throw new Error(`Entity "${entityName}" not found`);
                }

                // No viewEntity means the entity-viewer will show all records
                this.ViewEntity = null;
            }

            this.HasView = true;
            this.setLoading(false);
        } catch (error) {
            this.setError(error instanceof Error ? error.message : 'Failed to load view');
        }
    }

    public OnRecordSelected(event: RecordSelectedEvent): void {
        // Emit data change event with selected record
        this.emitDataChanged({
            type: 'record-selected',
            record: event.record,
            primaryKey: event.record?.PrimaryKey
        });
    }

    /** @deprecated Use {@link OnRecordSelected}. */
    public onRecordSelected(event: RecordSelectedEvent): void {
      return this.OnRecordSelected(event);
    }

    public OnRecordOpened(event: RecordOpenedEvent): void {
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

    /** @deprecated Use {@link OnRecordOpened}. */
    public onRecordOpened(event: RecordOpenedEvent): void {
      return this.OnRecordOpened(event);
    }

    /**
     * Handle a plug-in renderer's request (bubbled up via the inner entity-viewer) to open a
     * *related* record on a (possibly different) entity — e.g. a grid foreign-key drill-through.
     * Requests navigation through the dashboard-part routing contract.
     *
     * @param nav the related-record navigation payload: the target entity name and the record's key.
     */
    public OnOpenRelatedRecordRequested(nav: ViewRelatedRecordNavigation): void {
        if (nav?.entityName && nav.recordKey != null) {
            this.RequestOpenEntityRecord(
                nav.entityName,
                String(nav.recordKey),
                'view',
                false
            );
        }
    }

    /** @deprecated Use {@link OnOpenRelatedRecordRequested}. */
    public onOpenRelatedRecordRequested(nav: ViewRelatedRecordNavigation): void {
      return this.OnOpenRelatedRecordRequested(nav);
    }

    protected override cleanup(): void {
        // EntityViewer handles its own cleanup
        this.ViewEntity = null;
        this.EntityInfo = null;
    }
}
