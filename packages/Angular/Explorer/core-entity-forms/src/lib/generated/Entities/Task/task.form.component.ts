import { Component } from '@angular/core';
import { TaskEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tasks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-task-form',
    templateUrl: './task.form.component.html'
})
export class TaskFormComponent extends BaseFormComponent {
    public record!: TaskEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationshipsOwnership', sectionName: 'Relationships & Ownership', isExpanded: true },
            { sectionKey: 'taskDetails', sectionName: 'Task Details', isExpanded: true },
            { sectionKey: 'timelineMilestones', sectionName: 'Timeline & Milestones', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTaskDependencies', sectionName: 'MJ: Task Dependencies', isExpanded: false },
            { sectionKey: 'mJTaskDependencies1', sectionName: 'MJ: Task Dependencies', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'MJ: Tasks', isExpanded: false }
        ]);
    }
}

export function LoadTaskFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
