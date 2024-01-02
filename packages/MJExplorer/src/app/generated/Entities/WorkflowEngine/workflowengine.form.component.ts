import { Component } from '@angular/core';
import { WorkflowEngineEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadWorkflowEngineDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Workflow Engines') // Tell MemberJunction about this class
@Component({
    selector: 'gen-workflowengine-form',
    templateUrl: './workflowengine.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WorkflowEngineFormComponent extends BaseFormComponent {
    public record: WorkflowEngineEntity | null = null;
} 

export function LoadWorkflowEngineFormComponent() {
    LoadWorkflowEngineDetailsComponent();
}
