import { AfterViewInit, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ResourcePermissionEngine, ResourcePermissionEntity } from '@memberjunction/core-entities';
import { ResourceData, SharedService } from '@memberjunction/ng-shared';
import { GridSelectionItem, SelectionEvent } from '@progress/kendo-angular-grid';
import { GridComponent } from '@progress/kendo-angular-grid';

/**
 * This component displays a list of available resources for a user for a specific Resource Type.
 */
@Component({
  selector: 'mj-available-resources',
  templateUrl: './available-resources.component.html',
  styleUrls: ['./available-resources.component.css']
})
export class AvailableResourcesComponent implements AfterViewInit {
    @Input() User!: UserInfo;
    @Input() ResourceTypeID!: string;
    @Input() ResourceExtraFilter?: string;
    @Input() SelectionMode: 'Single' | 'Multiple' = 'Single';
    @Input() SelectedResources: ResourceData[] = [];
    @Output() SelectionChanged = new EventEmitter<ResourceData[]>();

    public gridRecordSelection: string[] = [];

    @ViewChild('resourcesGrid') resourcesGrid!: GridComponent;
    public onSelectionChange(e: SelectionEvent) {
        this.SelectedResources.splice(0, this.SelectedResources.length); // empty the array

        this.gridRecordSelection.forEach((item) => {
            const resourceMatch = this.resources.find((r) => r.ResourceRecordID === item);
            if (resourceMatch) {
                this.SelectedResources.push(resourceMatch);
            }
        });

        // now bubble up the event
        this.SelectionChanged.emit(this.SelectedResources);
    }

    public resourcePermissions: ResourcePermissionEntity[] = [];
    public resources: ResourceData[] = [];
    async ngAfterViewInit() {
        if (!this.User) {
            throw new Error('User is a required property for the AvailableResourcesDialogComponent');
        }

        // load up the current permissions for the specified ResourceTypeID and user
        await ResourcePermissionEngine.Instance.Config();
        // now we can get the permissions for the specified resource
        this.resourcePermissions = ResourcePermissionEngine.Instance.GetUserAvailableResources(this.User, this.ResourceTypeID);
        const rt = SharedService.Instance.ResourceTypeByID(this.ResourceTypeID);
        if (!rt || !rt.EntityID)
            throw new Error(`Resource Type ${this.ResourceTypeID} not found`);

        const md = new Metadata();
        const entity = md.EntityByID(rt.EntityID);
        if (!entity || !entity.NameField)
            throw new Error(`Entity ${rt.EntityID} not found, or no Name field defined`);
        const rv = new RunView();
        const nameField = entity.NameField;
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
                ResourceType: rt.Name
            });
        });
    }
}
