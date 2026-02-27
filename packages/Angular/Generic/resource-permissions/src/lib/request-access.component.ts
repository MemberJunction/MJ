import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { LogError, Metadata } from '@memberjunction/core';
import { ResourcePermissionEngine, MJResourcePermissionEntity, MJResourceTypeEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/**
 * Use this component to display to the user the ability to request access to a resource they do not own and do not currently have permission to access
 */
@Component({
  standalone: false,
  selector: 'mj-request-resource-access',
  templateUrl: './request-access.component.html',
  styleUrls: ['./request-access.component.css']
})
export class RequestResourceAccessComponent  extends BaseAngularComponent implements OnInit {
    /**
     * The name of the resource type that the user is requesting access to
     */
    @Input() ResourceType!: string;

    /**
     * Optional, the name of the resource that the user is requesting access to that will be displayed to the user
     */
    @Input() ResourceName: string="";
    /**
     * The resource record ID that the user is requesting access to
     */
    @Input() ResourceRecordID!: string;

    /** 
     * The default value for the permission level
     */
    @Input() PermissionLevel: 'View' | 'Edit' | 'Owner' = 'View';

    /**
     * Turn this off to not show the user the permission level drop down which would result in the default value for the PermissionLevel being requested.
     */
    @Input() ShowPermissionLevelDropdown: boolean = true;

    @Output() AccessRequested = new EventEmitter<MJResourcePermissionEntity>();

    /**
     * The resource type object that the user is requesting access to for all info on the resource type
     */
    public ResourceTypeObject!: MJResourceTypeEntity;
    public AfterRequest: boolean = false;

    async ngOnInit() {
        const rt = ResourcePermissionEngine.Instance.ResourceTypes.find(x => x.Name.trim().toLowerCase() === this.ResourceType.trim().toLowerCase());        
        if (rt) 
            this.ResourceTypeObject = rt;
        else
            throw new Error(`Resource Type ${this.ResourceType} not found`);
    }

    public async requestAccess() {
        const p = this.ProviderToUse;
        const permission = await p.GetEntityObject<MJResourcePermissionEntity>("MJ: Resource Permissions", p.CurrentUser);
        permission.ResourceTypeID = this.ResourceTypeObject.ID;
        permission.ResourceRecordID = this.ResourceRecordID;
        permission.Status = 'Requested';
        permission.Type = 'User';
        permission.UserID = p.CurrentUser.ID; 
        permission.PermissionLevel = this.PermissionLevel;
        if (await permission.Save()) {
            // worked, fire the event. 
            // NOTE - the notification creatd to notify the resource owner happens in the MJResourcePermissionEntity sub-class not here in the UI
            this.AccessRequested.emit(permission);
            this.AfterRequest = true;
        }
        else {
            //failed
            LogError(`Failed to request access to ${this.ResourceType} record ${this.ResourceRecordID}`, undefined, permission.LatestResult);
            MJNotificationService.Instance.CreateSimpleNotification(`Failed to request access to ${this.ResourceType} record ${this.ResourceName} (${this.ResourceRecordID})`, 'error', 5000);
        }
    }
}