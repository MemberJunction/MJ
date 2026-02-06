import { Component } from '@angular/core';
import { TaskDependencyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Task Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-taskdependency-form',
    templateUrl: './taskdependency.form.component.html'
})
export class TaskDependencyFormComponent extends BaseFormComponent {
    public record!: TaskDependencyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taskReference', sectionName: 'Task Reference', isExpanded: true },
            { sectionKey: 'dependencyLink', sectionName: 'Dependency Link', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadTaskDependencyFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
