import { Component } from '@angular/core';
import { MJResourceTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Resource Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjresourcetypes-form',
    templateUrl: './mjresourcetypes.form.component.html'
})
export class MJResourceTypesFormComponent extends BaseFormComponent {
    public record!: MJResourceTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalDetails', sectionName: 'Technical Details', isExpanded: true },
            { sectionKey: 'resourceTypeDefinition', sectionName: 'Resource Type Definition', isExpanded: true },
            { sectionKey: 'entityAssociations', sectionName: 'Entity Associations', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'workspaceItems', sectionName: 'Workspace Items', isExpanded: false },
            { sectionKey: 'userNotifications', sectionName: 'User Notifications', isExpanded: false },
            { sectionKey: 'resourceLinks', sectionName: 'Resource Links', isExpanded: false },
            { sectionKey: 'resourcePermissions', sectionName: 'Resource Permissions', isExpanded: false }
        ]);
    }
}

