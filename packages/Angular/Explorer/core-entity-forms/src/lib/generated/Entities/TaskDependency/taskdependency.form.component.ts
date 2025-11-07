import { Component } from '@angular/core';
import { TaskDependencyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Task Dependencies') // Tell MemberJunction about this class
@Component({
    selector: 'gen-taskdependency-form',
    templateUrl: './taskdependency.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TaskDependencyFormComponent extends BaseFormComponent {
    public record!: TaskDependencyEntity;

    // Collapsible section state
    public sectionsExpanded = {
        taskReference: true,
        dependencyLink: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadTaskDependencyFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
