import { Component, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, MJUserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities';
import { RegisterClass, MJGlobal, MJEventType , UUIDsEqual } from '@memberjunction/global';
import { CompositeKey, Metadata, EntityInfo, RunView } from '@memberjunction/core';
import { RecordOpenedEvent, ViewGridState, EntityViewerComponent } from '@memberjunction/ng-entity-viewer';
import { ExcelExportComponent } from '@progress/kendo-angular-excel-export';
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
            border: 1px solid #d4d4d4;
            border-radius: 6px;
            background: white;
            color: #333;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
        }
        .action-button:hover:not(:disabled) {
            background: #f5f5f5;
            border-color: #b4b4b4;
        }
        .action-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .action-button i {
            font-size: 0.875rem;
        }
        .create-button {
            background: #1976d2;
            color: white;
            border-color: #1976d2;
        }
        .create-button:hover:not(:disabled) {
            background: #1565c0;
            border-color: #1565c0;
        }
        .export-button:hover:not(:disabled) {
            color: #1976d2;
            border-color: #1976d2;
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
        kendo-excelexport {
            display: none;
        }
    `]
})
export class UserViewResource extends BaseResourceComponent {
    @ViewChild('container', { static: true }) containerElement!: ElementRef<HTMLDivElement>;
    @ViewChild('entityViewer') entityViewerRef?: EntityViewerComponent;
    @ViewChild('excelExport') excelExportRef?: ExcelExportComponent;

    public isLoading: boolean = false;
    public errorMessage: string | null = null;
    public entityInfo: EntityInfo | null = null;
    public viewEntity: MJUserViewEntityExtended | null = null;
    public gridState: ViewGridState | null = null;

    // Export state
    public isExporting: boolean = false;
    public exportData: any[] = [];
    public exportColumns: { Name: string; DisplayName: string }[] = [];
    public exportFileName: string = 'export.xlsx';

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

        this.viewEntity = view as MJUserViewEntityExtended;

        // Check permissions
        if (!this.viewEntity.UserCanView) {
            throw new Error('You do not have permission to view this view');
        }

        // Load the entity info
        const entity = this.metadata.Entities.find(e => UUIDsEqual(e.ID, this.viewEntity!.EntityID))

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
        if (!this.excelExportRef || !this.entityInfo) {
            console.error('Cannot export: Excel export component or entity not available');
            return;
        }

        this.isExporting = true;
        this.cdr.detectChanges();

        try {
            this.showNotification('Working on the export, will notify you when it is complete...', 'info', 2000);

            const data = await this.getExportData();

            // Determine which columns to export based on grid state or view entity
            if (this.gridState?.columnSettings && this.gridState.columnSettings.length > 0) {
                // Use grid state - only export visible columns in grid order
                const visibleColumns = this.gridState.columnSettings.filter(col => col.hidden !== true);
                this.exportColumns = visibleColumns.map(col => ({
                    Name: col.Name,
                    DisplayName: col.DisplayName || col.Name
                }));
            } else if (this.viewEntity?.Columns) {
                // Use view's column configuration - only export visible columns in view order
                const visibleColumns = this.viewEntity.Columns.filter(col => !col.hidden);
                this.exportColumns = visibleColumns.map(col => ({
                    Name: col.Name,
                    DisplayName: col.DisplayName || col.Name
                }));
            } else {
                // Fall back to all non-virtual fields
                const visibleFields = this.entityInfo.Fields.filter(f => !f.IsVirtual);
                this.exportColumns = visibleFields.map(f => ({
                    Name: f.Name,
                    DisplayName: f.DisplayNameOrName
                }));
            }

            this.exportData = data;

            // Set the export filename
            const viewName = this.viewEntity?.Name || 'Data';
            this.exportFileName = `${this.entityInfo.Name}_${viewName}_${new Date().toISOString().split('T')[0]}.xlsx`;

            // Wait for Angular to update the DOM with the new data before triggering save
            setTimeout(() => {
                this.excelExportRef!.save();
                this.showNotification('Excel Export Complete', 'success', 2000);
                this.isExporting = false;
                this.cdr.detectChanges();
            }, 100);
        }
        catch (e) {
            this.showNotification('Error exporting data', 'error', 5000);
            console.error('Export error:', e);
            this.isExporting = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Get the data for export - loads all records for the current view/entity
     */
    private async getExportData(): Promise<any[]> {
        if (!this.entityInfo) {
            throw new Error('No entity selected for export');
        }

        const rv = new RunView();

        // Build the filter for the export - combine view's WhereClause with any smart filter
        let filter = '';
        if (this.viewEntity?.WhereClause) {
            filter = this.viewEntity.WhereClause;
        }

        const result = await rv.RunView({
            EntityName: this.entityInfo.Name,
            ExtraFilter: filter,
            OrderBy: '', // Let view handle sorting
            ResultType: 'simple' // Get plain objects for export
        });

        if (!result.Success) {
            throw new Error(result.ErrorMessage || 'Failed to load data for export');
        }

        return result.Results || [];
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
