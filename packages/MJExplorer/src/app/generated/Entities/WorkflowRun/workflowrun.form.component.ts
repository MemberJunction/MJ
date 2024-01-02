import { Component } from '@angular/core';
import { WorkflowRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadWorkflowRunDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Workflow Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-workflowrun-form',
    templateUrl: './workflowrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WorkflowRunFormComponent extends BaseFormComponent {
    public record: WorkflowRunEntity | null = null;
} 

export function LoadWorkflowRunFormComponent() {
    LoadWorkflowRunDetailsComponent();
}
