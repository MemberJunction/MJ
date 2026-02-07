import { Component } from '@angular/core';
import { WorkspaceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Workspaces') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-workspace-form',
    templateUrl: './workspace.form.component.html'
})
export class WorkspaceFormComponent extends BaseFormComponent {
    public record!: WorkspaceEntity;

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

export function LoadWorkspaceFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
