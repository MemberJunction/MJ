import { Component } from '@angular/core';
import { ProjectEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Projects') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-project-form',
    templateUrl: './project.form.component.html'
})
export class ProjectFormComponent extends BaseFormComponent {
    public record!: ProjectEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'systemStatus', sectionName: 'System & Status', isExpanded: true },
            { sectionKey: 'projectHierarchy', sectionName: 'Project Hierarchy', isExpanded: true },
            { sectionKey: 'projectOverview', sectionName: 'Project Overview', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJProjects', sectionName: 'MJ: Projects', isExpanded: false },
            { sectionKey: 'conversations', sectionName: 'Conversations', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'MJ: Tasks', isExpanded: false }
        ]);
    }
}

