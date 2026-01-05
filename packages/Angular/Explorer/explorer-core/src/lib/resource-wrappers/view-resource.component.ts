import { Component, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, UserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata, EntityInfo } from '@memberjunction/core';
import { RecordOpenedEvent, ViewGridStateConfig } from '@memberjunction/ng-entity-viewer';

export function LoadViewResource() {
    // Force class to be included in production builds (tree shaking workaround)
}

/**
 * UserViewResource - Resource wrapper for displaying User Views in tabs
 *
 * This component wraps the EntityViewerComponent to display view data.
 * It loads the view configuration and entity, then renders the data grid/cards.
 *
 * Key features:
 * - Loads view by ID from ResourceRecordID
 * - Supports dynamic views by entity name + extra filter
 * - Applies view's WhereClause, GridState, and SortState
 * - Opens records in new tabs via NavigationService
 */
@RegisterClass(BaseResourceComponent, 'ViewResource')
@Component({
  standalone: false,
    selector: 'mj-userview-resource',
    template: `
        <div #container class="view-resource-container">
            @if (isLoading) {
                <div class="view-loading-state">
                    <mj-loading text="Loading view..." size="large"></mj-loading>
                </div>
            } @else if (errorMessage) {
                <div class="view-error-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>{{ errorMessage }}</p>
                </div>
            } @else if (entityInfo) {
                <div class="view-header">
                    <h2 class="view-title">{{ viewEntity?.Name || entityInfo.Name }}</h2>
                    @if (viewEntity?.Description) {
                        <p class="view-description">{{ viewEntity!.Description }}</p>
                    }
                </div>
                <mj-entity-viewer
                    [entity]="entityInfo"
                    [viewEntity]="viewEntity"
                    [gridState]="gridState"
                    (recordOpened)="onRecordOpened($any($event))"
                    (dataLoaded)="onDataLoaded()">
                </mj-entity-viewer>
            }
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
        }
        .view-resource-container {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .view-header {
            padding: 16px 20px 8px 20px;
            flex-shrink: 0;
        }
        .view-title {
            margin: 0 0 4px 0;
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--text-primary, #1a1a1a);
        }
        .view-description {
            margin: 0;
            font-size: 0.875rem;
            color: var(--text-secondary, #666);
        }
        .view-loading-state,
        .view-error-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 16px;
        }
        .view-error-state {
            color: var(--danger-color, #dc3545);
        }
        .view-error-state i {
            font-size: 2rem;
        }
        .view-error-state p {
            margin: 0;
            font-size: 1rem;
        }
        mj-entity-viewer {
            flex: 1;
            min-height: 0;
        }
    `]
})
export class UserViewResource extends BaseResourceComponent {
    @ViewChild('container', { static: true }) containerElement!: ElementRef<HTMLDivElement>;

    public isLoading: boolean = false;
    public errorMessage: string | null = null;
    public entityInfo: EntityInfo | null = null;
    public viewEntity: UserViewEntityExtended | null = null;
    public gridState: ViewGridStateConfig | null = null;

    private dataLoaded = false;
    private metadata = new Metadata();

    constructor(
        private navigationService: NavigationService,
        private cdr: ChangeDetectorRef
    ) {
        super();
    }

    override set Data(value: ResourceData) {
        super.Data = value;
        if (!this.dataLoaded) {
            this.dataLoaded = true;
            this.loadView();
        }
    }

    override get Data(): ResourceData {
        return super.Data;
    }

    /**
     * Load the view and entity based on ResourceData
     */
    private async loadView(): Promise<void> {
        const data = this.Data;

        if (!data) {
            this.NotifyLoadComplete();
            return;
        }

        this.isLoading = true;
        this.errorMessage = null;
        this.NotifyLoadStarted();
        this.cdr.detectChanges();

        try {
            // Case 1: Load view by ID
            if (data.ResourceRecordID) {
                await this.loadViewById(data.ResourceRecordID);
            }
            // Case 2: Load dynamic view by entity name
            else if (data.Configuration?.Entity) {
                await this.loadDynamicView(
                    data.Configuration.Entity as string,
                    data.Configuration.ExtraFilter as string | undefined
                );
            }
            else {
                this.errorMessage = 'No view ID or entity specified';
            }
        } catch (error) {
            console.error('Error loading view:', error);
            this.errorMessage = error instanceof Error ? error.message : 'Failed to load view';
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();

            // If there was an error, notify load complete now
            if (this.errorMessage) {
                this.NotifyLoadComplete();
            }
            // Otherwise, wait for dataLoaded event from entity-viewer
        }
    }

    /**
     * Load a saved view by its ID
     */
    private async loadViewById(viewId: string): Promise<void> {
        // Load the view entity
        const view = await ViewInfo.GetViewEntity(viewId);

        if (!view) {
            throw new Error(`View with ID ${viewId} not found`);
        }

        this.viewEntity = view as UserViewEntityExtended;

        // Check permissions
        if (!this.viewEntity.UserCanView) {
            throw new Error('You do not have permission to view this view');
        }

        // Load the entity info
        const entity = this.metadata.Entities.find(e => e.ID === this.viewEntity!.EntityID);

        if (!entity) {
            throw new Error(`Entity for view not found`);
        }

        this.entityInfo = entity;

        // Parse grid state if available
        if (this.viewEntity.GridState) {
            try {
                this.gridState = JSON.parse(this.viewEntity.GridState) as ViewGridStateConfig;
            } catch (e) {
                console.warn('Failed to parse GridState:', e);
                this.gridState = null;
            }
        }
    }

    /**
     * Load a dynamic view (no saved view, just entity + filter)
     */
    private async loadDynamicView(entityName: string, _extraFilter?: string): Promise<void> {
        const entity = this.metadata.Entities.find(
            e => e.Name?.trim().toLowerCase() === entityName.trim().toLowerCase()
        );

        if (!entity) {
            throw new Error(`Entity '${entityName}' not found`);
        }

        this.entityInfo = entity;
        this.viewEntity = null;
        this.gridState = null;

        // For dynamic views, we could create a synthetic viewEntity with just the WhereClause
        // but for now, we'll rely on the entity-viewer's default behavior
    }

    /**
     * Handle record opened event - open in new tab
     */
    public onRecordOpened(event: RecordOpenedEvent): void {
        if (event && event.entity && event.compositeKey) {
            if (event.entity.Name) {
                this.navigationService.OpenEntityRecord(event.entity.Name, event.compositeKey);
            }
        }
    }

    /**
     * Handle data loaded event from entity-viewer
     */
    public onDataLoaded(): void {
        this.NotifyLoadComplete();
    }

    /**
     * Get display name for the resource tab
     */
    override async GetResourceDisplayName(data: ResourceData): Promise<string> {
        if (data.ResourceRecordID) {
            const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: data.ResourceRecordID }]);
            const name = await this.metadata.GetEntityRecordName('User Views', compositeKey);
            return name ? name : `View: ${data.ResourceRecordID}`;
        }
        else if (data.Configuration?.Entity) {
            const entityName = data.Configuration.Entity as string;
            const hasFilter = data.Configuration.ExtraFilter;
            return `${entityName} [Dynamic${hasFilter ? ' - Filtered' : ' - All'}]`;
        }
        return 'User Views [Error]';
    }

    /**
     * Get icon class for the resource tab
     */
    override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-table-list';
    }
}
