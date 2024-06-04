import { Component } from '@angular/core';
import { WorkflowEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadWorkflowDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Workflows') // Tell MemberJunction about this class
@Component({
    selector: 'gen-workflow-form',
    templateUrl: './workflow.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WorkflowFormComponent extends BaseFormComponent {
    public record!: WorkflowEntity;
} 

export function LoadWorkflowFormComponent() {
    LoadWorkflowDetailsComponent();
}
