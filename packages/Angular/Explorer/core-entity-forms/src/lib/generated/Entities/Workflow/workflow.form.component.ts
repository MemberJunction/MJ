import { Component } from '@angular/core';
import { WorkflowEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Workflows') // Tell MemberJunction about this class
@Component({
    selector: 'gen-workflow-form',
    templateUrl: './workflow.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WorkflowFormComponent extends BaseFormComponent {
    public record!: WorkflowEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        reports: false,
        workflowRuns: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadWorkflowFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
