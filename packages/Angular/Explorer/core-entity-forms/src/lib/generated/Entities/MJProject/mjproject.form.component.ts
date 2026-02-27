import { Component } from '@angular/core';
import { MJProjectEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Projects') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjproject-form',
    templateUrl: './mjproject.form.component.html'
})
export class MJProjectFormComponent extends BaseFormComponent {
    public record!: MJProjectEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'systemStatus', sectionName: 'System & Status', isExpanded: true },
            { sectionKey: 'projectHierarchy', sectionName: 'Project Hierarchy', isExpanded: true },
            { sectionKey: 'projectOverview', sectionName: 'Project Overview', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJProjects', sectionName: 'Projects', isExpanded: false },
            { sectionKey: 'mJConversations', sectionName: 'Conversations', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'Tasks', isExpanded: false }
        ]);
    }
}

