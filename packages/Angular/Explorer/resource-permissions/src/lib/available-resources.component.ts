import { AfterViewInit, Component, EventEmitter, Input, Output } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { ResourcePermissionEngine, ResourcePermissionEntity } from '@memberjunction/core-entities';
import { ResourceData } from '@memberjunction/ng-shared';
import { SelectionEvent } from '@progress/kendo-angular-grid';

/**
 * This component displays a list of available resources for a user for a specific Resource Type.
 */
@Component({
  selector: 'mj-available-resources',
  templateUrl: './available-resources.component.html',
  styleUrls: ['./available-resources.component.css']
})
export class AvailableResourcesComponent implements AfterViewInit {
    @Input() user!: UserInfo;
    @Input() ResourceTypeID!: string;
    @Input() SelectionMode: 'Single' | 'Multiple' = 'Single';
    @Input() SelectedResources: ResourceData[] = [];

    @Output() SelectionChanged = new EventEmitter<ResourceData[]>();

    public onSelectionChange(e: SelectionEvent) {
        const selectedResources = e.selectedRows?.map((row) => row.dataItem as ResourceData) ?? [];
        // now bubble up the event
        this.SelectionChanged.emit(selectedResources);
    }

    public resourcePermissions: ResourcePermissionEntity[] = [];
    public resources: ResourceData[] = [];
    async ngAfterViewInit() {
        // load up the current permissions for the specified ResourceTypeID and user
        await ResourcePermissionEngine.Instance.Config();
        // now we can get the permissions for the specified resource
        this.resourcePermissions = ResourcePermissionEngine.Instance.GetUserAvailableResources(this.user, this.ResourceTypeID);
        this.resources = this.resourcePermissions.map((r) => {
            return new ResourceData({
                ResourceID: r.ResourceRecordID,
                ResourceName: 'fill in here',
                ResourceTypeID: r.ResourceTypeID,
                ResourceType: r.ResourceType
            });
        });
    }
}
