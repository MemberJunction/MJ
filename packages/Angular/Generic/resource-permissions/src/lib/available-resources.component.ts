import { AfterViewInit, Component, EventEmitter, Input, Output } from '@angular/core';
import { EntityFieldInfo, RunView, UserInfo } from '@memberjunction/core';
import { ResourcePermissionEngine, MJResourcePermissionEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { ResourceData } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
  ColDef,
  GridReadyEvent,
  GridApi,
  GetRowIdParams,
  ModuleRegistry,
  AllCommunityModule,
  RowSelectionOptions,
  SelectionChangedEvent,
  themeAlpine,
  colorSchemeVariable,
  type Theme
} from 'ag-grid-community';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * This component displays a list of available resources for a user for a specific Resource Type.
 */
@Component({
  standalone: false,
  selector: 'mj-available-resources',
  templateUrl: './available-resources.component.html',
  styleUrls: ['./available-resources.component.css']
})
export class AvailableResourcesComponent  extends BaseAngularComponent implements AfterViewInit {
    @Input() User!: UserInfo;
    @Input() ResourceTypeID!: string;
    @Input() ResourceExtraFilter?: string;
    @Input() SelectionMode: 'Single' | 'Multiple' = 'Single';

    /**
     * Optional, comma-delimited list of field names to provide extra columns here to display in the grid. These columns will be displayed after the Name of the resource
     */
    @Input() ExtraColumns: string = "";

    @Input() SelectedResources: ResourceData[] = [];
    @Output() SelectionChanged = new EventEmitter<ResourceData[]>();

    public gridExtraColumns: EntityFieldInfo[] = [];

    // AG Grid configuration
    public ColumnDefs: ColDef[] = [];
    public DefaultColDef: ColDef = {
        sortable: true,
        resizable: true,
        filter: false
    };
    public RowSelectionConfig: RowSelectionOptions = {
        mode: 'singleRow',
        checkboxes: false,
        enableClickSelection: true
    };
    public GridTheme: Theme = themeAlpine.withPart(colorSchemeVariable);
    private gridApi: GridApi | null = null;

    public getRowId = (params: GetRowIdParams<ResourceData>): string => {
        return params.data.ResourceRecordID;
    };

    public onGridReady(event: GridReadyEvent): void {
        this.gridApi = event.api;
        this.applyPreselection();
    }

    public onSelectionChange(event: SelectionChangedEvent): void {
        const selectedRows = event.api.getSelectedRows() as ResourceData[];
        this.SelectedResources.splice(0, this.SelectedResources.length); // empty the array
        selectedRows.forEach((item) => {
            this.SelectedResources.push(item);
        });

        // now bubble up the event
        this.SelectionChanged.emit(this.SelectedResources);
    }

    public resourcePermissions: MJResourcePermissionEntity[] = [];
    public resources: ResourceData[] = [];
    async ngAfterViewInit() {
        await this.Refresh();
    }

    /**
     * This method will refresh the contents of the component based on the current state of the component.
     */
    public async Refresh() {
        if (!this.User) {
            throw new Error('User is a required property for the AvailableResourcesDialogComponent');
        }

        // now we can get the permissions for the specified resource
        this.resourcePermissions = ResourcePermissionEngine.Instance.GetUserAvailableResources(this.User, this.ResourceTypeID);
        if (this.resourcePermissions.length === 0) {
            this.resources = [];
        }
        else {
            const rt = ResourcePermissionEngine.Instance.ResourceTypes.find(rt => UUIDsEqual(rt.ID, this.ResourceTypeID));
            if (!rt || !rt.EntityID)
                throw new Error(`Resource Type ${this.ResourceTypeID} not found`);

            const p = this.ProviderToUse;
            const entity = p.Entities.find(e => UUIDsEqual(e.ID, rt.EntityID));
            if (!entity || !entity.NameField)
                throw new Error(`Entity ${rt.EntityID} not found, or no Name field defined`);
            const rv = new RunView(this.RunViewToUse);
            const nameField = entity.NameField;
            if (this.ExtraColumns && this.ExtraColumns.length > 0) {
                /// split the comma delim string and for each item find it in the EntityFields collection
                const extraColumns = this.ExtraColumns.split(',');
                this.gridExtraColumns = [];
                extraColumns.forEach((ec) => {
                    const field = entity.Fields.find((f) => f.Name.trim().toLowerCase() === ec.trim().toLowerCase());
                    if (field)
                        this.gridExtraColumns.push(field);
                });
            }

            // Build column definitions after we know the extra columns
            this.buildColumnDefs();

            const extraFilter = this.ResourceExtraFilter ? ` AND (${this.ResourceExtraFilter})` : '';
            const result = await rv.RunView({
                EntityName: entity.Name,
                ExtraFilter: `(ID in (${this.resourcePermissions.map((r) => `'${r.ResourceRecordID}'`).join(',')})${extraFilter})`,
                OrderBy: nameField.Name
            })
            if (!result || !result.Success)
                throw new Error(`Error running view for entity ${entity.Name}`);

            // only return rows where we have a record in result.Results
            this.resources = result.Results.map((r) => {
                return new ResourceData({
                    ResourceRecordID: r.ID,
                    Name: r[nameField.Name],
                    ResourceTypeID: this.ResourceTypeID,
                    ResourceType: rt.Name,
                    Configuration: r // pass the whole resource record into configuration so it is accessible as desired
                });
            });

            // Update selection mode based on input
            this.RowSelectionConfig = {
                mode: this.SelectionMode.toLowerCase() === 'single' ? 'singleRow' : 'multiRow',
                checkboxes: false,
                enableClickSelection: true
            };

            // Re-apply preselection after data loads
            this.applyPreselection();
        }
    }

    private buildColumnDefs(): void {
        const cols: ColDef[] = [
            { field: 'Name', headerName: 'Name', width: 225 }
        ];

        for (const col of this.gridExtraColumns) {
            cols.push({
                headerName: col.DisplayNameOrName,
                valueGetter: (params) => {
                    return params.data?.Configuration?.[col.Name] ?? '';
                }
            });
        }

        this.ColumnDefs = cols;
    }

    private applyPreselection(): void {
        if (!this.gridApi || this.SelectedResources.length === 0) return;
        this.gridApi.forEachNode((node) => {
            const isSelected = this.SelectedResources.some(
                (r) => UUIDsEqual(r.ResourceRecordID, node.data?.ResourceRecordID)
            );
            if (isSelected) {
                node.setSelected(true);
            }
        });
    }
}
