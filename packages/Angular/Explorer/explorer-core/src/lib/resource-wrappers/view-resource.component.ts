import { Component, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, MJUserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities';
import { RegisterClass, MJGlobal, MJEventType , UUIDsEqual } from '@memberjunction/global';
import { CompositeKey, Metadata, EntityInfo, RunView } from '@memberjunction/core';
import { RecordOpenedEvent, ViewGridState, EntityViewerComponent, ViewRelatedRecordNavigation } from '@memberjunction/ng-entity-viewer';
import { ExportService } from '@memberjunction/ng-export-service';
import { ExportColumn } from '@memberjunction/export-engine';
import { GraphQLDataProvider, GraphQLListsClient } from '@memberjunction/graphql-dataprovider';
import type { SaveViewAsListResult } from '@memberjunction/ng-list-management';
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
    templateUrl: './view-resource.component.html',
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
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
        }
        .header-left {
            flex: 1;
            min-width: 0;
        }
        .header-right {
            display: flex;
            gap: 8px;
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
        .action-button {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            background: var(--mj-bg-surface-card);
            color: var(--mj-text-primary);
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
        }
        .action-button:hover:not(:disabled) {
            background: var(--mj-bg-surface-sunken);
            border-color: var(--mj-border-default);
        }
        .action-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .action-button i {
            font-size: 0.875rem;
        }
        .create-button {
            background: var(--mj-brand-primary);
            color: white;
            border-color: var(--mj-brand-primary);
        }
        .create-button:hover:not(:disabled) {
            background: var(--mj-brand-primary-hover);
            border-color: var(--mj-brand-primary-hover);
        }
        .export-button:hover:not(:disabled) {
            color: var(--mj-brand-primary);
            border-color: var(--mj-brand-primary);
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
    @ViewChild('entityViewer') entityViewerRef?: EntityViewerComponent;

    public isLoading: boolean = false;
    public errorMessage: string | null = null;
    public entityInfo: EntityInfo | null = null;
    public viewEntity: MJUserViewEntityExtended | null = null;
    public gridState: ViewGridState | null = null;

    // Export state
    public isExporting: boolean = false;

    // Save-as-list dialog state
    public saveAsListDialogVisible = false;
    public saveAsListRecordCount: number | null = null;
    public isSavingAsList = false;

    private dataLoaded = false;
    private get metadata() { return this.ProviderToUse; }
    constructor(
        private cdr: ChangeDetectorRef,
        private exportService: ExportService
    ) {
        super();
    }

    override set Data(value: ResourceData) {
        const previousRecordId = super.Data?.ResourceRecordID;
        const previousEntity = super.Data?.Configuration?.Entity;
        super.Data = value;

        const newRecordId = value?.ResourceRecordID;
        const newEntity = value?.Configuration?.Entity;

        // View-type (grid/cards/timeline/map) and per-view-type config are now resolved
        // internally by mj-entity-viewer from the saved view's ViewTypeID — nothing to read here.

        // Load on first set, or when the view/entity has changed
        if (!this.dataLoaded || newRecordId !== previousRecordId || newEntity !== previousEntity) {
            this.dataLoaded = true;
            // Reset state before loading new view
            this.entityInfo = null;
            this.viewEntity = null;
            this.gridState = null;
            this.errorMessage = null;
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

        this.viewEntity = view as MJUserViewEntityExtended;

        // Check permissions
        if (!this.viewEntity.UserCanView) {
            throw new Error('You do not have permission to view this view');
        }

        // Load the entity info
        const entity = this.metadata.Entities.find(e => UUIDsEqual(e.ID, this.viewEntity!.EntityID));

        if (!entity) {
            throw new Error(`Entity for view not found`);
        }

        this.entityInfo = entity;

        // Parse grid state if available
        if (this.viewEntity.GridState) {
            try {
                this.gridState = JSON.parse(this.viewEntity.GridState) as ViewGridState;
            } catch (e) {
                console.warn('Failed to parse GridState:', e);
                this.gridState = null;
            }
        }

        // View-type + per-view-type config persistence is fully owned by mj-entity-viewer
        // (it reads ViewTypeID + DisplayState.viewTypeConfigs off the [viewEntity] and, with
        // [AutoSaveView]="true", saves changes back) — nothing to wire here.
    }

    /**
     * Load a dynamic view (no saved view, just entity + filter)
     */
    private async loadDynamicView(entityName: string, _extraFilter?: string): Promise<void> {
        const entity = this.metadata.Entities.find(
            e => e.Name.trim().toLowerCase() === entityName.trim().toLowerCase()
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
            this.navigationService.OpenEntityRecord(event.entity.Name, event.compositeKey);
        }
    }

    /**
     * Handle a related-record navigation requested from within a view-type renderer
     * (e.g. a foreign-key cell) - open the target record in a new tab.
     */
    public onOpenRelatedRecord(nav: ViewRelatedRecordNavigation): void {
        if (nav?.entityName && nav.recordKey != null) {
            this.navigationService.OpenEntityRecord(nav.entityName, CompositeKey.FromID(String(nav.recordKey)));
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
            const name = await this.metadata.GetEntityRecordName('MJ: User Views', compositeKey);
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

    /**
     * Handle creating a new record for the current entity
     */
    public onCreateNewRecord(): void {
        if (!this.entityInfo) return;

        // Use NavigationService to open a new record form
        this.navigationService.OpenNewEntityRecord(this.entityInfo.Name);
    }

    /**
     * Handle export to Excel request
     */
    public async onExport(): Promise<void> {
        if (!this.entityInfo) {
            console.error('Cannot export: entity not available');
            return;
        }

        this.isExporting = true;
        this.cdr.detectChanges();

        try {
            this.showNotification('Working on the export, will notify you when it is complete...', 'info', 2000);

            const rows = await this.loadExportRows();
            const columns = this.buildExportColumns();
            const fileName = this.buildExportFileName();

            const result = await this.exportService.toExcel(rows, {
                fileName,
                columns,
                includeHeaders: true
            });

            if (result.success) {
                this.exportService.downloadResult(result);
                this.showNotification('Excel Export Complete', 'success', 2000);
            } else {
                this.showNotification('Export failed', 'error', 5000);
            }
        }
        catch (e) {
            this.showNotification('Error exporting data', 'error', 5000);
            console.error('Export error:', e);
        }
        finally {
            this.isExporting = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Open the Save-as-List dialog. Only meaningful for saved views (a
     * ViewID is required to materialize). Dynamic views fall back to a
     * user-visible notification rather than silently doing nothing.
     */
    public onSaveAsList(): void {
        if (!this.viewEntity?.ID) {
            this.showNotification('Save as List requires a saved View. Save this view first.', 'info', 4000);
            return;
        }
        // Best-effort record-count hint — the entity-viewer exposes the
        // grid's row count on its gridState; we surface it so the dialog's
        // confirm button can say "Save List (476 records)".
        this.saveAsListRecordCount = this.entityViewerRef?.TotalRecordCount ?? null;
        this.saveAsListDialogVisible = true;
        this.cdr.detectChanges();
    }

    public onSaveAsListCancelled(): void {
        this.saveAsListDialogVisible = false;
        this.cdr.detectChanges();
    }

    public async onSaveAsListSubmit(payload: SaveViewAsListResult): Promise<void> {
        const viewId = this.viewEntity?.ID;
        if (!viewId) return;
        this.isSavingAsList = true;
        this.cdr.detectChanges();
        try {
            const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
            const client = new GraphQLListsClient(provider);
            const result = await client.MaterializeFromView(viewId, {
                ListName: payload.ListName,
                Description: payload.Description,
                CategoryId: payload.CategoryId,
                RememberLineage: payload.RememberLineage,
                UseSnapshot: payload.UseSnapshot,
                RefreshMode: payload.RefreshMode,
            });
            if (result.Success && result.CreatedListId) {
                this.saveAsListDialogVisible = false;
                this.showNotification(
                    `List created with ${result.Counts?.Added ?? 0} record(s).`,
                    'success',
                    3000,
                );
                this.navigationService.OpenEntityRecord('MJ: Lists', new CompositeKey([{ FieldName: 'ID', Value: result.CreatedListId }]));
            } else {
                this.showNotification(`Save failed: ${result.Message}`, 'error', 5000);
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this.showNotification(`Save failed: ${message}`, 'error', 5000);
        } finally {
            this.isSavingAsList = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Load all records for the current view/entity for export
     */
    private async loadExportRows(): Promise<Record<string, unknown>[]> {
        if (!this.entityInfo) {
            throw new Error('No entity selected for export');
        }

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        let filter = '';
        if (this.viewEntity?.WhereClause) {
            filter = this.viewEntity.WhereClause;
        }

        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: this.entityInfo.Name,
            ExtraFilter: filter,
            OrderBy: '',
            ResultType: 'simple'
        });

        if (!result.Success) {
            throw new Error(result.ErrorMessage || 'Failed to load data for export');
        }

        return result.Results || [];
    }

    /**
     * Determine which columns to export based on grid state, view entity, or entity fields
     */
    private buildExportColumns(): ExportColumn[] {
        if (!this.entityInfo) return [];

        if (this.gridState?.columnSettings && this.gridState.columnSettings.length > 0) {
            const visibleColumns = this.gridState.columnSettings.filter(col => col.hidden !== true);
            return visibleColumns.map(col => ({
                name: col.Name,
                displayName: col.DisplayName || col.Name
            }));
        }

        if (this.viewEntity?.Columns) {
            const visibleColumns = this.viewEntity.Columns.filter(col => !col.hidden);
            return visibleColumns.map(col => ({
                name: col.Name,
                displayName: col.DisplayName || col.Name
            }));
        }

        const visibleFields = this.entityInfo.Fields.filter(f => !f.IsVirtual);
        return visibleFields.map(f => ({
            name: f.Name,
            displayName: f.DisplayNameOrName
        }));
    }

    /**
     * Build the export file name based on entity and view
     */
    private buildExportFileName(): string {
        const viewName = this.viewEntity?.Name || 'Data';
        return `${this.entityInfo!.Name}_${viewName}_${new Date().toISOString().split('T')[0]}`;
    }

    /**
     * Show a notification to the user
     */
    private showNotification(message: string, style: 'info' | 'success' | 'error' | 'warning', duration: number): void {
        MJGlobal.Instance.RaiseEvent({
            component: this,
            event: MJEventType.DisplaySimpleNotificationRequest,
            eventCode: '',
            args: {
                message,
                style,
                DisplayDuration: duration
            }
        });
    }
}
