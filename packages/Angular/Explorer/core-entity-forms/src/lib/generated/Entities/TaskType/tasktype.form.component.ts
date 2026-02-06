import { Component } from '@angular/core';
import { TaskTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Task Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-tasktype-form',
    templateUrl: './tasktype.form.component.html'
})
export class TaskTypeFormComponent extends BaseFormComponent {
    public record!: TaskTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taskTypeDetails', sectionName: 'Task Type Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'MJ: Tasks', isExpanded: false }
        ]);
    }
}

export function LoadTaskTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
