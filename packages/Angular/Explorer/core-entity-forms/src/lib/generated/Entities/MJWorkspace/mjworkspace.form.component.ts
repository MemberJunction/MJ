import { Component } from '@angular/core';
import { MJWorkspaceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Workspaces') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkspace-form',
    templateUrl: './mjworkspace.form.component.html'
})
export class MJWorkspaceFormComponent extends BaseFormComponent {
    public record!: MJWorkspaceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'workspaceIdentification', sectionName: 'Workspace Identification', isExpanded: true },
            { sectionKey: 'workspaceDetails', sectionName: 'Workspace Details', isExpanded: true },
            { sectionKey: 'administrativeInfo', sectionName: 'Administrative Info', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'workspaceItems', sectionName: 'Workspace Items', isExpanded: false }
        ]);
    }
}

