import { Component } from '@angular/core';
import { WorkflowEngineEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Workflow Engines') // Tell MemberJunction about this class
@Component({
    selector: 'gen-workflowengine-form',
    templateUrl: './workflowengine.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WorkflowEngineFormComponent extends BaseFormComponent {
    public record!: WorkflowEngineEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        workflows: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadWorkflowEngineFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
