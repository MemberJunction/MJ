import { Component } from '@angular/core';
import { TaskTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Task Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-tasktype-form',
    templateUrl: './tasktype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TaskTypeFormComponent extends BaseFormComponent {
    public record!: TaskTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        mJTasks: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadTaskTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
