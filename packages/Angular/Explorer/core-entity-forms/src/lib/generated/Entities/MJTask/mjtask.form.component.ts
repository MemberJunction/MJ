import { Component } from '@angular/core';
import { MJTaskEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tasks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtask-form',
    templateUrl: './mjtask.form.component.html'
})
export class MJTaskFormComponent extends BaseFormComponent {
    public record!: MJTaskEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationshipsOwnership', sectionName: 'Relationships & Ownership', isExpanded: true },
            { sectionKey: 'taskDetails', sectionName: 'Task Details', isExpanded: true },
            { sectionKey: 'timelineMilestones', sectionName: 'Timeline & Milestones', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTaskDependenciesDependsOnTaskID', sectionName: 'Task Dependencies (Depends On Task ID)', isExpanded: false },
            { sectionKey: 'mJTaskDependenciesTaskID', sectionName: 'Task Dependencies (Task ID)', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'Tasks', isExpanded: false }
        ]);
    }
}

